import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CompanyService } from '../../services/company-service.js';

export function registerCompanyTools(server: McpServer): void {
  const companyService = new CompanyService();

  server.tool(
    'company_analyze',
    '기업의 재무 추이(매출·영업이익·부채비율)와 최근 뉴스를 분석해 성장성(GROWING/STABLE/DECLINING)을 평가합니다. DART 공시 데이터 기반으로 국내 상장/비상장 기업 및 국내 입점 외국계 기업을 지원합니다.',
    {
      company_name: z.string().describe('분석할 회사명 (예: "카카오", "삼성전자", "토스")'),
      include_news: z.boolean().optional().default(true).describe('네이버 뉴스 분석 포함 여부 (기본: true)'),
      news_days: z.number().optional().default(90).describe('뉴스 검색 기간 (일, 기본: 90일)'),
    },
    async params => {
      try {
        const result = await companyService.analyzeCompany(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: message.trim().startsWith('{') ? message : `분석 실패: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
