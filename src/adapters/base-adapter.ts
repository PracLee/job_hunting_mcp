/**
 * 채용 사이트 소스 어댑터 인터페이스
 * 새 채용 사이트를 추가하려면 이 인터페이스를 구현하면 됨
 */

import type { JobPosting, JobSource, JobSearchParams } from '../types/job.js';

export interface SourceSearchResult {
  jobs: JobPosting[];
  warnings?: string[];
}

export interface SourceAdapter {
  /** 소스 식별자 */
  source: JobSource;

  /** 공고 검색 */
  search(params: JobSearchParams): Promise<JobPosting[]>;

  /** 검색 진단 정보 포함 공고 검색 */
  searchWithMeta?(params: JobSearchParams): Promise<SourceSearchResult>;

  /** 특정 공고 상세 조회 (URL 또는 source_id 기반) */
  fetchDetail(sourceIdOrUrl: string): Promise<JobPosting | null>;

  /** 이 어댑터가 사용 가능한지 (API 키 등 조건 확인) */
  isAvailable(): boolean;
}

/** 어댑터 레지스트리 */
const adapters = new Map<JobSource, SourceAdapter>();

export function registerAdapter(adapter: SourceAdapter): void {
  adapters.set(adapter.source, adapter);
}

export function getAdapter(source: JobSource): SourceAdapter | undefined {
  return adapters.get(source);
}

export function getAvailableAdapters(): SourceAdapter[] {
  return Array.from(adapters.values()).filter(a => a.isAvailable());
}

export function getAllAdapters(): Map<JobSource, SourceAdapter> {
  return adapters;
}
