/**
 * 원티드(Wanted) 채용공고 어댑터
 * 원티드 웹 API를 통해 공고 검색 및 상세 조회
 */

import type { SourceAdapter } from './base-adapter.js';
import type { JobPosting, JobSearchParams, JobCategory } from '../types/job.js';
import { normalizeJobText } from '../core/job-normalizer.js';
import { generateId } from '../core/utils.js';

// 원티드 API 카테고리 매핑
const WANTED_TAG_MAP: Record<string, number[]> = {
  backend: [872],       // 서버 개발자
  frontend: [669],      // 프론트엔드 개발자
  fullstack: [873],     // 풀스택 개발자
  mobile: [677, 678],   // Android, iOS
  data: [655],          // 데이터 엔지니어
  devops: [674],        // DevOps
  ai_ml: [1634],        // 머신러닝 엔지니어
  other: [518],         // 개발 전체
};

export class WantedAdapter implements SourceAdapter {
  source = 'wanted' as const;
  private baseUrl = 'https://www.wanted.co.kr/api/v4';

  isAvailable(): boolean {
    return true; // 원티드 API는 키 불필요
  }

  async search(params: JobSearchParams): Promise<JobPosting[]> {
    try {
      const tagIds = params.job_category
        ? WANTED_TAG_MAP[params.job_category] || WANTED_TAG_MAP.other
        : WANTED_TAG_MAP.other;

      // 원티드 API 호출
      const query = params.keywords.join(' ');
      const limit = params.limit || 20;

      const url = new URL(`${this.baseUrl}/jobs`);
      url.searchParams.set('country', 'kr');
      url.searchParams.set('tag_type_ids', tagIds.join(','));
      url.searchParams.set('locations', params.location === '서울' ? 'seoul.all' : 'all');
      url.searchParams.set('years', this.buildYearsParam(params.experience_min, params.experience_max));
      url.searchParams.set('limit', limit.toString());
      url.searchParams.set('offset', '0');

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'Wanted-User-Agent': 'user',
        },
      });

      if (!response.ok) {
        console.error(`원티드 API 에러: ${response.status}`);
        return [];
      }

      const data = await response.json() as WantedJobListResponse;
      const jobs: JobPosting[] = [];

      for (const item of (data.data || [])) {
        // 키워드 필터링 (클라이언트 사이드)
        const matchText = `${item.position} ${item.company?.name || ''} ${item.skill_tags?.map((t: WantedSkillTag) => t.title).join(' ') || ''}`.toLowerCase();
        const keywordMatch = params.keywords.length === 0 || params.keywords.some(k => matchText.includes(k.toLowerCase()));
        if (!keywordMatch) continue;

        jobs.push(this.listItemToJob(item));
        if (jobs.length >= limit) break;
      }

      return jobs;
    } catch (error) {
      console.error('원티드 검색 실패:', error);
      return [];
    }
  }

  async fetchDetail(sourceIdOrUrl: string): Promise<JobPosting | null> {
    try {
      // URL에서 ID 추출
      const id = sourceIdOrUrl.match(/\/wd\/(\d+)/)?.[1] || sourceIdOrUrl;

      const response = await fetch(`${this.baseUrl}/jobs/${id}`, {
        headers: {
          'Accept': 'application/json',
          'Wanted-User-Agent': 'user',
        },
      });

      if (!response.ok) return null;

      const data = await response.json() as WantedJobDetailResponse;
      const job = data.job;
      if (!job) return null;

      return this.detailToJob(job);
    } catch (error) {
      console.error('원티드 상세 조회 실패:', error);
      return null;
    }
  }

  private buildYearsParam(min?: number, max?: number): string {
    if (min !== undefined && max !== undefined) return `${min}`;
    if (min !== undefined) return `${min}`;
    return '-1'; // 전체
  }

  private listItemToJob(item: WantedJobListItem): JobPosting {
    const skillTags = item.skill_tags?.map((t: WantedSkillTag) => t.title) || [];

    return {
      id: generateId('jp'),
      source: 'wanted',
      source_id: item.id.toString(),
      company_name: item.company?.name || '',
      job_title: item.position || '',
      job_category: 'other',
      experience_min: item.detail?.requirements?.match(/(\d+)년/)?.[1] ? parseInt(item.detail?.requirements?.match(/(\d+)년/)![1]) : null,
      experience_max: null,
      employment_type: '정규직',
      location: item.address?.full_location || '',
      salary_text: null,
      required_skills: skillTags,
      preferred_skills: [],
      responsibilities: [],
      qualifications: [],
      preferences: [],
      deadline: item.due_time || null,
      url: `https://www.wanted.co.kr/wd/${item.id}`,
      raw_text: '',
      fetched_at: new Date().toISOString(),
    };
  }

  private detailToJob(job: WantedJobDetail): JobPosting {
    const rawText = [
      job.detail?.main_tasks,
      job.detail?.requirements,
      job.detail?.preferred_points,
      job.detail?.intro,
      job.detail?.benefits,
    ].filter(Boolean).join('\n\n');

    const normalized = normalizeJobText(rawText, job.position);
    const skillTags = job.skill_tags?.map((t: WantedSkillTag) => t.title) || [];

    // 원티드 API 스킬태그 + 텍스트 추출 스킬 병합
    const allRequired = new Set([...skillTags, ...normalized.required_skills]);

    return {
      id: generateId('jp'),
      source: 'wanted',
      source_id: job.id.toString(),
      company_name: job.company?.name || '',
      job_title: job.position || '',
      job_category: normalized.job_category,
      experience_min: normalized.experience_min,
      experience_max: normalized.experience_max,
      employment_type: normalized.employment_type,
      location: job.address?.full_location || normalized.location,
      salary_text: normalized.salary_text,
      required_skills: Array.from(allRequired),
      preferred_skills: normalized.preferred_skills,
      responsibilities: normalized.responsibilities.length > 0
        ? normalized.responsibilities
        : extractBulletList(job.detail?.main_tasks || ''),
      qualifications: normalized.qualifications.length > 0
        ? normalized.qualifications
        : extractBulletList(job.detail?.requirements || ''),
      preferences: normalized.preferences.length > 0
        ? normalized.preferences
        : extractBulletList(job.detail?.preferred_points || ''),
      deadline: job.due_time || null,
      url: `https://www.wanted.co.kr/wd/${job.id}`,
      raw_text: rawText,
      fetched_at: new Date().toISOString(),
    };
  }
}

function extractBulletList(text: string): string[] {
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 3)
    .map(l => l.replace(/^[-•·▪▸►◦]\s*/, '').trim())
    .filter(l => l.length > 3);
}

// --- 원티드 API 응답 타입 ---

interface WantedSkillTag {
  title: string;
}

interface WantedJobListItem {
  id: number;
  position: string;
  company?: { name: string };
  address?: { full_location: string };
  skill_tags?: WantedSkillTag[];
  due_time?: string;
  detail?: { requirements?: string };
}

interface WantedJobListResponse {
  data: WantedJobListItem[];
}

interface WantedJobDetail {
  id: number;
  position: string;
  company?: { name: string };
  address?: { full_location: string };
  skill_tags?: WantedSkillTag[];
  due_time?: string;
  detail?: {
    main_tasks?: string;
    requirements?: string;
    preferred_points?: string;
    intro?: string;
    benefits?: string;
  };
}

interface WantedJobDetailResponse {
  job: WantedJobDetail;
}
