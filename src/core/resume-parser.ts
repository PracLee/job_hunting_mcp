/**
 * 한국식 이력서/경력기술서 텍스트 파서
 * 정규식 기반으로 섹션 분리 + 프로젝트/경력 구조화
 * LLM 없이 동작하는 규칙 기반 파서
 */

import { extractSkills } from './tech-dictionary.js';
import type { Project, Skill, Education } from '../types/profile.js';

export interface ParsedResume {
  name: string | null;
  email: string | null;
  phone: string | null;
  total_experience_years: number;
  total_experience_months: number;
  job_category: string;
  skills: Skill[];
  projects: Project[];
  domains: string[];
  education: Education[];
  certifications: string[];
  sections: Record<string, string>;
}

// --- 섹션 분리 ---

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
      // 섹션 헤더: 단독 줄이어야 하며 ":" 뒤에 내용이 있으면 헤더가 아님
      if (pattern.test(trimmed) && trimmed.length < 40 && !/[:：].{2,}/.test(trimmed)) {
        // 이전 섹션 저장
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
      // 구분선은 스킵
      if (/^[-=─━]{3,}$/.test(trimmed) || /^[#*]{1,3}\s/.test(trimmed)) {
        continue;
      }
      currentLines.push(line);
    }
  }

  // 마지막 섹션
  if (currentLines.length > 0) {
    sections[currentKey] = currentLines.join('\n').trim();
  }

  return sections;
}

// --- 연락처 추출 ---

export function extractContact(text: string): { name: string | null; email: string | null; phone: string | null } {
  const email = text.match(/[\w.-]+@[\w.-]+\.\w+/)?.[0] || null;
  const phone = text.match(/0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/)?.[0] || null;

  // 이름: 보통 첫 줄이나 "이름:" 뒤에 위치 (한글 2글자 이상 제한 해제)
  let name: string | null = null;
  const nameMatch = text.match(/(?:이름\s*[:：]\s*)([^\r\n]+)/);
  if (nameMatch) {
    name = nameMatch[1].trim();
  } else {
    // 첫 줄에서 한글 이름 추출 시도
    const firstLines = text.split('\n').slice(0, 5);
    for (const line of firstLines) {
      const m = line.trim().match(/^([가-힣]{2,4})$/);
      if (m) { name = m[1]; break; }
      // "홍길동 | 백엔드 개발자" 같은 패턴
      const m2 = line.trim().match(/^([가-힣]{2,4})\s*[|·/]/);
      if (m2) { name = m2[1]; break; }
      // "홍길동 경력" / "홍길동 사원" 같은 채용사이트 형식
      const m3 = line.trim().match(/^([가-힣]{2,4})\s+(?:경력|사원|대리|과장|차장|부장|이사|팀장|개발자|엔지니어)/);
      if (m3) { name = m3[1]; break; }
    }
  }

  return { name, email, phone };
}

// --- 경력 연차 계산 ---

export function calculateExperience(text: string): { years: number; months: number } {
  // 1순위: "총 3년 10개월" / "경력 총 3년 10개월" 형태 (가장 명시적)
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
    const totalMonths = y * 12 + m;
    return { years: y + (m / 12), months: totalMonths };
  }

  const yearMatch = text.match(/(\d+)\s*년\s*차/);
  if (yearMatch) {
    const y = parseInt(yearMatch[1]);
    return { years: y, months: y * 12 };
  }

  // 기간에서 추출: "2019.03 ~ 2024.02", "2019.03 - 현재"
  const periods: Array<{ start: Date; end: Date }> = [];
  const periodPattern = /(\d{4})[.\-/](\d{1,2})\s*[~\-–—]\s*(?:(\d{4})[.\-/](\d{1,2})|현재|재직\s*중|present|current)/gi;
  let match;

  while ((match = periodPattern.exec(text)) !== null) {
    const startYear = parseInt(match[1]);
    const startMonth = parseInt(match[2]);
    const start = new Date(startYear, startMonth - 1);

    let end: Date;
    if (match[3]) {
      end = new Date(parseInt(match[3]), parseInt(match[4]) - 1);
    } else {
      end = new Date();
    }
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
      const m = (period.end.getFullYear() - effectiveStart.getFullYear()) * 12
        + (period.end.getMonth() - effectiveStart.getMonth());
      totalMonths += m;
      lastEnd = period.end;
    }
  }

  const years = Math.round(totalMonths / 12 * 10) / 10;
  return { years, months: totalMonths };
}

