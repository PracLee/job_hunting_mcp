/**
 * 채용 사이트별 이력서 양식 템플릿
 * LLM 없이도 기본 변환이 가능하도록 규칙 기반 템플릿 제공
 */

import type { UserProfile, Project, Skill, Education } from '../types/index.js';

export type PlatformType = 'wanted' | 'saramin' | 'jobkorea' | 'jumpit' | 'rocketpunch' | 'general';

export interface PlatformTemplate {
  platform: PlatformType;
  name: string;
  description: string;
  formatProfile(profile: UserProfile): PlatformOutput;
}

export interface PlatformOutput {
  platform: PlatformType;
  sections: Record<string, string>;
  copy_ready_text: string;
  platform_tips: string[];
}

// --- 원티드 ---

class WantedTemplate implements PlatformTemplate {
  platform = 'wanted' as const;
  name = '원티드';
  description = '한 줄 소개 + 경력(성과 중심 bullet) + 기술 태그 + 자유 자기소개서';

  formatProfile(profile: UserProfile): PlatformOutput {
    const oneLiner = `${profile.total_experience_years}년차 ${formatCategory(profile.job_category)} 개발자${profile.domains.length > 0 ? ', ' + profile.domains[0] + ' 도메인 경험' : ''}`;

    const careerSection = profile.projects.map(p => {
      const bullets = p.achievements.length > 0
        ? p.achievements.map(a => `• ${a}`).join('\n')
        : `• ${p.description}`;
      return `${p.name} (${p.duration})\n${p.role}\n${bullets}`;
    }).join('\n\n');

    const skillTags = profile.skills.map(s => s.name).join(', ');

    const sections: Record<string, string> = {
      '한 줄 소개': oneLiner,
      '경력': careerSection,
      '기술 스택': skillTags,
    };

    if (profile.education.length > 0) {
      sections['학력'] = profile.education.map(e =>
        `${e.school} ${e.major} ${e.degree}${e.year ? ' ' + e.year : ''}`
      ).join('\n');
    }

    const copyText = [
      `[한 줄 소개]`,
      oneLiner,
      '',
      `[경력]`,
      careerSection,
      '',
      `[기술 스택]`,
      skillTags,
    ].join('\n');

    return {
      platform: 'wanted',
      sections,
      copy_ready_text: copyText,
      platform_tips: [
        '원티드는 성과 중심 서술이 효과적 — 정량 지표를 앞에 배치하세요',
        '기술 태그는 JD에 나온 것과 동일한 표기법 사용 (예: "Spring Boot" not "SpringBoot")',
        '한 줄 소개는 50자 이내로 핵심만',
        '프로젝트는 최근 → 과거 순으로 배치',
      ],
    };
  }
}

// --- 사람인 ---

class SaraminTemplate implements PlatformTemplate {
  platform = 'saramin' as const;
  name = '사람인';
  description = '정형 이력서(표 형태) + 자기소개서 문항별 분리';

  formatProfile(profile: UserProfile): PlatformOutput {
    const basicInfo = [
      `이름: ${profile.name || '(입력 필요)'}`,
      `이메일: ${profile.email || '(입력 필요)'}`,
      `연락처: ${profile.phone || '(입력 필요)'}`,
    ].join('\n');

    const careerTable = profile.projects.map(p => {
      return [
        `회사/프로젝트: ${p.name}`,
        `기간: ${p.duration}`,
        `직급/역할: ${p.role}`,
        `업무내용:`,
        ...p.achievements.map(a => `  - ${a}`),
        p.description ? `  - ${p.description}` : '',
      ].filter(Boolean).join('\n');
    }).join('\n---\n');

    const eduSection = profile.education.map(e =>
      `${e.school} | ${e.major} | ${e.degree} | ${e.year || '졸업'}`
    ).join('\n');

    const certSection = profile.certifications.length > 0
      ? profile.certifications.join('\n')
      : '(없음)';

    const skillSection = profile.skills.map(s => s.name).join(', ');

    const sections: Record<string, string> = {
      '인적사항': basicInfo,
      '경력사항': careerTable,
      '학력사항': eduSection,
      '자격/어학': certSection,
      '보유기술': skillSection,
    };

    const copyText = Object.entries(sections).map(([key, val]) =>
      `[${key}]\n${val}`
    ).join('\n\n');

    return {
      platform: 'saramin',
      sections,
      copy_ready_text: copyText,
      platform_tips: [
        '사람인은 표 기반 이력서 — 각 항목을 정형 데이터로 입력해야 합니다',
        '자기소개서는 보통 4개 문항 (지원동기/성장과정/성격장단점/입사후포부)',
        '각 문항 500~1000자가 일반적',
        '경력사항은 최근 직장부터 역순으로 기재',
      ],
    };
  }
}

