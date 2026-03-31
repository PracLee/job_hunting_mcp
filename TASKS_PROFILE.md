# 프로필 파서 고도화 TODO List

본 문서는 `PROFILE_IMPROVEMENT_PLAN.md`의 구조적 한계와 개선안을 기반으로 작성된 **실행 가능한 태스크 체크리스트**입니다. 완료된 항목은 `[x]`로 표시합니다.

---

## 🚀 1단계: 수동 수정 API 및 데이터 모델 확장 (최우선)

파서가 사용자의 수동 교정값을 덮어쓰는(Overwrite) 문제를 막고, 직접 정정할 수 있는 창구를 엽니다.

### 1-1. DB 스키마 수정
- [ ] `user_profiles` 테이블에 `user_confirmed_skills` TEXT 필드 추가
- [ ] `user_profiles` 테이블에 `user_rejected_skills` TEXT 필드 추가
- [ ] 정밀한 경력 저장을 위해 `total_experience_months` 필드 추가 (기존 `total_experience_years`는 유지 또는 자동 계산)

### 1-2. 수동 수정 툴(MCP Tool) 개발
- [ ] `profile_update_skills` 도구 추가: 특정 기술스택 수동 추가 및 삭제 (삭제 시 `user_rejected_skills`로 이동)
- [ ] `profile_update_experience` 도구 추가: 총 경력(연/개월 수) 직접 변경 기능
- [ ] `profile_update_project` 도구 추가: 프로젝트명/역할/기간/사용기술 등 부분 수정 기능
- [ ] 사용자 수정 사항이 반영되었는지 확인하기 위한 MCP 응답 포맷 개선

---

## 🛠️ 2단계: 로드/저장(View/Save) 레이어 분리 및 통제

결과물에 대한 "신뢰도 파악"과 "사용자 검수 단계"를 둡니다.

- [ ] `profile_get` (조회 API): 응답 객체를 `raw_source`, `parsed_structured`, `user_confirmed` 세 가지 계층으로 분리 출력
- [ ] `profile_parse_resume` (저장 API) 내부 로직 변경:
    - [ ] 파싱 전/후의 Tech Stack `diff` (무엇이 추가되고 무엇이 빠졌는지) 결과 반환
    - [ ] `user_rejected_skills`에 있는 기술은 파서가 찾아내도 강제로 무시(Hard Constraint)
    - [ ] `user_confirmed_skills`에 명시된 기술은 파서 결과와 무관하게 무조건 보존

---

## 🧠 3단계: 파싱 엔진(규칙 기반 + LLM) 정밀도 고도화

잘못 추출되는(Hallucination) 현상을 억제하고 파싱 안정성을 올립니다.

- [ ] 프로젝트명(예: Android API)이나 단순 문맥이 기술 스택으로 오인식되지 않도록 방어 (Prompt/규칙 개선)
- [ ] 프로젝트 추출 실패 시(0건) 해당 부분을 날리지 않고 `Fallback 원문`으로 통째로 보존
- [ ] (LLM 호출 시) 각 필드와 기술스택별로 `추출 근거(source_span)` 및 `신뢰도(confidence)` 같이 추출
- [ ] Canonical Skill Taxonomy: 동일 기술의 표기파편화 방지 (예: SpringBoot, spring-boot -> Spring Boot로 통일 저장)

---

## 🛡️ 4단계: 고급 사용자 편의 환경 (Optional)

- [ ] `profile_versions` 테이블 신설어 이전 파싱 결과 캐싱 및 버전 관리
- [ ] `rollback_to_version` 도구 추가: 파싱 결과가 이전보다 나쁠 때를 대비한 롤백 지원
- [ ] `profile_confirm_fields` 도구 추가: 파서가 뽑아준 불확실한 `parsed` 값을 `user_confirmed` 레이어로 완벽 확정 짓는 기능
