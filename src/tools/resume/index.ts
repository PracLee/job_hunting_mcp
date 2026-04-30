import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ResumeService } from '../../services/resume-service.js';

export function registerResumeTools(server: McpServer): void {
  const resumeService = new ResumeService();

  server.tool(
    'resume_tailor',
    '특정 채용공고에 맞춰 경력기술서를 맞춤화합니다. 기존 경험을 공고 요구사항에 맞게 재구성합니다.',
    {
      job_id: z.string().describe('채용공고 ID'),
      profile_id: z.string().optional().describe('프로필 ID'),
      style: z.enum(['concise', 'detailed']).optional().default('detailed'),
    },
    async params => {
      try {
        const result = await resumeService.tailorResume(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `맞춤화 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'resume_export',
    '마스터 프로필을 특정 채용사이트 양식에 맞게 변환합니다. LLM 없이도 동작하며, 복사해서 바로 붙여넣을 수 있는 텍스트를 생성합니다.',
    {
      profile_id: z.string().optional().describe('프로필 ID'),
      target_platform: z.enum(['wanted', 'saramin', 'jobkorea', 'jumpit', 'groupby', 'general']).describe('출력 대상 플랫폼'),
      job_id: z.string().optional().describe('특정 공고에 맞춤화할 경우'),
      enhance_with_llm: z.boolean().optional().default(false).describe('LLM으로 문장을 보강할지 여부'),
    },
    async params => {
      try {
        const result = await resumeService.exportResume(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `변환 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
