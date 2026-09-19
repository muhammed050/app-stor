import {validateListing} from "./listing.mjs";
import { cryptoMethods, enabledMethods, methodById, validAddress, validTransaction } from "../shared/crypto.mjs";
import { randomBytes } from "node:crypto";
import {
  db,
  record,
  records,
  save,
  settings,
  balance,
  post,
  atomic,
  audit,
  notify,
  now,
  cleanUser,
} from "./db.mjs";
import {
  playUrl,
  packageName,
  publisherIdentity,
  inspectPlay,
} from "./play.mjs";
export function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
export function text(v, min = 1, max = 300) {
  if (typeof v !== "string" || v.trim().length < min || v.length > max)
    fail("يرجى تعبئة الحقول بشكل صحيح");
  return v.trim();
}
export function amount(v) {
  if (!Number.isSafeInteger(v) || v < 100 || v > 1000000)
    fail("المبلغ يجب أن يكون بين 1 و10000 دولار");
  return v;
}
export function role(u, ...allowed) {
  if (!allowed.includes(u.role)) fail("ليست لديك صلاحية لهذا الإجراء", 403);
}
export async function owned(key, u, kind) {
  const r = await record(key);
  if (
    !r ||
    (kind &&
      !(await db
        .prepare("SELECT 1 FROM records WHERE id=? AND kind=?")
        .get(key, kind)))
  )
    fail("السجل غير موجود", 404);
  if (u.role !== "admin" && r.owner !== u.id && r.publisherId !== u.id)
    fail("ليست لديك صلاحية", 403);
  return r;
}
export function timeline(a, label) {
  a.history ||= [];
  a.history.push({
    label,
    at: now(),
  });
}
const activeUser = async (id) =>
  await db
    .prepare("SELECT * FROM users WHERE id=? AND status=?")
    .get(id, "active");
