import { ProfileRepository } from '../db/repositories/profile-repository.js';
import { parseResumeText } from '../core/resume-parser.js';
import { getLlmClient } from '../core/llm-client.js';
import { resolveProfileOrThrow } from './shared/resolvers.js';

export class ProfileService {
  private readonly profileRepo = new ProfileRepository();

  async parseResume(params: {
    resume_text: string;
    career_description_text?: string;
    portfolio_text?: string;
    reset_overrides?: boolean;
    override_total_experience_months?: number;
  }) {
    const ruleBased = parseResumeText(
      params.resume_text,
      params.career_description_text,
      params.portfolio_text,
    );

    let llmParsed: any = {};
    try {
      const llm = getLlmClient();
      const allText = [params.resume_text, params.career_description_text, params.portfolio_text]
        .filter(Boolean)
        .join('\n\n---\n\n');

      const response = await llm.generate({
        system: `너는 한국 개발자 이력서 파싱 전문가다. 주어진 텍스트에서 아래 정보를 JSON으로만 추출해라.

【핵심 규칙】
1. "WMS Android API" 같은 프로젝트명이나 조직 이름에서 기술 이름(Android 등)을 함부로 추측하여 추출하지 마라.
2. 이력서에 명시적으로 사용했다고 쓰여있거나 "Role/Tech Stack"에 등장하는 기술만 추출해라.
3. 기술 이름은 가급적 표준 명칭(예: Spring Boot, PostgreSQL, React)으로 통일해라.
4. "프로젝트" 형식을 파악하기 불가능하다면, 억지로 여러 개로 쪼개지 말고 차라리 전체 내용을 "이력서 원문 프로젝트"라는 하나의 프로젝트 "description"에 모두 통째로 넣어서 내용 유실을 막아라.
5. 각 기술 스택별로 어디서 추출했는지 문맥(source_span)을 "skills_confidence" 배열에 같이 담아라.

{
  "name": "이름 (없으면 null)",
  "job_category": "backend|frontend|fullstack|mobile|data|devops|ai_ml|other",
  "total_experience_years": 숫자,
  "skills_confidence": [
    {"name": "Spring Boot", "source_span": "주문 시스템 Spring Boot로 전환", "confidence": 0.9}
  ],
  "projects": [
    {
      "name": "프로젝트명",
      "role": "역할",
      "duration": "기간",
      "tech_stack": ["기술1"],
      "description": "한 줄 설명",
      "achievements": ["성과1"]
    }
  ],
  "domains": ["fintech"],
  "education": [{"school": "", "major": "", "degree": "학사|석사|박사", "year": 2021}],
  "certifications": []
}`,
        messages: [{ role: 'user', content: allText }],
        temperature: 0.1,
      });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        llmParsed = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // LLM 실패 시 규칙 기반만 사용
    }

    const mergedName = ruleBased.name || llmParsed.name || null;
    const mergedEmail = ruleBased.email || llmParsed.email || null;
    const mergedPhone = ruleBased.phone || llmParsed.phone || null;
    const mergedYears = ruleBased.total_experience_years || llmParsed.total_experience_years || 0;
    const mergedMonths = ruleBased.total_experience_months || Math.round(mergedYears * 12);
    const mergedCategory = ruleBased.job_category !== 'other' ? ruleBased.job_category : (llmParsed.job_category || 'other');

    let mergedSkills: any[] = [];
    if (llmParsed.skills_confidence && llmParsed.skills_confidence.length > 0) {
      mergedSkills = llmParsed.skills_confidence.map((skill: any) => ({
        name: skill.name,
        level: 'intermediate',
        source: skill.source_span,
        confidence: skill.confidence,
      }));
    } else {
      mergedSkills = ruleBased.skills;
    }

    const mergedProjects = ruleBased.projects.length > 0 ? ruleBased.projects : (llmParsed.projects || []);
    const domainSet = new Set([...ruleBased.domains, ...(llmParsed.domains || [])]);
    const mergedEducation = ruleBased.education.length > 0 ? ruleBased.education : (llmParsed.education || []);
    const mergedCerts = ruleBased.certifications.length > 0 ? ruleBased.certifications : (llmParsed.certifications || []);

    let carryConfirmed: string[] = [];
    let carryRejected: string[] = [];
    if (params.reset_overrides !== true) {
      const prevProfile = this.profileRepo.findAll()[0];
      carryConfirmed = prevProfile ? prevProfile.user_confirmed_skills : [];
      carryRejected = prevProfile ? prevProfile.user_rejected_skills : [];
    }

    const rejectedSet = new Set(carryRejected);
    const filteredSkills = mergedSkills.filter((skill: any) => {
      const name = typeof skill === 'string' ? skill : skill.name;
      return !rejectedSet.has(name);
    });

    const finalMonths = params.override_total_experience_months !== undefined
      ? params.override_total_experience_months
      : mergedMonths;
    const finalYears = Number((finalMonths / 12).toFixed(2));

    const profile = this.profileRepo.save({
      name: mergedName,
      email: mergedEmail,
      phone: mergedPhone,
      total_experience_years: finalYears,
      total_experience_months: finalMonths,
      job_category: mergedCategory,
      skills: filteredSkills,
      user_confirmed_skills: carryConfirmed,
      user_rejected_skills: carryRejected,
      projects: mergedProjects,
      domains: Array.from(domainSet),
      education: mergedEducation,
      certifications: mergedCerts,
      raw_resume_text: params.resume_text,
      raw_career_text: params.career_description_text || null,
      raw_portfolio_text: params.portfolio_text || null,
    });

    const warnings: string[] = [];
    if (!mergedName) warnings.push('이름을 추출하지 못했습니다.');
    if (mergedSkills.length === 0) warnings.push('기술스택을 추출하지 못했습니다.');
    if (mergedProjects.length === 0) warnings.push('프로젝트를 추출하지 못했습니다. 경력기술서를 추가로 입력해주세요.');
    if (mergedYears === 0) warnings.push('경력 연차를 추출하지 못했습니다.');

    return {
      message: '프로필이 저장되었습니다.',
      profile_id: profile.id,
      parsing_method: llmParsed.name ? '규칙 기반 + LLM 보조' : '규칙 기반 (LLM 미사용)',
      summary: {
        name: profile.name,
        experience_years: profile.total_experience_years,
        job_category: profile.job_category,
        skills_count: filteredSkills.length,
        projects_count: mergedProjects.length,
        domains: Array.from(domainSet),
      },
      diff: {
        skills_raw_extracted: mergedSkills.map((skill: any) => typeof skill === 'string' ? skill : skill.name),
        skills_ignored_by_user_rejection: Array.from(rejectedSet),
        skills_finally_saved: filteredSkills.map((skill: any) => typeof skill === 'string' ? skill : skill.name),
        user_confirmed_skills_carried_over: carryConfirmed,
      },
      warnings,
      sections_found: Object.keys(ruleBased.sections),
      next_steps: [
        '결과가 부정확하다면 profile_update_skills나 profile_update_experience 도구로 직접 보정하세요.',
        'match_score_job으로 공고와의 적합도를 확인하세요.',
        'resume_tailor로 공고에 맞게 서류를 맞춤화하세요.',
      ],
    };
  }

