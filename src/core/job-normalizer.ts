/**
 * 채용공고 raw_text를 구조화된 필드로 정규화
 * 한국 채용공고의 일반적 섹션 구조를 파싱
 */

import { extractSkills } from './tech-dictionary.js';
import type { JobCategory } from '../types/job.js';

export interface NormalizedJob {
  job_category: JobCategory;
  experience_min: number | null;
  experience_max: number | null;
  employment_type: string;
  location: string;
  salary_text: string | null;
  required_skills: string[];
  preferred_skills: string[];
  responsibilities: string[];
  qualifications: string[];
  preferences: string[];
  deadline: string | null;
}

// --- 섹션 패턴 ---

const JOB_SECTION_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'responsibilities', pattern: /^(?:주요\s*업무|담당\s*업무|업무\s*내용|하는\s*일|What you'll do|Job Description|업무\s*소개)/im },
  { key: 'qualifications', pattern: /^(?:자격\s*요건|필수\s*자격\s*요건|필수\s*(?:요건|조건|사항)|지원\s*자격|Requirements?|Qualifications?|이런\s*분.*(?:찾|모시|필요))/im },
  { key: 'preferences', pattern: /^(?:우대\s*(?:사항|조건|요건)|Preferred|Nice to have|이런\s*분.*(?:우대|더\s*좋))/im },
  { key: 'benefits', pattern: /^(?:복리\s*후생|혜택|Benefits?|Perks|이런\s*점.*(?:좋|제공))/im },
  { key: 'conditions', pattern: /^(?:근무\s*조건|근무\s*환경|근무지|근무\s*형태|Work\s*Conditions?)/im },
  { key: 'tech_stack', pattern: /^(?:기술\s*스택|사용\s*기술|Tech\s*Stack|개발\s*환경|기술\s*환경)/im },
  { key: 'process', pattern: /^(?:채용\s*(?:절차|프로세스)|전형\s*절차|Hiring\s*Process)/im },
  { key: 'about', pattern: /^(?:회사\s*소개|팀\s*소개|About|서비스\s*소개)/im },
];

function splitJobSections(text: string): Record<string, string> {
  const lines = text.split('\n');
  const sections: Record<string, string> = {};
  let currentKey = '_intro';
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    let matched = false;

    for (const { key, pattern } of JOB_SECTION_PATTERNS) {
      if (pattern.test(trimmed) && trimmed.length < 50) {
        if (currentLines.length > 0) {
          sections[currentKey] = currentLines.join('\n').trim();
        }
        currentKey = key;
        currentLines = [];
        matched = true;
        break;
      }
    }

    if (!matched && trimmed && !/^[-=─━]{3,}$/.test(trimmed)) {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections[currentKey] = currentLines.join('\n').trim();
  }

  return sections;
}

// --- bullet point 추출 ---

function extractBullets(text: string): string[] {
  if (!text) return [];
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 3)
    .map(l => l
      .replace(/^[-•·▪▸►◦○●■◆★☆]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .trim()
    )
    .filter(l => l.length > 3);
}

// --- 경력 요건 추출 ---

function extractExperience(text: string): { min: number | null; max: number | null } {
  // "경력 3~5년" / "3년 이상" / "5년 이상 10년 이하" / "신입/경력"
  const rangeMatch = text.match(/(\d+)\s*[~\-–]\s*(\d+)\s*년/);
  if (rangeMatch) {
    return { min: parseInt(rangeMatch[1]), max: parseInt(rangeMatch[2]) };
  }

  const minMatch = text.match(/(\d+)\s*년\s*이상/);
  if (minMatch) {
    return { min: parseInt(minMatch[1]), max: null };
  }

  const maxMatch = text.match(/(\d+)\s*년\s*이하/);
  if (maxMatch) {
    return { min: null, max: parseInt(maxMatch[1]) };
  }

  if (/경력\s*[:：]?\s*신입/.test(text) || (/신입/.test(text) && !/경력\s*\d/.test(text))) {
    return { min: 0, max: 0 };
  }

  return { min: null, max: null };
}

// --- 근무지 추출 ---

