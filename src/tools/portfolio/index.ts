import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PortfolioService } from '../../services/portfolio-service.js';

export function registerPortfolioTools(server: McpServer): void {
  const portfolioService = new PortfolioService();

  server.tool(
    'portfolio_reorder',
    '채용공고 기준으로 포트폴리오 프로젝트를 관련도 순으로 재배치합니다.',
    {
      job_id: z.string().describe('채용공고 ID'),
      profile_id: z.string().optional().describe('프로필 ID'),
    },
    async params => {
      try {
        const result = portfolioService.reorderPortfolio(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `재배치 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
