import { randomBytes } from 'node:crypto';
import { db, record, records, save, settings, atomic, balance, post, audit } from './db.mjs';

export const affiliateAccount = (id) => `affiliate-wallet:${id}`;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

export async function enrollAffiliate(u) {
  return atomic(async () => {
    if (!['client', 'publisher'].includes(u.role)) fail('حساب غير مؤهل', 403);
    const existing = await record(`affiliate:${u.id}`);
    if (existing) return existing;
    if (!(await settings()).affiliateEnabled) fail('برنامج الأفلييت متوقف حاليًا');
    const code = randomBytes(16).toString('hex');
    await save('affiliate-code', { id: `affiliate-code:${code}`, owner: u.id });
    await audit(u.id, 'affiliate.enroll', u.id);
    return save('affiliate', { id: `affiliate:${u.id}`, owner: u.id, code });
  });
}

// Called only inside the transaction creating a NEW user; attribution is immutable.
export async function attachReferral(u, code) {
  if (u.role !== 'client' || typeof code !== 'string' || !/^[a-f0-9]{32}$/.test(code)) return;
  if (!(await settings()).affiliateEnabled) return;
  const partner = await record(`affiliate-code:${code}`);
  if (!partner || partner.owner === u.id) return;
  const active = await db.prepare("SELECT id FROM users WHERE id=? AND status='active'").get(partner.owner);
  if (!active || await record(`referral:${u.id}`)) return;
  await save('referral', { id: `referral:${u.id}`, owner: partner.owner, customerId: u.id });
}

export async function creditAffiliate(app) {
  return atomic(async () => {
    const referral = await record(`referral:${app.owner}`);
    const key = `affiliate-commission:${app.id}`;
    if (!referral || referral.owner === app.owner || referral.owner === app.publisherId || await record(key)) return;
    const active = await db.prepare("SELECT id FROM users WHERE id=? AND status='active'").get(referral.owner);
    if (!active) return;
    const margin = app.price.publishFee - app.price.publisherShare;
    const bps = app.price.affiliateBps || 0;
    if (!Number.isSafeInteger(bps) || bps < 0 || bps > 5000) throw new Error('Invalid affiliate rate');
    const cents = Math.floor(margin * bps / 10000);
    if (cents <= 0) return;
    await post('platform', -cents, 0, 'عمولة أفلييت', app.id, `${key}:debit`);
    await post(affiliateAccount(referral.owner), cents, 0, 'أرباح إحالة طلب مكتمل', app.id, `${key}:credit`);
    await save('affiliate-commission', { id: key, owner: referral.owner, customerId: app.owner, appId: app.id, amount: cents, bps });
    await audit('system', 'affiliate.commission', app.id, String(cents));
  });
}

export async function assertAffiliatePayout(owner) {
  for (const earning of (await records('affiliate-commission')).filter(r => r.owner === owner)) {
    const customer = await db.prepare('SELECT status FROM users WHERE id=?').get(earning.customerId);
    if (customer?.status !== 'active') fail('أرباح الإحالات تحتاج مراجعة الإدارة بسبب تعليق حساب عميل مُحال', 409);
  }
}

export async function affiliateState(u) {
  const admin = u.role === 'admin';
  const commissions = (await records('affiliate-commission')).filter(r => admin || r.owner === u.id);
  return {
    profile: await record(`affiliate:${u.id}`),
    balance: await balance(affiliateAccount(u.id)),
    referrals: (await records('referral')).filter(r => admin || r.owner === u.id).length,
    totalEarned: commissions.reduce((sum, r) => sum + r.amount, 0),
    commissions: commissions.map(({id, amount, createdAt, owner, bps}) => ({id, amount, createdAt, bps, ...(admin ? {owner} : {})})),
    partners: admin ? await records('affiliate') : [],
    withdrawals: (await records('withdrawal')).filter(r => r.source === 'affiliate' && (admin || r.owner === u.id)),
  };
}
