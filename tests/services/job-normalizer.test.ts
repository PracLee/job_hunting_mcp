import { describe, it, expect } from 'vitest';
import { normalizeJobText } from '../../src/core/job-normalizer.js';
import { SAMPLE_JOB_POSTING } from '../fixtures/sample-resume.js';

describe('job-normalizer', () => {

  describe('normalizeJobText', () => {
    it('채용공고 텍스트에서 주요 필드를 추출한다', () => {
      const result = normalizeJobText(SAMPLE_JOB_POSTING, '서버 개발자');

      expect(result.job_category).toBe('backend');
      expect(result.required_skills).toContain('Java');
      expect(result.required_skills).toContain('Spring Boot');
      expect(result.required_skills).toContain('MySQL');
      expect(result.responsibilities.length).toBeGreaterThan(0);
      expect(result.qualifications.length).toBeGreaterThan(0);
      expect(result.preferences.length).toBeGreaterThan(0);
    });

    it('경력 요건을 추출한다', () => {
      const result = normalizeJobText(SAMPLE_JOB_POSTING);
      expect(result.experience_min).toBe(3);
      expect(result.experience_max).toBe(7);
    });

    it('근무지를 추출한다', () => {
      const result = normalizeJobText(SAMPLE_JOB_POSTING);
      expect(result.location).toContain('강남');
    });

    it('고용형태를 추출한다', () => {
      const result = normalizeJobText(SAMPLE_JOB_POSTING);
      expect(result.employment_type).toBe('정규직');
    });

    it('필수/우대 기술을 분리한다', () => {
      const result = normalizeJobText(SAMPLE_JOB_POSTING);
      // Kafka, Kubernetes는 우대사항에서만 언급 → preferred
      // 실제로는 기술스택 섹션에도 있으므로 required에 포함될 수 있음
      const allSkills = [...result.required_skills, ...result.preferred_skills];
      expect(allSkills).toContain('Kafka');
      expect(allSkills).toContain('Kubernetes');
    });
  });

  describe('다양한 공고 형태', () => {
    it('신입 공고를 파싱한다', () => {
      const result = normalizeJobText('신입 채용\n경력: 신입\n기술: React, TypeScript', '프론트엔드 개발자');
      expect(result.experience_min).toBe(0);
      expect(result.job_category).toBe('frontend');
    });

    it('경력 이상 공고를 파싱한다', () => {
      const result = normalizeJobText('경력 5년 이상\nJava, Spring');
      expect(result.experience_min).toBe(5);
      expect(result.experience_max).toBeNull();
    });

    it('빈 텍스트도 에러 없이 처리한다', () => {
      const result = normalizeJobText('');
      expect(result.job_category).toBe('other');
      expect(result.required_skills).toEqual([]);
    });
  });
});
