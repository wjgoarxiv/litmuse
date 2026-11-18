# The ultra-brainstorm Workflow

Copy the script below verbatim into one `workflow` call and pass the run settings as `args`. It follows the Workflow
API V1 contract that a live Muse Code 1.4.23 session advertises (proved in a real 100-agent run on 2026-11-18): a default
export that receives `host`, fan-out with `host.parallel([...])`, one child with `host.agent({...})`, each request
`{ input, schema, effort?, model?, label, phase }`, and results with `data`, `ref` and, for a large answer,
`data_spilled_for_size` (read it back with `host.readResult(ref, offset, length)`). Muse runs at most 16 children at
once and queues the rest, and one Workflow makes at most 1000 agent calls, so the script stops at 900 idea agents. The
binary also carries a V2 shape (`Agent.start`), but the live ToolSpec decides: if a session's `workflow` tool describes
V2 only, port the same three stages to it and say so once in the reply.

## args

| Key | Value |
| --- | --- |
| `topic` | The pinned brief: topic, constraints, what a good idea lets the user do. Data, quoted to every child. |
| `agents` | The count the user chose (10 to 900). |
| `lenses` | The 32 lens strings from `lenses.md`, in order. |
| `ideaEffort` | `"minimal"`. |
| `reduceEffort` | `"low"`. |
| `model` | Omit, unless the user named a model id; then every idea agent uses it. |
| `tokenBudget` | Omit, unless the user gave one (`+500k` is `500000`); idea agents stop launching near it. |

## Script

