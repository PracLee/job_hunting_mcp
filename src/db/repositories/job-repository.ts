import { getDb } from '../connection.js';
import type { JobPosting, JobSearchParams, JobSource } from '../../types/index.js';
import { generateId } from '../../core/utils.js';
import { scoreJobSearchMatch } from '../../core/job-search.js';

export class JobRepository {
  save(job: Omit<JobPosting, 'id'> & Partial<Pick<JobPosting, 'id'>>): JobPosting {
    const db = getDb();
    const existing = job.source_id ? this.findBySourceId(job.source, job.source_id) : null;
    const id = existing?.id || job.id || generateId('jp');

    const payload: JobPosting = {
      id,
      source: job.source,
      source_id: job.source_id,
      company_name: job.company_name,
      job_title: job.job_title,
      job_category: job.job_category,
      experience_min: job.experience_min,
      experience_max: job.experience_max,
      employment_type: job.employment_type,
      location: job.location,
      salary_text: job.salary_text,
      required_skills: job.required_skills,
      preferred_skills: job.preferred_skills,
      responsibilities: job.responsibilities,
      qualifications: job.qualifications,
      preferences: job.preferences,
      deadline: job.deadline,
      url: job.url,
      raw_text: job.raw_text,
      fetched_at: job.fetched_at,
    };

    if (existing) {
      db.prepare(`
        UPDATE job_postings SET
          source = ?, source_id = ?, company_name = ?, job_title = ?, job_category = ?,
          experience_min = ?, experience_max = ?, employment_type = ?, location = ?, salary_text = ?,
          required_skills = ?, preferred_skills = ?, responsibilities = ?, qualifications = ?,
          preferences = ?, deadline = ?, url = ?, raw_text = ?, fetched_at = ?
        WHERE id = ?
      `).run(
        payload.source, payload.source_id, payload.company_name, payload.job_title, payload.job_category,
        payload.experience_min, payload.experience_max, payload.employment_type, payload.location, payload.salary_text,
        JSON.stringify(payload.required_skills), JSON.stringify(payload.preferred_skills),
        JSON.stringify(payload.responsibilities), JSON.stringify(payload.qualifications),
        JSON.stringify(payload.preferences), payload.deadline, payload.url, payload.raw_text, payload.fetched_at,
        payload.id,
      );
    } else {
      db.prepare(`
        INSERT INTO job_postings
          (id, source, source_id, company_name, job_title, job_category,
           experience_min, experience_max, employment_type, location, salary_text,
           required_skills, preferred_skills, responsibilities, qualifications,
           preferences, deadline, url, raw_text, fetched_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.id, payload.source, payload.source_id, payload.company_name, payload.job_title, payload.job_category,
        payload.experience_min, payload.experience_max, payload.employment_type, payload.location, payload.salary_text,
        JSON.stringify(payload.required_skills), JSON.stringify(payload.preferred_skills),
        JSON.stringify(payload.responsibilities), JSON.stringify(payload.qualifications),
        JSON.stringify(payload.preferences), payload.deadline, payload.url, payload.raw_text, payload.fetched_at,
      );
    }

    return payload;
  }

  findById(id: string): JobPosting | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM job_postings WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToJob(row) : null;
  }

  findBySourceId(source: JobSource, sourceId: string): JobPosting | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM job_postings WHERE source = ? AND source_id = ?').get(source, sourceId) as Record<string, unknown> | undefined;
    return row ? this.rowToJob(row) : null;
  }

  search(params: JobSearchParams): JobPosting[] {
    const db = getDb();
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.location) {
      conditions.push('location LIKE ?');
      values.push(`%${params.location}%`);
    }
    if (params.job_category) {
      conditions.push('job_category = ?');
      values.push(params.job_category);
    }
    if (params.experience_min !== undefined) {
      conditions.push('(experience_max IS NULL OR experience_max >= ?)');
      values.push(params.experience_min);
    }
    if (params.experience_max !== undefined) {
      conditions.push('(experience_min IS NULL OR experience_min <= ?)');
      values.push(params.experience_max);
    }
    if (params.sources && params.sources.length > 0) {
      conditions.push(`source IN (${params.sources.map(() => '?').join(',')})`);
      values.push(...params.sources);
    }

    const limit = params.limit || 20;
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = db.prepare(
      `SELECT * FROM job_postings ${where} ORDER BY fetched_at DESC`
    ).all(...values) as Record<string, unknown>[];

    let jobs = rows.map(row => this.rowToJob(row));

    if (params.keywords.length > 0) {
      jobs = jobs
        .map(job => ({ job, search: scoreJobSearchMatch(job, params.keywords) }))
        .filter(item => item.search.matched)
        .sort((left, right) => {
          if (right.search.score !== left.search.score) return right.search.score - left.search.score;
          return right.job.fetched_at.localeCompare(left.job.fetched_at);
        })
        .map(item => item.job);
    }

    return jobs.slice(0, limit);
  }

  private rowToJob(row: Record<string, unknown>): JobPosting {
    return {
      id: row.id as string,
      source: row.source as JobSource,
      source_id: row.source_id as string,
      company_name: row.company_name as string,
      job_title: row.job_title as string,
      job_category: row.job_category as JobPosting['job_category'],
      experience_min: row.experience_min as number | null,
      experience_max: row.experience_max as number | null,
      employment_type: row.employment_type as string,
      location: row.location as string,
      salary_text: row.salary_text as string | null,
      required_skills: JSON.parse(row.required_skills as string || '[]'),
      preferred_skills: JSON.parse(row.preferred_skills as string || '[]'),
      responsibilities: JSON.parse(row.responsibilities as string || '[]'),
      qualifications: JSON.parse(row.qualifications as string || '[]'),
      preferences: JSON.parse(row.preferences as string || '[]'),
      deadline: row.deadline as string | null,
      url: row.url as string,
      raw_text: row.raw_text as string,
      fetched_at: row.fetched_at as string,
    };
  }
}
