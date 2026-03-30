# 🇰🇷 Job Hunting MCP — 한국 취업시장 특화 MCP 서버

> **GitHub**: [https://github.com/PracLee/job_hunting_mcp](https://github.com/PracLee/job_hunting_mcp)

한국 취업 준비 과정에서 반복되는 서류 작업을 자동화하는 **MCP(Model Context Protocol) 서버**입니다.

> **핵심 가치**: 이력서/경력기술서/자기소개서를 한 번 입력하면, 공고별·사이트별로 맞춤 변환합니다.
> 같은 서류를 사이트마다 다시 쓰는 고통을 없앱니다.

> **로컬 전용**: 외부 API 없이, **Ollama 등 로컬 LLM**만 사용합니다.
> 개인 이력 데이터가 외부로 전송되지 않습니다.

---

## 이 MCP가 하는 일

| 기능 | 설명 | LLM 필요 여부 |
|------|------|:---:|
| **채용공고 관리** | 5개 사이트에서 공고 검색 + 정규화 저장 | ❌ |
| **프로필 파싱** | 이력서/경력기술서를 구조화된 마스터 프로필로 변환 | ❌ |
| **적합도 분석** | 공고-프로필을 5가지 차원으로 매칭 분석 | ❌ |
| **사이트별 양식 변환** | 원티드/사람인/잡코리아/점핏/그룹바이 양식 복붙 텍스트 | ❌ |
| **경력기술서 맞춤화** | 공고 요구사항에 맞게 bullet point 재작성 | ✅ |
| **자기소개서 작성** | 문항 의도 분석 → 소재 추천 → 초안 생성 | ✅ |
| **포트폴리오 정렬** | 공고 기준으로 프로젝트 관련도 순 재배치 | ✅ |
| **지원 관리** | 지원 상태 추적 (저장 → 지원 → 합격/불합격) | ❌ |
| **면접 준비** | 공고+경력 기반 예상 질문 및 답변 포인트 | ✅ |

> **LLM 없이도 핵심 기능(공고 검색, 프로필 파싱, 매칭, 양식 변환, 지원 관리)은 완전히 동작합니다.**
> LLM은 서류 생성/보강 등 고부가가치 작업에만 사용됩니다.

---

## 빠른 시작

### 1. 설치

```bash
git clone https://github.com/PracLee/job_hunting_mcp.git
cd job_hunting_mcp
npm install
npm run build
```

### 2. MCP 클라이언트 연결

이 MCP 서버는 **MCP를 지원하는 모든 클라이언트**에서 사용할 수 있습니다.
클라이언트는 사용자가 대화하는 UI이고, 우리 MCP 서버의 Tool을 호출하는 역할입니다.

#### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "job-hunting": {
      "command": "node",
      "args": ["/절대경로/job_hunting_mcp/dist/index.js"]
    }
  }
}
```

#### Claude Code (CLI)

```bash
claude mcp add job-hunting node /절대경로/job_hunting_mcp/dist/index.js
```

#### ChatGPT Desktop

ChatGPT Desktop에서 MCP 서버를 추가합니다:

1. 설정 → MCP Servers → Add Server
2. `node /절대경로/job_hunting_mcp/dist/index.js` 입력

#### Gemini CLI

```bash
# .gemini/settings.json 에 추가
{
  "mcpServers": {
    "job-hunting": {
      "command": "node",
      "args": ["/절대경로/job_hunting_mcp/dist/index.js"]
    }
  }
}
```

#### 기타 MCP 호환 클라이언트

MCP 표준을 지원하는 클라이언트라면 어디서든 사용 가능합니다.
`command: "node"`, `args: ["/절대경로/dist/index.js"]`로 등록하면 됩니다.

#### 직접 실행 (개발/테스트)

```bash
npm run dev    # tsx로 직접 실행 (개발)
npm start      # 빌드된 JS 실행
npm test       # 테스트 (63건)
```

### 3. 로컬 LLM 설정 (선택사항)

> **LLM 없이도 핵심 기능(공고 검색, 프로필 파싱, 매칭, 양식 변환, 지원 관리)은 완전히 동작합니다.**
> 서류 생성/보강(경력기술서 맞춤화, 자소서 초안, 면접 준비)을 사용하려면 로컬 LLM이 필요합니다.

```
┌─────────────────────┐     Tool 호출     ┌──────────────────┐     서류 생성 시     ┌─────────────────┐
│  MCP 클라이언트      │ ──────────────→  │  이 MCP 서버      │ ──────────────→   │  로컬 LLM       │
│  (Claude Desktop,   │                   │  (job-hunting)    │                    │  (Ollama 등)    │
│   ChatGPT Desktop,  │  ←──────────────  │                  │  ←──────────────   │                 │
│   Gemini CLI 등)    │     결과 반환     │                  │     생성된 텍스트   │                 │
└─────────────────────┘                   └──────────────────┘                    └─────────────────┘
       사용자 UI                              우리 서버                          서류 작성용 LLM 엔진
