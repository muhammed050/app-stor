import { db } from "../server/db.mjs";
import { createUser, hash } from "../server/auth.mjs";
const email = process.env.ADMIN_EMAIL,
  password = process.env.ADMIN_PASSWORD;
if (!email || !password || password.length < 14) {
  console.error(
    "Set ADMIN_EMAIL and ADMIN_PASSWORD (14+ characters) in the environment. No default administrator exists.",
  );
  process.exit(1);
}
const existing = db
  .prepare("SELECT * FROM users WHERE email=?")
  .get(email.toLowerCase());
if (existing) {
  db.prepare(
    "UPDATE users SET role='admin',status='active',password=? WHERE id=?",
  ).run(hash(password), existing.id);
  db.prepare("DELETE FROM sessions WHERE user_id=?").run(existing.id);
} else createUser({ name: "إدارة إلديفو", email, password, role: "admin" });
console.log("Administrator configured. Keep these credentials private.");
