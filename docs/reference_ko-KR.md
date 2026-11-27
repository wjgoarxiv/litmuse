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
| UserPromptSubmit | 맨 앞의 `lit` 활성화. 같은 경로가 이미 켜져 있으면 이어서 진행하고, 다른 경로면 전환하며, 맨 `lit`은 시작한 계획을 재개하고, `lit new`·`lit restart`는 새로 시작합니다. start-work 실행 중에는 `lit approve`, `lit approve x`, `lit deny`, `lit skip-row [N]`, `lit pause`, `lit resume`, `lit cancel`에 직접 답합니다. `lit` 없는 프롬프트에는 제안 메모 하나를 붙입니다. 제한 시간 110초(재실행 한 번분). |
| PreToolUse | lit-plan 동안 write_file·edit_file·apply_patch·delete_file 쓰기는 `plans/`와 `.litmuse/` 안으로 제한하고, 셸 명령은 읽기 전용만, 자식 에이전트는 읽기 전용 LitMuse 에이전트만 허용합니다. start-work 실행 중에는 실행 가드가 통과시키지 않는 단계를 보관하고, 비밀과 호스트 홈은 거절하며, `create_goal`은 `goal: native` 계획에만 허용합니다. 모든 경로에서 쓰기가 Markdown이나 텍스트 글에 새로 더하는 부정문 몰림과 얼버무림 몰림을 검사합니다. |
| PostToolUse | 도구 기록. 편집이 새로 더한 한 줄 주석을 comment-checker에 넘기고, 쓴 글에는 lit-humanizer 참고 검사를 합니다. |
| PostToolUseFailure | 기록. |
| Stop | lit-plan 턴은 계획 파일이 생긴 뒤 끝나고, 같은 세션에서 30분 안에 `go` 한 단어를 입력하면 그 계획을 start-work로 시작합니다. 승인된 start-work 실행은 멈출 때마다 한 번 판단합니다(계속, 마무리, 완료, 불가능). Done-when 검사는 90초까지입니다. litgoal은 기준이 남아 있으면 이어 가되 진전 없이 연속 3번까지만 붙잡습니다. 제한 시간 100초. |
| PreCompact | Muse가 컴팩션하기 전에 `.litmuse/handoff/latest.md`를 씁니다. |
| SubagentStart | 자식 에이전트의 보고 형식. start-work 실행 중이면, 페이로드가 이름을 밝힌 자식 세션은 부모의 실행 가드를 따릅니다. |
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

### 노을과 `--watch`

사람이 보는 터미널에서는 카드에 테두리가 생기고, 글이 쓰지 않는 칸에 노을을 그립니다. stdout이 터미널이고,
`COLORTERM`이 truecolor를 알리고, `NO_COLOR`가 없고, `COLORFGBG`가 밝은 배경이 아니고, 폭이 64칸 이상일 때입니다.
그 밖의 경우와 파이프, `--json`에는 글로만 된 카드를 출력합니다. 해는 자리가 나는 연속 세 줄 가운데 가장 아래에 놓이고,
자리가 없으면 카드가 늘어납니다. 창이 카드보다 낮으면 본문 아래쪽 줄부터 빠집니다.

항목마다 나오는 곳은 이렇습니다.

| 항목 | 출처 |
| --- | --- |
| 상태, 단계 줄, 개수 | 훅이 `.litmuse/workflow-stack/`에 남기는 워크플로 스택 |
| task와 criterion 게이지 | 계획에서 체크한 행, `.litmuse/goals/` |
| 레인과 시간 | SubagentStart와 SubagentStop이 남긴 단계 기록 |
| 스킬 칩 | 경로, 그리고 시작한 프롬프트의 스킬 계획(단계 기록) |
| 마지막 도구 | 호출이 끝날 때마다 쓰는 세션 장부, 15분 동안. 아직 도는 호출은 기록되지 않습니다 |
| `ctx ~12%` | Muse 세션 로그에 적힌 마지막 프롬프트 추정치. 모델 목록의 창 크기가 모두 같을 때만 비율로, 아니면 토큰 수로 적습니다 |
| 브랜치 | `.git/HEAD` |