```

- **MCP 클라이언트**: 사용자가 대화하는 UI. 우리 Tool을 호출하는 쪽
- **이 MCP 서버**: 공고 검색, 매칭, 양식 변환 등 실제 로직 수행
- **로컬 LLM**: MCP 서버 내부에서 서류 생성이 필요할 때만 호출되는 LLM 엔진

#### 방법 A: Ollama (추천)

```bash
# Ollama 설치 (https://ollama.com)
brew install ollama           # macOS
# curl -fsSL https://ollama.com/install.sh | sh  # Linux

# 모델 다운로드
ollama pull llama3            # 범용
ollama pull qwen2.5           # 한국어 우수 (추천)
ollama pull gemma2            # 한국어 양호

# Ollama 서버 시작
ollama serve
```

환경 설정 (`.env`):
```bash
cp .env.example .env
```

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5
```

#### 방법 B: LM Studio / vLLM 등 OpenAI 호환 로컬 서버

```env
LLM_PROVIDER=openai-compatible
LOCAL_LLM_BASE_URL=http://localhost:1234/v1
LOCAL_LLM_MODEL=local-model
LOCAL_LLM_API_KEY=not-needed
```

---

## 사용법 — 실전 플로우

### Step 1: 프로필 등록 (최초 1회)

이력서와 경력기술서 텍스트를 입력하면 자동으로 구조화합니다.

```
"내 이력서 파싱해줘"

→ profile_parse_resume 호출
→ 기술스택, 프로젝트, 경력 연차, 도메인 자동 추출
→ 마스터 프로필 DB 저장
```

### Step 2: 공고 등록

관심 공고를 복붙하거나 온라인 검색합니다.

```
# 방법 1: 온라인 검색
"서울, Java 백엔드, 3~5년차 공고 찾아줘"
→ jobs_search(keywords: ["Java", "백엔드"], location: "서울", sources: ["wanted", "jumpit", "groupby"])

# 방법 2: URL로 상세 조회
"이 공고 상세 보여줘: https://www.wanted.co.kr/wd/12345"
→ jobs_get_detail(job_id: "https://www.wanted.co.kr/wd/12345")

# 방법 3: 텍스트 복붙
"이 공고 등록해줘" + 공고 전문 붙여넣기
→ jobs_add(company_name: "토스", job_title: "서버 개발자", raw_text: "...")
```

### Step 3: 적합도 분석

```
"이 공고랑 내 프로필 매칭해줘"
→ match_score_job(job_id: "jp_xxx")
→ 기술 매칭 85점, 경력 적합 100점, 부족한 점: Kafka 경험 없음 ...
```

### Step 4: 서류 맞춤화

