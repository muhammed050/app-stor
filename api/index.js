import { handler } from "../server/index.mjs";
import { bootstrapAdmin } from "../server/bootstrap.mjs";
export const config = { api: { bodyParser: false } };
let boot;
let retryAfter = 0;
export default async function vercelHandler(req, res) {
  // Administrator provisioning must never take the public API offline.
  if (!boot && Date.now() >= retryAfter) {
    boot = bootstrapAdmin().catch((error) => {
      retryAfter = Date.now() + 60000;
      boot = null;
      const allowed = ["ADMIN_PASSWORD_TOO_SHORT", "ADMIN_EMAIL_INVALID", "ADMIN_EMAIL_ALREADY_REGISTERED"];
      console.error("Administrator setup:", allowed.includes(error.code) ? error.code : "DATABASE_SETUP_FAILED");
    });
  }
  if (boot) await boot;
  return handler(req, res);
}
