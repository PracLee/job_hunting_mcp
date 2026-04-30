import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { MatchService } from '../../services/match-service.js';

export function registerMatchTools(server: McpServer): void {
  const matchService = new MatchService();

  server.tool(
    'match_score_job',
    '사용자 프로필과 채용공고의 적합도를 분석합니다. 5가지 차원의 점수와 강점/약점/서류 강조 포인트를 반환합니다.',
    {
      job_id: z.string().describe('채용공고 ID'),
      profile_id: z.string().optional().describe('프로필 ID (없으면 최근 프로필 사용)'),
    },
    async params => {
      try {
        const result = await matchService.scoreJob(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `매칭 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'match_rank_jobs',
    '여러 채용공고를 적합도 순으로 랭킹합니다.',
    {
      job_ids: z.array(z.string()).describe('채용공고 ID 목록'),
      profile_id: z.string().optional().describe('프로필 ID'),
      top_k: z.number().optional().default(10),
    },
    async params => {
      try {
        const result = matchService.rankJobs(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `랭킹 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
