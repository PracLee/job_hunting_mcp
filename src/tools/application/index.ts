import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApplicationService, STATUS_VALUES } from '../../services/application-service.js';

export function registerApplicationTools(server: McpServer): void {
  const applicationService = new ApplicationService();

  server.tool(
    'application_create',
    '채용공고에 대한 지원 기록을 생성합니다.',
    {
      job_id: z.string().describe('채용공고 ID'),
      profile_id: z.string().optional().describe('프로필 ID'),
      status: z.enum(STATUS_VALUES).optional().default('saved'),
      notes: z.string().optional().describe('메모'),
    },
    async params => {
      try {
        const result = applicationService.createApplication(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `생성 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'application_update_status',
    '지원 상태를 업데이트합니다.',
    {
      application_id: z.string().describe('지원 기록 ID'),
      new_status: z.enum(STATUS_VALUES).describe('새 상태'),
      notes: z.string().optional().describe('메모'),
    },
    async params => {
      try {
        const result = applicationService.updateApplicationStatus(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `업데이트 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'application_list',
    '지원 현황 목록을 조회합니다.',
    {
      profile_id: z.string().optional().describe('프로필 ID'),
      status_filter: z.enum(STATUS_VALUES).optional().describe('상태 필터'),
    },
    async params => {
      try {
        const result = applicationService.listApplications(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `조회 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
