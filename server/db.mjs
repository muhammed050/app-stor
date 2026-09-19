import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { db, atomic } from "./connection.mjs";
export { db, atomic };
export const dataDir = resolve(process.env.DATA_DIR || "./data");
mkdirSync(dataDir, {
  recursive: true,
  mode: 0o700,
});
export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export async function record(key) {
  const row = await db.prepare("SELECT body FROM records WHERE id=?").get(key);
  return row ? JSON.parse(row.body) : null;
}
export async function records(kind) {
  return (
    await db
      .prepare("SELECT body FROM records WHERE kind=? ORDER BY created_at DESC")
      .all(kind)
  ).map((r) => JSON.parse(r.body));
}
export async function save(kind, value) {
  const v = {
    ...value,
  };
  v.id ||= id();
  v.createdAt ||= now();
  await db
    .prepare(
      "INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
    )
    .run(v.id, kind, v.owner || "system", JSON.stringify(v), v.createdAt);
  return v;
}
export async function balance(userId) {
  const r = await db
    .prepare(
      "SELECT COALESCE(SUM(available),0) available, COALESCE(SUM(held),0) held FROM ledger WHERE user_id=?",
    )
    .get(userId);
  return {
    available: Number(r.available),
    held: Number(r.held),
  };
}
export async function post(userId, available, held, label, reference, key) {
  return atomic(async () => {
    if (!Number.isSafeInteger(available) || !Number.isSafeInteger(held))
      throw new Error("Invalid money");
    if (await db.prepare("SELECT 1 FROM ledger WHERE unique_key=?").get(key))
      return false;
    const b = await balance(userId);
    if (b.available + available < 0 || b.held + held < 0) {
      const e = new Error("الرصيد المتاح غير كافٍ أو المبلغ المحجوز غير صالح");
      e.status = 409;
      throw e;
    }
    await db
      .prepare("INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)")
      .run(id(), userId, available, held, label, reference, key, now());
    return true;
  });
}
export async function audit(actor, action, target, detail = "") {
  await db
    .prepare("INSERT INTO audit VALUES(?,?,?,?,?,?)")
    .run(id(), actor, action, target, detail, now());
}
export async function notify(owner, title, body, link = "/dashboard") {
  await save("notification", {
    owner,
    title,
    body,
    link,
    read: false,
  });
}
export const defaults = {
  reviewFee: 1000,
  minPublishBudget: 5000,
  commissionBps: 2000,
  minTopup: 1000,
  withdrawFee: 200,
  withdrawBps: 0,
  publishFee: 5000,
  publisherShare: 4000,
  monthlyFee: 1900,
  monthlyShare: 1200,
  updateFee: 2500,
  updateShare: 1500,
  holdHours: 72,
  minWithdrawal: 2500,
  platformName: "إلديفو",
  supportEmail: "",
  depositInstructions:
    "الشحن متوقف حتى تضيف الإدارة بيانات وسيلة الدفع وتعليمات التحويل.",
  depositsEnabled: false,
  maintenance: false,
};
export async function settings() {
  return {
    ...defaults,
    ...(await record("settings")),
  };
}
export function cleanUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}
