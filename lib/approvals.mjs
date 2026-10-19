import { readManifest, agentNames, PLUGIN_DIR } from './bundle.mjs';

// Id forms proven on Muse Code 1.4.10: `<plugin>:hook:<id>` and `<plugin>:agent_definition:<plugin>/<name>`.
export function expectedApprovals(dir = PLUGIN_DIR) {
  const hooks = readManifest(dir).capabilities.hooks.map((h) => ({
    id: `litmuse:hook:${h.id}`, label: `hook:${h.id}`, kind: 'hook', name: h.id, what: `${h.event} hook`,
  }));
  const agents = agentNames(dir).map((a) => ({
    id: `litmuse:agent_definition:litmuse/${a}`, label: `agent:${a}`, kind: 'agent', name: a, what: `agent litmuse/${a}`,
  }));
  return [...hooks, ...agents];
}

export function expectedApprovalIds(dir = PLUGIN_DIR) {
  return expectedApprovals(dir).map((a) => a.id);
}

// Maps `muse plugins inspect litmuse --json` runtime capabilities onto the expected approval list.
export function approvalStates(inspectJson, dir = PLUGIN_DIR) {
  const caps = Array.isArray(inspectJson?.runtime_capabilities) ? inspectJson.runtime_capabilities : [];
  const byKey = new Map();
  for (const cap of caps) {
    const c = cap.candidate ?? {};
    if (c.kind === 'hook' && c.capability_id) byKey.set(`hook:${c.capability_id}`, cap);
    if (c.scoped_definition_id) byKey.set(`agent:${String(c.scoped_definition_id).replace(/^litmuse\//, '')}`, cap);
  }
  return expectedApprovals(dir).map((a) => {
    const cap = byKey.get(`${a.kind}:${a.name}`);
    return { ...a, status: cap ? cap.status : 'missing', diagnostic: cap?.diagnostic ?? null };
  });
}
