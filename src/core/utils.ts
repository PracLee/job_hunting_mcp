import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

export function loadEnv(): void {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    const content = fs.readFileSync(envPath, 'utf-8');
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
