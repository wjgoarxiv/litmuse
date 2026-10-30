<p align="center"><picture><source media="(prefers-reduced-motion: reduce)" srcset="./docs/assets/cover-motion-still.webp" /><img src="./docs/assets/cover-motion.webp" width="100%" alt="LitFamily 모션 커버: 일곱 로봇 패널이 차례로 켜지고, 여섯 번째 칸의 LitMuse 로봇이 라임색 바이저와 테두리를 밝힌 뒤 LITFAMILY와 KEEP THE WORK LIT. 문구가 밝아지는 영상" /></picture></p>

<h1 align="center">LitMuse</h1>
<p align="center"><strong>Keep the work lit.</strong></p>

<p align="center">LitMuse는 Meta의 Muse Code에 일하는 습관을 붙여 줍니다. 고치기 전에 계획하고, 만든 것을 확인하고, 끝낼 때 인계 메모를 남깁니다. 그래서 다음 세션이 이번 세션이 멈춘 자리에서 바로 이어집니다. npm 명령 하나로 Muse 플러그인으로 설치됩니다.</p>

<p align="center">
<a href="https://www.npmjs.com/package/@litfamily/litmuse"><img src="https://img.shields.io/npm/v/@litfamily/litmuse?color=FF6337&amp;label=npm" alt="npm version" /></a>
<a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
<a href="https://github.com/wjgoarxiv/litmuse/stargazers"><img src="https://img.shields.io/github/stars/wjgoarxiv/litmuse?style=flat" alt="GitHub stars" /></a>
</p>

<p align="center"><a href="#설치">설치</a> &nbsp; <a href="#빠른-시작">빠른 시작</a> &nbsp; <a href="#상태-카드">상태 카드</a> &nbsp; <a href="#자동-핸드오프">핸드오프</a> &nbsp; <a href="#안전과-제거">안전</a> &nbsp; <a href="./README.md">English</a></p>

## 세션은 이렇게 돌아갑니다

<p align="center"><img src="./docs/assets/readme/demo.webp" width="960" alt="이 Mac에서 실행한 실제 명령 세 개의 터미널 캡처. muse --version은 Muse Code 1.4.11을 출력합니다. litmuse status --card는 lit-plan 경로가 활성 상태이며 계획이 0/2이고 다음 행을 가리킵니다. litmuse models는 호스트 카탈로그의 muse-spark 모델을 보여 줍니다." /></p>

세 줄로 줄이면 계획 세션은 이렇게 흘러갑니다.

```text
입력      lit plan a tiny todo app
동작      lit-plan을 불러와 저장소를 읽고, 작업 순서와 확인 기준을 plans/todo-app.md에 씀
마무리    "계획을 저장했습니다. 괜찮으면 /start-work를 실행하세요."
```

LitMuse는 실제 프로젝트에서 Muse Code를 쓰는 사람에게 맞습니다. 원하는 것은 두 가지입니다. 끝났다는 말보다 먼저 확인한 증거, 그리고 지난번에 멈춘 자리에서 이어지는 세션입니다. 한 번에 끝나지 않는 일에서 가장 쓸모가 있습니다. 테스트를 곁들인 기능, 리팩터, 조사 질문이 그런 일입니다. 발표 슬라이드와 Word 보고서도 만들고, 굳은 한국어와 영어 글도 다듬습니다.

Muse가 세션을 돌리고 lit이 주변 순서를 더합니다.

| 호스트 | lit이 더하는 것 |
| --- | --- |
| 한 줄을 받고 바로 일을 시작합니다 | 목표를 고정하고 떨어지는 테스트를 먼저 씁니다 |
| 긴 세션에서 컨텍스트가 찹니다 | 컴팩션 전에 인계를 쓰고 뒤에 다시 읽습니다 |
| 다음 세션은 빈자리에서 시작합니다 | `lit recap`이 인계를 읽고 다음 일을 가리킵니다 |
| 모델이 끝났다고 하면 끝납니다 | 계획에 맞춰 테스트와 실제 확인으로 검증합니다 |

## 왜 LitMuse인가

