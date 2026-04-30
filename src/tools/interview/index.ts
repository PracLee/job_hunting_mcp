import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { InterviewService } from '../../services/interview-service.js';

export function registerInterviewTools(server: McpServer): void {
  const interviewService = new InterviewService();

  server.tool(
    'interview_prepare',
    '채용공고와 사용자 경력을 기반으로 면접 예상 질문과 답변 포인트를 생성합니다.',
    {
      job_id: z.string().describe('채용공고 ID'),
      profile_id: z.string().optional().describe('프로필 ID'),
      question_types: z.array(z.enum(['technical', 'experience', 'behavioral', 'culture_fit', 'system_design']))
        .optional().default(['technical', 'experience']),
      count: z.number().optional().default(10).describe('질문 수'),
    },
    async params => {
      try {
        const result = await interviewService.prepareInterview(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `면접 준비 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
