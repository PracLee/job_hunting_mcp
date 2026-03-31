import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ProfileRepository } from '../../db/repositories/profile-repository.js';
import { extractSkills } from '../../core/tech-dictionary.js';
import { parseResumeText } from '../../core/resume-parser.js';
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
        // 1단계: 규칙 기반 파싱 (LLM 없이 동작)
        const ruleBased = parseResumeText(
          params.resume_text,
          params.career_description_text,
          params.portfolio_text,
        );

        // 2단계: LLM 보조 파싱 (실패해도 진행)
        let llmParsed: any = {};
        try {
          const llm = getLlmClient();
          const allText = [params.resume_text, params.career_description_text, params.portfolio_text]
            .filter(Boolean).join('\n\n---\n\n');

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
      "tech_stack": ["기술1"],
      "description": "한 줄 설명",
      "achievements": ["성과1"],
      "domain": "fintech|e-commerce|healthcare|edtech|logistics|social|gaming|saas|media|other",
      "tags": ["msa", "performance", "refactoring"]
    }
  ],
  "domains": ["fintech"],
  "education": [{"school": "", "major": "", "degree": "학사|석사|박사", "year": 2021}],
  "certifications": []
}`,
            messages: [{ role: 'user', content: allText }],
            temperature: 0.1,
          });

          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            llmParsed = JSON.parse(jsonMatch[0]);
          }
        } catch {
          // LLM 실패 → 규칙 기반 결과만 사용
        }

        // 3단계: 규칙 기반 + LLM 결과 병합 (규칙 기반 우선, LLM으로 보완)
        const mergedName = ruleBased.name || llmParsed.name || null;
        const mergedEmail = ruleBased.email || llmParsed.email || null;
        const mergedPhone = ruleBased.phone || llmParsed.phone || null;
        const mergedYears = ruleBased.total_experience_years || llmParsed.total_experience_years || 0;
        const mergedCategory = ruleBased.job_category !== 'other' ? ruleBased.job_category : (llmParsed.job_category || 'other');

        // 프로젝트: 규칙 기반이 있으면 사용, 없으면 LLM
        const mergedProjects = ruleBased.projects.length > 0
          ? ruleBased.projects
          : (llmParsed.projects || []);

        // 스킬: 규칙 기반 (기술사전 매칭) 우선
        const mergedSkills = ruleBased.skills.length > 0
          ? ruleBased.skills
          : (llmParsed.skills || []).map((s: any) => typeof s === 'string' ? { name: s, level: 'intermediate' } : s);

        // 도메인: 합집합
        const domainSet = new Set([...ruleBased.domains, ...(llmParsed.domains || [])]);

        // 학력/자격증: 규칙 기반 + LLM 보완
        const mergedEducation = ruleBased.education.length > 0
          ? ruleBased.education
          : (llmParsed.education || []);

        const mergedCerts = ruleBased.certifications.length > 0
          ? ruleBased.certifications
          : (llmParsed.certifications || []);

        // 기존 프로필이 있다면 사용자의 수동 교정값을 유지(Carry-over)합니다.
        const prevProfile = profileRepo.findAll()[0];
        const carryConfirmed = prevProfile ? prevProfile.user_confirmed_skills : [];
        const carryRejected = prevProfile ? prevProfile.user_rejected_skills : [];

        // 새로 추출된 스킬 중, 사용자가 예전에 삭제(reject)했던 스킬이면 강제로 제거합니다.
        const rejectedSet = new Set(carryRejected);
        const filteredSkills = mergedSkills.filter((s: any) => {
          const name = typeof s === 'string' ? s : s.name;
          return !rejectedSet.has(name);
        });

        const profile = profileRepo.save({
          name: mergedName,
          email: mergedEmail,
          phone: mergedPhone,
          total_experience_years: mergedYears,
          total_experience_months: mergedYears * 12,
          job_category: mergedCategory,
          skills: filteredSkills,
          user_confirmed_skills: carryConfirmed,
          user_rejected_skills: carryRejected,
          projects: mergedProjects,
          domains: Array.from(domainSet),
          education: mergedEducation,
          certifications: mergedCerts,
          raw_resume_text: params.resume_text,
          raw_career_text: params.career_description_text || null,
          raw_portfolio_text: params.portfolio_text || null,
        });

        const warnings: string[] = [];
        if (!mergedName) warnings.push('이름을 추출하지 못했습니다.');
        if (mergedSkills.length === 0) warnings.push('기술스택을 추출하지 못했습니다.');
        if (mergedProjects.length === 0) warnings.push('프로젝트를 추출하지 못했습니다. 경력기술서를 추가로 입력해주세요.');
        if (mergedYears === 0) warnings.push('경력 연차를 추출하지 못했습니다.');

        const parsingMethod = llmParsed.name ? '규칙 기반 + LLM 보조' : '규칙 기반 (LLM 미사용)';

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: '프로필이 저장되었습니다.',
              profile_id: profile.id,
              parsing_method: parsingMethod,
              summary: {
                name: profile.name,
                experience_years: profile.total_experience_years,
                job_category: profile.job_category,
                skills_count: mergedSkills.length,
                projects_count: mergedProjects.length,
                domains: Array.from(domainSet),
                extracted_skills: mergedSkills.map((s: any) => s.name || s),
              },
              warnings,
              sections_found: Object.keys(ruleBased.sections),
              next_steps: [
                'jobs_search 또는 jobs_add로 관심 공고를 등록하세요.',
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
    'profile_update_skills',
    '마스터 프로필의 기술스택을 수동으로 교정합니다. (파서 오인식 보정 및 누락 항목 추가용)',
    {
      profile_id: z.string().optional().describe('수정할 프로필 ID (없으면 가장 최근 프로필)'),
      add_skills: z.array(z.string()).optional().describe('수동으로 확실하게 추가할 기술스택 이름 목록'),
      remove_skills: z.array(z.string()).optional().describe('파서가 문맥을 오인하여 잘못 추출한 삭제할 기술스택 이름 목록'),
    },
    async (params) => {
      try {
        let profile;
        if (params.profile_id) profile = profileRepo.findById(params.profile_id);
        else profile = profileRepo.findAll()[0] || null;

        if (!profile) return { content: [{ type: 'text' as const, text: '수정할 프로필이 없습니다.' }], isError: true };

        const currentSkills = profile.skills || [];
        const confirmed = new Set(profile.user_confirmed_skills || []);
        const rejected = new Set(profile.user_rejected_skills || []);

        if (params.remove_skills) {
          params.remove_skills.forEach(skill => {
            rejected.add(skill);
            confirmed.delete(skill);
          });
        }

        if (params.add_skills) {
          params.add_skills.forEach(skill => {
            confirmed.add(skill);
            rejected.delete(skill);
          });
        }

        // Generate the new total skills array
        // 1. Start with existing basic skills that haven't been rejected
        let finalSkills = currentSkills.filter((s: any) => {
          const name = typeof s === 'string' ? s : s.name;
          return !rejected.has(name);
        });

        // 2. Add any globally confirmed skills if they aren't already there
        confirmed.forEach(skill => {
          const exists = finalSkills.find((s: any) => (typeof s === 'string' ? s : s.name) === skill);
          if (!exists) {
            finalSkills.push({ name: skill, level: 'intermediate' }); // Mock Skill object format
          }
        });

        profileRepo.update(profile.id, {
          skills: finalSkills,
          user_confirmed_skills: Array.from(confirmed),
          user_rejected_skills: Array.from(rejected),
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: '기술 스택이 성공적으로 교정되었습니다.',
              updated_skills: finalSkills.map((s: any) => typeof s === 'string' ? s : s.name),
              confirmed_skills: Array.from(confirmed),
              rejected_skills: Array.from(rejected)
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `수정 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'profile_update_experience',
    '마스터 프로필의 총 경력을 정밀하게 수동 교정합니다.',
    {
      profile_id: z.string().optional().describe('수정할 프로필 ID (없으면 가장 최근 프로필)'),
      total_experience_months: z.number().describe('총 경력 (개월 수 단위, 예: 3년 8개월 -> 44)'),
    },
    async (params) => {
      try {
        let profile;
        if (params.profile_id) profile = profileRepo.findById(params.profile_id);
        else profile = profileRepo.findAll()[0] || null;

        if (!profile) return { content: [{ type: 'text' as const, text: '수정할 프로필이 없습니다.' }], isError: true };

        const months = params.total_experience_months;
        const years = Number((months / 12).toFixed(2));

        profileRepo.update(profile.id, {
          total_experience_months: months,
          total_experience_years: years,
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: '경력 기간이 성공적으로 교정되었습니다.',
              total_experience_months: months,
              total_experience_years: years,
              formatted: `${Math.floor(months / 12)}년 ${months % 12}개월`,
            }, null, 2)
          }]
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `수정 실패: ${error instanceof Error ? error.message : String(error)}` }],
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
