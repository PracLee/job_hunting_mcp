import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CoverletterService } from '../../services/coverletter-service.js';

export function registerCoverletterTools(server: McpServer): void {
  const coverletterService = new CoverletterService();

  server.tool(
    'coverletter_brainstorm',
    '자기소개서 문항별로 소재와 아이디어를 추천합니다. 문항의 의도를 분석하고 기존 경험에서 연결 가능한 소재를 찾아줍니다.',
    {
      job_id: z.string().describe('채용공고 ID'),
      profile_id: z.string().optional().describe('프로필 ID'),
      questions: z.array(z.object({
        question_text: z.string().describe('자기소개서 문항'),
        max_length: z.number().optional().describe('글자수 제한'),
      })).describe('자기소개서 문항 목록'),
    },
    async params => {
      try {
        const result = await coverletterService.brainstorm(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `브레인스토밍 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'coverletter_generate',
    '자기소개서 초안을 생성합니다. 기존 경험을 기반으로 공고에 맞춘 자기소개서를 작성합니다.',
    {
      job_id: z.string().describe('채용공고 ID'),
      profile_id: z.string().optional().describe('프로필 ID'),
      question_text: z.string().describe('자기소개서 문항'),
      selected_themes: z.array(z.string()).optional().describe('brainstorm에서 선택한 소재'),
      max_length: z.number().optional().default(500).describe('글자수 제한'),
      tone: z.enum(['professional', 'passionate', 'humble']).optional().default('professional'),
    },
    async params => {
      try {
        const result = await coverletterService.generateDraft({
          job_id: params.job_id,
          profile_id: params.profile_id,
          question_text: params.question_text,
          selected_themes: params.selected_themes,
          max_length: params.max_length ?? 500,
          tone: params.tone ?? 'professional',
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `생성 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
