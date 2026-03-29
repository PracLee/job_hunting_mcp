import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { JobRepository } from '../../db/repositories/job-repository.js';
import { ProfileRepository } from '../../db/repositories/profile-repository.js';
import { normalizeSkill } from '../../core/tech-dictionary.js';

export function registerPortfolioTools(server: McpServer): void {
  const jobRepo = new JobRepository();
  const profileRepo = new ProfileRepository();

  server.tool(
    'portfolio_reorder',
    '채용공고 기준으로 포트폴리오 프로젝트를 관련도 순으로 재배치합니다.',
    {
      job_id: z.string().describe('채용공고 ID'),
      profile_id: z.string().optional().describe('프로필 ID'),
    },
    async (params) => {
      try {
        const job = jobRepo.findById(params.job_id);
        if (!job) return { content: [{ type: 'text' as const, text: '공고를 찾을 수 없습니다.' }], isError: true };

        const profile = params.profile_id
          ? profileRepo.findById(params.profile_id)
          : profileRepo.findAll()[0];
        if (!profile) return { content: [{ type: 'text' as const, text: '프로필이 없습니다.' }], isError: true };

        // 각 프로젝트의 JD 관련도 계산
        const jdSkills = new Set([...job.required_skills, ...job.preferred_skills].map(s => normalizeSkill(s)));
        const jdText = [
          ...job.responsibilities,
          ...job.qualifications,
          ...job.preferences,
        ].join(' ').toLowerCase();

        const scored = profile.projects.map(project => {
          // 기술 매칭 점수
          const projectSkills = project.tech_stack.map(s => normalizeSkill(s));
          const skillOverlap = projectSkills.filter(s => jdSkills.has(s)).length;
          const skillScore = projectSkills.length > 0 ? (skillOverlap / Math.max(jdSkills.size, 1)) * 50 : 0;

          // 텍스트 관련도
          const projectText = `${project.description} ${project.achievements.join(' ')} ${project.tags.join(' ')}`.toLowerCase();
          const textWords = new Set(projectText.split(/\s+/).filter(w => w.length > 1));
          const jdWords = new Set(jdText.split(/\s+/).filter(w => w.length > 1));
          let textOverlap = 0;
          for (const w of textWords) { if (jdWords.has(w)) textOverlap++; }
          const textScore = textWords.size > 0 ? (textOverlap / Math.min(textWords.size, jdWords.size)) * 30 : 0;

          // 도메인 매칭
          const domainScore = project.domain && jdText.includes(project.domain.toLowerCase()) ? 20 : 0;

          const totalScore = Math.round(skillScore + textScore + domainScore);

          let reason = '';
          if (skillOverlap > 0) reason += `기술 일치: ${projectSkills.filter(s => jdSkills.has(s)).join(', ')}. `;
          if (domainScore > 0) reason += `도메인 관련: ${project.domain}. `;
          if (reason === '') reason = 'JD와 직접적 연관 낮음';

          return {
            project_name: project.name,
            relevance_score: totalScore,
            highlight_reason: reason.trim(),
            tech_stack: project.tech_stack,
            achievements: project.achievements,
          };
        });

        scored.sort((a, b) => b.relevance_score - a.relevance_score);

        const highlighted = scored.filter(s => s.relevance_score >= 30);
        const minimized = scored.filter(s => s.relevance_score < 30);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              job: { company: job.company_name, title: job.job_title },
              reordered_projects: highlighted.map((p, i) => ({ rank: i + 1, ...p })),
              projects_to_minimize: minimized.map(p => ({
                project_name: p.project_name,
                reason: p.highlight_reason,
              })),
              tip: '상위 프로젝트를 포트폴리오 앞쪽에 배치하고, 하위 프로젝트는 간략히 언급하세요.',
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `재배치 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
