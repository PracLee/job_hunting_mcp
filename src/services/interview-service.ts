import { JobRepository } from '../db/repositories/job-repository.js';
import { ProfileRepository } from '../db/repositories/profile-repository.js';
import { getLlmClient } from '../core/llm-client.js';
import { resolveJobOrThrow, resolveProfileOrThrow } from './shared/resolvers.js';

export class InterviewService {
  private readonly jobRepo = new JobRepository();
  private readonly profileRepo = new ProfileRepository();

  async prepareInterview(params: {
    job_id: string;
    profile_id?: string;
    question_types: Array<'technical' | 'experience' | 'behavioral' | 'culture_fit' | 'system_design'>;
    count: number;
  }) {
    const job = resolveJobOrThrow(this.jobRepo, params.job_id, '공고를 찾을 수 없습니다.');
    const profile = resolveProfileOrThrow(this.profileRepo, params.profile_id, '프로필이 없습니다.');

    const typeLabels: Record<string, string> = {
      technical: '기술 질문 (사용 기술의 깊이, 설계 판단)',
      experience: '경험 질문 (프로젝트 상세, STAR 기법)',
      behavioral: '행동 질문 (갈등 해결, 실패 경험, 리더십)',
      culture_fit: '문화적합성 (동기, 가치관, 팀워크)',
      system_design: '시스템 설계 (아키텍처, 확장성, 트레이드오프)',
    };

    const requestedTypes = params.question_types.map(type => typeLabels[type] || type).join('\n- ');

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
기술: ${profile.skills.map(skill => skill.name).join(', ')}
프로젝트:
${profile.projects.map(project => `- ${project.name} (${project.role}): ${project.description}
  성과: ${project.achievements.join(', ')}
  기술: ${project.tech_stack.join(', ')}`).join('\n')}

[요청 질문 유형]
- ${requestedTypes}`,
      }],
      temperature: 0.6,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: response.content };
  }
}
