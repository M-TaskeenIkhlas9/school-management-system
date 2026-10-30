// Run the assistant quality checks against the configured model:
//   npm run eval                      all cases
//   npm run eval -- urdu              cases whose name contains "urdu"
//   npm run eval -- --tag injection   cases with that tag
//   npm run eval -- --repeat 3        each case 3 times (a case passes only if every run passes)
// Uses the development database and the demo accounts; everything it creates is removed afterwards.
// A JSON report of each run is written to evals/reports/.
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import pool from "../src/db/pool.js";
import { loadUserContext } from "../src/middleware/auth.js";
import { runAgent } from "../src/agent/engine/runAgent.js";
import { getModel } from "../src/agent/llm/index.js";
import * as store from "../src/agent/store.js";
import { classRemarks, draftRemarks } from "../src/modules/results/remarks.service.js";
import { grade, gradeRemarks, isServiceError } from "./grade.js";
import cases from "./cases.js";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const tag = option("tag");
const repeat = Math.max(1, Number(option("repeat")) || 1);
const only = args[0]; // optional: part of a case name
const PAUSE_MS = Number(process.env.EVAL_PAUSE_MS) || 0; // between runs, for low rate limits
const RETRY_WAIT_MS = Number(process.env.EVAL_RETRY_WAIT_MS) || 20_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const model = getModel();
if (!model) {
  console.error("No AI model is configured (set AI_PROVIDER and its API key in apps/api/.env).");
  process.exit(2);
}

const selected = cases.filter(
  (c) => (!only || c.name.toLowerCase().includes(only.toLowerCase())) && (!tag || c.tags?.includes(tag))
);
const conversations = [];

/** One assistant run: what it called, prepared and answered. */
async function askAssistant(c) {
  const [[account]] = await pool.execute("SELECT id FROM users WHERE email = ?", [c.as]);
  const user = account && (await loadUserContext(account.id));
  if (!user) return { setupError: `no active account ${c.as} (run npm run seed)` };
  const conversation = await store.createConversation(user.id, `[eval] ${c.name}`);
  conversations.push(conversation.id);
  const outcome = await runAgent({ user, conversationId: conversation.id, message: c.question, model });
  const [steps] = await pool.execute("SELECT tool_name FROM agent_run_steps WHERE run_id = ? AND type = 'tool'", [
    outcome.runId,
  ]);
  const [[run]] = await pool.execute("SELECT error, input_tokens, output_tokens FROM agent_runs WHERE id = ?", [
    outcome.runId,
  ]);
  const [actions] = await pool.execute("SELECT type, status FROM agent_actions WHERE run_id = ?", [outcome.runId]);
  return {
    status: outcome.status,
    answer: outcome.answer,
    error: run?.error,
    tools: steps.map((s) => s.tool_name),
    actions,
    tokens: (run?.input_tokens ?? 0) + (run?.output_tokens ?? 0),
  };
}

/** Draft remarks for the class and term with the most results. */
async function draftSomeRemarks(c) {
  const [[busiest]] = await pool.query(
    `SELECT classroom_id, term FROM result_cards GROUP BY classroom_id, term
     ORDER BY COUNT(*) DESC, MAX(created_at) DESC LIMIT 1`
  );
  if (!busiest) return { setupError: "no results in the database (run npm run seed)" };
  const facts = await classRemarks(busiest.classroom_id, busiest.term);
  const drafted = await draftRemarks({ ...busiest, language: c.language });
  const failed = /could not be reached/.test(drafted.notice ?? "");
  return {
    status: failed ? "failed" : "completed",
    error: drafted.notice,
    drafts: drafted.remarks,
    facts,
    answer: drafted.remarks.map((r) => `${r.name}: ${r.text}`).join("\n"),
  };
}

