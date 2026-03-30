# 🇰🇷 Job Hunting MCP — 한국 취업시장 특화 MCP 서버

> **GitHub**: [https://github.com/PracLee/job_hunting_mcp](https://github.com/PracLee/job_hunting_mcp)

한국 취업 준비 과정에서 반복되는 서류 작업을 자동화하는 **MCP(Model Context Protocol) 서버**입니다.

> **핵심 가치**: 이력서/경력기술서/자기소개서를 한 번 입력하면, 공고별·사이트별로 맞춤 변환합니다.
> 같은 서류를 사이트마다 다시 쓰는 고통을 없앱니다.

> **사용법**: Claude Desktop, ChatGPT Desktop, Gemini CLI 등 **MCP 클라이언트에 연결**하면 바로 사용할 수 있습니다.
> 별도 LLM 설치 없이 MCP 클라이언트의 AI가 서류 작성까지 처리합니다.

---

## 이 MCP가 하는 일

| 기능 | 설명 |
|------|------|
| **채용공고 관리** | 6개 사이트에서 공고 검색 + 정규화 저장 |
| **프로필 파싱** | 이력서/경력기술서를 구조화된 마스터 프로필로 변환 |
| **적합도 분석** | 공고-프로필을 5가지 차원으로 매칭 분석 |
| **사이트별 양식 변환** | 원티드/사람인/잡코리아/점핏/그룹바이 양식 복붙 텍스트 |
| **경력기술서 맞춤화** | 공고 요구사항에 맞게 bullet point 재작성 |
| **자기소개서 작성** | 문항 의도 분석 → 소재 추천 → 초안 생성 |
| **포트폴리오 정렬** | 공고 기준으로 프로젝트 관련도 순 재배치 |
| **지원 관리** | 지원 상태 추적 (저장 → 지원 → 합격/불합격) |
| **면접 준비** | 공고+경력 기반 예상 질문 및 답변 포인트 |

---

## 빠른 시작

### 1. 설치

```bash
git clone https://github.com/PracLee/job_hunting_mcp.git
cd job_hunting_mcp
npm install
npm run build
```

### 2. MCP 클라이언트에 연결하면 끝!

이 MCP 서버는 **MCP를 지원하는 AI 클라이언트에 연결하면 바로 사용**할 수 있습니다.
별도 LLM 설치가 필요 없습니다 — **클라이언트의 AI가 서류 작성까지 모두 처리**합니다.

```
┌─────────────────────────┐      Tool 호출      ┌──────────────────────┐
│  MCP 클라이언트 (AI)     │ ─────────────────→ │  이 MCP 서버          │
│                         │                     │                      │
│  • Claude Desktop (추천) │                     │  • 공고 검색/정규화    │
│  • Claude Code (CLI)    │  ←───────────────── │  • 프로필 파싱        │
│  • Gemini CLI           │      결과 반환       │  • 매칭 분석          │
│  • 기타 MCP 호환 앱      │                     │  • 양식 변환          │
│                         │                     │  • 지원 관리          │
│                         │                     │                      │
│  서류 작성은 클라이언트   │                     │  데이터 처리 + 로직    │
│  AI가 직접 처리          │                     │                      │
└─────────────────────────┘                     └──────────────────────┘
     여기서 대화하면                                여기서 실행됨
```

아래에서 사용하는 클라이언트를 골라 설정하세요.

#### ✅ Claude Desktop (추천)

로컬 설정 파일에 JSON을 추가하면 됩니다.

| OS | 설정 파일 경로 |
|----|---------------|
| **macOS** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Windows** | `%APPDATA%\Claude\claude_desktop_config.json` |

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

#### ✅ Claude Code (CLI)

```bash
claude mcp add job-hunting node /절대경로/job_hunting_mcp/dist/index.js
```

#### ✅ Gemini CLI

| OS | 설정 파일 경로 |
|----|---------------|
| **macOS / Linux** | `~/.gemini/settings.json` |
| **Windows** | `%USERPROFILE%\.gemini\settings.json` |

Claude Desktop과 동일한 JSON 포맷(`mcpServers`)을 사용합니다.

#### ⚠️ ChatGPT Desktop

> **주의**: ChatGPT의 MCP 연결은 Claude Desktop처럼 로컬 설정 파일 방식이 아닙니다.
> 현재(2026.03 기준) 공식 문서에 따르면 **Developer Mode → Apps** 흐름으로,
> **ChatGPT Business / Enterprise / Edu** 요금제의 웹 환경에서 MCP 서버를 등록하는 방식입니다.
> 개인 사용자용 로컬 stdio 연결은 아직 공식 지원되지 않을 수 있으므로,
> [OpenAI 공식 MCP 문서](https://platform.openai.com/docs/guides/tools/mcp)를 확인하세요.

#### 기타 MCP 호환 클라이언트

MCP 표준(stdio)을 지원하는 앱이면 어디서든 사용 가능합니다.
`command: "node"`, `args: ["/절대경로/dist/index.js"]`로 등록하면 됩니다.

> **Windows 사용자 참고**: 경로 구분자를 `\\`로 사용하세요.
> 예: `"args": ["C:\\Users\\이름\\job_hunting_mcp\\dist\\index.js"]`

### 3. 환경 설정 (선택사항)

```bash
cp .env.example .env
```

대부분의 경우 `.env` 설정 없이 바로 사용할 수 있습니다.
아래는 필요한 경우에만 설정합니다:

```env
# 사람인 공고 검색을 사용하려면 (선택)
SARAMIN_API_KEY=your-saramin-api-key

# DB 저장 위치 변경 (기본: ./data/job_hunting.db)
DB_PATH=./data/job_hunting.db
```

### 4. 개발/테스트

```bash
npm run dev    # tsx로 직접 실행 (개발)
npm start      # 빌드된 JS 실행
npm test       # 테스트 (63건)
```

---

## (고급) 로컬 LLM 연동

> **대부분의 사용자는 이 섹션이 필요 없습니다.**
> Claude Desktop 등 MCP 클라이언트의 AI가 서류 작성을 처리하기 때문입니다.
>
> 아래는 **완전 오프라인 환경**에서 사용하거나,
> MCP 서버 내부에서 자체적으로 LLM을 호출하고 싶을 때를 위한 고급 설정입니다.

#### Ollama

```bash
brew install ollama              # macOS
ollama pull qwen2.5              # 한국어 우수 (추천, 최소 16GB RAM)
ollama serve                     # 서버 시작
```

```env
# .env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5
```

#### LM Studio / vLLM 등 OpenAI 호환 로컬 서버

```env
LLM_PROVIDER=openai-compatible
LOCAL_LLM_BASE_URL=http://localhost:1234/v1
LOCAL_LLM_MODEL=local-model
LOCAL_LLM_API_KEY=not-needed
```

#### 로컬 LLM 최소 사양

| 모델 | RAM | 비고 |
|------|-----|------|
| qwen2.5 7B (Q4) | 16GB+ | 한국어 추천 |
| llama3 8B (Q4) | 16GB+ | 범용 |
| gemma2 9B (Q4) | 16GB+ | 빠듯함, 다른 앱 닫아야 |
| 70B 모델 | 64GB+ | 고사양 필요 |

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
→ jobs_search(keywords: ["Java", "백엔드"], location: "서울", sources: ["wanted", "jumpit", "groupby", "remember"])

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
| `jobs_search` | 키워드/조건으로 공고 검색 (원티드/사람인/잡코리아/점핏/그룹바이/리멤버) |
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

| Tool | 설명 |
|------|------|
| `resume_tailor` | 공고 맞춤 경력기술서 (클라이언트 AI가 처리) |
| `resume_export` | 플랫폼별 양식 변환 (5개 사이트 + 범용) |
| `coverletter_brainstorm` | 자소서 소재 추천 (클라이언트 AI가 처리) |
| `coverletter_generate` | 자소서 초안 생성 (클라이언트 AI가 처리) |
| `portfolio_reorder` | 공고 기준 프로젝트 재배치 (클라이언트 AI가 처리) |

### 지원 관리 (3개)

| Tool | 설명 |
|------|------|
| `application_create` | 지원 기록 생성 |
| `application_update_status` | 상태 변경 |
| `application_list` | 현황 목록 + 통계 |

### 면접 (1개)

| Tool | 설명 |
|------|------|
| `interview_prepare` | 예상 질문/답변 포인트 (클라이언트 AI가 처리) |

---

## 채용 사이트 지원 현황

| 사이트 | 공고 검색 | 양식 변환 | API 키 필요 | 비고 |
|--------|:--------:|:--------:|:----------:|------|
| **원티드** | ✅ | ✅ | 불필요 | 웹 API |
| **사람인** | ✅ | ✅ | `SARAMIN_API_KEY` | Open API |
| **잡코리아** | ✅ | ✅ | 불필요 | 웹 파싱 |
| **점핏** | ✅ | ✅ | 불필요 | 웹 API |
| **그룹바이** | ✅ | ✅ | 불필요 | 스타트업 전문, Next.js SSR 파싱 |
| **리멤버** | ✅ | - | 불필요 | 경력직 전문, 내부 API 파싱 |

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
| LLM | MCP 클라이언트 AI 사용 (고급: Ollama / LM Studio 로컬 연동 가능) |
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
│   ├── groupby-adapter.ts    # 그룹바이 (스타트업)
│   └── remember-adapter.ts   # 리멤버 (경력직)
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

1. **MCP 클라이언트 우선** — Claude Desktop/ChatGPT 등에 연결하면 바로 사용. 별도 LLM 설치 불필요
2. **규칙 기반 핵심** — 검색/매칭/양식 변환은 규칙 기반. AI는 서류 생성에만
3. **허위 경험 금지** — 기존 경험을 재구성/강조하는 방향으로만 지원
4. **한국 시장 특화** — 한국식 이력서/자소서/채용공고 구조에 맞춤
5. **확장 가능** — 새 채용 사이트 추가 = `SourceAdapter` 구현 1개
6. **비개발자 친화** — 설치 후 대화만으로 모든 기능 사용 가능

---

## 라이선스

MIT
