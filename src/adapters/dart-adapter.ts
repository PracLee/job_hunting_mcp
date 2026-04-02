/**
 * DART(금융감독원 전자공시시스템) 어댑터
 *
 * 기업 재무정보를 조회합니다.
 * API 키 발급: https://opendart.fss.or.kr/ > OpenAPI 신청
 *
 * 환경변수: DART_API_KEY
 *
 * [회사 검색 방식]
 * DART 공식 권장 방법: corpCode.xml(ZIP) 다운로드 → 로컬 캐시 후 이름 검색
 * list.json의 corp_name 파라미터는 문서 내용까지 검색하여 엉뚱한 회사가 반환될 수 있음
 */

import zlib from 'node:zlib';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { lookupBrandMap } from '../core/brand-map.js';

const inflateRaw = promisify(zlib.inflateRaw);

const DART_BASE = 'https://opendart.fss.or.kr/api';
// corpCode.xml 캐시: 7일마다 갱신
const CORP_CODE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface DartCompanyInfo {
  corp_code: string;
  corp_name: string;
  corp_name_eng: string;
  stock_code: string;
  corp_cls: string;    // Y=유가증권, K=코스닥, N=코넥스, E=기타(비상장)
  ceo_nm: string;
  adres: string;
  hm_url: string;
  est_dt: string;      // 설립일 YYYYMMDD
  acc_mt: string;      // 결산월
  induty_code: string; // 업종 코드
}

export interface DartFinancialItem {
  account_nm: string;       // 계정명 (예: 매출액, 영업이익)
  account_id: string;       // IFRS 계정 ID
  sj_div: string;           // 재무제표 구분 (IS=손익, BS=재무상태)
  sj_nm: string;            // 재무제표명
  thstrm_amount: string;    // 당기 금액 (bsns_year 기준)
  frmtrm_amount: string;    // 전기 금액
  bfefrmtrm_amount: string; // 전전기 금액
  currency: string;
}

export interface DartYearlyFinancials {
  year: number;
  revenue: number | null;           // 매출액
  operating_income: number | null;  // 영업이익
  net_income: number | null;        // 당기순이익
  total_assets: number | null;      // 자산총계
  total_liabilities: number | null; // 부채총계
  total_equity: number | null;      // 자본총계
  debt_ratio: number | null;        // 부채비율 (부채/자본 * 100)
}

/** 검색 경로 및 신뢰도 */
export type SearchMethod = 'exact' | 'brand_map' | 'llm_fallback' | 'partial' | 'news_only';
export type SearchConfidence = 'high' | 'medium' | 'low' | 'none';

export interface SearchPath {
  input: string;              // 사용자 입력 원문
  brand_map_hit?: string;     // 브랜드 맵에서 찾은 경우 (예: "배민 → 우아한형제들")
  llm_suggested?: string;     // LLM이 추론한 법인명 (fallback인 경우)
  dart_query: string;         // 실제 DART 검색에 사용한 법인명
  dart_matched?: string;      // DART에서 매칭된 법인명
  stock_code?: string;        // 상장 코드 (비상장이면 빈 문자열)
  listing_type?: string;      // 시장 구분
  homepage?: string;          // 홈페이지 (교차 검증용)
  industry_code?: string;     // 업종 코드
  established?: string;       // 설립일
  method: SearchMethod;       // 검색에 성공한 방법
  confidence: SearchConfidence;
}

interface CorpCodeEntry {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  modify_date: string;
}

// 메모리 캐시 (프로세스 수명 동안 유지)
let corpCodeCache: CorpCodeEntry[] | null = null;
let corpCodeCacheTime = 0;

// DART 재무데이터에서 특정 계정 금액 추출 (중복 계정 중 첫 번째로 유효한 값)
function extractAmount(items: DartFinancialItem[], keywords: string[], period: 'current' | 'prev' | 'prev2'): number | null {
  const field = period === 'current' ? 'thstrm_amount'
    : period === 'prev' ? 'frmtrm_amount'
    : 'bfefrmtrm_amount';

  for (const item of items) {
    const nm = item.account_nm.replace(/\s/g, '');
    if (keywords.some(k => nm === k)) { // 완전 일치 우선
      const raw = (item as unknown as Record<string, string>)[field]?.replace(/,/g, '') ?? '';
      const num = parseInt(raw, 10);
      if (!isNaN(num)) return num;
    }
  }
  // 완전 일치 없으면 포함 검색
  for (const item of items) {
    const nm = item.account_nm.replace(/\s/g, '');
    if (keywords.some(k => nm.includes(k))) {
      const raw = (item as unknown as Record<string, string>)[field]?.replace(/,/g, '') ?? '';
      const num = parseInt(raw, 10);
      if (!isNaN(num)) return num;
    }
  }
  return null;
}

