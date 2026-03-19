# Foldmark

> Repository name: `docs-markdown-editor`

로컬 폴더의 Markdown 문서를 웹에서 바로 열고 편집할 수 있게 해주는 self-hosted Markdown 워크스페이스입니다. 파일 트리, WYSIWYG 편집, Raw Markdown fallback, 템플릿, 검색, 에셋 업로드, 로컬 또는 OIDC 인증을 제공합니다.

## 프로젝트 소개

Foldmark는 디스크에 있는 Markdown 워크스페이스를 웹 UI로 편집하기 위한 단일 프로세스 애플리케이션입니다. 로컬 디렉토리를 워크스페이스로 연결하면, 브라우저에서 `.md` 파일을 열고 수정한 내용이 곧바로 파일시스템에 저장됩니다.

핵심 원칙은 단순합니다. 워크스페이스 디렉토리가 곧 실제 데이터입니다. 문서는 일반 `.md` 파일로 저장되고, 에셋은 `.assets/` 아래에 저장되며, 인증 세션이나 UI 정렬 정보 같은 애플리케이션 메타데이터는 `.docs/` 아래에 저장됩니다. 즉 Foldmark는 별도 DB에 문서를 가두지 않고, 로컬 Markdown 파일을 그대로 웹에서 다루는 편집 레이어입니다.

서버는 API와 웹 UI를 함께 제공합니다. 프로덕션 스타일 실행에서는 브라우저가 하나의 origin으로 모든 요청을 처리합니다.

## 현재 구현 기준

- 로컬 Markdown 워크스페이스를 웹에서 탐색, 열기, 편집
- WYSIWYG 에디터와 Raw Markdown 모드 전환
- 파일 트리 정렬과 문서/폴더 생성
- 검색, 템플릿, 에셋 업로드
- 로컬 인증, OIDC 로그인, PAT
- REST API + SSE 기반 외부 파일 변경 반영

아직 구현되지 않은 범위:

- 독립 CLI 패키지
- MCP 서버
- Yjs/CRDT 기반 동시 편집
- Git 기반 버전 히스토리

## 주요 기능

- 로컬 파일 기반 Markdown 워크스페이스
- 로컬 폴더의 `.md` 파일을 웹에서 직접 편집
- WYSIWYG 에디터와 Raw Markdown 모드
- 드래그 앤 드롭 정렬이 가능한 폴더/문서 트리
- 워크스페이스 검색
- 템플릿 기반 문서 생성
- 에셋 업로드와 Markdown 링크 자동 삽입
- 로컬 사용자 이름/비밀번호 인증
- OIDC 초기 설정 및 로그인 흐름
- 단일 포트 기반 프로덕션 스타일 서빙
- Docker 및 Docker Compose 배포 경로

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
    └── playwright_smoke_test.py
```

## 요구 사항

- Node.js 25 이상
- npm
- 컨테이너 배포 시 Docker 및 Docker Compose

현재 이 저장소는 루트에서 workspace install을 사용하지 않습니다. 웹 앱 의존성은 `packages/web` 아래에 있습니다.

## 빠른 시작

### 1. 웹 의존성 설치

```bash
npm --prefix packages/web ci
```

### 2. 루트 `.env` 파일 생성

[deploy/env.template](/Users/taco/projects/docs-markdown-editor/deploy/env.template)을 저장소 루트에 `.env`로 복사합니다.

```bash
cp deploy/env.template .env
```

예시:

```env
WORKSPACE_ROOT=/data
WORKSPACE_ROOT_HOST=/Users/taco/projects/docs-markdown-editor-data
HOST=0.0.0.0
PORT=3001
WEB_PORT=5173
PUBLIC_HOST=localhost
```

의미:

- `WORKSPACE_ROOT`: Docker 컨테이너 내부에서 앱이 읽는 경로
- `WORKSPACE_ROOT_HOST`: `WORKSPACE_ROOT`에 bind mount 되는 실제 호스트 디렉토리
- 로컬 셸 스크립트는 `WORKSPACE_ROOT_HOST`를 우선 사용하므로, 같은 `.env`를 Docker 밖에서도 그대로 사용할 수 있음

### 3. 앱 실행

프로덕션 스타일 단일 포트 실행:

```bash
npm run serve
```

접속 주소:

```text
http://127.0.0.1:3001
```

### 4. 첫 실행 인증 설정 완료

최초 실행 시 Setup 화면이 나타납니다.

선택 가능한 방식:

- 로컬 계정
- OIDC 공급자

OIDC를 선택한 경우 Redirect URI는 실제 서비스 주소와 정확히 일치해야 합니다.

```text
http://127.0.0.1:3001/auth/oidc/callback
```

배포 환경에서는 실제 외부 주소를 사용해야 합니다.

```text
https://your-domain.example/auth/oidc/callback
```

## 개발

API 서버와 Vite를 분리해서 실행:

```bash
npm run dev
```

접속 주소:

- Web UI: `http://127.0.0.1:5173`
- API 서버: `http://127.0.0.1:3001`

