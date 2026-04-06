/**
 * 이력서/경력기술서에서 프로젝트 목록 파싱
 */

import { extractSkills } from '../tech-dictionary.js';
import type { Project } from '../../types/profile.js';

const INVALID_PROJECT_NAME_PATTERNS = [
  /^(?:학력|보유\s*기술|기술\s*스택|경력|경력\s*및\s*프로젝트|자격증|교육|소개|연락처|수상|활동|포트폴리오|이름|나의\s*스킬)$/,
  /^이름\s*[:：]/,
  /^연락처\s*[:：]/,
  /^(?:P\s+R\s+O\s+J\s+E\s+C\s+T)/i,
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
  if (block.trim().length < 30) return false;
  const lines = block.split('\n').filter(l => l.trim());
  if (lines.length < 2) return false;
  if (
    /[\w.-]+@[\w.-]+\.\w+/.test(lines[0]) ||
    /0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}/.test(lines[0])
  ) {
    return false;
  }
  return true;
}

/**
 * 해당 줄이 프로젝트 제목처럼 생겼는지 판단
 */
function isProjectTitle(line: string, currentBlock: string[]): boolean {
  if (currentBlock.length < 5) return false;
  if (line.length > 60) return false;
  if (/^[-•·■◆►▶]/.test(line)) return false;

  const isEnglishTitle = /^[A-Z][A-Za-z0-9\s\-_]+$/.test(line) && line.length < 40;
  const isKoreanTitle =
    /^[가-힣A-Za-z0-9\s\-_]+$/.test(line) &&
    line.length < 30 &&
    !/^(?:역할|기간|담당|성과|결과|기술|스택|팀구성|기여도)/.test(line);

  return isEnglishTitle || isKoreanTitle;
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
      /^\d+[.)]\s/.test(trimmed) ||
      /^[■◆●▶►★☆◎○△]\s/.test(trimmed) ||
      /^(?:프로젝트\s*\d*\s*[:：])/.test(trimmed) ||
      (/^\[.+\]/.test(trimmed) && trimmed.length < 60) ||
      (/^【.+】/.test(trimmed) && trimmed.length < 60) ||
      (/^#{1,3}\s.+/.test(trimmed) && trimmed.length < 60) ||
      (/^\*\*[^*]+\*\*$/.test(trimmed) && trimmed.length < 60) ||
      isProjectTitle(trimmed, current);

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

function parseProjectBlock(block: string): Project | null {
  const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  let name = lines[0]
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^[■◆●▶►★☆◎○△]\s*/, '')
    .replace(/^\[(.+)\]/, '$1')
    .replace(/^【(.+)】/, '$1')
    .replace(/^#{1,3}\s*/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .replace(/^프로젝트\s*\d*\s*[:：]\s*/, '')
    .trim();

  if (name.length > 50) name = name.slice(0, 50);

  const fullText = block;

  // 기간: "진행중" / "진행 중" 포함
  const durationMatch =
    fullText.match(
      /(?:기간|period)\s*[:：]?\s*([\d.]+\s*[~\-–—]\s*(?:[\d.]+|현재|재직\s*중|진행\s*중))/i
    ) ||
    fullText.match(
      /(20\d{2}[.\-/\s]\d{1,2}\s*[~\-–—]\s*(?:20\d{2}[.\-/\s]\d{1,2}|현재|재직\s*중|진행\s*중))/i
    );
  const duration = durationMatch?.[1]?.trim() || '';

  // 역할
  const roleMatch = fullText.match(/(?:역할|담당|position|role)\s*[:：]\s*(.+)/i);
  const role = roleMatch?.[1]?.trim() || '';

  // 기술 스택
  const techMatch = fullText.match(
    /(?:기술\s*스택|사용\s*기술|개발\s*환경|기술\s*환경|Tech\s*Stack)\s*[:：]\s*(.+)/i
  );
  let tech_stack: string[];
  if (techMatch) {
    tech_stack = techMatch[1]
      .split(/[,/·|]/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && s.length < 30);
  } else {
    tech_stack = extractSkills(fullText);
  }

  // 설명
  const descLines = lines.slice(1).filter(
    l =>
      !l.match(/^(?:기간|역할|담당|기술|사용\s*기술|성과|결과|tech|stack|period|role|팀구성|기여도)/i) &&
      !l.match(/^[-•·]\s*/)
  );
  const description = descLines.join(' ').slice(0, 300);

  // 성과
  const achievements: string[] = [];
  const bulletPattern = /^[-•·]\s*(.+)/;
  for (const line of lines) {
    const m = line.match(bulletPattern);
    if (m && m[1].length > 5) achievements.push(m[1].trim());
  }
  const achieveMatch = fullText.match(/(?:성과|결과|기여|Impact)\s*[:：]\s*(.+)/i);
  if (achieveMatch) achievements.push(achieveMatch[1].trim());

  // 도메인 / 태그
  const domain = extractProjectDomain(fullText);
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

// --- 도메인 / 태그 (프로젝트 전용) ---

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
    if (keywords.some(k => lower.includes(k.toLowerCase()))) return domain;
  }
  return '';
}

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

function generateTags(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.entries(TAG_PATTERNS)
    .filter(([, patterns]) => patterns.some(p => lower.includes(p)))
    .map(([tag]) => tag);
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
