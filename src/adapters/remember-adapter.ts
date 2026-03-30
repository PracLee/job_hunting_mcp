/**
 * 리멤버(Remember) 채용공고 어댑터
 * 경력직 전문 채용 플랫폼 — career-api.rememberapp.co.kr REST API 사용
 * 인증 불필요 (공개 검색)
 *
 * API 구조:
 *   POST /job_postings/search → { data: RememberPosting[], meta: {...} }
 *   GET  /job_postings/:id   → { data: RememberPosting }
 */

import type { SourceAdapter } from './base-adapter.js';
import type { JobPosting, JobSearchParams, JobCategory } from '../types/job.js';
import { normalizeJobText } from '../core/job-normalizer.js';
import { generateId } from '../core/utils.js';

const BASE_API = 'https://career-api.rememberapp.co.kr';
const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Referer': 'https://career.rememberapp.co.kr/',
  'Origin': 'https://career.rememberapp.co.kr',
};

// 리멤버 job_categories level1/level2 → JobCategory 매핑
const REMEMBER_CATEGORY_MAP: Array<[string, JobCategory]> = [
  ['서버', 'backend'],
  ['백엔드', 'backend'],
  ['프론트엔드', 'frontend'],
  ['웹 프론트', 'frontend'],
  ['풀스택', 'fullstack'],
  ['안드로이드', 'mobile'],
  ['iOS', 'mobile'],
  ['모바일', 'mobile'],
  ['데이터 엔지니어', 'data'],
  ['데이터 분석', 'data'],
  ['데이터 사이언스', 'data'],
  ['머신러닝', 'ai_ml'],
  ['인공지능', 'ai_ml'],
  ['AI·ML', 'ai_ml'],
  ['DevOps', 'devops'],
  ['SRE', 'devops'],
  ['인프라', 'devops'],
  ['클라우드', 'devops'],
  ['보안', 'security'],
  ['개발·엔지니어링', 'backend'], // 폴백: 개발 직군
];

export class RememberAdapter implements SourceAdapter {
  source = 'remember' as const;

  isAvailable(): boolean {
    return true; // API 키 불필요
  }

  async search(params: JobSearchParams): Promise<JobPosting[]> {
    try {
      const limit = params.limit ?? 20;
      const jobs: JobPosting[] = [];
      const MAX_PAGES = 5;

      for (let page = 1; page <= MAX_PAGES; page++) {
        if (jobs.length >= limit) break;

        const body: Record<string, unknown> = {
          sort: 'starts_at_desc',
          page,
          per: 30, // 리멤버 API 최대 허용치
          seed: Math.floor(Math.random() * 100_000_000),
          search: {
            include_applied_job_posting: false,
            ...(params.keywords.length > 0 ? { keyword: params.keywords.join(' ') } : {}),
          },
        };

        const response = await fetch(`${BASE_API}/job_postings/search`, {
          method: 'POST',
          headers: BASE_HEADERS,
          body: JSON.stringify(body),
        });

        if (!response.ok) throw new Error(`리멤버 API ${response.status}`);

        const json = await response.json() as { data: RememberPosting[]; meta?: unknown };
        const postings: RememberPosting[] = Array.isArray(json.data) ? json.data : [];

        if (postings.length === 0) break;

        for (const posting of postings) {
          if (jobs.length >= limit) break;

          const job = this.postingToJob(posting);

          // 클라이언트 사이드 필터링 — 원본 전체 텍스트 기준 (정규화 전)
          if (params.keywords.length > 0) {
            const fullText = [
              posting.title,
              posting.organization?.name,
              posting.job_description,
              posting.qualifications,
              posting.preferred_qualifications,
              posting.introduction,
              ...(posting.job_categories ?? []).map(c => `${c.level1 ?? ''} ${c.level2 ?? ''}`),
            ].join(' ').toLowerCase();
            if (!params.keywords.some(k => fullText.includes(k.toLowerCase()))) continue;
          }
          if (params.location && job.location && !job.location.includes(params.location)) continue;
          if (params.experience_min !== undefined && job.experience_max !== null && job.experience_max < params.experience_min) continue;
          if (params.experience_max !== undefined && job.experience_min !== null && job.experience_min > params.experience_max) continue;
          if (params.job_category && job.job_category !== params.job_category && job.job_category !== 'other') continue;

          jobs.push(job);
        }
      }

      return jobs;
    } catch (error) {
      console.error('리멤버 검색 실패:', error);
      return [];
    }
  }

