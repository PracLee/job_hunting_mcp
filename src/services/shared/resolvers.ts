import { JobRepository } from '../../db/repositories/job-repository.js';
import { ProfileRepository } from '../../db/repositories/profile-repository.js';
import type { JobPosting, UserProfile } from '../../types/index.js';

export function resolveProfileOrThrow(
  profileRepo: ProfileRepository,
  profileId?: string,
  missingMessage: string = '프로필이 없습니다.',
): UserProfile {
  const profile = profileId
    ? profileRepo.findById(profileId)
    : profileRepo.findAll()[0] || null;

  if (!profile) {
    throw new Error(missingMessage);
  }

  return profile;
}

export function resolveJobOrThrow(
  jobRepo: JobRepository,
  jobId: string,
  missingMessage: string = '공고를 찾을 수 없습니다.',
): JobPosting {
  const job = jobRepo.findById(jobId);
  if (!job) {
    throw new Error(missingMessage);
  }

  return job;
}
