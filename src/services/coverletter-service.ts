import { JobRepository } from '../db/repositories/job-repository.js';
import { ProfileRepository } from '../db/repositories/profile-repository.js';
import { getLlmClient } from '../core/llm-client.js';
import { resolveJobOrThrow, resolveProfileOrThrow } from './shared/resolvers.js';

export class CoverletterService {
  private readonly jobRepo = new JobRepository();
  private readonly profileRepo = new ProfileRepository();

  async brainstorm(params: {
    job_id: string;
    profile_id?: string;
    questions: Array<{ question_text: string; max_length?: number }>;
  }) {
    const job = resolveJobOrThrow(this.jobRepo, params.job_id, '공고를 찾을 수 없습니다.');
    const profile = resolveProfileOrThrow(this.profileRepo, params.profile_id, '프로필이 없습니다.');

    const llm = getLlmClient();
    const response = await llm.generate({
      system: `너는 한국 채용 자기소개서 전문가다.
각 문항에 대해 의도 분석 + 사용자 경험에서 연결 가능한 소재를 추천해라.

한국 자기소개서 문항 유형:
- 지원동기: 회사/직무 이해 + 본인 경험 연결
- 성장과정: 가치관/태도 형성 경험
- 직무역량: 기술력/성과 증명
- 입사후포부: 구체적 기여 계획
- 협업경험: 팀워크/커뮤니케이션

반드시 아래 JSON으로만 응답해라:
{
  "brainstorms": [
    {
      "question_text": "문항",
      "intent_analysis": "이 문항이 평가하려는 것",
      "suggested_themes": [
        {
          "theme": "소재 설명",
          "source_project": "연결할 프로젝트",
          "key_points": ["강조할 포인트"]
        }
      ],
      "anti_patterns": ["피해야 할 표현/접근"],
      "structure_suggestion": "추천 구성 (예: 두괄식, STAR 기법 등)"
    }
  ]
}`,
      messages: [{
        role: 'user',
        content: `[채용공고]
회사: ${job.company_name}
포지션: ${job.job_title}
주요 업무: ${job.responsibilities.join('\n')}

[프로필]
경력: ${profile.total_experience_years}년
프로젝트:
${profile.projects.map(project => `- ${project.name}: ${project.description} / 성과: ${project.achievements.join(', ')}`).join('\n')}
도메인: ${profile.domains.join(', ')}

[문항]
${params.questions.map((question, index) => `${index + 1}. ${question.question_text}${question.max_length ? ` (${question.max_length}자)` : ''}`).join('\n')}`,
      }],
      temperature: 0.5,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: response.content };
  }

  async generateDraft(params: {
    job_id: string;
    profile_id?: string;
    question_text: string;
    selected_themes?: string[];
    max_length: number;
    tone: 'professional' | 'passionate' | 'humble';
  }) {
    const job = resolveJobOrThrow(this.jobRepo, params.job_id, '공고를 찾을 수 없습니다.');
    const profile = resolveProfileOrThrow(this.profileRepo, params.profile_id, '프로필이 없습니다.');

    const toneGuide = {
      professional: '전문적이고 차분한 톤. 성과와 역량 중심.',
      passionate: '열정적이고 적극적인 톤. 동기와 의지 강조.',
      humble: '겸손하고 성실한 톤. 배움과 성장 강조.',
    };

    const llm = getLlmClient();
    const response = await llm.generate({
      system: `너는 한국 채용 자기소개서 작성 전문가다.
규칙:
1. 허위 경험 금지. 프로필의 실제 경험만 활용.
2. 한국어 존댓말 사용. 자연스러운 한국 자기소개서 문체.
3. 구체적 경험 → 역량 → 기여 구조.
4. 정량적 성과 포함.
5. ${params.max_length}자 이내.
6. 톤: ${toneGuide[params.tone]}

반드시 아래 JSON으로만 응답해라:
{
  "draft": "자기소개서 본문",
  "char_count": 숫자,
  "jd_keywords_used": ["사용된 JD 키워드"],
  "improvement_suggestions": ["개선 제안"]
}`,
      messages: [{
        role: 'user',
        content: `[채용공고] ${job.company_name} - ${job.job_title}
주요 업무: ${job.responsibilities.join(', ')}
필수: ${job.required_skills.join(', ')}

[프로필]
경력: ${profile.total_experience_years}년
프로젝트: ${profile.projects.map(project => `${project.name}: ${project.description} (성과: ${project.achievements.join(', ')})`).join('\n')}

[문항] ${params.question_text}
${params.selected_themes ? `[선택 소재] ${params.selected_themes.join(', ')}` : ''}`,
      }],
      temperature: 0.6,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { draft: response.content };

    return {
      ...result,
      warning: '기존 경험 기반으로만 작성되었습니다.',
    };
  }
}