// 하위 호환성 유지
export function calculateExperienceYears(text: string): number {
  return calculateExperience(text).years;
}

// --- 프로젝트 파싱 ---

// 유효한 프로젝트가 아닌 섹션 헤더/개인정보 블록 필터
const INVALID_PROJECT_NAME_PATTERNS = [
  /^(?:학력|보유\s*기술|기술\s*스택|경력|경력\s*및\s*프로젝트|자격증|교육|소개|연락처|수상|활동|포트폴리오|이름|나의\s*스킬)$/,
  /^이름\s*[:：]/,           // "이름: 이병재"
  /^연락처\s*[:：]/,
  /^(?:P\s+R\s+O\s+J\s+E\s+C\s+T)/i,  // "P R O J E C T 01" (포트폴리오 섹션 구분자)
  /^(?:C\s+A\s+R\s+E\s+E\s+R)/i,
  /^(?:A\s+B\s+O\s+U\s+T)/i,
  /^(?:C\s+L\s+O\s+S\s+I\s+N\s+G)/i,
];

function isValidProjectName(name: string): boolean {
  if (!name || name.length < 2) return false;
  for (const pattern of INVALID_PROJECT_NAME_PATTERNS) {
    if (pattern.test(name.trim())) return false;
  }
  return true;
}

function isValidProjectBlock(block: string): boolean {
  // 너무 짧거나, 이메일/전화 패턴만 있는 블록은 프로젝트가 아님
  if (block.trim().length < 30) return false;
  const lines = block.split('\n').filter(l => l.trim());
  if (lines.length < 2) return false;
  // 첫 줄이 이름이고 두 번째 줄이 연락처 패턴이면 개인정보 블록
  if (/[\w.-]+@[\w.-]+\.\w+/.test(lines[0]) || /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/.test(lines[0])) {
    return false;
  }
  return true;
}

export function parseProjects(text: string): Project[] {
  if (!text) return [];

  const projects: Project[] = [];
  const blocks = splitProjectBlocks(text);

  for (const block of blocks) {
    if (!isValidProjectBlock(block)) continue;
    const project = parseProjectBlock(block);
    if (project && isValidProjectName(project.name)) {
      projects.push(project);
    }
  }

  return projects;
}

function splitProjectBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.length > 0) {
        const lastLine = current[current.length - 1]?.trim();
        if (!lastLine) {
          blocks.push(current.join('\n'));
          current = [];
          continue;
        }
      }
      current.push(line);
      continue;
    }

    const isNewProject =
      /^\d+[.)]\s/.test(trimmed) ||                           // "1. 프로젝트명" / "1) 프로젝트명"
      /^[■◆●▶►★☆]\s/.test(trimmed) ||                        // bullet
      /^(?:프로젝트\s*[:：])/.test(trimmed) ||                 // "프로젝트:"
      (/^\[.+\]/.test(trimmed) && trimmed.length < 60) ||    // "[프로젝트명]"
      isProjectTitle(trimmed, current);                       // 영문 프로젝트명 or 한국어 짧은 타이틀

    if (isNewProject && current.length > 3) {
      blocks.push(current.join('\n'));
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join('\n'));
  }

  return blocks.filter(b => b.trim().length > 20);
}

/**
 * 해당 줄이 프로젝트 제목처럼 생겼는지 판단
 * - 영문 대문자 시작 짧은 단어 (STOCKPULSE, MirrAI)
 * - 한글 짧은 제목 (혈당관리 앱, Job Hunting MCP)
 * - 현재 블록이 충분히 쌓인 뒤에만 새 블록으로 간주
 */
