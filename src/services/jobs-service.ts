import { JobRepository } from '../db/repositories/job-repository.js';
import { normalizeJobText } from '../core/job-normalizer.js';
import { WantedAdapter } from '../adapters/wanted-adapter.js';
import { SaraminAdapter } from '../adapters/saramin-adapter.js';
import { JobkoreaAdapter } from '../adapters/jobkorea-adapter.js';
import { JumpitAdapter } from '../adapters/jumpit-adapter.js';
import { GroupbyAdapter } from '../adapters/groupby-adapter.js';
import { RememberAdapter } from '../adapters/remember-adapter.js';
import type { SourceAdapter, SourceSearchResult } from '../adapters/base-adapter.js';
import type { JobPosting, JobSource, JobCategory, JobSearchMode, JobSourceResultCount } from '../types/job.js';
import { rankAndDedupeJobs } from '../core/job-rank.js';

export interface SearchJobsParams {
  keywords: string[];
  location?: string;
  experience_min?: number;
  experience_max?: number;
  job_category?: JobCategory;
  sources?: JobSource[];
  limit?: number;
  search_mode?: JobSearchMode;
  auto_save?: boolean;
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
    const warnings: string[] = [];
    const jobsByKey = new Map<string, JobPosting>();
    const sourcesSearched = new Set<JobSource>();
    const zeroResultReasons = new Map<JobSource, string>();
    const requestedSources = this.resolveRequestedSources(params.sources);
    const autoSave = params.auto_save ?? true;