  updateSkills(params: { profile_id?: string; add_skills?: string[]; remove_skills?: string[] }) {
    const profile = resolveProfileOrThrow(this.profileRepo, params.profile_id, '수정할 프로필이 없습니다.');

    const currentSkills = profile.skills || [];
    const confirmed = new Set(profile.user_confirmed_skills || []);
    const rejected = new Set(profile.user_rejected_skills || []);

    params.remove_skills?.forEach(skill => {
      rejected.add(skill);
      confirmed.delete(skill);
    });

    params.add_skills?.forEach(skill => {
      confirmed.add(skill);
      rejected.delete(skill);
    });

    const finalSkills = currentSkills.filter((skill: any) => {
      const name = typeof skill === 'string' ? skill : skill.name;
      return !rejected.has(name);
    });

    confirmed.forEach(skill => {
      const exists = finalSkills.find((current: any) => (typeof current === 'string' ? current : current.name) === skill);
      if (!exists) {
        finalSkills.push({ name: skill, level: 'intermediate' });
      }
    });

    this.profileRepo.update(profile.id, {
      skills: finalSkills,
      user_confirmed_skills: Array.from(confirmed),
      user_rejected_skills: Array.from(rejected),
    });

    return {
      message: '기술 스택이 성공적으로 교정되었습니다.',
      updated_skills: finalSkills.map((skill: any) => typeof skill === 'string' ? skill : skill.name),
      confirmed_skills: Array.from(confirmed),
      rejected_skills: Array.from(rejected),
    };
  }

