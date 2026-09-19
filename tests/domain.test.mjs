import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "eldevo-tests-"));
process.env.NODE_ENV = "test";
process.env.DATABASE_DRIVER = "pglite";
process.env.WHOP_COMPANY_ID = "biz_test";
const { db, record, save, post, atomic, balance, settings } =
  await import("../server/db.mjs");
const { createUser } = await import("../server/auth.mjs");
const d = await import("../server/domain.mjs");
const { playUrl, parseListing } = await import("../server/play.mjs");
const { applyEvent, verifySignature } = await import("../server/whop.mjs");
const client = await createUser({
  name: "Client",
  email: "client@test.com",
  password: "test-password-1234",
  role: "client",
});
const pub = await createUser({
  name: "Publisher",
  email: "pub@test.com",
  password: "test-password-1234",
  role: "publisher",
});
const outsider = await createUser({
  name: "Other",
  email: "other@test.com",
  password: "test-password-1234",
  role: "client",
});
const admin = await createUser({
  name: "Admin",
  email: "admin@test.com",
  password: "test-password-1234",
  role: "admin",
});
const file = await save("file", {
  owner: client.id,
  kind: "app",
  name: "app.aab",
});
await atomic(
  async () => await post(client.id, 50000, 0, "test fixture", "seed", "seed"),
);
await save("publisher", {
  id: `publisher:${pub.id}`,
  owner: pub.id,
  name: pub.name,
  status: "approved",
  developerIdentity: "/store/apps/dev?id=1234",
});
let app;
test("user budget minimum and commission snapshot enforced on server", async () => {
  const body = {
    title: "My app",
    packageName: "com.example.app",
    version: "1",
    description: "A valid description long enough",
    category: "Tools",
    privacyUrl: "https://example.com/privacy",
    fileId: file.id,
    rights: true,
    budget: 4999,
  };
  await assert.rejects(async () => await d.createApp(client, body));
  app = await d.createApp(client, {
    ...body,
    budget: 8000,
  });
  assert.equal(app.price.publishFee, 8000);
  assert.equal(app.price.publisherShare, 6400);
  assert.deepEqual(await balance(client.id), {
    available: 49000,
    held: 1000,
  });
});
test("access isolation rejects another client and unauthorized admin call", async () => {
  await assert.rejects(
    async () => await d.owned(app.id, outsider, "app"),
    (e) => e.status === 403,
  );
  await assert.rejects(
    async () =>
      await d.adminAction(client, "apps", app.id, {
        action: "review",
      }),
    (e) => e.status === 403,
  );
});
test("review cannot be charged twice and only approved apps become available", async () => {
  await d.adminAction(admin, "apps", app.id, {
    action: "review",
    decision: "approve",
    report: "Reviewed permissions and content and rights manually.",
  });
  assert.equal((await record(app.id)).status, "open");
  assert.equal((await balance(client.id)).held, 0);
  await assert.rejects(
    async () =>
      await d.adminAction(admin, "apps", app.id, {
        action: "review",
        decision: "approve",
        report: "Reviewed permissions and content and rights manually.",
      }),
  );
  assert.equal((await balance("platform")).available, 1000);
});
test("publisher offer and customer choice reserve funds once", async () => {
  await d.offer(pub, app.id, {
    note: "Ready to publish this application.",
  });
  await d.choose(client, app.id, {
    publisherId: pub.id,
  });
  assert.equal((await balance(client.id)).held, 8000);
  await assert.rejects(
    async () =>
      await d.choose(client, app.id, {
        publisherId: pub.id,
      }),
  );
  assert.equal((await balance(client.id)).held, 8000);
});
test("public verifier rejects SSRF, mismatch, ambiguous page and captcha", () => {
  assert.throws(() => playUrl("http://127.0.0.1/private"));
  assert.throws(() =>
    playUrl("https://play.google.com.evil.example/store/apps/details?id=a.b"),
  );
  assert.throws(() =>
    playUrl("https://evil@play.google.com/store/apps/details?id=a.b"),
  );
  const html =
    "<html>" +
    " ".repeat(1200) +
    '<script type="application/ld+json">{"@type":"SoftwareApplication","description":"ELDEVO-test","author":{"url":"https://play.google.com/store/apps/dev?id=1234"}}</script><link rel="canonical" href="https://play.google.com/store/apps/details?id=com.example.app"/></html>';
  assert.equal(
    parseListing(
      html,
      "com.example.app",
      "/store/apps/dev?id=1234",
      "ELDEVO-test",
    ).status,
    "verified",
  );
  assert.equal(
    parseListing(html, "com.example.app", "/store/apps/dev?id=9999").status,
    "mismatch",
  );
  assert.equal(
    parseListing(html + "captcha", "com.example.app", "/store/apps/dev?id=1234")
      .status,
    "unknown",
  );
  assert.equal(
    parseListing(
      html.replace("ELDEVO-test", "description") + "<p>ELDEVO-test</p>",
      "com.example.app",
      "/store/apps/dev?id=1234",
      "ELDEVO-test",
    ).status,
    "unknown",
  );
  assert.equal(
    parseListing(html, "com.example.ap", "/store/apps/dev?id=1234").status,
    "unknown",
  );
});
test("unknown verification never releases money and disputes freeze settlement", async () => {
  let a = await record(app.id);
  a.status = "verified";
  a.releaseAt = new Date(Date.now() - 1000).toISOString();
  a.verification = {
    status: "unknown",
    checkedAt: new Date().toISOString(),
  };
  await save("app", a);
  await assert.rejects(async () => await d.settle(a.id));
  a.verification.status = "verified";
  await save("app", a);
  await d.dispute(client, a.id, {
    reason: "The published application is not the expected build.",
  });
  await assert.rejects(async () => await d.settle(a.id));
  assert.equal((await balance(pub.id)).available, 0);
});
test("administrator refund restores held budget exactly once", async () => {
  await d.adminAction(admin, "apps", app.id, {
    action: "cancel",
    note: "Confirmed publication issue and approved the refund.",
  });
  assert.equal((await balance(client.id)).held, 0);
  assert.equal((await balance(client.id)).available, 49000);
  await assert.rejects(
    async () =>
      await d.adminAction(admin, "apps", app.id, {
        action: "cancel",
        note: "Retry cancellation should not double refund.",
      }),
  );
});
test("atomic insufficient balance leaves no orphan ledger entry", async () => {
  await assert.rejects(
    async () =>
      await atomic(
        async () => await post(outsider.id, -100, 100, "hold", "x", "negative"),
      ),
  );
  assert.deepEqual(await balance(outsider.id), {
    available: 0,
    held: 0,
  });
});
test("Whop webhook signature rejects forged and stale payloads", () => {
  const secret = "ws_fixture",
    raw = JSON.stringify({
      type: "test",
    }),
    stamp = String(Math.floor(Date.now() / 1000)),
    eventId = "msg_1";
  const signature = createHmac("sha256", secret)
    .update(`${eventId}.${stamp}.${raw}`)
    .digest("base64");
  const headers = {
    "webhook-id": eventId,
    "webhook-timestamp": stamp,
    "webhook-signature": `v1,${signature}`,
  };
  assert.equal(verifySignature(raw, headers, secret).type, "test");
  assert.throws(() => verifySignature(raw + " ", headers, secret));
  assert.throws(() =>
    verifySignature(
      raw,
      {
        ...headers,
        "webhook-timestamp": "1",
      },
      secret,
    ),
  );
});
test("Whop payment checks price and owner and never double credits", async () => {
  const p = await save("payment", {
    owner: client.id,
    provider: "whop",
    amount: 5000,
    planId: "plan_test",
    status: "pending",
  });
  const event = {
    type: "payment.succeeded",
    data: {
      id: "pay_test",
      metadata: {
        eldevo_payment_id: p.id,
        eldevo_user_id: client.id,
      },
      company: {
        id: "biz_test",
      },
      currency: "usd",
      status: "paid",
      subtotal: 50,
      plan: {
        id: "plan_test",
      },
    },
  };
  await assert.rejects(
    async () =>
      await applyEvent({
        ...event,
        data: {
          ...event.data,
          subtotal: 5,
        },
      }),
  );
  await assert.rejects(
    async () =>
      await d.adminAction(admin, "payments", p.id, {
        action: "approve",
        reference: "manual bypass",
      }),
  );
  const before = (await balance(client.id)).available;
  assert.equal((await applyEvent(event)).credited, true);
  assert.equal((await applyEvent(event)).duplicate, true);
  assert.equal((await balance(client.id)).available, before + 5000);
});
test("cryptocurrency withdrawal validates role, network, minimum, fees, transaction and prevents repeats", async () => {
  await atomic(
    async () =>
      await post(pub.id, 10000, 0, "earned fixture", "seed-pub", "seed-pub"),
  );
  await assert.rejects(
    async () =>
      await d.withdraw(client, {
        amount: 3000,
        network: "USDC-POLYGON",
        address: "0x" + "a".repeat(40),
        confirmed: true,
      }),
  );
  await assert.rejects(
    async () =>
      await d.withdraw(pub, {
        amount: 1000,
        network: "USDC-POLYGON",
        address: "0x" + "a".repeat(40),
        confirmed: true,
      }),
  );
  await assert.rejects(
    async () =>
      await d.withdraw(pub, {
        amount: 3000,
        network: "USDT-TRC20",
        address: "0x" + "a".repeat(40),
        confirmed: true,
      }),
  );
  const w = await d.withdraw(pub, {
    amount: 3000,
    network: "USDC-POLYGON",
    address: "0x" + "a".repeat(40),
    confirmed: true,
  });
  assert.equal(w.net, 2800);
  assert.equal((await balance(pub.id)).held, 3000);
  await assert.rejects(
    async () =>
      await d.adminAction(admin, "withdrawals", w.id, {
        action: "approve",
        reference: "fake",
        cryptoAmount: "28",
      }),
  );
  await d.adminAction(admin, "withdrawals", w.id, {
    action: "approve",
    reference: "0x" + "b".repeat(64),
    cryptoAmount: "28",
  });
  assert.equal((await balance(pub.id)).held, 0);
  await assert.rejects(
    async () =>
      await d.adminAction(admin, "withdrawals", w.id, {
        action: "approve",
        reference: "0x" + "b".repeat(64),
        cryptoAmount: "28",
      }),
  );
});
test("settlement requires recent verification and pays exact platform split once", async () => {
  const a = await d.createApp(client, {
    title: "Second app",
    packageName: "com.example.second",
    version: "1",
    description: "Another application with a valid description",
    category: "Tools",
    privacyUrl: "https://example.com/privacy",
    fileId: file.id,
    rights: true,
    budget: 5000,
  });
  await d.adminAction(admin, "apps", a.id, {
    action: "review",
    decision: "approve",
    report: "Manually reviewed the application and its permissions.",
  });
  await d.offer(pub, a.id, {
    note: "I can publish this application.",
  });
  await d.choose(client, a.id, {
    publisherId: pub.id,
  });
  let r = await record(a.id);
  r.status = "verified";
  r.releaseAt = new Date(Date.now() - 1000).toISOString();
  r.verification = {
    status: "verified",
    checkedAt: new Date(Date.now() - 7200000).toISOString(),
  };
  await save("app", r);
  await assert.rejects(async () => await d.settle(a.id));
  r.verification.checkedAt = new Date().toISOString();
  await save("app", r);
  const before = (await balance(pub.id)).available;
  await d.settle(a.id);
  assert.equal((await balance(pub.id)).available, before + 4000);
  await assert.rejects(async () => await d.settle(a.id));
});
after(async () => {
  await db.close();
  rmSync(process.env.DATA_DIR, {
    recursive: true,
    force: true,
  });
});
