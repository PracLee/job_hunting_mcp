import { getDb } from '../connection.js';
import type { UserProfile } from '../../types/index.js';
import { generateId } from '../../core/utils.js';

export class ProfileRepository {
  save(profile: Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>): UserProfile {
    const db = getDb();
    const id = generateId('up');
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO user_profiles
        (id, name, email, phone, total_experience_years, job_category,
         skills, projects, domains, education, certifications,
         raw_resume_text, raw_career_text, raw_portfolio_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, profile.name, profile.email, profile.phone,
      profile.total_experience_years, profile.job_category,
      JSON.stringify(profile.skills), JSON.stringify(profile.projects),
      JSON.stringify(profile.domains), JSON.stringify(profile.education),
      JSON.stringify(profile.certifications),
      profile.raw_resume_text, profile.raw_career_text, profile.raw_portfolio_text,
      now, now
    );

    return { id, ...profile, created_at: now, updated_at: now };
  }

  update(id: string, updates: Partial<UserProfile>): UserProfile | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const db = getDb();
    const now = new Date().toISOString();
    const merged = { ...existing, ...updates, updated_at: now };

    db.prepare(`
      UPDATE user_profiles SET
        name = ?, email = ?, phone = ?, total_experience_years = ?,
        job_category = ?, skills = ?, projects = ?, domains = ?,
        education = ?, certifications = ?, raw_resume_text = ?,
        raw_career_text = ?, raw_portfolio_text = ?, updated_at = ?
      WHERE id = ?
    `).run(
      merged.name, merged.email, merged.phone, merged.total_experience_years,
      merged.job_category, JSON.stringify(merged.skills), JSON.stringify(merged.projects),
      JSON.stringify(merged.domains), JSON.stringify(merged.education),
      JSON.stringify(merged.certifications), merged.raw_resume_text,
      merged.raw_career_text, merged.raw_portfolio_text, now, id
    );

    return merged;
  }

  findById(id: string): UserProfile | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM user_profiles WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToProfile(row) : null;
  }

  findAll(): UserProfile[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM user_profiles ORDER BY updated_at DESC').all() as Record<string, unknown>[];
    return rows.map(row => this.rowToProfile(row));
  }

  private rowToProfile(row: Record<string, unknown>): UserProfile {
    return {
      id: row.id as string,
      name: row.name as string | null,
      email: row.email as string | null,
      phone: row.phone as string | null,
      total_experience_years: row.total_experience_years as number,
      job_category: row.job_category as string,
      skills: JSON.parse(row.skills as string || '[]'),
      projects: JSON.parse(row.projects as string || '[]'),
      domains: JSON.parse(row.domains as string || '[]'),
      education: JSON.parse(row.education as string || '[]'),
      certifications: JSON.parse(row.certifications as string || '[]'),
      raw_resume_text: row.raw_resume_text as string,
      raw_career_text: row.raw_career_text as string | null,
      raw_portfolio_text: row.raw_portfolio_text as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
