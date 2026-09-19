import { handler } from "../server/index.mjs";
import { bootstrapAdmin } from "../server/bootstrap.mjs";
export const config = { api: { bodyParser: false } };
let boot;
export default async function vercelHandler(req, res) {
  try {
    boot ||= bootstrapAdmin().catch((error) => {
      boot = null;
      throw error;
    });
    await boot;
    return await handler(req, res);
  } catch (error) {
    console.error("API initialization failed:", error.code || error.name);
    if (!res.headersSent)
      res.writeHead(503, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
    res.end(
      JSON.stringify({
        error: "تعذر الاتصال بقاعدة البيانات. تحقق من إعدادات الخادم.",
      }),
    );
  }
}
