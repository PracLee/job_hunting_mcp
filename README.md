# 🇰🇷 Job Hunting MCP — 한국 취업시장 특화 MCP 서버

한국 취업 준비 과정에서 반복되는 서류 작업을 자동화하는 **MCP(Model Context Protocol) 서버**입니다.

> **핵심 가치**: 이력서/경력기술서/자기소개서를 한 번 입력하면, 공고별·사이트별로 맞춤 변환합니다.
> 같은 서류를 사이트마다 다시 쓰는 고통을 없앱니다.

---

## 이 MCP가 하는 일

| 기능 | 설명 |
|------|------|
| **채용공고 관리** | 공고를 저장하고 정규화된 형태로 관리 |
| **프로필 파싱** | 이력서/경력기술서를 구조화된 마스터 프로필로 변환 |
| **적합도 분석** | 공고와 프로필을 5가지 차원으로 매칭 분석 |
| **경력기술서 맞춤화** | 공고 요구사항에 맞게 경력기술서 bullet point 재작성 |
| **사이트별 양식 변환** | 원티드/사람인/잡코리아/점핏/로켓펀치 양식에 맞는 복붙 텍스트 생성 |
| **자기소개서 작성** | 문항 의도 분석 → 소재 추천 → 초안 생성 |
| **포트폴리오 정렬** | 공고 기준으로 프로젝트 관련도 순 재배치 |
| **지원 관리** | 지원 상태 추적 (저장 → 지원 → 서류합격 → 면접 → 합격/불합격) |
| **면접 준비** | 공고+경력 기반 예상 질문 및 답변 포인트 생성 |

---

## 사용 흐름

```
1. 프로필 등록 (한 번만)
   이력서 + 경력기술서 텍스트 입력
   → profile_parse_resume → 마스터 프로필 저장

2. 공고 등록
   관심 공고 텍스트 복붙
   → jobs_add → 정규화 저장

3. 적합도 확인
   → match_score_job → 기술/경력/도메인 매칭 점수 + 강점/약점

4. 서류 맞춤화
   → resume_tailor → 공고 맞춤 경력기술서
   → coverletter_generate → 자소서 초안
   → portfolio_reorder → 프로젝트 순서 재배치

5. 사이트별 변환
   → resume_export(target: "wanted") → 원티드용 복붙 텍스트
   → resume_export(target: "saramin") → 사람인용 복붙 텍스트
   → resume_export(target: "jumpit") → 점핏용 복붙 텍스트

6. 지원 & 면접
   → application_create → 기록
   → interview_prepare → 예상 질문 + 답변 포인트
```

---

## 설치 및 설정

### 사전 요구사항

- Node.js 20+
- LLM API 키 (아래 중 택 1)
  - Anthropic Claude API 키
  - OpenAI API 키
  - Ollama (로컬 LLM, API 키 불필요)

### 설치

```bash
git clone https://github.com/PracLee/job_hunting_mcp.git
cd job_hunting_mcp
npm install
npm run build
```

### 환경 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 LLM provider를 설정합니다:

```env
# 선택: anthropic | openai | ollama
LLM_PROVIDER=anthropic

# Anthropic 사용 시
ANTHROPIC_API_KEY=sk-ant-xxxxx

# OpenAI 사용 시
OPENAI_API_KEY=sk-xxxxx

# Ollama 사용 시 (API 키 불필요)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3
```

---

## MCP 클라이언트 연결

### Claude Desktop

`claude_desktop_config.json`에 추가:

```json
{
  "mcpServers": {
    "job-hunting": {
      "command": "node",
      "args": ["/절대경로/job_hunting_mcp/dist/index.js"],
      "env": {
        "LLM_PROVIDER": "anthropic",
        "ANTHROPIC_API_KEY": "sk-ant-xxxxx"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add job-hunting node /절대경로/job_hunting_mcp/dist/index.js
```

### 직접 실행 (개발/테스트)

```bash
npm run dev    # tsx로 직접 실행
npm start      # 빌드된 JS 실행
```

---

## Tool 목록

### 채용공고

| Tool | 설명 |
|------|------|
| `jobs_search` | 키워드/조건으로 저장된 공고 검색 |
| `jobs_get_detail` | 특정 공고 상세 조회 |
| `jobs_add` | 공고 텍스트를 복붙하여 수동 등록 |

### 프로필

| Tool | 설명 |
|------|------|
| `profile_parse_resume` | 이력서/경력기술서 → 구조화된 프로필 (기술스택 자동 추출) |
| `profile_get` | 저장된 프로필 조회 |

### 매칭

| Tool | 설명 |
|------|------|
| `match_score_job` | 공고-프로필 적합도 5차원 분석 (기술/경력/업무/도메인/우대) |
| `match_rank_jobs` | 여러 공고를 적합도 순으로 랭킹 |

### 서류

| Tool | 설명 |
|------|------|
| `resume_tailor` | 공고 기준 경력기술서 맞춤화 |
| `resume_export` | 플랫폼별 양식 변환 (원티드/사람인/잡코리아/점핏/로켓펀치) |
| `coverletter_brainstorm` | 자소서 문항별 소재/아이디어 추천 |
| `coverletter_generate` | 자소서 초안 생성 |
| `portfolio_reorder` | 공고 기준 프로젝트 재배치 |

### 지원 관리

| Tool | 설명 |
|------|------|
| `application_create` | 지원 기록 생성 |
| `application_update_status` | 상태 변경 (저장→지원→서류합격→면접→합격/불합격) |
| `application_list` | 지원 현황 목록 + 통계 |

### 면접

| Tool | 설명 |
|------|------|
| `interview_prepare` | 공고+경력 기반 예상 질문/답변 포인트 생성 |

---

## 기술 스택

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **DB**: SQLite (better-sqlite3) — 로컬 파일, 설치 불필요
- **LLM**: Anthropic Claude / OpenAI / Ollama (선택)
- **Validation**: Zod

---

## 프로젝트 구조

```
src/
├── index.ts                 # 진입점
├── server.ts                # MCP 서버 설정
├── tools/                   # Tool 핸들러
│   ├── jobs/                # 채용공고 검색/추가
│   ├── profile/             # 프로필 파싱
│   ├── match/               # 적합도 분석
│   ├── resume/              # 경력기술서 맞춤화 + 양식 변환
│   ├── coverletter/         # 자기소개서
│   ├── portfolio/           # 포트폴리오 정렬
│   ├── application/         # 지원 관리
│   └── interview/           # 면접 준비
├── core/                    # 핵심 라이브러리
│   ├── llm-client.ts        # LLM 추상화 (Anthropic/OpenAI/Ollama)
│   ├── tech-dictionary.ts   # 기술 사전 (80+ 항목, 한국어 동의어)
│   └── utils.ts
├── db/                      # SQLite DB
│   ├── connection.ts
│   └── repositories/
└── types/                   # 타입 정의
```

---

## 설계 원칙

1. **로컬 실행** — 서버 배포 없이 각자 머신에서 실행
2. **LLM 최소 사용** — 매칭/검색은 규칙 기반, LLM은 서류 생성에만 사용
3. **허위 경험 금지** — 기존 경험을 재구성/강조하는 방향으로만 지원
4. **한국 시장 특화** — 한국식 이력서/자소서/채용공고 구조에 맞춤
5. **확장 가능** — 새 채용 사이트, 새 직무 유형 추가 용이

---

## 라이선스

MIT
