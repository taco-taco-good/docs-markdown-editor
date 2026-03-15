# Git Workflow Guide

이 문서는 이 저장소에서 사용할 표준 Git Flow 운영 규칙을 정의합니다.

목표는 다음과 같습니다.

- 배포 브랜치와 개발 브랜치를 명확히 분리한다.
- 기능 추가, 버그 수정, 긴급 수정의 흐름을 일관되게 유지한다.
- 커밋 메시지, PR, 리뷰, 머지 기준을 표준화한다.
- 릴리즈 이력과 배포 기준을 추적 가능하게 만든다.

## 1. 브랜치 전략

이 저장소는 Git Flow를 따른다.

### 장기 유지 브랜치

- `main`
  운영 배포 기준 브랜치다.
  언제든 배포 가능한 상태만 유지한다.

- `develop`
  다음 릴리즈를 통합하는 브랜치다.
  일반 기능 개발은 모두 이 브랜치를 기준으로 시작하고 머지한다.

### 단기 작업 브랜치

- `feature/<ticket>-<short-name>`
  신규 기능 개발

- `bugfix/<ticket>-<short-name>`
  `develop` 기준 일반 버그 수정

- `release/<version>`
  릴리즈 준비 브랜치
  예: `release/0.1.0`

- `hotfix/<version>-<short-name>`
  운영 장애 또는 긴급 수정
  `main`에서 분기해서 `main`과 `develop`에 모두 반영한다.

## 2. 기본 흐름

### 기능 개발

1. `develop`에서 브랜치를 만든다.
2. 기능 개발과 테스트를 진행한다.
3. PR을 `develop`으로 연다.
4. 리뷰 승인 후 머지한다.

예시:

```bash
git switch develop
git pull origin develop
git switch -c feature/123-editor-outline
```

### 일반 버그 수정

1. `develop`에서 `bugfix/*` 브랜치를 만든다.
2. 수정 후 `develop`으로 PR을 연다.

예시:

```bash
git switch develop
git pull origin develop
git switch -c bugfix/245-login-error-state
```

### 릴리즈 준비

1. `develop`에서 `release/*` 브랜치를 만든다.
2. 버전, 문서, 릴리즈 안정화만 수행한다.
3. `release/*`를 `main`으로 머지한다.
4. 같은 내용을 다시 `develop`에도 반영한다.
5. 태그를 만든다.

예시:

```bash
git switch develop
git pull origin develop
git switch -c release/0.1.0
```

### 긴급 운영 수정

1. `main`에서 `hotfix/*` 브랜치를 만든다.
2. 긴급 수정만 수행한다.
3. `main`으로 PR을 머지한다.
4. 동일 내용을 `develop`에도 반영한다.
5. 패치 버전 태그를 만든다.

예시:

```bash
git switch main
git pull origin main
git switch -c hotfix/0.1.1-auth-redirect
```

## 3. 브랜치 네이밍 규칙

브랜치 이름은 다음 규칙을 따른다.

- 소문자만 사용
- 단어 구분은 `-`
- 가능하면 이슈 번호를 포함
- 의미가 분명해야 함

좋은 예:

- `feature/123-docker-deploy`
- `bugfix/245-tree-reorder`
- `release/0.2.0`
- `hotfix/0.2.1-login-loop`

피해야 할 예:

- `feature/test`
- `fix-stuff`
- `my-branch`

## 4. 커밋 메시지 규칙

커밋 메시지는 Conventional Commits 형식을 사용한다.

형식:

```text
type(scope): summary
```

예시:

- `feat(auth): add oidc setup flow`
- `fix(editor): preserve cursor on backspace`
- `docs(git): add repository workflow guide`
- `refactor(server): split auth route handlers`
- `chore(deploy): add docker compose setup`
- `test(search): add search service coverage`

### 허용 타입

- `feat`: 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 변경
- `refactor`: 동작 변경 없는 구조 개선
- `test`: 테스트 추가/수정
- `chore`: 설정, 빌드, 의존성, 운영 작업
- `perf`: 성능 개선
- `ci`: CI/CD 변경

### 커밋 원칙

- 한 커밋은 하나의 논리적 변경만 담는다.
- 리팩터링과 기능 변경을 한 커밋에 섞지 않는다.
- 포맷 변경만 있다면 별도 커밋으로 분리한다.
- 커밋 제목은 72자 이내를 권장한다.

