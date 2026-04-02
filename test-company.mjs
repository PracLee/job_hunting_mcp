/**
 * company_analyze 어댑터 빠른 테스트
 * 실행: node test-company.mjs [회사명]
 *
 * 예시:
 *   node test-company.mjs 카카오
 *   node test-company.mjs 삼성전자
 *   node test-company.mjs 토스
 */

import fs from 'fs';
import path from 'path';

// .env 로드
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const DART_BASE = 'https://opendart.fss.or.kr/api';
const NAVER_NEWS_API = 'https://openapi.naver.com/v1/search/news.json';

const DART_KEY = process.env.DART_API_KEY || '';
const NAVER_ID = process.env.NAVER_NEWS_CLIENT_ID || '';
const NAVER_SECRET = process.env.NAVER_NEWS_CLIENT_SECRET || '';

const companyName = process.argv[2] || '카카오';

console.log(`\n${'='.repeat(50)}`);
console.log(`기업 분석 테스트: ${companyName}`);
console.log('='.repeat(50));

// ─── 1. API 키 상태 확인 ───────────────────────────────
console.log('\n[1] API 키 상태');
console.log(`  DART_API_KEY:            ${DART_KEY ? '✅ 설정됨 (' + DART_KEY.slice(0, 6) + '...)' : '❌ 미설정'}`);
console.log(`  NAVER_NEWS_CLIENT_ID:    ${NAVER_ID ? '✅ 설정됨 (' + NAVER_ID.slice(0, 6) + '...)' : '❌ 미설정'}`);
console.log(`  NAVER_NEWS_CLIENT_SECRET:${NAVER_SECRET ? '✅ 설정됨' : '❌ 미설정'}`);

// ─── 2. DART corpCode.xml 다운로드 + 회사 검색 ───────
if (DART_KEY) {
  console.log(`\n[2] DART corpCode.xml 다운로드 및 회사 검색: "${companyName}"`);
  try {
    // corpCode.xml ZIP 다운로드
    console.log('  corpCode.xml 다운로드 중... (최초 실행 시 수 초 소요)');
    const zipRes = await fetch(`${DART_BASE}/corpCode.xml?crtfc_key=${DART_KEY}`);
    if (!zipRes.ok) throw new Error(`HTTP ${zipRes.status}`);

    const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
    console.log(`  ZIP 크기: ${(zipBuffer.length / 1024).toFixed(0)} KB`);

    // ZIP → XML 추출 (Central Directory 방식)
    // DART ZIP은 로컬 헤더에 compressedSize=0이므로 CD에서 실제 크기를 읽어야 함
    const zlib = await import('node:zlib');
    const { promisify } = await import('node:util');
    const inflateRaw = promisify(zlib.inflateRaw);

    // EOCD (End of Central Directory) 찾기
    let eocdOffset = -1;
    for (let i = zipBuffer.length - 22; i >= 0; i--) {
      if (zipBuffer[i] === 0x50 && zipBuffer[i+1] === 0x4B && zipBuffer[i+2] === 0x05 && zipBuffer[i+3] === 0x06) {
        eocdOffset = i; break;
      }
    }
    if (eocdOffset === -1) throw new Error('EOCD 없음');

    const cdOffset             = zipBuffer.readUInt32LE(eocdOffset + 16);
    const cdCompressedSize     = zipBuffer.readUInt32LE(cdOffset + 20);
    const cdLocalHeaderOffset  = zipBuffer.readUInt32LE(cdOffset + 42);
    const compressionMethod    = zipBuffer.readUInt16LE(cdLocalHeaderOffset + 8);
    const localFilenameLen     = zipBuffer.readUInt16LE(cdLocalHeaderOffset + 26);
    const localExtraLen        = zipBuffer.readUInt16LE(cdLocalHeaderOffset + 28);
    const dataStart            = cdLocalHeaderOffset + 30 + localFilenameLen + localExtraLen;
    const compressedData       = zipBuffer.subarray(dataStart, dataStart + cdCompressedSize);

    console.log(`  압축 크기: ${(cdCompressedSize/1024).toFixed(0)} KB, 방식: ${compressionMethod}`);

    let xmlText;
    if (compressionMethod === 0) {
      xmlText = compressedData.toString('utf-8');
    } else if (compressionMethod === 8) {
      xmlText = (await inflateRaw(compressedData)).toString('utf-8');
    } else {
      throw new Error(`지원하지 않는 압축: ${compressionMethod}`);
    }

    console.log(`  XML 크기: ${(xmlText.length / 1024).toFixed(0)} KB`);

    // XML 파싱
    const entries = [];
    const listRegex = /<list>([\s\S]*?)<\/list>/g;
    let m;
    while ((m = listRegex.exec(xmlText)) !== null) {
      const block = m[1];
      const get = tag => { const r = block.match(new RegExp(`<${tag}>([^<]*)<\/${tag}>`)); return r ? r[1].trim() : ''; };
      entries.push({ corp_code: get('corp_code'), corp_name: get('corp_name'), stock_code: get('stock_code') });
    }
    console.log(`  전체 기업 수: ${entries.length.toLocaleString()}개`);

    // 이름 검색 (상장사 우선)
    const exactMatches = entries.filter(e => e.corp_name === companyName);
    console.log(`  완전 일치: ${exactMatches.length}개 → ${exactMatches.map(e => `${e.corp_name}(${e.stock_code || '비상장'})`).join(', ')}`);
    let found = exactMatches.find(e => e.stock_code && e.stock_code.trim() !== '') ?? exactMatches[0];
    if (!found) {
      const candidates = entries
        .filter(e => e.corp_name.includes(companyName) || companyName.includes(e.corp_name))
        .sort((a, b) => {
          const aL = a.stock_code ? 0 : 1, bL = b.stock_code ? 0 : 1;
          if (aL !== bL) return aL - bL;
          return Math.abs(a.corp_name.length - companyName.length) - Math.abs(b.corp_name.length - companyName.length);
        });
      found = candidates[0];
      if (candidates.length > 1) console.log(`  포함 후보: ${candidates.slice(0, 5).map(e => `${e.corp_name}(${e.stock_code || '비상장'})`).join(', ')}`);
    }

    if (!found) {
      console.log(`  ❌ "${companyName}" 검색 결과 없음`);
    } else {
      console.log(`  ✅ 발견: ${found.corp_name} (corp_code: ${found.corp_code}, stock: ${found.stock_code || '비상장'})`);

      // ─── 3. 재무제표 조회 ────────────────────────────
      const today = new Date();
      console.log(`\n[3] 재무제표 조회 (사업보고서, ${today.getFullYear() - 1}년도)`);

      for (const fs_div of ['CFS', 'OFS']) {
        const fsUrl = new URL(`${DART_BASE}/fnlttSinglAcntAll.json`);
        fsUrl.searchParams.set('crtfc_key', DART_KEY);
        fsUrl.searchParams.set('corp_code', found.corp_code);
        fsUrl.searchParams.set('bsns_year', String(today.getFullYear() - 1));
        fsUrl.searchParams.set('reprt_code', '11011');
        fsUrl.searchParams.set('fs_div', fs_div);

        const fsRes = await fetch(fsUrl.toString());
        const fsData = await fsRes.json();

        if (fsData.status === '000' && fsData.list?.length) {
          printFinancials(fsData.list, fs_div === 'CFS' ? '연결재무' : '별도재무');
          break;
        } else {
          console.log(`  ${fs_div} 없음 (status: ${fsData.status})`);
        }
      }
    }
  } catch (e) {
    console.log(`  ❌ 오류: ${e.message}`);
  }
} else {
  console.log('\n[2] DART 건너뜀 (API 키 없음)');
}

