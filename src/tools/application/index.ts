import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ApplicationRepository } from '../../db/repositories/application-repository.js';
import { JobRepository } from '../../db/repositories/job-repository.js';
import { ProfileRepository } from '../../db/repositories/profile-repository.js';

const STATUS_VALUES = ['saved', 'reviewing', 'applied', 'document_passed', 'interview_scheduled', 'rejected', 'offered'] as const;

export function registerApplicationTools(server: McpServer): void {
  const appRepo = new ApplicationRepository();
  const jobRepo = new JobRepository();
  const profileRepo = new ProfileRepository();

  server.tool(
    'application_create',
    '채용공고에 대한 지원 기록을 생성합니다.',
    {
      job_id: z.string().describe('채용공고 ID'),
      profile_id: z.string().optional().describe('프로필 ID'),
      status: z.enum(STATUS_VALUES).optional().default('saved'),
      notes: z.string().optional().describe('메모'),
    },
    async (params) => {
      try {
        const profileId = params.profile_id || profileRepo.findAll()[0]?.id;
        if (!profileId) return { content: [{ type: 'text' as const, text: '프로필이 없습니다.' }], isError: true };

        const job = jobRepo.findById(params.job_id);
        if (!job) return { content: [{ type: 'text' as const, text: '공고를 찾을 수 없습니다.' }], isError: true };

        const app = appRepo.create(params.job_id, profileId, params.status, params.notes);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              message: '지원 기록이 생성되었습니다.',
              application: { ...app, company_name: job.company_name, job_title: job.job_title },
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `생성 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'application_update_status',
    '지원 상태를 업데이트합니다.',
    {
      application_id: z.string().describe('지원 기록 ID'),
      new_status: z.enum(STATUS_VALUES).describe('새 상태'),
      notes: z.string().optional().describe('메모'),
    },
    async (params) => {
      try {
        const app = appRepo.updateStatus(params.application_id, params.new_status, params.notes);
        if (!app) return { content: [{ type: 'text' as const, text: '지원 기록을 찾을 수 없습니다.' }], isError: true };

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ message: `상태가 '${params.new_status}'로 변경되었습니다.`, application: app }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `업데이트 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'application_list',
    '지원 현황 목록을 조회합니다.',
    {
      profile_id: z.string().optional().describe('프로필 ID'),
      status_filter: z.enum(STATUS_VALUES).optional().describe('상태 필터'),
    },
    async (params) => {
      try {
        const profileId = params.profile_id || profileRepo.findAll()[0]?.id;
        if (!profileId) return { content: [{ type: 'text' as const, text: '프로필이 없습니다.' }], isError: true };

        const apps = appRepo.findByProfile(profileId, params.status_filter);

        // 공고 정보 붙이기
        const enriched = apps.map(app => {
          const job = jobRepo.findById(app.job_id);
          return {
            ...app,
            company_name: job?.company_name || '알 수 없음',
            job_title: job?.job_title || '알 수 없음',
          };
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              total: enriched.length,
              applications: enriched,
              summary: {
                saved: enriched.filter(a => a.status === 'saved').length,
                applied: enriched.filter(a => a.status === 'applied').length,
                document_passed: enriched.filter(a => a.status === 'document_passed').length,
                interview_scheduled: enriched.filter(a => a.status === 'interview_scheduled').length,
                offered: enriched.filter(a => a.status === 'offered').length,
                rejected: enriched.filter(a => a.status === 'rejected').length,
              },
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `조회 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    }
  );
}
