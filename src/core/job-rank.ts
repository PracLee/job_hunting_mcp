import type { JobPosting, JobSource } from '../types/job.js';
import { scoreJobSearchMatch, type JobSearchScore } from './job-search.js';

export interface RankedJob extends JobPosting {
  also_on?: JobSource[];
}

const TITLE_SIMILARITY_THRESHOLD = 0.6;

export function rankAndDedupeJobs(
  jobs: JobPosting[],
  keywords: string[],
  limit: number,
): RankedJob[] {
  const scored = jobs
    .map(job => ({ job, score: scoreJobSearchMatch(job, keywords) }))
    .filter(item => keywords.length === 0 || item.score.matched);

  if (scored.length === 0) return [];

  const clusters = clusterScoredJobs(scored);
  const representatives = clusters.map(pickRepresentative);

  return applySourceQuota(representatives, limit).map(item => item.job);
}

interface ScoredJob {
  job: JobPosting;
  score: JobSearchScore;
}

interface RankedItem {
  job: RankedJob;
  score: JobSearchScore;
}

function clusterScoredJobs(scored: ScoredJob[]): ScoredJob[][] {
  const clusters: Array<{ companyKey: string; tokens: Set<string>; members: ScoredJob[] }> = [];

  for (const item of scored) {
    const companyKey = normalizeCompanyName(item.job.company_name);
    const tokens = tokenizeTitle(item.job.job_title);

    if (!companyKey) {
      clusters.push({ companyKey: `__solo_${clusters.length}__`, tokens, members: [item] });
      continue;
    }

    const match = clusters.find(cluster =>
      cluster.companyKey === companyKey
      && jaccard(cluster.tokens, tokens) >= TITLE_SIMILARITY_THRESHOLD,
    );

    if (match) {
      match.members.push(item);
      for (const token of tokens) match.tokens.add(token);
    } else {
      clusters.push({ companyKey, tokens, members: [item] });
    }
  }

  return clusters.map(cluster => cluster.members);
}

function pickRepresentative(cluster: ScoredJob[]): RankedItem {
  const sorted = [...cluster].sort((left, right) => {
    if (right.score.score !== left.score.score) return right.score.score - left.score.score;
    const rightRich = (right.job.raw_text?.length || 0) + right.job.required_skills.length;
    const leftRich = (left.job.raw_text?.length || 0) + left.job.required_skills.length;
    return rightRich - leftRich;
  });

  const head = sorted[0];
  const otherSources: JobSource[] = [];
  const seen = new Set<JobSource>([head.job.source]);
  for (const member of sorted.slice(1)) {
    if (seen.has(member.job.source)) continue;
    seen.add(member.job.source);
    otherSources.push(member.job.source);
  }

  const job: RankedJob = { ...head.job };
  if (otherSources.length > 0) job.also_on = otherSources;
  return { job, score: head.score };
}

function applySourceQuota(items: RankedItem[], limit: number): RankedItem[] {
  if (items.length <= limit) {
    return [...items].sort(byScoreThenRecency);
  }

  const buckets = new Map<JobSource, RankedItem[]>();
  for (const item of items) {
    const bucket = buckets.get(item.job.source) ?? [];
    bucket.push(item);
    buckets.set(item.job.source, bucket);
  }

  for (const bucket of buckets.values()) {
    bucket.sort(byScoreThenRecency);
  }

  const sources = [...buckets.keys()];
  const baseQuota = Math.max(1, Math.floor(limit / sources.length));

  const taken: RankedItem[] = [];
  for (const source of sources) {
    const bucket = buckets.get(source)!;
    taken.push(...bucket.splice(0, baseQuota));
  }

  const leftovers = sources.flatMap(source => buckets.get(source)!);
  leftovers.sort(byScoreThenRecency);
  while (taken.length < limit && leftovers.length > 0) {
    taken.push(leftovers.shift()!);
  }

  return taken.sort(byScoreThenRecency);
}

function byScoreThenRecency(left: RankedItem, right: RankedItem): number {
  if (right.score.score !== left.score.score) return right.score.score - left.score.score;
  return right.job.fetched_at.localeCompare(left.job.fetched_at);
}

export function normalizeCompanyName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\(\s*주\s*\)|㈜|주식회사/g, ' ')
    .replace(/\b(inc|corp|corporation|ltd|llc|co)\.?\b/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

export function tokenizeTitle(title: string): Set<string> {
  if (!title) return new Set();
  const cleaned = title
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ');

  return new Set(
    cleaned.split(/\s+/).filter(token => token.length >= 2),
  );
}

function jaccard(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 && right.size === 0) return 1;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection++;
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
