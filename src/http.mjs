export async function requestJson(url, options = {}) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error(
      "تعذر الوصول إلى الخادم. تحقق من اتصال الإنترنت ثم أعد المحاولة.",
    );
  }
  const contentType = response.headers.get("content-type") || "";
  const invalidResponse = () =>
    new Error(
      `الخادم أعاد استجابة غير صالحة (HTTP ${response.status}). قد تكون خدمة الموقع متوقفة أو إعدادات الاستضافة غير مكتملة. أعد المحاولة لاحقًا أو تواصل مع الدعم.`,
    );
  if (!/^application\/(?:json|[\w.-]+\+json)(?:\s*;|$)/i.test(contentType)) {
    throw invalidResponse();
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw invalidResponse();
  }
  if (!response.ok) {
    throw new Error(
      typeof data?.error === "string"
        ? data.error
        : `تعذر إكمال الطلب (HTTP ${response.status})`,
    );
  }
  return data;
}
