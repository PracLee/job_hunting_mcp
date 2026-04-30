import { ApplicationRepository } from '../db/repositories/application-repository.js';
import { JobRepository } from '../db/repositories/job-repository.js';
import { ProfileRepository } from '../db/repositories/profile-repository.js';
import { resolveJobOrThrow, resolveProfileOrThrow } from './shared/resolvers.js';

export const STATUS_VALUES = ['saved', 'reviewing', 'applied', 'document_passed', 'interview_scheduled', 'rejected', 'offered'] as const;

export class ApplicationService {
  private readonly appRepo = new ApplicationRepository();
  private readonly jobRepo = new JobRepository();
  private readonly profileRepo = new ProfileRepository();

  createApplication(params: {
    job_id: string;
    profile_id?: string;
    status?: typeof STATUS_VALUES[number];
    notes?: string;
  }) {
    const profile = resolveProfileOrThrow(this.profileRepo, params.profile_id, '프로필이 없습니다.');
    const job = resolveJobOrThrow(this.jobRepo, params.job_id, '공고를 찾을 수 없습니다.');
    const app = this.appRepo.create(params.job_id, profile.id, params.status || 'saved', params.notes);

    return {
      message: '지원 기록이 생성되었습니다.',
      application: { ...app, company_name: job.company_name, job_title: job.job_title },
    };
  }

  updateApplicationStatus(params: {
    application_id: string;
    new_status: typeof STATUS_VALUES[number];
    notes?: string;
  }) {
    const app = this.appRepo.updateStatus(params.application_id, params.new_status, params.notes);
    if (!app) {
      throw new Error('지원 기록을 찾을 수 없습니다.');
    }

    return {
      message: `상태가 '${params.new_status}'로 변경되었습니다.`,
      application: app,
    };
  }

  listApplications(params: {
    profile_id?: string;
    status_filter?: typeof STATUS_VALUES[number];
  }) {
    const profile = resolveProfileOrThrow(this.profileRepo, params.profile_id, '프로필이 없습니다.');
    const apps = this.appRepo.findByProfile(profile.id, params.status_filter);

    const enriched = apps.map(app => {
      const job = this.jobRepo.findById(app.job_id);
      return {
        ...app,
        company_name: job?.company_name || '알 수 없음',
        job_title: job?.job_title || '알 수 없음',
      };
    });

    return {
      total: enriched.length,
      applications: enriched,
      summary: {
        saved: enriched.filter(app => app.status === 'saved').length,
        applied: enriched.filter(app => app.status === 'applied').length,
        document_passed: enriched.filter(app => app.status === 'document_passed').length,
        interview_scheduled: enriched.filter(app => app.status === 'interview_scheduled').length,
        offered: enriched.filter(app => app.status === 'offered').length,
        rejected: enriched.filter(app => app.status === 'rejected').length,
      },
    };
  }
}