Muse Code는 시작이 빠릅니다. 터미널에 한 줄 적으면 바로 일을 시작합니다. 문제는 그다음에 옵니다. 세션이 길어지면 컨텍스트가 차고, 다음 세션은 지난 세션이 알던 것을 모른 채 시작합니다. "끝났다"는 말도 모델이 그렇게 말했다는 뜻일 때가 많습니다. 결국 어디까지 했는지 다시 설명하고, 무엇이 실제로 돌아가는지 손으로 확인하게 됩니다.

LitMuse는 세션마다 따라갈 순서를 줍니다. 프롬프트를 `lit`으로 시작하면 플러그인의 프롬프트 훅이 어떤 LitMuse 스킬을 먼저 불러올지 Muse에 알려 줍니다. 큰 변경은 먼저 `plans/`에 계획으로 적습니다. 작업은 그 계획에 맞춰 테스트와 실제 화면 확인으로 검증하고, 확인하지 못한 부분은 미확인으로 표시합니다. 끝내기 전에는 `.litmuse/handoff/`에 무엇을 만들었고 어떻게 확인했고 무엇이 남았는지 기록합니다.

세션을 돌리고 모델을 고르는 것은 여전히 Muse입니다. LitMuse는 일하는 방식을 더하고, 그 방식은 직접 읽을 수 있는 평범한 파일로 남습니다.

## 설치

Node.js 20 이상과, 한 번 로그인해 둔 Muse Code가 필요합니다. 터미널에서 실행하세요.

```bash
npx @litfamily/litmuse install
```

설치기는 먼저 쓸 위치를 모두 보여 줍니다. 그다음 플러그인을 `~/.local/share/litmuse/bundle`에 복사하고, 바꿀 Muse 파일을 백업한 뒤, `muse plugins install`을 user 범위로 실행합니다. 그래서 모든 프로젝트에서 LitMuse를 쓸 수 있습니다. 스킬과 명령은 설치 직후부터 동작합니다.

Muse는 플러그인의 훅과 에이전트를 사용자가 승인한 뒤에만 실행합니다. 설치기는 승인할 21개(훅 10, 에이전트 11)를 보여 주고 한 번에 승인할지 딱 한 번 묻습니다. 아니라고 답하면 나중에 실행할 `muse plugins approve ...` 줄을 출력합니다. Muse는 플러그인이 업데이트될 때마다 에이전트 승인을 다시 요구하므로, 업데이트 뒤에는 설치기가 그 부분만 한 번 더 묻습니다. 그다음 결과를 확인합니다.

```bash
npx @litfamily/litmuse doctor
```

모두 갖춰지면 `doctor`의 마지막 줄이 `LitMuse doctor: PASS`입니다. 아직 승인을 기다리는 항목은 `APPROVAL NEEDED`와 실행할 명령으로 표시됩니다.

업데이트하려면 설치 명령을 다시 실행하세요. 전부 지우려면 아래 안전과 제거를 보세요.

설치부터 제거까지 이 표의 명령으로 처리합니다.

| 작업 | 명령 |
| --- | --- |
| 설치 | `npx @litfamily/litmuse install` |
| 미리 보기 | `npx @litfamily/litmuse install --dry-run` |
| 업데이트 | `npx @litfamily/litmuse install` |
| 확인 | `npx @litfamily/litmuse doctor` |
| 제거 | `npx @litfamily/litmuse uninstall` |

자주 쓰는 옵션: `--dry-run`은 미리 보기만 하고 아무것도 쓰지 않습니다. `--yes`는 터미널이 붙지 않은 에이전트나 CI 셸에서 설치를 허용합니다(그런 셸에서는 기본으로 미리 보기만 합니다). `--approve`는 질문 없이 승인까지 진행하는 스크립트용입니다. `--scope project`는 한 프로젝트에만 설치합니다.

### 코딩 에이전트에게 설치 맡기기

아무 폴더에서 연 코딩 에이전트에 아래를 붙여 넣으세요.

```text
Meta Muse Code용 LitFamily 플러그인인 LitMuse를 설치해 줘.
공식 npm 패키지 @litfamily/litmuse만 써. 무엇이든 바꾸기 전에 계획을 보여 주고 내 승인을 기다려.
1. Node.js 20 이상과 muse가 PATH에 있는지 확인해 (`muse --version`).
2. 미리 보기: npx @litfamily/litmuse install --dry-run
3. 설치: npx @litfamily/litmuse install --yes
   플러그인이 설치되고 승인 명령 21줄이 출력돼. 승인하기 전에 나에게 묻고, 내가 좋다고 하면
   npx @litfamily/litmuse install --yes --approve 를 실행해.
4. 확인: npx @litfamily/litmuse doctor 를 실행하고 마지막 줄을 알려 줘.
5. 무엇이 쓰였는지("Written:" 목록)와 설치기가 거부한 것이 있으면 알려 줘.
```

