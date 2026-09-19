import { timingSafeEqual, randomUUID } from "node:crypto";
import { db, record, records, save, atomic, audit } from "./db.mjs";
import { fail, verifyApp, settle } from "./domain.mjs";
export async function authorizeJob(req) {
  const secret = process.env.CRON_SECRET || (await record("job:secret"))?.value;
  const header = req.headers.authorization || "";
  const expected = `Bearer ${secret || ""}`;
  if (
    !secret ||
    Buffer.byteLength(header) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(header), Buffer.from(expected))
  )
    fail("غير مسموح", 401);
}
export async function runSweep() {
  const token = randomUUID();
  const claimed = await atomic(async () => {
    const lease = await record("job:lease");
    if (lease && lease.until > Date.now()) return false;
    await save("job", { id: "job:lease", until: Date.now() + 180000, token });
    return true;
  });
  if (!claimed) return { busy: true };
  let checked = 0;
  try {
    const pending = (await records("app"))
      .filter((a) => {
        const last = Date.parse(a.verification?.checkedAt || "") || 0;
        if (a.status === "submitted") return Date.now() - last > 15 * 60000;
        if (a.status === "verified")
          return (
            Date.parse(a.releaseAt) <= Date.now() && Date.now() - last > 60000
          );
        return a.status === "completed" && Date.now() - last > 86400000;
      })
      .sort(
        (a, b) =>
          (Date.parse(a.verification?.checkedAt) || 0) -
          (Date.parse(b.verification?.checkedAt) || 0),
      )
      .slice(0, 5);
    for (const app of pending) {
      try {
        await verifyApp({ id: "system", role: "admin" }, app.id);
        if (app.status === "verified") await settle(app.id);
      } catch (error) {
        await audit("system", "settlement.blocked", app.id, error.message);
      }
      checked++;
    }
    await db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    await db.prepare("DELETE FROM resets WHERE expires<?").run(Date.now());
    await db
      .prepare("DELETE FROM uploads WHERE NOT completed AND expires<?")
      .run(Date.now());
    return { checked };
  } finally {
    await atomic(async () => {
      const lease = await record("job:lease");
      if (lease?.token === token)
        await save("job", { ...lease, until: Date.now() + 60000 });
    });
  }
}
