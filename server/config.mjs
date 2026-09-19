try { process.loadEnvFile(); } catch {}
const configuredOrigin = (process.env.APP_ORIGIN || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'http://localhost:3000').trim().replace(/^['"]|['"]$/g, '');
export const appOrigin = new URL(configuredOrigin.includes('://') ? configuredOrigin : `https://${configuredOrigin}`).origin;
