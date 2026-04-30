import { describe, it, expect } from 'vitest';
import { skillMatchScore, normalizeSkill, extractSkills } from '../../src/core/tech-dictionary.js';
import { calculateExperienceFit, calculateMatchScore } from '../../src/core/match-scoring.js';
import { normalizeJobText } from '../../src/core/job-normalizer.js';
import { parseResumeText } from '../../src/core/resume-parser.js';
import type { JobPosting, UserProfile } from '../../src/types/index.js';
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
      expect(calculateExperienceFit(5, 3, 7)).toBe(100);
    });

    it('범위 ±1년은 80점', () => {
      expect(calculateExperienceFit(2, 3, 7)).toBe(80);
      expect(calculateExperienceFit(8, 3, 7)).toBe(80);
    });

    it('범위 ±2년은 60점', () => {
      expect(calculateExperienceFit(1, 3, 7)).toBe(60);
    });

    it('범위에서 크게 벗어나면 40점', () => {
      expect(calculateExperienceFit(15, 3, 7)).toBe(40);
    });

    it('최대 경력만 있는 공고도 평가한다', () => {
      expect(calculateExperienceFit(3, null, 5)).toBe(100);
      expect(calculateExperienceFit(7, null, 5)).toBe(60);
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

  describe('종합 점수 계산', () => {
    it('비어 있는 축은 50점으로 넣지 않고 제외한다', () => {
      const profile: UserProfile = {
        id: 'up_test',
        name: '테스트',
        email: null,
        phone: null,
        total_experience_years: 3.5,
        total_experience_months: 42,
        job_category: 'backend',
        skills: [
          { name: 'FastAPI', level: 'intermediate' },
          { name: 'LLM', level: 'intermediate' },
        ],
        user_confirmed_skills: [],
        user_rejected_skills: [],
        projects: [{
          name: 'AI API',
          role: 'backend',
          duration: '2025',
          tech_stack: ['FastAPI', 'LLM'],
          description: 'LLM API 개발',
          achievements: ['API 배포'],
          domain: '',
          tags: [],
        }],
        domains: [],
        education: [],
        certifications: [],
        raw_resume_text: '',
        raw_career_text: null,
        raw_portfolio_text: null,
        created_at: '',
        updated_at: '',
      };

      const job: JobPosting = {
        id: 'jp_test',
        source: 'wanted',
        source_id: 'wanted_1',
        company_name: '테스트 회사',
        job_title: 'LLM Engineer',
        job_category: 'ai_ml',
        experience_min: 3,
        experience_max: null,
        employment_type: '정규직',
        location: '서울',
        salary_text: null,
        required_skills: ['FastAPI', 'LLM'],
        preferred_skills: [],
        responsibilities: [],
        qualifications: [],
        preferences: [],
        deadline: null,
        url: 'https://example.com/job',
        raw_text: 'LLM Engineer 채용',
        fetched_at: new Date().toISOString(),
      };

      const result = calculateMatchScore(profile, job);

      expect(result.breakdown.skill_match).toBe(100);
      expect(result.breakdown.experience_fit).toBe(100);
      expect(result.breakdown.responsibility_relevance).toBeNull();
      expect(result.breakdown.domain_fit).toBeNull();
      expect(result.breakdown.preference_coverage).toBeNull();
      expect(result.scoring_meta.coverage_percent).toBe(50);
      expect(result.scoring_meta.applied_weights).toEqual({
        skill_match: 0.6,
        experience_fit: 0.4,
      });
      expect(result.overall_score).toBe(100);
    });

    it('프로필 도메인이 비어도 프로젝트 도메인으로 fallback한다', () => {
      const profile: UserProfile = {
        id: 'up_domain',
        name: '테스트',
        email: null,
        phone: null,
        total_experience_years: 4,
        total_experience_months: 48,
        job_category: 'backend',
        skills: [{ name: 'Java', level: 'intermediate' }],
        user_confirmed_skills: [],
        user_rejected_skills: [],
        projects: [{
          name: '물류 시스템',
          role: 'backend',
          duration: '2024',
          tech_stack: ['Java'],
          description: '물류 관리 시스템',
          achievements: ['배송 최적화'],
          domain: 'logistics',
          tags: [],
        }],
        domains: [],
        education: [],
        certifications: [],
        raw_resume_text: '',
        raw_career_text: null,
        raw_portfolio_text: null,
        created_at: '',
        updated_at: '',
      };

      const job: JobPosting = {
        id: 'jp_domain',
        source: 'wanted',
        source_id: 'wanted_2',
        company_name: '테스트 회사',
        job_title: '백엔드 개발자',
        job_category: 'backend',
        experience_min: null,
        experience_max: null,
        employment_type: '정규직',
        location: '서울',
        salary_text: null,
        required_skills: ['Java'],
        preferred_skills: [],
        responsibilities: ['배송 데이터 처리'],
        qualifications: ['Java 개발 경험'],
        preferences: [],
        deadline: null,
        url: 'https://example.com/job-2',
        raw_text: '물류 플랫폼 백엔드 개발자',
        fetched_at: new Date().toISOString(),
      };

      const result = calculateMatchScore(profile, job);

      expect(result.breakdown.domain_fit).toBe(100);
      expect(result.scoring_meta.ignored_dimensions.domain_fit).toBeUndefined();
    });
  });
});
