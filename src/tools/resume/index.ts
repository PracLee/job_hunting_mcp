import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { JobRepository } from '../../db/repositories/job-repository.js';
import { ProfileRepository } from '../../db/repositories/profile-repository.js';
import { getLlmClient } from '../../core/llm-client.js';

export function registerResumeTools(server: McpServer): void {
  const jobRepo = new JobRepository();
  const profileRepo = new ProfileRepository();

  server.tool(
    'resume_tailor',
    '특정 채용공고에 맞춰 경력기술서를 맞춤화합니다. 기존 경험을 공고 요구사항에 맞게 재구성합니다.',
    {
      job_id: z.string().describe('채용공고 ID'),
      profile_id: z.string().optional().describe('프로필 ID'),
      style: z.enum(['concise', 'detailed']).optional().default('detailed'),
    },
    async (params) => {
      try {
        const job = jobRepo.findById(params.job_id);
        if (!job) return { content: [{ type: 'text' as const, text: `공고를 찾을 수 없습니다.` }], isError: true };

        const profile = params.profile_id
          ? profileRepo.findById(params.profile_id)
          : profileRepo.findAll()[0];
        if (!profile) return { content: [{ type: 'text' as const, text: '프로필이 없습니다.' }], isError: true };

        const llm = getLlmClient();
        const response = await llm.generate({
          system: `너는 한국 개발자 채용 서류 전문가다.
사용자의 기존 경력/프로젝트를 채용공고에 맞게 재구성해라.

규칙:
1. 허위 경험을 만들지 마라. 기존 경험만 재구성/강조해라.
2. 한국 경력기술서 문체를 사용해라 (성과 중심, 정량적 표현, 능동적 서술).
3. 공고의 핵심 키워드를 자연스럽게 반영해라.
4. 프로젝트를 공고 관련도 순으로 재정렬해라.
5. ${params.style === 'concise' ? '간결하게 bullet point 위주로' : '상세하게 맥락과 성과를 포함하여'} 작성해라.

반드시 아래 JSON으로만 응답해라:
{
  "summary": "한 줄 프로필 요약 (공고 맞춤)",
  "tailored_projects": [
    {
      "project_name": "프로젝트명",
      "relevance_to_jd": "high|medium|low",
      "original_description": "원래 설명",
      "tailored_bullets": ["수정된 bullet 1", "수정된 bullet 2"],
      "changes_reason": "수정 이유"
    }
  ],
  "skills_reordered": ["JD 기준 정렬된 기술 1", "기술 2"],
  "overall_tips": ["추가 조언 1"]
}`,
          messages: [{
            role: 'user',
            content: `[채용공고]
회사: ${job.company_name}
포지션: ${job.job_title}
필수 기술: ${job.required_skills.join(', ')}
우대 기술: ${job.preferred_skills.join(', ')}
주요 업무: ${job.responsibilities.join('\n')}
자격 요건: ${job.qualifications.join('\n')}
우대 사항: ${job.preferences.join('\n')}

[사용자 프로필]
경력: ${profile.total_experience_years}년
기술: ${profile.skills.map(s => s.name).join(', ')}
프로젝트:
${profile.projects.map(p => `- ${p.name} (${p.role}, ${p.duration})
  ${p.description}
  성과: ${p.achievements.join(', ')}
  기술: ${p.tech_stack.join(', ')}`).join('\n')}`,
          }],
          temperature: 0.5,
        });

        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'LLM 응답 파싱 실패' };

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              job: { company: job.company_name, title: job.job_title },
              ...result,
              warning: '기존 경험만 재구성했습니다. 허위 경험은 포함되지 않았습니다.',
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `맞춤화 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'resume_export',
    '마스터 프로필을 특정 채용사이트 양식에 맞게 변환합니다. 복사해서 바로 붙여넣을 수 있는 텍스트를 생성합니다.',
    {
      profile_id: z.string().optional().describe('프로필 ID'),
      target_platform: z.enum(['wanted', 'saramin', 'jobkorea', 'jumpit', 'rocketpunch', 'general']).describe('출력 대상 플랫폼'),
      job_id: z.string().optional().describe('특정 공고에 맞춤화할 경우'),
    },
    async (params) => {
      try {
        const profile = params.profile_id
          ? profileRepo.findById(params.profile_id)
          : profileRepo.findAll()[0];
        if (!profile) return { content: [{ type: 'text' as const, text: '프로필이 없습니다.' }], isError: true };

        const job = params.job_id ? jobRepo.findById(params.job_id) : null;

        const platformGuides: Record<string, string> = {
          wanted: `원티드 양식:
- 한 줄 소개 (필수, 50자 이내)
- 경력: 회사별로 성과 중심 bullet point 서술
- 기술 스택: 태그 형태로 나열
- 자유 형식 자기소개서 (500~1000자)
- 성과를 정량적으로 표현하는 것이 효과적`,
          saramin: `사람인 양식:
- 기본 인적사항 (사진/이름/생년월일/연락처)
- 학력사항 (표 형태)
- 경력사항 (회사명/기간/직급/업무내용, 표 형태)
- 자격증/어학
- 자기소개서 문항별 분리 (지원동기/성장과정/성격의장단점/입사후포부, 각 500~1000자)`,
          jobkorea: `잡코리아 양식:
- 표 기반 이력서 (인적사항/학력/경력)
- 경력기술서 별도 (프로젝트 단위로 상세 기술)
- 자기소개서 문항별 작성
- 희망 연봉 기재`,
          jumpit: `점핏 양식:
- 기술 중심 프로필 (기술 태그 + 숙련도)
- 프로젝트 카드 형태 (프로젝트명/기간/기술/설명)
- 간단 소개 (300자)
- GitHub/포트폴리오 링크 강조`,
          rocketpunch: `로켓펀치 양식:
- 링크드인 스타일 프로필
- 요약 (200자)
- 경험 타임라인 (회사별)
- 기술 태그
- 프로젝트/성과`,
          general: `범용 이력서/경력기술서:
- 인적사항
- 경력 요약
- 프로젝트별 상세 기술
- 기술스택
- 학력/자격증`,
        };

        const llm = getLlmClient();
        const response = await llm.generate({
          system: `너는 한국 채용 서류 양식 전문가다.
사용자 프로필을 특정 채용사이트 양식에 맞게 변환해라.
복사해서 바로 붙여넣을 수 있는 완성된 텍스트를 생성해라.

${platformGuides[params.target_platform]}

반드시 아래 JSON으로만 응답해라:
{
  "platform": "${params.target_platform}",
  "formatted_sections": {
    "각 섹션명": "해당 섹션 내용"
  },
  "copy_ready_text": "전체 복붙용 텍스트",
  "platform_tips": ["이 플랫폼 활용 팁 1", "팁 2"]
}`,
          messages: [{
            role: 'user',
            content: `[프로필]
이름: ${profile.name}
경력: ${profile.total_experience_years}년
직무: ${profile.job_category}
기술: ${profile.skills.map(s => s.name).join(', ')}
프로젝트:
${profile.projects.map(p => `- ${p.name} (${p.role}, ${p.duration})
  ${p.description}
  성과: ${p.achievements.join(', ')}
  기술: ${p.tech_stack.join(', ')}`).join('\n')}
학력: ${profile.education.map(e => `${e.school} ${e.major} ${e.degree}`).join(', ')}
${job ? `\n[맞춤 대상 공고]\n회사: ${job.company_name}\n포지션: ${job.job_title}\n필수 기술: ${job.required_skills.join(', ')}` : ''}`,
          }],
          temperature: 0.5,
        });

        const jsonMatch = response.content.match(/\{[\s\S]*\}/);
        const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { copy_ready_text: response.content };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `변환 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
