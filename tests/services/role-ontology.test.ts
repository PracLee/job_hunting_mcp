import { describe, it, expect } from 'vitest';
import {
  resolveRole,
  roleSimilarity,
  expandKeyword,
} from '../../src/core/role-ontology.js';
import { scoreJobSearchMatch } from '../../src/core/job-search.js';
import type { JobPosting } from '../../src/types/job.js';

function makeJob(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id: 'test_job',
    source: 'wanted',
    source_id: 'src_1',
    company_name: '테스트 회사',
    job_title: '',
    job_category: 'backend',
    experience_min: null,
    experience_max: null,
    employment_type: '정규직',
    location: '서울',
    salary_text: null,
    required_skills: [],
    preferred_skills: [],
    responsibilities: [],
    qualifications: [],
    preferences: [],
    deadline: null,
    url: '',
    raw_text: '',
    fetched_at: '2026-04-30T00:00:00.000Z',
    ...overrides,
  };
}

describe('role-ontology', () => {
  describe('resolveRole', () => {
    it('정확 한글 alias 인식', () => {
      expect(resolveRole('백엔드 개발자')).toBe('BackendEngineer');
      expect(resolveRole('머신러닝 엔지니어')).toBe('MLEngineer');
      expect(resolveRole('AI 엔지니어')).toBe('AIEngineer');
    });

    it('정확 영문 alias 인식 (대소문자 무관)', () => {
      expect(resolveRole('Backend Engineer')).toBe('BackendEngineer');
      expect(resolveRole('ML Engineer')).toBe('MLEngineer');
      expect(resolveRole('SRE')).toBe('SREEngineer');
    });

    it('공고 제목 안에 단어 단위로 포함되면 인식', () => {
      expect(resolveRole('토스 Machine Learning Engineer 채용')).toBe('MLEngineer');
      expect(resolveRole('[신입] 백엔드 개발자 모집')).toBe('BackendEngineer');
    });

    it('짧은 영문 alias가 무관한 단어에 끼어드는 건 무시', () => {
      // "ai"가 "main", "fail" 안에 들어있는 케이스
      expect(resolveRole('main painter wanted')).toBe(null);
    });

    it('전혀 매칭 안 되면 null', () => {
      expect(resolveRole('영업 사원 모집')).toBe(null);
    });
  });

  describe('roleSimilarity', () => {
    it('동일 role은 1.0', () => {
      expect(roleSimilarity('AI Engineer', 'AI 엔지니어')).toBe(1.0);
    });

    it('AI Engineer ↔ ML Engineer = 0.9 (similarTo)', () => {
      expect(roleSimilarity('AI Engineer', 'ML Engineer')).toBeCloseTo(0.9);
    });

    it('SRE ↔ DevOps = 0.85 (similarTo)', () => {
      expect(roleSimilarity('SRE', 'DevOps Engineer')).toBeCloseTo(0.85);
    });

    it('similarTo 없는 형제(같은 부모 Engineer만 공유) = 0.5', () => {
      // SecurityEngineer와 QAEngineer는 isA Engineer만 공유, similarTo 없음
      expect(roleSimilarity('보안 엔지니어', 'QA Engineer')).toBe(0.5);
    });

    it('한쪽이라도 role 인식 실패면 0', () => {
      expect(roleSimilarity('AI Engineer', '영업 사원')).toBe(0);
    });
  });

  describe('expandKeyword', () => {
    it('AI Engineer 확장 결과에 ML Engineer 포함', () => {
      const expanded = expandKeyword('AI Engineer');
      const keywords = expanded.map(e => e.keyword.toLowerCase());
      expect(keywords).toContain('ai engineer');
      expect(keywords.some(k => k.includes('ml engineer') || k.includes('machine learning'))).toBe(true);
    });

    it('확장 결과는 weight 내림차순으로 정렬되지 않아도 임계값 이상만 포함', () => {
      const expanded = expandKeyword('AI Engineer', 0.7);
      for (const item of expanded) {
        expect(item.weight).toBeGreaterThanOrEqual(0.7);
      }
    });

    it('role 미인식 키워드는 원본만 반환', () => {
      const expanded = expandKeyword('Excel');
      expect(expanded).toHaveLength(1);
      expect(expanded[0].keyword).toBe('Excel');
    });
  });

  describe('scoreJobSearchMatch 통합 — 의미 매칭 보정', () => {
    it('"AI Engineer" 검색 → "Machine Learning Engineer" 공고가 매칭됨', () => {
      const job = makeJob({
        job_title: 'Machine Learning Engineer',
        required_skills: ['Python', 'PyTorch'],
        raw_text: 'ML 시스템 개발',
      });
      const result = scoreJobSearchMatch(job, ['AI Engineer']);
      expect(result.matched).toBe(true);
      expect(result.score).toBeGreaterThan(0);
    });

    it('"백엔드 개발자" 검색 → "Server Engineer" 공고가 매칭됨 (substring 실패하지만 의미적)', () => {
      const job = makeJob({
        job_title: 'Server Engineer',
        raw_text: '서버 시스템 운영',
      });
      const result = scoreJobSearchMatch(job, ['백엔드 개발자']);
      expect(result.matched).toBe(true);
    });

    it('의미적으로도 무관한 키워드는 여전히 매칭 안 됨', () => {
      const job = makeJob({
        job_title: 'AI Engineer',
        raw_text: 'AI 모델 개발',
      });
      const result = scoreJobSearchMatch(job, ['프론트엔드 개발자']);
      expect(result.matched).toBe(false);
    });

    it('정확 매칭 점수는 변하지 않음 (회귀 방지)', () => {
      // title에 정확히 들어있으면 substring 매칭 12점 + 키워드 가산 3점 = 15
      const job = makeJob({ job_title: 'AI Engineer' });
      const result = scoreJobSearchMatch(job, ['ai engineer']);
      expect(result.score).toBe(12 + 3);
    });
  });
});
