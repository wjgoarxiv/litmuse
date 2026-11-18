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

## 계획 승인 때 거는 목표

Muse는 세션마다 목표 하나를 둡니다. 모델이 `create_goal`로 걸고 `update_goal`로 닫으며, 직접 `/goal clear`로 끝낼 수도
있습니다. LitMuse는 계획이 그럴 만할 때만 목표를 묻습니다.

lit-plan이 쓴 계획에는 테스트 명령 하나를 적은 `## Done when` 블록이 있습니다(`- check: \`npm test\``). 계획을 저장하면
lit-plan이 `goal-propose.mjs`를 돌려 이 블록을
``Every row in plans/flag.md is ticked and `npm test` exits 0 [lit:4c7a9a52]`` 같은 목표 문장 하나로 바꿉니다. 판단하는
말("works", "잘 동작"), push나 publish만으로 된 성공, 짧은 테스트 허용 목록 밖의 명령, 500자를 넘는 문장은 거절하고,
검사를 한 번 돌려 목표가 아직 참이 아님을 확인합니다. 그러면 승인 질문이
`Approve plan, start work and set goal: /goal <목표>? (yes / edit / no)`가 됩니다. 목표를 걸 수 없으면
`Approve plan and start work? (yes / no)`가 되고, 그 아래에 `No goal set: <이유>` 한 줄이 붙습니다.

답할 수 있는 건 질문을 받은 그 세션뿐이고, 30분 안이어야 합니다. 다른 세션에서 친 `yes`는 아무것도 시작하지 않고 `Approval not recorded for this session. Run: lit start plans/<f>.md` 한 줄을 보여 줍니다. 한 번 돌고 끝나는 `muse exec` 뒤에는 `lit start plans/<f>.md`로 계획을 시작하거나, 같은 세션을 다시 열어 `yes`라고 답하면 됩니다. 정확히 `yes`라고 답하면 두 가지가 한 번에 됩니다. 프롬프트 훅이 그 계획으로 start-work를 시작하고(직접
`lit start plans/<f>.md`를 친 것과 같은 시작입니다) 모델에게 그 목표를 걸라고 말합니다. 시작이 거절되면(다른 살아 있는
세션이 이미 그 계획으로 start-work를 돌리고 있거나, 열린 행이 없을 때) 아무것도 시작하지 않고 목표도 걸지 않으며,
`Work not started and no goal set: <이유>` 줄을 보여 줍니다. `no`는 아무것도 시작하지 않습니다. PreToolUse는 `[lit:…]` 꼬리표가 붙은 다른 목표를 모두 막으므로, `yes` 없이 생긴 LitMuse 목표는 없습니다.
내 목표가 이미 있으면 LitMuse는 그렇다고 말하고 건드리지 않습니다. 모든 행이 체크되면 Stop 훅이 모델에게 한 번
검사를 돌리고 0으로 끝나면 목표를 닫으라고 하며, `lit cancel`은 blocked로 닫습니다. 기록은 `.litmuse/goal/`에
(질문, 답, 소유) 남고, 아무도 답하지 않은 질문은 SessionStart가 치웁니다.

읽기만 하는 스킬(lit-adhd, review-work, litresearch, 브레인스토밍 스킬 등)은 frontmatter에 `goal: never`가 있어 목표를
걸지 않습니다.

## lit 경로에 붙는 도우미 스킬

`lit` 뒤의 `+` 낱말(`lit +viz 결과 그려 줘`, `lit plan +research +ast`)은 경로 옆에 도우미 스킬을 붙입니다. 할 일 문장이
분명히 원할 때(차트, 다이어그램, 자료 조사, 코드 모양 검색)는 LitMuse가 알아서 붙이며, 코드 블록과 코드 조각, 인용은
읽지 않고 넘깁니다. 한 번에 최대 세 스킬이고 경로가 맨 앞입니다. 활성화 문맥에 각 스킬과 그 이유가 적히고, LitFamily
확장으로 옮긴 도우미는 설치 줄이 한 번 따라옵니다.

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
