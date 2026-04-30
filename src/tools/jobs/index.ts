import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { JobsService } from '../../services/jobs-service.js';

export function registerJobTools(server: McpServer): void {
  const jobsService = new JobsService();

  server.tool(
    'jobs_search',
    '채용공고를 키워드/조건으로 검색합니다. [주의사항] 절대로 반환된 결과에 없는 공고를 지어내거나(Hallucination) 있는 공고를 없다고 하지 마세요. 오직 검색 결과로 반환된 JSON 데이터에만 의존하여 답변하세요.',
    {
      keywords: z.array(z.string()).describe('검색 키워드 (예: ["Java", "백엔드"])'),
      location: z.string().optional().describe('근무지 (예: "서울")'),
      experience_min: z.number().optional().describe('최소 경력 연차'),
      experience_max: z.number().optional().describe('최대 경력 연차'),
      job_category: z.enum(['backend', 'frontend', 'fullstack', 'mobile', 'data', 'devops', 'ai_ml', 'security', 'other']).optional(),
      sources: z.array(z.enum(['wanted', 'saramin', 'jobkorea', 'jumpit', 'groupby', 'remember'])).optional()
        .describe('검색 소스 목록. 생략하면 현재 사용 가능한 소스를 모두 검색합니다.'),
      limit: z.number().optional().default(20),
      search_mode: z.enum(['online', 'local', 'both']).optional().default('both')
        .describe('online: 원티드 실시간 검색, local: 저장된 공고만, both: 둘 다'),
      auto_save: z.boolean().optional().default(true)
        .describe('true면 온라인 검색 결과를 DB에 upsert하여 반환된 job_id로 바로 match_score_job을 호출할 수 있습니다.'),
    },
    async params => {
      try {
        const result = await jobsService.searchJobs(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `검색 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'jobs_get_detail',
    '특정 채용공고의 상세 정보를 조회합니다. [주의사항] 임의로 공고 내용을 지어내어 설명하지 마세요. 반드시 이 도구의 반환값에만 의존하여 답변하세요.',
    {
      job_id: z.string().describe('채용공고 ID 또는 원티드 URL'),
    },
    async params => {
      try {
        const result = await jobsService.getJobDetail(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'jobs_add',
    '채용공고를 수동으로 추가합니다. 공고 텍스트를 붙여넣으면 자동으로 정규화하여 저장합니다.',
    {
      company_name: z.string().describe('회사명'),
      job_title: z.string().describe('채용 포지션명'),
      url: z.string().optional().describe('공고 URL'),
      raw_text: z.string().describe('공고 전체 텍스트 (복사 붙여넣기)'),
      source: z.enum(['wanted', 'saramin', 'jobkorea', 'jumpit', 'groupby', 'remember']).optional().default('wanted'),
    },
    async params => {
      try {
        const result = await jobsService.addJob(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `저장 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
