import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { JobRepository } from '../../db/repositories/job-repository.js';
import { ProfileRepository } from '../../db/repositories/profile-repository.js';
import { skillMatchScore, normalizeSkill } from '../../core/tech-dictionary.js';
import { getLlmClient } from '../../core/llm-client.js';

export function registerMatchTools(server: McpServer): void {
  const jobRepo = new JobRepository();
  const profileRepo = new ProfileRepository();

  server.tool(
    'match_score_job',
    '사용자 프로필과 채용공고의 적합도를 분석합니다. 5가지 차원의 점수와 강점/약점/서류 강조 포인트를 반환합니다.',
    {
      job_id: z.string().describe('채용공고 ID'),
      profile_id: z.string().optional().describe('프로필 ID (없으면 최근 프로필 사용)'),
    },
    async (params) => {
      try {
        const job = jobRepo.findById(params.job_id);
        if (!job) return { content: [{ type: 'text' as const, text: `공고를 찾을 수 없습니다: ${params.job_id}` }], isError: true };

        let profile;
        if (params.profile_id) {
          profile = profileRepo.findById(params.profile_id);
        } else {
          const all = profileRepo.findAll();
          profile = all[0];
        }
        if (!profile) return { content: [{ type: 'text' as const, text: '프로필이 없습니다. profile_parse_resume으로 먼저 등록하세요.' }], isError: true };

        // 1. 기술 매칭 (규칙 기반)
        const userSkillNames = profile.skills.map(s => s.name);
        const skill_match = skillMatchScore(userSkillNames, job.required_skills, job.preferred_skills);

        // 2. 경력 적합도
        let experience_fit = 50;
        const years = profile.total_experience_years;
        if (job.experience_min !== null && job.experience_max !== null) {
          if (years >= job.experience_min && years <= job.experience_max) experience_fit = 100;
          else if (Math.abs(years - job.experience_min) <= 1 || Math.abs(years - job.experience_max) <= 1) experience_fit = 80;
          else if (Math.abs(years - job.experience_min) <= 2 || Math.abs(years - job.experience_max) <= 2) experience_fit = 60;
          else experience_fit = 40;
        } else if (job.experience_min !== null) {
          experience_fit = years >= job.experience_min ? 100 : Math.max(40, 100 - (job.experience_min - years) * 20);
        }

        // 3. 책임/업무 관련도 (간단 키워드 매칭)
        const projectTexts = profile.projects.map(p => `${p.description} ${p.achievements.join(' ')}`).join(' ');
        const respTexts = job.responsibilities.join(' ') + ' ' + job.qualifications.join(' ');
        const responsibility_relevance = simpleTextSimilarity(projectTexts, respTexts);

        // 4. 도메인 적합도
        const jobDomains = extractDomains(job.raw_text);
        const domainOverlap = profile.domains.filter(d => jobDomains.some(jd => jd.toLowerCase().includes(d.toLowerCase()) || d.toLowerCase().includes(jd.toLowerCase())));
        const domain_fit = jobDomains.length === 0 ? 50 : Math.round((domainOverlap.length / Math.max(jobDomains.length, 1)) * 100);

        // 5. 우대사항 커버
        const prefSkills = job.preferred_skills.map(s => normalizeSkill(s));
        const userNormSkills = new Set(userSkillNames.map(s => normalizeSkill(s)));
        const prefCovered = prefSkills.filter(s => userNormSkills.has(s));
        const preference_coverage = prefSkills.length === 0 ? 50 : Math.round((prefCovered.length / prefSkills.length) * 100);

        // 종합 점수
        const overall_score = Math.round(
          skill_match * 0.30 + experience_fit * 0.20 + responsibility_relevance * 0.20 +
          domain_fit * 0.15 + preference_coverage * 0.15
        );
        const priority = overall_score >= 80 ? 'A' : overall_score >= 60 ? 'B' : overall_score >= 40 ? 'C' : 'D';

        // LLM으로 자연어 분석 (선택)
        let strengths: string[] = [];
        let gaps: string[] = [];
        let resume_highlights: string[] = [];

        try {
          const llm = getLlmClient();
          const analysisResponse = await llm.generate({
            system: `너는 한국 개발자 채용 매칭 분석 전문가다. 사용자 프로필과 채용공고를 비교 분석해라.
반드시 아래 JSON 형식으로만 응답해라.
{
  "strengths": ["잘 맞는 이유 1", "잘 맞는 이유 2"],
  "gaps": ["부족한 점 1", "부족한 점 2"],
  "resume_highlights": ["서류에서 강조할 포인트 1", "서류에서 강조할 포인트 2"]
}`,
            messages: [{
              role: 'user',
              content: `[사용자 프로필]
기술: ${userSkillNames.join(', ')}
경력: ${profile.total_experience_years}년
프로젝트: ${profile.projects.map(p => p.name).join(', ')}
도메인: ${profile.domains.join(', ')}

[채용공고]
회사: ${job.company_name}
포지션: ${job.job_title}
필수 기술: ${job.required_skills.join(', ')}
우대 기술: ${job.preferred_skills.join(', ')}
주요 업무: ${job.responsibilities.join(', ')}
자격 요건: ${job.qualifications.join(', ')}
우대 사항: ${job.preferences.join(', ')}`,
            }],
            temperature: 0.3,
          });

          const jsonMatch = analysisResponse.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            strengths = parsed.strengths || [];
            gaps = parsed.gaps || [];
            resume_highlights = parsed.resume_highlights || [];
          }
        } catch {
          // LLM 실패 시 규칙 기반 요약
          const matchedSkills = userSkillNames.filter(s => job.required_skills.map(r => normalizeSkill(r)).includes(normalizeSkill(s)));
          const missingSkills = job.required_skills.filter(s => !userNormSkills.has(normalizeSkill(s)));
          if (matchedSkills.length > 0) strengths.push(`핵심 기술 일치: ${matchedSkills.join(', ')}`);
          if (missingSkills.length > 0) gaps.push(`부족한 필수 기술: ${missingSkills.join(', ')}`);
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              job_id: params.job_id,
              profile_id: profile.id,
              company_name: job.company_name,
              job_title: job.job_title,
              overall_score,
              priority,
              breakdown: { skill_match, experience_fit, responsibility_relevance, domain_fit, preference_coverage },
              strengths,
              gaps,
              resume_highlights,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `매칭 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'match_rank_jobs',
    '여러 채용공고를 적합도 순으로 랭킹합니다.',
    {
      job_ids: z.array(z.string()).describe('채용공고 ID 목록'),
      profile_id: z.string().optional().describe('프로필 ID'),
      top_k: z.number().optional().default(10),
    },
    async (params) => {
      try {
        let profile;
        if (params.profile_id) {
          profile = profileRepo.findById(params.profile_id);
        } else {
          const all = profileRepo.findAll();
          profile = all[0];
        }
        if (!profile) return { content: [{ type: 'text' as const, text: '프로필이 없습니다.' }], isError: true };

        const rankings = [];
        for (const jobId of params.job_ids) {
          const job = jobRepo.findById(jobId);
          if (!job) continue;

          const userSkillNames = profile.skills.map(s => s.name);
          const skill_match = skillMatchScore(userSkillNames, job.required_skills, job.preferred_skills);
          const score = skill_match; // 간단 랭킹은 skill_match 기준

          rankings.push({
            job_id: jobId,
            company_name: job.company_name,
            job_title: job.job_title,
            score,
          });
        }

        rankings.sort((a, b) => b.score - a.score);
        const topK = rankings.slice(0, params.top_k).map((r, i) => ({ rank: i + 1, ...r }));

        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ rankings: topK }, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `랭킹 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}

// --- 헬퍼 함수 ---

function simpleTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 1));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 1));
  if (words1.size === 0 || words2.size === 0) return 50;

  let overlap = 0;
  for (const w of words1) {
    if (words2.has(w)) overlap++;
  }
  return Math.min(100, Math.round((overlap / Math.min(words1.size, words2.size)) * 100));
}

function extractDomains(text: string): string[] {
  const domainKeywords: Record<string, string[]> = {
    'fintech': ['결제', '금융', '핀테크', 'fintech', '은행', '보험', '증권', '페이'],
    'e-commerce': ['이커머스', '쇼핑', '커머스', '주문', '배송', 'e-commerce'],
    'healthcare': ['헬스케어', '의료', '건강', '병원'],
    'edtech': ['에듀테크', '교육', '학습', 'edtech'],
    'logistics': ['물류', '배송', '택배'],
    'social': ['소셜', 'SNS', '커뮤니티'],
    'gaming': ['게임', '게이밍'],
    'saas': ['SaaS', 'B2B', '기업용'],
    'media': ['미디어', '콘텐츠', '영상', '스트리밍'],
  };

  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) {
      found.push(domain);
    }
  }
  return found;
}
