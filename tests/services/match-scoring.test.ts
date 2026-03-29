import { describe, it, expect } from 'vitest';
import { skillMatchScore, normalizeSkill, extractSkills } from '../../src/core/tech-dictionary.js';
import { normalizeJobText } from '../../src/core/job-normalizer.js';
import { parseResumeText } from '../../src/core/resume-parser.js';
import { SAMPLE_RESUME, SAMPLE_CAREER_DESCRIPTION, SAMPLE_JOB_POSTING } from '../fixtures/sample-resume.js';

describe('match-scoring (매칭 로직)', () => {

  describe('실제 이력서 vs 실제 공고 매칭', () => {
    it('샘플 이력서와 공고의 기술 매칭 점수가 높아야 한다', () => {
      const profile = parseResumeText(SAMPLE_RESUME, SAMPLE_CAREER_DESCRIPTION);
      const job = normalizeJobText(SAMPLE_JOB_POSTING, '서버 개발자');

      const userSkills = profile.skills.map(s => s.name);
      const score = skillMatchScore(userSkills, job.required_skills, job.preferred_skills);

      // 샘플 이력서는 공고와 매우 잘 맞음 (Java, Spring Boot, MySQL, Redis, Kafka, Kubernetes 보유)
      expect(score).toBeGreaterThanOrEqual(60);
    });

    it('무관한 기술 프로필은 낮은 점수', () => {
      const score = skillMatchScore(
        ['Python', 'Django', 'PostgreSQL'],
        ['Java', 'Spring Boot', 'MySQL', 'Redis'],
        ['Kafka', 'Kubernetes'],
      );
      expect(score).toBeLessThan(30);
    });
  });

  describe('경험 적합도 로직', () => {
    it('범위 내 경력은 100점', () => {
      expect(calcExpFit(5, 3, 7)).toBe(100);
    });

    it('범위 ±1년은 80점', () => {
      expect(calcExpFit(2, 3, 7)).toBe(80);
      expect(calcExpFit(8, 3, 7)).toBe(80);
    });

    it('범위 ±2년은 60점', () => {
      expect(calcExpFit(1, 3, 7)).toBe(60);
    });

    it('범위에서 크게 벗어나면 40점', () => {
      expect(calcExpFit(15, 3, 7)).toBe(40);
    });
  });

  describe('동의어 처리', () => {
    it('자바와 Java는 같은 기술로 매칭된다', () => {
      expect(normalizeSkill('자바')).toBe('Java');
      const score = skillMatchScore(['자바'], ['Java']);
      expect(score).toBe(100);
    });

    it('스프링부트와 Spring Boot는 같은 기술', () => {
      const score = skillMatchScore(['스프링부트'], ['Spring Boot']);
      expect(score).toBe(100);
    });

    it('k8s와 Kubernetes는 같은 기술', () => {
      const score = skillMatchScore(['k8s'], ['Kubernetes']);
      expect(score).toBe(100);
    });
  });
});

// 매칭 서비스의 경험 적합도 로직 (match/index.ts와 동일)
function calcExpFit(years: number, min: number | null, max: number | null): number {
  if (min !== null && max !== null) {
    if (years >= min && years <= max) return 100;
    if (Math.abs(years - min) <= 1 || Math.abs(years - max) <= 1) return 80;
    if (Math.abs(years - min) <= 2 || Math.abs(years - max) <= 2) return 60;
    return 40;
  }
  if (min !== null) {
    return years >= min ? 100 : Math.max(40, 100 - (min - years) * 20);
  }
  return 50;
}
