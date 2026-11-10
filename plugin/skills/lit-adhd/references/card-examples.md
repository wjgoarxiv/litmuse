# lit-adhd brief examples

## The board (default)

`litmuse rewind --lang ko` and `--lang en` print these boards for one fixture repository, `todo-app`:
three plans (Login page fully ticked five hours ago, Search box half done ten minutes ago, CSV export
untouched for ten days), one other session that asked the user a question four minutes ago, three
changed files and two commits not yet pushed. The reply is the board exactly as printed. Nothing is
added, and the reply does not recount anything.

What the fixture shows:

- The waiting session holds the next step back (it is a lane), so "Do this now" says to answer it,
  and `go` is not offered.
- CSV export changed before the seven-day window, so it is not a milestone and not in the counts. It
  appears only as the 🕰️ reminder.
- At a glance: 5 ticked rows, 1 row in progress (Search box has started), 1 session waiting, 1 row
  left. `Overall` is 5 over their sum, 8.

```markdown
## 🎯 지금 할 일
**'Search page lane' 세션에 답하기** — 내 대답을 기다리고 있어요
👉 입력: 그 세션 창에서 답하기

## 📊 한눈에 보기
| ✅ 끝남 | 🔄 진행 중 | ⏳ 나를 기다림 | ⬜ 남음 |
|:--:|:--:|:--:|:--:|
| 5 | 1 | 1 | 1 |

전체 진행  ██████░░░░  5/8 (63%)

## 🏁 마일스톤
| 마일스톤 | 상태 | 진행 | 최근 |
|---|---|---|---|
| Search box | 🔄 진행 중 | █████░░░░░ 2/4 | 10분 전 |
| Login page | ✅ 끝남 | ██████████ 3/3 | 5시간 전 |

## ✅ 최근 끝낸 일
- Debounce typing
- Add the input
- Show the error text
- Wire the submit button
- Draw the form

## ⬜ 남은 일
1. Show the results list
2. Highlight the match

## 🔔 잊지 말 것
- ⏳ 'Search page lane' 세션이 나를 기다려요 → 그 세션 창에서 질문에 답하기
- 💾 커밋 안 된 변경 3개 (todo-app) → 검토하고 커밋하거나 되돌리기
- 📤 푸시 안 된 커밋 2개 (todo-app) → 확인하고 push하기
- 🕰️ 10일째 멈춘 계획: CSV export → 이어 할지, 접을지 정하기
```

```markdown
## 🎯 Do this now
**Answer the 'Search page lane' session** — it is waiting for your answer
👉 Type: reply in that session window

## 📊 At a glance
| ✅ Done | 🔄 In progress | ⏳ Waiting on you | ⬜ Left |
|:--:|:--:|:--:|:--:|
| 5 | 1 | 1 | 1 |

Overall  ██████░░░░  5/8 (63%)

## 🏁 Milestones
| Milestone | Status | Progress | Last |
|---|---|---|---|
| Search box | 🔄 In progress | █████░░░░░ 2/4 | 10m ago |
| Login page | ✅ Done | ██████████ 3/3 | 5h ago |

## ✅ Done lately
- Debounce typing
- Add the input
- Show the error text
- Wire the submit button
- Draw the form

## ⬜ Still to do
1. Show the results list
2. Highlight the match

## 🔔 Don't forget
- ⏳ 'Search page lane' session is waiting on you → answer its question in that session
- 💾 3 uncommitted changes (todo-app) → review, then commit or discard
- 📤 2 unpushed commits (todo-app) → check them, then push
- 🕰️ plan untouched for 10 days: CSV export → decide: pick it up or drop it
```

With a single open plan and nothing else waiting, the first section reads
`**Search box 이어서 하기** — 열린 계획이 이것 하나예요` with `👉 입력: `go``, and `go` runs start-work on it.
With other lanes still working it reads `**다른 레인 2개가 끝날 때까지 기다리기**` with
`👉 입력: 기다리기: 레인 2개 끝날 때까지`, and the 🏃 reminder repeats that `go` must wait.

## Detail view (`--detail`)

`lit adhd 자세히` / `lit adhd detail` adds the per-session brief below under the board.

Both examples render the same collector JSON. Gauges, ids, titles and names are copied from it
verbatim; only the connecting words change with the language. The JSON excerpt comes first. The
finished schematic lane collapses into the ended table; the pptx lane has no commit yet, so its
card names the last tool call.

```json
{
  "summary": { "sessions": 3, "waitingOnUser": 1, "active": 1 },
  "sessions": [
    { "id8": "655f39d3", "title": "ADHD lane", "asked": ["build the collector"], "done": { "tools": { "write_file": 2 }, "commits": [{ "hash": "bdea372", "subject": "feat(rewind): collect cross-session records" }] }, "status": "waiting-on-user", "waitingReason": "asked the user", "progress": { "gauge": "[▉▉▉▉░░░░░░] 10/19", "remaining": ["11. Skill lit-adhd", "12. go continues"] } },
    { "id8": "f06fb727", "title": "pptx lane", "asked": ["fix the deck QA"], "done": { "tools": { "bash": 4 }, "commits": [] }, "lastAction": { "tool": "bash" }, "status": "active", "progress": { "gauge": "[…] running", "remaining": ["unknown"] } },
    { "id8": "2fad84a7", "title": "schematic lane", "asked": ["render the figure"], "done": { "tools": { "bash": 4 }, "commits": [] }, "status": "ended", "progress": { "gauge": "[▉▉▉] 3/3", "remaining": [] } }
  ],
  "roadmap": { "progress": { "gauge": "[▉▉▉▉░░░░░░] 10/20" }, "plans": [{ "plan": "plans/lit-adhd.md", "local": true, "current": "11. Skill lit-adhd", "progress": { "gauge": "[▉▉▉▉░░░░░░] 10/19" } }], "plansOmitted": 0 },
  "workflows": [{ "id8": "655f39d3", "skill": "lit-loop", "stage": "verify", "status": "paused", "progress": { "gauge": "[▉▉▉░░░░] 3/7", "remaining": ["unknown"] } }],
  "next": { "kind": "resume-frame", "say": "lit continue" },
  "sources": { "herdr": "unknown" }
}
```

