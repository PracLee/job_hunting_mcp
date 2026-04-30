import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobkoreaAdapter } from '../../src/adapters/jobkorea-adapter.js';
import { JumpitAdapter } from '../../src/adapters/jumpit-adapter.js';
import { GroupbyAdapter } from '../../src/adapters/groupby-adapter.js';

describe('platform adapters', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('JobkoreaAdapter', () => {
    it('parses the current card-based search markup', async () => {
      fetchMock.mockResolvedValueOnce(textResponse(`
        <div data-sentry-component="CardJob">
          <div class="w-full">
            <div class="mb-0.5">
              <a
                href="https://www.jobkorea.co.kr/Recruit/GI_Read/48897380?Oem_Code=C1&logpath=1"
                data-sentry-component="Title"
              >
                <span>Web / Java 개발자 채용</span>
              </a>
            </div>
            <span class="mb-5"><a><span>㈜다임즈</span></a></span>
            <div data-sentry-component="GrayChip">서울 구로구</div>
            <div data-sentry-component="GrayChip">솔루션·SI·CRM·ERP, 백엔드개발자, 프론트엔드개발자, 웹개발자</div>
            <div>즉시 지원 경력5년↑</div>
          </div>
        </div>
      `));

      const jobs = await new JobkoreaAdapter().search({
        keywords: ['Java'],
        limit: 5,
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        source: 'jobkorea',
        source_id: '48897380',
        company_name: '㈜다임즈',
        job_title: 'Web / Java 개발자 채용',
        location: '서울 구로구',
        experience_min: 5,
        url: 'https://www.jobkorea.co.kr/Recruit/GI_Read/48897380',
      });
    });

    it('parses the current detail page schema and sections', async () => {
      fetchMock.mockResolvedValueOnce(textResponse(`
        <html>
          <head>
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "JobPosting",
                "title": "Web / Java 개발자 채용",
                "description": "다임즈에서 Java 웹 개발자를 채용합니다.",
                "validThrough": "2026-05-31T23:59",
                "employmentType": ["FULL_TIME"],
                "hiringOrganization": { "@type": "Organization", "name": "㈜다임즈" },
                "jobLocation": {
                  "@type": "Place",
                  "address": { "@type": "PostalAddress", "streetAddress": "서울 구로구 디지털로 123" }
                },
                "identifier": { "@type": "PropertyValue", "value": "48897380" }
              }
            </script>
          </head>
          <body>
            <div data-sentry-component="RecruitmentGuidelines">
              모집요강 모집분야 웹 서비스 개발 고용형태 정규직 급여 회사 내규에 따름
            </div>
            <div data-sentry-component="Qualification">
              지원자격 경력 경력(5년이상) 학력 초대졸이상 스킬 Java Spring Boot
            </div>
            <div data-sentry-component="BenefitCard">
              복리후생 재택근무 장비지원
            </div>
          </body>
        </html>
      `));

      const job = await new JobkoreaAdapter().fetchDetail('48897380');

      expect(job).not.toBeNull();
      expect(job).toMatchObject({
        source: 'jobkorea',
        source_id: '48897380',
        company_name: '㈜다임즈',
        job_title: 'Web / Java 개발자 채용',
        location: '서울 구로구 디지털로 123',
        employment_type: '정규직',
        deadline: '2026-05-31T23:59',
      });
      expect(job?.raw_text).toContain('지원자격');
    });
  });

  describe('JumpitAdapter', () => {
    it('uses keyword search instead of obsolete techStack ids and strips title markup', async () => {
      let requestedUrl = '';
      fetchMock.mockImplementationOnce(async (input) => {
        requestedUrl = String(input);
        return jsonResponse({
          result: {
            positions: [
              {
                id: 53545291,
                title: '<span>JAVA</span> 개발자 경력 3년이상',
                companyName: '이액티브',
                jobCategory: '서버/백엔드 개발자',
                techStacks: ['Java', 'Spring Boot'],
                minCareer: 3,
                maxCareer: 10,
                locations: ['서울 영등포구'],
                closedAt: '2026-05-05T23:59:59',
              },
            ],
          },
        });
      });

      const jobs = await new JumpitAdapter().search({
        keywords: ['Java', '백엔드'],
        location: '서울',
        limit: 5,
      });

      const url = new URL(requestedUrl);
      expect(url.searchParams.get('keyword')).toBe('Java 백엔드');
      expect(url.searchParams.get('techStack')).toBeNull();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        source: 'jumpit',
        source_id: '53545291',
        company_name: '이액티브',
        job_title: 'JAVA 개발자 경력 3년이상',
        job_category: 'backend',
        location: '서울 영등포구',
      });
    });

    it('maps the current detail response fields', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({
        result: {
          id: 53553579,
          title: '웹어플리케이션 백엔드 개발자(2년↑)',
          companyName: '이글루코퍼레이션',
          techStacks: [{ stack: 'Java' }, { stack: 'Spring Boot' }],
          responsibility: '• 관제시스템 Web Application 개발',
          qualifications: '• Java와 Spring Boot 경험',
          preferredRequirements: '• CI/CD 구성 경험',
          welfares: '• 장기근속 포상제도',
          recruitProcess: '• 서류전형 > 1차면접 > 최종합격',
          minCareer: 2,
          maxCareer: 5,
          workingPlaces: [{ address: '서울 송파구 정의로8길7' }],
          jobCategories: [{ id: 1, name: '서버/백엔드 개발자' }],
          closedAt: '2026-05-06T23:59:59',
        },
      }));

      const job = await new JumpitAdapter().fetchDetail('53553579');

      expect(job).not.toBeNull();
      expect(job).toMatchObject({
        source: 'jumpit',
        source_id: '53553579',
        company_name: '이글루코퍼레이션',
        job_title: '웹어플리케이션 백엔드 개발자(2년↑)',
        job_category: 'backend',
        location: '서울 송파구 정의로8길7',
      });
      expect(job?.required_skills).toContain('Java');
      expect(job?.qualifications.join(' ')).toContain('Java');
      expect(job?.preferences.join(' ')).toContain('CI/CD');
    });
  });

  describe('GroupbyAdapter', () => {
    it('treats fallbackDataRaw itself as the position object', async () => {
      fetchMock
        .mockResolvedValueOnce(textResponse(`
          <?xml version="1.0" encoding="UTF-8"?>
          <urlset>
            <url>
              <loc>https://groupby.kr/positions/10354</loc>
              <lastmod>2026-04-30T09:00:00.000Z</lastmod>
            </url>
          </urlset>
        `))
        .mockResolvedValueOnce(textResponse(`
          <html>
            <body>
              <script id="__NEXT_DATA__" type="application/json">
                ${JSON.stringify({
                  props: {
                    pageProps: {
                      fallbackDataRaw: {
                        id: 10354,
                        name: '리텐틱스 데이터 사이언티스트 경력 채용 (3년이상)',
                        careerType: '정규직',
                        positionTypes: [{ id: 1, name: '데이터 분석가' }],
                        techStacks: [{ id: 1, name: 'Python' }, { id: 2, name: 'Spark' }],
                        experienceRange: { min: 3, max: 10 },
                        location: { id: 1, name: '강남구' },
                        address: '서울시 강남구 테헤란로 151 5층',
                        task: '데이터 파이프라인 개발',
                        qualification: 'Python 경험',
                        preferred: 'Spark 경험',
                        hiringProcess: '서류 > 면접',
                        startup: { id: 10, name: '리텐틱스' },
                        dueDate: '2026-05-31',
                      },
                    },
                  },
                })}
              </script>
            </body>
          </html>
        `));

      const jobs = await new GroupbyAdapter().search({
        keywords: ['Python'],
        limit: 5,
      });

      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({
        source: 'groupby',
        source_id: '10354',
        company_name: '리텐틱스',
        job_title: '리텐틱스 데이터 사이언티스트 경력 채용 (3년이상)',
        location: '서울시 강남구 테헤란로 151 5층',
      });
      expect(jobs[0].required_skills).toEqual(expect.arrayContaining(['Python', 'Spark']));
    });
  });
});

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function textResponse(body: string, init?: ResponseInit): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    ...init,
  });
}
