# Product Requirements Document: Docs Markdown Editor

**Product Name:** Docs Markdown Editor
**Status:** Draft
**Date Created:** 2026-03-07
**Last Updated:** 2026-03-07
**Version:** 1.3
**License:** MIT

---

## Executive Summary

**One-liner:** 파일시스템의 .md 파일을 Source of Truth로 하여, 사람과 AI Agent가 함께 실시간으로 편집할 수 있는 웹 기반 마크다운 에디터

**Overview:**
현재 시장에는 마크다운 문서를 웹에서 편집할 수 있는 서비스가 다수 존재하지만, "실제 .md 파일을 파일시스템에 저장하면서도 우수한 웹 편집 경험을 제공하고, AI Agent가 직접 문서를 편집할 수 있는" 서비스는 전무하다.

Docs Markdown Editor는 이 세 가지 니즈의 교차점을 공략한다. 파일시스템의 마크다운 파일이 곧 데이터이며, 웹 에디터와 CLI/API를 통해 사람과 AI Agent 모두 동등하게 문서를 편집할 수 있다. 파일이 변경되면 웹에 즉시 반영되고, 웹에서 편집하면 즉시 파일에 저장된다. 특히 문서를 열기만 하거나 변경 없이 저장하는 경우 원본 마크다운이 손상되지 않는 `no-op roundtrip`을 최상위 품질 기준으로 둔다.

