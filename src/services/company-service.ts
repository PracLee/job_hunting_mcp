import { DartAdapter, formatKRW, calcGrowthRate, type SearchPath } from '../adapters/dart-adapter.js';
import { NaverNewsAdapter } from '../adapters/naver-news-adapter.js';
import { getLlmClient } from '../core/llm-client.js';

interface FinancialSummary {
  years: number[];
  revenue: Array<{ year: number; amount: number | null; formatted: string }>;
  operating_income: Array<{ year: number; amount: number | null; formatted: string }>;
  net_income: Array<{ year: number; amount: number | null; formatted: string }>;
  debt_ratio: Array<{ year: number; ratio: number | null; formatted: string }>;
  trends: {
    revenue_growth_rates: Array<{ year: number; rate: number | null }>;
    op_income_trend: 'improving' | 'deteriorating' | 'stable' | 'unknown';
    debt_trend: 'decreasing' | 'increasing' | 'stable' | 'unknown';
  };
}

interface AssessmentResult {
  verdict: 'GROWING' | 'STABLE' | 'DECLINING' | 'UNKNOWN';
  confidence: 'high' | 'medium' | 'low';
  positive_signals: string[];
  negative_signals: string[];
  neutral_signals: string[];
  summary: string;
  risk_factors: string[];
  investment_outlook: string;
}

export class CompanyService {
  private readonly dart = new DartAdapter();
  private readonly naverNews = new NaverNewsAdapter();

  async analyzeCompany(params: {
    company_name: string;
    include_news?: boolean;
    news_days?: number;
  }) {
    const dartAvailable = this.dart.isAvailable();
    const newsAvailable = this.naverNews.isAvailable() && (params.include_news ?? true);

    const missingKeys: string[] = [];
    if (!dartAvailable) missingKeys.push('DART_API_KEY');
    if ((params.include_news ?? true) && !this.naverNews.isAvailable()) {
      missingKeys.push('NAVER_NEWS_CLIENT_ID', 'NAVER_NEWS_CLIENT_SECRET');
    }

    if (!dartAvailable && !newsAvailable) {
      throw new Error(JSON.stringify({
        error: 'API 키 설정 필요',
        message: '기업 분석을 위해 아래 환경변수를 .env 파일에 설정하세요.',
        missing_keys: missingKeys,
        setup_guide: {
          DART_API_KEY: {
            purpose: '금융감독원 전자공시(DART) API — 기업 재무제표 조회',
            발급: 'https://opendart.fss.or.kr/ 회원가입 후 OpenAPI 신청 (무료)',
          },
          NAVER_NEWS_CLIENT_ID: {
            purpose: '네이버 검색 API — 기업 관련 뉴스/보도 조회',
            발급: 'https://developers.naver.com/apps/ 에서 애플리케이션 등록 (무료)',
          },
          NAVER_NEWS_CLIENT_SECRET: {
            purpose: 'NAVER_NEWS_CLIENT_ID와 함께 사용하는 시크릿 키',
            발급: '위 Client ID 발급 시 함께 발급됨',
          },
        },
      }, null, 2));
    }

    const warnings: string[] = [];
    if (missingKeys.length > 0) {
      warnings.push(`⚠️ 일부 API 키 미설정으로 분석이 제한됩니다: ${missingKeys.join(', ')} — .env 파일을 확인하세요.`);
    }

    let dartData: {
      corp_info: { corp_code: string; corp_name: string; stock_code: string; corp_cls: string } | null;
      financials: Awaited<ReturnType<DartAdapter['getYearlyFinancials']>>;
      detail: Awaited<ReturnType<DartAdapter['getCompanyInfo']>>;
    } = { corp_info: null, financials: [], detail: null };

    let searchPath: SearchPath | null = null;

    if (dartAvailable) {
      const llmSuggest = async (brandName: string): Promise<string | null> => {
        try {
          const llm = getLlmClient();
          const res = await llm.generate({
            system: '한국 기업 법인명 전문가. JSON만 출력.',
            messages: [{
              role: 'user',
              content: `"${brandName}"의 한국 DART 등록 법인명을 알려줘. 모르면 null.\n형식: {"corp_name": "법인명 또는 null"}`,
            }],
            max_tokens: 100,
            temperature: 0,
          });
          const match = res.content.match(/\{[\s\S]*?\}/);
          if (!match) return null;
          const parsed = JSON.parse(match[0]) as { corp_name: string | null };
          return parsed.corp_name ?? null;
        } catch {
          return null;
        }
      };

      const { corp, searchPath: sp } = await this.dart.searchWithPath(params.company_name, llmSuggest);
      searchPath = sp;

      if (corp) {
        const corpWithCls = { ...corp, corp_cls: '' };
        const [financials, detail] = await Promise.all([
          this.dart.getYearlyFinancials(corp.corp_code, 3),
          this.dart.getCompanyInfo(corp.corp_code),
        ]);
        dartData = { corp_info: { ...corpWithCls, corp_cls: detail?.corp_cls ?? '' }, financials, detail };

        if (detail && searchPath) {
          searchPath.homepage = detail.hm_url || undefined;
          searchPath.industry_code = detail.induty_code || undefined;
          searchPath.established = detail.est_dt ? `${detail.est_dt.slice(0, 4)}년 ${detail.est_dt.slice(4, 6)}월` : undefined;
          if (detail.corp_cls === 'Y' || detail.corp_cls === 'K') {
            searchPath.listing_type = classifyCorp(detail.corp_cls);
            searchPath.confidence = 'high';
          }
        }
      } else {
        warnings.push(
          `DART에서 "${params.company_name}" 기업을 찾을 수 없습니다. 법인명이 다르거나 DART 미공시 기업일 수 있습니다.`,
        );
      }
    }

    let newsItems: Awaited<ReturnType<NaverNewsAdapter['search']>> = [];
    if (newsAvailable) {
      newsItems = await this.naverNews.search(params.company_name, 30, 'sim');
    }

    const newsDays = params.news_days ?? 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - newsDays);
    const recentNews = newsItems.filter(item => {
      try {
        return new Date(item.pubDate) >= cutoffDate;
      } catch {
        return true;
      }
    });

