import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { loadEnv } from './core/utils.js';

async function main() {
  loadEnv();

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('job-hunting-mcp 서버가 시작되었습니다.');
}

main().catch((error) => {
  console.error('서버 시작 실패:', error);
  process.exit(1);
});
