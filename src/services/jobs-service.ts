import { JobRepository } from '../db/repositories/job-repository.js';
import { normalizeJobText } from '../core/job-normalizer.js';
import { WantedAdapter } from '../adapters/wanted-adapter.js';
import { SaraminAdapter } from '../adapters/saramin-adapter.js';
import { JobkoreaAdapter } from '../adapters/jobkorea-adapter.js';
import { JumpitAdapter } from '../adapters/jumpit-adapter.js';
import { GroupbyAdapter } from '../adapters/groupby-adapter.js';
import { RememberAdapter } from '../adapters/remember-adapter.js';
import type { SourceAdapter } from '../adapters/base-adapter.js';
import type { JobPosting, JobSource, JobCategory } from '../types/job.js';
import { rankAndDedupeJobs } from '../core/job-rank.js';

export interface SearchJobsParams {
  keywords: string[];
  location?: string;
  experience_min?: number;
  experience_max?: number;
  job_category?: JobCategory;
  sources?: JobSource[];
  limit?: number;
  search_mode?: 'online' | 'local' | 'both';
}

export interface GetJobDetailParams {
  job_id: string;
}

export interface AddJobParams {
  company_name: string;
  job_title: string;
  url?: string;
  raw_text: string;
  source?: JobSource;
}

export class JobsService {
  private readonly jobRepo = new JobRepository();

  private readonly adapters: Record<string, SourceAdapter> = {
    wanted: new WantedAdapter(),
    saramin: new SaraminAdapter(),
    jobkorea: new JobkoreaAdapter(),
    jumpit: new JumpitAdapter(),
    groupby: new GroupbyAdapter(),
    remember: new RememberAdapter(),
  };

  async searchJobs(params: SearchJobsParams) {
    const startTime = Date.now();
    const allJobs: JobPosting[] = [];
    const sourcesSearched: JobSource[] = [];
    const warnings: string[] = [];
    const requestedSources = this.resolveRequestedSources(params.sources);

    if (params.search_mode !== 'online') {
      const localJobs = this.jobRepo.search({
        keywords: params.keywords,
        location: params.location,
        experience_min: params.experience_min,
        experience_max: params.experience_max,
        job_category: params.job_category,
        sources: params.sources as any,
        limit: params.limit,
      });
      allJobs.push(...localJobs);
      for (const source of new Set(localJobs.map(job => job.source))) {
        if (!sourcesSearched.includes(source)) sourcesSearched.push(source);
      }
    }

    if (params.search_mode !== 'local') {
      const searchParams = {
        keywords: params.keywords,
        location: params.location,
        experience_min: params.experience_min,
        experience_max: params.experience_max,
        job_category: params.job_category,
        limit: params.limit,
      };

      const existingIds = new Set(allJobs.map(job => `${job.source}:${job.source_id}`));

      await Promise.all(requestedSources.map(async source => {
        const adapter = this.adapters[source];
        if (!adapter) {
          warnings.push(`지원하지 않는 소스: ${source}`);
          return;
        }
        if (!adapter.isAvailable()) {
          warnings.push(`${source}: API 키가 설정되지 않았습니다. 환경변수를 확인하세요.`);
          return;
        }

        try {
          const onlineJobs = await adapter.search(searchParams);

          for (const job of onlineJobs) {
            const key = `${job.source}:${job.source_id}`;
            if (existingIds.has(key)) continue;

            const existing = this.jobRepo.findBySourceId(job.source as JobSource, job.source_id);
            if (!existing) {
              this.jobRepo.save(job);
            }
            allJobs.push(job);
            existingIds.add(key);
          }

          if (!sourcesSearched.includes(source as JobSource)) {
            sourcesSearched.push(source as JobSource);
          }
        } catch (error) {
          warnings.push(`${source} 검색 실패: ${error instanceof Error ? error.message : String(error)}`);
        }
      }));
    }

    const queryTime = Date.now() - startTime;
    const limit = params.limit ?? 20;
    const limitedJobs = rankAndDedupeJobs(allJobs, params.keywords, limit);

    return {
      total: limitedJobs.length,
      jobs: limitedJobs.map(job => ({
        id: job.id,
        source: job.source,
        company_name: job.company_name,
        job_title: job.job_title,
        location: job.location,
        required_skills: job.required_skills,
        experience: job.experience_min !== null ? `${job.experience_min}${job.experience_max ? `~${job.experience_max}` : '+'}년` : '무관',
        url: job.url,
        ...(job.also_on && job.also_on.length > 0 ? { also_on: job.also_on } : {}),
      })),
      sources_searched: sourcesSearched,
      search_meta: { query_time_ms: queryTime, cached: params.search_mode === 'local' },
      warnings,
      tip: 'jobs_get_detail로 상세 정보를 확인하거나, match_score_job으로 적합도를 분석하세요.',
      system_advice: '[시스템 경고] 이 목록에 없는 회사를 절대로 지어내서 추천하지 마세요. 결과가 0건이면 없다고 답해야 합니다.',
    };
  }

