import type { JobPosting } from '../types/job.js';

export interface JobSearchScore {
  matched: boolean;
  score: number;
}

export function scoreJobSearchMatch(job: JobPosting, keywords: string[]): JobSearchScore {
  const normalizedKeywords = keywords
    .map(keyword => keyword.trim().toLowerCase())
    .filter(Boolean);

  if (normalizedKeywords.length === 0) {
    return { matched: true, score: 0 };
  }

  const haystacks = {
    title: job.job_title.toLowerCase(),
    company: job.company_name.toLowerCase(),
    location: job.location.toLowerCase(),
    required_skills: job.required_skills.join(' ').toLowerCase(),
    preferred_skills: job.preferred_skills.join(' ').toLowerCase(),
    responsibilities: job.responsibilities.join(' ').toLowerCase(),
    qualifications: job.qualifications.join(' ').toLowerCase(),
    preferences: job.preferences.join(' ').toLowerCase(),
    raw_text: job.raw_text.toLowerCase(),
  };

  let score = 0;
  let matchedKeywordCount = 0;

  for (const keyword of normalizedKeywords) {
    let keywordMatched = false;

    if (haystacks.title.includes(keyword)) {
      score += 12;
      keywordMatched = true;
    }
    if (haystacks.required_skills.includes(keyword)) {
      score += 10;
      keywordMatched = true;
    }
    if (haystacks.preferred_skills.includes(keyword)) {
      score += 6;
      keywordMatched = true;
    }
    if (haystacks.company.includes(keyword)) {
      score += 4;
      keywordMatched = true;
    }
    if (haystacks.responsibilities.includes(keyword)) {
      score += 4;
      keywordMatched = true;
    }
    if (haystacks.qualifications.includes(keyword)) {
      score += 4;
      keywordMatched = true;
    }
    if (haystacks.preferences.includes(keyword)) {
      score += 2;
      keywordMatched = true;
    }
    if (haystacks.raw_text.includes(keyword)) {
      score += 2;
      keywordMatched = true;
    }
    if (haystacks.location.includes(keyword)) {
      score += 1;
      keywordMatched = true;
    }

    if (keywordMatched) matchedKeywordCount++;
  }

  if (matchedKeywordCount === 0) {
    return { matched: false, score: 0 };
  }

  return {
    matched: true,
    score: score + matchedKeywordCount * 3,
  };
}
