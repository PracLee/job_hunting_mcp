import type { JobPosting, UserProfile } from '../types/index.js';
import type { MatchScoreBreakdown, MatchScoringMeta } from '../types/match.js';
import { normalizeSkill, skillMatchScore } from './tech-dictionary.js';

export const MATCH_WEIGHTS = {
  skill_match: 0.30,
  experience_fit: 0.20,
  responsibility_relevance: 0.20,
  domain_fit: 0.15,
  preference_coverage: 0.15,
} as const satisfies Record<keyof MatchScoreBreakdown, number>;

type MatchDimension = keyof MatchScoreBreakdown;

const TOTAL_MATCH_WEIGHT = Object.values(MATCH_WEIGHTS).reduce((sum, weight) => sum + weight, 0);

export interface CalculatedMatchScore {
  overall_score: number;
  priority: 'A' | 'B' | 'C' | 'D';
  breakdown: MatchScoreBreakdown;
  scoring_meta: MatchScoringMeta;
}

export function calculateMatchScore(profile: UserProfile, job: JobPosting): CalculatedMatchScore {
  const userSkillNames = profile.skills.map(skill => skill.name);
  const profileDomains = collectProfileDomains(profile);
  const preferredSkills = job.preferred_skills.map(skill => normalizeSkill(skill));
  const userNormalizedSkills = new Set(userSkillNames.map(skill => normalizeSkill(skill)));

  const breakdown: MatchScoreBreakdown = {
    skill_match: calculateSkillMatch(userSkillNames, job.required_skills, job.preferred_skills),
    experience_fit: calculateExperienceFit(profile.total_experience_years, job.experience_min, job.experience_max),
    responsibility_relevance: calculateResponsibilityRelevance(profile, job),
    domain_fit: calculateDomainFit(profileDomains, job.raw_text),
    preference_coverage: calculatePreferenceCoverage(preferredSkills, userNormalizedSkills),
  };

  const ignored_dimensions: Partial<Record<MatchDimension, string>> = {};
  const weightedScores: Partial<Record<MatchDimension, number>> = {};
  let weightedTotal = 0;
  let usedWeight = 0;

  for (const [dimension, weight] of Object.entries(MATCH_WEIGHTS) as Array<[MatchDimension, number]>) {
    const score = breakdown[dimension];
    if (score === null) {
      ignored_dimensions[dimension] = getIgnoreReason(dimension, profile, job);
      continue;
    }

    weightedScores[dimension] = score;
    weightedTotal += score * weight;
    usedWeight += weight;
  }

  const overall_score = usedWeight === 0 ? 0 : Math.round(weightedTotal / usedWeight);
  const priority = overall_score >= 80 ? 'A' : overall_score >= 60 ? 'B' : overall_score >= 40 ? 'C' : 'D';

  return {
    overall_score,
    priority,
    breakdown,
    scoring_meta: {
      coverage_percent: Math.round((usedWeight / TOTAL_MATCH_WEIGHT) * 100),
      base_weights: { ...MATCH_WEIGHTS },
      applied_weights: normalizeWeights(weightedScores, usedWeight),
      ignored_dimensions,
    },
  };
}

export function calculateExperienceFit(years: number, min: number | null, max: number | null): number | null {
  if (min !== null && max !== null) {
    if (years >= min && years <= max) return 100;
    if (Math.abs(years - min) <= 1 || Math.abs(years - max) <= 1) return 80;
    if (Math.abs(years - min) <= 2 || Math.abs(years - max) <= 2) return 60;
    return 40;
  }

  if (min !== null) {
    return years >= min ? 100 : Math.max(40, 100 - (min - years) * 20);
  }

  if (max !== null) {
    return years <= max ? 100 : Math.max(40, 100 - (years - max) * 20);
  }

  return null;
}

export function simpleTextSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(word => word.length > 1));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(word => word.length > 1));
  if (words1.size === 0 || words2.size === 0) return 0;

  let overlap = 0;
  for (const word of words1) {
    if (words2.has(word)) overlap++;
  }

  return Math.min(100, Math.round((overlap / Math.min(words1.size, words2.size)) * 100));
}

