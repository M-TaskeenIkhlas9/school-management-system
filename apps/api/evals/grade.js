/**
 * Grading for the assistant quality checks. Pure functions: given a case and what the run did,
 * list what went wrong (an empty list is a pass). Kept apart from the runner so the grading
 * itself is unit-tested (tests/evals.test.js) without a model or a database.
 */

/** Share of the letters in `text` that are Urdu/Arabic script (0–1). */
export function urduShare(text) {
  const letters = String(text ?? "").match(/\p{L}/gu) ?? [];
  if (!letters.length) return 0;
  return letters.filter((c) => /[؀-ۿݐ-ݿ]/.test(c)).length / letters.length;
}

/** Urdu and Arabic-Indic digits to 0–9, thousands separators removed: "۱,۵۰۰" → "1500". */
export function normaliseNumbers(text) {
  return String(text ?? "")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/(\d)[,٬](?=\d{3}\b)/g, "$1");
}

/** The run failed because of the AI service (rate limit, outage), not because of the assistant. */
export function isServiceError(observed) {
  return (
    observed.status === "failed" &&
    /rate limit|429|usage limit|busy|timed? ?out|timeout|ECONN|fetch failed|unavailable|overloaded|reach the AI service/i.test(
      `${observed.error ?? ""} ${observed.answer ?? ""}`
    )
  );
}

/**
 * @param c         the case (see cases.js)
 * @param observed  { status, error, tools: string[], answer, actions: [{ type, status }] }
 * @param facts     strings worked out from the database that the answer must mention
 * @returns string[] problems
 */
export function grade(c, observed, facts = []) {
  const problems = [];
  const answer = observed.answer ?? "";
  const tools = observed.tools ?? [];
  const actions = observed.actions ?? [];

  if (observed.status !== "completed") problems.push(`run ended as ${observed.status}`);
  if (c.mustCall && !c.mustCall.some((t) => tools.includes(t))) {
    problems.push(`expected one of [${c.mustCall.join(", ")}], called [${tools.join(", ") || "nothing"}]`);
  }
  for (const t of c.mustNotCall ?? []) if (tools.includes(t)) problems.push(`must not call ${t}`);
  if (c.maxToolCalls !== undefined && tools.length > c.maxToolCalls) {
    problems.push(`made ${tools.length} tool calls, at most ${c.maxToolCalls} expected`);
  }
  if (c.answer && !c.answer.test(answer)) problems.push(`answer doesn't match ${c.answer}`);
  if (c.notAnswer && c.notAnswer.test(answer)) problems.push(`answer matches forbidden ${c.notAnswer}`);

  if (c.language === "ur" && urduShare(answer) < 0.4) {
    problems.push(`expected an answer in Urdu, but only ${Math.round(urduShare(answer) * 100)}% is Urdu script`);
  }
  if (c.language === "en" && urduShare(answer) > 0.05) problems.push("expected an answer in English");

  const numbers = normaliseNumbers(answer);
  for (const fact of facts) {
    if (!numbers.includes(normaliseNumbers(fact))) problems.push(`answer should mention "${fact}" (from the database)`);
  }

  if (c.proposes) {
    const action = actions.find((a) => a.type === c.proposes);
    if (!action) problems.push(`expected a prepared ${c.proposes}`);
    else if (action.status !== "pending") problems.push(`prepared action is ${action.status}, expected pending`);
  }
  if (c.proposesNothing && actions.length) {
    problems.push(`must not prepare anything, prepared [${actions.map((a) => a.type).join(", ")}]`);
  }
  return problems;
}

/**
 * Grade drafted report-card remarks (see remarks.service.js).
 * @param c       { language, mentionFailedSubject? }
 * @param drafts  [{ result_id, text, source }]
 * @param facts   classRemarks() rows, for the students' failed subjects
 */
export function gradeRemarks(c, drafts, facts) {
  const problems = [];
  const fellBack = drafts.filter((d) => d.source !== "ai");
  if (fellBack.length) {
    problems.push(`${fellBack.length} of ${drafts.length} drafts were unusable and replaced with standard remarks`);
  }
  for (const d of drafts.filter((x) => x.source === "ai")) {
    if (/\d+(\.\d+)?\s?%/.test(normaliseNumbers(d.text))) problems.push(`repeats a percentage: "${d.text}"`);
    const f = facts.find((x) => x.result_id === d.result_id);
    if (c.mentionFailedSubject && f?.failed_subjects.length) {
      const named = f.failed_subjects.some((s) => d.text.toLowerCase().includes(s.toLowerCase()));
      if (!named) problems.push(`${f.first_name} failed ${f.failed_subjects.join(", ")}, not mentioned: "${d.text}"`);
    }
  }
  return problems;
}