    if (params.search_mode !== 'online') {
      if (params.sources && params.sources.length > 0) {
        params.sources.forEach(source => sourcesSearched.add(source));
      }

      const localJobs = this.jobRepo.search({
        keywords: params.keywords,
        location: params.location,
        experience_min: params.experience_min,
        experience_max: params.experience_max,
        job_category: params.job_category,
        sources: params.sources as any,
        limit: params.limit,
      });
      localJobs.forEach(job => this.upsertSearchJob(jobsByKey, job));
      if (!params.sources || params.sources.length === 0) {
        localJobs.forEach(job => sourcesSearched.add(job.source));
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

      await Promise.all(requestedSources.map(async source => {
        const adapter = this.adapters[source];
        sourcesSearched.add(source as JobSource);

        if (!adapter) {
          this.pushWarning(warnings, `지원하지 않는 소스: ${source}`);
          zeroResultReasons.set(source as JobSource, '지원하지 않는 소스입니다.');
          return;
        }
        if (!adapter.isAvailable()) {
          zeroResultReasons.set(source as JobSource, 'API 키가 설정되지 않았습니다. 환경변수를 확인하세요.');
          this.pushWarning(warnings, `${source}: API 키가 설정되지 않았습니다. 환경변수를 확인하세요.`);
          return;
        }

        try {
          const { jobs: onlineJobs, warnings: sourceWarnings = [] } = await this.searchSource(adapter, searchParams);
          sourceWarnings.forEach(warning => this.pushWarning(warnings, this.prefixSourceWarning(source as JobSource, warning)));

          if (onlineJobs.length === 0 && sourceWarnings.length === 0) {
            zeroResultReasons.set(source as JobSource, '검색어와 매칭되는 공고 없음');
          }

          for (const job of onlineJobs) {
            const persistedJob = autoSave ? this.jobRepo.save(job) : job;
            this.upsertSearchJob(jobsByKey, persistedJob);
          }
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          zeroResultReasons.set(source as JobSource, `검색 실패 - ${reason}`);
          this.pushWarning(warnings, `${source} 검색 실패: ${reason}`);
        }
      }));
    }

    const queryTime = Date.now() - startTime;
    const limit = params.limit ?? 20;
    const limitedJobs = rankAndDedupeJobs(Array.from(jobsByKey.values()), params.keywords, limit);
    const sourcesResultCount = this.buildSourceResultCount(limitedJobs, params, requestedSources);
    this.addZeroResultWarnings(warnings, sourcesResultCount, zeroResultReasons, params, requestedSources);
    const autoSaved = autoSave && params.search_mode !== 'local';
    const canScoreImmediately = autoSaved || params.search_mode === 'local';

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
      sources_searched: Array.from(sourcesSearched),
      search_meta: {
        query_time_ms: queryTime,
        cached: params.search_mode === 'local',
        auto_saved: autoSaved,
        search_mode: params.search_mode || 'both',
        sources_result_count: sourcesResultCount,
      },
      warnings,
      tip: canScoreImmediately
        ? '반환된 job_id로 match_score_job을 바로 호출할 수 있습니다. 공고 정보가 얕으면 jobs_get_detail로 상세 정보를 보완하세요.'
        : 'auto_save=false 상태입니다. 이 공고를 분석하려면 jobs_add로 저장하거나 jobs_search에서 auto_save를 true로 사용하세요.',
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
          return this.jobRepo.save(detail);
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
          return this.jobRepo.save({ ...detail, id: job.id });
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

  private async searchSource(adapter: SourceAdapter, params: Omit<SearchJobsParams, 'sources' | 'search_mode' | 'auto_save'>): Promise<SourceSearchResult> {
    if (adapter.searchWithMeta) {
      return adapter.searchWithMeta(params);
    }

    return {
      jobs: await adapter.search(params),
      warnings: [],
    };
  }

  private upsertSearchJob(jobsByKey: Map<string, JobPosting>, job: JobPosting): void {
    const key = this.toJobKey(job);
    const existing = jobsByKey.get(key);
    if (!existing) {
      jobsByKey.set(key, job);
      return;
    }

    jobsByKey.set(key, this.pickRicherJob(existing, job));
  }

  private pickRicherJob(current: JobPosting, incoming: JobPosting): JobPosting {
    const currentDepth = this.jobDepthScore(current);
    const incomingDepth = this.jobDepthScore(incoming);

    if (incomingDepth !== currentDepth) {
      return incomingDepth > currentDepth ? incoming : current;
    }

    return incoming.fetched_at >= current.fetched_at ? incoming : current;
  }

  private jobDepthScore(job: JobPosting): number {
    return (
      job.raw_text.length
      + job.required_skills.length * 8
      + job.preferred_skills.length * 6
      + job.responsibilities.length * 5
      + job.qualifications.length * 5
      + job.preferences.length * 4
    );
  }

  private buildSourceResultCount(
    rankedJobs: JobPosting[],
    params: SearchJobsParams,
    requestedSources: string[],
  ): JobSourceResultCount {
    const counts: JobSourceResultCount = {};
    const sources = this.resolveDiagnosticSources(rankedJobs, params, requestedSources);

    sources.forEach(source => {
      counts[source] = 0;
    });

    rankedJobs.forEach(job => {
      counts[job.source] = (counts[job.source] || 0) + 1;
    });

    return counts;
  }

  private resolveDiagnosticSources(
    rankedJobs: JobPosting[],
    params: SearchJobsParams,
    requestedSources: string[],
  ): JobSource[] {
    const sources = new Set<JobSource>();

    if (params.sources && params.sources.length > 0) {
      params.sources.forEach(source => sources.add(source));
    } else {
      requestedSources.forEach(source => sources.add(source as JobSource));
      rankedJobs.forEach(job => sources.add(job.source));
    }

    return Array.from(sources);
  }

  private addZeroResultWarnings(
    warnings: string[],
    sourcesResultCount: JobSourceResultCount,
    zeroResultReasons: Map<JobSource, string>,
    params: SearchJobsParams,
    requestedSources: string[],
  ): void {
    const sources = this.resolveDiagnosticSources([], params, requestedSources);

    for (const source of sources) {
      if ((sourcesResultCount[source] || 0) > 0) continue;

      const fallbackReason = params.search_mode === 'local'
        ? '저장된 공고 없음'
        : '검색어와 매칭되는 공고 없음';
      this.pushWarning(warnings, `${source}: ${zeroResultReasons.get(source) || fallbackReason}`);
    }
  }

  private prefixSourceWarning(source: JobSource, warning: string): string {
    return warning.startsWith(`${source}:`) ? warning : `${source}: ${warning}`;
  }

  private pushWarning(warnings: string[], warning: string): void {
    if (!warnings.includes(warning)) {
      warnings.push(warning);
    }
  }

  private toJobKey(job: JobPosting): string {
    return `${job.source}:${job.source_id}`;
  }
}
