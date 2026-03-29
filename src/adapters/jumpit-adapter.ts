/**
 * 점핏(Jumpit) 채용공고 어댑터
 * 점핏 내부 API를 통해 공고 검색 및 상세 조회
 *
 * 점핏은 개발자 특화 플랫폼으로 기술 태그 기반 검색이 강력함
 */

import type { SourceAdapter } from './base-adapter.js';
import type { JobPosting, JobSearchParams, JobCategory } from '../types/job.js';
import { normalizeJobText } from '../core/job-normalizer.js';
import { generateId } from '../core/utils.js';

// 점핏 기술 태그 ID 매핑
const JUMPIT_TECH_TAG: Record<string, number> = {
  'java': 1,
  'javascript': 2,
  'typescript': 3,
  'python': 4,
  'kotlin': 5,
  'swift': 6,
  'go': 7,
  'rust': 8,
  'c++': 9,
  'c#': 10,
  'react': 11,
  'vue': 12,
  'angular': 13,
  'next.js': 14,
  'spring': 15,
  'spring boot': 16,
  'node.js': 17,
  'django': 18,
  'fastapi': 19,
  'aws': 20,
  'docker': 21,
  'kubernetes': 22,
  'mysql': 23,
  'postgresql': 24,
  'mongodb': 25,
  'redis': 26,
};

// 점핏 직무 카테고리
const JUMPIT_JOB_CATEGORY: Record<string, number> = {
  backend: 1,
  frontend: 2,
  fullstack: 3,
  mobile: 4,
  data: 6,
  devops: 8,
  ai_ml: 7,
  security: 12,
  other: 0,
};

export class JumpitAdapter implements SourceAdapter {
  source = 'jumpit' as const;
  private baseUrl = 'https://api.jumpit.co.kr/api';

  isAvailable(): boolean {
    return true; // 점핏 API는 키 불필요
  }

  async search(params: JobSearchParams): Promise<JobPosting[]> {
    try {
      const limit = params.limit || 20;

      // 점핏 API 호출
      const url = new URL(`${this.baseUrl}/positions`);
      url.searchParams.set('page', '1');
      url.searchParams.set('size', limit.toString());
      url.searchParams.set('sort', 'relation');

      // 직무 카테고리
      if (params.job_category) {
        const catId = JUMPIT_JOB_CATEGORY[params.job_category];
        if (catId) url.searchParams.set('jobCategory', catId.toString());
      }

      // 기술 태그로 검색
      const techTagIds: number[] = [];
      for (const keyword of params.keywords) {
        const tagId = JUMPIT_TECH_TAG[keyword.toLowerCase()];
        if (tagId) techTagIds.push(tagId);
      }
      if (techTagIds.length > 0) {
        url.searchParams.set('techStack', techTagIds.join(','));
      }

      // 경력
      if (params.experience_min !== undefined) {
        url.searchParams.set('career', params.experience_min.toString());
      }

      // 지역
      if (params.location) {
        url.searchParams.set('city', params.location);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        // 점핏 API가 안 될 경우 웹 검색 폴백
        console.error(`점핏 API 에러: ${response.status}`);
        return this.fallbackWebSearch(params);
      }

      const data = await response.json() as JumpitListResponse;
      const items = data.result?.positions || data.data || [];

      return items.slice(0, limit).map(item => this.toJobPosting(item));
    } catch (error) {
      console.error('점핏 검색 실패:', error);
      return this.fallbackWebSearch(params);
    }
  }