## 빠른 시작

1. 프로젝트에서 Muse를 엽니다: `muse`. `/skills`로 LitMuse 스킬을, `/plugins`로 플러그인을 확인합니다.
2. 프롬프트를 `lit`으로 시작합니다. `lit`만 쓰면 lit-loop가 돌고, 뒤에 붙는 낱말이 경로를 고릅니다: `lit plan`, `lit review`, `lit research`, `lit debug`, `lit handoff`, `lit recap`, `lit korean`.
3. 계획이 마음에 들면 `/start-work`로 한 줄씩 테스트와 함께 구현합니다.
4. 끝내기 전에 `lit handoff`. 다음에는 `lit recap`이 어디까지 왔는지 읽어 줍니다.

헤드리스 실행도 같습니다: `muse exec --json "lit plan a tiny todo app" < /dev/null`.

## 상태 카드

Muse의 `/hud`는 켜고 끄는 고정 항목 목록이라서 플러그인 글은 올릴 수 없고, LitMuse는 자체 실시간 기록을 둡니다. 경로, 계획 진행, 지금 돌고 있는 자식 에이전트가 그 기록입니다. `/lit-status`와 `litmuse status --card`로 봅니다. 카드 주변 터미널 모양의 추천 `/hud`와 테마 프리셋은 [docs/hud-preset.md](./docs/hud-preset.md)에 있습니다.

카드는 위에서 아래로 읽습니다. 첫 줄은 워크플로 이름과 실행 시간을 적고, 활성 경로가 없으면 없다고 적습니다. 둘째 줄은 계획 파일 이름과 체크한 행 수, 전체 행 수, 다음으로 풀 행을 적습니다. 레인 줄은 실행 중인 도구와 경과 시간, 끝난 레인을 적습니다.

쉴 때 카드는 활성 경로가 없다고 알립니다.

<p align="center"><img src="./docs/assets/card/idle.webp" width="960" alt="활성 경로가 없는 상태의 상태 카드." /></p>

계획이 돌 때 카드는 경로와 계획 파일, 다음 행을 보여 줍니다.

<p align="center"><img src="./docs/assets/card/working.webp" width="960" alt="lit-plan 경로가 활성 상태인 카드. 계획 파일의 0/2행과 다음으로 풀 행을 가리킵니다." /></p>

행에 체크하면 개수와 다음 행 표시가 바뀝니다.

<p align="center"><img src="./docs/assets/card/after.webp" width="960" alt="첫 행을 체크한 뒤의 같은 카드. 1/2이며 두 번째 행을 다음으로 가리킵니다." /></p>

카드는 프로젝트 밖에 있는 `~/.local/state/litmuse/` 아래 훅 기록을 읽습니다.

## 자동 핸드오프

긴 세션은 모델 컨텍스트를 채우고, Muse가 컴팩션하면 요약에서 세부 사항이 떨어져 나갑니다. 컴팩션 전에 PreCompact 훅이 인계 파일을 쓰고, 컴팩션 뒤에 SessionStart가 새 파일을 대화로 다시 읽어들입니다. 두 명령으로 씁니다. 멈추기 전에 `lit handoff`, 돌아오면 `lit recap`. 패킷에는 만든 것, 확인한 방법, 남은 일이 들어갑니다.

훅은 기록 한 줄로 답합니다.

<p align="center"><img src="./docs/assets/handoff/saved.webp" width="960" alt="PreCompact 훅의 출력 한 줄. .litmuse/handoff/latest.md를 저장했다고 기록합니다." /></p>

스냅샷에는 실행 계기, 세션, 경로, 열린 행이 있는 계획, 최근 기록 줄이 들어갑니다.

<p align="center"><img src="./docs/assets/handoff/latest.webp" width="960" alt="인계 스냅샷. 실행 계기와 세션, lit-plan 경로, 0개 체크와 2개 열린 행의 계획, 최근 기록 줄을 보여 줍니다." /></p>

