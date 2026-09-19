const packagePattern = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
export function packageName(value) {
  if (
    typeof value !== "string" ||
    value.length > 180 ||
    !packagePattern.test(value)
  )
    throw new Error("معرّف التطبيق غير صالح");
  return value;
}
export function playUrl(value) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.hostname !== "play.google.com" ||
    u.port ||
    u.username ||
    u.password ||
    u.pathname !== "/store/apps/details"
  )
    throw new Error("أدخل رابط تطبيق من Google Play");
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageName(u.searchParams.get("id")))}&hl=en&gl=US`;
}
export function publisherIdentity(value) {
  const u = new URL(value);
  if (
    u.protocol !== "https:" ||
    u.hostname !== "play.google.com" ||
    u.port ||
    u.username ||
    u.password ||
    !["/store/apps/developer", "/store/apps/dev"].includes(u.pathname) ||
    !u.searchParams.get("id")
  )
    throw new Error("رابط صفحة الناشر غير صالح");
  return `${u.pathname}?id=${u.searchParams.get("id")}`;
}
export function parseListing(
  html,
  expectedPackage,
  expectedDeveloper,
  challenge = "",
) {
  if (
    /unusual traffic|captcha|consent\.google/i.test(html) ||
    html.length < 1000
  )
    return {
      status: "unknown",
      reason: "لم نستطع قراءة صفحة المتجر بوضوح. أعد المحاولة لاحقًا.",
    };
  const decode = (s) =>
    s
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');
  let app;
  const locate = (value) => {
    if (!value || typeof value !== "object") return;
    if (["SoftwareApplication", "MobileApplication"].includes(value["@type"]))
      app = value;
    else if (Array.isArray(value)) value.forEach(locate);
    else if (value["@graph"]) locate(value["@graph"]);
  };
  for (const match of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      locate(JSON.parse(match[1]));
    } catch {}
  }
  if (!app)
    return {
      status: "unknown",
      reason: "تعذر قراءة بيانات التطبيق المنظمة من صفحة المتجر.",
    };
  let canonical;
  for (const link of html.matchAll(/<link\b[^>]*>/gi)) {
    if (/rel=["']canonical["']/i.test(link[0])) {
      const href = link[0].match(/href=["']([^"']+)["']/i);
      try {
        canonical = new URL(decode(href[1]));
      } catch {}
    }
  }
  if (
    !canonical ||
    canonical.hostname !== "play.google.com" ||
    canonical.pathname !== "/store/apps/details" ||
    canonical.searchParams.get("id") !== expectedPackage
  )
    return {
      status: "unknown",
      reason: "الرابط الأساسي للصفحة لا يطابق معرّف التطبيق.",
    };
  let identity;
  try {
    identity = publisherIdentity(app.author?.url || app.publisher?.url);
  } catch {}
  if (!identity)
    return {
      status: "unknown",
      reason: "تعذر استخراج هوية الناشر من بيانات التطبيق المنظمة.",
    };
  if (identity !== expectedDeveloper)
    return {
      status: "mismatch",
      reason: "هوية الناشر على المتجر لا تطابق الحساب المعتمد.",
    };
  // Only the authoritative application description is a control challenge.
  // Reviews, names, unrelated scripts and recommendations are not proof of control.
  if (
    challenge &&
    (typeof app.description !== "string" ||
      !decode(app.description).includes(challenge))
  )
    return {
      status: "unknown",
      reason: "رمز التحقق لم يظهر في وصف التطبيق بعد.",
    };
  return {
    status: "verified",
    reason: "ظهر التطبيق بهوية الناشر المتوقعة على صفحة المتجر العامة.",
    developer: identity,
  };
}
export async function inspectPlay(url, developer, challenge = "") {
  const canonical = playUrl(url),
    pkg = new URL(canonical).searchParams.get("id");
  try {
    const response = await fetch(canonical, {
      redirect: "error",
      signal: AbortSignal.timeout(12000),
      headers: {
        "User-Agent": "EldevoPublicationVerifier/1.0",
        "Accept-Language": "en-US",
      },
    });
    if (!response.ok)
      return {
        status: "unknown",
        reason: `المتجر لم يسمح بالتحقق الآن (${response.status}).`,
        checkedAt: new Date().toISOString(),
      };
    const reader = response.body.getReader();
    let size = 0;
    const chunks = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("large");
      }
      chunks.push(value);
    }
    return {
      ...parseListing(
        Buffer.concat(chunks).toString("utf8"),
        pkg,
        developer,
        challenge,
      ),
      checkedAt: new Date().toISOString(),
      url: canonical,
    };
  } catch {
    return {
      status: "unknown",
      reason:
        "تعذر الاتصال بصفحة Google Play. لم يتم اعتماد النشر أو صرف أي مبلغ.",
      checkedAt: new Date().toISOString(),
    };
  }
}