function isProjectTitle(line: string, currentBlock: string[]): boolean {
  if (currentBlock.length < 5) return false; // 너무 일찍 분리하지 않음
  if (line.length > 60) return false;         // 너무 긴 줄은 제목이 아님

  // "STOCKPULSE", "MirrAI" 같은 영문 프로젝트명
  // bullet point 줄은 절대 제목이 아님
  if (/^[-•·■◆►▶]/.test(line)) return false;

  const isEnglishTitle = /^[A-Z][A-Za-z0-9\s\-_]+$/.test(line) && line.length < 40;
  // "혈당관리 앱", "Job Hunting MCP" 같은 짧은 한/영 혼합 타이틀
  const isKoreanTitle = /^[가-힣A-Za-z0-9\s\-_]+$/.test(line) &&
    line.length < 30 &&
    !/^(?:역할|기간|담당|성과|결과|기술|스택|팀구성|기여도)/.test(line);

  return isEnglishTitle || isKoreanTitle;
}

function parseProjectBlock(block: string): Project | null {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // 프로젝트명: 첫 줄에서 추출
  let name = lines[0]
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^[■◆●▶►★☆]\s*/, '')
    .replace(/^\[(.+)\]/, '$1')
    .replace(/^프로젝트\s*[:：]\s*/, '')
    .trim();

  // 이름이 너무 길면 잘라냄
  if (name.length > 50) name = name.slice(0, 50);

  const fullText = block;

  // 기간
  const durationMatch = fullText.match(/(?:기간|period)\s*[:：]?\s*([\d.]+\s*[~\-–—]\s*(?:[\d.]+|현재|재직\s*중))/i)
    || fullText.match(/(20\d{2}[.\-/\s]\d{1,2}\s*[~\-–—]\s*(?:20\d{2}[.\-/\s]\d{1,2}|현재|재직\s*중))/i);
  const duration = durationMatch?.[1]?.trim() || '';

  // 역할
  const roleMatch = fullText.match(/(?:역할|담당|position|role)\s*[:：]\s*(.+)/i);
  const role = roleMatch?.[1]?.trim() || '';

  // 기술 스택
  // "기술" 단독 매치 방지 → "기술 스택:", "사용 기술:", "Tech Stack:" 처럼 명시적 형태만 허용
  const techMatch = fullText.match(/(?:기술\s*스택|사용\s*기술|개발\s*환경|기술\s*환경|Tech\s*Stack)\s*[:：]\s*(.+)/i);
  let tech_stack: string[] = [];
  if (techMatch) {
    tech_stack = techMatch[1].split(/[,/·|]/).map(s => s.trim()).filter(s => s.length > 0 && s.length < 30);
  } else {
    tech_stack = extractSkills(fullText);
  }

  // 설명: 역할/성과 이외의 텍스트
  const descLines = lines.slice(1).filter(l =>
    !l.match(/^(?:기간|역할|담당|기술|사용\s*기술|성과|결과|tech|stack|period|role|팀구성|기여도)/i) &&
    !l.match(/^[-•·]\s*/)
  );
  const description = descLines.join(' ').slice(0, 300);

  // 성과: bullet point들
  const achievements: string[] = [];
  const bulletPattern = /^[-•·]\s*(.+)/;
  for (const line of lines) {
    const m = line.match(bulletPattern);
    if (m && m[1].length > 5) {
      achievements.push(m[1].trim());
    }
  }
  // "성과:" 뒤의 내용
  const achieveMatch = fullText.match(/(?:성과|결과|기여|Impact)\s*[:：]\s*(.+)/i);
  if (achieveMatch) {
    achievements.push(achieveMatch[1].trim());
  }

  // 도메인 추출
  const domain = extractProjectDomain(fullText);

  // 태그 생성
  const tags = generateTags(fullText);

  return {
    name: name || '이름 없는 프로젝트',
    role,
    duration,
    tech_stack,
    description: description || name,
    achievements,
    domain,
    tags,
  };
}

// --- 학력 파싱 ---

