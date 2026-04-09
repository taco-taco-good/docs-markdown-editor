# Editor Architecture

## Goal

Foldmark의 새 에디터는 Markdown 원문을 직접 저장하는 visual editor를 목표로 한다. 화면은 항상 에디터 뷰로 보이지만, 저장되는 값은 언제나 Markdown 텍스트 그대로여야 한다. 렌더링 실패나 미지원 문법은 저장 손상으로 이어지면 안 된다.

핵심 원칙은 다음과 같다.

- 저장 원본은 항상 Markdown 문자열 하나다.
- 에디터 화면은 Markdown 위에 얹힌 시각 표현이다.
- 툴바와 단축키는 텍스트를 직접 변형한다.
- 렌더링과 저장을 분리한다.
- 변경 이력은 편집 세션과 별도로 관리한다.

## Architecture Overview

```text
[Filesystem .md]
   ↕
[Server Document Service]
   ↕
[Document State Layer]
   ↕
[Editor Engine Layer / CodeMirror]
   ↕
[Visual Markdown Layer]

save/commit side path:
[Document State Layer] -> [Server write] -> [Versioning Layer / Git]
```

## Layers

### Document State Layer

앱 수준의 문서 상태를 관리한다.

- 소유하는 값
- `currentPath`
- `raw`
- `revision`
- `isDirty`
- `saveStatus`
- conflict 관련 상태

- 책임
- 문서 열기
- autosave 예약
- 저장 성공/실패 반영
- 외부 변경 반영
- 충돌 처리

- 모르는 것
- selection
- cursor
- undo/redo stack
- syntax tree
- decoration/widget

이 레이어는 "무엇을 저장할지"를 안다.

### Editor Engine Layer

실제 편집 세션을 관리한다. 구현은 CodeMirror 6을 사용한다.

- 소유하는 값
- 현재 editor buffer
- selection
- undo/redo history
- IME composition 상태
- viewport

- 책임
- 입력 처리
- transaction 적용
- selection 이동
- keyboard behavior
- clipboard/paste 처리

- 모르는 것
- saveStatus
- server revision 의미
- autosave 정책
- git snapshot 정책

이 레이어는 "지금 사용자가 무엇을 편집 중인지"를 안다.

### Visual Markdown Layer

Markdown을 visual editor처럼 보이게 만드는 표시 계층이다.

- 입력
- editor buffer
- syntax tree
- selection
- viewport

- 출력
- decoration
- widget
- block styling

- 책임
- heading 렌더링
- task checkbox 렌더링
- quote/code block/link/table의 시각 표현
- Markdown 문법 토큰 숨김 또는 약화

- 모르는 것
- 저장
- revision
- dirty state
- git history

이 레이어는 텍스트를 소유하지 않는다. 텍스트를 직접 저장하지 않고, 항상 Editor Engine이 가진 버퍼를 읽어서 표시만 만든다.

### Versioning Layer

문서 저장 이후의 이력을 관리한다. 구현은 로컬 Git을 사용한다.

- 입력
- 저장 성공 이벤트
- 파일 경로
- 변경된 raw markdown

- 출력
- commit
- diff
- restore target

- 책임
- 파일 변경 이력 기록
- rename/delete 이력 보존
- 복구 지점 제공

- 모르는 것
- selection
- syntax tree
- visual rendering
- IME composition

이 레이어는 "문서가 시간에 따라 어떻게 바뀌었는지"를 안다.

## Data Flow

### Open

```text
Filesystem .md
  -> Server reads raw markdown
  -> Document State stores raw, path, revision
  -> Editor Engine initializes buffer from raw
  -> Visual Markdown Layer renders from editor state
```

### Typing

```text
User input
  -> Editor Engine transaction
  -> buffer/selection/history updated
  -> Visual Markdown Layer recomputes visible decorations
  -> Document State receives updated raw
  -> isDirty=true
  -> autosave scheduled
```

### Toolbar Or Shortcut

```text
Toolbar/shortcut
  -> Command Layer computes markdown text transform
  -> Editor Engine applies transaction
  -> Visual Markdown Layer rerenders affected ranges
  -> Document State receives updated raw
```

### Save

```text
Document State autosave
  -> Server writes raw markdown
  -> Server returns new revision
  -> Document State updates saveStatus and revision
  -> Versioning Layer may create git snapshot
```

### External Change

```text
Filesystem changed externally
  -> Server notifies client
  -> Document State decides apply/queue/conflict
  -> if clean: Editor Engine buffer replaced
  -> Visual Markdown Layer rerenders
```

## Storage Model

- 파일 저장 값은 항상 전체 Markdown 문자열이다.
- 에디터 내부에 별도 canonical rich-text 문서 모델을 두지 않는다.
- `serializeDocToMarkdown` 같은 변환 저장 경로는 사용하지 않는다.
- no-op save는 파일을 다시 쓰지 않는다.
- unsupported Markdown은 가능하면 원문 그대로 유지한다.

## Rendering Model

에디터 화면은 항상 visual editor처럼 보인다. raw 모드는 기본 전제로 두지 않는다.

- heading은 시각적으로 제목처럼 보인다.
- task list는 체크박스로 보인다.
- quote는 인용 블록처럼 보인다.
- fenced code block은 코드 블록처럼 보인다.
- link는 링크처럼 보인다.
- table은 우선 시각 정돈을 제공한다.

