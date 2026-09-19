import { db, atomic } from "./db.mjs";
import { createUser } from "./auth.mjs";
export async function bootstrapAdmin() {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) return;
  return atomic(async () => {
    if (
      await db.prepare("SELECT 1 FROM users WHERE role='admin' LIMIT 1").get()
    )
      return;
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw Object.assign(new Error("Invalid admin email"), { code: "ADMIN_EMAIL_INVALID" });
    if (process.env.ADMIN_PASSWORD.length < 14)
      throw Object.assign(new Error("Admin password requires 14 characters"), { code: "ADMIN_PASSWORD_TOO_SHORT" });
    if (await db.prepare("SELECT 1 FROM users WHERE email=?").get(email))
      throw Object.assign(new Error("Admin email is already registered; use admin CLI"), { code: "ADMIN_EMAIL_ALREADY_REGISTERED" });
    await createUser({
      name: "إدارة Dorucenie",
      email,
      password: process.env.ADMIN_PASSWORD,
      role: "admin",
    });
  });
}
