import { JobRepository } from '../db/repositories/job-repository.js';
import { ProfileRepository } from '../db/repositories/profile-repository.js';
import { normalizeSkill } from '../core/tech-dictionary.js';
import { calculateMatchScore, collectProfileDomains } from '../core/match-scoring.js';
import { getLlmClient } from '../core/llm-client.js';
import { resolveJobOrThrow, resolveProfileOrThrow } from './shared/resolvers.js';

export class MatchService {
  private readonly jobRepo = new JobRepository();
  private readonly profileRepo = new ProfileRepository();

  async scoreJob(params: { job_id: string; profile_id?: string }) {
    const job = resolveJobOrThrow(this.jobRepo, params.job_id, `공고를 찾을 수 없습니다: ${params.job_id}`);
    const profile = resolveProfileOrThrow(this.profileRepo, params.profile_id, '프로필이 없습니다. profile_parse_resume으로 먼저 등록하세요.');

    const userSkillNames = profile.skills.map(skill => skill.name);
    const userNormSkills = new Set(userSkillNames.map(skill => normalizeSkill(skill)));
    const matchScore = calculateMatchScore(profile, job);
    const profileDomains = collectProfileDomains(profile);

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
프로젝트: ${profile.projects.map(project => project.name).join(', ')}
도메인: ${profileDomains.join(', ')}

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
      const matchedSkills = userSkillNames.filter(skill =>
        job.required_skills.map(required => normalizeSkill(required)).includes(normalizeSkill(skill))
      );
      const missingSkills = job.required_skills.filter(skill => !userNormSkills.has(normalizeSkill(skill)));
      if (matchedSkills.length > 0) strengths.push(`핵심 기술 일치: ${matchedSkills.join(', ')}`);
      if (missingSkills.length > 0) gaps.push(`부족한 필수 기술: ${missingSkills.join(', ')}`);
    }

    return {
      job_id: params.job_id,
      profile_id: profile.id,
      company_name: job.company_name,
      job_title: job.job_title,
      overall_score: matchScore.overall_score,
      confidence: matchScore.scoring_meta.confidence,
      priority: matchScore.priority,
      breakdown: matchScore.breakdown,
      scoring_meta: matchScore.scoring_meta,
      message: matchScore.scoring_meta.message,
      strengths,
      gaps,
      resume_highlights,
    };
  }

  rankJobs(params: { job_ids: string[]; profile_id?: string; top_k: number }) {
    const profile = resolveProfileOrThrow(this.profileRepo, params.profile_id, '프로필이 없습니다.');
    const rankings = [];

    for (const jobId of params.job_ids) {
      const job = this.jobRepo.findById(jobId);
      if (!job) continue;
      const matchScore = calculateMatchScore(profile, job);

      rankings.push({
        job_id: jobId,
        company_name: job.company_name,
        job_title: job.job_title,
        score: matchScore.overall_score ?? matchScore.scoring_meta.provisional_score ?? 0,
      });
    }

    rankings.sort((a, b) => b.score - a.score);

    return {
      rankings: rankings.slice(0, params.top_k).map((ranking, index) => ({ rank: index + 1, ...ranking })),
    };
  }
}
