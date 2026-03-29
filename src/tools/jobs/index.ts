import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { JobRepository } from '../../db/repositories/job-repository.js';
import { normalizeJobText } from '../../core/job-normalizer.js';
import { WantedAdapter } from '../../adapters/wanted-adapter.js';
import { SaraminAdapter } from '../../adapters/saramin-adapter.js';
import { JobkoreaAdapter } from '../../adapters/jobkorea-adapter.js';
import { JumpitAdapter } from '../../adapters/jumpit-adapter.js';
import type { SourceAdapter } from '../../adapters/base-adapter.js';
import type { JobPosting, JobSource } from '../../types/job.js';

export function registerJobTools(server: McpServer): void {
  const jobRepo = new JobRepository();

  // 어댑터 레지스트리
  const adapters: Record<string, SourceAdapter> = {
    wanted: new WantedAdapter(),
    saramin: new SaraminAdapter(),
    jobkorea: new JobkoreaAdapter(),
    jumpit: new JumpitAdapter(),
  };

  server.tool(
    'jobs_search',
    '채용공고를 키워드/조건으로 검색합니다. 원티드 실시간 검색 또는 저장된 공고에서 검색합니다.',
    {
      keywords: z.array(z.string()).describe('검색 키워드 (예: ["Java", "백엔드"])'),
      location: z.string().optional().describe('근무지 (예: "서울")'),
      experience_min: z.number().optional().describe('최소 경력 연차'),
      experience_max: z.number().optional().describe('최대 경력 연차'),
      job_category: z.enum(['backend', 'frontend', 'fullstack', 'mobile', 'data', 'devops', 'ai_ml', 'security', 'other']).optional(),
      sources: z.array(z.enum(['wanted', 'saramin', 'jobkorea', 'jumpit', 'rocketpunch'])).optional().default(['wanted']),
      limit: z.number().optional().default(20),
      search_mode: z.enum(['online', 'local', 'both']).optional().default('both')
        .describe('online: 원티드 실시간 검색, local: 저장된 공고만, both: 둘 다'),
    },
    async (params) => {
      try {
        const startTime = Date.now();
        const allJobs: JobPosting[] = [];
        const sourcesSearched: JobSource[] = [];
        const warnings: string[] = [];

        // 1. 로컬 DB 검색
        if (params.search_mode !== 'online') {
          const localJobs = jobRepo.search({
            keywords: params.keywords,
            location: params.location,
            experience_min: params.experience_min,
            experience_max: params.experience_max,
            job_category: params.job_category,
            sources: params.sources as any,
            limit: params.limit,
          });
          allJobs.push(...localJobs);
          if (localJobs.length > 0) sourcesSearched.push('wanted');
        }

        // 2. 온라인 검색 (지원되는 모든 소스)
        if (params.search_mode !== 'local') {
          const searchParams = {
            keywords: params.keywords,
            location: params.location,
            experience_min: params.experience_min,
            experience_max: params.experience_max,
            job_category: params.job_category,
            limit: params.limit,
          };

          const existingIds = new Set(allJobs.map(j => `${j.source}:${j.source_id}`));

          // 요청된 소스별로 병렬 검색
          const requestedSources = (params.sources || ['wanted']) as string[];
          const searchPromises = requestedSources.map(async (source) => {
            const adapter = adapters[source];
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
                if (!existingIds.has(key)) {
                  // DB에 캐싱
                  const existing = jobRepo.findBySourceId(job.source as JobSource, job.source_id);
                  if (!existing) {
                    jobRepo.save(job);
                  }
                  allJobs.push(job);
                  existingIds.add(key);
                }
              }

              if (!sourcesSearched.includes(source as JobSource)) {
                sourcesSearched.push(source as JobSource);
              }
            } catch (error) {
              warnings.push(`${source} 검색 실패: ${error instanceof Error ? error.message : String(error)}`);
            }
          });

          await Promise.all(searchPromises);
        }

        const queryTime = Date.now() - startTime;
        const limitedJobs = allJobs.slice(0, params.limit);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              total: limitedJobs.length,
              jobs: limitedJobs.map(j => ({
                id: j.id,
                company_name: j.company_name,
                job_title: j.job_title,
                location: j.location,
                required_skills: j.required_skills,
                experience: j.experience_min !== null ? `${j.experience_min}${j.experience_max ? '~' + j.experience_max : '+'}년` : '무관',
                url: j.url,
              })),
              sources_searched: sourcesSearched,
              search_meta: { query_time_ms: queryTime, cached: params.search_mode === 'local' },
              warnings,
              tip: 'jobs_get_detail로 상세 정보를 확인하거나, match_score_job으로 적합도를 분석하세요.',
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `검색 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'jobs_get_detail',
    '특정 채용공고의 상세 정보를 조회합니다. 원티드 공고는 실시간 상세 정보를 가져옵니다.',
    {
      job_id: z.string().describe('채용공고 ID 또는 원티드 URL'),
    },
    async (params) => {
      try {
        // URL로 조회 시 — 소스별 URL 패턴 매칭
        if (params.job_id.startsWith('http')) {
          const urlPatterns: { pattern: RegExp; source: string; extractId: (m: RegExpMatchArray) => string }[] = [
            { pattern: /wanted\.co\.kr\/wd\/(\d+)/, source: 'wanted', extractId: m => m[1] },
            { pattern: /saramin\.co\.kr.*rec_idx=(\d+)/, source: 'saramin', extractId: m => m[1] },
            { pattern: /jobkorea\.co\.kr.*\/(\d+)/, source: 'jobkorea', extractId: m => m[1] },
            { pattern: /jumpit\.co\.kr\/position\/(\d+)/, source: 'jumpit', extractId: m => m[1] },
          ];

          for (const { pattern, source, extractId } of urlPatterns) {
            const urlMatch = params.job_id.match(pattern);
            if (urlMatch) {
              const adapter = adapters[source];
              if (adapter?.isAvailable()) {
                const detail = await adapter.fetchDetail(extractId(urlMatch));
                if (detail) {
                  const existing = jobRepo.findBySourceId(source as JobSource, detail.source_id);
                  if (!existing) jobRepo.save(detail);
                  return { content: [{ type: 'text' as const, text: JSON.stringify(detail, null, 2) }] };
                }
              }
            }
          }
          return { content: [{ type: 'text' as const, text: '해당 URL의 공고를 가져올 수 없습니다.' }], isError: true };
        }

        // ID로 조회
        const job = jobRepo.findById(params.job_id);
        if (!job) {
          return { content: [{ type: 'text' as const, text: `공고를 찾을 수 없습니다: ${params.job_id}` }], isError: true };
        }

        // 상세 정보가 부족하면 원본 사이트에서 다시 가져오기
        if (job.raw_text === '' && job.source_id) {
          const adapter = adapters[job.source];
          if (adapter?.isAvailable()) {
            const detail = await adapter.fetchDetail(job.source_id);
            if (detail) {
              return { content: [{ type: 'text' as const, text: JSON.stringify(detail, null, 2) }] };
            }
          }
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(job, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `조회 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'jobs_add',
    '채용공고를 수동으로 추가합니다. 공고 텍스트를 붙여넣으면 자동으로 정규화하여 저장합니다.',
    {
      company_name: z.string().describe('회사명'),
      job_title: z.string().describe('채용 포지션명'),
      url: z.string().optional().describe('공고 URL'),
      raw_text: z.string().describe('공고 전체 텍스트 (복사 붙여넣기)'),
      source: z.enum(['wanted', 'saramin', 'jobkorea', 'jumpit', 'rocketpunch']).optional().default('wanted'),
    },
    async (params) => {
      try {
        // raw_text 자동 정규화
        const normalized = normalizeJobText(params.raw_text, params.job_title);

        const job = jobRepo.save({
          source: params.source as JobSource,
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
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: '공고가 정규화되어 저장되었습니다.',
              job_id: job.id,
              normalized: {
                job_category: normalized.job_category,
                experience: normalized.experience_min !== null
                  ? `${normalized.experience_min}${normalized.experience_max ? '~' + normalized.experience_max : '+'}년`
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
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `저장 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