## 만들 수 있는 것

품질 패리티 라운드에서 Mac에서 직접 렌더한 결과물 4종입니다. 파일을 열어 눈으로 읽고, 어색한 곳은 고쳐 다시 렌더했습니다.

<p align="center"><img src="./docs/assets/parity/lit-adhd-brief.png" width="960" alt="실제 터미널의 lit-adhd 브리프. 무지개 헤드라인, 목표와 작업 시간이 적힌 활성 세션 카드 하나, 도구, 완료된 커밋, 박스형 권장 다음 단계." /></p>

`lit-adhd`는 실행 중 세션을 브리핑합니다. 상태 뱃지가 달린 세션 카드와 종료 표, 박스형 권장 다음 단계 — 터미널 색상 그대로, 내부 필드 이름은 새지 않습니다.

<p align="center"><img src="./docs/assets/parity/lit-pptx-deck.png" width="960" alt="lit-pptx 상태 덱. KPI 행과 웨이브별 스위트 증가 막대 차트." /></p>

`lit-pptx`는 자료로 실제 덱을 엮습니다. 이 덱은 포팅 웨이브별 테스트 스위트 증가를 그립니다.

<p align="center"><img src="./docs/assets/parity/lit-schematic-pid.png" width="960" alt="lit-schematic P&ID. 탱크 TK-101, 상용·예비 도징 펌프, 릴리프 밸브 스필백, 계장 버블, 라인 번호, 심벌 범례, EX-PID-001 타이틀 블록을 갖춘 차아염소산나트륨 도징 스키드." /></p>

`lit-schematic`은 QA를 통과한 P&ID를 그립니다. 실제 심벌과 범례, 라인 번호, 타이틀 블록을 갖춘 도징 스키드이며, 모든 라벨이 읽힐 때까지 일곱 번 고쳐 그렸습니다.

<p align="center"><img src="./docs/assets/parity/lit-frontend-page.png" width="960" alt="frontend-ui-ux 갤러리 페이지. 어두운 원장과 형광 악센트, 렌더마다 플레이트 하나, 휴대전화·태블릿·데스크톱 너비에서 확인." /></p>

`frontend-ui-ux`는 이를 감싸는 페이지를 만듭니다. 렌더 한 종마다 플레이트 하나인 갤러리이며, 휴대전화·태블릿·데스크톱 너비에서 확인했습니다.

## 들어 있는 것

**스킬 39개.** 필요할 때 불러오는 밀도 높은 Muse 스킬이며, 각 스킬에 필요한 참고 문서, 스크립트, 템플릿, 엔진이 그 스킬 폴더 안에 함께 들어 있습니다. 카탈로그에는 짧은 설명만 올라가며, 모두 합쳐 약 3.7 KB라서 개인 스킬이 많은 환경에서도 자리를 지킵니다.

아래 모든 스킬은 각자 폴더에 들어 있으며 필요할 때 불러옵니다. 하려는 일에 맞는 행을 찾으세요.

| 분야 | 스킬 | 역할 |
| --- | --- | --- |
| 작업 고리 | lit-loop, litgoal, litwork | 목표 고정, 떨어지는 테스트 먼저, 기록 남기기 |
| 계획과 구현 | lit-plan, start-work, lit-code, debugging, refactor, lit-commit, lsp, lsp-setup | 계획서 작성, 행별 구현 |
| 아이디어 다지기 | lit-brainstorm, deep-interview, lit-crucible | 넓히기, 묻기, 압박 테스트 |
| 검토와 정리 | review-work, visual-qa, comment-checker, lit-burnoff, lit-burnoff-file | 다시 보기, 잔재 지우기 |
| 조사 | litresearch, autoresearch, autoconference, wikify, lit-comprehend | 병렬 탐색, 근거 추적 |
| 팀 | lit-team | 하나의 패킷 뒤 자식 에이전트 |
| 글 | lit-humanizer | 한국어와 영어 다듬기, 사실 유지 |
| 이어 가기 | lit-recap, lit-handoff, lit-init, rules | 인계, 회고, 길잡이 |
| 화면과 문서 | frontend-ui-ux, readme-studio | 접근 쉬운 화면, 사실 확인된 README |
| 문서와 그림 | lit-docx, lit-pptx, lit-scientific-visualization, lit-diagram-drawer | 데크, 꾸민 문서, 그래프, 다이어그램 |
| 영상과 표지 | lit-typographic-motion | 짧은 영상과 표지 고리, 인코딩본 검사 |
| 도구 | structural-search, browser-drive | 코드 모양 검색, 살아 있는 페이지 |