다만 저장 값은 항상 Markdown 텍스트다. Visual Markdown Layer는 Markdown syntax를 가공해 보이게 만들 뿐, 저장 포맷을 바꾸지 않는다.

## Command Model

툴바와 단축키는 모두 "텍스트 변환 명령"이다.

예시:

- bold: 선택 영역을 `**text**`로 wrap/unwrap
- italic: 선택 영역을 `*text*`로 wrap/unwrap
- inline code: 선택 영역을 `` `text` ``로 wrap/unwrap
- heading: 현재 줄 prefix `#`, `##`, `###` 토글
- bullet list: 선택 줄들에 `- ` prefix 토글
- ordered list: 선택 줄들에 `1. ` 형식 prefix 적용
- task list: 선택 줄들에 `- [ ] ` prefix 토글
- quote: 선택 줄들에 `> ` prefix 토글
- code block: 선택 범위를 fenced code block으로 감쌈
- divider: 현재 위치에 `---` 삽입

명령은 visual DOM을 직접 수정하지 않는다. 항상 Markdown 텍스트를 바꾸고, 시각 표현은 그 결과를 따라간다.

## Integrity Rules

- 저장 원본은 항상 Markdown 문자열이다.
- 렌더링 실패는 저장 실패와 같지 않다.
- preview가 깨져도 raw markdown은 보존되어야 한다.
- 수정하지 않은 unsupported 문법은 저장 후에도 유지되어야 한다.
- 에디터가 이해하지 못하는 문법은 최소한 plain/fallback 표현으로 보여주고, 원문은 유지한다.
- 파일 write는 실제 내용이 달라질 때만 수행한다.

## Editing Rules

### Selection And Cursor

- selection과 cursor의 진실 원본은 Editor Engine이 가진 buffer offset이다.
- Visual Markdown Layer는 selection을 직접 소유하지 않는다.
- 커서 이동 규칙은 visual 위치보다 markdown text offset을 기준으로 안정적으로 정의한다.

### Enter, Backspace, Tab

다음 규칙은 별도 명세로 유지한다.

- task item 끝에서 Enter 시 다음 task item 생성
- 빈 task item에서 Backspace 시 task list 해제
- heading 맨 앞 Backspace 시 heading 해제 여부
- list 안에서 Tab/Shift-Tab의 들여쓰기 규칙
- code block 안 Enter 동작

이 규칙은 구현 전에 fixture 형태로 먼저 고정한다.

### Paste

- plain text paste는 기본적으로 그대로 삽입한다.
- markdown text paste는 markdown 텍스트로 삽입한다.
- html paste는 우선순위를 명확히 정한다.
- image/file paste는 asset 처리 경로와 연결한다.

## Fallback Rules

렌더를 지원하지 않는 문법도 저장은 지원해야 한다.

- wikilink
- raw HTML
- admonition
- custom directive
- unknown fenced block

지원되지 않는 경우의 처리:

- 텍스트는 그대로 유지한다.
- 가능하면 최소 block styling만 적용한다.
- 렌더링이 불가능하면 plain text 형태로 보여준다.
- 자동 정규화나 문법 교정은 하지 않는다.

## Versioning Rules

Versioning Layer는 저장 이력을 위한 별도 계층이다.

- 저장과 commit은 같은 개념이 아니다.
- autosave마다 commit하지 않는다.
- snapshot 생성 시점은 정책으로 분리한다.
- rename/delete도 이력에 남긴다.
- 원격이 없어도 로컬 Git history는 유지한다.

추천 정책:

- 일반 편집은 즉시 파일 저장
- git snapshot은 idle debounce 또는 명시적 스냅샷 시 생성
- commit message는 파일 단위 변경을 설명하는 짧은 형식 사용

## Performance Rules

- preview는 viewport 중심으로 계산한다.
- 보이지 않는 범위의 decoration은 최소화한다.
- syntax tree는 transaction 기반으로 재사용한다.
- 대형 문서에서 전체 재렌더를 피한다.
- outline와 preview 계산은 필요 시 분리한다.

## Testing Strategy

다음 테스트는 필수다.

- no-op save preserves bytes
- toolbar command input/output fixtures
- unsupported markdown preservation
- selection/cursor regression
- IME composition regression
- paste behavior
- external change/conflict handling
- versioning snapshot behavior

## Module Direction

예상되는 주요 모듈은 다음과 같다.

- `packages/web/src/components/editor/MarkdownSourceEditor.tsx`
- `packages/web/src/components/editor/codemirror/extensions.ts`
- `packages/web/src/components/editor/codemirror/live-preview.ts`
- `packages/web/src/components/editor/codemirror/commands.ts`
- `packages/web/src/components/editor/codemirror/widgets.ts`
- `packages/web/src/components/editor/codemirror/outline.ts`
- `packages/web/src/stores/document.store.ts`
- `packages/server/src/services/document.service.ts`
- `packages/server/src/services/versioning.service.ts`

## Explicit Non-Goals

- rich-text canonical model 도입
- markdown 저장을 위한 별도 serializer 경로 유지
- frontmatter 전용 폼 편집기 필수화
- 렌더되지 않는 문법의 자동 수정
- autosave마다 git commit 생성