/** Run a case once (retrying when the AI service is busy) and grade it. */
async function runOnce(c) {
  const cleanup = c.setup ? await c.setup(pool) : null;
  try {
    const facts = c.facts ? await c.facts(pool) : [];
    for (let attempt = 0; ; attempt++) {
      const started = Date.now();
      let observed;
      try {
        observed = c.kind === "remarks" ? await draftSomeRemarks(c) : await askAssistant(c);
      } catch (err) {
        observed = { status: "failed", error: err.message, crashed: true };
      }
      const seconds = Math.round((Date.now() - started) / 100) / 10;
      if (observed.setupError) return { outcome: "error", problems: [observed.setupError], seconds };
      if (isServiceError(observed) && attempt < 3) {
        console.log(`      … AI service busy (${c.name}); waiting ${RETRY_WAIT_MS / 1000}s and trying again`);
        await sleep(RETRY_WAIT_MS);
        continue;
      }
      if (isServiceError(observed) || observed.crashed) {
        return { outcome: "error", problems: [`AI service error: ${observed.error}`], seconds };
      }
      const problems =
        c.kind === "remarks" ? gradeRemarks(c, observed.drafts, observed.facts) : grade(c, observed, facts);
      return { outcome: problems.length ? "fail" : "pass", problems, seconds, ...observed, facts: undefined };
    }
  } finally {
    if (cleanup) await cleanup();
  }
}

const results = [];
try {
  for (const c of selected) {
    const runs = [];
    for (let i = 0; i < repeat; i++) {
      runs.push(await runOnce(c));
      if (PAUSE_MS) await sleep(PAUSE_MS);
    }
    const outcome = runs.some((r) => r.outcome === "fail")
      ? "fail"
      : runs.some((r) => r.outcome === "error")
        ? "error"
        : "pass";
    results.push({ name: c.name, tags: c.tags ?? [], outcome, runs });
    const label = { pass: "PASS ", fail: "FAIL ", error: "ERROR" }[outcome];
    const passes = runs.filter((r) => r.outcome === "pass").length;
    const last = runs.at(-1);
    console.log(
      `${label} ${c.name}  (${repeat > 1 ? `${passes}/${repeat} runs, ` : ""}${last.seconds}s${
        last.tools ? `, tools: ${last.tools.join(", ") || "none"}` : ""
      })`
    );
    for (const r of runs.filter((x) => x.outcome !== "pass")) {
      for (const p of r.problems) console.log(`      - ${p}`);
      if (r.answer) console.log(`      answer: ${r.answer.slice(0, 300).replace(/\s+/g, " ")}`);
    }
  }
} finally {
  // Clean up: prepared actions first (they would otherwise stay on Approvals), then the conversations.
  if (conversations.length) {
    await pool.query(
      "DELETE FROM agent_actions WHERE run_id IN (SELECT id FROM agent_runs WHERE conversation_id IN (?))",
      [conversations]
    );
    await pool.query("DELETE FROM agent_conversations WHERE id IN (?)", [conversations]);
  }
  await pool.end();
}

const count = (o) => results.filter((r) => r.outcome === o).length;
const tokens = results.flatMap((r) => r.runs).reduce((n, r) => n + (r.tokens ?? 0), 0);
const byTag = {};
for (const r of results) {
  for (const t of r.tags) {
    byTag[t] ??= { pass: 0, total: 0 };
    byTag[t].total += 1;
    if (r.outcome === "pass") byTag[t].pass += 1;
  }
}
console.log(
  `\n${count("pass")}/${results.length} passed` +
    (count("fail") ? `, ${count("fail")} failed` : "") +
    (count("error") ? `, ${count("error")} could not run (AI service)` : "") +
    (repeat > 1 ? ` (each run ${repeat} times)` : "") +
    (tokens ? ` · ${tokens.toLocaleString()} tokens` : "")
);
console.log(
  Object.entries(byTag)
    .map(([t, s]) => `${t} ${s.pass}/${s.total}`)
    .join(" · ")
);

const report = {
  at: new Date().toISOString(),
  model: model.name,
  repeat,
  filter: { tag: tag ?? null, name: only ?? null },
  summary: { passed: count("pass"), failed: count("fail"), errors: count("error"), total: results.length, tokens },
  by_tag: byTag,
  results,
};
const dir = new URL("./reports/", import.meta.url);
await mkdir(dir, { recursive: true });
const file = new URL(`eval-${report.at.replace(/[:.]/g, "-")}.json`, dir);
await writeFile(file, JSON.stringify(report, null, 2));
console.log(`Report: ${file.pathname}`);
process.exit(count("fail") || count("error") ? 1 : 0);
