import { createHash } from "node:crypto";
import { db, atomic, query, migrations } from "../server/connection.mjs";
try {
  await atomic(async () => {
    await db.exec(`CREATE SCHEMA IF NOT EXISTS eldevo;
      REVOKE ALL ON SCHEMA eldevo FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS eldevo.migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());
      ALTER TABLE eldevo.migrations ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON eldevo.migrations FROM PUBLIC;`);
    for (const { name, sql } of migrations()) {
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = (
        await query("SELECT checksum FROM eldevo.migrations WHERE name=$1", [
          name,
        ])
      ).rows[0];
      if (previous) {
        if (previous.checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await db.exec(sql);
      await query(
        "INSERT INTO eldevo.migrations(name, checksum) VALUES ($1, $2)",
        [name, checksum],
      );
      console.log(`Applied ${name}`);
    }
  });
} finally {
  await db.close();
}
