import { getDb } from '../connection.js';
import type { Application, ApplicationStatus, StatusHistoryEntry } from '../../types/index.js';
import { generateId } from '../../core/utils.js';

export class ApplicationRepository {
  create(jobId: string, profileId: string, status: ApplicationStatus = 'saved', notes?: string): Application {
    const db = getDb();
    const id = generateId('app');
    const now = new Date().toISOString();
    const history: StatusHistoryEntry[] = [{ status, at: now, notes }];
    const appliedAt = status === 'applied' ? now : null;

    db.prepare(`
      INSERT INTO applications
        (id, job_id, profile_id, status, notes, status_history, applied_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, jobId, profileId, status, notes || null, JSON.stringify(history), appliedAt, now, now);

    return {
      id, job_id: jobId, profile_id: profileId,
      status, notes: notes || null, status_history: history,
      applied_at: appliedAt, created_at: now, updated_at: now,
    };
  }

  updateStatus(id: string, newStatus: ApplicationStatus, notes?: string): Application | null {
    const existing = this.findById(id);
    if (!existing) return null;

    const db = getDb();
    const now = new Date().toISOString();
    const history = [...existing.status_history, { status: newStatus, at: now, notes }];
    const appliedAt = newStatus === 'applied' && !existing.applied_at ? now : existing.applied_at;

    db.prepare(`
      UPDATE applications SET status = ?, notes = ?, status_history = ?, applied_at = ?, updated_at = ?
      WHERE id = ?
    `).run(newStatus, notes || existing.notes, JSON.stringify(history), appliedAt, now, id);

    return { ...existing, status: newStatus, notes: notes || existing.notes, status_history: history, applied_at: appliedAt, updated_at: now };
  }

  findById(id: string): Application | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToApp(row) : null;
  }

  findByProfile(profileId: string, statusFilter?: ApplicationStatus): Application[] {
    const db = getDb();
    let query = 'SELECT * FROM applications WHERE profile_id = ?';
    const values: unknown[] = [profileId];

    if (statusFilter) {
      query += ' AND status = ?';
      values.push(statusFilter);
    }
    query += ' ORDER BY updated_at DESC';

    const rows = db.prepare(query).all(...values) as Record<string, unknown>[];
    return rows.map(row => this.rowToApp(row));
  }

  private rowToApp(row: Record<string, unknown>): Application {
    return {
      id: row.id as string,
      job_id: row.job_id as string,
      profile_id: row.profile_id as string,
      status: row.status as ApplicationStatus,
      notes: row.notes as string | null,
      status_history: JSON.parse(row.status_history as string || '[]'),
      applied_at: row.applied_at as string | null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