  updateExperience(params: { profile_id?: string; total_experience_months: number }) {
    const profile = resolveProfileOrThrow(this.profileRepo, params.profile_id, '수정할 프로필이 없습니다.');
    const months = params.total_experience_months;
    const years = Number((months / 12).toFixed(2));

    this.profileRepo.update(profile.id, {
      total_experience_months: months,
      total_experience_years: years,
    });

    return {
      message: '경력 기간이 성공적으로 교정되었습니다.',
      total_experience_months: months,
      total_experience_years: years,
      formatted: `${Math.floor(months / 12)}년 ${months % 12}개월`,
    };
  }

  listVersions() {
    return {
      history: this.profileRepo.findAll().map(profile => ({
        id: profile.id,
        updated_at: profile.updated_at,
        name: profile.name,
        total_experience_months: profile.total_experience_months,
        skills_count: profile.skills?.length || 0,
      })),
    };
  }

  rollbackVersion(params: { target_profile_id: string }) {
    const targetProfile = this.profileRepo.findById(params.target_profile_id);
    if (!targetProfile) {
      throw new Error('해당 ID의 프로필을 찾을 수 없습니다.');
    }

    this.profileRepo.update(targetProfile.id, {});

    return {
      message: '성공적으로 롤백되어 마스터 프로필이 복구되었습니다.',
      rolled_back_to_id: targetProfile.id,
      restored_time: new Date().toISOString(),
    };
  }

  confirmSkills(params: { profile_id?: string }) {
    const profile = resolveProfileOrThrow(this.profileRepo, params.profile_id, '수정할 프로필이 없습니다.');
    const confirmed = new Set(profile.user_confirmed_skills || []);

    (profile.skills || []).forEach((skill: any) => {
      const name = typeof skill === 'string' ? skill : skill.name;
      confirmed.add(name);
    });

    this.profileRepo.update(profile.id, {
      user_confirmed_skills: Array.from(confirmed),
    });

    return {
      message: '자동 추출되었던 스킬들이 모두 수동 확정계층(user_confirmed)으로 복사/저장되었습니다.',
      total_confirmed_skills: Array.from(confirmed),
    };
  }

  getProfile(params: { profile_id?: string }) {
    const profile = params.profile_id
      ? this.profileRepo.findById(params.profile_id)
      : this.profileRepo.findAll()[0] || null;

    if (!profile) {
      return null;
    }

    return {
      id: profile.id,
      last_updated: profile.updated_at,
      layer_user_confirmed: {
        total_experience_years: profile.total_experience_years,
        total_experience_months: profile.total_experience_months,
        user_confirmed_skills: profile.user_confirmed_skills,
        user_rejected_skills: profile.user_rejected_skills,
      },
      layer_parsed_structured: {
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        job_category: profile.job_category,
        skills_extracted: profile.skills,
        projects: profile.projects,
        domains: profile.domains,
        education: profile.education,
        certifications: profile.certifications,
      },
      layer_raw_source: {
        raw_resume_text: profile.raw_resume_text,
        raw_career_text: profile.raw_career_text,
        raw_portfolio_text: profile.raw_portfolio_text,
      },
    };
  }
}
