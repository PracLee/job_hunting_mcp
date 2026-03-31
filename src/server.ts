import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerJobTools } from './tools/jobs/index.js';
import { registerProfileTools } from './tools/profile/index.js';
import { registerMatchTools } from './tools/match/index.js';
import { registerResumeTools } from './tools/resume/index.js';
import { registerCoverletterTools } from './tools/coverletter/index.js';
import { registerPortfolioTools } from './tools/portfolio/index.js';
import { registerApplicationTools } from './tools/application/index.js';
import { registerInterviewTools } from './tools/interview/index.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'Job-Hunting-Pro',
    version: '1.0.0',
  });

  // Tool 등록
  registerJobTools(server);
  registerProfileTools(server);
  registerMatchTools(server);
  registerResumeTools(server);
  registerCoverletterTools(server);
  registerPortfolioTools(server);
  registerApplicationTools(server);
  registerInterviewTools(server);

  return server;
}