백엔드만 실행:

```bash
npm run dev:server
```

프론트엔드만 실행:

```bash
npm run dev:web
```

## Docker

Docker 배포 파일은 [deploy/docker](/Users/taco/projects/docs-markdown-editor/deploy/docker)에 있습니다.

빌드 및 실행:

```bash
docker compose -f deploy/docker/compose.yml up -d --build
```

`compose.yml`은 저장소 루트의 `.env`를 읽습니다.

중요한 변수:

- `PORT`
- `HOST`
- `WORKSPACE_ROOT`
- `WORKSPACE_ROOT_HOST`
- 선택 사항: `IMAGE_NAME`

Docker 경로 매핑 방식:

- 호스트 경로: `WORKSPACE_ROOT_HOST`
- 컨테이너 경로: `WORKSPACE_ROOT`

기본 템플릿 기준으로는 호스트 디렉토리가 `/data`에 마운트됩니다.

헬스체크:

```bash
curl http://127.0.0.1:3001/api/health
```

## 배포

가장 단순한 배포 방식은 다음과 같습니다.

1. Docker 이미지 빌드
2. GHCR에 push
3. 배포 대상 서버에 self-hosted GitHub runner 구성
4. 각 배포 시 compose 서비스를 pull 후 재기동

runner 측 명령 예시:

```bash
export IMAGE_NAME=ghcr.io/<owner>/<repo>:main
docker compose -f deploy/docker/compose.yml pull
docker compose -f deploy/docker/compose.yml up -d
```

## 데이터 저장 구조

워크스페이스 디렉토리 내부 구조:

```text
<workspace>/
├── *.md
├── .assets/
└── .docs/
    ├── auth/
    └── tree-order.json
```

예시:

- 로컬 인증 및 OIDC 설정: `.docs/auth/users.db`
- 업로드된 에셋: `.assets/...`
- 파일 정렬 메타데이터: `.docs/tree-order.json`

중요한 점:

- Markdown 원문은 계속 워크스페이스 디렉토리에 남습니다.
- Foldmark는 그 파일을 웹에서 편집하고 탐색하게 해주는 UI/API 계층입니다.
- 다른 에디터로 같은 파일을 수정해도 서버가 변경을 감지해 웹 UI에 반영합니다.

## 유용한 명령

셸에서 로컬 사용자 생성:

```bash
npm run user:create -- admin strong-password "Admin User"
```

테스트 실행:

```bash
npm test
```

## 참고 사항

- `PORT`가 이미 사용 중이면 서버가 시작되지 않습니다.
- Docker 밖에서 앱을 실행하면 셸 스크립트는 `WORKSPACE_ROOT_HOST`를 실제 워크스페이스 경로로 사용합니다.
- 저장소 루트 `.env`는 로컬 스크립트와 Docker Compose가 함께 사용하도록 의도적으로 통일되어 있습니다.
