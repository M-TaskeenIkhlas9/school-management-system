/**
 * How the assistant is being used: questions, outcomes, tokens, speed, tools and who asks.
 * Cost is estimated only when AI_COST_PER_1K_INPUT / AI_COST_PER_1K_OUTPUT are set (in CURRENCY).
 */
import pool from "../db/pool.js";

export async function usageSummary({ days = 30 } = {}) {
  const since = `NOW() - INTERVAL ${Math.max(1, Math.min(365, Number(days) || 30))} DAY`;
  const [[totals]] = await pool.query(
    `SELECT COUNT(*) AS questions,
            SUM(status = 'completed') AS completed,
            SUM(status IN ('failed','limit_reached')) AS problems,
            COALESCE(SUM(input_tokens), 0) AS input_tokens,
            COALESCE(SUM(output_tokens), 0) AS output_tokens,
            COALESCE(AVG(TIMESTAMPDIFF(SECOND, started_at, finished_at)), 0) AS avg_seconds,
            COUNT(DISTINCT user_id) AS people
     FROM agent_runs WHERE started_at >= ${since}`
  );
  const [byDay] = await pool.query(
    `SELECT DATE_FORMAT(started_at, '%Y-%m-%d') AS day, COUNT(*) AS questions,
            COALESCE(SUM(input_tokens + output_tokens), 0) AS tokens
     FROM agent_runs WHERE started_at >= NOW() - INTERVAL 14 DAY
     GROUP BY day ORDER BY day`
  );
  const [tools] = await pool.query(
    `SELECT s.tool_name AS tool, COUNT(*) AS calls, SUM(s.status <> 'ok') AS errors,
            ROUND(AVG(s.duration_ms)) AS avg_ms
     FROM agent_run_steps s JOIN agent_runs r ON r.id = s.run_id
     WHERE s.type = 'tool' AND r.started_at >= ${since}
     GROUP BY s.tool_name ORDER BY calls DESC LIMIT 10`
  );
  const [people] = await pool.query(
    `SELECT u.username, u.role, COUNT(*) AS questions
     FROM agent_runs r JOIN users u ON u.id = r.user_id
     WHERE r.started_at >= ${since}
     GROUP BY u.id, u.username, u.role ORDER BY questions DESC LIMIT 5`
  );
  const [recentProblems] = await pool.query(
    `SELECT r.id, r.status, r.error, r.started_at, u.username
     FROM agent_runs r JOIN users u ON u.id = r.user_id
     WHERE r.status IN ('failed','limit_reached') AND r.started_at >= ${since}
     ORDER BY r.id DESC LIMIT 5`
  );

  const n = (v) => Number(v) || 0;
  const input = n(totals.input_tokens);
  const output = n(totals.output_tokens);
  const inRate = Number(process.env.AI_COST_PER_1K_INPUT) || 0;
  const outRate = Number(process.env.AI_COST_PER_1K_OUTPUT) || 0;
  return {
    days: Number(days) || 30,
    totals: {
      questions: n(totals.questions),
      completed: n(totals.completed),
      problems: n(totals.problems),
      input_tokens: input,
      output_tokens: output,
      avg_seconds: Math.round(n(totals.avg_seconds) * 10) / 10,
      people: n(totals.people),
      estimated_cost:
        inRate || outRate ? Math.round(((input / 1000) * inRate + (output / 1000) * outRate) * 100) / 100 : null,
    },
    by_day: byDay.map((d) => ({ day: d.day, questions: n(d.questions), tokens: n(d.tokens) })),
    tools: tools.map((t) => ({ tool: t.tool, calls: n(t.calls), errors: n(t.errors), avg_ms: n(t.avg_ms) })),
    people: people.map((p) => ({ ...p, questions: n(p.questions) })),
    recent_problems: recentProblems,
  };
}
