/**
 * 이력서 파서 진입점 — 각 도메인 파서를 조립하여 최종 ParsedResume 반환
 */

import { extractSkills } from '../tech-dictionary.js';
import type { Project, Skill, Education } from '../../types/profile.js';
import { splitSections } from './section-splitter.js';
import { extractContact } from './contact-extractor.js';
import { calculateExperience, calculateExperienceYears } from './experience-calculator.js';
import { parseProjects } from './project-parser.js';
import { parseEducation } from './education-parser.js';
import { parseCertifications } from './certification-parser.js';
import { inferJobCategory } from './category-inferrer.js';

export interface ParsedResume {
  name: string | null;
  email: string | null;
  phone: string | null;
  total_experience_years: number;
  total_experience_months: number;
  job_category: string;
  skills: Skill[];
  projects: Project[];
  domains: string[];
  education: Education[];
  certifications: string[];
  sections: Record<string, string>;
}

export function parseResumeText(
  resumeText: string,
  careerText?: string,
  portfolioText?: string,
): ParsedResume {
  const allText = [resumeText, careerText, portfolioText].filter(Boolean).join('\n\n');

  const sections = splitSections(allText);
  const contact = extractContact(sections._header || sections.contact || allText);

  const skillNames = extractSkills(allText);
  const skills: Skill[] = skillNames.map(name => ({ name, level: 'intermediate' as const }));

  const experience = calculateExperience(allText);

  const projectText = sections.projects || '';
  const careerSection = sections.career || '';
  // careerText를 sections.career보다 우선: sections.career는 회사명/기간만 있는 경우가 많고
  // 실제 프로젝트 목록은 careerText 원문에 있음
  const projects = parseProjects(projectText || careerText || careerSection);

  const education = parseEducation(sections.education || '');
  const certifications = parseCertifications(sections.certifications || '');

  const domainSet = new Set<string>();
  for (const p of projects) {
    if (p.domain) domainSet.add(p.domain);
  }

  const jobCategory = inferJobCategory(skillNames, allText);

  return {
    name: contact.name,
    email: contact.email,
    phone: contact.phone,
    total_experience_years: experience.years,
    total_experience_months: experience.months,
    job_category: jobCategory,
    skills,
    projects,
    domains: Array.from(domainSet),
    education,
    certifications,
    sections,
  };
}

export {
  splitSections,
  extractContact,
  calculateExperience,
  calculateExperienceYears,
  parseProjects,
  parseEducation,
  parseCertifications,
  inferJobCategory,
};
