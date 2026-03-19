# Technical Design Document: Foldmark

**Version:** 1.6
**Date:** 2026-03-19
**Status:** Draft
**Refs:** [PRD.md](./PRD.md)

---

> **Planning baseline:** 이 문서는 현재 구현과 목표 아키텍처를 함께 설명한다. 현재 저장소에는 로컬 Markdown 워크스페이스를 웹에서 편집하는 UI, REST/SSE 기반 단일 사용자 편집, 파일 동기화, 검색, frontmatter/templates, local/OIDC 인증, PAT가 구현되어 있다. 아래 CLI/MCP/Yjs/JWT 관련 내용은 후속 설계 초안으로 읽어야 한다. 최상위 무결성 원칙은 `no-op roundtrip`이며, 변경 없이 열린 문서는 원문 markdown이 그대로 유지되어야 한다.
>
> **Naming note:** 제품 이름은 Foldmark이지만, 현재 저장소/패키지 이름은 계속 `docs-markdown-editor`를 사용한다.

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Project Structure](#2-project-structure)
3. [Data Models & File System Schema](#3-data-models--file-system-schema)
4. [Backend Architecture](#4-backend-architecture)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Core Flows](#6-core-flows)
7. [CLI Design (Planned)](#7-cli-design-planned)
8. [MCP Server Design (Planned)](#8-mcp-server-design-planned)
9. [Build, Deploy & Dev Environment](#9-build-deploy--dev-environment)
10. [Phase 2-3 Preview](#10-phase-2-3-preview)

---

## 1. Tech Stack

### Confirmed Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Runtime** | **Node.js** | v25+ | 네이티브 TS 실행 지원, npm 생태계 100% 호환 |
| **Package Manager** | npm | - | Node.js 기본 패키지 매니저 |
| **Language** | TypeScript | v5.7+ | Node.js v25+ 네이티브 실행 (별도 트랜스파일러 불필요) |
| **Monorepo** | npm workspace (부분) | - | `packages/web`에 별도 의존성, 루트에서 스크립트 통합 |
| **HTTP Server** | node:http (native) | - | 프레임워크 없이 Request/Response API 직접 구현, 최소 의존성 |
| **Realtime** | SSE (Server-Sent Events) | - | 단방향 이벤트 스트림, WebSocket보다 단순하고 HTTP 호환 |
| **File Watcher** | Custom polling | - | setInterval 기반 500ms 폴링, 스냅샷 비교로 변경 감지 |
| **Editor** | Tiptap | v2.11+ | ProseMirror 기반, 풍부한 확장 생태계 |
| **Markdown** | Custom parser/serializer | - | tiptap-markdown 기반 커스텀 구현 (task list, frontmatter 등) |
| **CRDT** | Yjs | v13+ | Phase 2 동시편집용, Phase 1에서는 미사용 |
| **Frontend** | React | v19+ | Tiptap 공식 지원, 커뮤니티 최대 |
| **Bundler** | Vite | v6+ | 프론트엔드 HMR 및 프로덕션 빌드 |
| **CSS** | Tailwind CSS | v4+ | 유틸리티 퍼스트, 빠른 UI 개발 |
| **Search** | Custom (ASCII + CJK n-gram) | - | 외부 라이브러리 없이 자체 구현, ASCII 토큰 + 2/3-gram CJK 검색 |
| **Auth** | Local credentials + OIDC | - | 자체 ID/PW와 Authentik 호환 외부 로그인 지원 |
| **Database** | node:sqlite | - | 인증 세션, 사용자 정보 저장 |
| **Test** | node:test (내장) | - | Node.js 내장 테스트 러너, `--test` 플래그 사용 |

### Node.js 선택 이유

| 기준 | 선택 |
|------|------|
| **npm 호환** | 100% — 모든 npm 패키지 호환 |
| **TypeScript** | v25+에서 네이티브 실행 (--experimental-strip-types) |
| **안정성** | LTS 지원, 프로덕션 검증된 런타임 |
| **테스트 러너** | 내장 `node:test` — 별도 프레임워크 불필요 |
| **Docker 이미지** | ~180MB (node:alpine) |

### 프레임워크 미사용 이유

HTTP 서버는 `node:http`의 `createServer`를 직접 사용한다. Web-standard `Request`/`Response` API로 변환하여 라우팅하며, 프레임워크 의존성을 제거하여 런타임 오버헤드를 최소화했다. 라우팅은 `pathname` 기반 수동 매칭으로, 프로젝트 규모에 적합한 단순한 구조를 유지한다.

---

## 2. Project Structure

### Monorepo Layout

```
docs-markdown-editor/              # repository name
├── packages/
│   ├── server/                 # 백엔드 서버
│   │   ├── src/
│   │   │   ├── index.ts                 # 서비스 re-export 엔트리포인트
│   │   │   ├── http/
│   │   │   │   ├── node-server.ts       # node:http 서버, 정적 파일 서빙
│   │   │   │   ├── api.ts               # Request/Response 기반 라우터
│   │   │   │   ├── api-helpers.ts       # 응답 헬퍼, 인증, 에러 매핑
│   │   │   │   └── routes/
│   │   │   │       ├── docs.routes.ts   # GET/PUT/PATCH/DELETE /api/docs
│   │   │   │       ├── tree.routes.ts   # GET /api/tree
│   │   │   │       ├── auth.routes.ts   # /auth/login, /auth/setup, OIDC
│   │   │   │       ├── assets.routes.ts # POST /api/assets (이미지 업로드)
│   │   │   │       └── templates.routes.ts # GET /api/templates
│   │   │   ├── services/
│   │   │   │   ├── document.service.ts  # 문서 CRUD 비즈니스 로직
│   │   │   │   ├── watcher.service.ts   # 폴링 기반 파일 감시 (500ms)
│   │   │   │   ├── realtime.service.ts  # SSE 이벤트 스트림 관리
│   │   │   │   ├── search.service.ts    # 커스텀 검색 (ASCII + CJK n-gram)
│   │   │   │   ├── template.service.ts  # 템플릿 관리
│   │   │   │   ├── asset.service.ts     # .assets/ 파일 관리
│   │   │   │   ├── auth.service.ts      # local/OIDC 인증, 세션, PAT
│   │   │   │   ├── oidc.service.ts      # OIDC discovery/callback 처리
│   │   │   │   ├── token.service.ts     # Personal Access Token 관리
│   │   │   │   ├── login-throttle.ts    # 로그인 시도 rate limiting
│   │   │   │   └── audit.service.ts     # 편집자 식별/감사 로그
│   │   │   └── lib/
│   │   │       ├── workspace.ts         # workspace 경로 관리, path traversal 방지
│   │   │       ├── sqlite.ts            # node:sqlite DB 초기화
│   │   │       ├── tree-builder.ts      # 파일 트리 구조 생성
│   │   │       └── tree-order.ts        # 트리 정렬 순서 관리
│   │   └── test/
│   │       ├── api.test.ts
│   │       ├── login-throttle.test.ts
│   │       ├── token.service.test.ts
│   │       └── tree-order.test.ts
│   │
│   ├── web/                    # 프론트엔드 웹앱
│   │   ├── src/
│   │   │   ├── main.tsx                 # React 엔트리
│   │   │   ├── App.tsx                  # 루트 컴포넌트 (라우팅)
│   │   │   ├── components/
│   │   │   │   ├── layout/
│   │   │   │   │   ├── Sidebar.tsx          # 디렉토리 트리 사이드바
│   │   │   │   │   ├── Header.tsx           # 상단 바 (문서명, 상태, 설정)
│   │   │   │   │   ├── EditorLayout.tsx     # 에디터 레이아웃
│   │   │   │   │   ├── CreateDocumentModal.tsx
│   │   │   │   │   ├── CreateFolderModal.tsx
│   │   │   │   │   └── TemplateManagerModal.tsx
│   │   │   │   ├── editor/
│   │   │   │   │   ├── MarkdownEditor.tsx   # Tiptap WYSIWYG 에디터
│   │   │   │   │   ├── RawEditor.tsx        # Raw markdown 모드
│   │   │   │   │   ├── EditorToolbar.tsx    # 포맷팅 툴바
│   │   │   │   │   ├── extensions.ts        # 커스텀 Tiptap 확장/키맵
│   │   │   │   │   ├── editor-sync.ts       # 실시간 동기화 로직
│   │   │   │   │   ├── slash-commands.ts    # 슬래시 커맨드 정의
│   │   │   │   │   ├── outline.ts           # 문서 아웃라인 추출
│   │   │   │   │   └── components/
│   │   │   │   │       ├── OutlinePanel.tsx  # 목차 패널
│   │   │   │   │       ├── SlashMenu.tsx     # 슬래시 커맨드 메뉴
│   │   │   │   │       ├── SelectionToolbar.tsx # 선택 영역 툴바
│   │   │   │   │       └── TableToolbar.tsx  # 테이블 편집 툴바
│   │   │   │   ├── tree/
│   │   │   │   │   ├── FileTree.tsx         # 파일 트리
│   │   │   │   │   ├── TreeNode.tsx         # 개별 노드 (파일/폴더)
│   │   │   │   │   └── drag-source.ts       # 드래그 앤 드롭 소스
│   │   │   │   ├── auth/
│   │   │   │   │   ├── LoginPage.tsx        # 로그인 페이지
│   │   │   │   │   └── SetupPage.tsx        # 초기 설정 페이지
│   │   │   │   ├── search/
│   │   │   │   │   └── SearchModal.tsx      # Cmd+K 검색 모달
│   │   │   │   └── settings/
│   │   │   │       └── SettingsPage.tsx     # 설정 페이지
│   │   │   ├── hooks/
│   │   │   │   ├── useWebSocket.ts          # SSE 이벤트 스트림 연결
│   │   │   │   └── useSearch.ts             # 검색 상태
│   │   │   ├── stores/
│   │   │   │   ├── document.store.ts        # 현재 문서 상태 (Zustand)
│   │   │   │   ├── document-sync.ts         # 원격 업데이트 해결 로직
│   │   │   │   ├── tree.store.ts            # 파일 트리 상태
│   │   │   │   ├── auth.store.ts            # 인증 상태
│   │   │   │   └── ui.store.ts              # UI 상태 (사이드바, 모달)
│   │   │   ├── api/
│   │   │   │   └── client.ts                # REST API 클라이언트
│   │   │   ├── lib/
│   │   │   │   ├── tiptap-markdown.ts       # 커스텀 MD 파서/시리얼라이저
│   │   │   │   ├── markdown-support.ts      # WYSIWYG 지원 여부 판별
│   │   │   │   ├── path-utils.ts            # 경로 유틸
│   │   │   │   ├── tree-dnd.ts              # 트리 드래그 앤 드롭
│   │   │   │   ├── tree-selection.ts        # 트리 선택 상태
│   │   │   │   └── editor-client.js         # 에디터 클라이언트 ID 생성
│   │   │   └── styles/
│   │   │       └── globals.css              # Tailwind + 글로벌 스타일
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── shared/                 # 공유 타입/유틸
│       └── src/
│           ├── frontmatter.ts           # Frontmatter 타입/파서
│           └── markdown-document.ts     # Markdown 문서 유틸
│
├── docs/                       # 프로젝트 문서
│   ├── PRD.md
│   └── TECH-DESIGN.md
│
├── deploy/
│   ├── docker/
│   │   └── compose.yml         # Docker Compose 설정
│   ├── env.template            # 환경변수 템플릿
│   └── scripts/                # 실행 스크립트 (serve.sh, dev.sh 등)
├── package.json                # 루트 (scripts, test)
├── .env                        # 환경변수 (gitignore 대상)
├── LICENSE                     # MIT
└── README.md
```

### Root package.json (스크립트)

```json
{
  "name": "docs-markdown-editor",
  "type": "module",
  "scripts": {
    "dev": "bash ./deploy/scripts/dev.sh",
    "dev:server": "bash ./deploy/scripts/dev-server.sh",
    "dev:web": "bash ./deploy/scripts/dev-web.sh",
    "serve": "bash ./deploy/scripts/serve.sh",
    "user:create": "bash ./deploy/scripts/create-local-user.sh",
    "test": "node --test packages/shared/test/*.test.ts packages/server/test/*.test.ts packages/web/test/*.test.ts"
  }
}
```

### 패키지 의존성 그래프

```
shared ← server
shared ← web
```

- `shared`: Frontmatter 타입/파서, Markdown 문서 유틸 (의존성 없음)
- `server`: HTTP 서버, 파일 I/O, 검색, 인증, SSE 실시간 이벤트
- `web`: React UI, Tiptap 에디터, Zustand 상태관리

---

## 3. Data Models & File System Schema

### 3.1 Workspace 디렉토리 구조

```
workspace/                          # --workspace 옵션으로 지정
├── {user documents}/               # 사용자의 .md 파일들
│   ├── guide/
│   │   ├── intro.md
│   │   └── setup.md
│   └── notes/
│       └── meeting.md
├── .assets/                        # 이미지/첨부파일 전역 저장소
│   ├── guide/
│   │   ├── intro/                  # intro.md의 assets
│   │   │   ├── screenshot.png
│   │   │   └── diagram.svg
│   │   └── setup/
│   │       └── install.gif
│   └── notes/
│       └── meeting/
│           └── whiteboard.jpg
└── .docs/                          # 서비스 메타데이터 (gitignore 권장)
    ├── auth/                       # 사용자/토큰/세션 메타데이터
    │   └── users.db
    ├── audit/                      # 편집 이벤트 로그
    │   └── events.ndjson
    ├── templates/                  # 문서 생성 템플릿
    │   ├── default.md
    │   ├── meeting-note.md
    │   └── tech-spec.md
    └── tree-order.json             # 파일 트리 정렬 순서
```

### 3.2 Runtime Configuration (Current Implementation)

현재 구현은 `.docs/config.yaml`을 사용하지 않는다. 런타임 설정은 저장소 루트 `.env`와 `process.env`로 주입하고, 인증 방식/OIDC 설정은 `.docs/auth/users.db` 안의 `app_config` 테이블에 저장한다.

```env
# repository root .env
WORKSPACE_ROOT=/data
WORKSPACE_ROOT_HOST=/absolute/path/to/workspace
HOST=0.0.0.0
PORT=3001
WEB_PORT=5173
PUBLIC_HOST=localhost
WEB_ROOT=/absolute/path/to/packages/web/dist
TRUST_PROXY=false
```

`app_config` 예시 키:

- `auth_method`
- `oidc_issuer`
- `oidc_client_id`
- `oidc_client_secret`
- `oidc_provider_name`
- `oidc_authorization_endpoint`
- `oidc_token_endpoint`
- `oidc_userinfo_endpoint`

### 3.3 Frontmatter Schema

```typescript
// packages/shared/src/frontmatter.ts

interface Frontmatter {
  title?: string;
  tags?: string[];
  date?: string;           // ISO 8601 date: "2026-03-07"
  created_by?: string;     // 사용자 정의 필드로만 허용, 서비스가 자동 관리하지 않음
  last_edited?: string;    // 사용자 정의 필드로만 허용, 서비스가 자동 관리하지 않음
  last_edited_by?: string; // 사용자 정의 필드로만 허용, 서비스가 자동 관리하지 않음
  [key: string]: unknown;  // 사용자 정의 필드 허용
}
```

### 3.4 Default Template (default.md)

```markdown
---
title: "{{title}}"
tags: []
date: "{{date}}"
---

# {{title}}


```

### 3.5 Core TypeScript Types

```typescript
// packages/shared/src/types.ts

/** 문서 메타데이터 (frontmatter + 파일 정보) */
interface DocumentMeta {
  path: string;             // workspace 기준 상대 경로 (e.g. "guide/intro.md")
  title: string;            // frontmatter.title || 첫 번째 # 헤딩 || 파일명
  frontmatter: Frontmatter;
  size: number;             // 바이트
  createdAt: string;        // 파일시스템 ctime
  modifiedAt: string;       // 파일시스템 mtime
}

/** 문서 전체 (메타데이터 + 본문) */
interface Document {
  meta: DocumentMeta;
  content: string;          // frontmatter 제외한 마크다운 본문
  raw: string;              // frontmatter 포함한 원본 전체
}

/** 파일 트리 노드 */
interface TreeNode {
  name: string;
  path: string;             // workspace 기준 상대 경로
  type: "file" | "directory";
  children?: TreeNode[];    // directory인 경우
  meta?: DocumentMeta;      // file인 경우 (선택적, 트리 로딩 최적화)
}

/** 검색 결과 */
interface SearchResult {
  path: string;
  title: string;
  snippet: string;          // 매칭 부분 하이라이트
  score: number;
}

/** SSE 이벤트 */
type WSEvent =
  | { type: "tree:changed" }
  | { type: "file:created"; path: string }
  | { type: "file:updated"; path: string }
  | { type: "file:deleted"; path: string }
  | { type: "file:moved";   from: string; to: string }
  | { type: "dir:created";  path: string }
  | { type: "dir:deleted";  path: string }
  | { type: "dir:moved";    from: string; to: string }
  | { type: "doc:content";  path: string; content: string; frontmatter: Frontmatter; originClientId: string | null }
  | { type: "error";        message: string };

/** API 응답 래퍼 */
interface ApiResponse<T> {
  data: T;
}

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** 이미지 업로드 결과 */
interface AssetUploadResult {
  path: string;             // .assets/ 기준 경로
  url: string;              // 웹에서 접근 가능한 URL
  markdownLink: string;     // 삽입할 마크다운 텍스트
}
```

---

## 4. Backend Architecture

### 4.1 서버 엔트리포인트

```typescript
// packages/server/src/http/node-server.ts (개념)

async function startApiServer(options) {
  // 1. API 앱 생성 (서비스 초기화 포함)
  const app = createApiApp({ workspaceRoot: options.workspaceRoot });

  // 2. 파일 감시자 초기화
  const watcher = new WatcherService({
    workspaceRoot: options.workspaceRoot,
    documentService: app.documentService,
    realtimeService: app.realtimeService,
    searchService: app.searchService,
  });
  app.setWatcherService(watcher);
  watcher.start();  // 500ms 폴링 시작

  // 3. node:http 서버 생성
  const server = createServer(async (req, res) => {
    // 보안 헤더 설정 (CSP, X-Frame-Options 등)
    // 정적 파일 서빙 시도 (SPA fallback 포함)
    // API 라우팅: Request/Response 변환 → app.fetch()
  });

  server.listen(options.port, options.host);
}
```

> **Note:** CLI 패키지(`packages/cli`)와 MCP 서버(`packages/server/src/mcp/`)는 Phase 2 이후 구현 예정이다.

### 4.2 REST API 상세

#### Documents API

```
GET    /api/docs/:path
  → 200: { data: Document }
  → 404: { error: { code: "NOT_FOUND" } }

PUT    /api/docs/:path
  Body: { content: string, frontmatter?: Partial<Frontmatter> }
  → 200: { data: Document }           # 기존 문서 수정
  → 201: { data: Document }           # 새 문서 생성
  Header: X-Template: "default"       # 생성 시 사용할 템플릿 (선택)
  Note: 기존 문서 수정 시 frontmatter는 명시적으로 전달되지 않으면 원문 그대로 유지

PATCH  /api/docs/:path
  Body: { content?: string, frontmatter?: Partial<Frontmatter> }
  → 200: { data: Document }
  Note: content는 전체 교체. frontmatter는 명시적 요청일 때만 병합/재직렬화

DELETE /api/docs/:path
  → 204: (no content)
  → 404: { error: { code: "NOT_FOUND" } }
  Note: .assets/ 내 해당 문서의 assets도 함께 삭제 (옵션)
```

#### Tree API

```
GET    /api/tree
  Query: ?depth=3                    # 최대 깊이 (기본 무제한)
  → 200: { data: TreeNode }

GET    /api/tree/:path
  → 200: { data: TreeNode }          # 특정 디렉토리의 하위 트리

POST   /api/tree/move
  Body: { from: string, to: string }
  → 200: { data: { from, to } }
  Note: .assets/ 내 assets도 함께 이동, 문서 내 링크 업데이트
```

#### Search API

```
POST   /api/search
  Body: {
    query: string,
    path?: string,           # 검색 범위 (디렉토리)
    tags?: string[],         # frontmatter 태그 필터
    limit?: number           # 기본 20, 최대 100
  }
  → 200: { data: SearchResult[] }
```

#### Assets API

```
POST   /api/assets/:docPath
  Body: multipart/form-data (file)
  → 201: { data: AssetUploadResult }
  Note: docPath에 해당하는 .assets/ 하위에 저장

GET    /api/assets/:path
  → 200: (file binary)
  → 304: (if not modified)
  Note: 정적 파일 서빙, Cache-Control 헤더
```

#### Templates API

```
GET    /api/templates
  → 200: { data: TemplateMeta[] }

GET    /api/templates/:name
  → 200: { data: { name, content, frontmatter } }
```

#### System API

```
GET    /api/health
  → 200: { status: "ok", version: "1.0.0", workspace: "/path/to/workspace" }

POST   /auth/login
  Body: { username: string, password: string }
  → 200: { data: { user, session } }

GET    /auth/oidc/:provider
  → 302: provider login page

GET    /auth/callback/:provider
  → 302: app redirect after successful login

POST   /auth/tokens
  → 201: { data: { token } }
```

### 4.3 Error Codes

| Code | HTTP Status | Description |
|------|------------|-------------|
| `NOT_FOUND` | 404 | 문서/디렉토리 없음 |
| `ALREADY_EXISTS` | 409 | 같은 경로에 파일 이미 존재 |
| `VALIDATION_ERROR` | 400 | 잘못된 요청 (경로, 본문 등) |
| `PATH_TRAVERSAL` | 403 | workspace 외부 접근 시도 |
| `UNAUTHORIZED` | 401 | 세션 없음 또는 PAT 불일치 |
| `RATE_LIMITED` | 429 | 요청 제한 초과 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 |

### 4.4 서비스 계층 상세

#### DocumentService

```typescript
class DocumentService {
  constructor(private workspace: string, private config: Config) {}

  /** 문서 읽기: frontmatter 파싱 + 본문 분리 */
  async read(docPath: string): Promise<Document>

  /** 문서 쓰기: 본문 저장. 기존 frontmatter는 바이트 단위로 유지 */
  async write(docPath: string, content: string, frontmatter?: Partial<Frontmatter>): Promise<Document>

  /** 문서 생성: 템플릿 적용 + frontmatter 삽입 */
  async create(docPath: string, opts?: { template?: string; title?: string; author?: string }): Promise<Document>

  /** 명시적 메타데이터 편집: 사용자가 요청한 경우에만 frontmatter 재작성 */
  async updateFrontmatter(docPath: string, frontmatter: Partial<Frontmatter>): Promise<Document>

  /** 문서 삭제: .assets/ 연관 파일도 삭제 (옵션) */
  async delete(docPath: string, opts?: { deleteAssets?: boolean }): Promise<void>

  /** 문서 이동: 파일 + .assets/ + 다른 문서의 링크 업데이트 */
  async move(from: string, to: string): Promise<void>

  /** 문서 존재 여부 */
  async exists(docPath: string): Promise<boolean>
}
```

#### WatcherService

```typescript
class WatcherService {
  private snapshot: WorkspaceSnapshot;     // { directories: Set, files: Map<path, {modifiedMs, size}> }
  private recentServerWrites: Map<string, number>;  // 자체 쓰기 무시용

  constructor(options: {
    workspaceRoot: string;
    documentService: DocumentService;
    realtimeService: RealtimeService;
    searchService: SearchService;
    intervalMs?: number;  // 기본 500ms
  })

  start(): void        // setInterval 폴링 시작
  stop(): void         // 폴링 중지
  refresh(): WorkspaceEvent[]  // 스냅샷 비교 → 이벤트 발행

  /** API 저장 후 호출 — watcher echo 방지 (2초 suppression window) */
  suppressNextChange(filePath: string): void
}
```

핵심 동작:
- `setInterval`로 500ms마다 워크스페이스 전체 스냅샷(`readdirSync` + `statSync`) 캡처
- 이전 스냅샷과 비교하여 `file:created`, `file:updated`, `file:deleted`, `dir:created`, `dir:deleted` 이벤트 생성
- 변경 감지 시 `searchService.buildIndex()` 호출하여 검색 인덱스 재구축
- 변경된 파일의 `doc:content` 이벤트를 SSE로 브로드캐스트 (실시간 동기화)
- **자체 쓰기 무시**: API save 경로에서 `suppressNextChange(path)` 호출 → watcher가 해당 파일의 `doc:content` 브로드캐스트 스킵 (2초 이내)
- `.docs/`, `.assets/` 등 예약 디렉토리는 감시 제외

#### SearchService

```typescript
class SearchService {
  private entries: Map<string, IndexEntry>;  // path → {title, tokens, cjkTokens}

  constructor(workspaceRoot: string)

  /** 전체 인덱스 빌드: 모든 .md 파일 스캔 */
  buildIndex(): void

  /** 검색 수행 */
  search(query: string, limit?: number): SearchResult[]
}
```

검색 구현 (외부 라이브러리 없음):
- **ASCII 토큰화**: 소문자 변환 후 단어 분리 (`/[a-z0-9]+/g`)
- **CJK 토큰화**: 한글/CJK 문자를 2-gram, 3-gram으로 분할
- **점수 계산**: 제목 매칭 가중치 + 경로 매칭 가중치 + 본문 스니펫 생성
- MVP에서는 메모리 내 인덱스, Phase 2에서 전용 검색 엔진 검토 가능

#### Frontmatter 처리

Frontmatter 파싱과 직렬화는 `packages/shared/src/frontmatter.ts`에서 처리한다.
정규식 기반 YAML frontmatter 파싱을 사용하며, `yaml` 패키지 없이 자체 구현한다.

원칙:
- 일반 본문 저장에서는 frontmatter를 재직렬화하지 않는다
- frontmatter 수정은 사용자의 명시적 메타데이터 편집 또는 문서 생성 시에만 허용한다
- 원문 frontmatter 블록을 최대한 보존하여 `no-op roundtrip` 원칙을 준수한다

#### AuthService

```typescript
class AuthService {
  /** 로컬 ID/PW 로그인 */
  async loginWithPassword(username: string, password: string): Promise<Session>

  /** OIDC 로그인 시작/콜백 처리 */
  beginOIDCLogin(provider: string): Promise<Response>
  async handleOIDCCallback(provider: string, code: string): Promise<Session>

  /** PAT 발급/회수 */
  async issuePersonalAccessToken(userId: string, name: string): Promise<{ token: string }>
  async revokePersonalAccessToken(userId: string, tokenId: string): Promise<void>
}
```

#### AuditService

```typescript
class AuditService {
  async recordDocumentEdit(event: {
    path: string;
    actorId: string;
    provider: "local" | "oidc" | "pat" | "filesystem";
    action: "create" | "update" | "delete" | "move";
  }): Promise<void>
}
```

#### AssetService

```typescript
class AssetService {
  constructor(private workspace: string, private config: Config) {}

  /** 이미지 업로드: .assets/{docDir}/{docName}/{filename} 에 저장 */
  async upload(docPath: string, file: File): Promise<AssetUploadResult>

  /** 문서의 assets 디렉토리 경로 반환 */
  getAssetDir(docPath: string): string

  /** 문서 삭제 시 assets 정리 */
  async deleteAssetsFor(docPath: string): Promise<void>

  /** 문서 이동 시 assets 이동 */
  async moveAssetsFor(fromDoc: string, toDoc: string): Promise<void>
}
```

Asset 경로 매핑 예시:
```
문서: guide/intro.md
Asset 디렉토리: .assets/guide/intro/
업로드 파일: screenshot.png
저장 경로: .assets/guide/intro/screenshot.png
마크다운 링크: ![screenshot](/.assets/guide/intro/screenshot.png)
```

### 4.5 SSE Event Stream

현재 구현은 양방향 WebSocket 프로토콜이 아니라 `/api/events` 단일 EventSource 스트림을 사용한다.

```typescript
const stream = new EventSource("/api/events", { withCredentials: true });

stream.onmessage = (event) => {
  const payload = JSON.parse(event.data) as WSEvent;
  // tree/document store 업데이트
};
```

연결 흐름:
```
1. Client → GET /api/events
2. Server → text/event-stream 연결 유지
3. Server → 파일/디렉토리 변경 시 WSEvent 브로드캐스트
4. Client → doc:content 수신 시 현재 문서 상태 갱신
5. 문서 저장은 별도 REST API (PUT/PATCH /api/docs/:path) 로 수행
```

### 4.6 Security Layer

```typescript
// packages/server/src/middleware/security.ts

/** Path traversal 방지 */
function sanitizePath(workspace: string, requestedPath: string): string {
  const resolved = path.resolve(workspace, requestedPath);
  if (!resolved.startsWith(path.resolve(workspace))) {
    throw new ForbiddenError("PATH_TRAVERSAL");
  }
  return path.relative(workspace, resolved);
}

/** .md 확장자 검증 (문서 API에만 적용) */
function validateDocPath(docPath: string): void {
  if (!docPath.endsWith(".md")) {
    throw new ValidationError("Document path must end with .md");
  }
}
```

---

## 5. Frontend Architecture

### 5.1 Component Tree

```
App
├── Header
│   ├── Logo
│   ├── SearchTrigger (Cmd+P)
│   └── SettingsButton
├── Layout (flex)
│   ├── Sidebar (resizable)
│   │   ├── FileTree
│   │   │   └── TreeNode (recursive)
│   │   │       ├── FolderNode
│   │   │       └── FileNode
│   │   ├── TreeContextMenu
│   │   └── NewDocButton
│   └── EditorPane
│       ├── EditorHeader
│       │   ├── Breadcrumb (파일 경로)
│       │   ├── EditorModeToggle (WYSIWYG / Raw)
│       │   └── SaveStatus ("저장됨" / "저장 중...")
│       ├── FrontmatterPanel (접을 수 있는 상단 영역)
│       │   ├── TitleInput
│       │   ├── TagEditor
│       │   ├── MetadataFields (date, author 등)
│       │   └── EditedByBadge
│       ├── MarkdownEditor (WYSIWYG 모드)
│       │   ├── Tiptap EditorContent
│       │   ├── EditorToolbar (floating)
│       │   ├── SlashMenu
│       │   └── ImageUploader (드래그앤드롭 오버레이)
│       └── RawEditor (Raw 모드)
│           └── CodeMirror / textarea
├── SearchModal (overlay)
│   ├── SearchInput
│   └── SearchResultList
│       └── SearchResultItem
└── Toasts / Notifications
```

### 5.2 State Management (Zustand)

```typescript
// packages/web/src/stores/document.store.ts
interface DocumentStore {
  // State
  currentPath: string | null;
  currentDoc: Document | null;
  isDirty: boolean;
  saveStatus: "saved" | "saving" | "conflict";
  editorMode: "wysiwyg" | "raw";

  // Actions
  openDocument(path: string): Promise<void>;
  saveDocument(): Promise<void>;
  updateContent(content: string): void;
  updateFrontmatter(updates: Partial<Frontmatter>): void;
  toggleEditorMode(): void;
  handleExternalUpdate(content: string): void;
}

// packages/web/src/stores/tree.store.ts
interface TreeStore {
  tree: TreeNode | null;
  expandedPaths: Set<string>;
  selectedPath: string | null;

  loadTree(): Promise<void>;
  toggleExpand(path: string): void;
  selectFile(path: string): void;
  handleTreeEvent(event: WSEvent): void;
  createFile(dirPath: string, name: string, template?: string): Promise<void>;
  createFolder(dirPath: string, name: string): Promise<void>;
  deleteNode(path: string): Promise<void>;
  moveNode(from: string, to: string): Promise<void>;
}

// packages/web/src/stores/ui.store.ts
interface UIStore {
  sidebarOpen: boolean;
  sidebarWidth: number;
  searchOpen: boolean;
  theme: "light" | "dark";

  toggleSidebar(): void;
  toggleSearch(): void;
  setTheme(theme: "light" | "dark"): void;
}
```

### 5.3 Tiptap Editor 구성

```typescript
// packages/web/src/hooks/useEditor.ts

const editor = useEditor({
  extensions: [
    // 코어
    StarterKit.configure({
      codeBlock: false, // 커스텀 코드블록 사용
    }),
    Markdown,          // @tiptap/markdown - MD 파싱/시리얼라이즈

    // 블록
    CodeBlockLowlight.configure({
      lowlight,        // 100+ 언어 구문 강조
    }),
    Table.configure({ resizable: true }),
    TaskList,
    TaskItem,
    Image.configure({
      inline: false,
      allowBase64: false,
    }),
    HorizontalRule,

    // 인라인
    Link.configure({ openOnClick: false }),
    Highlight,
    Subscript,
    Superscript,

    // UI
    Placeholder.configure({
      placeholder: "Type '/' for commands...",
    }),
    SlashCommand,      // 커스텀 슬래시 메뉴 확장
    DropImage,         // 커스텀 이미지 드래그앤드롭 확장
  ],

  content: "",         // 초기 내용은 API에서 로드 후 setContent

  // 편집 시 자동 저장 트리거
  onUpdate: ({ editor }) => {
    const markdown = editor.storage.markdown.getMarkdown();
    documentStore.updateContent(markdown);
    // 서버 저장 시 raw 원문과 diff가 없으면 no-op write를 피한다.
  },
});
```

### 5.4 Markdown Roundtrip Pipeline

```
[파일시스템 .md]
       │
       ▼ (서버에서 읽기)
[raw string: frontmatter + markdown body]
       │
       ▼ FrontmatterService.parse()
[frontmatter 객체] + [markdown body string]
       │
       ▼ REST API → 클라이언트
[Document { meta, content }]
       │
       ▼ editor.commands.setContent(content) → @tiptap/markdown 파싱
[ProseMirror Document (JSON)]
       │
       ▼ (사용자 WYSIWYG 편집)
[ProseMirror Document (JSON) - 수정됨]
       │
       ▼ editor.storage.markdown.getMarkdown()
[markdown body string]
       │
       ▼ REST API → 서버
[PUT /api/docs/:path { content }]
       │
       ▼ 기존 raw와 비교
  ┌────┴─────────────────────────────────────────┐
  │ 변경 없음                                    │ 변경 있음
  ▼                                              ▼
no-op (쓰기 생략)                     frontmatter 원문 유지 + 본문만 갱신
                                             │
                                             ▼
                                  writeFileSync()
[파일시스템 .md]
```

Roundtrip 계약:
- 변경 없이 열고 저장하면 파일을 다시 쓰지 않는다
- 본문만 수정한 경우 기존 frontmatter 텍스트는 그대로 유지한다
- 구조 보존이 불확실한 markdown 구문은 WYSIWYG 저장을 강행하지 않고 Raw 모드로 유도한다
- 구조화 frontmatter 편집은 명시적 사용자 액션일 때만 허용한다

### 5.5 Key UI Design Decisions

| 결정 | 이유 |
|------|------|
| Zustand (상태 관리) | 가장 경량, boilerplate 최소. 글로벌 스토어 3개면 충분 |
| Floating toolbar (Bubble menu) | Obsidian/Notion 스타일. 선택 시 나타남 |
| Slash command menu | `/` 입력 시 블록 타입 선택. 커스텀 Tiptap extension |
| Frontmatter는 별도 패널 | 에디터 본문과 분리. 접을 수 있음 |
| CodeMirror for Raw mode | Raw markdown 모드에서 구문 강조가 필요. textarea보다 우수 |
| Tree는 lazy loading | 대규모 디렉토리 시 depth=1로 로드 후 펼칠 때 하위 로드 |

---

## 6. Core Flows

### 6.1 문서 열기 플로우

```
사용자: 사이드바에서 "guide/intro.md" 클릭

[Web Client]                   [Server]                    [File System]
    │                              │                            │
    ├─ GET /api/docs/guide/intro.md ─►                          │
    │                              ├─ sanitizePath() ──────────►│
    │                              ├─ readFileSync() ◄──────┤
    │                              ├─ FrontmatterService.parse()│
    │                              │                            │
    │     ◄── 200 { data: Document }                            │
    │                              │                            │
    ├─ documentStore.openDocument()│                            │
    ├─ editor.setContent(doc.content)                           │
    ├─ frontmatterPanel.setData(doc.meta.frontmatter)           │
    ├─ WS: { type: "subscribe:doc", path: "guide/intro.md" }──►│
    │                              │                            │
    ▼ 에디터 표시                    │                            │
```

### 6.2 문서 저장 플로우 (Auto-save)

```
사용자: 에디터에서 타이핑

[Web Client]                   [Server]                    [File System]
    │                              │                            │
    ├─ editor.onUpdate() triggered │                            │
    ├─ updateContent(markdown)     │                            │
    ├─ saveStatus = "saving"       │                            │
    │   (300ms debounce)           │                            │
    ├─ PATCH /api/docs/guide/intro.md ─►                        │
    │   { content: "..." }         │                            │
    │                              ├─ raw 비교 (변경 없음?)     │
    │                              │   → 예: write 생략         │
    │                              │   → 아니오: 본문 diff 적용 │
    │                              ├─ watcherService.suppressNextChange()
    │                              ├─ frontmatter 원문 유지
    │                              ├─ writeFileSync() ─────────────►│
    │                              │                            │
    │     ◄── 200 { data: Document }                            │
    ├─ saveStatus = "saved"        │                            │
    ▼                              │                            │
```

### 6.3 외부 편집 감지 플로우

```
AI Agent: 외부에서 "guide/intro.md" 파일 직접 수정

[File System]               [Server]                    [Web Client]
    │                           │                            │
    ├─ file changed ───────────►│                            │
    │                  watcher polling detects change               │
    │                           ├─ ignoreSet 확인 (자체 쓰기?)│
    │                           │   → 아니오, 외부 변경       │
    │                           ├─ readFileSync()         │
    │                           ├─ FrontmatterService.parse()│
    │                           ├─ searchService.handleFileEvent()
    │                           │                            │
    │                           ├─ WS broadcast: ────────────►
    │                           │   { type: "file:updated",  │
    │                           │     path: "guide/intro.md",│
    │                           │     meta: {...} }          │
    │                           │                            │
    │                           │   (구독 중인 문서이면 추가) │
    │                           ├─ WS: { type: "doc:content",────►
    │                           │   path, content }          │
    │                           │                            │
    │                           │                ├─ 현재 열린 문서?
    │                           │                │   → 예: 충돌 확인
    │                           │                ├─ isDirty?
    │                           │                │   → 아니오: 즉시 반영
    │                           │                │   → 예: 충돌 알림 표시
    │                           │                ├─ editor.setContent()
    │                           │                ├─ treeStore.handleTreeEvent()
    │                           │                ▼
```

### 6.4 이미지 업로드 플로우

```
사용자: 에디터에 이미지 드래그앤드롭

[Web Client]                   [Server]                    [File System]
    │                              │                            │
    ├─ DragEvent captured          │                            │
    ├─ POST /api/assets/guide/intro.md ─►                       │
    │   (multipart: file.png)      │                            │
    │                              ├─ AssetService.upload()     │
    │                              │   docPath → "guide/intro"  │
    │                              │   assetDir → ".assets/guide/intro/"
    │                              │   filename → "file.png"    │
    │                              │   (중복 시 file-1.png)     │
    │                              ├─ mkdir -p .assets/guide/intro/
    │                              ├─ writeFileSync() ─────────────►│
    │                              │                            │
    │     ◄── 201 { data: {                                     │
    │       path: "guide/intro/file.png",                       │
    │       url: "/api/assets/guide/intro/file.png",            │
    │       markdownLink: "![file](/.assets/guide/intro/file.png)"
    │     }}                       │                            │
    │                              │                            │
    ├─ editor.commands.insertContent(markdownLink)              │
    ▼                              │                            │
```

### 6.5 문서 생성 플로우 (템플릿)

```
사용자: 사이드바에서 "새 문서" → 템플릿 "meeting-note" 선택

[Web Client]                   [Server]                    [File System]
    │                              │                            │
    ├─ PUT /api/docs/notes/standup-2026-03-07.md ──►            │
    │   Header: X-Template: meeting-note                        │
    │   Body: { frontmatter: { title: "Standup 2026-03-07" } }  │
    │                              │                            │
    │                              ├─ TemplateService.load("meeting-note")
    │                              ├─ 변수 치환:                 │
    │                              │   {{title}} → "Standup..." │
    │                              │   {{date}} → "2026-03-07"  │
    │                              ├─ FrontmatterService.merge()│
    │                              ├─ watcherService.suppressNextChange()
    │                              ├─ writeFileSync() ─────────────►│
    │                              │                            │
    │     ◄── 201 { data: Document }                            │
    ├─ treeStore.loadTree() (refresh)                           │
    ├─ documentStore.openDocument() │                           │
    ▼                              │                            │
```

---

## 7. CLI Design (Planned)

### 7.1 명령어 구조

```
docs <command> [options]

Commands:
  docs init [path]              workspace 초기화 (.docs/ 생성)
  docs login                    로컬/OIDC 로그인
  docs serve                    서버 시작
  docs create <path>            문서 생성
  docs read <path>              문서 읽기
  docs edit <path>              문서 수정
  docs delete <path>            문서 삭제
  docs list [directory]         문서 목록
  docs search <query>           전문 검색
  docs move <from> <to>         문서 이동

Global Options:
  --workspace, -w <path>        workspace 경로 (기본: 현재 디렉토리)
  --server, -s <url>            서버 URL (기본: http://localhost:3000)
  --token, -t <token>           개인 액세스 토큰 (PAT)
  --json                        JSON 형식 출력
  --help, -h                    도움말
  --version, -v                 버전
```

### 7.2 명령어 상세

```bash
# 초기화
docs init ./my-docs
# → .docs/ 디렉토리 생성
# → .docs/config.yaml 기본 설정
# → .docs/templates/default.md 기본 템플릿

# 서버 시작
docs serve --port 3000
docs serve --workspace ./my-docs

# 로그인
docs login --local
docs login --oidc authentik

# 문서 생성
docs create guide/intro.md
docs create guide/intro.md --template meeting-note
docs create guide/intro.md --title "Introduction"
echo "# Hello" | docs create guide/intro.md --stdin

# 문서 읽기
docs read guide/intro.md                 # 본문만 출력
docs read guide/intro.md --json          # { meta, content, raw }
docs read guide/intro.md --frontmatter   # frontmatter만 출력

# 문서 수정
docs edit guide/intro.md --content "# Updated"
docs edit guide/intro.md --stdin < updated.md
docs edit guide/intro.md --tag add:important
docs edit guide/intro.md --tag remove:draft

# 검색
docs search "getting started"
docs search "setup" --path guide/ --limit 5 --json

# 목록
docs list                       # 전체
docs list guide/                # 특정 디렉토리
docs list --tree                # 트리 형태 출력
docs list --tags important      # 태그 필터
```

### 7.3 CLI ↔ Server 통신

```
CLI 동작 모드:

1. 서버 실행 중 → REST API 호출 (http://localhost:3000)
2. 서버 미실행 → 로컬 단일 사용자/개발 모드에서만 직접 파일시스템 I/O 허용

판단 로직:
  try { await fetch(serverUrl + "/api/health") }
  catch → fallback to direct file I/O
```

이를 통해 로컬 개발 환경에서는 서버 없이도 CLI만으로 문서를 조작할 수 있다. 팀/인증 환경에서는 서버 경유를 기본 경로로 사용한다.

---

## 8. MCP Server Design (Planned)

MCP는 별도 저장 계층을 만들지 않고 `DocumentService`와 `SearchService` 위에 thin adapter로 얹는다. 구현 시점은 Phase 1 후반으로 잡고, CLI/REST와 동일한 권한 및 경로 검증 규칙을 재사용한다.

### 8.1 Transport

- **stdio**: 기본. Claude Code, Claude Desktop 등에서 바로 사용
- MCP Server는 `docs serve` 시 자동으로 같이 시작
- 별도로 `docs mcp` 명령으로 MCP Server만 실행도 가능

### 8.2 Tools

```typescript
// packages/server/src/mcp/tools.ts

const tools = [
  {
    name: "read_document",
    description: "Read a markdown document's content and metadata",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Document path relative to workspace (e.g. 'guide/intro.md')" },
      },
      required: ["path"],
    },
    // Returns: { content, frontmatter, path }
  },

  {
    name: "write_document",
    description: "Create or update a markdown document",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Document path" },
        content: { type: "string", description: "Markdown content (without frontmatter)" },
        title: { type: "string", description: "Document title for frontmatter" },
        tags: { type: "array", items: { type: "string" }, description: "Tags for frontmatter" },
        template: { type: "string", description: "Template name for new documents" },
      },
      required: ["path", "content"],
    },
  },

  {
    name: "search_documents",
    description: "Full-text search across all documents",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        path: { type: "string", description: "Limit search to directory" },
        tags: { type: "array", items: { type: "string" }, description: "Filter by tags" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },

  {
    name: "list_documents",
    description: "List documents in a directory",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Directory path (default: root)" },
        recursive: { type: "boolean", description: "Include subdirectories" },
      },
    },
  },

  {
    name: "delete_document",
    description: "Delete a markdown document",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Document path to delete" },
      },
      required: ["path"],
    },
  },

  {
    name: "move_document",
    description: "Move/rename a markdown document",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Current path" },
        to: { type: "string", description: "New path" },
      },
      required: ["from", "to"],
    },
  },
];
```

### 8.3 Resources

```typescript
const resources = [
  {
    uri: "docs://tree",
    name: "Document Tree",
    description: "Complete file tree of the workspace",
    mimeType: "application/json",
  },
  {
    uri: "docs://doc/{path}",
    name: "Document Content",
    description: "Content of a specific document",
    mimeType: "text/markdown",
  },
];
```

### 8.4 MCP 설정 (Claude Desktop 예시)

```json
{
  "mcpServers": {
    "docs-markdown-editor": {
      "command": "bunx",
      "args": ["docs-markdown-editor", "mcp", "--workspace", "/path/to/docs"],
      "env": {
        "DOCS_TOKEN": "pat_xxx"
      }
    }
  }
}
```

---

## 9. Build, Deploy & Dev Environment

### 9.1 개발 환경 셋업

```bash
# 1. 저장소 클론
git clone https://github.com/user/docs-markdown-editor.git
cd docs-markdown-editor

# 2. 웹 의존성 설치
npm --prefix packages/web ci

# 3. 환경 변수 파일 생성
cp deploy/env.template .env

# 4. 개발 서버 (server + web HMR 동시 실행)
npm run dev
# → server: http://127.0.0.1:3001
# → web:    http://127.0.0.1:5173
```

### 9.2 Runtime Scripts

```json
// root package.json
{
  "scripts": {
    "dev": "bash ./deploy/scripts/dev.sh",
    "dev:server": "bash ./deploy/scripts/dev-server.sh",
    "dev:web": "bash ./deploy/scripts/dev-web.sh",
    "serve": "bash ./deploy/scripts/serve.sh",
    "user:create": "bash ./deploy/scripts/create-local-user.sh",
    "test": "node --experimental-specifier-resolution=node --test packages/shared/test/*.test.ts packages/server/test/*.test.ts packages/web/test/*.test.ts"
  }
}

// packages/web/package.json
{
  "scripts": {
    "dev": "vite --port 5173",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

> **Note:** 서버 패키지는 별도 번들링 없이 Node.js가 TypeScript를 직접 실행하고, 웹 의존성은 `packages/web` 아래에서 관리한다.

### 9.3 Production Build

```
빌드 결과물:

packages/web/dist/                   # Vite 빌드 정적 파일 (HTML, JS, CSS)

배포 모드:
  serve.sh가 web을 빌드한 뒤 node-server.ts 실행
  서버가 web/dist/ 를 정적 파일로 서빙 (WEB_ROOT 환경변수)
  → 단일 프로세스로 API + 웹 UI 모두 제공
  → SPA fallback: 파일이 아닌 경로는 index.html로 응답

서버 코드는 번들링 없이 Node.js가 TypeScript를 직접 실행
```

### 9.4 Docker

```yaml
# deploy/docker/compose.yml
services:
  docs-markdown-editor:
    container_name: docs-markdown-editor
    image: ${IMAGE_NAME:-docs-markdown-editor:local}
    ports:
      - "${PORT:-3001}:${PORT:-3001}"
    environment:
      HOST: ${HOST:-0.0.0.0}
      PORT: ${PORT:-3001}
      WORKSPACE_ROOT: ${WORKSPACE_ROOT:-/data}
      WEB_ROOT: /app/packages/web/dist
    volumes:
      - ${WORKSPACE_ROOT_HOST}:${WORKSPACE_ROOT:-/data}
    restart: unless-stopped
```

### 9.5 실행 방법

```bash
# 프로덕션 단일 포트 실행 (빌드 포함)
npm run serve

# 개발 모드 (API 서버 + Vite 분리 실행)
npm run dev

# Docker 배포
docker compose -f deploy/docker/compose.yml up -d --build
```

### 9.6 Week 1 Implementation Spec

이 섹션은 MVP 구현 착수 전 반드시 고정하는 세부 구현 명세다. 아래 항목은 구현 중 재논의하지 않고 기본 계약으로 사용한다.

#### A. Roundtrip Golden Tests

테스트 디렉토리:

```text
packages/shared/test/fixtures/roundtrip/
  01-basic.md
  02-nested-lists.md
  03-task-lists.md
  04-code-fences.md
  05-tables.md
  06-blockquotes.md
  07-inline-formatting.md
  08-frontmatter-custom.md
  09-links.md
  10-raw-html.md
  11-ko-en-mixed.md
  12-unsupported-edge.md
```

검증 규칙:

```text
Case A: no-op
  input bytes === output bytes

Case B: body-only edit
  frontmatter slice is byte-identical
  edited body reflects intended change only

Case C: unsupported syntax
  WYSIWYG save is blocked or redirected to Raw mode
  original file remains unchanged until explicit raw save
```

구현 규칙:
- 서버는 저장 직전 `rawBefore === rawAfter` 비교를 먼저 수행한다
- 동일하면 write를 생략한다
- body-only save는 기존 raw에서 frontmatter byte range를 그대로 재사용한다
- frontmatter 재직렬화는 `updateFrontmatter()` 경로에서만 허용한다

#### B. Authentication Storage Model

초기 저장소는 SQLite 하나로 고정한다:

```text
.docs/auth/users.db
```

초기 테이블:

```sql
users(
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  auth_provider TEXT NOT NULL,
  provider_subject TEXT,
  created_at TEXT NOT NULL,
  disabled_at TEXT
)

sessions(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
)

personal_access_tokens(
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
)
```

보안 규칙:
- password hash 알고리즘은 `Argon2id`
- session cookie는 `httpOnly + secure + sameSite=lax`
- PAT는 `pat_` prefix + 랜덤 본문으로 발급한다
- DB에는 `token_hash`만 저장하고 원문 token은 재표시하지 않는다
- MCP는 PAT만 사용한다

#### C. OIDC Provider Contract

MVP는 provider abstraction을 두되, 첫 검증 대상은 Authentik 한 개다.

필수 설정값:

```yaml
auth:
  oidc:
    providers:
      - name: "authentik"
        issuer_url: "https://auth.example.com/application/o/docs/"
        client_id: "..."
        client_secret: "..."
        scopes: ["openid", "profile", "email"]
```

매핑 규칙:
- `provider_subject` = OIDC `sub`
- `display_name` = `name` 우선, 없으면 `preferred_username`
- `username`는 로컬 계정에만 필수, OIDC 계정은 nullable 허용

#### D. Korean/CJK Search Model

문서 인덱싱 시:
- ASCII/영문 위주 텍스트는 단어 토큰 기반 인덱스
- 한글/CJK 포함 텍스트는 normalized text에서 n-gram 토큰 생성
- normalization은 `NFC + lowercasing + 연속 공백 축소`

토큰 규칙:
- 기본 `2-gram`
- 질의 길이 4자 이상이면 `3-gram`도 생성
- title/tags/content를 분리 저장

병합 규칙:

```text
final_score =
  max(flex_score, 0.85 * cjk_score)
  + title_bonus
  + exact_path_bonus
```

MVP 품질 목표:
- `설치`, `인증`, `마크다운` 같은 2~4글자 질의에서 결과 0건이 되지 않아야 한다
- 형태소 분석 정확도보다 recall 우선

#### E. Builder Order For Week 1

1. roundtrip fixtures 추가
2. DocumentService no-op/body-only save 구현
3. Frontmatter explicit-edit path 분리
4. SQLite auth schema + Argon2id local login 구현
5. PAT 발급/검증 구현
6. Authentik-compatible OIDC flow PoC
7. 커스텀 검색 인덱싱 구현 (ASCII 토큰 + CJK n-gram)
8. end-to-end golden tests + auth smoke tests

### 9.7 npm 패키지 배포 구조

```
npm packages:
  docs-markdown-editor        # 메인 패키지 (server + web + cli 통합)
  @docs-md/server              # 서버만 단독 사용
  @docs-md/cli                 # CLI만 단독 사용
  @docs-md/shared              # 타입/유틸 공유
```

---

## 10. Phase 2-3 Preview

### Phase 2: Collaboration (간략 설계)

```
추가 기술:
  - Yjs (CRDT)
  - y-websocket (Yjs WebSocket provider)
  - @tiptap/extension-collaboration
  - @tiptap/extension-collaboration-cursor

변경점:
  - WebSocket 프로토콜: Yjs awareness + 문서 동기화 추가
  - DocumentService: Yjs 문서와 파일시스템 양방향 동기화
  - 인증: JWT 토큰 기반 사용자 식별
  - WS 연결 시 사용자 정보 전달 → 커서 색상/이름 표시

동기화 전략:
  Yjs Doc ↔ File System
  - Yjs Doc이 primary (편집 중)
  - 편집 세션 종료 또는 주기적 (5초) 으로 파일시스템에 flush
  - 외부 파일 변경 감지 시 Yjs Doc에 반영 (merge)

위키링크:
  - Tiptap extension: [[문서명]] 입력 → 자동완성
  - 서버: 백링크 인덱스 유지 (SearchService 확장)
  - API: GET /api/docs/:path/backlinks
```

### Phase 3: Polish (간략 설계)

```
버전 히스토리:
  - .git 폴더 존재 시 git log 활용
  - 없으면 .docs/history/ 에 diff 저장
  - API: GET /api/docs/:path/history
  - UI: 사이드 패널에서 diff 뷰어

다이어그램 렌더링:
  - Tiptap extension: mermaid/plantuml 코드 블록 감지
  - mermaid.js 클라이언트 렌더링

플러그인 시스템:
  - .docs/plugins/ 디렉토리
  - Tiptap extension 동적 로드
  - 서버 미들웨어 훅
```

---

## Appendix: Key Library Versions (2026-03)

| Package | Version | Note |
|---------|---------|------|
| node | 25+ | 런타임, 네이티브 TS 실행, 내장 테스트 러너 |
| typescript | 5.7+ | Node.js v25+ 네이티브 실행 |
| @tiptap/core | 2.11+ | ProseMirror 기반 에디터 |
| @tiptap/react | 2.11+ | React 바인딩 |
| node:sqlite | - | 인증 DB (SQLite) |
| yjs | 13.x | Phase 2 (동시편집) |
| react | 19.x | |
| vite | 6.x | 프론트엔드 HMR 및 프로덕션 빌드 |
| tailwindcss | 4.x | |
| zustand | 5.x | 상태 관리 |
| lowlight | 3.x | 코드 블록 구문 강조 |

> **Note:** 서버는 프레임워크 없이 `node:http`를 직접 사용한다. 검색은 외부 라이브러리 없이 자체 구현(ASCII 토큰 + CJK n-gram)한다. 파일 감시는 chokidar 대신 커스텀 폴링 방식을 사용한다. CLI와 MCP 서버는 아직 구현되지 않았고 후속 범위다.
