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

/** Build "WHERE a = ? AND b >= ?" from [clause, value] pairs whose value is set. */
export function whereClause(conditions) {
  const active = conditions.filter(([, value]) => value !== undefined && value !== null && value !== "");
  return {
    sql: active.length ? `WHERE ${active.map(([clause]) => clause).join(" AND ")}` : "",
    params: active.map(([, value]) => value),
  };
}
