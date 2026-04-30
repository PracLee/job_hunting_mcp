export interface JobPosting {
  id: string;
  source: JobSource;
  source_id: string;
  company_name: string;
  job_title: string;
  job_category: JobCategory;
  experience_min: number | null;
  experience_max: number | null;
  employment_type: string;
  location: string;
  salary_text: string | null;
  required_skills: string[];
  preferred_skills: string[];
  responsibilities: string[];
  qualifications: string[];
  preferences: string[];
  deadline: string | null;
  url: string;
  raw_text: string;
  fetched_at: string;
}

export type JobSource = 'wanted' | 'saramin' | 'jobkorea' | 'jumpit' | 'groupby' | 'remember';
export type JobSearchMode = 'online' | 'local' | 'both';

export type JobCategory =
  | 'backend'
  | 'frontend'
  | 'fullstack'
  | 'mobile'
  | 'data'
  | 'devops'
  | 'ai_ml'
  | 'security'
  | 'other';

export interface JobSearchParams {
  keywords: string[];
  location?: string;
  experience_min?: number;
  experience_max?: number;
  job_category?: JobCategory;
  sources?: JobSource[];
  limit?: number;
  auto_save?: boolean;
}

export type JobSourceResultCount = Partial<Record<JobSource, number>>;

export interface JobSearchResult {
  total: number;
  jobs: JobPosting[];
  sources_searched: JobSource[];
  search_meta: {
    query_time_ms: number;
    cached: boolean;
    auto_saved: boolean;
    search_mode: JobSearchMode;
    sources_result_count: JobSourceResultCount;
  };
}