## 5. Pull Request 규칙

모든 변경은 PR을 통해 머지한다.

### PR 제목 규칙

PR 제목도 커밋 메시지와 같은 형식을 권장한다.

예시:

- `feat(editor): add outline toggle controls`
- `fix(auth): handle oidc callback failure`

### PR 본문 필수 항목

PR에는 다음 내용을 포함한다.

- 변경 목적
- 주요 변경 사항
- 테스트 방법
- 영향 범위
- 배포 시 주의 사항
- 관련 이슈 또는 티켓

권장 템플릿:

```markdown
## Summary
- 

## Changes
- 

## How To Test
- 

## Risks
- 

## Related
- Closes #
```

### PR 크기 기준

- 가능한 한 작고 독립적으로 유지한다.
- 리뷰어가 한 번에 이해할 수 있는 크기로 쪼갠다.
- 1개의 PR에 unrelated change를 섞지 않는다.

## 6. 리뷰 기준

리뷰어는 다음을 우선 확인한다.

- 동작 오류 또는 회귀 가능성
- 인증, 권한, 파일 접근 범위 등 보안 문제
- 배포/운영 영향
- 테스트 누락 여부
- 문서 갱신 필요 여부

다음 항목은 머지 전 충족해야 한다.

- 최소 1명 이상 승인
- 필요한 테스트 통과
- 충돌 해결 완료
- 리뷰 코멘트 반영 완료

## 7. 머지 정책

머지는 기본적으로 `Squash and merge`를 사용한다.

이유:

- 작업 브랜치의 중간 커밋을 정리할 수 있다.
- `main`, `develop` 히스토리를 읽기 쉽게 유지할 수 있다.

예외:

- 릴리즈 브랜치와 핫픽스 브랜치는 이력 보존이 필요하면 `Create a merge commit`를 사용할 수 있다.

## 8. 보호 규칙

`main`과 `develop`에는 다음 보호 규칙을 적용한다.

- 직접 push 금지
- PR 필수
- 상태 검사 통과 필수
- 최신 브랜치 기준으로 재검증
- 승인 없는 머지 금지

## 9. 태그 및 릴리즈

운영 배포 버전은 태그로 관리한다.

형식:

```text
v<major>.<minor>.<patch>
```

예시:

- `v0.1.0`
- `v0.1.1`

릴리즈 절차:

1. `release/*` 또는 `hotfix/*`를 `main`에 머지
2. 태그 생성
3. GitHub Release 작성
4. 필요 시 같은 내용을 `develop`에 동기화

## 10. 배포 브랜치 기준

이 저장소의 권장 배포 기준은 다음과 같다.

- `develop`
  통합 테스트 및 스테이징 배포 기준

- `main`
  운영 배포 기준

권장 자동화:

- `develop` push 시 테스트 및 스테이징 이미지 빌드
- `main` push 시 운영 이미지 빌드 및 배포
- 태그 생성 시 버전 고정 릴리즈 생성

## 11. 예시 작업 흐름

### 신규 기능

```bash
git switch develop
git pull origin develop
git switch -c feature/321-template-manager

# 작업
git add .
git commit -m "feat(template): add template management modal"
git push -u origin feature/321-template-manager
```

이후:

1. GitHub에서 `develop` 대상 PR 생성
2. 리뷰 및 수정
3. squash merge

### 긴급 수정

```bash
git switch main
git pull origin main
git switch -c hotfix/0.1.2-healthcheck-fix

# 작업
git add .
git commit -m "fix(deploy): correct container healthcheck"
git push -u origin hotfix/0.1.2-healthcheck-fix
```

이후:

1. `main` 대상 PR 생성
2. 머지 후 태그 생성
3. 같은 수정 내용을 `develop`에 반영

## 12. 금지 사항

- `main`에 직접 push
- 의미 없는 브랜치 이름 사용
- 테스트 없이 운영 브랜치 머지
- 하나의 PR에 기능 추가와 대규모 리팩터링 혼합
- `.env`, 인증 DB, 워크스페이스 데이터, 빌드 산출물 커밋

## 13. 저장소 기본 설정 권장안

GitHub 저장소에서는 다음 설정을 권장한다.

- Default branch: `main`
- Protected branches: `main`, `develop`
- Merge method: squash merge 우선
- Required status checks: test, build, docker image build
- Auto delete head branches: enabled

