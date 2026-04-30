import { JobRepository } from '../db/repositories/job-repository.js';
import { ProfileRepository } from '../db/repositories/profile-repository.js';
import { getLlmClient } from '../core/llm-client.js';
import { getTemplate } from '../core/platform-templates.js';
import type { PlatformType } from '../core/platform-templates.js';
import { resolveJobOrThrow, resolveProfileOrThrow } from './shared/resolvers.js';

export class ResumeService {
  private readonly jobRepo = new JobRepository();
  private readonly profileRepo = new ProfileRepository();

  async tailorResume(params: { job_id: string; profile_id?: string; style: 'concise' | 'detailed' }) {
    const job = resolveJobOrThrow(this.jobRepo, params.job_id, '공고를 찾을 수 없습니다.');
    const profile = resolveProfileOrThrow(this.profileRepo, params.profile_id, '프로필이 없습니다.');

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
      "tailored_bullets": ["수정된 bullet 1", "수정된 bullet 2"],
      "changes_reason": "수정 이유"
    }
  ],
  "skills_reordered": ["JD 기준 정렬된 기술"],
  "overall_tips": ["추가 조언"]
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
기술: ${profile.skills.map(skill => skill.name).join(', ')}
프로젝트:
${profile.projects.map(project => `- ${project.name} (${project.role}, ${project.duration})
  ${project.description}
  성과: ${project.achievements.join(', ')}
  기술: ${project.tech_stack.join(', ')}`).join('\n')}`,
      }],
      temperature: 0.5,
    });

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'LLM 응답 파싱 실패' };

    return {
      job: { company: job.company_name, title: job.job_title },
      ...result,
      warning: '기존 경험만 재구성했습니다. 허위 경험은 포함되지 않았습니다.',
    };
  }

  async exportResume(params: {
    profile_id?: string;
    target_platform: PlatformType;
    job_id?: string;
    enhance_with_llm?: boolean;
  }) {
    const profile = resolveProfileOrThrow(this.profileRepo, params.profile_id, '프로필이 없습니다.');
    const job = params.job_id ? this.jobRepo.findById(params.job_id) : null;

    const template = getTemplate(params.target_platform);
    const baseOutput = template.formatProfile(profile);

    if (params.enhance_with_llm) {
      try {
        const llm = getLlmClient();
        const response = await llm.generate({
          system: `너는 한국 채용 서류 전문가다.
아래 ${template.name} 양식으로 변환된 이력서를 더 자연스럽고 효과적으로 다듬어라.
${job ? '특히 이 채용공고에 맞게 강조 포인트를 조정해라.' : ''}

규칙:
1. 기존 내용의 구조와 팩트를 유지해라.
2. 표현을 더 전문적이고 간결하게 다듬어라.
3. 정량적 성과를 더 부각해라.
4. 반드시 복사-붙여넣기 가능한 완성된 텍스트를 반환해라.
5. JSON이 아닌 일반 텍스트로 응답해라.`,
          messages: [{
            role: 'user',
            content: `[원본 텍스트]\n${baseOutput.copy_ready_text}${job ? `\n[대상 공고]\n회사: ${job.company_name}\n포지션: ${job.job_title}\n필수 기술: ${job.required_skills.join(', ')}` : ''}`,
          }],
          temperature: 0.4,
        });

        return {
          platform: baseOutput.platform,
          platform_name: template.name,
          enhanced: true,
          sections: baseOutput.sections,
          copy_ready_text: response.content,
          original_text: baseOutput.copy_ready_text,
          platform_tips: baseOutput.platform_tips,
          job_context: job ? { company: job.company_name, title: job.job_title } : null,
        };
      } catch {
        // LLM 실패 시 기본 템플릿 결과 반환
      }
    }

    return {
      platform: baseOutput.platform,
      platform_name: template.name,
      enhanced: false,
      sections: baseOutput.sections,
      copy_ready_text: baseOutput.copy_ready_text,
      platform_tips: baseOutput.platform_tips,
      job_context: job ? { company: job.company_name, title: job.job_title } : null,
      tip: 'enhance_with_llm: true로 설정하면 LLM이 문장을 더 자연스럽게 다듬어줍니다.',
    };
  }
}
