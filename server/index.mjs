import { publicPages } from "../shared/seo.mjs";
import { appOrigin } from "./config.mjs";
import {
  beginUpload,
  uploadPart,
  finishUpload,
  streamUpload,
} from "./uploads.mjs";
import { runSweep, authorizeJob } from "./jobs.mjs";
import { createServer } from "node:http";
import {
  mkdirSync,
  createReadStream,
  createWriteStream,
  existsSync,
  statSync,
  unlinkSync,
  readFileSync,
} from "node:fs";
import { resolve, extname } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import {
  db,
  dataDir,
  id,
  now,
  record,
  records,
  save,
  settings,
  cleanUser,
  audit,
  atomic,
} from "./db.mjs";
import {
  hash,
  passwordMatches,
  createUser,
  sessionFor,
  newSession,
  limit,
  digest,
} from "./auth.mjs";
import * as d from "./domain.mjs";
import {
  createCheckout,
  verifySignature,
  applyEvent,
  configured,
} from "./whop.mjs";
const uploads = resolve(dataDir, "uploads");
mkdirSync(uploads, {
  recursive: true,
  mode: 0o700,
});
const origin = appOrigin;
const allowedOrigins = new Set([
  origin,
  ...(process.env.NODE_ENV === "production"
    ? []
    : [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
      ]),
]);
function json(res, status, value) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(value));
}
async function body(req, max = 100000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > max) d.fail("حجم الطلب كبير جدًا", 413);
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function mail(to, subject, message) {
  if (!process.env.EMAIL_WEBHOOK_URL) return false;
  const r = await fetch(process.env.EMAIL_WEBHOOK_URL, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.EMAIL_WEBHOOK_TOKEN || ""}`,
    },
    body: JSON.stringify({
      to,
      subject,
      text: message,
    }),
  });
  return r.ok;
}
function sameOrigin(req) {
  if (req.headers.origin && !allowedOrigins.has(req.headers.origin))
    d.fail("مصدر الطلب غير مسموح", 403);
  if (req.headers["sec-fetch-site"] === "cross-site")
    d.fail("مصدر الطلب غير مسموح", 403);
}
async function upload(req, u) {
  if (process.env.VERCEL) d.fail("استخدم رفع الملفات المجزأ", 400);
  await limit(`upload:${u.id}`, 20, 3600000);
  const name = decodeURIComponent(req.headers["x-file-name"] || "");
  const ext = extname(name).toLowerCase();
  const kind = req.headers["x-upload-kind"];
  if (
    !["app", "receipt"].includes(kind) ||
    !(
      kind === "app" ? [".apk", ".aab"] : [".pdf", ".png", ".jpg", ".jpeg"]
    ).includes(ext)
  )
    d.fail("نوع ملف غير مسموح");
  const fileId = id(),
    path = resolve(uploads, fileId);
  const stream = createWriteStream(path, {
    flags: "wx",
    mode: 0o600,
  });
  let size = 0,
    header = Buffer.alloc(0);
  const sha = createHash("sha256");
  try {
    for await (const chunk of req) {
      size += chunk.length;
      if (size > (kind === "app" ? 128 : 10) * 1024 * 1024)
        d.fail("الملف أكبر من الحجم المسموح", 413);
      if (header.length < 12)
        header = Buffer.concat([header, chunk]).subarray(0, 12);
      sha.update(chunk);
      if (!stream.write(chunk)) await once(stream, "drain");
    }
    stream.end();
    await once(stream, "finish");
    const valid =
      kind === "app"
        ? header.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
        : ext === ".pdf"
          ? header.subarray(0, 5).toString() === "%PDF-"
          : ext === ".png"
            ? header
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : header[0] === 255 && header[1] === 216;
    if (!valid || !size) d.fail("محتوى الملف لا يطابق نوعه");
    return await save("file", {
      id: fileId,
      owner: u.id,
      name: name.slice(0, 150),
      kind,
      size,
      sha256: sha.digest("hex"),
    });
  } catch (e) {
    stream.destroy();
    try {
      unlinkSync(path);
    } catch {}
    throw e;
  }
}
async function download(res, u, key) {
  const f = await record(key);
  if (
    !f ||
    !(await db
      .prepare("SELECT 1 FROM records WHERE id=? AND kind='file'")
      .get(key))
  )
    d.fail("ملف غير موجود", 404);
  const can =
    u.role === "admin" ||
    f.owner === u.id ||
    (await records("app")).some(
      (a) => a.fileId === key && a.publisherId === u.id,
    ) ||
    (await records("update")).some(
      (a) => a.fileId === key && a.publisherId === u.id,
    );
  if (!can) d.fail("غير مسموح", 403);
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="download${extname(f.name)}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (f.storage === "postgres") return streamUpload(res, f);
  if (!existsSync(resolve(uploads, key))) {
    res.destroy();
    return;
  }
  createReadStream(resolve(uploads, key)).pipe(res);
}
export async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://whop.com https://*.whop.com; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https:; connect-src 'self' https://whop.com https://*.whop.com; frame-src https://whop.com https://*.whop.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
  }
  try {
    const url = new URL(req.url, origin),
      path = url.pathname,
      method = req.method;
    const mutation = !["GET", "HEAD"].includes(method);
    if (path === "/api/webhooks/whop" && method === "POST") {
      const raw = await body(req, 1000000);
      return json(
        res,
        200,
        await applyEvent(verifySignature(raw, req.headers)),
      );
    }
    if (path === "/api/jobs/verify" && method === "POST") {
      await authorizeJob(req);
      return json(res, 200, await runSweep());
    }
    if (mutation) sameOrigin(req);
    if (path === "/api/health") {
      await db.prepare("SELECT 1 FROM users LIMIT 1").get();
      return json(res, 200, { ok: true });
    }
    if (path === "/api/config")
      return json(res, 200, {
        settings: await settings(),
        whopConfigured: configured(),
        emailConfigured: Boolean(process.env.EMAIL_WEBHOOK_URL),
      });
    const session = await sessionFor(req),
      u = session
        ? cleanUser(
            await db.prepare("SELECT * FROM users WHERE id=?").get(session.id),
          )
        : null;
    if (path === "/api/me")
      return json(res, 200, {
        user: u,
        csrf: session?.csrf,
      });
    if (path.startsWith("/api/auth/") && method === "POST") {
      await limit(`auth:${req.socket.remoteAddress}`, 30);
      const b = JSON.parse(await body(req));
      if (path.endsWith("/register")) {
        if ((await settings()).maintenance)
          d.fail("التسجيل متوقف للصيانة", 503);
        if (!["client", "publisher"].includes(b.role))
          d.fail("نوع حساب غير صالح");
        const email = d.text(b.email, 5, 250).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          d.fail("البريد الإلكتروني غير صالح");
        const password = d.text(b.password, 10, 128),
          name = d.text(b.name, 2, 80);
        if (b.terms !== true) d.fail("تجب الموافقة على الشروط");
        if (await db.prepare("SELECT 1 FROM users WHERE email=?").get(email))
          d.fail("تعذر إنشاء الحساب بهذا البريد", 409);
        const user = await createUser({
          name,
          email,
          password,
          role: b.role,
        });
        await audit(user.id, "auth.register", user.id);
        return json(res, 201, {
          user,
          csrf: await newSession(res, user),
        });
      }
      if (path.endsWith("/login")) {
        const email = d.text(b.email, 5, 250).toLowerCase();
        await limit(`login:${email}`, 10);
        const user = await db
          .prepare("SELECT * FROM users WHERE email=?")
          .get(email);
        if (
          !user ||
          !passwordMatches(d.text(b.password, 1, 128), user.password) ||
          user.status !== "active"
        )
          d.fail("بيانات الدخول غير صحيحة أو الحساب معلق", 401);
        return json(res, 200, {
          user: cleanUser(user),
          csrf: await newSession(res, user),
        });
      }
      if (path.endsWith("/forgot")) {
        const email = d.text(b.email, 5, 250).toLowerCase();
        await limit(`reset:${email}`, 3, 3600000);
        if (!process.env.EMAIL_WEBHOOK_URL)
          d.fail(
            "استعادة كلمة المرور بالبريد غير مفعلة. تواصل مع إدارة الموقع.",
            503,
          );
        const user = await db
          .prepare("SELECT * FROM users WHERE email=?")
          .get(email);
        if (user) {
          const token = randomBytes(32).toString("hex");
          await db
            .prepare("INSERT INTO resets VALUES(?,?,?)")
            .run(digest(token), user.id, Date.now() + 1800000);
          try {
            await mail(
              email,
              "استعادة كلمة مرور إلديفو",
              `${origin}/reset?token=${token}`,
            );
          } catch {
            await audit(
              "system",
              "email.failed",
              user.id,
              "reset delivery failed",
            );
          }
        }
        return json(res, 200, {
          message: "إذا كان البريد مسجلًا، ستصلك رسالة الاستعادة.",
        });
      }
      if (path.endsWith("/reset")) {
        const token = digest(d.text(b.token, 20, 200));
        await atomic(async () => {
          const r = await db
            .prepare("SELECT * FROM resets WHERE token=? AND expires>?")
            .get(token, Date.now());
          if (!r) d.fail("الرابط غير صالح أو انتهت صلاحيته");
          await db
            .prepare("UPDATE users SET password=? WHERE id=?")
            .run(hash(d.text(b.password, 10, 128)), r.user_id);
          await db.prepare("DELETE FROM resets WHERE user_id=?").run(r.user_id);
          await db
            .prepare("DELETE FROM sessions WHERE user_id=?")
            .run(r.user_id);
        });
        return json(res, 200, {
          ok: true,
        });
      }
    }
    if (path.startsWith("/api/")) {
      if (!u) d.fail("سجّل الدخول للمتابعة", 401);
      if (mutation && req.headers["x-csrf-token"] !== session.csrf)
        d.fail("انتهت صلاحية الطلب. حدّث الصفحة.", 403);
      if ((await settings()).maintenance && u.role !== "admin" && mutation)
        d.fail("المنصة قيد الصيانة. يرجى المحاولة لاحقًا.", 503);
      if (path === "/api/state") return json(res, 200, await d.state(u));
      if (path.startsWith("/api/files/") && method === "GET")
        return await download(res, u, path.split("/").pop());
      if (path === "/api/upload" && method === "POST")
        return json(res, 201, await upload(req, u));
      if (!mutation) d.fail("المسار غير موجود", 404);
      await limit(`write:${u.id}`, 120, 60000);
      const uploadMatch = path.match(/^\/api\/uploads\/([^/]+)\/parts\/(\d+)$/);
      if (uploadMatch)
        return json(
          res,
          200,
          await uploadPart(req, u, uploadMatch[1], uploadMatch[2]),
        );
      const b = JSON.parse((await body(req)) || "{}");
      if (path === "/api/uploads")
        return json(res, 201, await beginUpload(u, b));
      const finishMatch = path.match(/^\/api\/uploads\/([^/]+)\/finish$/);
      if (finishMatch)
        return json(res, 200, await finishUpload(u, finishMatch[1]));
      const parts = path.split("/").filter(Boolean);
      let result;
      if (path === "/api/logout") {
        await db
          .prepare("DELETE FROM sessions WHERE token=?")
          .run(session.token);
        res.setHeader(
          "Set-Cookie",
          "eldevo_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
        );
        result = {
          ok: true,
        };
      } else if (path === "/api/profile") {
        await atomic(async () => {
          await db
            .prepare("UPDATE users SET name=? WHERE id=?")
            .run(d.text(b.name, 2, 80), u.id);
          if (b.password) {
            const user = await db
              .prepare("SELECT * FROM users WHERE id=?")
              .get(u.id);
            if (!passwordMatches(b.currentPassword || "", user.password))
              d.fail("كلمة المرور الحالية غير صحيحة");
            await db
              .prepare("UPDATE users SET password=? WHERE id=?")
              .run(hash(d.text(b.password, 10, 128)), u.id);
            await db
              .prepare("DELETE FROM sessions WHERE user_id=? AND token<>?")
              .run(u.id, session.token);
          }
        });
        result = {
          ok: true,
        };
      } else if (path === "/api/apps") result = await d.createApp(u, b);
      else if (parts[1] === "apps" && parts.length === 4) {
        const key = parts[2];
        const actions = {
          offer: async () => await d.offer(u, key, b),
          choose: async () => await d.choose(u, key, b),
          submit: async () => await d.submitLink(u, key, b),
          verify: async () => {
            await limit(`verify:${u.id}`, 10, 600000);
            return d.verifyApp(u, key);
          },
          message: async () => await d.message(u, key, b),
          dispute: async () => await d.dispute(u, key, b),
          renew: async () => await d.renew(u, key),
          update: async () => await d.createUpdate(u, key, b),
        };
        if (!actions[parts[3]]) d.fail("إجراء غير موجود", 404);
        result = await actions[parts[3]]();
      } else if (path === "/api/publisher")
        result = await d.publisherProfile(u, b);
      else if (path === "/api/publisher/verify") {
        await limit(`verify:${u.id}`, 10, 600000);
        result = await d.verifyPublisher(u);
      } else if (path === "/api/checkout") {
        await limit(`checkout:${u.id}`, 10, 3600000);
        result = await createCheckout(u, b);
      } else if (path === "/api/withdrawals") result = await d.withdraw(u, b);
      else if (path === "/api/tickets") result = await d.ticket(u, b);
      else if (parts[1] === "updates")
        result = await d.updateAction(u, parts[2], b);
      else if (path === "/api/notifications/read") {
        for (const n of (await records("notification")).filter(
          (n) => n.owner === u.id,
        ))
          await save("notification", {
            ...n,
            read: true,
          });
        result = {
          ok: true,
        };
      } else if (parts[1] === "admin") {
        if (parts[2] === "settle") {
          d.role(u, "admin");
          result = await d.settle(parts[3], u.id);
        } else
          result = await d.adminAction(u, parts[2], parts[3] || "settings", b);
      } else d.fail("المسار غير موجود", 404);
      return json(res, 200, result);
    }
    if (!["GET", "HEAD"].includes(method)) d.fail("غير مسموح", 405);
    const root = resolve("dist");
    let file = resolve(root, `.${decodeURIComponent(path)}`);
    if (!file.startsWith(root + "/") && file !== root) d.fail("غير مسموح", 403);
    const publicPage = Object.hasOwn(publicPages, path);
    const privatePage = /^\/(dashboard|apps|market|publisher|wallet|checkout|notifications|support|settings|admin|login|register|forgot|reset)(\/|$)/.test(path);
    let responseStatus = 200;
    if (publicPage) file = resolve(root, `.${path}/index.html`);
    else if (privatePage) { file = resolve(root, "app.html"); res.setHeader("X-Robots-Tag", "noindex, nofollow"); }
    else if (!existsSync(file) || !statSync(file).isFile()) { file = resolve(root, "404.html"); responseStatus = 404; res.setHeader("X-Robots-Tag", "noindex, nofollow"); }
    if (!existsSync(file))
      return json(res, 503, {
        error: "شغل npm run build أولًا أو افتح منفذ التطوير 5173",
      });
    const types = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".webp": "image/webp",
      ".xml": "application/xml; charset=utf-8",
      ".txt": "text/plain; charset=utf-8",
      ".woff2": "font/woff2",
    };
    res.writeHead(responseStatus, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control":
        extname(file) === ".html" ? "no-cache" : "public, max-age=3600",
    });
    if (method === "HEAD") res.end();
    else createReadStream(file).pipe(res);
  } catch (e) {
    if (res.headersSent) {
      res.end();
      return;
    }
    const status =
      e.status ||
      (e.code === "23505" ? 409 : 0) ||
      (e instanceof SyntaxError || e instanceof TypeError ? 400 : 500);
    if (status === 500) console.error("Request failed:", e.message);
    json(res, status, {
      error:
        e.code === "23505"
          ? "هذا السجل موجود مسبقًا. حدّث الصفحة وأعد المحاولة."
          : status === 500
            ? "تعذر إكمال الطلب على الخادم. حاول لاحقًا."
            : e.message,
    });
  }
}
export const server = createServer(handler);
if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  server.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
    () => console.log(`Eldevo running on port ${process.env.PORT || 3000}`),
  );
  const timer = setInterval(
    () =>
      runSweep().catch(() => console.error("Scheduled verification failed")),
    60000,
  );
  timer.unref();
}
