import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { JobRepository } from '../../db/repositories/job-repository.js';

export function registerJobTools(server: McpServer): void {
  const jobRepo = new JobRepository();

  server.tool(
    'jobs_search',
    '채용공고를 키워드/조건으로 검색합니다. 여러 채용 사이트의 공고를 통합 검색하여 정규화된 형태로 반환합니다.',
    {
      keywords: z.array(z.string()).describe('검색 키워드 (예: ["Java", "백엔드"])'),
      location: z.string().optional().describe('근무지 (예: "서울")'),
      experience_min: z.number().optional().describe('최소 경력 연차'),
      experience_max: z.number().optional().describe('최대 경력 연차'),
      job_category: z.enum(['backend', 'frontend', 'fullstack', 'mobile', 'data', 'devops', 'ai_ml', 'security', 'other']).optional(),
      sources: z.array(z.enum(['wanted', 'saramin', 'jobkorea', 'jumpit', 'rocketpunch'])).optional().default(['wanted']),
      limit: z.number().optional().default(20),
    },
    async (params) => {
      try {
        // MVP: DB에서 캐싱된 공고 검색 + 향후 어댑터 연동
        const jobs = jobRepo.search({
          keywords: params.keywords,
          location: params.location,
          experience_min: params.experience_min,
          experience_max: params.experience_max,
          job_category: params.job_category,
          sources: params.sources as any,
          limit: params.limit,
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              total: jobs.length,
              jobs,
              sources_searched: params.sources,
              search_meta: { query_time_ms: 0, cached: true },
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
    '특정 채용공고의 상세 정보를 조회합니다.',
    {
      job_id: z.string().describe('채용공고 ID'),
    },
    async (params) => {
      try {
        const job = jobRepo.findById(params.job_id);
        if (!job) {
          return {
            content: [{ type: 'text' as const, text: `공고를 찾을 수 없습니다: ${params.job_id}` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(job, null, 2) }],
        };
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
    '채용공고를 수동으로 추가합니다. URL이나 텍스트를 붙여넣으면 정규화하여 저장합니다.',
    {
      company_name: z.string().describe('회사명'),
      job_title: z.string().describe('채용 포지션명'),
      url: z.string().optional().describe('공고 URL'),
      raw_text: z.string().describe('공고 전체 텍스트 (복사 붙여넣기)'),
      source: z.enum(['wanted', 'saramin', 'jobkorea', 'jumpit', 'rocketpunch']).optional().default('wanted'),
    },
    async (params) => {
      try {
        const { extractSkills } = await import('../../core/tech-dictionary.js');

        // raw_text에서 기술스택 자동 추출
        const allSkills = extractSkills(params.raw_text);

        const job = jobRepo.save({
          source: params.source as any,
          source_id: Date.now().toString(),
          company_name: params.company_name,
          job_title: params.job_title,
          job_category: 'other',
          experience_min: null,
          experience_max: null,
          employment_type: '정규직',
          location: '',
          salary_text: null,
          required_skills: allSkills,
          preferred_skills: [],
          responsibilities: [],
          qualifications: [],
          preferences: [],
          deadline: null,
          url: params.url || '',
          raw_text: params.raw_text,
          fetched_at: new Date().toISOString(),
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: '공고가 저장되었습니다.',
              job_id: job.id,
              extracted_skills: allSkills,
              tip: 'jobs_get_detail로 상세 조회하거나, match_score_job으로 적합도를 확인하세요.',
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
