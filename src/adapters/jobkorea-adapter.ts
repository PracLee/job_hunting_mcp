/**
 * 잡코리아(JobKorea) 채용공고 어댑터
 * 잡코리아 웹 검색 API를 통해 공고 검색
 *
 * 잡코리아는 공식 Open API가 없어 웹 검색 엔드포인트 사용
 * API 구조가 변경될 수 있으므로 에러 핸들링 강화
 */

import type { SourceAdapter } from './base-adapter.js';
import type { JobPosting, JobSearchParams, JobCategory } from '../types/job.js';
import { normalizeJobText } from '../core/job-normalizer.js';
import { generateId } from '../core/utils.js';

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
    try {
      const query = params.keywords.join(' ');
      const url = new URL(`${this.baseUrl}/?stext=${encodeURIComponent(query)}`);

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
        return [];
      }

      const html = await response.text();
      return this.parseSearchResults(html, params);
    } catch (error) {
      console.error('잡코리아 검색 실패:', error);
      return [];
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
    const jobs: JobPosting[] = [];
    const limit = params.limit || 20;

    // 잡코리아 검색 결과 HTML 파싱
    // <div class="post"> ... </div> 구조
    const postRegex = /<div\s+class="post"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
    const titleRegex = /<a[^>]*class="title"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i;
    const companyRegex = /<a[^>]*class="name"[^>]*>([\s\S]*?)<\/a>/i;
    const optionRegex = /<span\s+class="opt"[^>]*>([\s\S]*?)<\/span>/gi;

    let match;
    while ((match = postRegex.exec(html)) !== null && jobs.length < limit) {
      const block = match[1];

      const titleMatch = titleRegex.exec(block);
      const companyMatch = companyRegex.exec(block);

      if (!titleMatch) continue;

      const href = titleMatch[1];
      const title = stripHtml(titleMatch[2]).trim();
      const company = companyMatch ? stripHtml(companyMatch[1]).trim() : '';

      // 옵션(경력/학력/지역/고용형태) 추출
      const options: string[] = [];
      let optMatch;
      while ((optMatch = optionRegex.exec(block)) !== null) {
        options.push(stripHtml(optMatch[1]).trim());
      }

      const location = options.find(o => /(서울|경기|부산|대구|인천|광주|대전|울산|세종|판교|성남)/.test(o)) || '';
      const expText = options.find(o => /경력|신입/.test(o)) || '';
      const empType = options.find(o => /정규직|계약직|인턴|파견직/.test(o)) || '정규직';

      const expMin = expText.match(/(\d+)년/)?.[1] ? parseInt(expText.match(/(\d+)년/)![1]) : null;

      const sourceId = href.match(/\/(\d+)/)?.[1] || Date.now().toString();

      jobs.push({
        id: generateId('jp'),
        source: 'jobkorea',
        source_id: sourceId,
        company_name: company,
        job_title: title,
        job_category: params.job_category || 'other',
        experience_min: expMin,
        experience_max: null,
        employment_type: empType,
        location,
        salary_text: null,
        required_skills: [],
        preferred_skills: [],
        responsibilities: [],
        qualifications: [],
        preferences: [],
        deadline: null,
        url: href.startsWith('http') ? href : `https://www.jobkorea.co.kr${href}`,
        raw_text: '',
        fetched_at: new Date().toISOString(),
      });
    }

    return jobs;
  }

  private parseDetailPage(html: string, url: string): JobPosting | null {
    // 상세 페이지 파싱
    const titleMatch = html.match(/<h3[^>]*class="hd_3"[^>]*>([\s\S]*?)<\/h3>/i);
    const companyMatch = html.match(/<a[^>]*class="coName"[^>]*>([\s\S]*?)<\/a>/i);

    // 상세 내용 영역
    const detailMatch = html.match(/<div[^>]*class="tbRow[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi);
    const rawText = detailMatch ? detailMatch.map(d => stripHtml(d)).join('\n\n') : '';

    const title = titleMatch ? stripHtml(titleMatch[1]).trim() : '';
    const company = companyMatch ? stripHtml(companyMatch[1]).trim() : '';

    if (!title) return null;

    const normalized = normalizeJobText(rawText, title);

    return {
      id: generateId('jp'),
      source: 'jobkorea',
      source_id: url.match(/\/(\d+)/)?.[1] || '',
      company_name: company,
      job_title: title,
      job_category: normalized.job_category,
      experience_min: normalized.experience_min,
      experience_max: normalized.experience_max,
      employment_type: normalized.employment_type,
      location: normalized.location,
      salary_text: normalized.salary_text,
      required_skills: normalized.required_skills,
      preferred_skills: normalized.preferred_skills,
      responsibilities: normalized.responsibilities,
      qualifications: normalized.qualifications,
      preferences: normalized.preferences,
      deadline: normalized.deadline,
      url,
      raw_text: rawText,
      fetched_at: new Date().toISOString(),
    };
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
}