export class DartAdapter {
  private get apiKey(): string {
    return process.env.DART_API_KEY || '';
  }

  isAvailable(): boolean {
    return this.apiKey.length > 0;
  }

  /**
   * corpCode.xml(ZIP)을 다운로드·파싱해 전체 기업 코드 목록을 반환합니다.
   * 결과는 메모리와 디스크에 7일간 캐시합니다.
   */
  private async getCorpCodeList(): Promise<CorpCodeEntry[]> {
    const now = Date.now();

    // 메모리 캐시 유효
    if (corpCodeCache && now - corpCodeCacheTime < CORP_CODE_CACHE_TTL_MS) {
      return corpCodeCache;
    }

    // 디스크 캐시 확인
    const cacheFile = this.getCacheFilePath();
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      if (now - stat.mtimeMs < CORP_CODE_CACHE_TTL_MS) {
        try {
          const raw = fs.readFileSync(cacheFile, 'utf-8');
          corpCodeCache = JSON.parse(raw) as CorpCodeEntry[];
          corpCodeCacheTime = stat.mtimeMs;
          return corpCodeCache;
        } catch { /* 손상된 캐시 무시, 재다운로드 */ }
      }
    }

    // DART에서 corpCode.xml ZIP 다운로드
    const url = `${DART_BASE}/corpCode.xml?crtfc_key=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`DART corpCode 다운로드 실패: ${res.status}`);

    const zipBuffer = Buffer.from(await res.arrayBuffer());
    const xmlText = await this.extractZipFirstFile(zipBuffer);
    const entries = this.parseCorpCodeXml(xmlText);

    // 캐시 저장
    corpCodeCache = entries;
    corpCodeCacheTime = now;
    try {
      const dir = path.dirname(cacheFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(entries));
    } catch { /* 디스크 캐시 실패는 무시 */ }

    return entries;
  }

  private getCacheFilePath(): string {
    const dbPath = process.env.DB_PATH || './data/job_hunting.db';
    const dataDir = path.dirname(path.resolve(dbPath));
    return path.join(dataDir, 'dart_corp_codes.json');
  }

  /**
   * ZIP 바이너리에서 첫 번째 파일을 추출합니다.
   * DEFLATE(method=8) 및 Stored(method=0) 지원.
   *
   * DART corpCode.xml ZIP은 로컬 헤더에 compressedSize=0 (data descriptor 방식)이므로
   * Central Directory에서 실제 크기를 읽어야 합니다.
   */
  private async extractZipFirstFile(buffer: Buffer): Promise<string> {
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4B || buffer[2] !== 0x03 || buffer[3] !== 0x04) {
      throw new Error('유효하지 않은 ZIP 파일');
    }

    // 1. EOCD (End of Central Directory) 찾기 — 파일 끝에서 역방향 검색
    //    signature: PK\x05\x06 (0x06054b50)
    let eocdOffset = -1;
    for (let i = buffer.length - 22; i >= 0; i--) {
      if (buffer[i] === 0x50 && buffer[i+1] === 0x4B && buffer[i+2] === 0x05 && buffer[i+3] === 0x06) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset === -1) throw new Error('EOCD를 찾을 수 없습니다');

    // 2. Central Directory 첫 번째 항목에서 실제 compressedSize 읽기
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
    // CD entry signature: PK\x01\x02 (0x02014b50)
    const cdCompressedSize    = buffer.readUInt32LE(cdOffset + 20);
    const cdLocalHeaderOffset = buffer.readUInt32LE(cdOffset + 42);

    // 3. 로컬 헤더에서 데이터 시작 위치 계산
    const compressionMethod = buffer.readUInt16LE(cdLocalHeaderOffset + 8);
    const localFilenameLen  = buffer.readUInt16LE(cdLocalHeaderOffset + 26);
    const localExtraLen     = buffer.readUInt16LE(cdLocalHeaderOffset + 28);
    const dataStart         = cdLocalHeaderOffset + 30 + localFilenameLen + localExtraLen;
    const compressedData    = buffer.subarray(dataStart, dataStart + cdCompressedSize);

    let decompressed: Buffer;
    if (compressionMethod === 0) {
      decompressed = compressedData; // Stored
    } else if (compressionMethod === 8) {
      decompressed = await inflateRaw(compressedData) as Buffer;
    } else {
      throw new Error(`지원하지 않는 압축 방식: ${compressionMethod}`);
    }

    return decompressed.toString('utf-8');
  }

  /** corpCode.xml 파싱 */
  private parseCorpCodeXml(xml: string): CorpCodeEntry[] {
    const entries: CorpCodeEntry[] = [];
    // <list>...</list> 블록 반복 추출
    const listRegex = /<list>([\s\S]*?)<\/list>/g;
    let match: RegExpExecArray | null;
    while ((match = listRegex.exec(xml)) !== null) {
      const block = match[1];
      const get = (tag: string) => {
        const m = block.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`));
        return m ? m[1].trim() : '';
      };
      entries.push({
        corp_code: get('corp_code'),
        corp_name: get('corp_name'),
        stock_code: get('stock_code'),
        modify_date: get('modify_date'),
      });
    }
    return entries;
  }

  /**
   * 회사명으로 corp_code를 찾습니다.
   * corpCode.xml 캐시를 사용하므로 정확하게 검색됩니다.
   */
  async searchCompany(name: string): Promise<{ corp_code: string; corp_name: string; stock_code: string; corp_cls: string } | null> {
    try {
      const list = await this.getCorpCodeList();

      // 1순위: 완전 일치 (상장사 우선)
      const exactMatches = list.filter(e => e.corp_name === name);
      let found = exactMatches.find(e => e.stock_code && e.stock_code.trim() !== '') // 상장사 우선
        ?? exactMatches[0]; // 없으면 첫 번째

      // 2순위: 포함 검색 (짧은 이름 우선, 상장사 우선)
      if (!found) {
        const candidates = list
          .filter(e => e.corp_name.includes(name) || name.includes(e.corp_name))
          .sort((a, b) => {
            // 상장사 우선
            const aListed = a.stock_code && a.stock_code.trim() !== '' ? 0 : 1;
            const bListed = b.stock_code && b.stock_code.trim() !== '' ? 0 : 1;
            if (aListed !== bListed) return aListed - bListed;
            // 그 다음 이름 길이 유사도
            return Math.abs(a.corp_name.length - name.length) - Math.abs(b.corp_name.length - name.length);
          });
        found = candidates[0];
      }

      if (!found) return null;

      return {
        corp_code: found.corp_code,
        corp_name: found.corp_name,
        stock_code: found.stock_code,
        corp_cls: '', // corpCode.xml에는 corp_cls 없음, company.json에서 채움
      };
    } catch (e) {
      console.error('DART 회사 검색 실패:', e);
      return null;
    }
  }

  /**
   * 브랜드맵 → DART 검색 → LLM 추론 순으로 시도하며
   * SearchPath(검색 경로)와 confidence(신뢰도)를 함께 반환합니다.
   *
   * @param llmSuggest LLM에게 법인명 추론을 요청하는 함수 (없으면 LLM 단계 건너뜀)
   */
  async searchWithPath(
    input: string,
    llmSuggest?: (brandName: string) => Promise<string | null>,
  ): Promise<{
    corp: { corp_code: string; corp_name: string; stock_code: string } | null;
    searchPath: SearchPath;
  }> {
    const base: Omit<SearchPath, 'method' | 'confidence' | 'dart_query'> = { input };

    // ── Step 1: 브랜드 맵 조회 ───────────────────────────
    const mapHit = lookupBrandMap(input);
    const dartQuery = mapHit ? mapHit.corp_name : input;
    if (mapHit) {
      base.brand_map_hit = `${mapHit.brand_name} → ${mapHit.corp_name}`;
    }

    // ── Step 2: DART 검색 (브랜드맵 결과 또는 원본 입력) ─
    let corp = await this.searchCompany(dartQuery);

    if (corp) {
      const isExact = corp.corp_name === dartQuery;
      const isListed = !!(corp.stock_code && corp.stock_code.trim());
      const method: SearchMethod = mapHit
        ? 'brand_map'
        : isExact ? 'exact' : 'partial';
      const confidence: SearchConfidence =
        isListed ? 'high'
        : isExact ? 'high'
        : mapHit  ? 'medium'
        : 'medium';

      return {
        corp,
        searchPath: {
          ...base,
          dart_query: dartQuery,
          dart_matched: corp.corp_name,
          stock_code: corp.stock_code || '',
          method,
          confidence,
        },
      };
    }

    // ── Step 3: LLM 추론 fallback ────────────────────────
    if (llmSuggest) {
      let suggested: string | null = null;
      try { suggested = await llmSuggest(input); } catch { /* 무시 */ }

      if (suggested && suggested !== input && suggested !== dartQuery) {
        corp = await this.searchCompany(suggested);
        if (corp) {
          return {
            corp,
            searchPath: {
              ...base,
              llm_suggested: suggested,
              dart_query: suggested,
              dart_matched: corp.corp_name,
              stock_code: corp.stock_code || '',
              method: 'llm_fallback',
              confidence: 'low',
            },
          };
        }
      }
    }

    // ── Step 4: 완전 실패 → 뉴스만 ──────────────────────
    return {
      corp: null,
      searchPath: {
        ...base,
        dart_query: dartQuery,
        method: 'news_only',
        confidence: 'none',
      },
    };
  }

  /** corp_code로 회사 기본 정보를 조회합니다. */
  async getCompanyInfo(corp_code: string): Promise<DartCompanyInfo | null> {
    try {
      const url = new URL(`${DART_BASE}/company.json`);
      url.searchParams.set('crtfc_key', this.apiKey);
      url.searchParams.set('corp_code', corp_code);

      const res = await fetch(url.toString());
      if (!res.ok) return null;

      const data = await res.json() as DartCompanyInfo & { status: string };
      if (data.status !== '000') return null;

      return data;
    } catch {
      return null;
    }
  }

  /**
   * 연도별 재무제표를 조회합니다.
   * DART는 한 번 조회 시 당기/전기/전전기 3개 연도 데이터를 반환합니다.
   */
  async getFinancials(corp_code: string, bsns_year: number): Promise<DartFinancialItem[]> {
    try {
      // 연결재무제표(CFS) 우선, 없으면 별도(OFS)
      for (const fs_div of ['CFS', 'OFS'] as const) {
        const url = new URL(`${DART_BASE}/fnlttSinglAcntAll.json`);
        url.searchParams.set('crtfc_key', this.apiKey);
        url.searchParams.set('corp_code', corp_code);
        url.searchParams.set('bsns_year', bsns_year.toString());
        url.searchParams.set('reprt_code', '11011'); // 사업보고서
        url.searchParams.set('fs_div', fs_div);

        const res = await fetch(url.toString());
        if (!res.ok) continue;

        const data = await res.json() as { status: string; list?: DartFinancialItem[] };
        if (data.status === '000' && data.list?.length) {
          return data.list;
        }
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * 최근 N년간 재무 요약을 반환합니다.
   * DART API는 1회 조회에 당기/전기/전전기 3개 연도를 반환하므로 1번만 호출합니다.
   */
  async getYearlyFinancials(corp_code: string, years: number = 3): Promise<DartYearlyFinancials[]> {
    const currentYear = new Date().getFullYear();
    // 사업보고서는 전년도 기준 (당해 3~4월 공시)
    const targetYear = currentYear - 1;

    const items = await this.getFinancials(corp_code, targetYear);
    if (!items.length) return [];

    const periods: Array<{ year: number; period: 'current' | 'prev' | 'prev2' }> = [
      { year: targetYear,     period: 'current' },
      { year: targetYear - 1, period: 'prev'    },
      { year: targetYear - 2, period: 'prev2'   },
    ];

    const results: DartYearlyFinancials[] = [];
    for (const { year, period } of periods.slice(0, years)) {
      const revenue          = extractAmount(items, ['매출액', '수익(매출액)', '영업수익'], period);
      const operating_income = extractAmount(items, ['영업이익', '영업손익'], period);
      const net_income       = extractAmount(items, ['당기순이익', '당기순이익(손실)'], period);
      const total_liabilities = extractAmount(items, ['부채총계'], period);
      const total_equity     = extractAmount(items, ['자본총계'], period);
      const total_assets     = extractAmount(items, ['자산총계'], period);

      const debt_ratio =
        total_liabilities !== null && total_equity !== null && total_equity !== 0
          ? Math.round((total_liabilities / total_equity) * 100)
          : null;

      results.push({ year, revenue, operating_income, net_income, total_assets, total_liabilities, total_equity, debt_ratio });
    }

    return results.sort((a, b) => a.year - b.year);
  }
}

/** 원 단위 금액을 읽기 쉬운 형식으로 변환 */
export function formatKRW(amount: number | null): string {
  if (amount === null) return '정보 없음';
  const eok = Math.round(amount / 1e8);
  if (Math.abs(eok) >= 10000) return `${(eok / 10000).toFixed(1)}조원`;
  return `${eok.toLocaleString()}억원`;
}

/** YoY 성장률 계산 */
export function calcGrowthRate(current: number | null, prev: number | null): number | null {
  if (current === null || prev === null || prev === 0) return null;
  return Math.round(((current - prev) / Math.abs(prev)) * 1000) / 10;
}
