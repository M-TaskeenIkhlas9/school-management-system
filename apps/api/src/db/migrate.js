/**
 * Minimal SQL migration runner.
 *
 * Applies src/db/migrations/NNN_name.(sql|js) files in order, once each, recording
 * them in `schema_migrations`. Creates the database if it does not exist.
 *
 * Usage: npm run migrate            (uses DB_* from .env)
 *        DB_NAME=other npm run migrate
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate({ database = process.env.DB_NAME || "school_management", log = console.log } = {}) {
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error(`Invalid database name: ${database}`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });

  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\``);
    await conn.query(`USE \`${database}\``);
    await conn.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name VARCHAR(255) PRIMARY KEY,
         applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
       ) ENGINE=InnoDB`
    );

    const [appliedRows] = await conn.query("SELECT name FROM schema_migrations");
    const applied = new Set(appliedRows.map((r) => r.name));
    const files = (await fs.readdir(MIGRATIONS_DIR)).filter((f) => /\.(sql|js)$/.test(f)).sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      log(`[migrate] ${database}: applying ${file}`);
      if (file.endsWith(".js")) {
        // JS migrations export `up(conn)` for changes that need logic (e.g. data moves).
        const migration = await import(pathToFileURL(path.join(MIGRATIONS_DIR, file)).href);
        await migration.up(conn, { log });
      } else {
        await conn.query(await fs.readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
      }
      await conn.query("INSERT INTO schema_migrations (name) VALUES (?)", [file]);
      count++;
    }
    log(`[migrate] ${database}: ${count ? `${count} migration(s) applied` : "up to date"}`);
  } finally {
    await conn.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().catch((err) => {
    console.error("[migrate] failed:", err.message);
    process.exit(1);
  });
}