문서, 다이어그램, README 표지, 그림 스킬은 버전이 고정된 엔진(`office`, `diagram`, `readme`, `sciviz`)을 함께 씁니다. 엔진은 처음 쓸 때 `~/.local/share/litmuse/runtime/<이름>`에만 설치됩니다. Muse의 프록시 전용 샌드박스에서는 이 첫 설치가 막힐 수 있으니 터미널에서 `npx @litfamily/litmuse runtime install all`로 미리 설치해 두세요(`runtime status`로 상태를 봅니다). 모션 스킬의 엔진(`motion`: 글꼴 묶음과 타입 엔진 패키지)은 터미널에서만 설치되므로, `runtime install motion`(또는 `all`)으로 들입니다. 이 스킬들은 내 컴퓨터에 이미 있는 프로그램도 씁니다: Python 3.10~3.14(더 새로운 `python3`는 건너뛰고 이 범위에서 가장 새로운 `python3.X`를 씀), LibreOffice, pandoc, Poppler, Chrome 또는 Chromium, ffmpeg, libwebp(`img2webp`, `dwebp`), ast-grep, 그리고 `lsp` 스킬이 부르는 언어 검사 도구. 빠진 것과 설치 명령은 `doctor`가 알려 주며, LitMuse가 전역으로 무언가를 설치하는 일은 없습니다.

**명령 4개**: `/lit <경로> <작업>`, `/lit-korean <파일 또는 글>`, `/lit-status`, `/lit-hud`.

**훅 10개**: SessionStart(LitMuse 컨텍스트와 경로 표. 컴팩션 뒤에는 저장해 둔 인계 메모를 한 번 다시 넣고, `litmuse style`로 고른 답변 스타일도 더함), UserPromptSubmit(맨 앞의 `lit` 활성화. 같은 경로가 이미 켜져 있으면 이어서 진행, 다른 경로면 전환, 맨 `lit`은 시작한 계획을 재개, `lit new`·`lit restart`는 새로 시작), PreToolUse(lit-plan 동안 write_file·edit_file·apply_patch·delete_file 쓰기는 `plans/`와 `.litmuse/` 안으로 제한하고 셸 명령은 읽기 전용만 허용, 자식 에이전트는 읽기 전용 LitMuse 에이전트만 허용, 모든 경로에서 쓰기가 Markdown이나 텍스트 글에 새로 더하는 부정문 몰림과 얼버무림 몰림 검사), PostToolUse(도구 기록, 편집이 새로 더한 한 줄 주석을 comment-checker에 넘기고 쓴 글에는 lit-humanizer 참고 검사. 모션 경로에서는 렌더 실행과 `read_file`로 연 이미지도 기록), PostToolUseFailure(기록), Stop(lit-plan 턴은 계획 파일이 생긴 뒤 끝나고, 같은 세션에서 30분 안에 `go` 한 단어를 입력하면 그 계획을 start-work로 시작. 모션 턴은 마지막 렌더가 스킬의 완료 검사를 통과하면 끝나고, 두 번 붙잡은 뒤에는 아직 끝나지 않았다고 분명히 말하게 함. start-work는 계획 행이, litgoal은 기준이 남아 있으면 이어 가되 진전 없이 연속 3번까지만 붙잡음), PreCompact(Muse가 컴팩션하기 전에 `.litmuse/handoff/latest.md`를 씀), SubagentStart(자식 에이전트의 보고 형식), SubagentStop·SessionEnd(기록 줄). 훅은 경로, 계획 진행, 실행 중인 자식 에이전트와 세션별 활동 상태(PostToolUse는 alive, Stop은 idle, SessionEnd는 ended)도 실시간 기록으로 남기며, Muse의 `/hud`는 고정 항목만 보여 주므로 이 기록은 `/lit-status`와 `npx @litfamily/litmuse status --card`로 봅니다. 카드는 같은 프로젝트의 다른 세션을 실행 중인 것부터 쉬는 것 순으로 보여 주고, 끝난 start-work는 1분 동안 done으로 두었다가 지우며, herdr 창 세션은 `<skill> · <pane>`으로 표시하고, 세션 시작 뒤 더 새 LitMuse가 설치되면 `restart to <버전>`을 띄웁니다.

