/**
 * 그룹바이(GroupBy) 채용공고 어댑터
 * 스타트업 전문 채용 플랫폼 — Next.js SSR __NEXT_DATA__ 파싱
 */

import type { SourceAdapter, SourceSearchResult } from './base-adapter.js';
import type { JobPosting, JobSearchParams, JobCategory } from '../types/job.js';
import { normalizeJobText } from '../core/job-normalizer.js';
import { generateId } from '../core/utils.js';

// 그룹바이 포지션 카테고리 매핑 (positionTypes)
const GROUPBY_CATEGORY_MAP: Record<string, string[]> = {
  backend: ['서버/백엔드', '서버', '백엔드'],
  frontend: ['프론트엔드', '웹 프론트엔드'],
  fullstack: ['풀스택'],
  mobile: ['안드로이드', 'iOS', '모바일'],
  data: ['데이터 엔지니어', '데이터 분석', '데이터 사이언스'],
  devops: ['DevOps', '인프라', 'SRE', '클라우드'],
  ai_ml: ['머신러닝', 'AI', '인공지능'],
  other: ['개발', '기타'],
};

export class GroupbyAdapter implements SourceAdapter {
  source = 'groupby' as const;
  private baseUrl = 'https://groupby.kr';

  isAvailable(): boolean {
    return true; // API 키 불필요
  }

  async search(params: JobSearchParams): Promise<JobPosting[]> {
    return (await this.searchWithMeta(params)).jobs;
  }

  async searchWithMeta(params: JobSearchParams): Promise<SourceSearchResult> {
    try {
      // 1) server-sitemap.xml에서 position ID 목록 수집
      const positionIds = await this.fetchPositionIds();
      if (positionIds.length === 0) {
        return { jobs: [], warnings: ['파서 오류 - sitemap에서 공고 ID를 찾지 못했습니다.'] };
      }

      const limit = params.limit || 20;
      const jobs: JobPosting[] = [];

      const candidateCount = params.keywords.length > 0
        ? Math.min(Math.max(limit * 20, 120), 240)
        : Math.min(Math.max(limit * 6, 30), 60);
      const candidateIds = positionIds.slice(0, Math.min(positionIds.length, candidateCount));
      const batchSize = params.keywords.length > 0 ? 8 : 5;

      for (let index = 0; index < candidateIds.length && jobs.length < limit; index += batchSize) {
        const batch = candidateIds.slice(index, index + batchSize);
        const results = await Promise.all(batch.map(async posId => {
          try {
            return await this.fetchPositionDetail(posId);
          } catch {
            return null;
          }
        }));

        for (const job of results) {
          if (!job || !this.matchesSearch(job, params)) continue;

          jobs.push(job);
          if (jobs.length >= limit) break;
        }
      }

      return { jobs, warnings: [] };
    } catch (error) {
      console.error('그룹바이 검색 실패:', error);
      return { jobs: [], warnings: [`파서 오류 - ${error instanceof Error ? error.message : String(error)}`] };
    }
  }

  async fetchDetail(sourceIdOrUrl: string): Promise<JobPosting | null> {
    try {
      // URL에서 ID 추출
      const id = sourceIdOrUrl.match(/positions\/(\d+)/)?.[1] || sourceIdOrUrl;
      return await this.fetchPositionDetail(id);
    } catch (error) {
      console.error('그룹바이 상세 조회 실패:', error);
      return null;
    }
  }