// --- 잡코리아 ---

class JobkoreaTemplate implements PlatformTemplate {
  platform = 'jobkorea' as const;
  name = '잡코리아';
  description = '표 기반 이력서 + 경력기술서 별도 + 자기소개서 문항';

  formatProfile(profile: UserProfile): PlatformOutput {
    const basicInfo = [
      `성명: ${profile.name || '(입력 필요)'}`,
      `이메일: ${profile.email || ''}`,
      `연락처: ${profile.phone || ''}`,
      `총 경력: ${profile.total_experience_years}년`,
    ].join('\n');

    const careerSummary = profile.projects.map(p =>
      `${p.name} | ${p.role} | ${p.duration}`
    ).join('\n');

    const careerDetail = profile.projects.map(p => {
      return [
        `[${p.name}]`,
        `기간: ${p.duration}`,
        `역할: ${p.role}`,
        `사용기술: ${p.tech_stack.join(', ')}`,
        `내용: ${p.description}`,
        `성과:`,
        ...p.achievements.map(a => `  • ${a}`),
      ].join('\n');
    }).join('\n\n');

    const sections: Record<string, string> = {
      '인적사항': basicInfo,
      '경력 요약': careerSummary,
      '경력기술서': careerDetail,
      '보유기술': profile.skills.map(s => s.name).join(', '),
      '학력': profile.education.map(e => `${e.school} ${e.major} ${e.degree} ${e.year || ''}`).join('\n'),
    };

    const copyText = Object.entries(sections).map(([key, val]) =>
      `[${key}]\n${val}`
    ).join('\n\n');

    return {
      platform: 'jobkorea',
      sections,
      copy_ready_text: copyText,
      platform_tips: [
        '잡코리아는 이력서와 경력기술서가 별도 — 경력기술서를 상세히 작성하세요',
        '프로젝트별 사용기술을 명확히 기재하면 검색 노출에 유리',
        '희망연봉 기재 시 시장 평균을 참고하세요',
      ],
    };
  }
}

// --- 점핏 ---

class JumpitTemplate implements PlatformTemplate {
  platform = 'jumpit' as const;
  name = '점핏';
  description = '기술 중심 프로필 + 프로젝트 카드 + 간단 소개';

  formatProfile(profile: UserProfile): PlatformOutput {
    const intro = `${profile.total_experience_years}년차 ${formatCategory(profile.job_category)} 개발자입니다. ${profile.domains.length > 0 ? profile.domains.join(', ') + ' 도메인 경험이 있습니다.' : ''}`.trim();

    const techProfile = groupSkillsByCategory(profile.skills);

    const projectCards = profile.projects.map(p => {
      const topAchievement = p.achievements[0] || p.description;
      return [
        `📌 ${p.name}`,
        `   ${p.duration} | ${p.role}`,
        `   기술: ${p.tech_stack.join(', ')}`,
        `   ${topAchievement}`,
      ].join('\n');
    }).join('\n\n');

    const sections: Record<string, string> = {
      '소개': intro,
      '기술 스택': techProfile,
      '프로젝트': projectCards,
    };

    const copyText = [
      `[소개]`,
      intro,
      '',
      `[기술 스택]`,
      techProfile,
      '',
      `[프로젝트]`,
      projectCards,
    ].join('\n');

    return {
      platform: 'jumpit',
      sections,
      copy_ready_text: copyText,
      platform_tips: [
        '점핏은 기술 중심 — 기술 태그와 숙련도를 상세히 입력하세요',
        '프로젝트는 카드 형태로 표시되므로 핵심 성과 한 줄이 중요',
        'GitHub/블로그 링크를 반드시 등록하세요',
        '간단 소개는 300자 이내',
      ],
    };
  }
}

// --- 로켓펀치 ---

class RocketpunchTemplate implements PlatformTemplate {
  platform = 'rocketpunch' as const;
  name = '로켓펀치';
  description = '링크드인 스타일 프로필 — 요약 + 경험 타임라인 + 기술 태그';

