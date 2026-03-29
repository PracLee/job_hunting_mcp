import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { ProfileRepository } from '../../src/db/repositories/profile-repository.js';
import { JobRepository } from '../../src/db/repositories/job-repository.js';
import { ApplicationRepository } from '../../src/db/repositories/application-repository.js';
import { parseResumeText } from '../../src/core/resume-parser.js';
import { normalizeJobText } from '../../src/core/job-normalizer.js';
import { skillMatchScore } from '../../src/core/tech-dictionary.js';
import { getTemplate } from '../../src/core/platform-templates.js';
import { SAMPLE_RESUME, SAMPLE_CAREER_DESCRIPTION, SAMPLE_JOB_POSTING } from '../fixtures/sample-resume.js';

// 인메모리 DB로 테스트
beforeAll(() => {
  process.env.DB_PATH = ':memory:';
});

describe('E2E 플로우: 프로필 등록 → 공고 추가 → 매칭 → 양식 변환 → 지원 관리', () => {
  const profileRepo = new ProfileRepository();
  const jobRepo = new JobRepository();
  const appRepo = new ApplicationRepository();

  let profileId: string;
  let jobId: string;

  it('Step 1: 이력서를 파싱하여 프로필을 저장한다', () => {
    const parsed = parseResumeText(SAMPLE_RESUME, SAMPLE_CAREER_DESCRIPTION);

    const profile = profileRepo.save({
      name: parsed.name,
      email: parsed.email,
      phone: parsed.phone,
      total_experience_years: parsed.total_experience_years,
      job_category: parsed.job_category,
      skills: parsed.skills,
      projects: parsed.projects,
      domains: parsed.domains,
      education: parsed.education,
      certifications: parsed.certifications,
      raw_resume_text: SAMPLE_RESUME,
      raw_career_text: SAMPLE_CAREER_DESCRIPTION,
      raw_portfolio_text: null,
    });

    profileId = profile.id;
    expect(profile.id).toBeTruthy();
    expect(profile.name).toBe('이병재');
    expect(profile.skills.length).toBeGreaterThan(5);
    expect(profile.job_category).toBe('backend');
  });

  it('Step 2: 공고 텍스트를 정규화하여 저장한다', () => {
    const normalized = normalizeJobText(SAMPLE_JOB_POSTING, '서버 개발자');

    const job = jobRepo.save({
      source: 'wanted',
      source_id: 'test_001',
      company_name: '토스',
      job_title: '서버 개발자 (결제플랫폼)',
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
      url: 'https://www.wanted.co.kr/wd/12345',
      raw_text: SAMPLE_JOB_POSTING,
      fetched_at: new Date().toISOString(),
    });

    jobId = job.id;
    expect(job.id).toBeTruthy();
    expect(job.job_category).toBe('backend');
    expect(job.required_skills).toContain('Java');
    expect(job.experience_min).toBe(3);
  });

  it('Step 3: 프로필-공고 매칭 점수를 산출한다', () => {
    const profile = profileRepo.findById(profileId)!;
    const job = jobRepo.findById(jobId)!;

    const userSkills = profile.skills.map(s => s.name);
    const score = skillMatchScore(userSkills, job.required_skills, job.preferred_skills);

    expect(score).toBeGreaterThanOrEqual(50);
    // 샘플 이력서는 이 공고에 잘 맞으므로 높은 점수 기대
  });

  it('Step 4: 프로필을 원티드 양식으로 변환한다', () => {
    const profile = profileRepo.findById(profileId)!;
    const output = getTemplate('wanted').formatProfile(profile);

    expect(output.platform).toBe('wanted');
    expect(output.copy_ready_text).toContain('백엔드');
    expect(output.copy_ready_text).toContain('결제');
    expect(output.copy_ready_text).toContain('Java');
    expect(output.platform_tips.length).toBeGreaterThan(0);
  });

  it('Step 5: 사람인 양식으로도 변환한다', () => {
    const profile = profileRepo.findById(profileId)!;
    const output = getTemplate('saramin').formatProfile(profile);

    expect(output.platform).toBe('saramin');
    expect(output.sections['인적사항']).toContain('이병재');
    expect(output.sections['경력사항']).toBeTruthy();
  });

  it('Step 6: 지원 기록을 생성하고 상태를 변경한다', () => {
    const app = appRepo.create(jobId, profileId, 'saved', '경력기술서 수정 후 지원 예정');

    expect(app.status).toBe('saved');
    expect(app.job_id).toBe(jobId);

    // 지원 완료로 변경
    const updated = appRepo.updateStatus(app.id, 'applied', '원티드로 지원 완료');
    expect(updated!.status).toBe('applied');
    expect(updated!.applied_at).toBeTruthy();
    expect(updated!.status_history.length).toBe(2);

    // 서류 합격
    const passed = appRepo.updateStatus(app.id, 'document_passed');
    expect(passed!.status).toBe('document_passed');
    expect(passed!.status_history.length).toBe(3);
  });

  it('Step 7: 지원 현황을 조회한다', () => {
    const apps = appRepo.findByProfile(profileId);
    expect(apps.length).toBe(1);
    expect(apps[0].status).toBe('document_passed');
  });
});