  /**
   * server-sitemap.xml에서 모든 position URL 파싱
   */
  private async fetchPositionIds(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/server-sitemap.xml`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobHuntingMCP/1.0)' },
      });
      if (!response.ok) return [];

      const xml = await response.text();

      const positions: Array<{ id: string; lastmod: string | null }> = [];
      const regex = /<url>\s*<loc>https:\/\/groupby\.kr\/positions\/(\d+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        positions.push({ id: match[1], lastmod: match[2] || null });
      }

      positions.sort((left, right) => {
        const leftTime = left.lastmod ? Date.parse(left.lastmod) : 0;
        const rightTime = right.lastmod ? Date.parse(right.lastmod) : 0;
        if (rightTime !== leftTime) return rightTime - leftTime;
        return parseInt(right.id, 10) - parseInt(left.id, 10);
      });

      return Array.from(new Set(positions.map(position => position.id)));
    } catch {
      return [];
    }
  }

  /**
   * 개별 position 페이지의 __NEXT_DATA__에서 데이터 추출
   */
  private async fetchPositionDetail(positionId: string): Promise<JobPosting | null> {
    const response = await fetch(`${this.baseUrl}/positions/${positionId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    // __NEXT_DATA__ JSON 추출
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!nextDataMatch) return null;

    let nextData: any;
    try {
      nextData = JSON.parse(nextDataMatch[1]);
    } catch {
      return null;
    }

    // pageProps에서 position 데이터 찾기
    const position = this.extractPosition(nextData);
    if (!position) return null;

    return this.positionToJob(position, positionId);
  }