async function fileOwned(id, u, type) {
  const f = await record(id);
  if (!f || f.owner !== u.id || f.kind !== type)
    fail("ارفع الملف المطلوب أولًا");
  return f;
}
async function platform(delta, label, ref, key) {
  await post("platform", delta, 0, label, ref, key);
}
function snapshot(s) {
  return Object.fromEntries(
    [
      "reviewFee",
      "publishFee",
      "publisherShare",
      "monthlyFee",
      "monthlyShare",
      "updateFee",
      "updateShare",
      "holdHours",
    ].map((k) => [k, s[k]]),
  );
}
export async function state(u) {
  return await atomic(async () => {
    const admin = u.role === "admin",
      apps = await records("app");
    const mine = apps.filter(
      (a) => admin || a.owner === u.id || a.publisherId === u.id,
    );
    const publishers = await records("publisher");
    return {
      user: cleanUser(u),
      settings: await settings(),
      balance: await balance(u.id),
      ledger: await db
        .prepare(
          "SELECT * FROM ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 200",
        )
        .all(u.id),
      apps: mine,
      market:
        u.role === "publisher" &&
        (await record(`publisher:${u.id}`))?.status === "approved"
          ? apps
              .filter((a) => a.status === "open")
              .map((a) => ({
                id: a.id,
                title: a.title,
                category: a.category,
                description: a.description,
                packageName: a.packageName,
                createdAt: a.createdAt,
                price: a.price.publisherShare,
                offered: (a.offers || []).some((o) => o.publisherId === u.id),
                report: a.report,
              }))
          : [],
      publisher: await record(`publisher:${u.id}`),
      publishers: admin
        ? publishers
        : publishers
            .filter((p) =>
              mine.some((a) =>
                (a.offers || []).some((o) => o.publisherId === p.owner),
              ),
            )
            .map((p) => ({
              owner: p.owner,
              name: p.name,
              developerUrl: p.developerUrl,
              bio: p.bio,
              status: p.status,
            })),
      payments: (await records("payment")).filter(
        (r) => admin || r.owner === u.id,
      ),
      withdrawals: (await records("withdrawal")).filter(
        (r) => admin || r.owner === u.id,
      ),
      tickets: (await records("ticket")).filter(
        (r) => admin || r.owner === u.id,
      ),
      updates: (await records("update")).filter(
        (r) => admin || r.owner === u.id || r.publisherId === u.id,
      ),
      notifications: (await records("notification"))
        .filter((r) => r.owner === u.id)
        .slice(0, 100),
      users: admin
        ? await Promise.all(
            (
              await db
                .prepare(
                  "SELECT id,name,email,role,status,created_at FROM users ORDER BY created_at DESC",
                )
                .all()
            ).map(async (v) => ({
              ...v,
              balance: await balance(v.id),
            })),
          )
        : [],
      audit: admin
        ? await db
            .prepare("SELECT * FROM audit ORDER BY created_at DESC LIMIT 200")
            .all()
        : [],
      platformBalance: admin ? await balance("platform") : undefined,
      emailConfigured: Boolean(process.env.EMAIL_WEBHOOK_URL),
      whopConfigured: Boolean(
        process.env.WHOP_API_KEY &&
        process.env.WHOP_COMPANY_ID &&
        process.env.WHOP_PRODUCT_ID &&
        process.env.WHOP_WEBHOOK_SECRET,
      ),
    };
  });
}
export async function createApp(u, b) {
  return await atomic(async () => {
    role(u, "client");
    const s = await settings();
    const f = await fileOwned(b.fileId, u, "app");
    const budget = amount(b.budget);
    if (budget < s.minPublishBudget) fail("الميزانية أقل من الحد الأدنى للنشر");
    const pkg = packageName(b.packageName);
    if (
      (await records("app")).some(
        (a) =>
          a.packageName === pkg &&
          !["cancelled", "rejected"].includes(a.status),
      )
    )
      fail("يوجد طلب نشط بهذا المعرّف", 409);
    const privacy = new URL(b.privacyUrl);
    if (privacy.protocol !== "https:") fail("رابط الخصوصية يجب أن يكون HTTPS");
    if (b.rights !== true) fail("يجب تأكيد حقوق التطبيق");
    if(!f.name?.toLowerCase().endsWith(".aab")) fail("النشر الجديد يحتاج ملف AAB");
    const listing = await validateListing(b.listing,u);
    return await atomic(async () => {
      const a = await save("app", {
        owner: u.id,
        title: text(b.title, 2, 30),
        packageName: pkg,
        version: text(b.version, 1, 30),
        description: text(b.description, 20, 4000),
        listing,
        category: text(b.category, 2, 60),
        privacyUrl: privacy.href,
        fileId: f.id,
        status: "reviewing",
        price: {
          ...snapshot(s),
          publishFee: budget,
          publisherShare:
            budget - Math.round((budget * s.commissionBps) / 10000),
          commissionBps: s.commissionBps,
        },
        offers: [],
        history: [],
        messages: [],
        report: "",
        publisherId: null,
      });
      await post(
        u.id,
        -s.reviewFee,
        s.reviewFee,
        "حجز رسم فحص التطبيق",
        a.id,
        `review-hold:${a.id}`,
      );
      timeline(a, "تم تقديم التطبيق للفحص");
      await audit(u.id, "app.create", a.id);
      return await save("app", a);
    });
  });
}
export async function publisherProfile(u, b) {
  return await atomic(async () => {
    role(u, "publisher");
    const existing = await record(`publisher:${u.id}`);
    if (
      existing?.status === "approved" &&
      (await records("app")).some(
        (a) =>
          a.publisherId === u.id &&
          !["completed", "cancelled"].includes(a.status),
      )
    )
      fail("لا يمكن تغيير هوية الناشر أثناء طلب نشط");
    const p = await save("publisher", {
      id: `publisher:${u.id}`,
      owner: u.id,
      name: u.name,
      developerUrl: text(b.developerUrl),
      developerIdentity: publisherIdentity(b.developerUrl),
      sampleUrl: playUrl(b.sampleUrl),
      bio: text(b.bio, 20, 2000),
      categories: text(b.categories, 2, 300),
      status: "pending",
      challenge: `ELDEVO-${randomBytes(9).toString("hex").toUpperCase()}`,
      verification: null,
    });
    await audit(u.id, "publisher.submit", p.id);
    return p;
  });
}
export async function verifyPublisher(u) {
  role(u, "publisher");
  const p = await owned(`publisher:${u.id}`, u, "publisher");
  if (p.status === "approved") return p;
  const result = await inspectPlay(
    p.sampleUrl,
    p.developerIdentity,
    p.challenge,
  );
  return atomic(async () => {
    const fresh = await owned(p.id, u, "publisher");
    if (fresh.challenge !== p.challenge)
      fail("تغير طلب التحقق. أعد المحاولة.", 409);
    fresh.verification = result;
    await save("publisher", fresh);
    await audit(u.id, "publisher.verify", p.id, result.status);
    return result;
  });
}
export async function offer(u, key, b) {
  return await atomic(async () => {
    role(u, "publisher");
    const p = await record(`publisher:${u.id}`);
    if (p?.status !== "approved") fail("يلزم اعتماد حساب الناشر أولًا", 403);
    const a = await record(key);
    if (!a || a.status !== "open") fail("الطلب غير متاح");
    if (a.offers.some((o) => o.publisherId === u.id))
      fail("قدمت عرضًا لهذا الطلب بالفعل");
    a.offers.push({
      publisherId: u.id,
      name: u.name,
      note: text(b.note, 10, 1000),
      at: now(),
    });
    await save("app", a);
    await notify(
      a.owner,
      "عرض نشر جديد",
      `${u.name} قدم عرضًا لتطبيق ${a.title}`,
      `/apps/${a.id}`,
    );
    return a.id;
  });
}
export async function choose(u, key, b) {
  return await atomic(async () => {
    role(u, "client");
    return await atomic(async () => {
      const a = await owned(key, u, "app");
      if (
        a.status !== "open" ||
        !a.offers.some((o) => o.publisherId === b.publisherId)
      )
        fail("العرض غير متاح");
      const p = await record(`publisher:${b.publisherId}`);
      if (p?.status !== "approved" || !(await activeUser(b.publisherId)))
        fail("حساب الناشر غير متاح");
      await post(
        u.id,
        -a.price.publishFee,
        a.price.publishFee,
        "حجز رسوم النشر",
        a.id,
        `publish-hold:${a.id}`,
      );
      a.publisherId = b.publisherId;
      a.status = "assigned";
      timeline(a, "تم اختيار الناشر وحجز رسوم النشر");
      await save("app", a);
      await notify(a.publisherId, "تم اختيار عرضك", a.title, `/apps/${a.id}`);
      await audit(u.id, "offer.accept", a.id);
      return a;
    });
  });
}
export async function submitLink(u, key, b) {
  return await atomic(async () => {
    role(u, "publisher");
    const a = await owned(key, u, "app");
    if (a.publisherId !== u.id || !["assigned", "submitted"].includes(a.status))
      fail("لا يمكن تسليم هذا الطلب");
    const url = playUrl(b.url);
    if (new URL(url).searchParams.get("id") !== a.packageName)
      fail("معرّف التطبيق في الرابط لا يطابق الطلب");
    a.storeUrl = url;
    a.status = "submitted";
    timeline(a, "أرسل الناشر رابط التطبيق للتحقق");
    return await save("app", a);
  });
}
export async function verifyApp(u, key) {
  const a = await owned(key, u, "app");
  if (!["submitted", "verified", "completed"].includes(a.status))
    fail("يلزم إرسال رابط التطبيق أولًا");
  const p = await record(`publisher:${a.publisherId}`);
  if (!p || p.status !== "approved") fail("حساب الناشر غير معتمد");
  const result = await inspectPlay(a.storeUrl, p.developerIdentity);
  return await atomic(async () => {
    const fresh = await owned(key, u, "app");
    if (fresh.storeUrl !== a.storeUrl) fail("تغير رابط الطلب");
    fresh.verification = result;
    if (fresh.status === "submitted" && result.status === "verified") {
      fresh.status = "verified";
      fresh.releaseAt = new Date(
        Date.now() + fresh.price.holdHours * 3600000,
      ).toISOString();
      timeline(fresh, "تم التحقق من الصفحة العامة؛ بدأت مهلة الاعتراض");
      await notify(
        fresh.owner,
        "تم التحقق من نشر تطبيقك",
        "راجع التطبيق قبل انتهاء مهلة الاعتراض.",
        `/apps/${key}`,
      );
    }
    await save("app", fresh);
    await audit(u.id, "publication.verify", key, result.status);
    return result;
  });
}
export async function settle(key, actor = "system") {
  return await atomic(async () => {
    return await atomic(async () => {
      const a = await record(key);
      if (
        !a ||
        a.status !== "verified" ||
        a.verification?.status !== "verified" ||
        Date.parse(a.releaseAt) > Date.now()
      )
        fail("لم تكتمل شروط التسوية", 409);
      if (
        Date.now() - Date.parse(a.verification.checkedAt) > 3600000 ||
        (await record(`publisher:${a.publisherId}`))?.status !== "approved"
      )
        fail("يلزم تحقق حديث وحساب ناشر معتمد", 409);
      if (!(await activeUser(a.owner)) || !(await activeUser(a.publisherId)))
        fail("الحساب معلق؛ تحتاج التسوية مراجعة الإدارة", 409);
      await post(
        a.owner,
        0,
        -a.price.publishFee,
        "إتمام النشر",
        key,
        `publish-debit:${key}`,
      );
      await post(
        a.publisherId,
        a.price.publisherShare,
        0,
        "أرباح نشر تطبيق",
        key,
        `publish-credit:${key}`,
      );
      await platform(
        a.price.publishFee - a.price.publisherShare,
        "عمولة نشر",
        key,
        `publish-platform:${key}`,
      );
      a.status = "completed";
      timeline(a, "اكتملت الصفقة وصرفت حصة الناشر إلى محفظته");
      await save("app", a);
      await audit(actor, "publication.settle", key);
      await notify(a.publisherId, "أرباح جديدة متاحة", a.title, "/wallet");
      return a;
    });
  });
}
export async function message(u, key, b) {
  return await atomic(async () => {
    const a = await owned(key, u, "app");
    a.messages ||= [];
    a.messages.push({
      id: randomBytes(8).toString("hex"),
      sender: u.id,
      name: u.name,
      role: u.role,
      text: text(b.text, 1, 3000),
      at: now(),
    });
    return await save("app", a);
  });
}
export async function dispute(u, key, b) {
  return await atomic(async () => {
    const a = await owned(key, u, "app");
    if (!["assigned", "submitted", "verified"].includes(a.status))
      fail("لا يمكن فتح نزاع في هذه الحالة");
    a.status = "disputed";
    a.disputeReason = text(b.reason, 10, 3000);
    timeline(a, "تم فتح نزاع وتجميد التسوية");
    await save("app", a);
    await audit(u.id, "dispute.open", key);
    return a;
  });
}
export async function renew(u, key) {
  return await atomic(async () => {
    role(u, "client");
    return await atomic(async () => {
      const a = await owned(key, u, "app");
      if (a.status !== "completed") fail("التطبيق لم يكتمل نشره");
      if (!(await activeUser(a.publisherId))) fail("حساب الناشر غير متاح");
      if (a.managedUntil && Date.parse(a.managedUntil) > Date.now())
        fail("الفترة الحالية لم تنته بعد");
      const period = now().slice(0, 7);
      await post(
        u.id,
        -a.price.monthlyFee,
        0,
        "تجديد متابعة التطبيق لشهر",
        key,
        `renew-debit:${key}:${period}`,
      );
      await post(
        a.publisherId,
        a.price.monthlyShare,
        0,
        "أرباح متابعة شهرية",
        key,
        `renew-credit:${key}:${period}`,
      );
      await platform(
        a.price.monthlyFee - a.price.monthlyShare,
        "عمولة متابعة",
        key,
        `renew-platform:${key}:${period}`,
      );
      a.managedUntil = new Date(Date.now() + 30 * 86400000).toISOString();
      return await save("app", a);
    });
  });
}
export async function createUpdate(u, key, b) {
  return await atomic(async () => {
    role(u, "client");
    return await atomic(async () => {
      const a = await owned(key, u, "app");
      if (a.status !== "completed") fail("التطبيق لم ينشر بعد");
      if (!(await activeUser(a.publisherId))) fail("حساب الناشر غير متاح");
      const f = await fileOwned(b.fileId, u, "app");
      const update = await save("update", {
        owner: u.id,
        publisherId: a.publisherId,
        appId: key,
        title: a.title,
        version: text(b.version, 1, 30),
        note: text(b.note, 10, 2000),
        fileId: f.id,
        status: "pending",
        fee: a.price.updateFee,
        share: a.price.updateShare,
      });
      await post(
        u.id,
        -update.fee,
        update.fee,
        "حجز رسوم تحديث",
        update.id,
        `update-hold:${update.id}`,
      );
      await notify(a.publisherId, "طلب تحديث جديد", a.title, `/apps/${key}`);
      return update;
    });
  });
}
export async function updateAction(u, key, b) {
  return await atomic(async () => {
    return await atomic(async () => {
      const r = await owned(key, u, "update");
      if (b.action === "submit") {
        if (r.publisherId !== u.id || r.status !== "pending")
          fail("الإجراء غير متاح");
        r.status = "submitted";
        r.proof = text(b.proof, 10, 2000);
      } else if (b.action === "approve") {
        if (r.owner !== u.id && u.role !== "admin") fail("غير مسموح", 403);
        if (r.status !== "submitted") fail("التحديث لم يسلم بعد");
        await post(
          r.owner,
          0,
          -r.fee,
          "إتمام تحديث التطبيق",
          key,
          `update-debit:${key}`,
        );
        await post(
          r.publisherId,
          r.share,
          0,
          "أرباح تحديث تطبيق",
          key,
          `update-credit:${key}`,
        );
        await platform(
          r.fee - r.share,
          "عمولة تحديث",
          key,
          `update-platform:${key}`,
        );
        r.status = "completed";
      } else if (b.action === "refund") {
        role(u, "admin");
        if (!["pending", "submitted"].includes(r.status)) fail("طلب منتهٍ");
        await post(
          r.owner,
          r.fee,
          -r.fee,
          "إرجاع رسوم تحديث",
          key,
          `update-refund:${key}`,
        );
        r.status = "refunded";
      } else fail("إجراء غير صالح");
      await audit(u.id, `update.${b.action}`, key);
      return await save("update", r);
    });
  });
}
export async function payment(u, b) {
  return await atomic(async () => {
    if (!(await settings()).depositsEnabled) fail("الشحن غير متاح حاليًا");
    const f = await fileOwned(b.fileId, u, "receipt");
    return await save("payment", {
      owner: u.id,
      name: u.name,
      amount: amount(b.amount),
      reference: text(b.reference, 3, 200),
      fileId: f.id,
      status: "pending",
    });
  });
}
export async function withdraw(u, b) {
  return await atomic(async () => {
    role(u, "publisher");
    const s = await settings();
    if (amount(b.amount) < s.minWithdrawal)
      fail("المبلغ أقل من الحد الأدنى للسحب");
    if (!enabledMethods(s).some(m => m.id === b.network))
      fail("شبكة غير مدعومة");
    const address = text(b.address, 20, 100);
    if (!validAddress(b.network, address))
      fail("عنوان المحفظة لا يطابق الشبكة");
    if (b.confirmed !== true) fail("أكد العنوان والشبكة");
    const fee = s.withdrawFee + Math.ceil((b.amount * s.withdrawBps) / 10000);
    if (fee >= b.amount) fail("المبلغ لا يغطي الرسوم");
    return await atomic(async () => {
      const r = await save("withdrawal", {
        owner: u.id,
        name: u.name,
        amount: b.amount,
        fee,
        net: b.amount - fee,
        network: b.network,
        address,
        destination: `${b.network}: ${address}`,
        status: "pending",
      });
      await post(
        u.id,
        -r.amount,
        r.amount,
        "حجز طلب سحب عملات رقمية",
        r.id,
        `withdraw-hold:${r.id}`,
      );
      return r;
    });
  });
}
export async function ticket(u, b) {
  return await atomic(async () => {
    return await save("ticket", {
      owner: u.id,
      name: u.name,
      subject: text(b.subject, 3, 150),
      body: text(b.body, 10, 4000),
      status: "open",
      reply: "",
    });
  });
}
export async function adminAction(u, kind, key, b) {
  return await atomic(async () => {
    role(u, "admin");
    return await atomic(async () => {
      if (kind === "users") {
        if (key === u.id) fail("لا يمكن تعليق حسابك الحالي");
        const target = await db
          .prepare("SELECT * FROM users WHERE id=?")
          .get(key);
        if (!target || target.role === "admin") fail("المستخدم غير متاح");
        if (!["active", "suspended"].includes(b.status)) fail("حالة غير صالحة");
        await db
          .prepare("UPDATE users SET status=? WHERE id=?")
          .run(b.status, key);
        if (b.status === "suspended")
          await db.prepare("DELETE FROM sessions WHERE user_id=?").run(key);
        await audit(u.id, "user.status", key, b.status);
        return {};
      }
      if (kind === "settings") {
        const s = await settings();
        for (const k of [
          "reviewFee",
          "minPublishBudget",
          "minTopup",
          "withdrawFee",
          "minWithdrawal",
          "publishFee",
          "publisherShare",
          "monthlyFee",
          "monthlyShare",
          "updateFee",
          "updateShare",
        ])
          if (b[k] !== undefined) {
            if (!Number.isSafeInteger(b[k]) || b[k] < 0 || b[k] > 1000000)
              fail("سعر غير صالح");
            s[k] = b[k];
          }
        for (const k of ["commissionBps", "withdrawBps"])
          if (b[k] !== undefined) {
            if (!Number.isInteger(b[k]) || b[k] < 0 || b[k] > 5000)
              fail("النسبة يجب أن تكون بين 0 و50 بالمئة");
            s[k] = b[k];
          }
        if (
          s.publisherShare > s.publishFee ||
          s.monthlyShare > s.monthlyFee ||
          s.updateShare > s.updateFee
        )
          fail("حصة الناشر تتجاوز الرسوم");
        if (b.holdHours !== undefined) {
          if (
            !Number.isInteger(b.holdHours) ||
            b.holdHours < 24 ||
            b.holdHours > 336
          )
            fail("مهلة الاعتراض بين 24 و336 ساعة");
          s.holdHours = b.holdHours;
        }
        if (b.withdrawalNetworks !== undefined) {
          if (!Array.isArray(b.withdrawalNetworks) || b.withdrawalNetworks.some(id => !cryptoMethods.some(m => m.id === id))) fail("شبكات السحب غير صالحة");
          s.withdrawalNetworks = [...new Set(b.withdrawalNetworks)];
        }
        for (const k of ["depositInstructions", "supportEmail"])
          if (b[k] !== undefined) s[k] = text(b[k], 0, 3000);
        for (const k of ["depositsEnabled", "maintenance"])
          if (typeof b[k] === "boolean") s[k] = b[k];
        await save("settings", {
          ...s,
          id: "settings",
        });
        await audit(u.id, "settings.update", "settings");
        return s;
      }
      const map = {
        publishers: "publisher",
        apps: "app",
        payments: "payment",
        withdrawals: "withdrawal",
        tickets: "ticket",
      };
      const r = await owned(key, u, map[kind]);
      if (kind === "publishers") {
        if (!["approve", "reject"].includes(b.action)) fail("إجراء غير صالح");
        if (b.action === "approve" && r.verification?.status !== "verified")
          fail("يلزم نجاح تحدي التحقق أولًا");
        r.status = b.action === "approve" ? "approved" : "rejected";
        r.adminNote = text(b.note || "", 0, 2000);
        await notify(
          r.owner,
          "تمت مراجعة حساب الناشر",
          r.status === "approved"
            ? "حسابك معتمد؛ يمكنك تقديم العروض."
            : r.adminNote,
          "/publisher",
        );
      } else if (kind === "apps") {
        if (b.action === "review") {
          if (r.status !== "reviewing") fail("التطبيق تمت مراجعته");
          r.report = text(b.report, 20, 5000);
          if (!["approve", "reject"].includes(b.decision))
            fail("قرار غير صالح");
          await post(
            r.owner,
            0,
            -r.price.reviewFee,
            "اكتمال فحص التطبيق",
            key,
            `review-debit:${key}`,
          );
          await platform(
            r.price.reviewFee,
            "رسوم فحص",
            key,
            `review-platform:${key}`,
          );
          r.status = b.decision === "approve" ? "open" : "rejected";
          timeline(
            r,
            r.status === "open"
              ? "اجتاز التطبيق المراجعة وأصبح متاحًا للناشرين"
              : "انتهى الفحص برفض التطبيق",
          );
        } else if (b.action === "cancel") {
          if (r.status === "reviewing")
            await post(
              r.owner,
              r.price.reviewFee,
              -r.price.reviewFee,
              "إلغاء الفحص ورد الرسوم",
              key,
              `review-refund:${key}`,
            );
          else if (
            ["assigned", "submitted", "verified", "disputed"].includes(r.status)
          )
            await post(
              r.owner,
              r.price.publishFee,
              -r.price.publishFee,
              "رد رسوم النشر",
              key,
              `publish-refund:${key}`,
            );
          else if (r.status !== "open") fail("لا يمكن رد هذه الصفقة");
          r.status = "cancelled";
          r.resolution = text(b.note, 10, 2000);
          timeline(r, "ألغت الإدارة الطلب وأعادت المبلغ المحجوز");
        } else if (b.action === "resolve") {
          if (r.status !== "disputed") fail("لا يوجد نزاع مفتوح");
          r.resolution = text(b.note, 10, 2000);
          if (r.verification?.status !== "verified")
            fail("يجب إثبات النشر قبل التسوية لصالح الناشر");
          r.status = "verified";
          r.releaseAt = new Date(
            Date.now() + r.price.holdHours * 3600000,
          ).toISOString();
          timeline(r, "حُسم النزاع لصالح الناشر؛ مهلة اعتراض جديدة");
        } else fail("إجراء غير صالح");
        await notify(r.owner, "تحديث على طلبك", r.title, `/apps/${key}`);
      } else if (kind === "payments") {
        if (r.provider === "whop")
          fail("مدفوعات Whop تعتمد عبر الإشعار الموقع فقط", 403);
        if (r.status !== "pending") fail("عولج هذا الطلب بالفعل", 409);
        r.adminReference = text(b.reference, 3, 200);
        if (b.action === "approve") {
          if (
            (await records("payment")).some(
              (p) =>
                p.status === "approved" &&
                p.adminReference === r.adminReference,
            )
          )
            fail("مرجع التحويل استُخدم سابقًا", 409);
          await post(
            r.owner,
            r.amount,
            0,
            "شحن مؤكد بواسطة الإدارة",
            key,
            `deposit:${key}`,
          );
          r.status = "approved";
        } else if (b.action === "reject") r.status = "rejected";
        else fail("إجراء غير صالح");
        await notify(
          r.owner,
          "تحديث طلب الشحن",
          r.status === "approved"
            ? "تمت إضافة المبلغ إلى المحفظة."
            : r.adminReference,
          "/wallet",
        );
      } else if (kind === "withdrawals") {
        if (r.status !== "pending") fail("عولج طلب السحب بالفعل", 409);
        r.adminReference = text(b.reference, 3, 200);
        if (b.action === "approve") {
          const quantity = Number(b.cryptoAmount);
          if (!Number.isFinite(quantity) || quantity <= 0)
            fail("أدخل كمية العملة التي تم تحويلها");
          r.cryptoAmount = quantity;
          if (!(await activeUser(r.owner)))
            fail("الحساب معلق ولا يمكن تنفيذ السحب");
          if (!validTransaction(r.network, r.adminReference))
            fail("أدخل معرّف معاملة blockchain صالحًا");
          if (
            (await records("withdrawal")).some(
              (w) =>
                w.status === "paid" && methodById(w.network)?.chain === methodById(r.network)?.chain && w.adminReference?.toLowerCase() === r.adminReference.toLowerCase(),
            )
          )
            fail("مرجع التحويل مستخدم");
          await platform(r.fee || 0, "رسوم سحب", key, `withdraw-fee:${key}`);
          await post(
            r.owner,
            0,
            -r.amount,
            "سحب منفذ بمرجع تحويل",
            key,
            `withdraw-paid:${key}`,
          );
          r.status = "paid";
        } else if (b.action === "reject") {
          await post(
            r.owner,
            r.amount,
            -r.amount,
            "رد طلب سحب مرفوض",
            key,
            `withdraw-refund:${key}`,
          );
          r.status = "rejected";
        } else fail("إجراء غير صالح");
        await notify(r.owner, "تحديث طلب السحب", r.adminReference, "/wallet");
      } else if (kind === "tickets") {
        r.reply = text(b.reply, 3, 4000);
        r.status = b.close ? "closed" : "open";
        await notify(r.owner, "رد على طلب الدعم", r.subject, "/support");
      } else fail("قسم غير صالح");
      await audit(
        u.id,
        `${kind}.${b.action || "reply"}`,
        key,
        b.note || b.reference || b.decision || "",
      );
      return await save(map[kind], r);
    });
  });
}