  formatProfile(profile: UserProfile): PlatformOutput {
    const summary = `${formatCategory(profile.job_category)} 개발자 | ${profile.total_experience_years}년 경력 | ${profile.skills.slice(0, 5).map(s => s.name).join(', ')}`;

    const timeline = profile.projects.map(p =>
      `${p.duration}\n${p.name} — ${p.role}\n${p.achievements.slice(0, 2).join(' / ') || p.description}`
    ).join('\n\n');

    const sections: Record<string, string> = {
      '요약': summary,
      '경험': timeline,
      '기술': profile.skills.map(s => s.name).join(', '),
      '학력': profile.education.map(e => `${e.school} ${e.major}`).join(', '),
    };

    const copyText = Object.entries(sections).map(([key, val]) =>
      `[${key}]\n${val}`
    ).join('\n\n');

    return {
      platform: 'rocketpunch',
      sections,
      copy_ready_text: copyText,
      platform_tips: [
        '로켓펀치는 링크드인 스타일 — 요약 한 줄이 프로필의 첫인상',
        '경험은 최신순 타임라인으로 표시됨',
        '스타트업/중소기업 공고가 많으므로 폭넓은 기술 경험을 강조',
      ],
    };
  }
}

// --- 범용 ---

class GeneralTemplate implements PlatformTemplate {
  platform = 'general' as const;
  name = '범용';
  description = '일반적인 한국 이력서/경력기술서 포맷';

  formatProfile(profile: UserProfile): PlatformOutput {
    const header = [
      profile.name || '(이름)',
      profile.email ? `이메일: ${profile.email}` : '',
      profile.phone ? `연락처: ${profile.phone}` : '',
      `${profile.total_experience_years}년차 ${formatCategory(profile.job_category)} 개발자`,
    ].filter(Boolean).join('\n');

    const skills = `보유 기술: ${profile.skills.map(s => s.name).join(', ')}`;

    const career = profile.projects.map(p => {
      return [
        `■ ${p.name}`,
        `  기간: ${p.duration}`,
        `  역할: ${p.role}`,
        `  기술: ${p.tech_stack.join(', ')}`,
        `  설명: ${p.description}`,
        p.achievements.length > 0 ? `  성과:\n${p.achievements.map(a => `    - ${a}`).join('\n')}` : '',
      ].filter(Boolean).join('\n');
    }).join('\n\n');

    const edu = profile.education.length > 0
      ? profile.education.map(e => `${e.school} ${e.major} ${e.degree} ${e.year || ''}`).join('\n')
      : '';

    const certs = profile.certifications.length > 0
      ? profile.certifications.join(', ')
      : '';

    const parts = [header, '', skills, '', '경력/프로젝트', career];
    if (edu) parts.push('', '학력', edu);
    if (certs) parts.push('', '자격증', certs);

    const copyText = parts.join('\n');

    return {
      platform: 'general',
      sections: { '전체': copyText },
      copy_ready_text: copyText,
      platform_tips: [
        '범용 포맷입니다. 필요에 따라 수정하세요.',
        '이메일 지원 시 PDF로 변환하여 첨부하세요.',
      ],
    };
  }
}

// --- 헬퍼 ---

function formatCategory(category: string): string {
  const map: Record<string, string> = {
    backend: '백엔드',
    frontend: '프론트엔드',
    fullstack: '풀스택',
    mobile: '모바일',
    data: '데이터',
    devops: 'DevOps',
    ai_ml: 'AI/ML',
    security: '보안',
    other: '',
  };
  return map[category] || category;
}

function groupSkillsByCategory(skills: Skill[]): string {
  // 간단하게 나열
  if (skills.length <= 10) {
    return skills.map(s => s.name).join(', ');
  }
  return skills.map(s => s.name).join(', ');
}

// --- Registry ---

const templates = new Map<PlatformType, PlatformTemplate>();

function register(t: PlatformTemplate) { templates.set(t.platform, t); }

register(new WantedTemplate());
register(new SaraminTemplate());
register(new JobkoreaTemplate());
register(new JumpitTemplate());
register(new RocketpunchTemplate());
register(new GeneralTemplate());

export function getTemplate(platform: PlatformType): PlatformTemplate {
  const t = templates.get(platform);
  if (!t) throw new Error(`지원하지 않는 플랫폼: ${platform}`);
  return t;
}

export function getAllTemplates(): PlatformTemplate[] {
  return Array.from(templates.values());
}
