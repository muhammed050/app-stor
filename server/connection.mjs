import { AsyncLocalStorage } from "node:async_hooks";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
try {
  process.loadEnvFile();
} catch {}
pg.types.setTypeParser(20, (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("Database integer exceeds safe range");
  return number;
});
const context = new AsyncLocalStorage();
const migrationsDir = fileURLToPath(
  new URL("../supabase/migrations/", import.meta.url),
);
export function migrations() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(`${migrationsDir}/${name}`, "utf8"),
    }));
}
const embedded = process.env.DATABASE_DRIVER === "pglite";
let pool, local;
let queue = Promise.resolve();
if (embedded) {
  if (process.env.NODE_ENV !== "test")
    throw new Error(
      "PGlite is only allowed in tests. Configure SUPABASE_DB_URL.",
    );
  const { PGlite } = await import("@electric-sql/pglite");
  local = new PGlite();
  await local.waitReady;
  for (const migration of migrations()) await local.exec(migration.sql);
} else {
  if (!process.env.SUPABASE_DB_URL)
    throw new Error(
      "Set SUPABASE_DB_URL to the PostgreSQL connection string from Supabase Connect. Run npm run db:migrate before starting.",
    );
  const url = new URL(process.env.SUPABASE_DB_URL);
  // Enforce certificate verification. URL sslmode must not override this option.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"])
    url.searchParams.delete(key);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (process.env.DATABASE_SSL === "disable" && !loopback)
    throw new Error("TLS is required for remote databases.");
  pool = new pg.Pool({
    connectionString: url.href,
    ssl:
      process.env.DATABASE_SSL === "disable" && loopback
        ? false
        : {
            rejectUnauthorized: true,
            ...(process.env.SUPABASE_DB_CA
              ? { ca: process.env.SUPABASE_DB_CA.replace(/\\n/g, "\n") }
              : {}),
          },
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
  });
  pool.on("error", () => console.error("Database connection interrupted"));
}
async function withClient(fn) {
  if (!embedded) {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  const previous = queue;
  let release;
  queue = new Promise((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await fn({
      query: (sql, params) =>
        params
          ? local.query(sql, params)
          : local.exec(sql).then((results) => results.at(-1)),
    });
  } finally {
    release();
  }
}
export async function atomic(fn) {
  if (context.getStore()) return fn();
  return withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL search_path = eldevo, pg_catalog");
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL statement_timeout = '30s'");
      // Shared across all server instances; protects record read/modify/write and wallet totals.
      await client.query("SELECT pg_advisory_xact_lock(731246, 1)");
      const result = await context.run(client, fn);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
export async function query(sql, params = []) {
  const client = context.getStore();
  if (client) return client.query(sql, params);
  return atomic(() => query(sql, params));
}
export const db = {
  prepare(sql) {
    let i = 0;
    const statement = sql.replace(/\?/g, () => `$${++i}`);
    return {
      async get(...params) {
        return (await query(statement, params)).rows[0];
      },
      async all(...params) {
        return (await query(statement, params)).rows;
      },
      async run(...params) {
        const r = await query(statement, params);
        return { changes: r.rowCount ?? r.affectedRows };
      },
    };
  },
  async exec(sql) {
    return atomic(() => context.getStore().query(sql));
  },
  async close() {
    if (local) await local.close();
    else await pool.end();
  },
};