  async fetchDetail(sourceIdOrUrl: string): Promise<JobPosting | null> {
    try {
      // URL에서 ID 추출
      const id = sourceIdOrUrl.match(/position\/(\d+)/)?.[1]
        || sourceIdOrUrl.match(/(\d+)/)?.[1]
        || sourceIdOrUrl;

      const response = await fetch(`${this.baseUrl}/position/${id}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (!response.ok) return null;

      const data = await response.json() as JumpitDetailResponse;
      const position = data.result || data.data;
      if (!position) return null;

      return this.detailToJobPosting(position);
    } catch (error) {
      console.error('점핏 상세 조회 실패:', error);
      return null;
    }
  }

  private async fallbackWebSearch(params: JobSearchParams): Promise<JobPosting[]> {
    // 점핏 웹 검색 결과 페이지 파싱 (API 실패 시 폴백)
    try {
      const query = params.keywords.join('+');
      const url = `https://www.jumpit.co.kr/positions?search=${encodeURIComponent(query)}`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (!response.ok) return [];

      const html = await response.text();
      return this.parseWebSearchResults(html, params);
    } catch {
      return [];
    }
  }

  private parseWebSearchResults(html: string, params: JobSearchParams): JobPosting[] {
    const jobs: JobPosting[] = [];
    const limit = params.limit || 20;

    // 점핏 카드 형태의 검색 결과 파싱
    const cardRegex = /<a[^>]*href="\/position\/(\d+)"[^>]*>([\s\S]*?)<\/a>/gi;

    let match;
    while ((match = cardRegex.exec(html)) !== null && jobs.length < limit) {
      const id = match[1];
      const content = match[2];

      const titleMatch = content.match(/<h2[^>]*>(.*?)<\/h2>/i) || content.match(/<p[^>]*class="[^"]*title[^"]*"[^>]*>(.*?)<\/p>/i);
      const companyMatch = content.match(/<p[^>]*class="[^"]*company[^"]*"[^>]*>(.*?)<\/p>/i);

      const title = titleMatch ? stripHtml(titleMatch[1]) : '';
      const company = companyMatch ? stripHtml(companyMatch[1]) : '';

      if (!title) continue;

      jobs.push({
        id: generateId('jp'),
        source: 'jumpit',
        source_id: id,
        company_name: company,
        job_title: title,
        job_category: params.job_category || 'other',
        experience_min: null,
        experience_max: null,
        employment_type: '정규직',
        location: '',
        salary_text: null,
        required_skills: [],
        preferred_skills: [],
        responsibilities: [],
        qualifications: [],
        preferences: [],
        deadline: null,
        url: `https://www.jumpit.co.kr/position/${id}`,
        raw_text: '',
        fetched_at: new Date().toISOString(),
      });
    }

    return jobs;
  }

  private toJobPosting(item: JumpitPosition): JobPosting {
    const techStacks = item.techStacks || item.skillTags || [];
    const techNames = techStacks.map((t: any) =>
      typeof t === 'string' ? t : t.name || t.stack || ''
    ).filter(Boolean);

    return {
      id: generateId('jp'),
      source: 'jumpit',
      source_id: (item.id || '').toString(),
      company_name: item.companyName || item.company?.name || '',
      job_title: item.title || item.position || '',
      job_category: mapJumpitCategory(item.jobCategory),
      experience_min: item.minCareer ?? null,
      experience_max: item.maxCareer ?? null,
      employment_type: item.employmentType || '정규직',
      location: item.locations?.join(', ') || item.address || '',
      salary_text: item.salary || null,
      required_skills: techNames,
      preferred_skills: [],
      responsibilities: [],
      qualifications: [],
      preferences: [],
      deadline: item.closedAt || null,
      url: `https://www.jumpit.co.kr/position/${item.id}`,
      raw_text: '',
      fetched_at: new Date().toISOString(),
    };
  }

  private detailToJobPosting(item: JumpitPositionDetail): JobPosting {
    const techNames = (item.techStacks || []).map((t: any) =>
      typeof t === 'string' ? t : t.name || t.stack || ''
    ).filter(Boolean);

    const rawText = [
      item.mainTask || item.qualifications,
      item.preferredExperience,
      item.benefits,
    ].filter(Boolean).join('\n\n');

    const normalized = normalizeJobText(rawText, item.title || '');

    return {
      id: generateId('jp'),
      source: 'jumpit',
      source_id: (item.id || '').toString(),
      company_name: item.companyName || item.company?.name || '',
      job_title: item.title || '',
      job_category: normalized.job_category,
      experience_min: item.minCareer ?? normalized.experience_min,
      experience_max: item.maxCareer ?? normalized.experience_max,
      employment_type: item.employmentType || '정규직',
      location: item.locations?.join(', ') || item.address || '',
      salary_text: item.salary || null,
      required_skills: techNames.length > 0 ? techNames : normalized.required_skills,
      preferred_skills: normalized.preferred_skills,
      responsibilities: normalized.responsibilities.length > 0
        ? normalized.responsibilities
        : extractLines(item.mainTask),
      qualifications: normalized.qualifications.length > 0
        ? normalized.qualifications
        : extractLines(item.qualifications),
      preferences: normalized.preferences.length > 0
        ? normalized.preferences
        : extractLines(item.preferredExperience),
      deadline: item.closedAt || null,
      url: `https://www.jumpit.co.kr/position/${item.id}`,
      raw_text: rawText,
      fetched_at: new Date().toISOString(),
    };
  }
}

function mapJumpitCategory(cat?: number | string): JobCategory {
  if (!cat) return 'other';
  const map: Record<string, JobCategory> = {
    '1': 'backend', '2': 'frontend', '3': 'fullstack', '4': 'mobile',
    '6': 'data', '7': 'ai_ml', '8': 'devops', '12': 'security',
  };
  return map[String(cat)] || 'other';
}

function extractLines(text?: string): string[] {
  if (!text) return [];
  return text.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 3)
    .map(l => l.replace(/^[-•·▪▸►◦]\s*/, '').trim())
    .filter(l => l.length > 3);
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

// --- 점핏 API 응답 타입 ---

interface JumpitPosition {
  id?: number;
  title?: string;
  position?: string;
  companyName?: string;
  company?: { name: string };
  jobCategory?: number;
  techStacks?: any[];
  skillTags?: any[];
  minCareer?: number;
  maxCareer?: number;
  employmentType?: string;
  locations?: string[];
  address?: string;
  salary?: string;
  closedAt?: string;
}

interface JumpitPositionDetail extends JumpitPosition {
  mainTask?: string;
  qualifications?: string;
  preferredExperience?: string;
  benefits?: string;
}

interface JumpitListResponse {
  result?: { positions: JumpitPosition[] };
  data?: JumpitPosition[];
}

interface JumpitDetailResponse {
  result?: JumpitPositionDetail;
  data?: JumpitPositionDetail;
}