Muse는 5시간, 주간 한도를 파일로 남기지 않으므로 카드에는 없습니다.

알약과 게이지의 둥근 끝은 이 순서로 한 번 정합니다. `LITMUSE_GLYPHS`(`auto`, `round`나 `nerd`, `basic`이나 `square`)가 먼저이고,
다음은 `install --glyphs`로 `config.json`에 저장한 선택이며 SSH에서도 유지됩니다. `auto`일 때는 Windows Terminal, VS Code, WezTerm, Ghostty, kitty면 켜고, SSH면 끄고, 그 밖에는 시스템 글꼴 폴더에 아이콘(Nerd) 글꼴
파일이 있을 때 켭니다. 파일 이름만 최대 4000개, 세 단계 폴더까지 읽습니다. 설치 카드도 같은 규칙을 씁니다.

`litmuse status --card --watch`는 대체 화면을 쓰고 `q`, Esc, Ctrl+C, SIGTERM, SIGHUP이나 오류로 끝날 때 원래 화면을
되돌립니다. 기록은 많아야 1초에 한 번 읽고, 그사이에는 초당 8번 그리며 바뀐 줄만 보냅니다. 경로가 활성이고, 기록이
마지막으로 바뀐 뒤 세션이 멈추지 않았고, 최근 15분 안에 변화가 있었을 때만 움직입니다. 그 밖에는 프레임을 그리지
않습니다. `LITMUSE_MOTION=off`(또는 `reduced`)면 멈춰 있습니다. stdout이 터미널이 아니면 `--watch`는 카드를 한 번만
출력합니다.

## start-work 자동 실행

사용자가 `yes`, `lit start plans/<f>.md`, `go`로 시작한 start-work 실행은 키보드 앞에 아무도 없어도 끝나는 것을
목표로 합니다. 시작이 곧 그 순간의 계획에 대한 승인입니다. `Run charter:`와 `Scope roots:` 줄은 해시로 묶이므로,
시작 뒤에 고친 내용은 아무 권한도 주지 않습니다.