export function extractDomains(text: string): string[] {
  const domainKeywords: Record<string, string[]> = {
    fintech: ['결제', '금융', '핀테크', 'fintech', '은행', '보험', '증권', '페이'],
    'e-commerce': ['이커머스', '쇼핑', '커머스', '주문', '배송', 'e-commerce'],
    healthcare: ['헬스케어', '의료', '건강', '병원'],
    edtech: ['에듀테크', '교육', '학습', 'edtech'],
    logistics: ['물류', '배송', '택배'],
    social: ['소셜', 'SNS', '커뮤니티'],
    gaming: ['게임', '게이밍'],
    saas: ['SaaS', 'B2B', '기업용'],
    media: ['미디어', '콘텐츠', '영상', '스트리밍'],
  };

  const found = new Set<string>();
  const lower = text.toLowerCase();
  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some(keyword => lower.includes(keyword.toLowerCase()))) {
      found.add(domain);
    }
  }

  return Array.from(found);
}

export function collectProfileDomains(profile: UserProfile): string[] {
  const explicitDomains = profile.domains.filter(Boolean);
  if (explicitDomains.length > 0) {
    return Array.from(new Set(explicitDomains));
  }

  return Array.from(new Set(
    profile.projects
      .map(project => project.domain)
      .filter((domain): domain is string => Boolean(domain && domain.trim()))
  ));
}

function calculateSkillMatch(userSkillNames: string[], requiredSkills: string[], preferredSkills: string[]): number | null {
  if (requiredSkills.length === 0 && preferredSkills.length === 0) return null;
  return skillMatchScore(userSkillNames, requiredSkills, preferredSkills);
}

function calculateResponsibilityRelevance(profile: UserProfile, job: JobPosting): number | null {
  const projectTexts = profile.projects
    .map(project => `${project.description} ${project.achievements.join(' ')}`.trim())
    .filter(Boolean)
    .join(' ');
  const responsibilityTexts = [...job.responsibilities, ...job.qualifications].join(' ').trim();

  if (!projectTexts || !responsibilityTexts) return null;
  return simpleTextSimilarity(projectTexts, responsibilityTexts);
}

function calculateDomainFit(profileDomains: string[], rawJobText: string): number | null {
  const jobDomains = extractDomains(rawJobText);
  if (profileDomains.length === 0 || jobDomains.length === 0) return null;

  const overlap = profileDomains.filter(domain =>
    jobDomains.some(jobDomain =>
      jobDomain.toLowerCase().includes(domain.toLowerCase()) ||
      domain.toLowerCase().includes(jobDomain.toLowerCase())
    )
  );

  return Math.round((overlap.length / jobDomains.length) * 100);
}

function calculatePreferenceCoverage(preferredSkills: string[], userNormalizedSkills: Set<string>): number | null {
  if (preferredSkills.length === 0) return null;

  const covered = preferredSkills.filter(skill => userNormalizedSkills.has(skill));
  return Math.round((covered.length / preferredSkills.length) * 100);
}

function normalizeWeights(
  weightedScores: Partial<Record<MatchDimension, number>>,
  usedWeight: number,
): Partial<Record<MatchDimension, number>> {
  if (usedWeight === 0) return {};

  const appliedWeights: Partial<Record<MatchDimension, number>> = {};
  for (const dimension of Object.keys(weightedScores) as MatchDimension[]) {
    appliedWeights[dimension] = Number((MATCH_WEIGHTS[dimension] / usedWeight).toFixed(4));
  }

  return appliedWeights;
}

function getIgnoreReason(dimension: MatchDimension, profile: UserProfile, job: JobPosting): string {
  switch (dimension) {
    case 'skill_match':
      return 'job_skills_missing';
    case 'experience_fit':
      return 'job_experience_range_missing';
    case 'responsibility_relevance':
      return profile.projects.length === 0 ? 'profile_projects_missing' : 'job_responsibilities_missing';
    case 'domain_fit':
      return collectProfileDomains(profile).length === 0 ? 'profile_domains_missing' : 'job_domains_missing';
    case 'preference_coverage':
      return 'job_preferred_skills_missing';
  }
}