  /**
   * __NEXT_DATA__에서 position 객체 추출
   * 그룹바이는 fallbackDataRaw 또는 pageProps에 데이터를 넣음
   */
  private extractPosition(nextData: any): GroupbyPosition | null {
    try {
      // 방법 1: pageProps.position
      if (nextData?.props?.pageProps?.position) {
        return nextData.props.pageProps.position;
      }

      // 방법 2: pageProps.fallbackDataRaw 파싱
      if (nextData?.props?.pageProps?.fallbackDataRaw) {
        const raw = nextData.props.pageProps.fallbackDataRaw;
        if (this.isPosition(raw)) return raw;

        // fallbackDataRaw는 [[key, value]] 형태일 수 있음
        if (Array.isArray(raw)) {
          for (const [, value] of raw) {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            if (this.isPosition(parsed)) return parsed;
          }
        } else if (typeof raw === 'object') {
          // 중첩 객체에서 position 데이터 찾기
          for (const key of Object.keys(raw)) {
            const val = raw[key];
            if (this.isPosition(val)) return val;
          }
        }
      }

      // 방법 3: dehydratedState (React Query)
      const dehydrated = nextData?.props?.pageProps?.dehydratedState;
      if (dehydrated?.queries) {
        for (const query of dehydrated.queries) {
          const data = query?.state?.data;
          if (this.isPosition(data)) return data;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 그룹바이 position → JobPosting 정규화
   */
  private positionToJob(pos: GroupbyPosition, positionId: string): JobPosting {
    // 주요 텍스트 결합
    const rawText = [
      buildSection('주요업무', pos.task),
      buildSection('자격요건', pos.qualification),
      buildSection('우대사항', pos.preferred),
      buildSection('채용절차', pos.hiringProcess),
    ].filter(Boolean).map(t => stripHtml(t!)).join('\n\n');

    const title = (pos.name || '').trim();
    const normalized = normalizeJobText(rawText, title);

    // 기술스택 추출
    const techStacks = pos.techStacks?.map((t: any) => typeof t === 'string' ? t : t.name).filter(Boolean) || [];
    const allSkills = new Set([...techStacks, ...normalized.required_skills]);

    // 경력 범위
    const expMin = pos.experienceRange?.min ?? normalized.experience_min;
    const expMax = pos.experienceRange?.max ?? normalized.experience_max;

    // 카테고리 결정
    const posTypeNames = pos.positionTypes?.map((t: any) => typeof t === 'string' ? t : t.name) || [];
    const category = this.detectCategory(posTypeNames, pos.name || '');

    // 위치
    const location = pos.address || extractGroupbyLocation(pos.location) || normalized.location;

    // 회사 정보
    const companyName = pos.startup?.name || '';

    return {
      id: generateId('jp'),
      source: 'groupby',
      source_id: positionId,
      company_name: companyName,
      job_title: title,
      job_category: category,
      experience_min: expMin,
      experience_max: expMax,
      employment_type: pos.careerType || normalized.employment_type,
      location: location,
      salary_text: normalized.salary_text,
      required_skills: Array.from(allSkills),
      preferred_skills: normalized.preferred_skills,
      responsibilities: normalized.responsibilities.length > 0
        ? normalized.responsibilities
        : extractBulletList(stripHtml(pos.task || '')),
      qualifications: normalized.qualifications.length > 0
        ? normalized.qualifications
        : extractBulletList(stripHtml(pos.qualification || '')),
      preferences: normalized.preferences.length > 0
        ? normalized.preferences
        : extractBulletList(stripHtml(pos.preferred || '')),
      deadline: pos.dueDate || null,
      url: `https://groupby.kr/positions/${positionId}`,
      raw_text: rawText,
      fetched_at: new Date().toISOString(),
    };
  }

  /**
   * positionType 이름으로 JobCategory 결정
   */
  private detectCategory(typeNames: string[], title: string): JobCategory {
    const combined = [...typeNames, title].join(' ').toLowerCase();

    for (const [cat, keywords] of Object.entries(GROUPBY_CATEGORY_MAP)) {
      if (keywords.some(k => combined.includes(k.toLowerCase()))) {
        return cat as JobCategory;
      }
    }
    return 'other';
  }

  private matchesSearch(job: JobPosting, params: JobSearchParams): boolean {
    if (params.keywords.length > 0) {
      const matchText = `${job.job_title} ${job.company_name} ${job.required_skills.join(' ')} ${job.raw_text}`.toLowerCase();
      const matched = params.keywords.some(keyword => matchText.includes(keyword.toLowerCase()));
      if (!matched) return false;
    }

    if (params.experience_min !== undefined && job.experience_max !== null && job.experience_max < params.experience_min) {
      return false;
    }

    if (params.experience_max !== undefined && job.experience_min !== null && job.experience_min > params.experience_max) {
      return false;
    }

    if (params.job_category && job.job_category !== params.job_category && job.job_category !== 'other') {
      return false;
    }

    if (params.location && job.location && !job.location.includes(params.location)) {
      return false;
    }

    return true;
  }

  private isPosition(value: unknown): value is GroupbyPosition {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as GroupbyPosition;
    return Boolean(candidate.id && candidate.name && (
      candidate.startup?.name
      || candidate.task
      || candidate.qualification
      || candidate.positionTypes
      || candidate.techStacks
    ));
  }
}

// --- 유틸 ---

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|li|ul|ol|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractBulletList(text: string): string[] {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 3)
    .map(l => l.replace(/^[-•·▪▸►◦]\s*/, '').trim())
    .filter(l => l.length > 3);
}

function buildSection(label: string, value?: string): string {
  return value ? `${label}\n${value}` : '';
}

function extractGroupbyLocation(location?: string | { id?: number; name?: string }): string {
  if (!location) return '';
  return typeof location === 'string' ? location : location.name || '';
}

// --- 그룹바이 응답 타입 ---

interface GroupbyPosition {
  id?: number;
  name?: string;
  careerType?: string;
  positionTypes?: Array<{ id: number; name: string; parentId?: number } | string>;
  techStacks?: Array<{ id: number; name: string } | string>;
  experienceRange?: { min: number; max: number };
  remoteWorkPreference?: string;
  location?: string | { id?: number; name?: string };
  address?: string;
  task?: string;
  qualification?: string;
  preferred?: string;
  hiringProcess?: string;
  expectationKeywords?: Array<{ id: number; name: string }>;
  publishedAt?: string;
  updatedAt?: string;
  dueDate?: string | null;
  startup?: {
    id?: number;
    name?: string;
    thumbnail?: string;
    briefIntro?: string;
    memberCount?: number;
    devCount?: number;
  };
}