export function parseEducation(text: string): Education[] {
  if (!text) return [];

  const educations: Education[] = [];
  const lines = text.split('\n');

  // 멀티라인 블록 파싱: 학교명을 찾고 전후 줄에서 전공/연도를 보완
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // 학교명 패턴 감지
    const schoolMatch = trimmed.match(/([가-힣A-Za-z]+(?:대학교?|University|College|학원|고등학교)(?:\([\w]+\))?)/);
    if (!schoolMatch) continue;

    const school = schoolMatch[1].replace(/\(.*?\)/, '').trim();

    // 현재 줄 + 인근 줄(±2)에서 전공, 학위, 연도 추출
    const context = lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 4)).join(' ');

    const major = context.match(/([가-힣]+(?:학과|학부|전공|공학))/)?.[1]?.trim() || '';
    const degree = extractDegree(context);
    const yearMatch = context.match(/(\d{4})\s*[.\-/]\s*\d{1,2}/);
    // 졸업년도: 두 번째 연도(종료일) 추출
    const allYears = [...context.matchAll(/(\d{4})/g)].map(m => parseInt(m[1]));
    const year = allYears.length >= 2 ? allYears[allYears.length - 1] : (allYears[0] || 0);

    // 같은 학교 중복 제거
    if (!educations.find(e => e.school === school)) {
      educations.push({ school, major, degree, year });
    }
  }

  return educations;
}

function extractDegree(text: string): string {
  if (/박사|Ph\.?D/i.test(text)) return '박사';
  if (/석사|Master/i.test(text)) return '석사';
  return '학사';
}

// --- 자격증 파싱 ---

export function parseCertifications(text: string): string[] {
  if (!text) return [];
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 2 && l.length < 100)
    .map(l => l.replace(/^\d+[.)]\s*/, '').replace(/^[-•·]\s*/, '').trim())
    .filter(Boolean);
}

// --- 도메인 추출 ---

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  fintech: ['결제', '금융', '핀테크', '은행', '보험', '증권', '페이', 'payment', 'banking'],
  'e-commerce': ['이커머스', '쇼핑', '커머스', '주문', '배송', '장바구니', 'commerce'],
  healthcare: ['헬스케어', '의료', '건강', '병원', '진료', '혈당'],
  edtech: ['에듀테크', 'LMS', '강의', 'e-learning'],
  logistics: ['물류', '배송', '택배', '창고', '재고', 'ERP', 'WMS'],
  social: ['소셜', 'SNS', '커뮤니티', '피드', '채팅', '메신저'],
  gaming: ['게임', '게이밍', 'unity', 'unreal'],
  saas: ['SaaS', 'B2B', '기업용', '어드민', '백오피스'],
  media: ['미디어', '콘텐츠', '영상', '스트리밍', 'OTT'],
  mobility: ['모빌리티', '차량', '자율주행', '지도', '내비'],
  security: ['보안', '인증', 'OAuth', 'RBAC', '암호화'],
};

function extractProjectDomain(text: string): string {
  const lower = text.toLowerCase();
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k.toLowerCase()))) {
      return domain;
    }
  }
  return '';
}

function generateTags(text: string): string[] {
  const tags: string[] = [];
  const lower = text.toLowerCase();

  const TAG_PATTERNS: Record<string, string[]> = {
    msa: ['msa', '마이크로서비스', 'microservice'],
    performance: ['성능', '최적화', '튜닝', 'performance', 'latency', '속도 개선'],
    refactoring: ['리팩토링', 'refactoring', '레거시', '개선'],
    migration: ['마이그레이션', 'migration', '이전', '전환'],
    devops: ['ci/cd', 'cicd', '배포', 'deploy', 'pipeline'],
    testing: ['테스트', 'test', 'tdd', 'coverage'],
    api: ['api', 'rest', 'graphql', 'grpc'],
    data: ['데이터', 'data', 'etl', '파이프라인', 'batch'],
    infra: ['인프라', 'infra', 'aws', 'gcp', 'azure', 'cloud', '클라우드'],
    incident: ['장애', '대응', 'incident', '모니터링', '알림'],
    scale: ['대규모', '대용량', '트래픽', 'scale', '확장'],
    leadership: ['리드', 'lead', '멘토', '코드 리뷰'],
  };

  for (const [tag, patterns] of Object.entries(TAG_PATTERNS)) {
    if (patterns.some(p => lower.includes(p))) {
      tags.push(tag);
    }
  }

  return tags;
}

