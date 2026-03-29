import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { JobRepository } from '../../db/repositories/job-repository.js';
import { ProfileRepository } from '../../db/repositories/profile-repository.js';
import { getLlmClient } from '../../core/llm-client.js';

export function registerInterviewTools(server: McpServer): void {
  const jobRepo = new JobRepository();
  const profileRepo = new ProfileRepository();

  server.tool(
    'interview_prepare',
    '채용공고와 사용자 경력을 기반으로 면접 예상 질문과 답변 포인트를 생성합니다.',
    {
      job_id: z.string().describe('채용공고 ID'),
      profile_id: z.string().optional().describe('프로필 ID'),
      question_types: z.array(z.enum(['technical', 'experience', 'behavioral', 'culture_fit', 'system_design']))
        .optional().default(['technical', 'experience']),
      count: z.number().optional().default(10).describe('질문 수'),
    },
    async (params) => {
      try {
        const job = jobRepo.findById(params.job_id);
        if (!job) return { content: [{ type: 'text' as const, text: '공고를 찾을 수 없습니다.' }], isError: true };

        const profile = params.profile_id
          ? profileRepo.findById(params.profile_id)
          : profileRepo.findAll()[0];
        if (!profile) return { content: [{ type: 'text' as const, text: '프로필이 없습니다.' }], isError: true };

        const typeLabels: Record<string, string> = {
          technical: '기술 질문 (사용 기술의 깊이, 설계 판단)',
          experience: '경험 질문 (프로젝트 상세, STAR 기법)',
          behavioral: '행동 질문 (갈등 해결, 실패 경험, 리더십)',
          culture_fit: '문화적합성 (동기, 가치관, 팀워크)',
          system_design: '시스템 설계 (아키텍처, 확장성, 트레이드오프)',
        };

        const requestedTypes = params.question_types
          .map(t => typeLabels[t] || t).join('\n- ');

        const llm = getLlmClient();
        const response = await llm.generate({
          system: `너는 한국 IT 기업 기술 면접 전문가다.
채용공고와 지원자 경력을 분석하여 예상 면접 질문과 답변 포인트를 생성해라.

규칙:
1. 질문은 한국어로, 실제 면접에서 나올 법한 자연스러운 형태로.
2. 각 질문에 "왜 이 질문을 하는지" + "답변 포인트" 포함.
3. 지원자 경력에서 구체적으로 활용할 수 있는 경험을 연결.
4. 총 ${params.count}개 질문.

반드시 아래 JSON으로만 응답해라:
{
  "questions": [
    {
      "category": "technical|experience|behavioral|culture_fit|system_design",
      "question": "면접 질문",
      "why_asked": "이 질문을 하는 이유",
      "answer_points": ["답변 포인트 1", "답변 포인트 2"],
      "source_from_profile": "관련 프로젝트/경험",
      "difficulty": "easy|medium|hard"
    }
  ],
  "key_messages": ["면접 전체에서 일관되게 전달할 메시지"],
  "preparation_tips": ["준비 팁"]
}`,
          messages: [{
            role: 'user',
            content: `[채용공고]
회사: ${job.company_name}
포지션: ${job.job_title}
필수 기술: ${job.required_skills.join(', ')}
주요 업무: ${job.responsibilities.join('\n')}
자격 요건: ${job.qualifications.join('\n')}
우대: ${job.preferences.join('\n')}

[지원자 프로필]
경력: ${profile.total_experience_years}년
기술: ${profile.skills.map(s => s.name).join(', ')}
프로젝트:
${profile.projects.map(p => `- ${p.name} (${p.role}): ${p.description}
  성과: ${p.achievements.join(', ')}
  기술: ${p.tech_stack.join(', ')}`).join('\n')}

[요청 질문 유형]
- ${requestedTypes}`,
          }],
          temperature: 0.6,
        });

        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: response.content };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `면접 준비 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