**에이전트 11개**, `litmuse/<이름>`으로 띄웁니다: lit-planner, lit-executor, lit-verifier, qa-runner, quality-reviewer, librarian-researcher, 그리고 한국어 글 에이전트 다섯. 리뷰어와 한국어 에이전트는 읽기와 검색 도구만 씁니다.

**모델**: `npx @litfamily/litmuse models`는 내 Muse가 제공하는 모델과 추론 단계를 Muse 자체 카탈로그에서 읽어 보여 줍니다. Meta가 나중에 추가하는 모델도 LitMuse 업데이트 없이 그대로 나타납니다.

## 계획 턴에서 할 수 있는 일

`lit plan` 턴은 계획 전용이며, PreToolUse 훅이 허용 목록으로 이를 지킵니다. 목록에 없는 도구는 MCP 도구와 나중에 Muse에 추가되는 도구까지 모두 거부됩니다.

- 읽기 도구: `read_file`, `search`, `read_skill`, `web_search`, `web_fetch`, `read_memory`, `work_status`, `work_list`, `subagent_status`, `subagent_wait`, `subagent_read_result`, `subagent_cancel`, `request_user_input`, `get_goal`, `cron_list`.
- 파일 쓰기(`write_file`, `edit_file`, `apply_patch`, `delete_file`)는 `..`와 심볼릭 링크를 풀어 본 뒤 `plans/`와 `.litmuse/` 안에서만 허용합니다.
- 셸(`bash`, `exec_command`, `shell`)은 `ls`, `cat`, `head`, `tail`, `wc`, `rg`, `git log|status|diff|show` 중 하나를 허용된 플래그로만 쓴 단일 명령일 때 통과합니다. `;`, `&`, `|`, `<`, `>`, 백틱, `$`, 줄바꿈이 들어가면 거부되고, `bash_input`도 거부됩니다.
- 자식 에이전트는 읽기 전용 `litmuse/*` 에이전트(lit-planner, librarian-researcher, lit-verifier, quality-reviewer, 한국어 글 에이전트)만 띄울 수 있습니다.

경로 상태는 프로젝트 밖 `~/.local/state/litmuse/`에 두어 계획 턴의 어떤 도구도 닿지 못합니다. 계획 턴 중에 이 상태가 사라지거나 깨져도 제한은 그대로 유지됩니다. 훅마다 선언된 명령에 코드 digest가 들어 있어서, 업데이트로 훅이 바뀌면 Muse가 승인을 다시 묻습니다.

## 다른 도구와 함께 쓰기

Muse는 다른 코딩 도구용으로 써 둔 개인 규칙과 개인 스킬도 함께 읽습니다(사용자 규칙 파일, 개인 스킬 폴더 등). 그 규칙은 사용자 것이므로 LitMuse는 이 동작을 그대로 둡니다. 대신 세션 컨텍스트로 lit 경로마다 LitMuse 스킬을 쓰도록 안내하고, 개인 스킬 이름이 LitMuse 스킬과 같거나 다른 도구의 플러그인 폴더에서 왔으면 `doctor`가 경고합니다. 깨끗한 실행이 필요하면 `/settings`에서 "Personal rules fallback"과 "Personal skills fallback"을 끄세요. 헤드리스 실행은 `muse exec --no-foreign-personal-context`를 쓰면 됩니다(1.4.11의 대화형 `muse`는 이 플래그를 받지 않습니다).

## Muse 자체 규칙 파일의 짧은 블록

Muse에는 자기만의 사용자 규칙 파일 `~/.config/muse/AGENTS.md`(`$XDG_CONFIG_HOME`이 있으면 `$XDG_CONFIG_HOME/muse/AGENTS.md`)가 있고, 신뢰하는 작업 폴더인지와 상관없이 세션이 시작될 때마다 사용자 범위 규칙으로 읽습니다. 자세한 안내는 이미 LitMuse 훅이 싣고 있으므로 이 파일에는 기본 원칙만 짧은 블록으로 넣습니다. `lit`는 LitMuse의 활성화 단어라는 것, 계획과 핸드오프가 있는 곳, 사용자의 명시적인 동의 없이는 push·publish·tag·버전 올리기를 하지 않는다는 것, 테스트가 통과하고 바뀐 화면이나 동작을 실제로 확인한 뒤에만 끝났다고 말한다는 것입니다.

