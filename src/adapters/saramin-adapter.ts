/**
 * 사람인(Saramin) 채용공고 어댑터
 * 공식 API가 있으면 우선 사용하고, 없으면 웹 크롤링으로 폴백한다.
 */

import type { SourceAdapter, SourceSearchResult } from './base-adapter.js';
import type { JobPosting, JobSearchParams, JobCategory } from '../types/job.js';
import { normalizeJobText } from '../core/job-normalizer.js';
import { generateId } from '../core/utils.js';
import * as cheerio from 'cheerio';

// 사람인 직무 코드 매핑
const SARAMIN_JOB_CODE: Record<string, string> = {
  backend: '84',
  frontend: '92',
  fullstack: '84,92',
  mobile: '88',
  data: '91',
  devops: '89',
  ai_ml: '236',
  security: '95',
  other: '2',
};

// 사람인 지역 코드 매핑
const SARAMIN_LOCATION: Record<string, string> = {
  '서울': '101000',
  '경기': '102000',
  '인천': '108000',
  '부산': '106000',
  '대구': '104000',
  '광주': '103000',
  '대전': '105000',
  '울산': '107000',
  '세종': '118000',
  '판교': '102190',
};

const SARAMIN_CATEGORY_KEYWORDS: Array<[string, JobCategory]> = [
  ['백엔드', 'backend'],
  ['서버', 'backend'],
  ['프론트', 'frontend'],
  ['풀스택', 'fullstack'],
  ['안드로이드', 'mobile'],
  ['ios', 'mobile'],
  ['모바일', 'mobile'],
  ['데이터', 'data'],
  ['ml', 'ai_ml'],
  ['ai', 'ai_ml'],
  ['머신러닝', 'ai_ml'],
  ['devops', 'devops'],
  ['sre', 'devops'],
  ['인프라', 'devops'],
  ['클라우드', 'devops'],
  ['보안', 'security'],
];

export class SaraminAdapter implements SourceAdapter {
  source = 'saramin' as const;
  private baseUrl = 'https://oapi.saramin.co.kr/recruit';
  private apiKey: string | null;

  constructor() {
    this.apiKey = process.env.SARAMIN_API_KEY || null;
  }

  isAvailable(): boolean {
    return true;
  }

  async search(params: JobSearchParams): Promise<JobPosting[]> {
    return (await this.searchWithMeta(params)).jobs;
  }

  async searchWithMeta(params: JobSearchParams): Promise<SourceSearchResult> {
    const warnings: string[] = [];

    if (this.apiKey) {
      try {
        return {
          jobs: await this.searchByApi(params),
          warnings,
        };
      } catch (error) {
        warnings.push(`API 검색 실패 - 웹 크롤링으로 재시도합니다 (${error instanceof Error ? error.message : String(error)})`);
      }
    } else {
      warnings.push('API 키가 없어 웹 크롤링 폴백을 사용했습니다.');
    }

    return {
      jobs: await this.searchByCrawling(params),
      warnings,
    };
  }

  async fetchDetail(sourceIdOrUrl: string): Promise<JobPosting | null> {
    if (this.apiKey) {
      try {
        const job = await this.fetchDetailByApi(sourceIdOrUrl);
        if (job) return job;
      } catch {
        // API 실패 시 크롤링 폴백
      }
    }

    return this.fetchDetailByCrawling(sourceIdOrUrl);
  }

