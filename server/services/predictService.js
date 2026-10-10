import pool from "../db.js";
import * as studentService from "./studentService.js";

/** Parse a number, keeping legitimate zeros; fall back only when missing/invalid. */
function toNumberOr(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Compute risk score (0-1) and SHAP-like feature contributions.
 * Risk = likelihood student needs attention (low attendance, low scores, fee issues).
 */
function computeRiskAndContributions({ attendance_rate, average_score, fee_status }) {
  const att = toNumberOr(attendance_rate, 100);
  const score = toNumberOr(average_score, 100);
  const feePending = String(fee_status || "").toLowerCase().includes("pending");

  const contributions = [];

  // Attendance: <75% adds to risk
  const attContrib = att < 75 ? 0.35 * (1 - att / 75) : -0.05;
  contributions.push({
    feature: `attendance_rate = ${att.toFixed(1)}%`,
    value: att,
    shap_value: Number(attContrib.toFixed(3)),
  });

  // Average score: <50 adds to risk
  const scoreContrib = score < 50 ? 0.3 * (1 - score / 50) : score < 70 ? 0.1 : -0.05;
  contributions.push({
    feature: `average_score = ${score.toFixed(1)}%`,
    value: score,
    shap_value: Number(scoreContrib.toFixed(3)),
  });

  // Fee status
  const feeContrib = feePending ? 0.2 : -0.02;
  contributions.push({
    feature: `fee_status = ${fee_status || "unknown"}`,
    value: feePending ? 1 : 0,
    shap_value: Number(feeContrib.toFixed(3)),
  });

  const baseValue = 0.5;
  const totalShap = contributions.reduce((s, c) => s + c.shap_value, 0);
  const riskScore = Math.max(0, Math.min(1, baseValue + totalShap));

  return {
    risk_score: Number(riskScore.toFixed(3)),
    prediction: riskScore >= 0.6 ? "Needs Attention" : riskScore >= 0.4 ? "Monitor" : "On Track",
    contributions: contributions.sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value)),
  };
}

export async function getPredictionForStudent(studentId) {
  const profile = await studentService.getProfile(Number(studentId));
  if (!profile) return null;

  const feeStatus = profile.fees?.some((f) => f.status !== "paid") ? "Pending" : "Clear";
  const scores = profile.results?.map((r) => Number(r.percentage)) || [];
  const averageScore = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 100;

  return {
    student_id: profile.id,
    student_name: `${profile.first_name} ${profile.last_name}`,
    ...computeRiskAndContributions({
      attendance_rate: profile.attendance_rate,
      average_score: averageScore,
      fee_status: feeStatus,
    }),
  };
}

export async function getPredictionForCustom({ attendance_rate, average_score, fee_status }) {
  return {
    student_name: "Custom (not in dataset)",
    ...computeRiskAndContributions({
      attendance_rate: toNumberOr(attendance_rate, 100),
      average_score: toNumberOr(average_score, 100),
      fee_status: fee_status || "Clear",
    }),
  };
}
