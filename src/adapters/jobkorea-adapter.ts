/**
 * 잡코리아(JobKorea) 채용공고 어댑터
 * 잡코리아 웹 검색 API를 통해 공고 검색
 *
 * 잡코리아는 공식 Open API가 없어 웹 검색 엔드포인트 사용
 * API 구조가 변경될 수 있으므로 에러 핸들링 강화
 */

import type { SourceAdapter, SourceSearchResult } from './base-adapter.js';
import type { JobPosting, JobSearchParams, JobCategory } from '../types/job.js';
import { normalizeJobText } from '../core/job-normalizer.js';
import { generateId } from '../core/utils.js';
import * as cheerio from 'cheerio';

// 잡코리아 직무 코드 매핑
const JOBKOREA_DUTY_CODE: Record<string, string> = {
  backend: '1000105',        // 웹개발
  frontend: '1000105',       // 웹개발 (프론트 별도 코드 없음)
  fullstack: '1000105',
  mobile: '1000106',         // 모바일개발
  data: '1000112',           // 데이터
  devops: '1000108',         // 시스템
  ai_ml: '1000113',          // AI/ML
  security: '1000110',       // 보안
  other: '1000100',          // IT 전체
};

export class JobkoreaAdapter implements SourceAdapter {
  source = 'jobkorea' as const;
  private baseUrl = 'https://www.jobkorea.co.kr/Search';

  isAvailable(): boolean {
    // 잡코리아는 웹 스크래핑 방식 — 별도 키 불필요하나 rate limiting 주의
    return true;
  }

  async search(params: JobSearchParams): Promise<JobPosting[]> {
    return (await this.searchWithMeta(params)).jobs;
  }

  async searchWithMeta(params: JobSearchParams): Promise<SourceSearchResult> {
    try {
      const query = params.keywords.join(' ');

      // 잡코리아 검색 API 엔드포인트
      const apiUrl = `https://www.jobkorea.co.kr/Search/?stext=${encodeURIComponent(query)}&tabType=recruit&Page_No=1&Ord=BestMatch`;

      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'text/html,application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });

      if (!response.ok) {
        console.error(`잡코리아 검색 에러: ${response.status}`);
        return { jobs: [], warnings: [`파서 오류 - 응답 상태 ${response.status}`] };
      }

      const html = await response.text();
      return { jobs: this.parseSearchResults(html, params), warnings: [] };
    } catch (error) {
      console.error('잡코리아 검색 실패:', error);
      return { jobs: [], warnings: [`파서 오류 - ${error instanceof Error ? error.message : String(error)}`] };
    }
  }

