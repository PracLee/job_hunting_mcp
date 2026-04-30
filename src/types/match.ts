export interface MatchScoreBreakdown {
  skill_match: number | null;
  experience_fit: number | null;
  responsibility_relevance: number | null;
  domain_fit: number | null;
  preference_coverage: number | null;
}

export interface MatchScoringMeta {
  coverage_percent: number;
  base_weights: Record<keyof MatchScoreBreakdown, number>;
  applied_weights: Partial<Record<keyof MatchScoreBreakdown, number>>;
  ignored_dimensions: Partial<Record<keyof MatchScoreBreakdown, string>>;
}

export interface MatchResult {
  job_id: string;
  profile_id: string;
  overall_score: number;
  breakdown: MatchScoreBreakdown;
  scoring_meta: MatchScoringMeta;
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
