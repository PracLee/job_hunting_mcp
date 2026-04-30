import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../../src/db/connection.js';
import { JobRepository } from '../../src/db/repositories/job-repository.js';
import { JobsService } from '../../src/services/jobs-service.js';

describe('jobs-search', () => {
  beforeEach(() => {
    closeDb();
    process.env.DB_PATH = ':memory:';
  });

  afterEach(() => {
    closeDb();
  });

  it('local search filters by keywords instead of returning unrelated recent jobs', async () => {
    const jobRepo = new JobRepository();
    const jobsService = new JobsService();

    jobRepo.save({
      source: 'wanted',
      source_id: 'wanted_1',
      company_name: '프론트 회사',
      job_title: '프론트엔드 개발자',
      job_category: 'frontend',
      experience_min: 2,
      experience_max: null,
      employment_type: '정규직',
      location: '서울',
      salary_text: null,
      required_skills: ['React'],
      preferred_skills: ['TypeScript'],
      responsibilities: ['UI 개발'],
      qualifications: ['React 경험'],
      preferences: [],
      deadline: null,
      url: 'https://example.com/front',
      raw_text: 'React 기반 프론트엔드 개발',
      fetched_at: '2026-04-30T10:00:00.000Z',
    });

    jobRepo.save({
      source: 'wanted',
      source_id: 'wanted_2',
      company_name: '백엔드 회사',
      job_title: 'Java 백엔드 개발자',
      job_category: 'backend',
      experience_min: 2,
      experience_max: null,
      employment_type: '정규직',
      location: '서울',
      salary_text: null,
      required_skills: ['Java', 'Spring Boot'],
      preferred_skills: ['MySQL'],
      responsibilities: ['백엔드 API 개발'],
      qualifications: ['Java 백엔드 개발 경험'],
      preferences: [],
      deadline: null,
      url: 'https://example.com/backend',
      raw_text: 'Java와 Spring Boot 기반 백엔드 서비스 개발',
      fetched_at: '2026-04-30T09:00:00.000Z',
    });

    const result = await jobsService.searchJobs({
      keywords: ['Java', '백엔드'],
      location: '서울',
      limit: 10,
      search_mode: 'local',
    });

    expect(result.total).toBe(1);
    expect(result.jobs[0].job_title).toBe('Java 백엔드 개발자');
  });

  it('local search ranks stronger title/skill matches above weaker text-only matches', async () => {
    const jobRepo = new JobRepository();
    const jobsService = new JobsService();

    jobRepo.save({
      source: 'jumpit',
      source_id: 'jumpit_1',
      company_name: '플랫폼 팀',
      job_title: '백엔드 플랫폼 엔지니어',
      job_category: 'backend',
      experience_min: 3,
      experience_max: null,
      employment_type: '정규직',
      location: '서울',
      salary_text: null,
      required_skills: ['Go'],
      preferred_skills: [],
      responsibilities: ['Java 시스템 연동'],
      qualifications: ['플랫폼 운영 경험'],
      preferences: [],
      deadline: null,
      url: 'https://example.com/platform',
      raw_text: '플랫폼 운영과 Java 레거시 연동',
      fetched_at: '2026-04-30T11:00:00.000Z',
    });

    jobRepo.save({
      source: 'remember',
      source_id: 'remember_1',
      company_name: '코어 서비스',
      job_title: 'Java 백엔드 개발자',
      job_category: 'backend',
      experience_min: 3,
      experience_max: null,
      employment_type: '정규직',
      location: '서울',
      salary_text: null,
      required_skills: ['Java', 'Spring Boot'],
      preferred_skills: [],
      responsibilities: ['백엔드 API 설계'],
      qualifications: ['Java 백엔드 경력'],
      preferences: [],
      deadline: null,
      url: 'https://example.com/core',
      raw_text: 'Java 백엔드 서비스 개발',
      fetched_at: '2026-04-30T08:00:00.000Z',
    });

    const result = await jobsService.searchJobs({
      keywords: ['Java', '백엔드'],
      limit: 10,
      search_mode: 'local',
    });

    expect(result.total).toBe(2);
    expect(result.jobs[0].job_title).toBe('Java 백엔드 개발자');
    expect(result.jobs[1].job_title).toBe('백엔드 플랫폼 엔지니어');
  });
});