```
# 경력기술서
"이 공고에 맞게 경력기술서 수정해줘"
→ resume_tailor(job_id: "jp_xxx")

# 자기소개서
"지원동기 소재 추천해줘"
→ coverletter_brainstorm(job_id: "jp_xxx", question: "지원동기")

"지원동기 초안 써줘"
→ coverletter_generate(job_id: "jp_xxx", question_type: "motivation")

# 포트폴리오
"이 공고 기준으로 프로젝트 순서 재배치해줘"
→ portfolio_reorder(job_id: "jp_xxx")
```

### Step 5: 사이트별 양식 변환 (핵심!)

**같은 프로필을 각 사이트 양식에 맞게 자동 변환합니다.**

```
"원티드 양식으로 변환해줘"
→ resume_export(target_platform: "wanted")
→ 한 줄 소개 + 성과 중심 경력 + 기술 태그

"사람인 양식으로 변환해줘"
→ resume_export(target_platform: "saramin")
→ 인적사항 + 경력사항(표) + 학력 + 자격증

"잡코리아 양식으로 변환해줘"
→ resume_export(target_platform: "jobkorea")
→ 이력서 + 경력기술서 분리

"점핏 양식으로 변환해줘"
→ resume_export(target_platform: "jumpit")
→ 기술 중심 프로필 + 프로젝트 카드

"그룹바이 양식으로 변환해줘"
→ resume_export(target_platform: "groupby")
→ 스타트업향 간결 소개 + 기술 태그 + 성과
```

> LLM으로 문장을 보강하려면: `resume_export(target_platform: "wanted", enhance_with_llm: true)`

### Step 6: 지원 관리 & 면접

```
# 지원 기록
"이 공고 지원 완료로 기록해줘"
→ application_create(job_id: "jp_xxx", status: "applied")

# 상태 변경
"서류 합격했어"
→ application_update_status(application_id: "app_xxx", new_status: "document_passed")

# 현황 조회
"지원 현황 보여줘"
→ application_list

# 면접 준비
"이 회사 면접 준비해줘"
→ interview_prepare(job_id: "jp_xxx")
→ 예상 기술 질문 + 경험 질문 + 답변 포인트
```

---

## Tool 전체 목록

### 채용공고 (3개)

| Tool | 설명 |
|------|------|
| `jobs_search` | 키워드/조건으로 공고 검색 (원티드/사람인/잡코리아/점핏/그룹바이) |
| `jobs_get_detail` | 특정 공고 상세 조회 (URL 붙여넣기 지원) |
| `jobs_add` | 공고 텍스트를 복붙하여 수동 등록 |

### 프로필 (2개)

| Tool | 설명 |
|------|------|
| `profile_parse_resume` | 이력서/경력기술서 → 구조화된 프로필 |
| `profile_get` | 저장된 프로필 조회 |

### 매칭 (2개)

| Tool | 설명 |
|------|------|
| `match_score_job` | 공고-프로필 5차원 매칭 분석 |
| `match_rank_jobs` | 여러 공고 적합도 순 랭킹 |

### 서류 (5개)

| Tool | 설명 | LLM |
|------|------|:---:|
| `resume_tailor` | 공고 맞춤 경력기술서 | ✅ |
| `resume_export` | 플랫폼별 양식 변환 (5개 사이트 + 범용) | 선택 |
| `coverletter_brainstorm` | 자소서 소재 추천 | ✅ |
| `coverletter_generate` | 자소서 초안 생성 | ✅ |
| `portfolio_reorder` | 공고 기준 프로젝트 재배치 | ✅ |

### 지원 관리 (3개)

| Tool | 설명 |
|------|------|
| `application_create` | 지원 기록 생성 |
| `application_update_status` | 상태 변경 |
| `application_list` | 현황 목록 + 통계 |

### 면접 (1개)

| Tool | 설명 | LLM |
|------|------|:---:|
| `interview_prepare` | 예상 질문/답변 포인트 | ✅ |

---

## 채용 사이트 지원 현황

