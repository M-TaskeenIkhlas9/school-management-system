import { z } from "zod";

/** ?page=&pageSize= (defaults 1 / 25, max 200 per page). */
export const pageParams = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
};

export const pageWindow = ({ page, pageSize }) => ({ limit: pageSize, offset: (page - 1) * pageSize });

export const pageResult = (items, total, { page, pageSize }) => ({
  items,
  total,
  page,
  pageSize,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
});

/**
 * Build "WHERE a = ? AND b IN (?)" from [clause, value] pairs whose value is set.
 * An empty array (e.g. a teacher with no classes) matches nothing.
 */
export function whereClause(conditions) {
  const active = conditions.filter(([, value]) => value !== undefined && value !== null && value !== "");
  const clauses = [];
  const params = [];
  for (const [clause, value] of active) {
    if (Array.isArray(value) && value.length === 0) {
      clauses.push("1 = 0");
    } else {
      clauses.push(clause);
      params.push(value);
    }
  }
  return { sql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}
