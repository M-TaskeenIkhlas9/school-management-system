import { createError } from "./errorHandler.js";

/**
 * Validate request body against a schema object.
 *
 * Schema format:
 *   { field: { required?: boolean, type?: string, min?: number, max?: number, enum?: string[] } }
 *
 * Usage:  router.post("/", validate({ name: { required: true, type: "string" } }), handler)
 */
export default function validate(schema) {
  return (req, _res, next) => {
    const errors = [];
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      const missing = value === undefined || value === null || value === "";

      if (rules.required && missing) {
        errors.push(`${field} is required`);
        continue;
      }

      if (missing) continue;

      if (rules.type === "number" && typeof value !== "number" && isNaN(Number(value))) {
        errors.push(`${field} must be a number`);
        continue;
      }

      if (rules.type === "string" && typeof value !== "string") {
        errors.push(`${field} must be a string`);
        continue;
      }

      const num = Number(value);
      if (rules.min !== undefined && num < rules.min) {
        errors.push(`${field} must be at least ${rules.min}`);
      }
      if (rules.max !== undefined && num > rules.max) {
        errors.push(`${field} must be at most ${rules.max}`);
      }

      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(", ")}`);
      }
    }

    if (errors.length) {
      return next(createError(400, "Validation failed", "VALIDATION_ERROR", errors));
    }
    next();
  };
}