넣을지는 사용자가 정합니다. 터미널에서 설치하면 한 번 묻고(기본값은 예, 아니요는 기억합니다), `--yes`를 주면 넣고, 터미널이 없고 `--yes`도 없는 설치는 절대 쓰지 않습니다. `--no-agent-file`은 이번 실행만 건너뜁니다. `npx @litfamily/litmuse config agentFile off`는 블록을 바로 지우고 꺼 둔 상태로 두며, `config agentFile on`은 다시 넣습니다.

`<!-- litfamily:litmuse:start … -->`와 `<!-- litfamily:litmuse:end -->` 사이의 줄만 LitMuse의 것입니다. 나머지 내용은 바이트 그대로 남습니다. 블록을 지우면 파일이 원래대로 돌아오고(블록 때문에 새로 만든 파일이면 파일도 지웁니다), Windows 줄바꿈은 유지되며, 블록을 처음 넣을 때 원본 사본이 `~/.local/share/litmuse/backups/`에 한 부 저장됩니다. 심볼릭 링크, UTF-8이 아닌 파일, 짝이 맞지 않는 마커는 건드리지 않고 알려 줍니다. Muse는 규칙 파일을 32,000바이트에서 잘라 읽으므로, 그 이상 긴 파일에는 설치기가 아무것도 쓰지 않고 `doctor`가 블록이 읽히지 않는다고 알려 줍니다. `doctor`와 `status`는 상태를 `present`, `stale`, `absent`, `malformed`, `off` 중 하나로 보여 줍니다. Muse에서 `/rules import`로 파일을 덮어쓰면 블록도 함께 사라지는데, `install`을 다시 실행하면 돌아옵니다.

## 안전과 제거

- 설치기는 `~/.local/share/litmuse/`에 쓰고, `muse` CLI를 거쳐 Muse의 플러그인 저장소와 설정에 씁니다. 그 전에 `~/.config/muse/settings.json`과 Muse의 `installed.json`을 백업하며, Muse 인증 파일은 열어 보지 않습니다. 이 밖에 손대는 파일은 Muse의 사용자 규칙 파일 하나뿐이고, 그것도 표시된 자기 블록 안에서만 씁니다(위 참고).
- 번들 폴더가 심볼릭 링크이거나, 다른 사람의 파일이 들어 있거나, 설치 후 수정되었으면 교체를 거부합니다.
- `~/.claude`와 `~/.codex` 아래에는 아무것도 쓰지 않으며, 테스트가 이를 고정합니다.
- 훅은 실패해도 세션을 막지 않고 그대로 통과시킵니다.
- 엔진 캐시는 `~/.local/share/litmuse/runtime/` 아래에 있고, 설치 상태는 `npx @litfamily/litmuse runtime status`로 봅니다. `uninstall`은 캐시를 남기므로 공간을 비우려면 그 폴더를 지우세요.
- 전부 지우려면 `npx @litfamily/litmuse uninstall`(미리 보려면 `--dry-run`). 규칙 파일의 블록도 함께 빠집니다. 프로젝트 안의 계획과 `.litmuse/` 폴더는 그대로 남습니다.

## 패밀리

LitMuse는 LitFamily 패키지 일곱 개 가운데 하나이고, 표지의 로봇 일곱이 그 일곱 패키지입니다. 패키지마다 코딩 에이전트 하나에 같은 작업 방식을 들여오며 각자 따로 설치되어 동작하므로, 쓰는 에이전트에 맞는 하나만 설치하면 됩니다.

## 라이선스

MIT, © LitMuse contributors. LitMuse는 독립 커뮤니티 프로젝트이며 Meta와 제휴하거나 Meta의 보증을 받은 프로젝트가 아닙니다.

LitMuse와 LitFamily 이름, 로고, 마스코트 그림에는 [TRADEMARK.md](./TRADEMARK.md)가 적용됩니다.