// ─── 4. 네이버 뉴스 검색 ─────────────────────────────
if (NAVER_ID && NAVER_SECRET) {
  console.log(`\n[4] 네이버 뉴스 검색: "${companyName}"`);
  try {
    const url = new URL(NAVER_NEWS_API);
    url.searchParams.set('query', companyName);
    url.searchParams.set('sort', 'sim');
    url.searchParams.set('display', '10');

    console.log(`  요청 URL: ${url.toString()}`);
    const res = await fetch(url.toString(), {
      headers: {
        'X-Naver-Client-Id': NAVER_ID,
        'X-Naver-Client-Secret': NAVER_SECRET,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      console.log(`  ❌ HTTP ${res.status} — API 키를 확인하세요.`);
      console.log(`  응답: ${body.slice(0, 200)}`);
    } else {
      const raw = await res.text();
      let data;
      try { data = JSON.parse(raw); } catch { data = {}; }
      const items = data.items || [];
      console.log(`  total: ${data.total ?? '?'}, display: ${data.display ?? '?'}`);
      if (!items.length) {
        console.log('  ⚠️  결과 없음 — raw 응답:');
        console.log('  ', raw.slice(0, 300));
      } else {
        // 제목/설명에 회사명 포함된 기사만 필터
        const qLower = companyName.toLowerCase();
        const relevant = items.filter(i => {
          const t = i.title.replace(/<[^>]+>/g, '').toLowerCase();
          const d = i.description.replace(/<[^>]+>/g, '').toLowerCase();
          return t.includes(qLower) || d.includes(qLower);
        });
        console.log(`  ✅ ${items.length}건 수신, 관련 기사: ${relevant.length}건`);
        for (const item of (relevant.length >= 3 ? relevant : items).slice(0, 5)) {
          const title = item.title.replace(/<[^>]+>/g, '').slice(0, 70);
          const date = new Date(item.pubDate).toISOString().slice(0, 10);
          const mark = title.toLowerCase().includes(qLower) ? '✅' : '⚠️ ';
          console.log(`    ${mark} [${date}] ${title}`);
        }
      }
    }
  } catch (e) {
    console.log(`  ❌ 오류: ${e.message}`);
  }
} else {
  console.log('\n[4] 네이버 뉴스 건너뜀 (API 키 없음)');
}

console.log('\n' + '='.repeat(50));
console.log('테스트 완료');
console.log('='.repeat(50) + '\n');

// ─── 재무 데이터 출력 헬퍼 ───────────────────────────
function printFinancials(list, label) {
  const targets = ['매출액', '영업이익', '당기순이익', '부채총계', '자본총계'];
  const found = list.filter(item =>
    targets.some(t => item.account_nm.replace(/\s/g, '').includes(t))
  );

  if (!found.length) {
    console.log(`  ⚠️  ${label}: 핵심 계정 데이터 없음 (전체 ${list.length}개 계정 존재)`);
    console.log('  → 계정명 샘플:', list.slice(0, 5).map(i => i.account_nm).join(', '));
    return;
  }

  console.log(`  ✅ ${label} (${list.length}개 계정 중 핵심 ${found.length}개)`);
  for (const item of found) {
    const cur = formatAmt(item.thstrm_amount);
    const prv = formatAmt(item.frmtrm_amount);
    const prv2 = formatAmt(item.bfefrmtrm_amount);
    console.log(`    ${item.account_nm.padEnd(12)} | 당기: ${cur.padStart(10)} | 전기: ${prv.padStart(10)} | 전전기: ${prv2.padStart(10)}`);
  }
}

function formatAmt(raw) {
  if (!raw) return '-';
  const n = parseInt(raw.replace(/,/g, ''), 10);
  if (isNaN(n)) return '-';
  const eok = Math.round(n / 1e8);
  return `${eok.toLocaleString()}억`;
}
