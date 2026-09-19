import { appOrigin } from "./config.mjs";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  record,
  records,
  save,
  atomic,
  post,
  audit,
  notify,
  settings,
  db,
  balance,
} from "./db.mjs";
import { amount, fail, owned, role } from "./domain.mjs";
export function safeProviderDiagnostic(body) {
  const err = body?.error;
  let message = typeof err === "string" ? err : typeof err?.message === "string" ? err.message : "";
  for (const key of ["WHOP_API_KEY", "WHOP_WEBHOOK_SECRET", "WHOP_COMPANY_ID", "WHOP_PRODUCT_ID"])
    if (process.env[key]?.trim()) message = message.split(process.env[key].trim()).join("[redacted]");
  return message
    .replace(/(?:https?:\/\/)[^\s]+/gi, "[url]")
    .replace(/\b(?:apik|ws|biz|prod|plan|user|ch)_[a-zA-Z0-9_-]+/g, "[id]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/[\r\n\t]/g, " ")
    .slice(0, 400);
}
export function configured() {
  return Boolean(
    process.env.WHOP_API_KEY &&
    process.env.WHOP_COMPANY_ID &&
    process.env.WHOP_PRODUCT_ID &&
    process.env.WHOP_WEBHOOK_SECRET,
  );
}
export async function createCheckout(u, b) {
  role(u, "client");
  if (!configured()) fail("الدفع لم يُفعّل بعد. يرجى التواصل مع الإدارة.", 503);
  const cents = amount(b.amount);
  if (cents < (await settings()).minTopup)
    fail("المبلغ أقل من الحد الأدنى للدفع");
  const previous = (await records("payment")).find(
    (p) =>
      p.owner === u.id &&
      p.provider === "whop" &&
      p.status === "pending" &&
      p.amount === cents &&
      p.sessionId &&
      Date.now() - Date.parse(p.createdAt) < 1800000,
  );
  if (previous) return previous;
  const p = await save("payment", {
    owner: u.id,
    name: u.name,
    provider: "whop",
    amount: cents,
    status: "creating",
  });
  try {
    const r = await fetch(
      "https://api.whop.com/api/v1/checkout_configurations",
      {
        method: "POST",
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${process.env.WHOP_API_KEY.trim()}`,
          "Content-Type": "application/json",
          "Idempotency-Key": p.id,
        },
        body: JSON.stringify({
          mode: "payment",
          plan: {
            company_id: process.env.WHOP_COMPANY_ID.trim(),
            product_id: process.env.WHOP_PRODUCT_ID.trim(),
            initial_price: cents / 100,
            currency: "usd",
            plan_type: "one_time",
            force_create_new_plan: true,
            adaptive_pricing_enabled: false,
            title: `Dorucenie services ${p.id.slice(0, 8)}`,
          },
          metadata: {
            eldevo_payment_id: p.id,
            eldevo_user_id: u.id,
          },
          redirect_url: `${appOrigin}/checkout/complete`,
          checkout_styling: {
            background_color: "#ffffff",
            button_color: "#0e8d75",
          },
        }),
      },
    );
    if (!r.ok) {
      // Retain only a redacted provider explanation, never headers or the raw body.
      const error = new Error("Whop rejected checkout");
      error.providerStatus = r.status;
      error.providerDiagnostic = safeProviderDiagnostic(await r.json().catch(() => null));
      throw error;
    }
    const body = await r.json();
    if (!body?.id || !body.plan?.id) {
      const error = new Error("Invalid Whop checkout response");
      error.providerCode = "INVALID_RESPONSE";
      throw error;
    }
    p.sessionId = body.id;
    p.planId = body.plan.id;
    p.status = "pending";
    await save("payment", p);
    return p;
  } catch (error) {
    const status = error.providerStatus;
    const code = status === 401 ? "AUTHENTICATION"
      : status === 403 ? "PERMISSIONS"
      : status === 404 ? "NOT_FOUND"
      : [400, 422].includes(status) ? "CONFIGURATION"
      : status === 429 ? "RATE_LIMIT"
      : error.name === "TimeoutError" ? "TIMEOUT"
      : error.providerCode === "INVALID_RESPONSE" || error instanceof SyntaxError ? "INVALID_RESPONSE"
      : status >= 500 ? "PROVIDER_UNAVAILABLE" : "CONNECTION";
    p.status = "failed";
    p.failureCode = code;
    if (Number.isInteger(status)) p.providerStatus = status;
    await save("payment", p);
    console.error("Whop checkout failed", { paymentId: p.id, code, status: status || null, diagnostic: error.providerDiagnostic || null });
    const messages = {
      AUTHENTICATION: "رفض Whop مفتاح الدفع. يجب على الإدارة مراجعة WHOP_API_KEY.",
      PERMISSIONS: "رفض Whop صلاحيات مفتاح الدفع. يجب على الإدارة تفعيل صلاحيات إنشاء جلسات الدفع والخطط للمتجر.",
      NOT_FOUND: "لم يعثر Whop على مورد الدفع. يجب على الإدارة مراجعة معرّف الشركة والمنتج.",
      CONFIGURATION: "رفض Whop إعدادات جلسة الدفع. يجب على الإدارة مراجعة إعدادات الشركة والمنتج.",
      RATE_LIMIT: "طلبات الدفع كثيرة حالياً. حاول مجدداً بعد قليل.",
      TIMEOUT: "انتهت مهلة الاتصال بـ Whop. حاول مجدداً بعد قليل.",
    };
    fail((messages[code] || "تعذر إنشاء جلسة الدفع لدى Whop.") + " لم يتم خصم أي مبلغ هنا. رمز التشخيص: " + code, 502);
  }
}
export function verifySignature(
  raw,
  headers,
  secret = process.env.WHOP_WEBHOOK_SECRET,
) {
  if (!secret) fail("Webhook not configured", 503);
  const timestamp = headers["webhook-timestamp"],
    eventId = headers["webhook-id"];
  if (
    !timestamp ||
    !eventId ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    fail("Invalid webhook timestamp", 401);
  const expected = createHmac("sha256", secret)
    .update(`${eventId}.${timestamp}.${raw}`)
    .digest();
  const valid = (headers["webhook-signature"] || "").split(" ").some((s) => {
    const [version, encoded] = s.split(",");
    try {
      const got = Buffer.from(encoded || "", "base64");
      return (
        version === "v1" &&
        got.length === expected.length &&
        timingSafeEqual(expected, got)
      );
    } catch {
      return false;
    }
  });
  if (!valid) fail("Invalid webhook signature", 401);
  return JSON.parse(raw);
}
export async function applyEvent(event) {
  const payment = event.data;
  if (!payment?.id)
    return {
      ignored: true,
    };
  if (event.type === "payment.succeeded")
    return await atomic(async () => {
      const p = await record(payment.metadata?.eldevo_payment_id);
      if (!p || p.provider !== "whop")
        return {
          ignored: true,
        };
      if (p.status === "approved")
        return {
          duplicate: true,
        };
      const paidCents = Math.round(Number(payment.subtotal) * 100);
      if (
        payment.company?.id !== process.env.WHOP_COMPANY_ID ||
        payment.currency !== "usd" ||
        payment.status !== "paid" ||
        !Number.isFinite(paidCents) ||
        paidCents !== p.amount ||
        payment.plan?.id !== p.planId ||
        payment.metadata?.eldevo_user_id !== p.owner
      )
        fail("Payment data mismatch", 400);
      if (
        await db
          .prepare("SELECT 1 FROM ledger WHERE unique_key=?")
          .get(`whop:${payment.id}`)
      )
        return {
          duplicate: true,
        };
      await post(
        p.owner,
        p.amount,
        0,
        "دفع مؤكد عبر Whop",
        p.id,
        `whop:${payment.id}`,
      );
      p.status = "approved";
      p.providerPaymentId = payment.id;
      await save("payment", p);
      await audit("whop", "payment.succeeded", p.id, payment.id);
      await notify(
        p.owner,
        "تم تأكيد الدفع",
        "أضيف رصيد الخدمات إلى محفظتك.",
        "/wallet",
      );
      return {
        credited: true,
      };
    });
  // Refunds/chargebacks must never leave the account free to spend or withdraw.
  if (/refund|dispute|chargeback/.test(event.type)) {
    const paymentId = payment.payment?.id || payment.id;
    const p = (await records("payment")).find(
      (p) => p.providerPaymentId === paymentId,
    );
    if (p)
      await atomic(async () => {
        await db
          .prepare("UPDATE users SET status='suspended' WHERE id=?")
          .run(p.owner);
        await db.prepare("DELETE FROM sessions WHERE user_id=?").run(p.owner);
        for (const app of (await records("app")).filter(
          (a) =>
            a.owner === p.owner &&
            ["assigned", "submitted", "verified"].includes(a.status),
        )) {
          app.status = "disputed";
          app.disputeReason = "تنبيه دفع من Whop؛ يلزم تدقيق الإدارة";
          await save("app", app);
        }
        p.riskEvent = event.type;
        await save("payment", p);
        await audit("whop", "payment.risk", p.id, event.type);
      });
    return {
      reviewRequired: true,
    };
  }
  return {
    ignored: true,
  };
}