    const financialSummary = buildFinancialSummary(dartData.financials);

    let assessment: AssessmentResult = {
      verdict: 'UNKNOWN',
      confidence: 'low',
      positive_signals: [],
      negative_signals: [],
      neutral_signals: [],
      summary: '분석 데이터 부족으로 평가할 수 없습니다.',
      risk_factors: [],
      investment_outlook: '',
    };

    const hasData = dartData.financials.length > 0 || recentNews.length > 0;
    if (hasData) {
      try {
        const llm = getLlmClient();
        assessment = await analyzeWithLlm(llm, params.company_name, financialSummary, recentNews);
      } catch (error) {
        warnings.push(`LLM 분석 실패: ${error instanceof Error ? error.message : String(error)}`);
        assessment = ruleBasedAssessment(financialSummary);
      }
    }

    return {
      company_name: dartData.corp_info?.corp_name ?? params.company_name,
      search_path: searchPath ?? {
        input: params.company_name,
        dart_query: params.company_name,
        method: 'news_only',
        confidence: 'none',
      },
      dart_info: dartData.corp_info ? {
        corp_code: dartData.corp_info.corp_code,
        stock_code: dartData.corp_info.stock_code || '비상장',
        listing_type: classifyCorp(dartData.detail?.corp_cls ?? ''),
        ceo: dartData.detail?.ceo_nm ?? '정보 없음',
        established: dartData.detail?.est_dt
          ? `${dartData.detail.est_dt.slice(0, 4)}년 ${dartData.detail.est_dt.slice(4, 6)}월`
          : '정보 없음',
        homepage: dartData.detail?.hm_url ?? '',
        address: dartData.detail?.adres ?? '',
      } : null,
      financial_summary: financialSummary,
      news_summary: {
        total_articles: recentNews.length,
        period: `최근 ${newsDays}일`,
        recent_headlines: recentNews.slice(0, 10).map(news => ({
          title: news.title,
          date: formatPubDate(news.pubDate),
          url: news.link,
        })),
      },
      assessment,
      data_sources: {
        dart: dartAvailable && dartData.corp_info !== null,
        naver_news: newsAvailable,
      },
      warnings,
      analyzed_at: new Date().toISOString(),
    };
  }
}