## English

> lit-adhd: 3 session(s) · 1 waiting on you · next: resume frame (say "lit continue")
> last 7d · 1 folder read
>
> 🌿 repo
> ● waiting on you · 655f39d3 · lit-loop · 12m ago
> ADHD lane
> ⏳ 25m of work · last ask: "build the collector"
> [▉▉▉▉░░░░░░] 10/19 · left: 11. Skill lit-adhd, 12. go continues
> ✅ Done: write_file · bdea372 feat(rewind): collect cross-session records
> ➤ Next: answer its question
>
> ● ACTIVE · f06fb727 · 8m ago
> pptx lane
> ⏳ 8m of work · last ask: "fix the deck QA"
> ✅ Done: bash
> ▶ Now: bash
>
> ┌ Ended · 1 ────────────────────────────────────────────────────────┐
> │ id       │ tree  │ goal           │ ago │ done │
> ├──────────┼───────┼────────────────┼─────┼──────┤
> │ 2fad84a7 │ repo  │ schematic lane │ 6h  │ ·    │
> └──────────┴───────┴────────────────┴─────┴──────┘
>
> -- roadmap --
> ▶ plans/lit-adhd.md [▉▉▉▉░░░░░░] 10/19 now: 11. Skill lit-adhd
>   ○ later: 12. go continues
> ✓ bdea372 2026-10-25 feat(rewind): collect cross-session records
>
> ┌ RECOMMENDED NEXT STEP ────────────────────────────────────────────┐
> │ resume frame: lit-loop (say "lit continue"). Say `go` to continue. │
> └───────────────────────────────────────────────────────────────────┘
> Nothing runs on its own here: open that session, or say what to do.
>
> Not read: agents.

## 한국어

> lit-adhd: 세션 3개 · 나를 기다리는 것 1 · 다음: resume frame ("lit continue"라고 입력)
> 최근 7일 · 폴더 1곳 읽음
>
> 🌿 repo
> ● 나를 기다림 · 655f39d3 · lit-loop · 12분 전
> ADHD lane
> ⏳ 25m 작업 · 마지막 요청: "build the collector"
> [▉▉▉▉░░░░░░] 10/19 · left: 11. Skill lit-adhd, 12. go continues
> ✅ 한 일: write_file · bdea372 feat(rewind): collect cross-session records
> ➤ 다음: 질문에 답하기
>
> ● 진행 중 · f06fb727 · 8분 전
> pptx lane
> ⏳ 8m 작업 · 마지막 요청: "fix the deck QA"
> ✅ 한 일: bash
> ▶ 지금: bash
>
> ┌ 끝난 세션 · 1 ───────────────────────────────────────────────────┐
> │ id       │ 위치  │ 목표           │ 경과│ 한 일│
> ├──────────┼───────┼────────────────┼─────┼──────┤
> │ 2fad84a7 │ repo  │ schematic lane │ 6h  │ ·    │
> └──────────┴───────┴────────────────┴─────┴──────┘
>
> -- roadmap --
> ▶ plans/lit-adhd.md [▉▉▉▉░░░░░░] 10/19, 지금: 11. Skill lit-adhd
>   ○ 나중에: 12. go continues
> ✓ bdea372 2026-10-25 feat(rewind): collect cross-session records
>
> ┌ 권장 다음 단계 ───────────────────────────────────────────────────┐
> │ resume frame: lit-loop ("lit continue"라고 입력). 계속하려면 `go`라고 입력하세요. │
> └───────────────────────────────────────────────────────────────────┘
> 자기 혼자 돌아가는 것은 없습니다: 그 세션을 열거나, 할 일을 말해 주세요.
>
> 읽지 못함: agents.

## How to read it in ten seconds

1. **Headline** (`lit-adhd: …`): how many sessions, how many wait on you, and the
   next step in plain words.
2. **One card per live session** (waiting or active):
   - badge: ● waiting on you, ▶ active, with the reason it waits;
   - the goal in bold, from the session's title or its first ask;
   - a gauge only when both numbers are recorded (`[▉▉▉░░░░] 3/7` plus what is left), otherwise
     the known facts after ⏳ (how long it has run and its last ask), never a question-mark gauge;
   - ✅ what was done (tools named, never counted, and commits) and ▶ what is next
     for that session, or what it is doing now (`now: bash`, the last tool call by name).
3. **Ended sessions**, one short row each (`id8 · place · goal · age · done`).
4. **Roadmap** timeline: ✓ finished plans with their dates, ▶ the current item of each open plan
   with its gauge, ○ the items after it.
5. **One recommended next step** in a box, and the word to type. When nothing can run on `go`,
   the box still recommends a real step from the records and says that nothing runs on its own.

## What the examples do not do

- They do not estimate the pptx lane's progress: with no count there is no gauge line at all, only the known facts.
- They do not describe work the records do not show: the pptx lane has no commit yet, so its
  card names the tools it used and the tool it is on now.
- They do not count tool calls: `bash ×4` would overcount a head-and-tail read, so the card
  reads `bash`.
- They offer one next step only, and do not start it.
