import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "eldevo-tests-"));
process.env.NODE_ENV = "test";
process.env.WHOP_COMPANY_ID = "biz_test";
const { db, record, save, post, atomic, balance, settings } =
  await import("../server/db.mjs");
const { createUser } = await import("../server/auth.mjs");
const d = await import("../server/domain.mjs");
const { playUrl, parseListing } = await import("../server/play.mjs");
const { applyEvent, verifySignature } = await import("../server/whop.mjs");
const client = createUser({
  name: "Client",
  email: "client@test.com",
  password: "test-password-1234",
  role: "client",
});
const pub = createUser({
  name: "Publisher",
  email: "pub@test.com",
  password: "test-password-1234",
  role: "publisher",
});
const outsider = createUser({
  name: "Other",
  email: "other@test.com",
  password: "test-password-1234",
  role: "client",
});
const admin = createUser({
  name: "Admin",
  email: "admin@test.com",
  password: "test-password-1234",
  role: "admin",
});
const file = save("file", { owner: client.id, kind: "app", name: "app.aab" });
atomic(() => post(client.id, 50000, 0, "test fixture", "seed", "seed"));
save("publisher", {
  id: `publisher:${pub.id}`,
  owner: pub.id,
  name: pub.name,
  status: "approved",
  developerIdentity: "/store/apps/dev?id=1234",
});
let app;
test("user budget minimum and commission snapshot enforced on server", () => {
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
  assert.throws(() => d.createApp(client, body));
  app = d.createApp(client, { ...body, budget: 8000 });
  assert.equal(app.price.publishFee, 8000);
  assert.equal(app.price.publisherShare, 6400);
  assert.deepEqual(balance(client.id), { available: 49000, held: 1000 });
});
test("access isolation rejects another client and unauthorized admin call", () => {
  assert.throws(
    () => d.owned(app.id, outsider, "app"),
    (e) => e.status === 403,
  );
  assert.throws(
    () => d.adminAction(client, "apps", app.id, { action: "review" }),
    (e) => e.status === 403,
  );
});
test("review cannot be charged twice and only approved apps become available", () => {
  d.adminAction(admin, "apps", app.id, {
    action: "review",
    decision: "approve",
    report: "Reviewed permissions and content and rights manually.",
  });
  assert.equal(record(app.id).status, "open");
  assert.equal(balance(client.id).held, 0);
  assert.throws(() =>
    d.adminAction(admin, "apps", app.id, {
      action: "review",
      decision: "approve",
      report: "Reviewed permissions and content and rights manually.",
    }),
  );
  assert.equal(balance("platform").available, 1000);
});
test("publisher offer and customer choice reserve funds once", () => {
  d.offer(pub, app.id, { note: "Ready to publish this application." });
  d.choose(client, app.id, { publisherId: pub.id });
  assert.equal(balance(client.id).held, 8000);
  assert.throws(() => d.choose(client, app.id, { publisherId: pub.id }));
  assert.equal(balance(client.id).held, 8000);
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
test("unknown verification never releases money and disputes freeze settlement", () => {
  let a = record(app.id);
  a.status = "verified";
  a.releaseAt = new Date(Date.now() - 1000).toISOString();
  a.verification = { status: "unknown", checkedAt: new Date().toISOString() };
  save("app", a);
  assert.throws(() => d.settle(a.id));
  a.verification.status = "verified";
  save("app", a);
  d.dispute(client, a.id, {
    reason: "The published application is not the expected build.",
  });
  assert.throws(() => d.settle(a.id));
  assert.equal(balance(pub.id).available, 0);
});
test("administrator refund restores held budget exactly once", () => {
  d.adminAction(admin, "apps", app.id, {
    action: "cancel",
    note: "Confirmed publication issue and approved the refund.",
  });
  assert.equal(balance(client.id).held, 0);
  assert.equal(balance(client.id).available, 49000);
  assert.throws(() =>
    d.adminAction(admin, "apps", app.id, {
      action: "cancel",
      note: "Retry cancellation should not double refund.",
    }),
  );
});
test("atomic insufficient balance leaves no orphan ledger entry", () => {
  assert.throws(() =>
    atomic(() => post(outsider.id, -100, 100, "hold", "x", "negative")),
  );
  assert.deepEqual(balance(outsider.id), { available: 0, held: 0 });
});
test("Whop webhook signature rejects forged and stale payloads", () => {
  const secret = "ws_fixture",
    raw = JSON.stringify({ type: "test" }),
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
    verifySignature(raw, { ...headers, "webhook-timestamp": "1" }, secret),
  );
});
test("Whop payment checks price and owner and never double credits", () => {
  const p = save("payment", {
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
      metadata: { eldevo_payment_id: p.id, eldevo_user_id: client.id },
      company: { id: "biz_test" },
      currency: "usd",
      status: "paid",
      subtotal: 50,
      plan: { id: "plan_test" },
    },
  };
  assert.throws(() =>
    applyEvent({ ...event, data: { ...event.data, subtotal: 5 } }),
  );
  assert.throws(() =>
    d.adminAction(admin, "payments", p.id, {
      action: "approve",
      reference: "manual bypass",
    }),
  );
  const before = balance(client.id).available;
  assert.equal(applyEvent(event).credited, true);
  assert.equal(applyEvent(event).duplicate, true);
  assert.equal(balance(client.id).available, before + 5000);
});
test("cryptocurrency withdrawal validates role, network, minimum, fees, transaction and prevents repeats", () => {
  atomic(() =>
    post(pub.id, 10000, 0, "earned fixture", "seed-pub", "seed-pub"),
  );
  assert.throws(() =>
    d.withdraw(client, {
      amount: 3000,
      network: "USDC-POLYGON",
      address: "0x" + "a".repeat(40),
      confirmed: true,
    }),
  );
  assert.throws(() =>
    d.withdraw(pub, {
      amount: 1000,
      network: "USDC-POLYGON",
      address: "0x" + "a".repeat(40),
      confirmed: true,
    }),
  );
  assert.throws(() =>
    d.withdraw(pub, {
      amount: 3000,
      network: "USDT-TRC20",
      address: "0x" + "a".repeat(40),
      confirmed: true,
    }),
  );
  const w = d.withdraw(pub, {
    amount: 3000,
    network: "USDC-POLYGON",
    address: "0x" + "a".repeat(40),
    confirmed: true,
  });
  assert.equal(w.net, 2800);
  assert.equal(balance(pub.id).held, 3000);
  assert.throws(() =>
    d.adminAction(admin, "withdrawals", w.id, {
      action: "approve",
      reference: "fake",
      cryptoAmount: "28",
    }),
  );
  d.adminAction(admin, "withdrawals", w.id, {
    action: "approve",
    reference: "0x" + "b".repeat(64),
    cryptoAmount: "28",
  });
  assert.equal(balance(pub.id).held, 0);
  assert.throws(() =>
    d.adminAction(admin, "withdrawals", w.id, {
      action: "approve",
      reference: "0x" + "b".repeat(64),
      cryptoAmount: "28",
    }),
  );
});
test("settlement requires recent verification and pays exact platform split once", () => {
  const a = d.createApp(client, {
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
  d.adminAction(admin, "apps", a.id, {
    action: "review",
    decision: "approve",
    report: "Manually reviewed the application and its permissions.",
  });
  d.offer(pub, a.id, { note: "I can publish this application." });
  d.choose(client, a.id, { publisherId: pub.id });
  let r = record(a.id);
  r.status = "verified";
  r.releaseAt = new Date(Date.now() - 1000).toISOString();
  r.verification = {
    status: "verified",
    checkedAt: new Date(Date.now() - 7200000).toISOString(),
  };
  save("app", r);
  assert.throws(() => d.settle(a.id));
  r.verification.checkedAt = new Date().toISOString();
  save("app", r);
  const before = balance(pub.id).available;
  d.settle(a.id);
  assert.equal(balance(pub.id).available, before + 4000);
  assert.throws(() => d.settle(a.id));
});
after(() => {
  db.close();
  rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});
