import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "eldevo-http-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_DRIVER = "pglite";
const { server } = await import("../server/index.mjs");
const { db, save, post, atomic, record } = await import("../server/db.mjs");
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
let client, other;
async function req(path, body, session = {}, headers = {}) {
  const r = await fetch(base + "/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session.cookie
        ? {
            cookie: session.cookie,
            "X-CSRF-Token": session.csrf,
          }
        : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {
    status: r.status,
    body: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function register(email, role = "client") {
  const r = await req("/auth/register", {
    name: "Test User",
    email,
    password: "secure-test-password",
    role,
    terms: true,
  });
  return {
    ...r.body,
    cookie: r.cookie,
  };
}
test("registration prevents admin role injection and persists session", async () => {
  const invalid = await req("/auth/register", {
    name: "Bad",
    email: "bad@test.com",
    password: "secure-test-password",
    role: "admin",
    terms: true,
  });
  assert.equal(invalid.status, 400);
  client = await register("a@test.com");
  other = await register("b@test.com");
  const me = await req("/me", undefined, client);
  assert.equal(me.body.user.id, client.user.id);
  assert.equal(me.body.user.password, undefined);
});
test("CSRF and cross origin checks reject mutations", async () => {
  const bad = await req(
    "/tickets",
    {
      subject: "hello",
      body: "long enough message",
    },
    {
      ...client,
      csrf: "wrong",
    },
  );
  assert.equal(bad.status, 403);
  const cross = await req(
    "/tickets",
    {
      subject: "hello",
      body: "long enough message",
    },
    client,
    {
      origin: "https://evil.example",
    },
  );
  assert.equal(cross.status, 403);
});
test("API cannot mint wallet money and unauthenticated users cannot read state", async () => {
  assert.equal((await req("/state")).status, 401);
  assert.equal(
    (
      await req(
        "/admin/settings",
        {
          reviewFee: 0,
        },
        client,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await req(
        "/payments",
        {
          amount: 999999,
        },
        client,
      )
    ).status,
    404,
  );
});
test("upload is private, rejects wrong file signatures and isolates owner", async () => {
  const h = {
    cookie: client.cookie,
    "X-CSRF-Token": client.csrf,
    "X-File-Name": "app.aab",
    "X-Upload-Kind": "app",
  };
  let r = await fetch(base + "/api/upload", {
    method: "POST",
    headers: h,
    body: "fake data",
  });
  assert.equal(r.status, 400);
  r = await fetch(base + "/api/upload", {
    method: "POST",
    headers: h,
    body: Buffer.from([80, 75, 3, 4, 0, 0, 0, 0]),
  });
  assert.equal(r.status, 201);
  const file = await r.json();
  r = await fetch(base + "/api/files/" + file.id, {
    headers: {
      cookie: other.cookie,
    },
  });
  assert.equal(r.status, 403);
  r = await fetch(base + "/api/files/" + file.id, {
    headers: {
      cookie: client.cookie,
    },
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/octet-stream");
});
test("logout invalidates session", async () => {
  assert.equal((await req("/logout", {}, client)).status, 200);
  assert.equal((await req("/state", undefined, client)).status, 401);
});
after(async () => {
  await new Promise((r) => server.close(r));
  await db.close();
  rmSync(process.env.DATA_DIR, {
    recursive: true,
    force: true,
  });
});
