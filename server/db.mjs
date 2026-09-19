import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
try {
  process.loadEnvFile();
} catch {}
export const dataDir = resolve(process.env.DATA_DIR || "./data");
mkdirSync(dataDir, { recursive: true, mode: 0o700 });
export const db = new DatabaseSync(resolve(dataDir, "eldevo.sqlite"));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('client','publisher','admin')),status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,kind TEXT NOT NULL,owner TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS records_kind ON records(kind,owner);
CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,available INTEGER NOT NULL,held INTEGER NOT NULL,label TEXT NOT NULL,reference TEXT NOT NULL,unique_key TEXT UNIQUE NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id);
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS resets(token TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
`);
export const now = () => new Date().toISOString();
export const id = () => randomUUID();
export function atomic(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function record(key) {
  const row = db.prepare("SELECT body FROM records WHERE id=?").get(key);
  return row ? JSON.parse(row.body) : null;
}
export function records(kind) {
  return db
    .prepare("SELECT body FROM records WHERE kind=? ORDER BY created_at DESC")
    .all(kind)
    .map((r) => JSON.parse(r.body));
}
export function save(kind, value) {
  const v = { ...value };
  v.id ||= id();
  v.createdAt ||= now();
  db.prepare(
    "INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
  ).run(v.id, kind, v.owner || "system", JSON.stringify(v), v.createdAt);
  return v;
}
export function balance(userId) {
  const r = db
    .prepare(
      "SELECT COALESCE(SUM(available),0) available, COALESCE(SUM(held),0) held FROM ledger WHERE user_id=?",
    )
    .get(userId);
  return { available: Number(r.available), held: Number(r.held) };
}
export function post(userId, available, held, label, reference, key) {
  if (!Number.isSafeInteger(available) || !Number.isSafeInteger(held))
    throw new Error("Invalid money");
  if (db.prepare("SELECT 1 FROM ledger WHERE unique_key=?").get(key))
    return false;
  const b = balance(userId);
  if (b.available + available < 0 || b.held + held < 0) {
    const e = new Error("الرصيد المتاح غير كافٍ أو المبلغ المحجوز غير صالح");
    e.status = 409;
    throw e;
  }
  db.prepare("INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)").run(
    id(),
    userId,
    available,
    held,
    label,
    reference,
    key,
    now(),
  );
  return true;
}
export function audit(actor, action, target, detail = "") {
  db.prepare("INSERT INTO audit VALUES(?,?,?,?,?,?)").run(
    id(),
    actor,
    action,
    target,
    detail,
    now(),
  );
}
export function notify(owner, title, body, link = "/dashboard") {
  save("notification", { owner, title, body, link, read: false });
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
export function settings() {
  return { ...defaults, ...record("settings") };
}
export function cleanUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}
