import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  // src/db/connection.ts (compiled to dist/db/connection.js), so navigate 2 directories up
  const defaultPath = path.resolve(__dirname, '../../data/job_hunting.db');
  const dbPath = process.env.DB_PATH || defaultPath;
  
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      phone TEXT,
      total_experience_years REAL DEFAULT 0,
      job_category TEXT,
      skills TEXT DEFAULT '[]',
      projects TEXT DEFAULT '[]',
      domains TEXT DEFAULT '[]',
      education TEXT DEFAULT '[]',
      certifications TEXT DEFAULT '[]',
      raw_resume_text TEXT,
      raw_career_text TEXT,
      raw_portfolio_text TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_postings (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      source_id TEXT,
      company_name TEXT NOT NULL,
      job_title TEXT NOT NULL,
      job_category TEXT,
      experience_min INTEGER,
      experience_max INTEGER,
      employment_type TEXT,
      location TEXT,
      salary_text TEXT,
      required_skills TEXT DEFAULT '[]',
      preferred_skills TEXT DEFAULT '[]',
      responsibilities TEXT DEFAULT '[]',
      qualifications TEXT DEFAULT '[]',
      preferences TEXT DEFAULT '[]',
      deadline TEXT,
      url TEXT,
      raw_text TEXT,
      fetched_at TEXT DEFAULT (datetime('now')),
      UNIQUE(source, source_id)
    );

    CREATE TABLE IF NOT EXISTS match_results (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES job_postings(id),
      profile_id TEXT NOT NULL REFERENCES user_profiles(id),
      overall_score INTEGER,
      skill_match_score INTEGER,
      experience_fit_score INTEGER,
      responsibility_relevance_score INTEGER,
      domain_fit_score INTEGER,
      preference_coverage_score INTEGER,
      strengths TEXT DEFAULT '[]',
      gaps TEXT DEFAULT '[]',
      resume_highlights TEXT DEFAULT '[]',
      priority TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(job_id, profile_id)
    );

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES job_postings(id),
      profile_id TEXT NOT NULL REFERENCES user_profiles(id),
      status TEXT NOT NULL DEFAULT 'saved',
      notes TEXT,
      status_history TEXT DEFAULT '[]',
      applied_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(job_id, profile_id)
    );

    CREATE TABLE IF NOT EXISTS tailored_documents (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL REFERENCES user_profiles(id),
      job_id TEXT NOT NULL REFERENCES job_postings(id),
      document_type TEXT NOT NULL,
      content TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_category ON job_postings(job_category);
    CREATE INDEX IF NOT EXISTS idx_jobs_source ON job_postings(source);
    CREATE INDEX IF NOT EXISTS idx_match_profile ON match_results(profile_id);
    CREATE INDEX IF NOT EXISTS idx_match_score ON match_results(overall_score DESC);
    CREATE INDEX IF NOT EXISTS idx_app_profile_status ON applications(profile_id, status);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
