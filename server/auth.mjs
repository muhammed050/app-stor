import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { db, id, now, cleanUser } from "./db.mjs";
export const digest = (s) => createHash("sha256").update(s).digest("hex");
export function hash(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function passwordMatches(password, stored) {
  try {
    const [salt, expected] = stored.split(":");
    return timingSafeEqual(
      scryptSync(password, salt, 64),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}
export function createUser({ name, email, password, role }) {
  const user = {
    id: id(),
    name,
    email: email.toLowerCase(),
    password: hash(password),
    role,
    status: "active",
    created_at: now(),
  };
  db.prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?)").run(
    ...Object.values(user),
  );
  return cleanUser(user);
}
export function sessionFor(req) {
  const token = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("eldevo_session="))
    ?.slice(15);
  if (!token) return null;
  const s = db
    .prepare(
      "SELECT s.csrf,s.token,s.expires,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.status=?",
    )
    .get(digest(token), Date.now(), "active");
  return s || null;
}
export function newSession(res, user) {
  const token = randomBytes(32).toString("hex"),
    csrf = randomBytes(24).toString("hex");
  const seconds = Number(process.env.SESSION_DAYS || 14) * 86400;
  db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
    digest(token),
    user.id,
    csrf,
    Date.now() + seconds * 1000,
  );
  res.setHeader(
    "Set-Cookie",
    `eldevo_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
  return csrf;
}
export function limit(key, max = 10, window = 900000) {
  db.prepare("DELETE FROM limits WHERE expires<?").run(Date.now());
  const r = db.prepare("SELECT * FROM limits WHERE key=?").get(key);
  if (r && r.count >= max) {
    const e = new Error("محاولات كثيرة. حاول لاحقًا.");
    e.status = 429;
    throw e;
  }
  db.prepare(
    "INSERT INTO limits VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
  ).run(key, 1, Date.now() + window);
}
