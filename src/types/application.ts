export type ApplicationStatus =
  | 'saved'
  | 'reviewing'
  | 'applied'
  | 'document_passed'
  | 'interview_scheduled'
  | 'rejected'
  | 'offered';

export interface StatusHistoryEntry {
  status: ApplicationStatus;
  at: string;
  notes?: string;
}

export interface Application {
  id: string;
  job_id: string;
  profile_id: string;
  status: ApplicationStatus;
  notes: string | null;
  status_history: StatusHistoryEntry[];
  applied_at: string | null;
  created_at: string;
  updated_at: string;
}
