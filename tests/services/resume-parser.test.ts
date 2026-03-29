import { describe, it, expect } from 'vitest';
import {
  splitSections,
  extractContact,
  calculateExperienceYears,
  parseProjects,
  parseEducation,
  inferJobCategory,
  parseResumeText,
} from '../../src/core/resume-parser.js';
import { SAMPLE_RESUME, SAMPLE_CAREER_DESCRIPTION } from '../fixtures/sample-resume.js';

describe('resume-parser', () => {

  describe('splitSections', () => {
    it('한국식 이력서에서 주요 섹션을 분리한다', () => {
      const sections = splitSections(SAMPLE_RESUME);
      expect(sections).toHaveProperty('career');
      expect(sections).toHaveProperty('skills');
      expect(sections).toHaveProperty('projects');
      expect(sections).toHaveProperty('education');
      expect(sections).toHaveProperty('certifications');
    });

    it('경력기술서에서 프로젝트 섹션을 인식한다', () => {
      const sections = splitSections(SAMPLE_CAREER_DESCRIPTION);
      // 경력기술서는 전체가 하나의 덩어리일 수 있음
      const allText = Object.values(sections).join('\n');
      expect(allText).toContain('결제 시스템');
      expect(allText).toContain('선물하기');
    });
  });

  describe('extractContact', () => {
    it('이름, 이메일, 전화번호를 추출한다', () => {
      const contact = extractContact(SAMPLE_RESUME);
      expect(contact.name).toBe('이병재');
      expect(contact.email).toBe('byoungjae@example.com');
      expect(contact.phone).toBe('010-1234-5678');
    });

    it('정보가 없으면 null을 반환한다', () => {
      const contact = extractContact('빈 텍스트');
      expect(contact.name).toBeNull();
      expect(contact.email).toBeNull();
      expect(contact.phone).toBeNull();
    });
  });

  describe('calculateExperienceYears', () => {
    it('기간 패턴에서 경력 연차를 계산한다', () => {
      const years = calculateExperienceYears('2019.06 ~ 2022.02\n2022.03 ~ 현재');
      expect(years).toBeGreaterThanOrEqual(5);
    });

    it('직접 명시된 경력을 추출한다', () => {
      expect(calculateExperienceYears('총 경력: 5년')).toBe(5);
      expect(calculateExperienceYears('7년차 개발자')).toBe(7);
    });

    it('기간 정보가 없으면 0을 반환한다', () => {
      expect(calculateExperienceYears('경력 없음')).toBe(0);
    });
  });

  describe('parseProjects', () => {
    it('번호 목록 형태의 프로젝트를 파싱한다', () => {
      const sections = splitSections(SAMPLE_RESUME);
      const projects = parseProjects(sections.projects || '');
      expect(projects.length).toBeGreaterThanOrEqual(1);

      const first = projects[0];
      expect(first.name).toContain('결제');
      expect(first.tech_stack.length).toBeGreaterThan(0);
    });

    it('경력기술서의 ■ 블록을 파싱한다', () => {
      const projects = parseProjects(SAMPLE_CAREER_DESCRIPTION);
      expect(projects.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('parseEducation', () => {
    it('학력 정보를 파싱한다', () => {
      const edu = parseEducation('서울대학교 | 컴퓨터공학과 | 학사 | 2019');
      expect(edu.length).toBe(1);
      expect(edu[0].school).toContain('서울대');
      expect(edu[0].major).toContain('컴퓨터');
    });
  });

  describe('inferJobCategory', () => {
    it('기술과 텍스트에서 직무를 추론한다', () => {
      expect(inferJobCategory(['Spring Boot', 'Java'], '백엔드 개발자')).toBe('backend');
      expect(inferJobCategory(['React', 'TypeScript'], '프론트엔드 개발자')).toBe('frontend');
      expect(inferJobCategory(['Android', 'Kotlin'], '안드로이드 개발')).toBe('mobile');
    });
  });

  describe('parseResumeText (통합)', () => {
    it('전체 이력서를 구조화된 프로필로 파싱한다', () => {
      const result = parseResumeText(SAMPLE_RESUME, SAMPLE_CAREER_DESCRIPTION);

      expect(result.name).toBe('이병재');
      expect(result.email).toBe('byoungjae@example.com');
      expect(result.total_experience_years).toBeGreaterThanOrEqual(5);
      expect(result.skills.length).toBeGreaterThan(5);
      expect(result.job_category).toBe('backend');
      expect(result.projects.length).toBeGreaterThanOrEqual(1);

      const skillNames = result.skills.map(s => s.name);
      expect(skillNames).toContain('Java');
      expect(skillNames).toContain('Spring Boot');
      expect(skillNames).toContain('Kafka');
    });
  });
});