- **보관되는 단계.** PreToolUse가 셸 단계를 하나씩 분류하고, 기본값은 보관입니다. 바로 실행되는 것은 읽기 전용 형태의
  읽기 명령, 계획의 Done-when 검사, 저장소 자체의 테스트와 검사 명령(`npm test`, `npm run test|check|lint|build|typecheck`,
  `node --test`, `pytest`, `cargo test`, `go test`, `make test`), 프로젝트 안 파일에 대한 스크립트 실행기(`node`, `python3`,
  `sh`), run charter 아래의 `git add`와 `git commit`뿐입니다. 가드가 모르는 동사(`dd`, `tar`, `ln`, `chmod`, `truncate`,
  `install`, `patch`, `go run`, `cargo run`, `uv run`, `awk`)는 X로 보관되고, 작업 공간 안으로 향한 셸 리다이렉트도
  마찬가지입니다. 파일은 가드가 경로마다 검사하는 파일 도구로 씁니다. 가드가 통과시키지 않는 단계는 정확한 글, 폴더, 줄, 등급과 함께 보관되고, 모델은 다음으로 넘어가라는 말을 듣습니다.
  B 등급은 작업 공간이나 `(read)` Scope root 안의 새 경로에 하는 `touch`, `mkdir`, `cp`, `mv`입니다. X 등급은 push, tag, publish,
  버전 올리기, reset, clean, 모든 삭제, 덮어쓰기, 설치, 네트워크 도구, 모르는 git 하위 명령, 검사가 아닌 패키지 스크립트,
  모든 루트 밖의 것, charter가 덮지 않는 커밋입니다. held 단계(glob, 확장, `sh -c`, `eval`, `sudo`, 디코더, `bash_input`)는
  목록에만 오르고 다시 실행되지 않습니다. 비밀, 실제 호스트 홈, `.git/hooks`, `.git/config`, 실행 상태 파일은 거절되고
  저장되지 않습니다. 작업 공간 밖의 실제 호스트 홈에 하는 셸 쓰기도 거절됩니다. 링크는 끝까지(16단계) 따라가며, 순환하거나
  더 긴 링크는 거절합니다. `dd of=` 같은 `이름=값` 피연산자의 값과 `git show HEAD:.env` 같은 `REV:경로` 피연산자와 `git show :.env`, `:0:.env` 같은 인덱스 피연산자도 경로로 검사합니다. 작업 공간 안에서 읽기 명령이 따옴표 없이 쓴 glob과 중괄호(`cat .env*`, `cat *.pem`, `cat .{env,x}`)는 폴더 목록으로 펼쳐 일치하는 파일마다 검사합니다. 펼칠 수 없는 glob(읽을 수 없는 폴더, `..`, `**`, 일부만 따옴표로 감싼 단어, 일치 256개 초과, 일치하는 것이 없음, `[[:class:]]`·`[[=x=]]`·`[[.x.]]` 괄호)은 held입니다. 보호된 곳을 품은 폴더(홈 폴더, `/`)를 도는 기본 `search` 도구도 거절합니다. 비밀 파일 이름은 대소문자를 가리지 않고(`.ENV`, `ID_RSA`), 저장소 안의 `.npmrc`, `.netrc`, `.pypirc`도 비밀로 봅니다. 대상이 실행 상태(훅 상태 폴더, 작업 공간의 `.litmuse` 폴더, 그 세션 기록) 자체이거나 그것을 품거나 그 안에 있는 쓰기, 이동, 삭제는 거절하므로 `mv .litmuse x`와 `rm -rf .`도 거절됩니다. 이미 있는 폴더로 복사하거나 옮길 때는 그 안에 생길 파일로 검사하므로 `cp src/a.mjs .`는 B 등급입니다. 파일 도구도 같은 검사를 받습니다. 프로젝트 밖 패턴 파일을 쓰는 `grep -f`는 묶은 옵션(`-rf F`, `-rfF`)까지 held입니다. `sort`와 `file`의 옵션은 허용 목록으로 읽고, 묶은 짧은 옵션(`-uo F`)과 줄인 긴 옵션(`--out=F`, `--comp`)도 같게 봅니다. 목록 밖 옵션은 held입니다. 보호된 곳을 품은 폴더를 도는 재귀 읽기(`grep -r x ~`, `grep -r -eKEY ~`, `grep -d recurse`, `rg --files ~`, `find -L /`, `diff -r ~`)는 거절합니다. `-e`나 `-f`로 패턴을 주면 붙여 쓰든 떼어 쓰든 피연산자는 모두 경로로 봅니다. 어느 `.git` 폴더에 쓰는 것이든 거절하고, 작업 공간 밖에 있는 링크된 워크트리의 git 폴더도 마찬가지입니다. 봉인이 맞지 않는 기록도 옆의 기록 파일에서 `lit deny` 답을 모두 되살립니다. 읽을 수 없게 깨진 상태 파일은 계획 단계의 제한을 지키면서 보호된 곳 읽기(`read_file ~/.ssh/id_rsa`, `cat .env`)도 계속 거절합니다. `lit cancel`은 그 파일을 갈아 끼우고 실행을 끝냅니다. 멀쩡한 실행에서는 보관된 단계를 버리고 가드를 끕니다. BLOCKED 줄이 기다리던 단계를 `lit approve x`가 실행하면, 다음 Stop이 모델에게 BLOCKED: 줄을 지우고 그 줄을 끝내 체크한 뒤 넘어가라고 알립니다. 작업 공간 밖을 향한 쓰기 도구는 경로 경계로 보관됩니다. 읽기 명령에 숨은 쓰기와 실행도 따집니다. sed는 p, d, q, s
  스크립트만 읽기로 보고, w, W, r, R, e 명령과 s///w, s///e, `-f`는 held로 둡니다. system, getline, `|`, `>`가 든 awk와
  `rg --pre`, `rg --hostname-bin`, `sort --compress-program`, `git grep -O`, `+명령`을 붙인 `less`/`more`, `env`·`$ENV`·`input_filename`을 읽는 jq도 held입니다. `sort -o`, `uniq`의 두 번째 피연산자, `tree -o`,
  `git --output`, `find -fprint`는 그 대상에 쓰는 것으로 봅니다. cron, MCP 서버, 나중 Muse의 새 도구처럼 가드가 속을
  볼 수 없는 도구도 held입니다. 2000자를 넘는 단계는 거절하고 저장하지 않으므로, 어떤 호출도 실행 기록을 키울 수 없습니다. 가드는 닫힌 쪽으로 실패합니다. 실행 중에 읽을 수 없는 호출(너무 크거나 형식이 깨진 것)이나 검사할 수 없는 호출(실행 상태를 저장하거나 읽다가 난 오류)은 거절됩니다. Muse는 훅 출력을 16 KiB에서 자르므로, 주입하는 메시지는 JSON으로 바꾼 뒤
  UTF-8 12 KiB 안에 들어가게 하고, 수신함은 예산에 맞는 보관 단계만 보여 줍니다. 나머지는 "(N more parked, not shown)"으로
  개수만 적고, 다음 답이 재실행하는 목록에서도 빠집니다. 한도는
  B 32개, X 16개, 경로 16개입니다.
