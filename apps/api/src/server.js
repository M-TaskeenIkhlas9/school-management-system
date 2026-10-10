// Process entry point: validate config, ensure the first principal exists, listen,
// and shut down cleanly (finish in-flight requests, close the DB pool) on SIGINT/SIGTERM.
import app from "./app.js";
import logger from "./lib/logger.js";
import pool from "./db/pool.js";
import { assertConfig } from "./config/env.js";
import { ensureDefaultPrincipal } from "./modules/auth/auth.service.js";
import { startWorker } from "./jobs/queue.js";
import "./jobs/handlers.js";

const PORT = Number(process.env.PORT) || 4000;

async function start() {
  assertConfig();
  await ensureDefaultPrincipal();

  const stopWorker = process.env.JOBS_WORKER === "off" ? () => {} : startWorker();

  const server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down…`);
    stopWorker();
    server.close(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    });
    // Force-exit if connections don't drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

start().catch((err) => {
  logger.fatal(err.message, "Failed to start server");
  process.exit(1);
});
