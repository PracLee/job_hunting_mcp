import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../../src/db/connection.js';
import { JobRepository } from '../../src/db/repositories/job-repository.js';
import { ProfileRepository } from '../../src/db/repositories/profile-repository.js';
import { JobsService } from '../../src/services/jobs-service.js';
import { MatchService } from '../../src/services/match-service.js';
import type { JobPosting } from '../../src/types/index.js';

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

  it('auto-saves online search results so returned job ids can be scored immediately', async () => {
    const jobsService = new JobsService();
    const matchService = new MatchService();
    const profileRepo = new ProfileRepository();
    const searchJob: JobPosting = {
      id: 'jp_search_saved',
      source: 'jumpit',
      source_id: 'jumpit_123',
      company_name: '점핏 회사',
      job_title: 'Java 백엔드 개발자',
      job_category: 'backend',
      experience_min: 3,
      experience_max: 5,
      employment_type: '정규직',
      location: '서울',
      salary_text: null,
      required_skills: ['Java', 'Spring Boot'],
      preferred_skills: [],
      responsibilities: [],
      qualifications: [],
      preferences: [],
      deadline: null,
      url: 'https://www.jumpit.co.kr/position/123',
      raw_text: 'Java 백엔드 개발자 Spring Boot',
      fetched_at: '2026-04-30T10:00:00.000Z',
    };

    (jobsService as any).adapters = {
      jumpit: {
        source: 'jumpit',
        isAvailable: () => true,
        search: async () => [searchJob],
        fetchDetail: async () => searchJob,
      },
    };

    const profile = profileRepo.save({
      name: '테스트',
      email: null,
      phone: null,
      total_experience_years: 4,
      total_experience_months: 48,
      job_category: 'backend',
      skills: [{ name: 'Java', level: 'intermediate' }, { name: 'Spring Boot', level: 'intermediate' }],
      user_confirmed_skills: [],
      user_rejected_skills: [],
      projects: [],
      domains: [],
      education: [],
      certifications: [],
      raw_resume_text: '',
      raw_career_text: null,
      raw_portfolio_text: null,
    });

    const result = await jobsService.searchJobs({
      keywords: ['Java', '백엔드'],
      sources: ['jumpit'],
      limit: 5,
      search_mode: 'online',
      auto_save: true,
    });

    expect(result.search_meta.auto_saved).toBe(true);
    expect(result.jobs[0].id).toBe('jp_search_saved');

    const scored = await matchService.scoreJob({
      job_id: result.jobs[0].id,
      profile_id: profile.id,
    });

    expect(scored.job_id).toBe('jp_search_saved');
    expect(scored.company_name).toBe('점핏 회사');
  });

  it('includes per-source counts and zero-result warnings in search meta', async () => {
    const jobsService = new JobsService();
    const matchingJob: JobPosting = {
      id: 'jp_groupby_1',
      source: 'groupby',
      source_id: 'groupby_1',
      company_name: '그룹바이 회사',
      job_title: '백엔드 개발자',
      job_category: 'backend',
      experience_min: 3,
      experience_max: null,
      employment_type: '정규직',
      location: '서울',
      salary_text: null,
      required_skills: ['Node.js'],
      preferred_skills: [],
      responsibilities: [],
      qualifications: [],
      preferences: [],
      deadline: null,
      url: 'https://groupby.kr/positions/1',
      raw_text: '백엔드 개발자 Node.js',
      fetched_at: '2026-04-30T10:00:00.000Z',
    };

    (jobsService as any).adapters = {
      jobkorea: {
        source: 'jobkorea',
        isAvailable: () => true,
        search: async () => [],
        searchWithMeta: async () => ({ jobs: [], warnings: ['파서 오류 - 응답 없음'] }),
        fetchDetail: async () => null,
      },
      groupby: {
        source: 'groupby',
        isAvailable: () => true,
        search: async () => [matchingJob],
        fetchDetail: async () => matchingJob,
      },
    };

    const result = await jobsService.searchJobs({
      keywords: ['백엔드'],
      sources: ['jobkorea', 'groupby'],
      limit: 10,
      search_mode: 'online',
      auto_save: false,
    });

    expect(result.search_meta.sources_result_count).toEqual({
      jobkorea: 0,
      groupby: 1,
    });
    expect(result.warnings).toContain('jobkorea: 파서 오류 - 응답 없음');
  });
});
