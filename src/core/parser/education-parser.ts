/**
 * 이력서에서 학력 정보 파싱
 */

import type { Education } from '../../types/profile.js';

function extractDegree(text: string): string {
  if (/박사|Ph\.?D/i.test(text)) return '박사';
  if (/석사|Master/i.test(text)) return '석사';
  return '학사';
}

export function parseEducation(text: string): Education[] {
  if (!text) return [];

  const educations: Education[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const schoolMatch = trimmed.match(
      /([가-힣A-Za-z]+(?:대학교?|University|College|학원|고등학교)(?:\([\w]+\))?)/
    );
    if (!schoolMatch) continue;

    const school = schoolMatch[1].replace(/\(.*?\)/, '').trim();
    const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 4)).join(' ');

    const major = context.match(/([가-힣]+(?:학과|학부|전공|공학))/)?.[1]?.trim() || '';
    const degree = extractDegree(context);
    const allYears = [...context.matchAll(/(\d{4})/g)].map(m => parseInt(m[1]));
    const year = allYears.length >= 2 ? allYears[allYears.length - 1] : (allYears[0] || 0);

    if (!educations.find(e => e.school === school)) {
      educations.push({ school, major, degree, year });
    }
  }

  return educations;
}