| 사이트 | 공고 검색 | 양식 변환 | API 키 필요 | 비고 |
|--------|:--------:|:--------:|:----------:|------|
| **원티드** | ✅ | ✅ | 불필요 | 웹 API |
| **사람인** | ✅ | ✅ | `SARAMIN_API_KEY` | Open API |
| **잡코리아** | ✅ | ✅ | 불필요 | 웹 파싱 |
| **점핏** | ✅ | ✅ | 불필요 | 웹 API |
| **그룹바이** | ✅ | ✅ | 불필요 | 스타트업 전문, Next.js SSR 파싱 |

### 검토 후 제외한 플랫폼

| 플랫폼 | 제외 이유 |
|--------|----------|
| **로켓펀치** | 서비스 종료 |
| **혁신의숲** | 채용 플랫폼이 아님 (스타트업 분석). 채용은 원티드 연동이라 중복 |
| **위시캣** | 프리랜서 프로젝트 매칭 전문. 정규직 채용 스키마와 구조 불일치 |

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| Runtime | Node.js 20+ |
| Language | TypeScript (strict) |
| MCP SDK | `@modelcontextprotocol/sdk` |
| DB | SQLite (better-sqlite3) — 로컬 파일, 별도 설치 불필요 |
| LLM | **Ollama (기본)** / OpenAI 호환 로컬 서버 |
| Validation | Zod |
| Test | Vitest (63건) |

---

## 프로젝트 구조

```
src/
├── index.ts                  # 진입점
├── server.ts                 # MCP 서버 설정
├── tools/                    # Tool 핸들러 (16개)
│   ├── jobs/                 # 채용공고 검색/추가
│   ├── profile/              # 프로필 파싱
│   ├── match/                # 적합도 분석
│   ├── resume/               # 경력기술서 맞춤화 + 양식 변환
│   ├── coverletter/          # 자기소개서
│   ├── portfolio/            # 포트폴리오 정렬
│   ├── application/          # 지원 관리
│   └── interview/            # 면접 준비
├── adapters/                 # 채용 사이트별 어댑터
│   ├── base-adapter.ts       # 공통 인터페이스
│   ├── wanted-adapter.ts     # 원티드
│   ├── saramin-adapter.ts    # 사람인
│   ├── jobkorea-adapter.ts   # 잡코리아
│   ├── jumpit-adapter.ts     # 점핏
│   └── groupby-adapter.ts    # 그룹바이 (스타트업)
├── core/                     # 핵심 라이브러리
│   ├── llm-client.ts         # LLM 추상화 (Ollama / OpenAI 호환 로컬)
│   ├── tech-dictionary.ts    # 기술 사전 (80+ 항목, 한국어 동의어)
│   ├── resume-parser.ts      # 이력서 규칙 기반 파싱
│   ├── job-normalizer.ts     # 공고 텍스트 정규화
│   ├── platform-templates.ts # 플랫폼별 양식 템플릿 (6종)
│   └── utils.ts
├── db/                       # SQLite DB
│   ├── connection.ts
│   └── repositories/
└── types/                    # 타입 정의

tests/                        # 테스트 (63건)
├── core/                     # 코어 로직 테스트
├── services/                 # 매칭/템플릿 테스트
└── tools/                    # E2E 통합 테스트
```

---

## 설계 원칙

1. **완전 로컬** — 외부 API 없이 로컬 LLM만 사용. 개인 데이터 외부 전송 없음
2. **LLM 최소 사용** — 검색/매칭/양식 변환은 규칙 기반. LLM은 서류 생성에만
3. **허위 경험 금지** — 기존 경험을 재구성/강조하는 방향으로만 지원
4. **한국 시장 특화** — 한국식 이력서/자소서/채용공고 구조에 맞춤
5. **확장 가능** — 새 채용 사이트 추가 = `SourceAdapter` 구현 1개

---

## 라이선스

MIT
