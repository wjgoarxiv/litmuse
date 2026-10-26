# lit-adhd brief examples

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
