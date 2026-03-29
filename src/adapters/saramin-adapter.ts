/**
 * 사람인(Saramin) 채용공고 어댑터
 * 사람인 웹 API를 통해 공고 검색 및 상세 조회
 *
 * 사람인은 공식 Open API 제공 (https://oapi.saramin.co.kr)
 * API 키 필요: SARAMIN_API_KEY 환경변수
 */

import type { SourceAdapter } from './base-adapter.js';
import type { JobPosting, JobSearchParams, JobCategory } from '../types/job.js';
import { normalizeJobText } from '../core/job-normalizer.js';
import { generateId } from '../core/utils.js';

// 사람인 직무 코드 매핑
const SARAMIN_JOB_CODE: Record<string, string> = {
  backend: '84',           // 서버/백엔드
  frontend: '92',          // 프론트엔드
  fullstack: '84,92',      // 서버+프론트
  mobile: '88',            // 모바일
  data: '91',              // 데이터 엔지니어
  devops: '89',            // 시스템/인프라
  ai_ml: '236',            // 인공지능/ML
  security: '95',          // 보안
  other: '2',              // IT개발 전체
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

export class SaraminAdapter implements SourceAdapter {
  source = 'saramin' as const;
  private baseUrl = 'https://oapi.saramin.co.kr/recruit';
  private apiKey: string | null;

  constructor() {
    this.apiKey = process.env.SARAMIN_API_KEY || null;
  }

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  async search(params: JobSearchParams): Promise<JobPosting[]> {
    if (!this.apiKey) {
      console.warn('사람인 API 키가 설정되지 않았습니다. SARAMIN_API_KEY 환경변수를 설정하세요.');
      return [];
    }

    try {
      const url = new URL(this.baseUrl);
      url.searchParams.set('access-key', this.apiKey);
      url.searchParams.set('output', 'json');
      url.searchParams.set('count', (params.limit || 20).toString());
      url.searchParams.set('start', '0');

      // 키워드
      if (params.keywords.length > 0) {
        url.searchParams.set('keywords', params.keywords.join(' '));
      }

      // 직무 코드
      if (params.job_category) {
        const code = SARAMIN_JOB_CODE[params.job_category] || SARAMIN_JOB_CODE.other;
        url.searchParams.set('job_type', code);
      }

      // 지역
      if (params.location) {
        const locCode = SARAMIN_LOCATION[params.location];
        if (locCode) url.searchParams.set('loc_cd', locCode);
      }

      // 경력
      if (params.experience_min !== undefined) {
        url.searchParams.set('career', `${params.experience_min}`);
      }

      const response = await fetch(url.toString(), {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        console.error(`사람인 API 에러: ${response.status}`);
        return [];
      }

      const data = await response.json() as SaraminResponse;
      const items = data.jobs?.job || [];
      return items.map(item => this.toJobPosting(item));
    } catch (error) {
      console.error('사람인 검색 실패:', error);
      return [];
    }
  }

  async fetchDetail(sourceIdOrUrl: string): Promise<JobPosting | null> {
    if (!this.apiKey) return null;

    try {
      // URL에서 ID 추출
      const id = sourceIdOrUrl.match(/rec_idx=(\d+)/)?.[1]
        || sourceIdOrUrl.match(/(\d+)/)?.[1]
        || sourceIdOrUrl;

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

      return this.toJobPosting(job);
    } catch (error) {
      console.error('사람인 상세 조회 실패:', error);
      return null;
    }
  }

  private toJobPosting(item: SaraminJob): JobPosting {
    const rawText = [
      item.position?.title,
      item.position?.['job-type']?.name,
      item.position?.['experience-level']?.name,
      item.position?.location?.name,
      item.keyword,
    ].filter(Boolean).join('\n');

    const normalized = normalizeJobText(rawText, item.position?.title || '');

    // 키워드에서 기술스택 추출
    const keywords = (item.keyword || '').split(',').map(k => k.trim()).filter(Boolean);

    return {
      id: generateId('jp'),
      source: 'saramin',
      source_id: item.id?.toString() || '',
      company_name: item.company?.detail?.name || '',
      job_title: item.position?.title || '',
      job_category: normalized.job_category,
      experience_min: parseExperience(item.position?.['experience-level']?.code),
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
}

function parseExperience(code?: number): number | null {
  if (code === undefined || code === null) return null;
  if (code === 0) return 0; // 신입
  if (code >= 1) return code;
  return null;
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
