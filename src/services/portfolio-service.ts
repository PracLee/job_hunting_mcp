import { JobRepository } from '../db/repositories/job-repository.js';
import { ProfileRepository } from '../db/repositories/profile-repository.js';
import { normalizeSkill } from '../core/tech-dictionary.js';
import { resolveJobOrThrow, resolveProfileOrThrow } from './shared/resolvers.js';

export class PortfolioService {
  private readonly jobRepo = new JobRepository();
  private readonly profileRepo = new ProfileRepository();

  reorderPortfolio(params: { job_id: string; profile_id?: string }) {
    const job = resolveJobOrThrow(this.jobRepo, params.job_id, '공고를 찾을 수 없습니다.');
    const profile = resolveProfileOrThrow(this.profileRepo, params.profile_id, '프로필이 없습니다.');

    const jdSkills = new Set([...job.required_skills, ...job.preferred_skills].map(skill => normalizeSkill(skill)));
    const jdText = [...job.responsibilities, ...job.qualifications, ...job.preferences].join(' ').toLowerCase();

    const scored = profile.projects.map(project => {
      const projectSkills = project.tech_stack.map(skill => normalizeSkill(skill));
      const skillOverlap = projectSkills.filter(skill => jdSkills.has(skill)).length;
      const skillScore = projectSkills.length > 0 ? (skillOverlap / Math.max(jdSkills.size, 1)) * 50 : 0;

      const projectText = `${project.description} ${project.achievements.join(' ')} ${project.tags.join(' ')}`.toLowerCase();
      const textWords = new Set(projectText.split(/\s+/).filter(word => word.length > 1));
      const jdWords = new Set(jdText.split(/\s+/).filter(word => word.length > 1));

      let textOverlap = 0;
      for (const word of textWords) {
        if (jdWords.has(word)) textOverlap++;
      }
      const textScore = textWords.size > 0 ? (textOverlap / Math.min(textWords.size, jdWords.size)) * 30 : 0;

      const domainScore = project.domain && jdText.includes(project.domain.toLowerCase()) ? 20 : 0;
      const totalScore = Math.round(skillScore + textScore + domainScore);

      let reason = '';
      if (skillOverlap > 0) reason += `기술 일치: ${projectSkills.filter(skill => jdSkills.has(skill)).join(', ')}. `;
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

    const highlighted = scored.filter(project => project.relevance_score >= 30);
    const minimized = scored.filter(project => project.relevance_score < 30);

    return {
      job: { company: job.company_name, title: job.job_title },
      reordered_projects: highlighted.map((project, index) => ({ rank: index + 1, ...project })),
      projects_to_minimize: minimized.map(project => ({
        project_name: project.project_name,
        reason: project.highlight_reason,
      })),
      tip: '상위 프로젝트를 포트폴리오 앞쪽에 배치하고, 하위 프로젝트는 간략히 언급하세요.',
    };
  }
}
