import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { JobRepository } from '../../db/repositories/job-repository.js';
import { normalizeJobText } from '../../core/job-normalizer.js';
import { WantedAdapter } from '../../adapters/wanted-adapter.js';
import type { JobPosting, JobSource } from '../../types/job.js';

export function registerJobTools(server: McpServer): void {
  const jobRepo = new JobRepository();
  const wantedAdapter = new WantedAdapter();

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

        // 2. 온라인 검색 (원티드)
        if (params.search_mode !== 'local' && params.sources?.includes('wanted')) {
          try {
            const onlineJobs = await wantedAdapter.search({
              keywords: params.keywords,
              location: params.location,
              experience_min: params.experience_min,
              experience_max: params.experience_max,
              job_category: params.job_category,
              limit: params.limit,
            });

            // 중복 제거 (source_id 기준)
            const existingIds = new Set(allJobs.map(j => j.source_id));
            for (const job of onlineJobs) {
              if (!existingIds.has(job.source_id)) {
                // DB에 캐싱
                const existing = jobRepo.findBySourceId('wanted', job.source_id);
                if (!existing) {
                  jobRepo.save(job);
                }
                allJobs.push(job);
                existingIds.add(job.source_id);
              }
            }

            if (!sourcesSearched.includes('wanted')) sourcesSearched.push('wanted');
          } catch (error) {
            warnings.push(`원티드 온라인 검색 실패: ${error instanceof Error ? error.message : String(error)}`);
          }
        }

        // 미지원 소스 안내
        const unsupported = (params.sources || []).filter(s => s !== 'wanted');
        if (unsupported.length > 0) {
          warnings.push(`아직 지원하지 않는 소스: ${unsupported.join(', ')} (향후 추가 예정)`);
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
        // URL로 조회 시
        if (params.job_id.startsWith('http')) {
          const wantedMatch = params.job_id.match(/wanted\.co\.kr\/wd\/(\d+)/);
          if (wantedMatch) {
            const detail = await wantedAdapter.fetchDetail(wantedMatch[1]);
            if (detail) {
              // DB에 저장
              const existing = jobRepo.findBySourceId('wanted', detail.source_id);
              if (!existing) {
                jobRepo.save(detail);
              }
              return { content: [{ type: 'text' as const, text: JSON.stringify(detail, null, 2) }] };
            }
          }
          return { content: [{ type: 'text' as const, text: '해당 URL의 공고를 가져올 수 없습니다.' }], isError: true };
        }

        // ID로 조회
        const job = jobRepo.findById(params.job_id);
        if (!job) {
          return { content: [{ type: 'text' as const, text: `공고를 찾을 수 없습니다: ${params.job_id}` }], isError: true };
        }

        // 상세 정보가 부족하면 원티드에서 다시 가져오기
        if (job.source === 'wanted' && job.raw_text === '' && job.source_id) {
          const detail = await wantedAdapter.fetchDetail(job.source_id);
          if (detail) {
            return { content: [{ type: 'text' as const, text: JSON.stringify(detail, null, 2) }] };
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