- **실행기 잔여 위험.** 프로젝트 안의 스크립트는 작성자가 쓴 일을 무엇이든 할 수 있고, push도 할 수 있습니다. 가드는
  스크립트가 하는 일을 읽을 수 없어서 그대로 실행합니다. test, check, lint, build, typecheck라는 이름의 패키지
  스크립트도 같습니다. 프로젝트 밖 스크립트를 가리키는 실행기와 그 밖의 패키지 스크립트는 X로 보관됩니다. 가드는 넘겨받은 명령만
  읽기 때문에, 같은 스크립트가 상태 폴더의 `seal.key`를 읽어 봉인된 기록을 위조할 수도 있습니다. 재실행한 단계가
  `setsid`로 새 세션을 열면 프로세스 그룹을 벗어나므로, 100초에 그룹을 끝내도 그 프로세스에는 닿지 않습니다.
- **자식 레인.** BLOCKED: Muse가 SubagentStart 페이로드에 자식 세션을 적어 준다는 근거가 없어서, 자식의 도구 호출을
  실행에 묶을 수 없습니다. 실행 중에는 읽기 전용 `litmuse/*` 에이전트만 시작하고, 다른 `subagent_spawn`은 held로
  수신함에 오릅니다. 페이로드가 자식 세션을 적어 주면 훅은 그 자식을 실행에 묶습니다.
- **봉인된 실행 상태.** 실행 기록은 가드가 읽기도 쓰기도 거절하는 LitMuse 상태 폴더에 있고, 저장할 때마다 같은 폴더의
  키(`seal.key`, 권한 600)로 만든 HMAC이 붙습니다. 봉인이 맞지 않는 기록은 보관된 단계, 스냅샷, 경로, 허가를 모두 잃고,
  다음 승인 단어는 아무것도 실행하지 않은 채 그 사실을 알립니다. 수신함은 목록 이름과 보여 준 단계의 12자 digest를
  함께 보여 주고, 재실행은 그 digest와 맞지 않는 목록을 거절합니다.
- **Run charter.** `Run charter: commit on feat/qa in .`는 그 저장소의 그 브랜치에서 평범한 `git add <파일>`과
  `git commit`을 허락합니다. 브랜치는 호출할 때 `.git/HEAD`(워크트리면 `gitdir:`)에서 읽습니다.
- **멈출 때의 판단.** `done`: 모든 줄에 체크가 있고 `## Done when` 검사(허용 목록, 셸 없음, 90초 한도, 시간 초과는 그 턴
  동안 기억)가 0으로 끝나고, 도는 레인이 없고 바깥 단계가 보관되지 않았을 때입니다. 실행은 미뤄 둔 단계까지 적은 한 줄로
  닫힙니다. `continue`: 다음 열린 줄을 알려 줍니다. `wrap-up`: 같은 계획 상태에서 재촉은 두 번까지, 그다음 받은편지함
  하나, 그 뒤로는 무언가 바뀔 때까지 조용합니다. `impossible`: 열린 줄이 모두 `IMPOSSIBLE:`이고 보관된 것이 없을 때입니다.
