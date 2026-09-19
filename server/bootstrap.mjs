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
    if (process.env.ADMIN_PASSWORD.length < 14)
      throw new Error("Admin password requires 14 characters");
    if (await db.prepare("SELECT 1 FROM users WHERE email=?").get(email))
      throw new Error("Admin email is already registered; use admin CLI");
    await createUser({
      name: "إدارة إلديفو",
      email,
      password: process.env.ADMIN_PASSWORD,
      role: "admin",
    });
  });
}
