/**
 * 이력서에서 자격증/수료 목록 파싱
 */

export function parseCertifications(text: string): string[] {
  if (!text) return [];
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2 && l.length < 100)
    .map(l => l.replace(/^\d+[.)]\s*/, '').replace(/^[-•·]\s*/, '').trim())
    .filter(Boolean);
}