- **받은편지함**은 `WAITING-ON-USER:`로 시작합니다. 보관된 단계를 코드 표기로 8개까지 줄임 없이 보여 주고, 나머지는
  개수만 셉니다. 기다리는 줄, 불가능한 줄, 30분 넘게 도는 레인, 답할 말도 적습니다. 받은편지함을 그리면 스냅숏이
  남습니다. `lit approve`는 보여 준 B 단계만 실행하고 보여 준 경로 권한을 줍니다. `lit approve x`(프롬프트 전체가
  정확히 이 글일 때)는 보여 준 X 단계도 실행합니다. 재실행 전에 다시 검사하고, 그 폴더에서 `/bin/sh -c`를 별도 프로세스 그룹으로
  돌리고, 끝나거나 100초가 지나면 그룹 전체(뒤에서 도는 자식까지)를 끊습니다. 시간 초과한 단계는 보관해 둡니다. 출력 끝부분은 신뢰할 수 없는 데이터라는 표시와 함께 모델에 갑니다.
  `lit deny`는 보관된 단계를 모두 버리고 그 명령을 계속 거절합니다. `lit skip-row [N]`는 N번 줄에
  `SKIPPED (lit skip-row):` 메모와 함께 체크를 넣습니다.
- **호스트의 빈틈.** Muse는 훅 글을 사용자에게 보여 주지 않습니다. 그래서 사용자에게 갈 글(완료 줄, 받은편지함, 불가능
  목록)은 "이 글을 그대로 답하고 멈추라"는 블록으로 모델에 갑니다. 자식 레인은 SubagentStart가 자식 세션 이름을 줄 때만
  실행에 묶입니다. 재실행에는 `/bin/sh`가 필요합니다.

## `lit` 없이 받는 제안

`lit`도 슬래시 명령도 없는 프롬프트에는 메모 하나가 붙습니다. `plot this csv`는 lit-scientific-visualization을
"none of these"와 함께 알려 주고, 모델이 요청을 보고 정합니다. 맞는 규칙이 없으면 스킬 이름을 담은 카탈로그 한 줄이
붙습니다. 코드 블록, 인라인 코드, 호스트 알림 안의 글은 읽지 않습니다. 규칙은 `plugin/hooks/lib/suggest.mjs`에 있고,
`test/fixtures/routing-eval`의 봉인된 held-out 절반에서 재현율 0.85 이상, 근접 오탐 0.10 이하일 때만 실립니다.
`npm run eval:routing`은 dev 절반만 채점합니다. held-out 절반은 sha256을 확인한 뒤 `node scripts/routing-eval.mjs heldout --record`로 한 번만 채점했고, `npm test`는 그 기록(`heldout-score.json`)과 digest만 읽습니다.

## 계획 승인 때 거는 목표

Muse는 세션마다 목표 하나를 둡니다. 모델이 `create_goal`로 걸고 `update_goal`로 닫으며, 직접 `/goal clear`로 끝낼 수도
있습니다. LitMuse는 계획에 `goal: native` 줄이 있을 때만 목표를 묻습니다.