function buildFinancialSummary(financials: Awaited<ReturnType<DartAdapter['getYearlyFinancials']>>): FinancialSummary {
  const years = financials.map(financial => financial.year);

  const revenueGrowthRates = financials.map((financial, index) => {
    if (index === 0) return { year: financial.year, rate: null };
    return { year: financial.year, rate: calcGrowthRate(financial.revenue, financials[index - 1].revenue) };
  });

  let opTrend: FinancialSummary['trends']['op_income_trend'] = 'unknown';
  if (financials.length >= 2) {
    const first = financials[0].operating_income;
    const last = financials[financials.length - 1].operating_income;
    if (first !== null && last !== null) {
      const diff = last - first;
      if (diff > 0) opTrend = 'improving';
      else if (diff < 0) opTrend = 'deteriorating';
      else opTrend = 'stable';
    }
  }

  let debtTrend: FinancialSummary['trends']['debt_trend'] = 'unknown';
  if (financials.length >= 2) {
    const first = financials[0].debt_ratio;
    const last = financials[financials.length - 1].debt_ratio;
    if (first !== null && last !== null) {
      const diff = last - first;
      if (diff < -10) debtTrend = 'decreasing';
      else if (diff > 10) debtTrend = 'increasing';
      else debtTrend = 'stable';
    }
  }

  return {
    years,
    revenue: financials.map(financial => ({
      year: financial.year,
      amount: financial.revenue,
      formatted: formatKRW(financial.revenue),
    })),
    operating_income: financials.map(financial => ({
      year: financial.year,
      amount: financial.operating_income,
      formatted: formatKRW(financial.operating_income),
    })),
    net_income: financials.map(financial => ({
      year: financial.year,
      amount: financial.net_income,
      formatted: formatKRW(financial.net_income),
    })),
    debt_ratio: financials.map(financial => ({
      year: financial.year,
      ratio: financial.debt_ratio,
      formatted: financial.debt_ratio !== null ? `${financial.debt_ratio}%` : '정보 없음',
    })),
    trends: {
      revenue_growth_rates: revenueGrowthRates,
      op_income_trend: opTrend,
      debt_trend: debtTrend,
    },
  };
}

async function analyzeWithLlm(
  llm: ReturnType<typeof getLlmClient>,
  companyName: string,
  financial: FinancialSummary,
  news: Array<{ title: string; description: string; pubDate: string }>,
): Promise<AssessmentResult> {
  const financialText = financial.years.length > 0
    ? `[재무 데이터 (단위: 억원)]
${financial.revenue.map(revenue => `  ${revenue.year}년 매출: ${revenue.formatted}`).join('\n')}
${financial.operating_income.map(income => `  ${income.year}년 영업이익: ${income.formatted}`).join('\n')}
${financial.net_income.map(income => `  ${income.year}년 당기순이익: ${income.formatted}`).join('\n')}
${financial.debt_ratio.map(debt => `  ${debt.year}년 부채비율: ${debt.formatted}`).join('\n')}
  매출 YoY 성장률: ${financial.trends.revenue_growth_rates.filter(rate => rate.rate !== null).map(rate => `${rate.year}년 ${rate.rate}%`).join(', ') || '계산 불가'}
  영업이익 추이: ${financial.trends.op_income_trend}
  부채비율 추이: ${financial.trends.debt_trend}`
    : '[재무 데이터 없음 — DART 미공시 또는 비상장 기업]';

  const newsText = news.length > 0
    ? `[최근 뉴스 헤드라인 (${news.length}건)]\n${news.slice(0, 15).map(item => `  - ${item.title} (${item.pubDate.slice(0, 16)})\n    ${item.description.slice(0, 100)}`).join('\n')}`
    : '[뉴스 없음]';

  const prompt = `너는 기업 분석 전문가다. 아래 데이터를 바탕으로 "${companyName}"의 기업 성장성을 평가하라.

${financialText}

${newsText}

다음 JSON 형식으로만 응답하라. 다른 텍스트는 출력하지 말 것:
{
  "verdict": "GROWING" | "STABLE" | "DECLINING" | "UNKNOWN",
  "confidence": "high" | "medium" | "low",
  "positive_signals": ["신호1", "신호2"],
  "negative_signals": ["신호1", "신호2"],
  "neutral_signals": ["신호1"],
  "summary": "2-3문장 종합 평가",
  "risk_factors": ["리스크1", "리스크2"],
  "investment_outlook": "취업 관점에서 이 회사가 성장하는지 후퇴하는지에 대한 한 문장 평가"
}

판단 기준:
- GROWING: 매출 성장 + 영업이익 개선 또는 긍정적 뉴스 다수
- STABLE: 매출 유지, 큰 변동 없음
- DECLINING: 매출 감소, 영업이익 악화, 부정적 뉴스 (감원, 적자 심화 등)
- UNKNOWN: 데이터 부족`;

  const response = await llm.generate({
    system: '너는 한국 기업 재무 및 시장 분석 전문가다. JSON으로만 응답하라.',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
    temperature: 0.3,
  });

  const jsonMatch = response.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM이 유효한 JSON을 반환하지 않았습니다.');
  }

  return JSON.parse(jsonMatch[0]) as AssessmentResult;
}