  async fetchDetail(sourceIdOrUrl: string): Promise<JobPosting | null> {
    try {
      // URL 또는 순수 ID에서 숫자 추출
      const id = sourceIdOrUrl.match(/postings\/(\d+)/)?.[1]
        ?? sourceIdOrUrl.match(/^(\d+)$/)?.[1]
        ?? sourceIdOrUrl;

      const response = await fetch(`${BASE_API}/job_postings/${id}`, {
        headers: BASE_HEADERS,
      });

      if (!response.ok) return null;

      const json = await response.json() as { data?: RememberPosting } | RememberPosting;
      const posting = (json as { data?: RememberPosting }).data ?? (json as RememberPosting);
      if (!posting?.id) return null;

      return this.postingToJob(posting);
    } catch (error) {
      console.error('리멤버 상세 조회 실패:', error);
      return null;
    }
  }

  // ───────────────────────────────────────────
  // 내부 정규화
  // ───────────────────────────────────────────

  private postingToJob(p: RememberPosting): JobPosting {
    const companyName = p.organization?.name ?? '';
    const title = p.title ?? '';

    // 텍스트 합치기 (검색·정규화용)
    const rawText = [
      p.introduction,
      p.job_description,
      p.qualifications,
      p.preferred_qualifications,
    ].filter(Boolean).join('\n\n');

    const normalized = normalizeJobText(rawText, title);

    // 위치: addresses 배열 → 첫 번째 항목
    const location = (p.addresses && p.addresses.length > 0)
      ? (p.addresses[0].address ?? p.addresses[0].city ?? '')
      : (normalized.location ?? '');

    // 경력
    const expMin = p.min_experience ?? normalized.experience_min;
    const expMax = p.max_experience ?? normalized.experience_max;

    // 카테고리
    const category = this.detectCategory(p.job_categories ?? [], title);

    // 급여
    const salaryText = (p.min_salary || p.max_salary)
      ? `${p.min_salary ?? '?'} ~ ${p.max_salary ?? '?'} 만원`
      : normalized.salary_text;

    // URL
    const postingId = String(p.id ?? '');
    const url = postingId ? `https://career.rememberapp.co.kr/job/postings/${postingId}` : '';

    return {
      id: generateId('jp'),
      source: 'remember',
      source_id: postingId,
      company_name: companyName,
      job_title: title,
      job_category: category,
      experience_min: expMin,
      experience_max: expMax,
      employment_type: normalized.employment_type,
      location,
      salary_text: salaryText,
      required_skills: normalized.required_skills,
      preferred_skills: normalized.preferred_skills,
      responsibilities: normalized.responsibilities.length > 0
        ? normalized.responsibilities
        : splitLines(p.job_description ?? ''),
      qualifications: normalized.qualifications.length > 0
        ? normalized.qualifications
        : splitLines(p.qualifications ?? ''),
      preferences: normalized.preferences.length > 0
        ? normalized.preferences
        : splitLines(p.preferred_qualifications ?? ''),
      deadline: p.ends_at ?? null,
      url,
      raw_text: rawText,
      fetched_at: new Date().toISOString(),
    };
  }

  private detectCategory(
    jobCategories: Array<{ level1?: string; level2?: string }>,
    title: string,
  ): JobCategory {
    const combined = [
      ...jobCategories.flatMap(c => [c.level1 ?? '', c.level2 ?? '']),
      title,
    ].join(' ');

    for (const [keyword, category] of REMEMBER_CATEGORY_MAP) {
      if (combined.includes(keyword)) return category;
    }
    return 'other';
  }
}

// ─── 유틸 ───────────────────────────────────

function splitLines(text: string): string[] {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|li|div|ul|ol)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map(l => l.trim().replace(/^[-•·▪▸►◦]\s*/, '').trim())
    .filter(l => l.length > 3);
}

// ─── 리멤버 API 응답 타입 ────────────────────

interface RememberPosting {
  id?: number;
  title?: string;
  job_description?: string;
  introduction?: string;
  qualifications?: string;
  preferred_qualifications?: string;
  min_experience?: number | null;
  max_experience?: number | null;
  min_salary?: number | null;
  max_salary?: number | null;
  ends_at?: string | null;
  organization?: {
    id?: number;
    name?: string;
    logo?: string;
    url?: string;
  };
  job_categories?: Array<{
    id?: number;
    level1?: string;
    level2?: string;
  }>;
  addresses?: Array<{
    address?: string;
    city?: string;
    district?: string;
  }>;
}
