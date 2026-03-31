import express from 'express';
import cors from 'cors';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from './server.js';
import { loadEnv } from './core/utils.js';

async function main() {
  loadEnv();

  const app = express();
  app.use(cors());

  // MCP 서버 및 전송 계층 생성
  const server = createServer();
  let transport: SSEServerTransport | null = null;

  // SSE 엔드포인트: 클라이언트가 연결(구독)하는 곳
  app.get('/sse', async (req, res) => {
    transport = new SSEServerTransport('/message', res as any);
    await server.connect(transport);
    console.log('🔗 클라이언트가 /sse 엔드포인트에 접속했습니다.');
  });

  // Message 엔드포인트: 클라이언트가 요청(Tool Call 등)을 보내는 곳
  app.post('/message', async (req, res) => {
    if (!transport) {
      return res.status(400).send('에러: /sse에 먼저 접속해야 합니다.');
    }
    await transport.handlePostMessage(req, res as any);
  });

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 job-hunting-mcp SSE 서버가 실행되었습니다!`);
    console.log(`👉 SSE 엔드포인트: http://localhost:${PORT}/sse`);
    console.log(`👉 메시지 엔드포인트: POST http://localhost:${PORT}/message`);
    console.log(`\nGemini/Claude 등 다른 원격 클라이언트에서 위 /sse 주소를 등록하여 사용할 수 있습니다.`);
  });
}

main().catch((error) => {
  console.error('서버 시작 실패:', error);
  process.exit(1);
});
