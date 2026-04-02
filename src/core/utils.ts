import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

export function loadEnv(): void {
  try {
    // Claude Desktop 등 외부 클라이언트에서 실행 시 process.cwd()가
    // 프로젝트 디렉토리가 아닐 수 있으므로 스크립트 위치 기준으로 탐색
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const projectRoot = path.resolve(__dirname, '../../'); // dist/core/ → root
    const candidates = [
      path.resolve(projectRoot, '.env'),
      path.resolve(process.cwd(), '.env'),
    ];

    let content: string | null = null;
    for (const envPath of candidates) {
      if (fs.existsSync(envPath)) {
        content = fs.readFileSync(envPath, 'utf-8');
        break;
      }
    }
    if (!content) return;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env 파일 없으면 무시
  }
}