  async fetchDetail(sourceIdOrUrl: string): Promise<JobPosting | null> {
    try {
      // URL 처리
      const detailUrl = sourceIdOrUrl.startsWith('http')
        ? sourceIdOrUrl
        : `https://www.jobkorea.co.kr/Recruit/GI_Read/${sourceIdOrUrl}`;

      const response = await fetch(detailUrl, {
        headers: {
          'Accept': 'text/html',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
      });

      if (!response.ok) return null;

      const html = await response.text();
      return this.parseDetailPage(html, detailUrl);
    } catch (error) {
      console.error('잡코리아 상세 조회 실패:', error);
      return null;
    }
  }

  private parseSearchResults(html: string, params: JobSearchParams): JobPosting[] {
    const $ = cheerio.load(html);
    const jobs: JobPosting[] = [];
    const limit = params.limit || 20;

    $('[data-sentry-component="CardJob"]').each((_, element) => {
      if (jobs.length >= limit) return false;

      const card = $(element);
      const titleLink = card.find('[data-sentry-component="Title"]').first();
      const href = titleLink.attr('href') || '';
      const sourceId = href.match(/GI_Read\/(\d+)/)?.[1];
      if (!href || !sourceId) return;

      const title = cleanText(titleLink.text());
      if (!title) return;

      const company = cleanText(
        card.find('[data-sentry-component="CompanyName"]').first().text()
        || card.find('span.mb-5 a span').first().text()
      );
      const cardText = cleanText(card.text());
      const chips = card.find('[data-sentry-component="GrayChip"]')
        .toArray()
        .map(chip => cleanText($(chip).text()))
        .filter(Boolean);
      const normalized = normalizeJobText([title, company, ...chips, cardText].join('\n'), title);
      const location = chips.find(text => /(서울|경기|부산|대구|인천|광주|대전|울산|세종|판교|성남)/.test(text))
        || normalized.location;
      const expMin = extractExperience(cardText) ?? normalized.experience_min;

      jobs.push({
        id: generateId('jp'),
        source: 'jobkorea',
        source_id: sourceId,
        company_name: company,
        job_title: title,
        job_category: params.job_category || normalized.job_category,
        experience_min: expMin,
        experience_max: null,
        employment_type: normalized.employment_type,
        location,
        salary_text: null,
        required_skills: normalized.required_skills,
        preferred_skills: [],
        responsibilities: [],
        qualifications: [],
        preferences: [],
        deadline: null,
        url: normalizeUrl(href),
        raw_text: '',
        fetched_at: new Date().toISOString(),
      });
    });

    return jobs;
  }

  private parseDetailPage(html: string, url: string): JobPosting | null {
    const $ = cheerio.load(html);
    const posting = extractJobPostingSchema($);
    const title = cleanText(
      posting?.title
      || $('meta[property="og:title"]').attr('content')?.replace(/\s*\|\s*잡코리아\s*$/, '')
      || ''
    );
    const company = cleanText(posting?.hiringOrganization?.name || '');

    if (!title) return null;

    const recruitmentText = cleanText($('[data-sentry-component="RecruitmentGuidelines"]').text());
    const qualificationText = cleanText($('[data-sentry-component="Qualification"]').text());
    const benefitText = cleanText($('[data-sentry-component="BenefitCard"]').text());
    const descriptionText = cleanText(posting?.description || '');
    const rawText = [
      buildSection('공고 요약', descriptionText),
      buildSection('모집요강', recruitmentText),
      buildSection('지원자격', qualificationText),
      buildSection('복리후생', benefitText),
    ].filter(Boolean).join('\n\n');
    const normalized = normalizeJobText(rawText, title);
    const location = cleanText(
      posting?.jobLocation?.address?.streetAddress
      || normalized.location
      || ''
    );
    const experienceMin = extractExperience(qualificationText) ?? normalized.experience_min;

    return {
      id: generateId('jp'),
      source: 'jobkorea',
      source_id: posting?.identifier?.value || url.match(/GI_Read\/(\d+)/)?.[1] || '',
      company_name: company,
      job_title: title,
      job_category: normalized.job_category,
      experience_min: experienceMin,
      experience_max: normalized.experience_max,
      employment_type: mapEmploymentType(posting?.employmentType, normalized.employment_type),
      location,
      salary_text: normalized.salary_text,
      required_skills: normalized.required_skills,
      preferred_skills: normalized.preferred_skills,
      responsibilities: normalized.responsibilities.length > 0
        ? normalized.responsibilities
        : extractLines(recruitmentText),
      qualifications: normalized.qualifications.length > 0
        ? normalized.qualifications
        : extractLines(qualificationText),
      preferences: normalized.preferences,
      deadline: posting?.validThrough || normalized.deadline,
      url,
      raw_text: rawText,
      fetched_at: new Date().toISOString(),
    };
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}

function cleanText(text: string): string {
  return stripHtml(text)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url, 'https://www.jobkorea.co.kr');
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function extractExperience(text: string): number | null {
  if (/신입/.test(text)) return 0;
  const value = text.match(/경력\s*\(?\s*(\d+)년/)?.[1] || text.match(/(\d+)년[↑이상]*/)?.[1];
  return value ? parseInt(value, 10) : null;
}

function extractLines(text: string): string[] {
  return text
    .split(/(?<=다\.)\s+|(?<=요\.)\s+|(?<=니다\.)\s+|\n+/)
    .map(line => line.trim().replace(/^[-•·▪▸►◦]\s*/, ''))
    .filter(line => line.length > 3);
}

function buildSection(label: string, value: string): string {
  return value ? `${label}\n${value}` : '';
}

function mapEmploymentType(schemaType?: string | string[], fallback = '정규직'): string {
  const normalized = Array.isArray(schemaType)
    ? schemaType.join(' ').toUpperCase()
    : (schemaType || '').toUpperCase();
  if (normalized.includes('CONTRACT')) return '계약직';
  if (normalized.includes('PART_TIME')) return '아르바이트';
  if (normalized.includes('INTERN')) return '인턴';
  if (normalized.includes('TEMPORARY')) return '계약직';
  if (normalized.includes('FULL_TIME')) return '정규직';
  return fallback;
}

function extractJobPostingSchema($: cheerio.CheerioAPI): JobPostingSchema | null {
  const scripts = $('script[type="application/ld+json"]').toArray();

  for (const script of scripts) {
    const raw = $(script).html();
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as JobPostingSchema | JobPostingSchema[];
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      const jobPosting = candidates.find(item => item?.['@type'] === 'JobPosting');
      if (jobPosting) return jobPosting;
    } catch {
      continue;
    }
  }

  return null;
}

interface JobPostingSchema {
  '@type'?: string;
  title?: string;
  description?: string;
  validThrough?: string;
  employmentType?: string | string[];
  hiringOrganization?: {
    name?: string;
  };
  jobLocation?: {
    address?: {
      streetAddress?: string;
    };
  };
  identifier?: {
    value?: string;
  };
}
