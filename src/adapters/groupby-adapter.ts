/**
 * 그룹바이(GroupBy) 채용공고 어댑터
 * 스타트업 전문 채용 플랫폼 — Next.js SSR __NEXT_DATA__ 파싱
 */

import type { SourceAdapter } from './base-adapter.js';
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
    try {
      // 1) server-sitemap.xml에서 position ID 목록 수집
      const positionIds = await this.fetchPositionIds();
      if (positionIds.length === 0) return [];

      const limit = params.limit || 20;
      const jobs: JobPosting[] = [];

      // 2) 각 position 상세 페이지에서 __NEXT_DATA__ 파싱
      // 한 번에 너무 많이 요청하지 않도록 제한
      const candidateIds = positionIds.slice(0, Math.min(positionIds.length, limit * 3));

      for (const posId of candidateIds) {
        if (jobs.length >= limit) break;

        try {
          const job = await this.fetchPositionDetail(posId);
          if (!job) continue;

          // 키워드 필터링
          if (params.keywords.length > 0) {
            const matchText = `${job.job_title} ${job.company_name} ${job.required_skills.join(' ')} ${job.raw_text}`.toLowerCase();
            const matched = params.keywords.some(k => matchText.includes(k.toLowerCase()));
            if (!matched) continue;
          }

          // 경력 필터링
          if (params.experience_min !== undefined && job.experience_max !== null && job.experience_max < params.experience_min) continue;
          if (params.experience_max !== undefined && job.experience_min !== null && job.experience_min > params.experience_max) continue;

          // 카테고리 필터링
          if (params.job_category && job.job_category !== params.job_category && job.job_category !== 'other') continue;

          // 지역 필터링
          if (params.location && job.location && !job.location.includes(params.location)) continue;

          jobs.push(job);
        } catch {
          // 개별 공고 파싱 실패 시 무시하고 계속
          continue;
        }

        // rate limiting: 요청 간 200ms 딜레이
        await new Promise(r => setTimeout(r, 200));
      }

      return jobs;
    } catch (error) {
      console.error('그룹바이 검색 실패:', error);
      return [];
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

      // <loc>https://groupby.kr/positions/1234</loc> 패턴 추출
      const positionIds: string[] = [];
      const regex = /groupby\.kr\/positions\/(\d+)/g;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        positionIds.push(match[1]);
      }

      // 최신순 정렬 (ID가 클수록 최신)
      positionIds.sort((a, b) => parseInt(b) - parseInt(a));
      return positionIds;
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
        // fallbackDataRaw는 [[key, value]] 형태일 수 있음
        if (Array.isArray(raw)) {
          for (const [, value] of raw) {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value;
            if (parsed?.id && parsed?.name) return parsed;
          }
        } else if (typeof raw === 'object') {
          // 중첩 객체에서 position 데이터 찾기
          for (const key of Object.keys(raw)) {
            const val = raw[key];
            if (val?.id && val?.name) return val;
          }
        }
      }

      // 방법 3: dehydratedState (React Query)
      const dehydrated = nextData?.props?.pageProps?.dehydratedState;
      if (dehydrated?.queries) {
        for (const query of dehydrated.queries) {
          const data = query?.state?.data;
          if (data?.id && data?.name) return data;
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
      pos.task,
      pos.qualification,
      pos.preferred,
      pos.hiringProcess,
    ].filter(Boolean).map(t => stripHtml(t!)).join('\n\n');

    const normalized = normalizeJobText(rawText, pos.name || '');

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
    const location = pos.address || pos.location || normalized.location;

    // 회사 정보
    const companyName = pos.startup?.name || '';

    return {
      id: generateId('jp'),
      source: 'groupby',
      source_id: positionId,
      company_name: companyName,
      job_title: pos.name || '',
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

// --- 그룹바이 응답 타입 ---

interface GroupbyPosition {
  id?: number;
  name?: string;
  careerType?: string;
  positionTypes?: Array<{ id: number; name: string; parentId?: number } | string>;
  techStacks?: Array<{ id: number; name: string } | string>;
  experienceRange?: { min: number; max: number };
  remoteWorkPreference?: string;
  location?: string;
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
