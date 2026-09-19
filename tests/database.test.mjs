import { test, after } from "node:test";
import assert from "node:assert/strict";
process.env.NODE_ENV = "test";
process.env.DATABASE_DRIVER =
  process.env.DATABASE_TEST_POSTGRES === "1" ? "postgres" : "pglite";
const { db, atomic, post, balance, record, save, records } =
  await import("../server/db.mjs");
const { createUser } = await import("../server/auth.mjs");
const { withdraw } = await import("../server/domain.mjs");

test("concurrent withdrawals cannot reserve the same balance twice", async () => {
  const publisher = await createUser({
    name: "Publisher",
    email: "race@test.com",
    password: "secure-test-password",
    role: "publisher",
  });
  await post(publisher.id, 5000, 0, "fixture", "race", "race-seed");
  const body = {
    amount: 4000,
    network: "USDC-POLYGON",
    address: `0x${"a".repeat(40)}`,
    confirmed: true,
  };
  const results = await Promise.allSettled([
    withdraw(publisher, body),
    withdraw(publisher, body),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.deepEqual(await balance(publisher.id), {
    available: 1000,
    held: 4000,
  });
  assert.equal((await records("withdrawal")).length, 1);
});
test("duplicate credits and transaction rollback preserve wallet and records", async () => {
  await Promise.all([
    post("fixture", 5000, 0, "fixture", "duplicate", "same-credit"),
    post("fixture", 5000, 0, "fixture", "duplicate", "same-credit"),
  ]);
  assert.deepEqual(await balance("fixture"), { available: 5000, held: 0 });
  await assert.rejects(
    atomic(async () => {
      await save("test", { id: "rollback", owner: "fixture" });
      await post("fixture", -6000, 6000, "hold", "rollback", "rollback-hold");
    }),
  );
  assert.equal(await record("rollback"), null);
  assert.deepEqual(await balance("fixture"), { available: 5000, held: 0 });
});
test("all application tables have RLS and public has no private schema access", async () => {
  const tables = await db
    .prepare(
      "SELECT relname, relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='eldevo' AND relkind='r' AND relname <> 'migrations'",
    )
    .all();
  assert.equal(tables.length, 7);
  assert.ok(tables.every((table) => table.relrowsecurity));
  await db.exec("CREATE ROLE eldevo_test_anon NOLOGIN");
  await assert.rejects(
    atomic(async () => {
      await db.exec("SET LOCAL ROLE eldevo_test_anon");
      await db.prepare("SELECT * FROM eldevo.users").all();
    }),
    /permission denied/,
  );
});
after(async () => {
  await db.close();
});