// --- 직무 카테고리 추론 ---

export function inferJobCategory(skills: string[], text: string): string {
  const lower = text.toLowerCase();
  const skillSet = new Set(skills.map(s => s.toLowerCase()));

  const scores: Record<string, number> = {
    backend: 0, frontend: 0, fullstack: 0, mobile: 0,
    data: 0, devops: 0, ai_ml: 0, other: 0,
  };

  // 기술 기반
  const techMap: Record<string, string[]> = {
    backend: ['spring', 'spring boot', 'django', 'fastapi', 'express', 'nestjs', 'jpa', 'mybatis', 'node.js'],
    frontend: ['react', 'vue.js', 'angular', 'next.js', 'svelte'],
    mobile: ['android', 'ios', 'react native', 'flutter', 'swift', 'kotlin'],
    data: ['spark', 'hadoop', 'airflow', 'tableau', 'bigquery'],
    devops: ['kubernetes', 'terraform', 'ansible', 'jenkins', 'argocd'],
    ai_ml: ['pytorch', 'tensorflow', 'langchain', 'hugging face'],
  };

  for (const [cat, techs] of Object.entries(techMap)) {
    for (const tech of techs) {
      if (skillSet.has(tech)) scores[cat] += 2;
    }
  }

  // 텍스트 키워드 기반
  if (/백엔드|back-?end|서버\s*개발/i.test(lower)) scores.backend += 3;
  if (/프론트엔드|front-?end|웹\s*개발/i.test(lower)) scores.frontend += 3;
  if (/풀스택|full-?stack/i.test(lower)) scores.fullstack += 3;
  if (/안드로이드|ios|모바일|앱\s*개발/i.test(lower)) scores.mobile += 3;
  if (/데이터\s*엔지니어|데이터\s*분석/i.test(lower)) scores.data += 3;
  if (/devops|인프라\s*엔지니어|SRE/i.test(lower)) scores.devops += 3;
  if (/ai|ml|머신러닝|딥러닝/i.test(lower)) scores.ai_ml += 3;

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][1] > 0 ? sorted[0][0] : 'other';
}

// --- 전체 파싱 ---

export function parseResumeText(
  resumeText: string,
  careerText?: string,
  portfolioText?: string,
): ParsedResume {
  const allText = [resumeText, careerText, portfolioText].filter(Boolean).join('\n\n');

  // 1. 섹션 분리
  const sections = splitSections(allText);

  // 2. 연락처 (헤더 → 연락처 섹션 → 전체 텍스트 순서로 시도)
  const contact = extractContact(sections._header || sections.contact || allText);

  // 3. 기술 추출
  const skillNames = extractSkills(allText);
  const skills: Skill[] = skillNames.map(name => ({
    name,
    level: 'intermediate' as const,
  }));

  // 4. 경력 연차 (years + months 모두 계산)
  const experience = calculateExperience(allText);

  // 5. 프로젝트: 명시적 섹션만 사용 (allText 전체 파싱 금지)
  //    프로젝트 섹션 → 경력 섹션 → 없으면 빈 배열
  const projectText = sections.projects || '';
  const careerSection = sections.career || (careerText ? careerText : '');
  const projects = parseProjects(projectText || careerSection);

  // 6. 학력
  const education = parseEducation(sections.education || '');

  // 7. 자격증
  const certifications = parseCertifications(sections.certifications || '');

  // 8. 도메인
  const domainSet = new Set<string>();
  for (const p of projects) {
    if (p.domain) domainSet.add(p.domain);
  }

  // 9. 직무 카테고리
  const jobCategory = inferJobCategory(skillNames, allText);

  return {
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    total_experience_years: experience.years,
    total_experience_months: experience.months,
    job_category: jobCategory,
    skills,
    projects,
    domains: Array.from(domainSet),
    education,
    certifications,
    sections,
  };
}
