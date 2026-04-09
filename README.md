# Foldmark

[English](./README.en.md)

로컬 폴더를 그대로 쓰고 싶은 1인 사용자를 위한 self-hosted Markdown workspace입니다.

Foldmark는 문서를 데이터베이스에 넣지 않습니다.  
노트는 끝까지 `.md` 파일로 남고, 웹에서는 검색, 탭, 개요, 라이브 프리뷰 편집을 바로 사용할 수 있습니다.

## Foldmark가 무엇인가

Foldmark는 “Markdown 파일을 웹에서 다루기 좋은 작업 공간으로 바꾸는 앱”입니다.

보통 이런 문제를 해결하려고 만들었습니다.

- 로컬 폴더에 쌓인 Markdown 문서를 브라우저에서 더 편하게 보고 싶을 때
- Notion류 편집감은 좋지만, 파일이 앱 안에 갇히는 건 싫을 때
- 한 사람이 자기 문서 폴더를 오래 관리할 수 있는 조용한 도구가 필요할 때

즉 Foldmark는 팀 협업 문서 플랫폼보다는, 한 사람이 자기 문서를 계속 쌓아가는 용도의 제품에 가깝습니다.

## 왜 다른 Markdown 편집기 대신 Foldmark인가

- 파일이 그대로 남습니다.
  문서는 일반 Markdown 파일로 저장되고, 워크스페이스 폴더가 곧 실제 데이터입니다.
- 웹에서 쓰기 편합니다.
  빠른 열기, 탭, 개요, 검색, 라이브 프리뷰를 한 화면에서 씁니다.
- 포맷이 잠기지 않습니다.
  앱을 떠나도 다른 편집기, Git, 백업 워크플로우와 그대로 연결됩니다.
- self-hosted 하기 쉽습니다.
  개인 서버나 홈서버에 올려 두고 자기 문서 공간처럼 사용할 수 있습니다.

## Screenshots

### 워크스페이스

![Foldmark workspace overview](docs/assets/readme/workspace-overview.png)

### 빠른 열기

![Foldmark quick open](docs/assets/readme/quick-open.png)

### 에디터 상세

![Foldmark editor detail](docs/assets/readme/editor-detail.png)

## 핵심 기능

### Markdown-native editor

- Markdown 원문을 유지하는 visual editor
- 체크리스트, 표, 코드블록, 링크 라이브 프리뷰
- 긴 문서에서도 빠르게 이동할 수 있는 개요 패널
- 여러 문서를 오가도 맥락이 유지되는 탭 기반 세션

### Personal workspace

- 로컬 폴더 기반 파일 트리
- 빠른 열기와 검색
- 내부 문서 링크와 `@문서경로` 참조
- 템플릿과 에셋 업로드

### Self-hosted operation

- 로컬 계정 인증
- OIDC 로그인
- Docker / Docker Compose 배포
- 외부 파일 변경 반영

## 어떤 사람에게 맞는가

- 자기 문서를 Markdown 파일로 직접 관리하고 싶은 사람
- 개인 위키, 연구 노트, 작업 로그, 설계 메모를 한 곳에서 다루고 싶은 사람
- “파일은 로컬에 두고, UI만 좋아졌으면 좋겠다”는 사람

## 어떤 데이터가 어디에 저장되나

Foldmark의 핵심은 단순합니다.

- 문서는 `.md`
- 에셋은 `.assets/`
- 앱 메타데이터는 `.docs/`

예시:

```text
workspace/
├── .assets/
├── .docs/
├── notes/
├── guides/
└── *.md
```

즉 Foldmark는 문서를 별도 DB에 가두지 않고, 파일시스템 위에 얇은 편집 레이어를 얹습니다.

## 배포 서버 기준 빠른 시작

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
WORKSPACE_ROOT_HOST=/srv/foldmark-data
HOST=0.0.0.0
PORT=3001
WEB_PORT=5173
PUBLIC_HOST=docs.example.com
```

중요한 값:

- `WORKSPACE_ROOT`: 앱이 읽는 워크스페이스 경로
- `WORKSPACE_ROOT_HOST`: 실제 호스트 디렉토리
- `HOST`, `PORT`: 서비스가 바인딩될 주소
- `PUBLIC_HOST`: 외부 접근 주소

### 3. 배포 서버에서 실행

단일 포트 프로덕션 스타일 실행:

```bash
npm run serve
```

기본 접속 주소 예시:

```text
http://127.0.0.1:3001
```

### 4. 첫 실행 인증 설정

최초 실행 시 Setup 화면이 나타납니다.

- 로컬 계정 생성
- OIDC 공급자 연결

OIDC callback 예시:

```text
https://docs.example.com/auth/oidc/callback
```

## Docker 배포

Docker 배포 파일은 `deploy/docker` 아래에 있습니다.

```bash
docker compose -f deploy/docker/compose.yml up -d --build
```

주요 환경 변수:

- `PORT`
- `HOST`
- `WORKSPACE_ROOT`
- `WORKSPACE_ROOT_HOST`
- `IMAGE_NAME` (선택)

헬스체크:

```bash
curl http://127.0.0.1:3001/api/health
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

## 현재 범위

현재 구현된 범위:

- 로컬 markdown 워크스페이스 탐색, 열기, 편집
- visual markdown editor
- 파일 트리, 검색, 탭, 개요, 템플릿, 에셋 업로드
- 로컬 인증, OIDC
- REST API + SSE 기반 변경 반영

아직 구현하지 않은 범위:

- 독립 CLI 패키지
- MCP 서버
- Yjs/CRDT 기반 동시 편집
- Git 기반 버전 히스토리
