import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { JobRepository } from '../../db/repositories/job-repository.js';
import { ProfileRepository } from '../../db/repositories/profile-repository.js';
import { getLlmClient } from '../../core/llm-client.js';
import { getTemplate } from '../../core/platform-templates.js';
import type { PlatformType } from '../../core/platform-templates.js';

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
        if (!job) return { content: [{ type: 'text' as const, text: '공고를 찾을 수 없습니다.' }], isError: true };

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
    '마스터 프로필을 특정 채용사이트 양식에 맞게 변환합니다. LLM 없이도 동작하며, 복사해서 바로 붙여넣을 수 있는 텍스트를 생성합니다.',
    {
      profile_id: z.string().optional().describe('프로필 ID'),
      target_platform: z.enum(['wanted', 'saramin', 'jobkorea', 'jumpit', 'groupby', 'general']).describe('출력 대상 플랫폼'),
      job_id: z.string().optional().describe('특정 공고에 맞춤화할 경우'),
      enhance_with_llm: z.boolean().optional().default(false).describe('LLM으로 문장을 보강할지 여부'),
    },
    async (params) => {
      try {
        const profile = params.profile_id
          ? profileRepo.findById(params.profile_id)
          : profileRepo.findAll()[0];
        if (!profile) return { content: [{ type: 'text' as const, text: '프로필이 없습니다.' }], isError: true };

        const job = params.job_id ? jobRepo.findById(params.job_id) : null;

        // 1단계: 템플릿 기반 변환 (LLM 불필요)
        const template = getTemplate(params.target_platform as PlatformType);
        const baseOutput = template.formatProfile(profile);

        // 2단계: LLM 보강 (선택적)
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
                content: `[원본 텍스트]\n${baseOutput.copy_ready_text}\n${job ? `\n[대상 공고]\n회사: ${job.company_name}\n포지션: ${job.job_title}\n필수 기술: ${job.required_skills.join(', ')}` : ''}`,
              }],
              temperature: 0.4,
            });

            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  platform: baseOutput.platform,
                  platform_name: template.name,
                  enhanced: true,
                  sections: baseOutput.sections,
                  copy_ready_text: response.content,
                  original_text: baseOutput.copy_ready_text,
                  platform_tips: baseOutput.platform_tips,
                  job_context: job ? { company: job.company_name, title: job.job_title } : null,
                }, null, 2),
              }],
            };
          } catch {
            // LLM 실패 → 기본 템플릿 결과 반환
          }
        }

        // 기본 템플릿 결과 반환
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              platform: baseOutput.platform,
              platform_name: template.name,
              enhanced: false,
              sections: baseOutput.sections,
              copy_ready_text: baseOutput.copy_ready_text,
              platform_tips: baseOutput.platform_tips,
              job_context: job ? { company: job.company_name, title: job.job_title } : null,
              tip: 'enhance_with_llm: true로 설정하면 LLM이 문장을 더 자연스럽게 다듬어줍니다.',
            }, null, 2),
          }],
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