**Quick Facts:**
- **Target Users:** AI Agent와 협업하는 개발자/팀, 마크다운 기반 지식 관리 조직
- **Problem Solved:** MD 파일 기반 웹 편집 + AI Agent 협업의 부재
- **Key Metric:** 주간 활성 문서 편집 수 (사람 + AI Agent 합산)
- **Target Launch:** MVP 2026 Q3

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Goals & Objectives](#goals--objectives)
3. [Core Values & Design Principles](#core-values--design-principles)
4. [User Personas](#user-personas)
5. [User Stories & Requirements](#user-stories--requirements)
6. [Success Metrics](#success-metrics)
7. [Scope](#scope)
8. [System Architecture](#system-architecture)
9. [Technical Considerations](#technical-considerations)
10. [Design & UX Requirements](#design--ux-requirements)
11. [Timeline & Milestones](#timeline--milestones)
12. [Risks & Mitigation](#risks--mitigation)
13. [Dependencies & Assumptions](#dependencies--assumptions)
14. [Open Questions](#open-questions)

---

## Problem Statement

### The Problem

마크다운 문서를 계층형 디렉토리 구조로 관리하면서, 웹에서 실시간 편집하고, AI Agent도 동일한 문서를 편집할 수 있는 서비스가 존재하지 않는다.

### Current State

사용자들은 다음과 같은 차선책을 사용하고 있다:

| 방법 | 한계 |
|------|------|
| Obsidian (데스크톱) | 웹 접근 불가, AI Agent 연동 불가 |
| Outline/Notion (웹) | DB에 저장, 실제 .md 파일이 아님 |
| VS Code + Git | 에디터 품질 부족, 비개발자 접근 어려움 |
| SilverBullet (웹) | 단일 사용자, AI API 없음 |
| HackMD (웹) | 디렉토리 구조 없음, 파일 저장 안 함 |

### Impact

**User Impact:**
- AI Agent가 생성한 문서를 사람이 웹에서 바로 확인/편집할 수 없음
- 마크다운 파일 자산이 특정 서비스에 lock-in됨
- 팀원 중 비개발자가 마크다운 문서에 접근하기 어려움

**Business Impact:**
- AI Agent 활용이 확산되면서 "사람+AI 협업 문서 도구" 시장이 급성장 중
- Markdown이 AI Agent의 핵심 인터페이스로 부상 (Cloudflare Markdown for Agents, AGENTS.md 등)

### Why Now?

- 2025-2026년 AI Agent 생태계 폭발적 성장
- Markdown이 AI의 lingua franca로 자리잡음
- MCP(Model Context Protocol) 등 Agent 표준화 진행 중
- 기존 서비스들이 AI Agent 친화적으로 전환하지 못하고 있음

---

## Goals & Objectives

### Business Goals

1. **시장 선점:** "파일시스템 기반 + AI Agent 협업" 마크다운 에디터 카테고리의 최초 진입자
2. **개발자 커뮤니티 확보:** 오픈소스 또는 freemium으로 초기 사용자 확보
3. **확장성 확보:** self-hosted 우선으로 빠르게 배포하고, 이후 동기화/공유 계층으로 확장 가능한 구조 확보

### User Goals

1. **사람:** 웹 브라우저에서 Obsidian 수준의 마크다운 편집 경험
2. **AI Agent:** CLI/API로 마크다운 문서를 자유롭게 CRUD
3. **팀:** 사람과 AI Agent의 편집이 실시간으로 동기화되어 끊김 없는 협업

### Non-Goals

- 완전한 노션/Confluence 대체 (프로젝트 관리, 데이터베이스 뷰 등은 제외)
- 이미지/동영상 등 미디어 에디팅 기능
- 자체 AI 모델 탑재 (외부 AI Agent가 API/CLI로 연동하는 구조)
- 모바일 네이티브 앱 (웹 반응형으로 우선 대응)

---

## Core Values & Design Principles

### 핵심 가치 (우선순위 순)

#### 1. File-First: .md 파일이 곧 데이터

> "데이터베이스 없이, 파일시스템이 Source of Truth"

- 모든 문서는 파일시스템의 `.md` 파일로 저장
- 파일 경로 = 문서 URL 경로 (예: `docs/guide/intro.md` → `/docs/guide/intro`)
- `.md` 파일을 직접 열어도 완전한 문서 (메타데이터 의존 최소화)
- 다른 도구(VS Code, vim, cat 등)로 파일을 편집해도 정상 동작
- 문서 데이터의 lock-in 제로
- 문서를 열고 저장만 했을 때 원본 마크다운이 변형되지 않아야 함 (`no-op roundtrip`)

#### 2. Agent-Native: AI Agent가 1등 시민

> "사람의 편집과 Agent의 편집에 차이가 없다"

- **CLI 도구:** `docs edit`, `docs create`, `docs search` 등의 커맨드
- **REST API:** 모든 기능을 API로 제공
- **MCP Server:** Model Context Protocol 지원으로 AI Agent 네이티브 연동 (MVP 후반 포함)
- **파일 직접 편집:** Agent가 파일시스템에서 직접 .md 파일을 편집해도 즉시 반영
- 충돌 감지 및 자동 해결 메커니즘

#### 3. Real-time Sync: 편집 즉시 반영

> "저장 버튼이 필요 없는 실시간 동기화"

- 웹에서 편집 → 즉시 파일시스템에 저장 (debounce 300ms)
- 파일시스템 변경 → 즉시 웹에 반영 (fs watch)
- 다중 사용자/Agent 동시 편집 시 충돌 해결 (CRDT 기반, Phase 2)
- 오프라인 편집 후 복귀 시 자동 동기화

### 설계 원칙

| 원칙 | 설명 |
|------|------|
| **Transparency** | 파일 구조가 곧 서비스 구조. 숨겨진 메타데이터 최소화 |
| **Interoperability** | 기존 .md 파일을 그대로 가져올 수 있음. 이식성 100% |
| **Simplicity** | 설치 한 줄, 설정 없이 바로 시작 |
| **Extensibility** | 플러그인/훅 시스템으로 커스터마이징 가능 |
| **Raw Markdown Primacy** | 에디터 내부 모델보다 raw markdown이 우선. 변환 불확실 시 raw 모드가 우선권을 가짐 |

---

## User Personas

### Persona 1: 개발자 "민수" (Primary)

**Demographics:**
- 30대, 백엔드 개발자
- 기술 숙련도: 높음
- AI Agent (Claude, GPT)를 일상적으로 사용

**Behaviors:**
- 프로젝트 문서를 마크다운으로 관리
- AI Agent에게 문서 초안 작성을 맡기고, 직접 리뷰/수정
- git으로 문서 버전 관리

**Needs & Motivations:**
- AI Agent가 작성한 문서를 웹에서 바로 확인하고 편집하고 싶음
- 파일로 저장되어야 git으로 버전 관리 가능
- CLI로 빠르게 문서 조작 가능해야 함

**Pain Points:**
- AI Agent가 생성한 .md 파일을 보려면 VS Code를 열어야 함
- 팀원에게 공유하려면 별도 과정 필요
- Notion에 옮기면 원본 .md 파일과 동기화가 안 됨

**Quote:** _"AI가 문서를 써주면 바로 웹에서 팀이랑 같이 보고 수정하고 싶은데, 그런 도구가 없어요"_

### Persona 2: AI Agent "Claude" (Primary)

**특성:**
- Claude, GPT 등 LLM 기반 AI Agent
- CLI 명령어 또는 API 호출로 동작
- 파일시스템 접근 가능 (Claude Code 등)

**Behaviors:**
- 사용자 지시에 따라 문서 생성, 수정, 구조화
- 여러 문서를 한번에 생성하거나 대량 편집
- 문서 간 링크 생성, 목차 자동 업데이트

**Needs & Motivations:**
- 표준 파일시스템 I/O로 문서 편집 (특별한 API 학습 불필요)
- 편집 결과가 즉시 사람에게 보여야 함
- 기존 문서의 구조와 컨텍스트를 파악할 수 있어야 함

**Pain Points:**
- 웹 서비스 API가 복잡하거나 문서화가 부족
- DB 기반 서비스는 파일 직접 편집이 불가능
- 편집 후 결과를 확인하려면 사람이 별도로 확인해야 함

### Persona 3: 팀 리드 "지영" (Secondary)

**Demographics:**
- 40대, 프로젝트 매니저
- 기술 숙련도: 중간
- 마크다운 기본 문법은 알지만 CLI는 불편

**Behaviors:**
- 팀 위키/문서를 관리
- 회의록, 의사결정 문서를 작성
- 팀원과 AI Agent가 작성한 문서를 리뷰

**Needs & Motivations:**
- 웹 브라우저에서 편하게 문서를 보고 편집
- WYSIWYG 모드로 마크다운을 몰라도 편집 가능
- 문서 검색이 빠르게 되어야 함

**Pain Points:**
- Git/CLI에 익숙하지 않음
- 기존 위키 도구는 AI Agent 연동이 안 됨
- 파일이 여기저기 흩어져 있어 찾기 어려움

**Quote:** _"개발팀이 마크다운으로 문서 관리하는 건 좋은데, 저는 웹에서 편하게 보고 수정하고 싶어요"_

---

## User Stories & Requirements

### Epic 1: File-First 문서 관리

#### Must-Have (P0)

##### Story 1.1: 디렉토리 기반 문서 탐색

```
As a 웹 사용자,
I want to 파일시스템의 디렉토리 구조를 사이드바에서 탐색할 수 있도록,
So that 계층적으로 정리된 문서를 직관적으로 찾을 수 있다.
```

**Acceptance Criteria:**
- [ ] 사이드바에 디렉토리 트리가 표시되며, 폴더 펼침/접기 가능
- [ ] 파일시스템의 실제 디렉토리 구조와 1:1 매핑
- [ ] .md 파일만 문서로 표시, 다른 파일은 비표시 (설정 가능)
- [ ] 드래그앤드롭으로 파일/폴더 이동 가능 (실제 파일시스템에 반영)
- [ ] 새 파일/폴더 생성, 이름 변경, 삭제 가능

**Priority:** P0
**Effort:** M

---

##### Story 1.2: 마크다운 파일 직접 저장

```
As a 웹 에디터 사용자,
I want to 편집한 내용이 .md 파일로 직접 저장되도록,
So that 파일시스템이 항상 최신 상태를 유지한다.
```

**Acceptance Criteria:**
- [ ] 웹에서 편집 시 300ms debounce 후 파일시스템에 자동 저장
- [ ] 저장된 파일은 표준 마크다운 형식 + YAML frontmatter
- [ ] 문서 생성 시 템플릿 기반으로 frontmatter 삽입 가능 (기본값은 title, tags, date)
- [ ] 파일 인코딩: UTF-8
- [ ] 저장 상태 표시: "저장됨" / "저장 중..." / "충돌 감지"
- [ ] 문서를 열고 저장만 했을 때 원본 마크다운이 변형되지 않음 (`no-op roundtrip`)

**Priority:** P0
**Effort:** S

---

##### Story 1.3: 외부 편집 감지 및 반영

```
As a 사용자,
I want to 외부 도구(VS Code, vim, AI Agent)로 .md 파일을 편집하면 웹에 즉시 반영되도록,
So that 어떤 도구로 편집하든 웹에서 최신 상태를 볼 수 있다.
```

**Acceptance Criteria:**
- [ ] 파일시스템 watcher가 .md 파일 변경을 500ms 이내에 감지
- [ ] 변경 감지 시 웹 에디터에 실시간 반영 (WebSocket)
- [ ] 사용자가 웹에서 편집 중인 파일이 외부에서 변경된 경우, 충돌 알림 표시
- [ ] 새 파일 생성/삭제도 실시간 감지하여 사이드바 업데이트
- [ ] 대량 파일 변경 시 (git checkout 등) 성능 저하 없이 처리

**Priority:** P0
**Effort:** L

---

### Epic 2: AI Agent 네이티브 연동

#### Must-Have (P0)

##### Story 2.1: CLI 도구

```
As a AI Agent (또는 개발자),
I want to CLI 명령어로 문서를 생성, 읽기, 수정, 삭제할 수 있도록,
So that 터미널/스크립트에서 문서를 자유롭게 조작할 수 있다.
```

**Acceptance Criteria:**
- [ ] `docs create <path> [--content <content>]` - 문서 생성
- [ ] `docs read <path>` - 문서 내용 출력
- [ ] `docs edit <path> --content <content>` - 문서 수정 (전체 또는 부분)
- [ ] `docs delete <path>` - 문서 삭제
- [ ] `docs list [<directory>]` - 문서 목록 출력
- [ ] `docs search <query>` - 전문 검색
- [ ] `docs move <source> <target>` - 문서 이동
- [ ] 모든 명령어는 JSON 출력 모드 지원 (`--json`)
- [ ] stdin으로 content 입력 가능 (`echo "# Title" | docs create path.md`)

**Priority:** P0
**Effort:** M

---

##### Story 2.2: REST API

```
As a AI Agent 또는 외부 시스템,
I want to REST API로 모든 문서 작업을 수행할 수 있도록,
So that 어떤 프로그래밍 언어/환경에서든 연동 가능하다.
```

**Acceptance Criteria:**
- [ ] `GET /api/docs/:path` - 문서 조회 (content + metadata)
- [ ] `PUT /api/docs/:path` - 문서 생성/수정
- [ ] `DELETE /api/docs/:path` - 문서 삭제
- [ ] `GET /api/docs/` - 디렉토리 트리 조회
- [ ] `POST /api/search` - 전문 검색
- [ ] `PATCH /api/docs/:path` - 문서 업데이트 (content 전체 교체 또는 명시적 frontmatter 편집)
- [ ] 웹 세션 인증 지원
- [ ] 사용자별 개인 액세스 토큰(PAT) 지원 (CLI/API/MCP)
- [ ] Rate limiting (설정 가능)
- [ ] OpenAPI/Swagger 문서 자동 생성

**Priority:** P0
**Effort:** M

---

##### Story 2.3: MCP (Model Context Protocol) Server

```
As a AI Agent (Claude 등),
I want to MCP 프로토콜로 문서 서비스에 연결할 수 있도록,
So that 별도 API 학습 없이 AI Agent 표준으로 바로 연동된다.
```

**Acceptance Criteria:**
- [ ] MCP Tool 제공: `read_document`, `write_document`, `search_documents`, `list_documents`
- [ ] MCP Resource 제공: 문서 트리를 리소스로 노출
- [ ] Claude Desktop, Claude Code 등에서 바로 사용 가능
- [ ] 문서 변경 시 MCP Notification 발송

**Priority:** P0
**Effort:** M

---

##### Story 2.4: 파일시스템 직접 편집 지원

```
As a AI Agent (Claude Code 등),
I want to 파일시스템에서 직접 .md 파일을 편집하면 서비스가 자동으로 인식하도록,
So that 별도 API 호출 없이도 기존 파일 편집 방식 그대로 사용할 수 있다.
```

**Acceptance Criteria:**
- [ ] Agent가 fs write로 파일을 수정하면 서비스가 자동 감지
- [ ] 감지된 변경은 웹에 실시간 반영
- [ ] 검색 인덱스도 자동 업데이트
- [ ] 대량 파일 생성(수십~수백 개)도 안정적으로 처리

**Priority:** P0
**Effort:** S (Story 1.3과 공유)

---

##### Story 2.5: 인증 및 편집자 식별

```
As a 관리자 또는 팀,
I want to 로컬 계정과 외부 인증 제공자를 통해 사용자 인증을 구성할 수 있도록,
So that 웹, API, CLI, MCP의 편집 주체를 안전하게 식별하고 추적할 수 있다.
```

**Acceptance Criteria:**
- [ ] 자체 ID/PW 기반 로컬 로그인 지원
- [ ] OIDC 로그인 지원 (Authentik 호환)
- [ ] 웹은 세션 기반 로그인 유지
- [ ] CLI/API/MCP는 사용자별 개인 액세스 토큰(PAT) 사용
- [ ] 편집 이벤트는 서비스 메타데이터에 사용자 ID와 provider를 기록
- [ ] 문서 파일 자체는 인증 정보 때문에 자동 변형되지 않음

**Priority:** P0
**Effort:** M

---

### Epic 3: 웹 에디터

#### Must-Have (P0)

##### Story 3.1: WYSIWYG 마크다운 에디터

```
As a 웹 사용자,
I want to Obsidian/Outline 수준의 마크다운 WYSIWYG 에디터를 사용할 수 있도록,
So that 마크다운 문법을 몰라도 편하게 문서를 작성할 수 있다.
```

**Acceptance Criteria:**
- [ ] 실시간 WYSIWYG 렌더링 (타이핑하면서 바로 서식 반영)
- [ ] 슬래시 커맨드(`/`) 메뉴로 빠른 블록 삽입
- [ ] 지원 블록: 헤딩, 리스트, 체크박스, 코드블록, 인용, 테이블, 구분선, 이미지
- [ ] 코드 블록 구문 강조 (100+ 언어)
- [ ] 테이블 시각적 편집 (행/열 추가/삭제)
- [ ] Raw Markdown 모드와 WYSIWYG 모드 전환
- [ ] 키보드 단축키 (Ctrl+B, Ctrl+I 등 표준)
- [ ] 드래그앤드롭 이미지 업로드 (assets 폴더에 저장)
- [ ] 구조 보존이 불확실한 마크다운은 Raw 모드로 안전하게 우회 가능

**Priority:** P0
**Effort:** XL

---

##### Story 3.2: 실시간 동시 편집

```
As a 팀원,
I want to 다른 팀원 또는 AI Agent와 같은 문서를 동시에 편집할 수 있도록,
So that 편집 충돌 없이 실시간으로 협업할 수 있다.
```

**Acceptance Criteria:**
- [ ] 다중 커서 표시 (각 사용자별 색상)
- [ ] CRDT 기반 충돌 해결 (동시 편집 시 데이터 손실 없음)
- [ ] 편집자 목록 표시 (현재 문서를 보고 있는 사람)
- [ ] AI Agent의 편집도 실시간 반영 및 커서 표시
- [ ] 네트워크 지연 시 로컬 편집 우선, 이후 동기화

**Priority:** P1
**Effort:** XL
**Target Phase:** Phase 2

---

##### Story 3.3: 빠른 전문 검색

```
As a 사용자,
I want to 모든 문서의 내용을 빠르게 검색할 수 있도록,
So that 원하는 정보를 즉시 찾을 수 있다.
```

**Acceptance Criteria:**
- [ ] 전문 검색 (문서 제목 + 본문 내용)
- [ ] 검색 결과 200ms 이내 응답 (1만 개 문서 기준)
- [ ] 검색어 하이라이팅
- [ ] 파일명/경로 기반 빠른 이동 (Cmd+P / Ctrl+P)
- [ ] 최근 편집 문서 빠른 접근
- [ ] 태그 검색 (frontmatter의 tags 필드)
- [ ] CLI에서도 동일한 검색 기능 (`docs search <query>`)

**Priority:** P0
**Effort:** L

---

#### Should-Have (P1)

##### Story 3.4: 문서 간 링크 및 백링크

```
As a 지식 관리자,
I want to 문서 간 링크를 쉽게 만들고 백링크를 확인할 수 있도록,
So that 문서 간 관계를 파악하고 지식 그래프를 구축할 수 있다.
```

**Acceptance Criteria:**
- [ ] `[[문서명]]` 위키링크 문법 지원
- [ ] 링크 입력 시 자동완성 (문서 이름 검색)
- [ ] 각 문서 하단에 백링크 목록 표시
- [ ] 링크된 문서를 이동/이름 변경 시 링크 자동 업데이트

**Priority:** P1
**Effort:** M

---

##### Story 3.5: 버전 히스토리

```
As a 사용자,
I want to 문서의 편집 히스토리를 확인하고 이전 버전으로 복원할 수 있도록,
So that 실수로 내용을 잃어버려도 복구할 수 있다.
```

**Acceptance Criteria:**
- [ ] 자동 버전 스냅샷 (편집 세션 단위)
- [ ] Git 기반 버전 관리 (선택적, .git 폴더가 있는 경우)
- [ ] 버전 간 diff 뷰어
- [ ] 특정 버전으로 복원

**Priority:** P1
**Effort:** M

---

#### Must-Have (P0) - Frontmatter & Templates

##### Story 3.6: Frontmatter 템플릿 + 명시적 메타데이터 편집

```
As a 사용자,
I want to 문서 생성 시 템플릿 기반 frontmatter를 사용할 수 있고, 메타데이터는 명시적으로만 수정되도록,
So that 메타데이터는 관리하면서도 raw markdown 원문은 손상시키지 않을 수 있다.
```

**Acceptance Criteria:**
- [ ] 문서 생성 시 기본 frontmatter 삽입 가능:
  ```yaml
  ---
  title: 문서 제목
  tags: []
  date: 2026-03-07
  ---
  ```
- [ ] 일반 본문 저장 시 frontmatter가 자동으로 다시 쓰이지 않음
- [ ] UI의 메타데이터 편집은 명시적 사용자 액션일 때만 수행
- [ ] frontmatter가 없는 기존 .md 파일도 정상 동작 (강제 삽입 안 함)
- [ ] 서비스 전용 편집자 정보는 `.md` 파일이 아니라 서비스 메타데이터에 기록
- [ ] 구조화된 편집으로 안전하게 보존할 수 없는 frontmatter는 Raw 모드에서 직접 수정

**Priority:** P0
**Effort:** M

---

##### Story 3.7: 문서 생성 템플릿

```
As a 팀 리드,
I want to 자주 사용하는 문서 양식을 템플릿으로 저장하고 빠르게 생성할 수 있도록,
So that 일관된 형식의 문서를 효율적으로 만들 수 있다.
```

**Acceptance Criteria:**
- [ ] `.docs/templates/` 디렉토리에 템플릿 .md 파일 저장
- [ ] 기본 템플릿 제공: default.md, meeting-note.md, tech-spec.md
- [ ] 문서 생성 시 템플릿 선택 UI (웹) / `--template` 옵션 (CLI)
- [ ] 템플릿에 frontmatter 기본값 포함 가능
- [ ] 변수 치환 지원: `{{date}}`, `{{title}}`, `{{author}}`

**Priority:** P0
**Effort:** M

##### Story 3.7: Mermaid/PlantUML 다이어그램 렌더링

```
As a 개발자,
I want to 마크다운 코드 블록의 다이어그램 문법이 시각적으로 렌더링되도록,
So that 별도 도구 없이 다이어그램을 문서에 포함할 수 있다.
```

**Priority:** P2
**Effort:** S

---

### Functional Requirements Summary

| Req ID | Description | Priority | Status |
|--------|-------------|----------|--------|
| FR-001 | 파일시스템 기반 .md 파일 저장/읽기 | P0 | Open |
| FR-002 | 계층형 디렉토리 탐색 (사이드바) | P0 | Open |
| FR-003 | 실시간 파일 변경 감지 및 웹 반영 | P0 | Open |
| FR-004 | WYSIWYG 마크다운 에디터 | P0 | Open |
| FR-005 | Raw Markdown 편집 모드 | P0 | Open |
| FR-006 | 실시간 동시 편집 (CRDT) | P1 | Open |
| FR-007 | CLI 도구 (CRUD + 검색) | P0 | Open |
| FR-008 | REST API (CRUD + 검색) | P0 | Open |
| FR-009 | MCP Server | P0 | Open |
| FR-010 | 전문 검색 | P0 | Open |
| FR-011 | 위키링크 및 백링크 | P1 | Open |
| FR-012 | 버전 히스토리 | P1 | Open |
| FR-013 | Frontmatter 템플릿 + 명시적 메타데이터 편집 | P0 | Open |
| FR-014 | 문서 생성 템플릿 (`.docs/templates/`) | P0 | Open |
| FR-015 | 이미지 업로드 → `.assets/` 저장 + 링크 삽입 | P0 | Open |
| FR-016 | 다이어그램 렌더링 | P2 | Open |
| FR-017 | 로컬 로그인 + OIDC(Authentik 호환) 인증 | P0 | Open |

### Non-Functional Requirements

| Req ID | Category | Description | Target |
|--------|----------|-------------|--------|
| NFR-001 | Performance | 검색 응답 시간 | < 200ms (1만 문서) |
| NFR-002 | Performance | 파일 변경 감지 → 웹 반영 | < 500ms |
| NFR-003 | Performance | 에디터 초기 로딩 | < 2초 |
| NFR-004 | Performance | 대용량 파일 편집 | 10MB .md 파일도 원활 |
| NFR-005 | Scalability | 동시 편집자 수 | 50명/문서 (Phase 2 목표) |
| NFR-006 | Scalability | 총 문서 수 | 10만 개 |
| NFR-007 | Reliability | 데이터 무결성 | 편집 내용 손실 제로 |
| NFR-008 | Security | 사용자 인증 | 로컬 ID/PW + OIDC(Authentik 호환) |
| NFR-009 | Security | 파일 접근 범위 | 지정된 workspace 외부 접근 차단 |
| NFR-010 | Compatibility | 브라우저 | Chrome, Firefox, Safari, Edge 최신 2버전 |
| NFR-011 | Integrity | No-op roundtrip | 변경 없이 열고 저장한 문서는 원문 그대로 유지 |

---

## Success Metrics

### North Star Metric

**Metric:** 주간 활성 편집 문서 수 (Weekly Active Edited Documents)
**Definition:** 1주일 동안 사람 또는 AI Agent에 의해 1회 이상 편집된 고유 문서 수
**Why:** 사람과 AI가 함께 문서를 활발히 편집하는 것이 이 서비스의 핵심 가치

### HEART Framework

| Dimension | Goals | Signals | Metrics | Target |
|-----------|-------|---------|---------|--------|
| **Happiness** | 편집 경험 만족 | 피드백, NPS | NPS Score | > 50 |
| **Engagement** | 빈번한 문서 편집 | 일별 편집 수 | DAU/MAU ratio | > 30% |
| **Adoption** | AI Agent 연동 활성화 | API/CLI 사용 | Agent 편집 비율 | > 20% of total edits |
| **Retention** | 지속적 사용 | 주간 복귀율 | Week 4 retention | > 40% |
| **Task Success** | 검색 성공 | 검색 후 문서 열기 | 검색 성공률 | > 80% |

### Key Metric Breakdown

| Category | Metric | Target (Launch +3개월) |
|----------|--------|----------------------|
| **편집** | 주간 활성 편집 문서 수 | 500+ |
| **Agent** | API/CLI 통한 편집 비율 | 전체 편집의 20%+ |
| **성능** | 검색 응답 p95 | < 200ms |
| **성능** | 파일 동기화 지연 p95 | < 500ms |
| **안정성** | 편집 내용 손실 건수 | 0 |
| **성장** | Self-hosted 설치 수 | 100+ |

---

## Scope

### Phase 1: MVP (8주)

**핵심:** 파일 기반 웹 편집 + AI Agent CLI/API/MCP

- 파일시스템 기반 .md 파일 읽기/쓰기
- 계층형 디렉토리 사이드바
- WYSIWYG 마크다운 에디터 (Tiptap v3 기반)
- Raw Markdown 모드 전환
- no-op roundtrip 보장 (변경 없는 문서는 원문 유지)
- 실시간 파일 변경 감지 및 웹 반영
- CLI 도구 (create, read, edit, delete, list, search)
- REST API (CRUD + 검색)
- MCP Server (문서 CRUD/Search의 thin adapter)
- 기본 전문 검색 + 한글/CJK fallback 검색
- Frontmatter 템플릿 + 명시적 메타데이터 편집
- 이미지 업로드 → `.assets/` 전역 디렉토리 저장
- 로컬 로그인 + OIDC 로그인 (Authentik 호환)
- 웹 세션 인증 + PAT 기반 CLI/API/MCP 인증 + rate limiting
- 단일 사용자 모드

### Phase 2: Collaboration (6주)

**핵심:** 멀티 유저 + AI Agent 동시 편집

- CRDT 기반 실시간 동시 편집
- 다중 커서 표시
- 사용자 인증 (JWT)
- 위키링크 및 백링크
- 검색 성능 최적화 (인덱싱)

### Phase 3: Polish (4주)

**핵심:** 완성도 + 확장성

- 버전 히스토리 (Git 연동)
- 다이어그램 렌더링
- 플러그인 시스템 기초
- Docker 이미지 배포
- 문서화 및 온보딩 가이드

### Out of Scope

| 항목 | 이유 |
|------|------|
| 모바일 네이티브 앱 | 웹 반응형으로 우선 대응 |
| 자체 AI 모델 탑재 | 외부 Agent 연동 방식이 핵심 가치 |
| 프로젝트 관리 기능 | 문서 편집에 집중 |
| 데이터베이스 뷰 (Notion 스타일) | 마크다운 파일의 단순성 유지 |
| 파일 암호화 | 파일시스템 레벨에서 처리 |
| 실시간 음성/화상 협업 | 문서 편집 도구의 범위 초과 |
| 클라우드 SaaS 호스팅 | Self-hosted only. 클라우드 고려 안 함 |

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Clients                           │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Web App  │  │   CLI    │  │  AI Agent         │  │
│  │ (Browser)│  │          │  │ (Claude/GPT/etc)  │  │
│  └────┬─────┘  └────┬─────┘  └──┬────────────┬───┘  │
│       │              │           │            │      │
│       │ WebSocket    │ REST API  │ REST API   │ File │
│       │ + HTTP       │           │ + MCP      │  I/O │
└───────┼──────────────┼───────────┼────────────┼──────┘
        │              │           │            │
┌───────▼──────────────▼───────────▼────────────│──────┐
│                  Server                       │      │
│  ┌─────────────────────────────────────────┐  │      │
│  │            API Layer                     │  │      │
│  │  REST API  │  WebSocket  │  MCP Server   │  │      │
│  └─────────────────┬───────────────────────┘  │      │
│                    │                          │      │
│  ┌─────────────────▼───────────────────────┐  │      │
│  │           Core Services                  │  │      │
│  │  ┌────────────┐  ┌───────────────────┐  │  │      │
│  │  │ Document   │  │ Collaboration     │  │  │      │
│  │  │ Service    │  │ Service (CRDT,    │  │  │      │
│  │  │            │  │  Phase 2)         │  │  │      │
│  │  └────────────┘  └───────────────────┘  │  │      │
│  │  ┌────────────┐  ┌───────────────────┐  │  │      │
│  │  │ Search     │  │ File Watcher      │  │  │      │
│  │  │ Service    │  │ Service           │  │  │      │
│  │  └────────────┘  └───────────────────┘  │  │      │
│  └─────────────────────────────────────────┘  │      │
│                    │                          │      │
└────────────────────┼──────────────────────────┘      │
                     │                                 │
              ┌──────▼─────────────────────────────────▼──┐
              │          File System (Source of Truth)      │
              │                                            │
              │  workspace/                                │
              │  ├── docs/                                 │
              │  │   ├── guide/                            │
              │  │   │   ├── intro.md                      │
              │  │   │   └── setup.md                      │
              │  │   └── api/                              │
              │  │       └── reference.md                  │
              │  ├── notes/                                │
              │  │   └── meeting-2026-03.md                │
              │  ├── .assets/              (전역 assets)    │
              │  │   ├── docs/guide/intro/                 │
              │  │   │   ├── screenshot.png                │
              │  │   │   └── diagram.svg                   │
              │  │   └── notes/meeting-2026-03/            │
              │  │       └── photo.png                     │
              │  └── .docs/                                │
              │      ├── search-index/  (검색 인덱스)       │
              │      └── config.yaml    (서비스 설정)       │
              └────────────────────────────────────────────┘
```

### Data Flow

**사람이 웹에서 편집할 때 (Phase 1):**
```
Browser → HTTP/WS save trigger → File System write → fs event (무시, 자체 변경)
```

**AI Agent가 파일을 직접 편집할 때 (Phase 1):**
```
Agent → File System write → fs watcher 감지 → WebSocket → Browser 반영
```

**AI Agent가 API로 편집할 때 (Phase 1):**
```
Agent → REST API/MCP → File System write + WebSocket → Browser 반영
```

**동시 편집이 추가될 때 (Phase 2):**
```
Browser/Agent → Yjs/CRDT merge → File System flush + WebSocket awareness sync
```

---

## Technical Considerations

### Technology Stack (권장)

**Frontend:**
- React 19 + Vite
- Tiptap v3 (ProseMirror 기반 WYSIWYG 에디터)
- Tailwind CSS
- Yjs는 Phase 2 협업 기능에서만 사용
- Raw 모드를 항상 source-of-truth escape hatch로 유지

**Backend:**
- Bun runtime
- Hono (경량 고성능 HTTP 프레임워크)
- chokidar (파일시스템 watching)
- MCP SDK
- 로컬 계정 + OIDC(Authentik 호환) 인증 서비스
- Yjs server (y-websocket)는 Phase 2에서 도입

**Search:**
- FlexSearch 기반 전문 검색
- 한글/CJK는 n-gram fallback 검색 경로 추가
- Phase 2에서 필요 시 Meilisearch 또는 전용 형태소 검색으로 교체

**CLI:**
- Bun + Commander.js 기반

**Infrastructure:**
- 단일 바이너리 배포 목표 (`bun build --compile`)
- Docker 이미지
- 설정 파일: `.docs/config.yaml`

### API Design

```
# Document CRUD
GET    /api/docs/:path          # 문서 조회
PUT    /api/docs/:path          # 문서 생성/수정
PATCH  /api/docs/:path          # content 교체 또는 명시적 frontmatter 편집
DELETE /api/docs/:path          # 문서 삭제

# Directory
GET    /api/tree                # 전체 디렉토리 트리
GET    /api/tree/:path          # 하위 디렉토리 트리

# Search
POST   /api/search              # 전문 검색
  body: { "query": "...", "path": "...", "limit": 20 }

# WebSocket
WS     /ws/doc/:path            # 실시간 편집 동기화
WS     /ws/tree                 # 파일 트리 변경 알림

# MCP
POST   /mcp                     # MCP JSON-RPC endpoint

# Auth
POST   /auth/login              # 로컬 ID/PW 로그인
GET    /auth/oidc/:provider     # OIDC 로그인 시작
GET    /auth/callback/:provider # OIDC 콜백
POST   /auth/tokens             # PAT 발급/회수
```

### Security Requirements

- **Workspace Sandboxing:** 지정된 workspace 디렉토리 외부 접근 완전 차단
- **Path Traversal 방지:** `../` 등의 경로 조작 방어
- **User Authentication:** 로컬 ID/PW + OIDC(Authentik 호환)
- **Token Model:** 웹은 세션, CLI/API/MCP는 PAT 사용
- **Rate Limiting:** API 호출 제한 (설정 가능, 기본 100 req/min)
- **CORS:** 설정 가능한 CORS 정책

### Performance Requirements

| 항목 | Target | 측정 조건 |
|------|--------|----------|
| 에디터 초기 로딩 | < 2초 | 100KB .md 파일 |
| 파일 저장 (웹 → fs) | < 300ms | debounce 포함 |
| 파일 변경 감지 (fs → 웹) | < 500ms | chokidar 이벤트 |
| 검색 응답 | < 200ms | 1만 문서, p95 |
| 디렉토리 트리 로딩 | < 1초 | 1만 파일 |
| 동시 편집 동기화 | < 100ms | 같은 서버 내 |

---

## Design & UX Requirements

### User Experience Principles

1. **Invisible Infrastructure:** 파일시스템이라는 인프라는 사용자에게 투명해야 함
2. **Keyboard-First:** 모든 주요 동작은 키보드로 가능해야 함
3. **Progressive Disclosure:** 기본은 단순하게, 고급 기능은 필요할 때 노출
4. **Instant Feedback:** 모든 동작에 즉각적인 피드백 (저장 상태, 동기화 상태)

### Key Screens

**1. 메인 에디터 뷰:**
```
┌──────────────────────────────────────────────────┐
│ [Logo] Docs    [Search: Cmd+P]    [👤 Users] [⚙] │
├──────────┬───────────────────────────────────────┤
│          │ docs / guide / intro.md    [Raw] [📋] │
│ 📁 docs  │─────────────────────────────────────── │
│  📁 guide│ # Introduction                        │
│   📄intro│                                       │
│   📄setup│ Welcome to the documentation.         │
│  📁 api  │                                       │
│   📄ref  │ ## Getting Started                    │
│ 📁 notes │                                       │
│   📄mtg  │ To get started, run:                  │
│          │ ```bash                               │
│          │ npx docs-md init                      │
│          │ ```                                   │
│          │                                       │
│          │ > This will create a new workspace.   │
│          │                                       │
│          │───────────────────────────────────────│
│          │ Backlinks: setup.md, reference.md     │
└──────────┴───────────────────────────────────────┘
```

**2. 검색 모달 (Cmd+P):**
```
┌─────────────────────────────────────┐
│ 🔍 Search documents...              │
├─────────────────────────────────────┤
│ 📄 intro.md        docs/guide/      │
│    ...welcome to the documentation  │
│ 📄 setup.md        docs/guide/      │
│    ...getting started with setup    │
│ 📄 reference.md    docs/api/        │
│    ...API reference documentation   │
└─────────────────────────────────────┘
```

### Interaction Patterns

- **슬래시 커맨드:** `/` 입력 시 블록 타입 선택 메뉴
- **Cmd+P:** 문서 빠른 이동
- **Cmd+S:** 수동 저장 (자동 저장이 기본이지만 습관 지원)
- **Cmd+Shift+F:** 전역 검색
- **드래그앤드롭:** 사이드바에서 파일/폴더 이동, 에디터에 이미지 드롭 → `.assets/{문서경로}/{문서명}/` 하위에 저장, 문서에 링크 삽입

### Accessibility

- WCAG 2.1 Level AA
- 키보드 내비게이션 완전 지원
- 스크린 리더 호환
- 다크/라이트 테마

---

## Timeline & Milestones

| Phase | Deliverables | Duration |
|-------|-------------|----------|
| **Phase 1: MVP** | 파일 기반 편집 + CLI/API + 검색 (단일 사용자) | 8주 |
| **Phase 2: Collaboration** | 동시 편집 + 인증 + MCP + 백링크 | 6주 |
| **Phase 3: Polish** | 버전관리 + 템플릿 + Docker + 문서화 | 4주 |

### Phase 1 세부

| Week | Milestone |
|------|-----------|
| 1-2 | 프로젝트 셋업, 파일 I/O 코어, 디렉토리 트리 API |
| 3-4 | 웹 에디터 (Tiptap 통합), 실시간 파일 동기화 |
| 5-6 | CLI 도구, REST API, 기본 검색 |
| 7-8 | 통합 테스트, 버그 수정, MVP 릴리스 |

---

## Risks & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|------------|------------|
| CRDT + 파일시스템 동기화 복잡성 | High | High | Phase 1은 단일 사용자로 시작, CRDT는 Phase 2 |
| 대량 파일 변경 시 성능 저하 | Medium | Medium | 파일 watcher debounce, 배치 처리, 인덱싱 최적화 |
| Tiptap ↔ Markdown 변환 품질 | High | High | no-op roundtrip golden 테스트, 지원 불완전 구문은 Raw 모드 우선 |
| 파일 충돌 (동시 편집) | High | Medium | CRDT 기반 충돌 해결, 충돌 시 양쪽 보존 |
| Path traversal 보안 취약점 | High | Low | 경로 정규화 + 화이트리스트 방식 접근 제어 |
| 구조화된 frontmatter 편집이 YAML 포맷을 변형할 위험 | High | High | 일반 저장에서는 frontmatter 미변경, 구조화 편집은 명시적 액션으로 제한 |
| 에디터 라이브러리 한계 | Medium | Medium | roundtrip 보존 불가 구문은 Raw 모드 fallback, 필요 시 커스텀 변환 레이어 보강 |

---

## Dependencies & Assumptions

### Dependencies

**Internal:**
- [ ] Tiptap v3 안정성 검증 + Markdown roundtrip PoC (Week 1)
- [ ] Yjs CRDT 라이브러리 파일시스템 동기화 PoC (Phase 2 진입 전)
- [ ] Markdown ↔ ProseMirror 변환 품질 검증
- [ ] no-op roundtrip golden file 테스트셋 구축
- [ ] 로컬 로그인 + OIDC(Authentik) PoC

**External:**
- [ ] MCP 프로토콜 사양 안정화 (현재 진행 중)
- [ ] Bun + chokidar의 OS별 안정성

### Assumptions

- 사용자는 서버가 실행되는 머신에 파일시스템 접근 권한이 있음
- 초기 타겟은 self-hosted (로컬 또는 팀 서버)
- .md 파일은 UTF-8 인코딩
- 사용자의 브라우저는 WebSocket을 지원함
- AI Agent는 CLI 실행 또는 HTTP 호출이 가능한 환경

---

## Resolved Decisions

- [x] **에디터 라이브러리:** Tiptap v3 + 커스텀 Markdown 변환 레이어 (remark 기반)
  - Week 1에 roundtrip PoC 필수. 문제 시 커스텀 시리얼라이저로 보완

- [x] **라이선스 모델:** MIT
  - 오픈소스 프로젝트. 수익 모델 고려 안 함

- [x] **런타임/프레임워크:** Bun + Hono + React + Vite
  - 제품 계획과 기술 설계의 구현 기준 스택으로 확정

- [x] **인증 모델:** 로컬 ID/PW + OIDC(Authentik 호환)
  - 웹은 세션 로그인, CLI/API/MCP는 사용자별 PAT 사용

- [x] **이미지/첨부파일 저장 전략:** 전역 `.assets/` 디렉토리 + 문서별 하위 구조
  - 구조: `.assets/{문서경로}/{문서명}/파일명`
  - 문서 내 마크다운 링크로 참조: `![alt](/.assets/docs/guide/intro/screenshot.png)`

- [x] **검색 전략:** FlexSearch + 한글/CJK n-gram fallback
  - 영문권 검색 성능은 유지하고, CJK는 별도 fallback 경로로 품질 보완

- [x] **Frontmatter 처리 정책:** 템플릿 기반 삽입 + 명시적 편집만 허용
  - 일반 본문 저장 시 frontmatter를 자동 갱신하지 않음
  - 서비스 전용 편집자 정보는 `.md`가 아닌 서비스 메타데이터에 기록
  - 구조화 편집이 안전하지 않은 문서는 Raw 모드가 우선

- [x] **클라우드 호스팅:** Self-hosted only
  - 클라우드는 고려 대상이 아님

- [x] **MCP 제공 시점:** Phase 1 MVP 후반
  - REST API와 문서 서비스 계층을 먼저 안정화한 뒤 thin adapter로 제공

- [x] **PATCH API 의미:** 전체 content 교체 + 명시적 frontmatter 편집
  - line range patch는 MVP 범위에서 제외
  - 일반 본문 저장은 frontmatter를 자동 재작성하지 않음

- [x] **Markdown 보존 원칙:** no-op roundtrip이 최상위 품질 기준
  - 변경 없이 열고 저장한 문서는 원문 그대로 유지
  - 보존이 불확실한 구문은 WYSIWYG보다 Raw 모드가 우선
## Open Questions

- 현재 서비스 계획 차원의 blocking open question 없음
- Week 1 구현 잠금 명세는 아래 섹션을 기준으로 진행

---

## Week 1 Implementation Locks

MVP를 안전하게 시작하기 위해 Week 1에서 아래 구현 명세를 고정한다.

### 1. Roundtrip Test Contract

- `no-op roundtrip`은 필수 통과 기준이다.
- 테스트 방식은 golden-file 기반으로 한다.
- 각 테스트 파일에 대해 `read -> parse -> editor load -> serialize -> save` 경로에서:
  - 사용자 변경이 없으면 출력 바이트가 입력 바이트와 동일해야 한다.
  - 본문만 수정하면 기존 frontmatter 텍스트는 그대로 유지되어야 한다.
- 최소 golden corpus는 다음 12개 케이스를 포함한다:
  - plain headings/paragraphs
  - nested ordered/unordered lists
  - task lists
  - fenced code blocks with language
  - tables
  - blockquotes
  - mixed inline formatting
  - YAML frontmatter with custom fields
  - wiki-style links or bracket links
  - raw HTML blocks
  - mixed Korean/English content
  - deliberately unsupported/edge markdown sample
- unsupported sample은 WYSIWYG 저장을 강행하지 않고 Raw 모드 fallback이 발생해야 통과다.

### 2. Authentication Storage Contract

- 인증 방식은 `local ID/PW + OIDC(Authentik 호환)`으로 확정한다.
- 웹은 세션 쿠키 로그인, CLI/API/MCP는 PAT를 사용한다.
- 저장소는 `.docs/auth/users.db` 단일 SQLite 파일로 시작한다.
- 비밀번호 해시는 `Argon2id`를 사용한다.
- PAT는 평문 저장 금지, 발급 시 prefix를 보여주고 서버에는 hash만 저장한다.
- 사용자 식별자는 불변 UUID를 사용한다.
- 감사 로그는 `.docs/audit/events.ndjson`에 append-only로 기록한다.

### 3. Korean Search Contract

- 검색 엔진 기본축은 FlexSearch다.
- 한글/CJK가 포함된 문서와 질의는 별도 n-gram fallback 경로를 사용한다.
- MVP 기본값은 `2-gram`이며, 긴 질의(4자 이상)는 `3-gram`도 병행한다.
- 결과 병합 시:
  - 동일 문서는 하나로 합친다.
  - CJK fallback hit는 영문 FlexSearch hit보다 낮은 기본 가중치로 시작한다.
  - 제목 hit는 본문 hit보다 높은 가중치를 가진다.
- MVP 성공 기준은 “정확한 형태소 분석”이 아니라 “한글 부분 검색이 실패하지 않는 것”이다.

---

## Glossary

- **Source of Truth:** 데이터의 유일한 원본 저장소. 이 서비스에서는 파일시스템의 .md 파일
- **CRDT:** Conflict-free Replicated Data Type. 동시 편집 충돌을 자동으로 해결하는 자료구조
- **MCP:** Model Context Protocol. AI Agent가 외부 서비스와 상호작용하는 표준 프로토콜
- **WYSIWYG:** What You See Is What You Get. 편집 화면이 최종 결과와 동일한 에디터
- **Frontmatter:** 마크다운 파일 상단의 YAML 메타데이터 블록
- **Backlink:** 현재 문서를 링크하고 있는 다른 문서들의 역참조

---

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-07 | Initial draft |
| 1.1 | 2026-03-07 | 5대 의사결정 확정: Tiptap v3, MIT, 전역 .assets/, Frontmatter 적극적 파싱+템플릿, Self-hosted only |
| 1.2 | 2026-03-07 | PRD를 TECH-DESIGN과 정합화: Bun/Hono/React 스택 확정, MCP를 Phase 1 후반으로 배치, CRDT를 Phase 2로 분리, PATCH 의미 명확화 |
| 1.3 | 2026-03-07 | 인증(local + OIDC), 한글/CJK fallback 검색, no-op roundtrip 최우선 원칙 반영. frontmatter 자동 갱신 제거 |