function extractLocation(text: string): string {
  const locMatch = text.match(/(?:근무지|근무\s*장소|위치|Location)\s*[:：]?\s*(.+)/i);
  if (locMatch) return locMatch[1].trim();

  // 주요 지역명 탐색
  const regions = ['서울', '판교', '성남', '분당', '강남', '역삼', '선릉', '삼성',
    '부산', '대전', '대구', '광주', '인천', '수원', '제주', '세종',
    '해운대', '송도', '마포', '여의도', '을지로', '종로'];
  for (const region of regions) {
    if (text.includes(region)) return region;
  }

  return '';
}

// --- 고용 형태 추출 ---

function extractEmploymentType(text: string): string {
  if (/계약직|인턴|Contract/i.test(text)) return '계약직';
  if (/프리랜서|Freelance/i.test(text)) return '프리랜서';
  return '정규직';
}

// --- 급여 추출 ---

function extractSalary(text: string): string | null {
  const salaryMatch = text.match(/(?:연봉|급여|salary|Salary)\s*[:：]?\s*(.+)/i);
  if (salaryMatch) return salaryMatch[1].trim();

  const amountMatch = text.match(/(\d{1,2},?\d{3})\s*(?:만\s*원|만원)/);
  if (amountMatch) return `${amountMatch[1]}만원`;

  if (/회사\s*(?:내규|규정)/.test(text)) return '회사 내규에 따름';
  if (/협의/.test(text)) return '협의';

  return null;
}

// --- 마감일 추출 ---

function extractDeadline(text: string): string | null {
  const deadlineMatch = text.match(/(?:마감|마감일|접수\s*기한|Deadline)\s*[:：]?\s*(\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2})/i);
  if (deadlineMatch) return deadlineMatch[1].replace(/[./]/g, '-');

  if (/상시\s*(?:채용|모집)|수시/.test(text)) return null; // 상시

  return null;
}

// --- 직무 카테고리 추론 ---

function inferCategory(title: string, text: string): JobCategory {
  const combined = `${title} ${text}`.toLowerCase();
  if (/백엔드|back-?end|서버\s*개발|server/i.test(combined)) return 'backend';
  if (/프론트엔드|front-?end|웹\s*개발|web\s*developer/i.test(combined)) return 'frontend';
  if (/풀스택|full-?stack/i.test(combined)) return 'fullstack';
  if (/안드로이드|ios|모바일|앱\s*개발|mobile/i.test(combined)) return 'mobile';
  if (/데이터|data\s*engineer|analytics/i.test(combined)) return 'data';
  if (/devops|sre|인프라|cloud|platform/i.test(combined)) return 'devops';
  if (/ai|ml|머신러닝|machine\s*learning|딥러닝/i.test(combined)) return 'ai_ml';
  if (/보안|security/i.test(combined)) return 'security';
  return 'other';
}

// --- 메인 정규화 함수 ---

export function normalizeJobText(rawText: string, jobTitle: string = ''): NormalizedJob {
  const sections = splitJobSections(rawText);
  const allText = rawText;

  // required: 자격요건 섹션에서만 (tech_stack은 fallback 제외)
  const reqSection = sections.qualifications || '';
  const prefSection = sections.preferences || '';

  const reqSkills = extractSkills(reqSection);
  const prefSkills = extractSkills(prefSection);
  const techStackSkills = extractSkills(sections.tech_stack || '');

  const requiredSet = new Set(reqSkills);
  const preferredOnly = prefSkills.filter(s => !requiredSet.has(s));

  // tech_stack은 required가 아닌 preferred로 합산 (중복 제거)
  const preferred_skills = [...new Set([...preferredOnly, ...techStackSkills.filter(s => !requiredSet.has(s))])];

  // 섹션 분리 완전 실패 시에만 전체 텍스트 fallback
  const hasAnySections = Object.keys(sections).some(k => k !== '_intro');
  const required_skills = hasAnySections ? reqSkills : extractSkills(allText);

  const exp = extractExperience(allText);

  return {
    job_category: inferCategory(jobTitle, allText),
    experience_min: exp.min,
    experience_max: exp.max,
    employment_type: extractEmploymentType(allText),
    location: extractLocation(allText),
    salary_text: extractSalary(allText),
    required_skills: required_skills,
    preferred_skills: preferred_skills,
    responsibilities: extractBullets(sections.responsibilities || ''),
    qualifications: extractBullets(sections.qualifications || ''),
    preferences: extractBullets(sections.preferences || ''),
    deadline: extractDeadline(allText),
  };
}
