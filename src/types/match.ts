export interface MatchScoreBreakdown {
  skill_match: number;
  experience_fit: number;
  responsibility_relevance: number;
  domain_fit: number;
  preference_coverage: number;
}

export interface MatchResult {
  job_id: string;
  profile_id: string;
  overall_score: number;
  breakdown: MatchScoreBreakdown;
  strengths: string[];
  gaps: string[];
  resume_highlights: string[];
  priority: 'A' | 'B' | 'C' | 'D';
}

export interface MatchScoreParams {
  job_id: string;
  profile_id: string;
  weights?: Partial<MatchScoreBreakdown>;
}

export interface MatchRankParams {
  job_ids: string[];
  profile_id: string;
  top_k?: number;
}

export interface RankedJob {
  rank: number;
  job_id: string;
  score: number;
  summary: string;
}
