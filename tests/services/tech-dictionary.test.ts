import { describe, it, expect } from 'vitest';
import { extractSkills, normalizeSkill, skillMatchScore } from '../../src/core/tech-dictionary.js';

describe('tech-dictionary', () => {

  describe('extractSkills', () => {
    it('영문 기술명을 추출한다', () => {
      const skills = extractSkills('Java, Spring Boot, MySQL 사용 경험');
      expect(skills).toContain('Java');
      expect(skills).toContain('Spring Boot');
      expect(skills).toContain('MySQL');
    });

    it('한글 동의어도 인식한다', () => {
      const skills = extractSkills('자바, 스프링부트, 쿠버네티스 운영 경험');
      expect(skills).toContain('Java');
      expect(skills).toContain('Spring Boot');
      expect(skills).toContain('Kubernetes');
    });

    it('대소문자를 무시한다', () => {
      const skills = extractSkills('JAVA, springboot, kubernetes');
      expect(skills).toContain('Java');
      expect(skills).toContain('Spring Boot');
      expect(skills).toContain('Kubernetes');
    });

    it('빈 텍스트는 빈 배열을 반환한다', () => {
      expect(extractSkills('')).toEqual([]);
    });
  });

  describe('normalizeSkill', () => {
    it('동의어를 정식 명칭으로 변환한다', () => {
      expect(normalizeSkill('자바')).toBe('Java');
      expect(normalizeSkill('스프링부트')).toBe('Spring Boot');
      expect(normalizeSkill('k8s')).toBe('Kubernetes');
      expect(normalizeSkill('nodejs')).toBe('Node.js');
    });

    it('알 수 없는 기술은 원본을 반환한다', () => {
      expect(normalizeSkill('UnknownTech')).toBe('UnknownTech');
    });
  });

  describe('skillMatchScore', () => {
    it('완전 일치 시 100점을 반환한다', () => {
      const score = skillMatchScore(
        ['Java', 'Spring Boot', 'MySQL'],
        ['Java', 'Spring Boot', 'MySQL'],
      );
      expect(score).toBe(100);
    });

    it('부분 일치 시 비례 점수를 반환한다', () => {
      const score = skillMatchScore(
        ['Java', 'Spring Boot'],
        ['Java', 'Spring Boot', 'MySQL', 'Redis'],
      );
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(100);
    });

    it('일치 없으면 0점', () => {
      const score = skillMatchScore(
        ['Python', 'Django'],
        ['Java', 'Spring Boot'],
      );
      expect(score).toBe(0);
    });

    it('우대 기술은 가중치가 낮다', () => {
      const scoreReqOnly = skillMatchScore(['Java'], ['Java'], []);
      const scoreWithPref = skillMatchScore(['Java'], ['Java'], ['Kafka', 'Redis']);
      // required만 있을 때 Java 매칭 = 100
      // preferred가 추가되면 Java는 여전히 매칭되지만 Kafka/Redis 미매칭으로 점수 하락
      expect(scoreWithPref).toBeLessThanOrEqual(scoreReqOnly);
    });
  });
});
