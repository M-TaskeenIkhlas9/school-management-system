// Process entry point: validate config, ensure the first principal exists, listen,
// and shut down cleanly (finish in-flight requests, close the DB pool) on SIGINT/SIGTERM.
import app from "./app.js";
import pool from "./db/pool.js";
import { assertConfig } from "./config/env.js";
import { ensureDefaultPrincipal } from "./modules/auth/auth.service.js";

const PORT = Number(process.env.PORT) || 4000;

async function start() {
  assertConfig();
  await ensureDefaultPrincipal();

  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down…`);
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
  console.error("Failed to start server:", err.message);
  process.exit(1);
});
