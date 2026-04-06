/**
 * 한국식 이력서 섹션 분리기
 * 텍스트를 섹션별로 분리하여 Record<string, string> 반환
 */

const SECTION_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'contact', pattern: /^(?:인적\s*사항|기본\s*정보|연락처|개인\s*정보|Personal\s*Info)/im },
  { key: 'summary', pattern: /^(?:요약|소개|자기\s*소개|한\s*줄\s*소개|Profile\s*Summary|About)/im },
  { key: 'career', pattern: /^(?:경력\s*사항|경력|업무\s*경력|Work\s*Experience|Career|경력\s*기술)/im },
  { key: 'projects', pattern: /^(?:프로젝트|주요\s*프로젝트|Projects?|수행\s*프로젝트|참여\s*프로젝트)/im },
  { key: 'skills', pattern: /^(?:기술\s*스택|보유\s*기술|기술|Skills?|Tech\s*Stack|기술\s*역량|Technical\s*Skills|나의\s*스킬)/im },
  { key: 'education', pattern: /^(?:학력|학력\s*사항|Education|학교)/im },
  { key: 'certifications', pattern: /^(?:자격증|자격\s*사항|Certification|License|수료|교육\s*이수|경험\/활동\/교육)/im },
  { key: 'awards', pattern: /^(?:수상|수상\s*경력|Awards?)/im },
  { key: 'activities', pattern: /^(?:대외\s*활동|활동|커뮤니티|Activities|오픈\s*소스)/im },
  { key: 'languages', pattern: /^(?:어학|외국어|Language)/im },
  { key: 'military', pattern: /^(?:병역|군\s*경력|Military)/im },
];

export function splitSections(text: string): Record<string, string> {
  const lines = text.split('\n');
  const sections: Record<string, string> = {};
  let currentKey = '_header';
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    let matched = false;

    for (const { key, pattern } of SECTION_PATTERNS) {
      // [학력], 【경력】 등 대괄호 형식도 인식하기 위해 괄호 제거 후 매칭
      const stripped = trimmed.replace(/^[\[【]/, '').replace(/[\]】]$/, '').trim();
      // 섹션 헤더: 단독 줄이어야 하며 ":" 뒤에 내용이 있으면 헤더가 아님
      if (pattern.test(stripped) && trimmed.length < 40 && !/[:：].{2,}/.test(trimmed)) {
        if (currentLines.length > 0) {
          sections[currentKey] = currentLines.join('\n').trim();
        }
        currentKey = key;
        currentLines = [];
        matched = true;
        break;
      }
    }

    if (!matched) {
      // 순수 구분선만 스킵 (## 제목 형식은 내용으로 보존)
      if (/^[-=─━]{3,}$/.test(trimmed)) {
        continue;
      }
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections[currentKey] = currentLines.join('\n').trim();
  }

  return sections;
}