function ruleBasedAssessment(financial: FinancialSummary): AssessmentResult {
  const positives: string[] = [];
  const negatives: string[] = [];

  const growthRates = financial.trends.revenue_growth_rates
    .map(rate => rate.rate)
    .filter((rate): rate is number => rate !== null);

  if (growthRates.length > 0) {
    const avgGrowth = growthRates.reduce((left, right) => left + right, 0) / growthRates.length;
    if (avgGrowth >= 20) positives.push(`평균 매출 성장률 ${avgGrowth.toFixed(1)}% (고성장)`);
    else if (avgGrowth >= 5) positives.push(`평균 매출 성장률 ${avgGrowth.toFixed(1)}%`);
    else if (avgGrowth < 0) negatives.push(`평균 매출 성장률 ${avgGrowth.toFixed(1)}% (역성장)`);
  }

  if (financial.trends.op_income_trend === 'improving') positives.push('영업이익 개선 추이');
  if (financial.trends.op_income_trend === 'deteriorating') negatives.push('영업이익 악화 추이');
  if (financial.trends.debt_trend === 'decreasing') positives.push('부채비율 감소');
  if (financial.trends.debt_trend === 'increasing') negatives.push('부채비율 증가');

  let verdict: AssessmentResult['verdict'] = 'UNKNOWN';
  if (financial.years.length === 0) verdict = 'UNKNOWN';
  else if (positives.length > negatives.length) verdict = 'GROWING';
  else if (negatives.length > positives.length) verdict = 'DECLINING';
  else verdict = 'STABLE';

  return {
    verdict,
    confidence: financial.years.length >= 2 ? 'medium' : 'low',
    positive_signals: positives,
    negative_signals: negatives,
    neutral_signals: [],
    summary: '재무 데이터 기반 규칙 분석 결과입니다. 정확한 분석을 위해 LLM 설정을 확인하세요.',
    risk_factors: [],
    investment_outlook: verdict === 'GROWING'
      ? '성장 중인 기업으로 취업 고려 가치 있음'
      : verdict === 'DECLINING'
        ? '재무 지표 악화 중 — 취업 전 추가 조사 권장'
        : '안정적이나 추가 분석 필요',
  };
}

function classifyCorp(corp_cls: string): string {
  switch (corp_cls) {
    case 'Y': return '유가증권시장(코스피)';
    case 'K': return '코스닥';
    case 'N': return '코넥스';
    case 'E': return '기타(비상장/외감)';
    default: return '알 수 없음';
  }
}

function formatPubDate(pubDate: string): string {
  try {
    return new Date(pubDate).toISOString().slice(0, 10);
  } catch {
    return pubDate;
  }
}
