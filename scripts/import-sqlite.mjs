// Explicit, read-only legacy import. Never modify or delete the source database.
import { DatabaseSync } from "node:sqlite";
import { db, atomic } from "../server/db.mjs";
const tables = [
  "users",
  "sessions",
  "records",
  "ledger",
  "audit",
  "resets",
  "limits",
];
let source;
try {
  if (!process.env.SQLITE_IMPORT_PATH)
    throw new Error(
      "Set SQLITE_IMPORT_PATH to the legacy SQLite database. Stop the old app first.",
    );
  source = new DatabaseSync(process.env.SQLITE_IMPORT_PATH, { readOnly: true });
  await atomic(async () => {
    for (const table of tables) {
      const row = await db
        .prepare(`SELECT count(*) AS count FROM ${table}`)
        .get();
      if (Number(row.count))
        throw new Error(
          "Import requires empty application tables. No records were changed.",
        );
    }
    for (const table of tables) {
      const columns = source
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((row) => row.name);
      if (!columns.length || columns.some((name) => !/^[a-z_]+$/.test(name)))
        throw new Error(`Invalid source table: ${table}`);
      const rows = source
        .prepare(`SELECT * FROM ${table} ORDER BY rowid`)
        .all();
      for (const row of rows) {
        await db
          .prepare(
            `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
          )
          .run(...columns.map((key) => row[key]));
      }
      const imported = await db
        .prepare(`SELECT count(*) AS count FROM ${table}`)
        .get();
      if (Number(imported.count) !== rows.length)
        throw new Error(`Count mismatch: ${table}`);
    }
    const negative = await db
      .prepare(
        "SELECT user_id FROM ledger GROUP BY user_id HAVING SUM(available)<0 OR SUM(held)<0",
      )
      .all();
    if (negative.length)
      throw new Error("Source contains negative balances; import rolled back.");
  });
  console.log(
    "Legacy database imported and row counts verified. Keep the original backup and private uploads.",
  );
} finally {
  source?.close();
  await db.close();
}
