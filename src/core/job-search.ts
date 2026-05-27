import type { JobPosting } from '../types/job.js';
import { resolveRole, roleSimilarity } from './role-ontology.js';

export interface JobSearchScore {
  matched: boolean;
  score: number;
}

/** 의미 매칭이 기여할 수 있는 최대 점수 (substring title 매칭이 12점인 것과 비교해 약간 낮게) */
const SEMANTIC_ROLE_MAX_SCORE = 10;
/**
 * 이 점수 이상이 나와야 "매칭됨"으로 인정.
 * 같은 부모만 공유하는 0.5(=5점)는 점수에는 기여하지만 결과 노출 자격은 못 갖는다.
 * similarTo로 명시 큐레이션된 0.6 이상의 관계만 매칭 인정.
 */
const SEMANTIC_MATCH_FLOOR = 6;

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

  // 공고 title의 role을 한 번만 인식 (모든 키워드 비교에 재사용)
  const jobRole = resolveRole(job.job_title);

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

    // 의미적 직무 매칭 — substring으로 못 잡은 경우의 보강
    if (!haystacks.title.includes(keyword) && jobRole) {
      const semantic = roleSimilarityForKeyword(keyword, jobRole);
      if (semantic > 0) {
        const semanticScore = Math.round(semantic * SEMANTIC_ROLE_MAX_SCORE);
        score += semanticScore;
        if (semanticScore >= SEMANTIC_MATCH_FLOOR) {
          keywordMatched = true;
        }
      }
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

function roleSimilarityForKeyword(keyword: string, jobRoleId: string): number {
  const keywordRole = resolveRole(keyword);
  if (!keywordRole) return 0;
  if (keywordRole === jobRoleId) return 0; // substring으로 이미 잡혔어야 함 — 중복 가산 방지
  // roleSimilarity는 텍스트 두 개를 받지만 여기선 이미 jobRoleId를 알고 있으니 직접 비교가 더 정확
  return roleSimilarity(keyword, jobRoleId);
}
