// Run the assistant quality checks against the configured model: `npm run eval`.
// Uses the development database and the demo accounts; everything it creates is removed afterwards.
import "dotenv/config";
import pool from "../src/db/pool.js";
import { loadUserContext } from "../src/middleware/auth.js";
import { runAgent } from "../src/agent/engine/runAgent.js";
import { getModel } from "../src/agent/llm/index.js";
import * as store from "../src/agent/store.js";
import cases from "./cases.js";

const only = process.argv[2]; // optional: part of a case name
const model = getModel();
if (!model) {
  console.error("No AI model is configured (set AI_PROVIDER and its API key in apps/api/.env).");
  process.exit(2);
}

const results = [];
const conversations = [];

for (const c of cases.filter((x) => !only || x.name.toLowerCase().includes(only.toLowerCase()))) {
  const problems = [];
  const [[account]] = await pool.execute("SELECT id FROM users WHERE email = ?", [c.as]);
  const user = account && (await loadUserContext(account.id));
  if (!user) {
    results.push({ name: c.name, ok: false, problems: [`no active account ${c.as} (run npm run seed)`] });
    continue;
  }
  const conversation = await store.createConversation(user.id, `[eval] ${c.name}`);
  conversations.push(conversation.id);
  const started = Date.now();
  let outcome;
  try {
    outcome = await runAgent({ user, conversationId: conversation.id, message: c.question, model });
  } catch (err) {
    results.push({ name: c.name, ok: false, problems: [`run crashed: ${err.message}`] });
    continue;
  }
  const [steps] = await pool.execute("SELECT tool_name FROM agent_run_steps WHERE run_id = ? AND type = 'tool'", [
    outcome.runId,
  ]);
  const called = steps.map((s) => s.tool_name);

  if (outcome.status !== "completed") problems.push(`run ended as ${outcome.status}`);
  if (c.mustCall && !c.mustCall.some((t) => called.includes(t))) {
    problems.push(`expected one of [${c.mustCall.join(", ")}], called [${called.join(", ") || "nothing"}]`);
  }
  for (const t of c.mustNotCall ?? []) if (called.includes(t)) problems.push(`must not call ${t}`);
  if (c.answer && !c.answer.test(outcome.answer)) problems.push(`answer doesn't match ${c.answer}`);
  if (c.notAnswer && c.notAnswer.test(outcome.answer)) problems.push(`answer matches forbidden ${c.notAnswer}`);
  if (c.proposes) {
    const [[action]] = await pool.execute("SELECT status FROM agent_actions WHERE run_id = ? AND type = ?", [
      outcome.runId,
      c.proposes,
    ]);
    if (!action) problems.push(`expected a prepared ${c.proposes}`);
    else if (action.status !== "pending") problems.push(`prepared action is ${action.status}, expected pending`);
  }
  results.push({
    name: c.name,
    ok: !problems.length,
    problems,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    tools: called,
    answer: outcome.answer,
  });
}

// Clean up: prepared actions first (they would otherwise stay on Approvals), then the conversations.
if (conversations.length) {
  await pool.query(
    "DELETE FROM agent_actions WHERE run_id IN (SELECT id FROM agent_runs WHERE conversation_id IN (?))",
    [conversations]
  );
  await pool.query("DELETE FROM agent_conversations WHERE id IN (?)", [conversations]);
}
await pool.end();

for (const r of results) {
  console.log(
    `${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.seconds ? `  (${r.seconds}s, tools: ${r.tools.join(", ") || "none"})` : ""}`
  );
  for (const p of r.problems) console.log(`      - ${p}`);
  if (!r.ok && r.answer) console.log(`      answer: ${r.answer.slice(0, 300).replace(/\s+/g, " ")}`);
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