  private resolveRequestedSources(sources?: JobSource[]): string[] {
    if (sources && sources.length > 0) {
      return sources;
    }

    return Object.values(this.adapters)
      .filter(adapter => adapter.isAvailable())
      .map(adapter => adapter.source);
  }

  async getJobDetail(params: GetJobDetailParams) {
    if (params.job_id.startsWith('http')) {
      const urlPatterns: { pattern: RegExp; source: string; extractId: (match: RegExpMatchArray) => string }[] = [
        { pattern: /wanted\.co\.kr\/wd\/(\d+)/, source: 'wanted', extractId: match => match[1] },
        { pattern: /saramin\.co\.kr.*rec_idx=(\d+)/, source: 'saramin', extractId: match => match[1] },
        { pattern: /jobkorea\.co\.kr.*\/(\d+)/, source: 'jobkorea', extractId: match => match[1] },
        { pattern: /jumpit\.co\.kr\/position\/(\d+)/, source: 'jumpit', extractId: match => match[1] },
        { pattern: /groupby\.kr\/positions\/(\d+)/, source: 'groupby', extractId: match => match[1] },
        { pattern: /career\.rememberapp\.co\.kr\/job\/postings\/(\d+)/, source: 'remember', extractId: match => match[1] },
      ];

      for (const { pattern, source, extractId } of urlPatterns) {
        const urlMatch = params.job_id.match(pattern);
        if (!urlMatch) continue;

        const adapter = this.adapters[source];
        if (!adapter?.isAvailable()) continue;

        const detail = await adapter.fetchDetail(extractId(urlMatch));
        if (detail) {
          const existing = this.jobRepo.findBySourceId(source as JobSource, detail.source_id);
          if (!existing) this.jobRepo.save(detail);
          return detail;
        }
      }

      throw new Error('해당 URL의 공고를 가져올 수 없습니다.');
    }

    const job = this.jobRepo.findById(params.job_id);
    if (!job) {
      throw new Error(`공고를 찾을 수 없습니다: ${params.job_id}`);
    }

    if (job.raw_text === '' && job.source_id) {
      const adapter = this.adapters[job.source];
      if (adapter?.isAvailable()) {
        const detail = await adapter.fetchDetail(job.source_id);
        if (detail) {
          return detail;
        }
      }
    }

    return job;
  }

  async addJob(params: AddJobParams) {
    const normalized = normalizeJobText(params.raw_text, params.job_title);

    const job = this.jobRepo.save({
      source: (params.source || 'wanted') as JobSource,
      source_id: Date.now().toString(),
      company_name: params.company_name,
      job_title: params.job_title,
      job_category: normalized.job_category,
      experience_min: normalized.experience_min,
      experience_max: normalized.experience_max,
      employment_type: normalized.employment_type,
      location: normalized.location,
      salary_text: normalized.salary_text,
      required_skills: normalized.required_skills,
      preferred_skills: normalized.preferred_skills,
      responsibilities: normalized.responsibilities,
      qualifications: normalized.qualifications,
      preferences: normalized.preferences,
      deadline: normalized.deadline,
      url: params.url || '',
      raw_text: params.raw_text,
      fetched_at: new Date().toISOString(),
    });

    return {
      message: '공고가 정규화되어 저장되었습니다.',
      job_id: job.id,
      normalized: {
        job_category: normalized.job_category,
        experience: normalized.experience_min !== null
          ? `${normalized.experience_min}${normalized.experience_max ? `~${normalized.experience_max}` : '+'}년`
          : '명시 안 됨',
        location: normalized.location || '명시 안 됨',
        employment_type: normalized.employment_type,
        required_skills: normalized.required_skills,
        preferred_skills: normalized.preferred_skills,
        responsibilities_count: normalized.responsibilities.length,
        qualifications_count: normalized.qualifications.length,
        preferences_count: normalized.preferences.length,
      },
      next_steps: [
        'match_score_job으로 이 공고와의 적합도를 확인하세요.',
        'resume_tailor로 이 공고에 맞는 서류를 생성하세요.',
      ],
    };
  }
}