lit-plan이 쓴 계획에는 테스트 명령 하나를 적은 `## Done when` 블록이 있습니다(`- check: \`npm test\``). 계획을 저장하면
lit-plan이 `goal-propose.mjs`를 돌려, `goal: native` 계획이면 이 블록을
``Every row in plans/flag.md is ticked and `npm test` exits 0, or the latest reply starts with WAITING-ON-USER:, or after 30 turns [lit:4c7a9a52]`` 같은 목표 문장 하나로 바꿉니다. 판단하는
말("works", "잘 동작"), push나 publish만으로 된 성공, 짧은 테스트 허용 목록 밖의 명령, 500자를 넘는 문장은 거절하고,
검사를 한 번 돌려 목표가 아직 참이 아님을 확인합니다. 그러면 승인 질문이
`Approve plan, start work and set goal: /goal <목표>? (yes / edit / no)`가 됩니다. 목표를 걸 수 없으면
`Approve plan and start work? (yes / no)`가 되고, 그 아래에 `No goal set: <이유>` 한 줄이 붙습니다. 어느 질문이든
그 아래에 답 안내가 붙습니다. goal-propose가 빈 줄 다음에 찍어 주는 짧은 블록으로, 제목과 목표, 답마다 무엇이
일어나는지 적은 표(`yes`는 작업을 시작하고 목표를 겁니다, `edit`은 계획이나 검사를 고친 뒤 다시 묻습니다, `no`는
아무것도 시작하지 않습니다), 그리고 `Type the word alone.` 한 줄입니다. 모델은 이 안내를 사용자의 언어로 옮기지만 답
낱말은 영어 그대로 둡니다. 프롬프트 훅이 그 낱말을 정확히 맞춰 보기 때문입니다.

답할 수 있는 건 질문을 받은 그 세션뿐이고, 30분 안이어야 합니다. 다른 세션에서 친 `yes`는 아무것도 시작하지 않고 `Approval not recorded for this session. Run: lit start plans/<f>.md` 한 줄을 보여 줍니다. 한 번 돌고 끝나는 `muse exec` 뒤에는 `lit start plans/<f>.md`로 계획을 시작하거나, 같은 세션을 다시 열어 `yes`라고 답하면 됩니다. 정확히 `yes`라고 답하면 두 가지가 한 번에 됩니다. 프롬프트 훅이 그 계획으로 start-work를 시작하고(직접
`lit start plans/<f>.md`를 친 것과 같은 시작입니다) 모델에게 그 목표를 걸라고 말합니다. 시작이 거절되면(다른 살아 있는
세션이 이미 그 계획으로 start-work를 돌리고 있거나, 열린 행이 없을 때) 아무것도 시작하지 않고 목표도 걸지 않으며,
`Work not started and no goal set: <이유>` 줄을 보여 줍니다. `no`는 아무것도 시작하지 않습니다. PreToolUse는 `[lit:…]` 꼬리표가 붙은 다른 목표를 모두 막으므로, `yes` 없이 생긴 LitMuse 목표는 없습니다.
내 목표가 이미 있으면 LitMuse는 그렇다고 말하고 건드리지 않습니다. 모든 행이 체크되면 Stop 훅이 모델에게 한 번
검사를 돌리고 0으로 끝나면 목표를 닫으라고 하며, `lit cancel`은 blocked로 닫습니다. 기록은 `.litmuse/goal/`에
(질문, 답, 소유) 남고, 아무도 답하지 않은 질문은 SessionStart가 치웁니다.

계획 없이 도는 lit-loop이나 litwork도 질문을 하나 받습니다. 프로젝트에 테스트 명령(`npm test`, `pytest`, `cargo test`,
`go test ./...`)이 있고 프롬프트에 목표가 있으면, 프롬프트 훅이 첫 활성화 때 테스트는 돌리지 않고 질문만 기록한 뒤
모델에게 첫 답을 ``Set goal for this lit-loop: /goal `npm test` exits 0 and this is done: <목표> [lit:4c7a9a52]? (yes / no)``
줄로 끝내라고 합니다. Muse는 훅 글을 보여 주지 않으므로 질문은 모델이 옮겨 적어야 보입니다. 다음 프롬프트에서 같은 세션이
정확히 `yes`라고 하면 목표가 걸리고 start-work는 시작하지 않으며, 다른 답은 질문을 버립니다. 요청이 `lit`, `lit-loop`,
`litwork`로 끝나도 같은 질문을 하고, 그 단어 앞의 말이 목표가 됩니다. 같은 경로를 다시 부를 때, `lit goal`, 계획,
`lit`만 친 경우, `lit continue`나 `lit resume`, 이미 열린 목표나 답을 기다리는 질문이 있는 세션에서는 묻지 않습니다.

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