  private async searchByApi(params: JobSearchParams): Promise<JobPosting[]> {
    if (!this.apiKey) return [];

    const url = new URL(this.baseUrl);
    url.searchParams.set('access-key', this.apiKey);
    url.searchParams.set('output', 'json');
    url.searchParams.set('count', (params.limit || 20).toString());
    url.searchParams.set('start', '0');

    if (params.keywords.length > 0) {
      url.searchParams.set('keywords', params.keywords.join(' '));
    }

    if (params.job_category) {
      const code = SARAMIN_JOB_CODE[params.job_category] || SARAMIN_JOB_CODE.other;
      url.searchParams.set('job_type', code);
    }

    if (params.location) {
      const locCode = SARAMIN_LOCATION[params.location];
      if (locCode) url.searchParams.set('loc_cd', locCode);
    }

    if (params.experience_min !== undefined) {
      url.searchParams.set('career', `${params.experience_min}`);
    }

    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`사람인 API ${response.status}`);
    }

    const data = await response.json() as SaraminResponse;
    const items = data.jobs?.job || [];
    return items.map(item => this.toApiJobPosting(item));
  }

  private async searchByCrawling(params: JobSearchParams): Promise<JobPosting[]> {
    const limit = params.limit || 20;
    const url = new URL('https://www.saramin.co.kr/zf_user/search/recruit');
    url.searchParams.set('searchword', params.keywords.join(' '));

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    if (!response.ok) {
      throw new Error(`사람인 웹 검색 ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const jobs: JobPosting[] = [];

    $('.item_recruit').each((_, element) => {
      if (jobs.length >= limit) return false;

      const item = $(element);
      const link = item.find('.job_tit a[href*="rec_idx="]').first();
      const href = link.attr('href') || '';
      const sourceId = extractSaraminId(href);
      const title = cleanText(link.text());
      const company = cleanText(item.find('.corp_name').first().text());
      const conditionTexts = item.find('.job_condition span').toArray().map(span => cleanText($(span).text())).filter(Boolean);
      const sectorTexts = item.find('.job_sector a').toArray().map(anchor => cleanText($(anchor).text())).filter(Boolean);
      const location = conditionTexts[0] || '';
      const experienceText = conditionTexts.find(text => text.includes('경력') || text.includes('신입')) || '';
      const employmentType = conditionTexts[3] || '정규직';
      const rawText = [
        title,
        company,
        location,
        experienceText,
        employmentType,
        sectorTexts.join(', '),
      ].filter(Boolean).join('\n');
      const normalized = normalizeJobText(rawText, title);

      if (!sourceId || !title) return;

      const job: JobPosting = {
        id: generateId('jp'),
        source: 'saramin',
        source_id: sourceId,
        company_name: company,
        job_title: title,
        job_category: detectSaraminCategory([...sectorTexts, title].join(' ')) || normalized.job_category,
        experience_min: parseExperienceText(experienceText)?.min ?? normalized.experience_min,
        experience_max: parseExperienceText(experienceText)?.max ?? normalized.experience_max,
        employment_type: employmentType,
        location,
        salary_text: null,
        required_skills: normalized.required_skills,
        preferred_skills: normalized.preferred_skills,
        responsibilities: normalized.responsibilities,
        qualifications: normalized.qualifications,
        preferences: normalized.preferences,
        deadline: cleanText(item.find('.job_date .date').first().text()) || null,
        url: normalizeSaraminUrl(href),
        raw_text: rawText,
        fetched_at: new Date().toISOString(),
      };

      if (!this.matchesSearch(job, params)) return;
      jobs.push(job);
    });

    return jobs;
  }

  private async fetchDetailByApi(sourceIdOrUrl: string): Promise<JobPosting | null> {
    if (!this.apiKey) return null;

    const id = extractSaraminId(sourceIdOrUrl) || sourceIdOrUrl.match(/(\d+)/)?.[1] || sourceIdOrUrl;
    const url = new URL(this.baseUrl);
    url.searchParams.set('access-key', this.apiKey);
    url.searchParams.set('output', 'json');
    url.searchParams.set('id', id);

    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json() as SaraminResponse;
    const job = data.jobs?.job?.[0];
    if (!job) return null;

    return this.toApiJobPosting(job);
  }

  private async fetchDetailByCrawling(sourceIdOrUrl: string): Promise<JobPosting | null> {
    const sourceId = extractSaraminId(sourceIdOrUrl) || sourceIdOrUrl.match(/(\d+)/)?.[1] || sourceIdOrUrl;
    const url = sourceIdOrUrl.startsWith('http')
      ? sourceIdOrUrl
      : `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${sourceId}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);
    const metaDescription = $('meta[property="og:description"]').attr('content')
      || $('meta[name="Description"]').attr('content')
      || '';
    const parsed = parseSaraminMetaDescription(metaDescription);
    if (!parsed.title) return null;

    const rawText = [
      parsed.company_name,
      parsed.title,
      parsed.experience_text,
      parsed.location,
      parsed.salary_text,
      parsed.deadline,
      metaDescription,
    ].filter(Boolean).join('\n');
    const normalized = normalizeJobText(rawText, parsed.title);
    const parsedExperience = parseExperienceText(parsed.experience_text);

    return {
      id: generateId('jp'),
      source: 'saramin',
      source_id: sourceId,
      company_name: parsed.company_name,
      job_title: parsed.title,
      job_category: detectSaraminCategory(`${parsed.title} ${metaDescription}`) || normalized.job_category,
      experience_min: parsedExperience?.min ?? normalized.experience_min,
      experience_max: parsedExperience?.max ?? normalized.experience_max,
      employment_type: normalized.employment_type,
      location: parsed.location || normalized.location,
      salary_text: parsed.salary_text || normalized.salary_text,
      required_skills: normalized.required_skills,
      preferred_skills: normalized.preferred_skills,
      responsibilities: normalized.responsibilities,
      qualifications: normalized.qualifications,
      preferences: normalized.preferences,
      deadline: parsed.deadline || normalized.deadline,
      url: normalizeSaraminUrl(url),
      raw_text: rawText,
      fetched_at: new Date().toISOString(),
    };
  }

  private toApiJobPosting(item: SaraminJob): JobPosting {
    const rawText = [
      item.position?.title,
      item.position?.['job-type']?.name,
      item.position?.['experience-level']?.name,
      item.position?.location?.name,
      item.keyword,
    ].filter(Boolean).join('\n');

    const normalized = normalizeJobText(rawText, item.position?.title || '');
    const keywords = (item.keyword || '').split(',').map(k => k.trim()).filter(Boolean);

    return {
      id: generateId('jp'),
      source: 'saramin',
      source_id: item.id?.toString() || '',
      company_name: item.company?.detail?.name || '',
      job_title: item.position?.title || '',
      job_category: normalized.job_category,
      experience_min: parseApiExperience(item.position?.['experience-level']?.code),
      experience_max: null,
      employment_type: item.position?.['job-type']?.name || '정규직',
      location: item.position?.location?.name || '',
      salary_text: item.salary?.name || null,
      required_skills: keywords.length > 0 ? keywords : normalized.required_skills,
      preferred_skills: normalized.preferred_skills,
      responsibilities: normalized.responsibilities,
      qualifications: normalized.qualifications,
      preferences: normalized.preferences,
      deadline: item['expiration-date'] || null,
      url: item.url || `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${item.id}`,
      raw_text: rawText,
      fetched_at: new Date().toISOString(),
    };
  }

  private matchesSearch(job: JobPosting, params: JobSearchParams): boolean {
    if (params.keywords.length > 0) {
      const matchText = [
        job.job_title,
        job.company_name,
        job.location,
        ...job.required_skills,
        job.raw_text,
      ].join(' ').toLowerCase();

      if (!params.keywords.some(keyword => matchText.includes(keyword.toLowerCase()))) {
        return false;
      }
    }

    if (params.location && job.location && !job.location.includes(params.location)) {
      return false;
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

    return true;
  }
}

function parseApiExperience(code?: number): number | null {
  if (code === undefined || code === null) return null;
  if (code === 0) return 0;
  if (code >= 1) return code;
  return null;
}

function parseExperienceText(text?: string): { min: number | null; max: number | null } | null {
  if (!text) return null;
  if (text.includes('경력무관') || text.includes('신입/경력') || text.includes('신입·경력')) {
    return { min: 0, max: null };
  }
  if (text.includes('신입')) {
    return { min: 0, max: 0 };
  }

  const range = text.match(/(\d+)\s*[~\-]\s*(\d+)년/);
  if (range) {
    return { min: parseInt(range[1], 10), max: parseInt(range[2], 10) };
  }

  const minOnly = text.match(/(\d+)년\s*(이상|↑)/);
  if (minOnly) {
    return { min: parseInt(minOnly[1], 10), max: null };
  }

  const single = text.match(/(\d+)년/);
  if (single) {
    const value = parseInt(single[1], 10);
    return { min: value, max: value };
  }

  return null;
}

function extractSaraminId(value: string): string | null {
  return value.match(/rec_idx=(\d+)/)?.[1] || value.match(/(\d+)/)?.[1] || null;
}

function normalizeSaraminUrl(url: string): string {
  try {
    const parsed = new URL(url, 'https://www.saramin.co.kr');
    const recIdx = extractSaraminId(parsed.toString());
    return recIdx
      ? `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${recIdx}`
      : parsed.toString();
  } catch {
    return url;
  }
}

function cleanText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectSaraminCategory(text: string): JobCategory | null {
  const normalized = text.toLowerCase();
  for (const [keyword, category] of SARAMIN_CATEGORY_KEYWORDS) {
    if (normalized.includes(keyword.toLowerCase())) {
      return category;
    }
  }
  return null;
}

function parseSaraminMetaDescription(content: string): {
  company_name: string;
  title: string;
  experience_text: string;
  location: string;
  salary_text: string;
  deadline: string;
} {
  const tokens = content.split(',').map(token => token.trim()).filter(Boolean);
  const experience = tokens.find(token => token.startsWith('경력:'))?.replace(/^경력:/, '').trim() || '';
  const location = tokens.find(token => token.startsWith('지역:'))?.replace(/^지역:/, '').trim() || '';
  const salary = tokens.find(token => token.includes('만원') || token.includes('협의') || token.includes('면접 후 결정')) || '';
  const deadline = tokens.find(token => token.startsWith('마감일:'))?.replace(/^마감일:/, '').trim() || '';

  return {
    company_name: tokens[0] || '',
    title: tokens[1] || '',
    experience_text: experience,
    location,
    salary_text: salary,
    deadline,
  };
}

// --- 사람인 API 응답 타입 ---

interface SaraminResponse {
  jobs?: {
    job?: SaraminJob[];
    count?: number;
    total?: number;
  };
}

interface SaraminJob {
  id?: number;
  url?: string;
  keyword?: string;
  'expiration-date'?: string;
  company?: {
    detail?: { name: string; href?: string };
  };
  position?: {
    title?: string;
    'job-type'?: { code?: number; name?: string };
    'experience-level'?: { code?: number; name?: string };
    location?: { name?: string; code?: string };
    'required-education-level'?: { name?: string };
  };
  salary?: {
    name?: string;
    code?: number;
  };
}
