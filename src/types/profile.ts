export interface Skill {
  name: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  years?: number;
}

export interface Project {
  name: string;
  role: string;
  duration: string;
  tech_stack: string[];
  description: string;
  achievements: string[];
  domain: string;
  tags: string[];
}

export interface Education {
  school: string;
  major: string;
  degree: string;
  year: number;
}

export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  total_experience_years: number;
  total_experience_months: number;
  job_category: string;
  skills: Skill[];
  user_confirmed_skills: string[];
  user_rejected_skills: string[];
  projects: Project[];
  domains: string[];
  education: Education[];
  certifications: string[];
  raw_resume_text: string;
  raw_career_text: string | null;
  raw_portfolio_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParseResumeParams {
  resume_text: string;
  career_description_text?: string;
  portfolio_text?: string;
  document_type?: 'resume' | 'career_description' | 'portfolio' | 'combined';
}

export interface ParseResumeResult {
  profile: UserProfile;
  confidence: number;
  warnings: string[];
}
