import { describe, it, expect } from 'vitest';
import { getTemplate, getAllTemplates } from '../../src/core/platform-templates.js';
import type { UserProfile } from '../../src/types/profile.js';

const MOCK_PROFILE: UserProfile = {
  id: 'up_test',
  name: '이병재',
  email: 'test@example.com',
  phone: '010-1234-5678',
  total_experience_years: 5,
  job_category: 'backend',
  skills: [
    { name: 'Java', level: 'advanced' },
    { name: 'Spring Boot', level: 'advanced' },
    { name: 'MySQL', level: 'advanced' },
    { name: 'Redis', level: 'intermediate' },
    { name: 'Kafka', level: 'intermediate' },
    { name: 'Kubernetes', level: 'intermediate' },
  ],
  projects: [
    {
      name: '결제 시스템 MSA 전환',
      role: '백엔드 리드',
      duration: '2022.06 ~ 2023.12',
      tech_stack: ['Java', 'Spring Boot', 'MySQL', 'Kafka'],
      description: '모놀리식 결제 시스템을 MSA로 전환',
      achievements: ['결제 처리 속도 40% 개선', '장애율 월 3건 → 0건'],
      domain: 'fintech',
      tags: ['msa', 'performance'],
    },
    {
      name: '선물하기 API 서버',
      role: '백엔드 개발자',
      duration: '2020.01 ~ 2022.02',
      tech_stack: ['Kotlin', 'Spring Boot', 'MySQL', 'Redis'],
      description: '카카오톡 선물하기 서비스 API 개발',
      achievements: ['일 300만 API 호출 처리', 'DB 부하 60% 감소'],
      domain: 'e-commerce',
      tags: ['scale', 'api'],
    },
  ],
  domains: ['fintech', 'e-commerce'],
  education: [{ school: '서울대학교', major: '컴퓨터공학', degree: '학사', year: 2019 }],
  certifications: ['정보처리기사'],
  raw_resume_text: '',
  raw_career_text: null,
  raw_portfolio_text: null,
  created_at: '2024-01-01',
  updated_at: '2024-01-01',
};

describe('platform-templates', () => {
  it('6개 플랫폼 템플릿이 등록되어 있다', () => {
    const all = getAllTemplates();
    expect(all.length).toBe(6);
  });

  describe.each(['wanted', 'saramin', 'jobkorea', 'jumpit', 'rocketpunch', 'general'] as const)('%s 템플릿', (platform) => {
    it('프로필을 변환할 수 있다', () => {
      const template = getTemplate(platform);
      const output = template.formatProfile(MOCK_PROFILE);

      expect(output.platform).toBe(platform);
      expect(output.copy_ready_text).toBeTruthy();
      expect(output.copy_ready_text.length).toBeGreaterThan(50);
      expect(output.platform_tips.length).toBeGreaterThan(0);
    });

    it('프로필 정보가 변환 결과에 포함되어 있다', () => {
      const template = getTemplate(platform);
      const output = template.formatProfile(MOCK_PROFILE);
      const text = output.copy_ready_text;

      // 주요 정보가 포함되어야 함
      expect(text).toContain('결제');
      expect(text).toContain('Java');
    });
  });

  describe('원티드 특화', () => {
    it('한 줄 소개가 포함된다', () => {
      const output = getTemplate('wanted').formatProfile(MOCK_PROFILE);
      expect(output.sections['한 줄 소개']).toBeTruthy();
      expect(output.sections['한 줄 소개']).toContain('백엔드');
    });

    it('성과 bullet이 포함된다', () => {
      const output = getTemplate('wanted').formatProfile(MOCK_PROFILE);
      expect(output.sections['경력']).toContain('40%');
    });
  });

  describe('사람인 특화', () => {
    it('인적사항 섹션이 있다', () => {
      const output = getTemplate('saramin').formatProfile(MOCK_PROFILE);
      expect(output.sections['인적사항']).toContain('이병재');
      expect(output.sections['인적사항']).toContain('test@example.com');
    });
  });

  describe('점핏 특화', () => {
    it('소개가 300자 이내다', () => {
      const output = getTemplate('jumpit').formatProfile(MOCK_PROFILE);
      expect(output.sections['소개'].length).toBeLessThanOrEqual(300);
    });
  });
});
