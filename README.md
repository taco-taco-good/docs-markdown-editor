# Foldmark

로컬 폴더를 그대로 쓰는 팀을 위한 self-hosted markdown workspace입니다.  
문서는 끝까지 `.md`로 남고, 워크스페이스는 파일시스템 위에 그대로 존재하며, 웹에서는 검색, 탭, 개요, 라이브 프리뷰 편집을 바로 사용할 수 있습니다.

## 한눈에 보기

- Markdown 원문을 유지하는 visual editor
- 로컬 폴더 기반 워크스페이스와 파일 트리
- 탭, 빠른 열기, 개요, 검색 중심 탐색
- 체크리스트, 표, 코드블록, 링크 라이브 프리뷰
- 로컬 계정 또는 OIDC 기반 인증
- self-hosted 배포와 Docker 운영 지원

## Screenshots

### 워크스페이스

![Foldmark workspace overview](docs/assets/readme/workspace-overview.png)

### 빠른 열기

![Foldmark quick open](docs/assets/readme/quick-open.png)

### 에디터 상세

![Foldmark editor detail](docs/assets/readme/editor-detail.png)

## 왜 Foldmark인가

많은 문서 도구는 편집 경험은 좋지만, 문서를 앱 내부 모델이나 데이터베이스 안에 가둡니다. Foldmark는 반대로 파일을 중심에 둡니다.

- 문서는 일반 Markdown 파일로 저장됩니다.
- 워크스페이스 디렉토리가 곧 실제 데이터입니다.
- visual editing을 제공하지만 저장 포맷은 여전히 markdown입니다.
- Git, 로컬 백업, 다른 편집기와의 호환성을 해치지 않습니다.

즉 Foldmark는 “웹에서 쓰는 문서 툴”이라기보다, “파일 기반 markdown workspace를 위한 제품형 UI”에 가깝습니다.

## 주요 기능

### Markdown-native editor

- CodeMirror 기반 visual markdown editor
- 체크리스트, 표, 코드블록, 링크, 구분선 라이브 프리뷰
- 빠른 열기, 탭, 개요, 검색을 통한 긴 문서 탐색
- 파일 포맷 손상을 최소화하는 markdown-first 저장 방식

### Workspace navigation

- 폴더/문서 트리 탐색
- 멀티탭 세션 유지
- 문서 개요 사이드바와 heading 점프
- 내부 문서 링크와 `@문서경로` 참조

### Self-hosted operation

- 로컬 계정 인증
- OIDC 로그인
- Docker / Docker Compose 배포
- 외부 파일 변경 반영

## 어떤 팀에 맞는가

- 문서를 Git과 함께 운영하는 팀
- Notion류보다 파일 가시성과 이식성을 더 중시하는 팀
- 로컬 디렉토리 구조를 그대로 유지하고 싶은 팀
- markdown 편집 경험은 좋아야 하지만, 저장 포맷은 단순해야 하는 팀

## 제품 원칙

- Files stay on disk
- Markdown stays markdown
- UI is rich, storage stays simple
- 검색, 이동, 편집은 빠르게
- self-hosted 운영을 전제로 설계

## 빠른 시작

### 1. 웹 의존성 설치

```bash
npm --prefix packages/web ci
```

### 2. 루트 `.env` 파일 생성

```bash
cp deploy/env.template .env
```

예시:

```env
WORKSPACE_ROOT=/data
WORKSPACE_ROOT_HOST=/Users/taco/projects/foldmark-data
HOST=0.0.0.0
PORT=3001
WEB_PORT=5173
PUBLIC_HOST=localhost
```

의미:

- `WORKSPACE_ROOT`: 앱이 읽는 워크스페이스 경로
- `WORKSPACE_ROOT_HOST`: 실제 호스트 디렉토리
- 로컬 스크립트는 `WORKSPACE_ROOT_HOST`를 우선 사용

### 3. 앱 실행

프로덕션 스타일 단일 포트 실행:

```bash
npm run serve
```

기본 접속 주소:

```text
http://127.0.0.1:3001
```

### 4. 첫 실행 인증 설정

최초 실행 시 Setup 화면이 나타납니다.

- 로컬 계정 생성
- OIDC 공급자 연결

OIDC callback 예시:

```text
http://127.0.0.1:3001/auth/oidc/callback
```

배포 환경에서는 실제 외부 주소를 사용해야 합니다.

## 개발

개발 서버 실행:

```bash
npm run dev
```

접속 주소:

- Web UI: `http://127.0.0.1:5173`
- API 서버: `http://127.0.0.1:3001`

개별 실행:

```bash
npm run dev:server
npm run dev:web
```

## 테스트

기본 단위 테스트:

```bash
npm test
```

브라우저 기반 에디터 회귀:

```bash
npm run test:editor-regression -- --base-url http://127.0.0.1:3001 --username <user> --password <pass>
```

모바일 viewport 회귀:

```bash
npm run test:mobile-editor-regression -- --base-url http://127.0.0.1:3001 --username <user> --password <pass>
```

## Docker

Docker 배포 파일은 `deploy/docker` 아래에 있습니다.

```bash
docker compose -f deploy/docker/compose.yml up -d --build
```

중요 환경 변수:

- `PORT`
- `HOST`
- `WORKSPACE_ROOT`
- `WORKSPACE_ROOT_HOST`
- `IMAGE_NAME` (선택)

헬스체크:

```bash
curl http://127.0.0.1:3001/api/health
```

## 데이터 저장 구조

워크스페이스 디렉토리 내부 구조:

```text
workspace/
├── .assets/   # 업로드된 파일
├── .docs/     # 인증/세션/앱 메타데이터
├── notes/
├── guides/
└── *.md
```

핵심은 단순합니다.

- 문서는 `.md`
- 에셋은 `.assets/`
- 앱 메타데이터는 `.docs/`

즉 Foldmark는 문서를 별도 DB에 가두지 않습니다.

## 프로젝트 구조

```text
.
├── deploy/
│   ├── docker/
│   ├── env.template
│   └── scripts/
├── packages/
│   ├── server/
│   ├── shared/
│   └── web/
└── scripts/
```

## 현재 범위

현재 구현된 범위:

- 로컬 markdown 워크스페이스 탐색, 열기, 편집
- visual markdown editor
- 파일 트리, 검색, 템플릿, 에셋 업로드
- 로컬 인증, OIDC
- REST API + SSE 기반 변경 반영

아직 구현하지 않은 범위:

- 독립 CLI 패키지
- MCP 서버
- Yjs/CRDT 기반 동시 편집
- Git 기반 버전 히스토리
