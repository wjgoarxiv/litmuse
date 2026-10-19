#!/usr/bin/env node
// Integrity check for the bundled handoff reference closure (stdlib only, read-only).
//   node verify-closure.mjs [--json]   exits 0 when all four files match their recorded SHA-256
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const EXPECTED = {
  "reference/canonical-handoff.md": "e5bbd253dfa5b5baa9739dfaebc458003daab43cb27c4a407423da1e7a31dec6",
  "evals/evals.json": "0a70f0d149e59641100c7dcf8b9f2f1c0ceae57b98518e165f08088f2c2484da",
  "examples/HANDOFF-example-generic-auth-refactor.md": "43c767e573ac8c8900832d2b7a92ee1e83fd2d3d794fe2c82ecef87e5737f2a3",
  "templates/HANDOFF.md": "2a795a06e7bb81a57e6675ae70ed26db0dbfdb792c01f0a60f96f02cbef49fbd",
};

const results = Object.entries(EXPECTED).map(([file, expected]) => {
  try {
    const actual = createHash("sha256").update(readFileSync(path.join(SKILL_DIR, file))).digest("hex");
    return { file, ok: actual === expected, actual };
  } catch (error) {
    return { file, ok: false, actual: null, error: error.code ?? error.message };
  }
});
const ok = results.every((entry) => entry.ok);

if (process.argv.includes("--json")) console.log(JSON.stringify({ name: "lit-handoff-closure", ok, files: results }, null, 2));
else {
  for (const entry of results) console.log(`${entry.ok ? "PASS" : "FAIL"} ${entry.file}${entry.error ? ` (${entry.error})` : ""}`);
  console.log(ok ? "PASS: handoff closure matches its recorded hashes" : "FAIL: handoff closure differs from its recorded hashes");
}
process.exitCode = ok ? 0 : 1;
