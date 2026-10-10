import { z } from "zod";
import { createError } from "./errorHandler.js";

/**
 * Validate (and normalise) the request body with a zod schema.
 * On success req.body is replaced by the parsed value (unknown fields stripped,
 * numbers coerced). On failure → 400 { error, code: "VALIDATION_ERROR", details: [...] }.
 *
 * Usage: router.post("/", validate(createStudentSchema), handler)
 */
export default function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const details = result.error.issues.map((issue) => {
        const field = issue.path.join(".");
        return field ? `${field}: ${issue.message}` : issue.message;
      });
      return next(createError(400, "Validation failed", "VALIDATION_ERROR", details));
    }
    req.body = result.data;
    next();
  };
}

/** Parse and validate req.query with a zod schema (Express 5 query is read-only). */
export function parseQuery(schema, query) {
  const result = schema.safeParse(query ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join(".") || "query"}: ${i.message}`);
    throw createError(400, "Invalid query parameters", "VALIDATION_ERROR", details);
  }
  return result.data;
}

/** Parse a positive integer route param (e.g. :id) or throw 400. */
export function idParam(req, name = "id") {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) throw createError(400, `Invalid ${name}`, "VALIDATION_ERROR");
  return id;
}

// ---------- Field helpers shared by module schemas ----------
// HTML forms send "" for empty inputs. Optional fields map "" to null, so an edit
// form can clear a value; a field that is absent stays undefined (left unchanged).

const emptyToNull = (v) => (v === "" ? null : v);

export const requiredText = (max = 255) => z.string().trim().min(1, "is required").max(max);

export const optionalText = (max = 255) => z.preprocess(emptyToNull, z.string().trim().max(max).nullish());

export const optionalLongText = () => z.preprocess(emptyToNull, z.string().trim().nullish());

export const requiredId = () => z.coerce.number().int().positive();

export const optionalId = () => z.preprocess(emptyToNull, z.coerce.number().int().positive().nullish());

export const optionalNumber = () => z.preprocess(emptyToNull, z.coerce.number().nullish());

export const isoDate = () =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "must be a date (YYYY-MM-DD)")
    .transform((s) => s.slice(0, 10));

export const optionalDate = () => z.preprocess(emptyToNull, isoDate().nullish());

export const optionalEmail = () =>
  z.preprocess(emptyToNull, z.string().trim().email("must be a valid email").nullish());
