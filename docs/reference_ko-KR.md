# LitMuse 참고 자료

[English](./reference.md) · **한국어** · [README로 돌아가기](../README_ko-KR.md)

처음 설치할 때는 몰라도 되는 내용을 모았습니다. 훅마다 하는 일, 상태 카드 뒤의 실시간 기록이 세션을 보여 주는 방식,
LitMuse가 Muse 자체 규칙 파일에 넣을 수 있는 짧은 블록입니다.

## 훅

LitMuse에는 훅 10개가 있습니다. Muse는 사용자가 승인한 뒤에만 훅을 실행하고, 훅마다 선언된 명령에 코드 digest가
들어 있어서 업데이트로 훅이 바뀌면 승인을 다시 묻습니다.

| 훅 | 하는 일 |
| --- | --- |
| SessionStart | LitMuse 컨텍스트와 경로 표. 컴팩션 뒤에는 저장해 둔 인계 메모를 한 번 다시 넣고, `litmuse style`로 고른 답변 스타일도 더합니다. |
| UserPromptSubmit | 맨 앞의 `lit` 활성화. 같은 경로가 이미 켜져 있으면 이어서 진행하고, 다른 경로면 전환하며, 맨 `lit`은 시작한 계획을 재개하고, `lit new`·`lit restart`는 새로 시작합니다. |
| PreToolUse | lit-plan 동안 write_file·edit_file·apply_patch·delete_file 쓰기는 `plans/`와 `.litmuse/` 안으로 제한하고, 셸 명령은 읽기 전용만, 자식 에이전트는 읽기 전용 LitMuse 에이전트만 허용합니다. 모든 경로에서 쓰기가 Markdown이나 텍스트 글에 새로 더하는 부정문 몰림과 얼버무림 몰림을 검사합니다. |
| PostToolUse | 도구 기록. 편집이 새로 더한 한 줄 주석을 comment-checker에 넘기고, 쓴 글에는 lit-humanizer 참고 검사를 합니다. |
| PostToolUseFailure | 기록. |
| Stop | lit-plan 턴은 계획 파일이 생긴 뒤 끝나고, 같은 세션에서 30분 안에 `go` 한 단어를 입력하면 그 계획을 start-work로 시작합니다. start-work는 계획 행이, litgoal은 기준이 남아 있으면 이어 가되 진전 없이 연속 3번까지만 붙잡습니다. |
| PreCompact | Muse가 컴팩션하기 전에 `.litmuse/handoff/latest.md`를 씁니다. |
| SubagentStart | 자식 에이전트의 보고 형식. |
| SubagentStop | 기록 줄. |
| SessionEnd | 기록 줄. |

PreToolUse가 지키는 계획 턴 허용 목록 전체는 README의
[계획 턴에서 할 수 있는 일](../README_ko-KR.md#계획-턴에서-할-수-있는-일)에 있습니다.

## 카드 뒤의 실시간 기록

Muse의 `/hud`는 고정 항목만 보여 주므로, 훅이 따로 실시간 기록을 남깁니다. 경로, 계획 진행, 실행 중인 자식
에이전트, 그리고 세션별 활동 상태(PostToolUse는 alive, Stop은 idle, SessionEnd는 ended)입니다.
`/lit-status`와 `npx @litfamily/litmuse status --card`로 봅니다.

- **다른 세션.** 카드는 같은 프로젝트의 다른 세션을 실행 중인 것부터 쉬는 것 순으로 보여 줍니다.
- **끝난 일.** 끝난 start-work는 1분 동안 done으로 두었다가 지웁니다.
- **herdr 창.** herdr 창 세션은 `<skill> · <pane>`으로 표시합니다.
- **업데이트.** 세션 시작 뒤 더 새 LitMuse가 설치되면 `restart to <버전>`을 띄웁니다.

## Muse 자체 규칙 파일의 짧은 블록

Muse에는 자기만의 사용자 규칙 파일 `~/.config/muse/AGENTS.md`(`$XDG_CONFIG_HOME`이 있으면
`$XDG_CONFIG_HOME/muse/AGENTS.md`)가 있고, 신뢰하는 작업 폴더인지와 상관없이 세션이 시작될 때마다 사용자 범위 규칙으로
읽습니다. 자세한 안내는 이미 LitMuse 훅이 싣고 있으므로 이 파일에는 기본 원칙만 짧은 블록으로 넣습니다.

블록에 담기는 내용은 네 가지입니다. `lit`는 LitMuse의 활성화 단어라는 것, 계획과 핸드오프가 있는 곳, 사용자의 명시적인
동의 없이는 push·publish·tag·버전 올리기를 하지 않는다는 것, 테스트가 통과하고 바뀐 화면이나 동작을 실제로 확인한
뒤에만 끝났다고 말한다는 것입니다.

**넣을지는 사용자가 정합니다.**

| 실행 | 블록은 어떻게 되나 |
| --- | --- |
| 터미널에서 설치 | 한 번 묻습니다. 기본값은 예이고, 아니요는 기억합니다 |
| `--yes`를 준 설치 | 넣습니다 |
| 터미널도 `--yes`도 없는 설치 | 절대 쓰지 않습니다 |
| `--no-agent-file` | 이번 실행만 건너뜁니다 |
| `npx @litfamily/litmuse config agentFile off` | 블록을 바로 지우고 꺼 둔 상태로 둡니다 |
| `config agentFile on` | 다시 넣습니다 |

**사용자 글은 그대로 남습니다.** `<!-- litfamily:litmuse:start … -->`와 `<!-- litfamily:litmuse:end -->` 사이의 줄만
LitMuse의 것입니다.

- **바이트 그대로.** 블록을 지우면 파일이 원래대로 돌아오고(블록 때문에 새로 만든 파일이면 파일도 지웁니다), Windows
  줄바꿈은 유지됩니다.
- **백업.** 블록을 처음 넣을 때 원본 사본이 `~/.local/share/litmuse/backups/`에 한 부 저장됩니다.
- **건드리지 않는 파일.** 심볼릭 링크, UTF-8이 아닌 파일, 짝이 맞지 않는 마커는 건드리지 않고 알려 줍니다.
- **길이.** Muse는 규칙 파일을 32,000바이트에서 잘라 읽으므로, 그 이상 긴 파일에는 설치기가 아무것도 쓰지 않고
  `doctor`가 블록이 읽히지 않는다고 알려 줍니다.
- **상태.** `doctor`와 `status`는 상태를 `present`, `stale`, `absent`, `malformed`, `off` 중 하나로 보여 줍니다.
- **`/rules import`.** Muse에서 `/rules import`로 파일을 덮어쓰면 블록도 함께 사라지는데, `install`을 다시 실행하면
  돌아옵니다.
