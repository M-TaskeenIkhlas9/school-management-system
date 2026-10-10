import pool from "../db/pool.js";
import logger from "./logger.js";

/**
 * Record who did what. Never throws: a failed audit write is logged but must not
 * break the user's request.
 */
export async function audit(req, action, { entityType = null, entityId = null, details = null, userId } = {}) {
  try {
    await pool.execute(
      "INSERT INTO audit_log (user_id, action, entity_type, entity_id, details, ip) VALUES (?, ?, ?, ?, ?, ?)",
      [
        userId ?? req?.user?.id ?? null,
        action,
        entityType,
        entityId,
        details ? JSON.stringify(details) : null,
        req?.ip ?? null,
      ]
    );
  } catch (err) {
    logger.error({ err, action }, "Failed to write audit log");
  }
}
