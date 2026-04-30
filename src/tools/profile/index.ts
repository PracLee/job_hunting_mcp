import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ProfileService } from '../../services/profile-service.js';

export function registerProfileTools(server: McpServer): void {
  const profileService = new ProfileService();

  server.tool(
    'profile_parse_resume',
    '이력서/경력기술서 텍스트를 구조화된 프로필로 파싱합니다. 한 번 입력하면 마스터 프로필로 저장되어 모든 도구에서 사용됩니다.',
    {
      resume_text: z.string().describe('이력서/경력기술서 자유 서술 텍스트 (줄바꿈 포함 자유 형태)'),
      career_description_text: z.string().optional().describe('경력기술서 원문 텍스트'),
      portfolio_text: z.string().optional().describe('포트폴리오/프로젝트 설명 텍스트'),
      reset_overrides: z.boolean().optional().describe('TRUE: 이전에 수동으로 확정/거절한(Carry-over) 기술 스택이나 경험치 데이터를 완전히 초기화하고 이번 입력만으로 프로필을 새로 덮어씁니다. FALSE(기본값): 기존 수동 교정 내역을 병합합니다.'),
      override_total_experience_months: z.number().optional().describe('사용자가 직접 지정하는 총 경력 월수. 입력 데이터에 명확한 개월 수가 있다면 파서를 거치지 않고 이 값으로 강제 확정합니다.'),
    },
    async params => {
      try {
        const result = await profileService.parseResume(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `파싱 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'profile_update_skills',
    '마스터 프로필의 기술스택을 수동으로 교정합니다. (파서 오인식 보정 및 누락 항목 추가용)',
    {
      profile_id: z.string().optional().describe('수정할 프로필 ID (없으면 가장 최근 프로필)'),
      add_skills: z.array(z.string()).optional().describe('수동으로 확실하게 추가할 기술스택 이름 목록'),
      remove_skills: z.array(z.string()).optional().describe('파서가 문맥을 오인하여 잘못 추출한 삭제할 기술스택 이름 목록'),
    },
    async params => {
      try {
        const result = profileService.updateSkills(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `수정 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'profile_update_experience',
    '마스터 프로필의 총 경력을 정밀하게 수동 교정합니다.',
    {
      profile_id: z.string().optional().describe('수정할 프로필 ID (없으면 가장 최근 프로필)'),
      total_experience_months: z.number().describe('총 경력 (개월 수 단위, 예: 3년 8개월 -> 44)'),
    },
    async params => {
      try {
        const result = profileService.updateExperience(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `수정 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'profile_list_versions',
    '이전에 파싱/저장된 프로필의 전체 히스토리(버전 스냅샷) 목록을 조회합니다. 롤백할 때 필요한 ID를 찾을 수 있습니다.',
    {},
    async () => {
      try {
        const result = profileService.listVersions();
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `조회 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'profile_rollback_version',
    '지정한 특정 과거 시점(버전)의 프로필 상태로 롤백(복구)합니다. 현재 유지중이던 변경사항은 모두 덮어씌워집니다.',
    {
      target_profile_id: z.string().describe('profile_list_versions에서 찾은 복구하고 싶은 과거 프로필의 ID'),
    },
    async params => {
      try {
        const result = profileService.rollbackVersion(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `롤백 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'profile_confirm_skills',
    '파서가 자동 추출했던(parsed_structured) 현재 기술 스택들을 모두 검증된(user_confirmed) 상태로 강제 전환하여 확정합니다. 이후 새로 파싱해도 이 기술들은 무조건 보존됩니다.',
    {
      profile_id: z.string().optional().describe('수정할 프로필 ID (없으면 가장 최근 프로필)'),
    },
    async params => {
      try {
        const result = profileService.confirmSkills(params);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `작업 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'profile_get',
    '저장된 프로필을 조회합니다.',
    {
      profile_id: z.string().optional().describe('프로필 ID (없으면 가장 최근 프로필)'),
    },
    async params => {
      try {
        const result = profileService.getProfile(params);
        if (!result) {
          return {
            content: [{
              type: 'text' as const,
              text: '저장된 프로필이 없습니다. profile_parse_resume으로 먼저 프로필을 등록하세요.',
            }],
          };
        }

        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: `조회 실패: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );
}