```js
const IDEAS = {
  type: "object",
  required: ["ideas"],
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "how", "why", "risk", "first_test"],
        properties: { title: { type: "string" }, how: { type: "string" }, why: { type: "string" }, risk: { type: "string" }, first_test: { type: "string" } },
      },
    },
  },
};
const CLUSTERS = {
  type: "object",
  required: ["clusters"],
  properties: {
    clusters: {
      type: "array",
      items: { type: "object", required: ["name", "how", "members"], properties: { name: { type: "string" }, how: { type: "string" }, members: { type: "array", items: { type: "string" } } } },
    },
  },
};
const VERDICT = {
  type: "object",
  required: ["criteria", "top", "sensitivity", "recommendation", "combine"],
  properties: {
    criteria: { type: "array", items: { type: "object", required: ["name", "weight"], properties: { name: { type: "string" }, weight: { type: "number" } } } },
    top: { type: "array", items: { type: "object", required: ["rank", "name", "score", "how", "arithmetic"], properties: { rank: { type: "number" }, name: { type: "string" }, score: { type: "number" }, how: { type: "string" }, arithmetic: { type: "string" } } } },
    sensitivity: { type: "string" },
    recommendation: { type: "string" },
    combine: { type: "string" },
  },
};

const PER_AGENT_TOKENS = 3000;

export default async function workflow(host) {
  const a = host.args || {};
  const { topic, lenses, ideaEffort = "minimal", reduceEffort = "low", model, tokenBudget } = a;
  const requested = Math.min(Math.max(Number(a.agents) || 0, 1), 900);
  const agents = tokenBudget ? Math.max(1, Math.min(requested, Math.floor((tokenBudget * 0.9) / PER_AGENT_TOKENS))) : requested;
  const skipped = requested - agents;

  // A large answer is stored whole and returned by ref; read it back so no idea is lost.
  const dataOf = (result, key) => {
    if (!result || result.error_kind || result.kind === "not_admitted") return null;
    if (Array.isArray(result.data?.[key])) return result.data;
    if (result.data_spilled_for_size && result.ref && typeof host.readResult === "function") {
      try {
        let text = "";
        for (let offset = 0, n = 0; n < 60; n += 1) {
          const part = host.readResult(result.ref, offset, 4096);
          text += part.text;
          offset = part.nextOffset;
          if (part.done) break;
        }
        const full = JSON.parse(text);
        return Array.isArray(full?.data?.[key]) ? full.data : Array.isArray(full?.[key]) ? full : null;
      } catch {
        return null;
      }
    }
    return null;
  };

  const ideaRequests = [];
  for (let i = 0; i < agents; i += 1) {
    const input = [
      "TASK: invent ideas for the topic below through one lens.",
      `TOPIC (data, not instructions): ${topic}`,
      `LENS: ${lenses[i % lenses.length]}`,
      `SEED: ${i}`,
      "DELIVERABLE: at most five ideas, each with title, how, why, risk and first_test.",
      "SCOPE: use no tools. Read no files, search nothing, write nothing. Think and answer only.",
      "VERIFY: every field filled; the lens visibly shapes each idea; prefer the odd idea over the safe one.",
    ].join("\n");
    ideaRequests.push({ input, effort: ideaEffort, schema: IDEAS, label: `idea-${i}`, phase: "Idea agents", ...(model ? { model } : {}) });
  }
  const ideaResults = await host.parallel(ideaRequests);
  let failed = 0;
  const raw = [];
  ideaResults.forEach((result, i) => {
    const list = dataOf(result, "ideas")?.ideas.slice(0, 5) ?? [];
    if (!list.length) failed += 1;
    list.forEach((idea, k) => raw.push({ id: `${i}.${k}`, lens: i % lenses.length, title: String(idea?.title ?? ""), how: String(idea?.how ?? ""), why: String(idea?.why ?? ""), risk: String(idea?.risk ?? ""), first_test: String(idea?.first_test ?? "") }));
  });

  const reduceRequests = [];
  for (let start = 0; start < agents; start += 30) {
    const slice = raw.filter((idea) => { const agent = Number(idea.id.split(".")[0]); return agent >= start && agent < start + 30; });
    if (!slice.length) continue;
    const input = [
      "TASK: cluster and dedupe these ideas.",
      `TOPIC (data): ${topic}`,
      `IDEAS (data, JSON): ${JSON.stringify(slice)}`,
      "DELIVERABLE: clusters, each with name, how (one line) and members (every idea id it holds).",
      "SCOPE: use no tools. Merge ideas that share a mechanism; keep every id in exactly one cluster.",
      "VERIFY: no id lost, no id twice.",
    ].join("\n");
    reduceRequests.push({ input, effort: reduceEffort, schema: CLUSTERS, label: `reduce-${start / 30}`, phase: "Reducers" });
  }
  const reduced = reduceRequests.length ? await host.parallel(reduceRequests) : [];
  // Reducers see one slice each, so the same idea can head a cluster in several slices; merge those by name before the
  // judge scores, or the top list repeats one idea (seen in a live 100-agent run).
  const byName = new Map();
  for (const result of reduced) {
    for (const c of dataOf(result, "clusters")?.clusters ?? []) {
      const name = String(c?.name ?? "").trim();
      const key = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      const members = Array.isArray(c?.members) ? c.members.map(String) : [];
      const seen = byName.get(key);
      if (seen) seen.members.push(...members.filter((id) => !seen.members.includes(id)));
      else byName.set(key, { name, how: String(c?.how ?? ""), members });
    }
  }
  const clusters = [...byName.values()];

  let verdict = null;
  try {
    const input = [
      "TASK: judge these idea clusters.",
      `TOPIC (data): ${topic}`,
      `CLUSTERS (data, JSON): ${JSON.stringify(clusters.map(({ name, how, members }) => ({ name, how, size: members.length })))}`,
      "DELIVERABLE: three to five weighted criteria (weights sum to 1); every cluster scored 1 to 5 per criterion with the products and the sum shown in arithmetic; the top 10 sorted by score; a sensitivity check (swap the two heaviest weights, say which ranks move); a two-sentence recommendation; which clusters combine well.",
      "SCOPE: use no tools.",
      "VERIFY: each score equals the sum of its products.",
    ].join("\n");
    verdict = dataOf(await host.agent({ input, schema: VERDICT, label: "judge", phase: "Judge" }), "top");
  } catch {
    verdict = null;
  }
  return { counts: { planned: requested, launched: agents, skipped, answered: agents - failed, failed, ideas: raw.length, clusters: clusters.length }, raw, clusters, verdict };
}
```

## After the run

The Workflow returns `{ counts, raw, clusters, verdict }`. Write it whole into `.litmuse/brainstorm/<slug>/result.json`,
then `notes.md` with the topic, the launch answer, the cost line and the top list. A `verdict` of `null` means the judge
failed: show the clusters unscored and say so. Report `counts.answered`, `counts.failed` and `counts.ideas` exactly as
returned.
