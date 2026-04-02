/**
 * 네이버 뉴스 검색 어댑터
 *
 * 기업 관련 최근 뉴스를 검색합니다.
 * API 키 발급: https://developers.naver.com/apps/ > 애플리케이션 등록 > 검색(뉴스) 선택
 *
 * 환경변수:
 *   NAVER_NEWS_CLIENT_ID     — 애플리케이션 Client ID
 *   NAVER_NEWS_CLIENT_SECRET — 애플리케이션 Client Secret
 */

const NAVER_NEWS_API = 'https://openapi.naver.com/v1/search/news.json';

export interface NaverNewsItem {
  title: string;
  link: string;
  description: string;
  pubDate: string; // RFC 2822 형식
}

export class NaverNewsAdapter {
  private get clientId(): string {
    return process.env.NAVER_NEWS_CLIENT_ID || '';
  }

  private get clientSecret(): string {
    return process.env.NAVER_NEWS_CLIENT_SECRET || '';
  }

  isAvailable(): boolean {
    return this.clientId.length > 0 && this.clientSecret.length > 0;
  }

  /**
   * 뉴스를 검색합니다.
   * @param query 검색어
   * @param display 결과 수 (최대 100)
   * @param sort 정렬 기준 ('date' | 'sim')
   */
  async search(query: string, display: number = 30, sort: 'date' | 'sim' = 'sim'): Promise<NaverNewsItem[]> {
    try {
      const url = new URL(NAVER_NEWS_API);
      url.searchParams.set('query', query);
      url.searchParams.set('display', Math.min(display, 100).toString());
      url.searchParams.set('start', '1');
      url.searchParams.set('sort', sort);

      const res = await fetch(url.toString(), {
        headers: {
          'X-Naver-Client-Id': this.clientId,
          'X-Naver-Client-Secret': this.clientSecret,
        },
      });

      if (!res.ok) {
        console.error(`네이버 뉴스 API 에러: ${res.status}`);
        return [];
      }

      const data = await res.json() as { items: NaverNewsItem[] };
      const cleaned = (data.items || []).map(item => ({
        title: stripHtml(item.title),
        link: item.link,
        description: stripHtml(item.description),
        pubDate: item.pubDate,
      }));

      // 제목 또는 설명에 검색어가 포함된 기사만 반환 (본문 언급만 된 무관 기사 제거)
      const queryLower = query.toLowerCase();
      const relevant = cleaned.filter(item =>
        item.title.toLowerCase().includes(queryLower) ||
        item.description.toLowerCase().includes(queryLower)
      );
      // 관련 기사가 충분하면 필터 결과, 아니면 전체 반환 (fallback)
      return relevant.length >= 3 ? relevant : cleaned;
    } catch {
      return [];
    }
  }
}

/** HTML 태그 및 HTML 엔티티 제거 */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}
