import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ProfileRepository } from '../../db/repositories/profile-repository.js';
import { extractSkills } from '../../core/tech-dictionary.js';
import { getLlmClient } from '../../core/llm-client.js';

export function registerProfileTools(server: McpServer): void {
  const profileRepo = new ProfileRepository();

  server.tool(
    'profile_parse_resume',
    '이력서/경력기술서 텍스트를 구조화된 프로필로 파싱합니다. 한 번 입력하면 마스터 프로필로 저장되어 모든 도구에서 사용됩니다.',
    {
      resume_text: z.string().describe('이력서 원문 텍스트'),
      career_description_text: z.string().optional().describe('경력기술서 원문 텍스트'),
      portfolio_text: z.string().optional().describe('포트폴리오/프로젝트 설명 텍스트'),
    },
    async (params) => {
      try {
        // 1단계: 규칙 기반 기술스택 추출
        const allText = [params.resume_text, params.career_description_text, params.portfolio_text]
          .filter(Boolean).join('\n');
        const skills = extractSkills(allText);

        // 2단계: LLM으로 구조화 파싱
        let parsedProfile: any = {};
        try {
          const llm = getLlmClient();
          const response = await llm.generate({
            system: `너는 한국 개발자 이력서 파싱 전문가다. 주어진 텍스트에서 아래 정보를 JSON으로 추출해라.
반드시 아래 JSON 형식으로만 응답해라. 다른 텍스트는 포함하지 마라.

{
  "name": "이름 (없으면 null)",
  "email": "이메일 (없으면 null)",
  "phone": "전화번호 (없으면 null)",
  "total_experience_years": 숫자,
  "job_category": "backend|frontend|fullstack|mobile|data|devops|ai_ml|other",
  "projects": [
    {
      "name": "프로젝트명",
      "role": "역할",
      "duration": "기간",
      "tech_stack": ["기술1", "기술2"],
      "description": "설명",
      "achievements": ["성과1", "성과2"],
      "domain": "도메인",
      "tags": ["태그1"]
    }
  ],
  "domains": ["도메인1"],
  "education": [{"school": "", "major": "", "degree": "", "year": 0}],
  "certifications": []
}`,
            messages: [{ role: 'user', content: allText }],
            temperature: 0.1,
          });

          // JSON 추출
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsedProfile = JSON.parse(jsonMatch[0]);
          }
        } catch (llmError) {
          // LLM 실패해도 규칙 기반 결과로 진행
          console.error('LLM 파싱 실패, 규칙 기반으로 진행:', llmError);
        }

        // 3단계: 규칙 기반 + LLM 결과 병합
        const profile = profileRepo.save({
          name: parsedProfile.name || null,
          email: parsedProfile.email || null,
          phone: parsedProfile.phone || null,
          total_experience_years: parsedProfile.total_experience_years || 0,
          job_category: parsedProfile.job_category || 'other',
          skills: skills.map(s => ({ name: s, level: 'intermediate' as const })),
          projects: parsedProfile.projects || [],
          domains: parsedProfile.domains || [],
          education: parsedProfile.education || [],
          certifications: parsedProfile.certifications || [],
          raw_resume_text: params.resume_text,
          raw_career_text: params.career_description_text || null,
          raw_portfolio_text: params.portfolio_text || null,
        });

        const warnings: string[] = [];
        if (!parsedProfile.name) warnings.push('이름을 추출하지 못했습니다.');
        if (skills.length === 0) warnings.push('기술스택을 추출하지 못했습니다. 텍스트를 확인해주세요.');
        if (!parsedProfile.projects || parsedProfile.projects.length === 0) {
          warnings.push('프로젝트를 추출하지 못했습니다. 경력기술서를 추가로 입력해주세요.');
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: '프로필이 저장되었습니다.',
              profile_id: profile.id,
              summary: {
                name: profile.name,
                experience_years: profile.total_experience_years,
                skills_count: skills.length,
                projects_count: profile.projects.length,
                extracted_skills: skills,
              },
              warnings,
              next_steps: [
                'jobs_search로 관심 공고를 검색하세요.',
                'match_score_job으로 공고와의 적합도를 확인하세요.',
                'resume_tailor로 공고에 맞게 서류를 맞춤화하세요.',
              ],
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `파싱 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'profile_get',
    '저장된 프로필을 조회합니다.',
    {
      profile_id: z.string().optional().describe('프로필 ID (없으면 가장 최근 프로필)'),
    },
    async (params) => {
      try {
        let profile;
        if (params.profile_id) {
          profile = profileRepo.findById(params.profile_id);
        } else {
          const all = profileRepo.findAll();
          profile = all[0] || null;
        }

        if (!profile) {
          return {
            content: [{
              type: 'text' as const,
              text: '저장된 프로필이 없습니다. profile_parse_resume으로 먼저 프로필을 등록하세요.',
            }],
          };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(profile, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `조회 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
