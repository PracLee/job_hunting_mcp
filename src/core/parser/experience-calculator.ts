/**
 * 이력서 텍스트에서 총 경력 연차/개월 수 계산
 */

export function calculateExperience(text: string): { years: number; months: number } {
  // 1순위: "총 3년 10개월" 형태
  const totalMatch = text.match(/총\s*(\d+)\s*년\s*(\d+)\s*개월/);
  if (totalMatch) {
    const y = parseInt(totalMatch[1]);
    const m = parseInt(totalMatch[2]);
    return { years: y + m / 12, months: y * 12 + m };
  }

  // 2순위: "경력 3년" / "총 경력: 44개월" 등
  const directMatch = text.match(/(?:(?:총\s*)?경력|Experience)\s*[:：]?\s*(?:총\s*)?(?:(\d+)\s*년)?\s*(?:(\d+)\s*개월)?/);
  if (directMatch && (directMatch[1] || directMatch[2])) {
    const y = parseInt(directMatch[1] || '0');
    const m = parseInt(directMatch[2] || '0');
    return { years: y + m / 12, months: y * 12 + m };
  }

  const yearMatch = text.match(/(\d+)\s*년\s*차/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1]);
    return { years: y, months: y * 12 };
  }

  // 기간 패턴에서 계산: "2019.03 ~ 2024.02", "2019.03 ~ 현재", "2019.03 ~ 진행중"
  const periods: Array<{ start: Date; end: Date }> = [];
  const periodPattern = /(\d{4})[.\-/](\d{1,2})\s*[~\-–—]\s*(?:(\d{4})[.\-/](\d{1,2})|현재|재직\s*중|진행\s*중)/gi;
  let match;

  while ((match = periodPattern.exec(text)) !== null) {
    const start = new Date(parseInt(match[1]), parseInt(match[2]) - 1);
    const end = match[3] ? new Date(parseInt(match[3]), parseInt(match[4]) - 1) : new Date();
    periods.push({ start, end });
  }

  if (periods.length === 0) return { years: 0, months: 0 };

  // 겹치지 않게 총 기간 계산
  periods.sort((a, b) => a.start.getTime() - b.start.getTime());
  let totalMonths = 0;
  let lastEnd = new Date(0);

  for (const period of periods) {
    const effectiveStart = period.start > lastEnd ? period.start : lastEnd;
    if (period.end > effectiveStart) {
      const m =
        (period.end.getFullYear() - effectiveStart.getFullYear()) * 12 +
        (period.end.getMonth() - effectiveStart.getMonth());
      totalMonths += m;
      lastEnd = period.end;
    }
  }

  const years = Math.round((totalMonths / 12) * 10) / 10;
  return { years, months: totalMonths };
}

// 하위 호환성 유지
export function calculateExperienceYears(text: string): number {
  return calculateExperience(text).years;
}
