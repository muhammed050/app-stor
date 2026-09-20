import {test, after} from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_DRIVER = 'pglite';
const {db, record, save, balance, post, settings} = await import('../server/db.mjs');
const {createUser} = await import('../server/auth.mjs');
const {enrollAffiliate, affiliateAccount, affiliateState, attachReferral} = await import('../server/affiliate.mjs');
const {settle, withdraw, adminAction} = await import('../server/domain.mjs');
const user = (name, role = 'client', referralCode) => createUser({name, role, referralCode, email:`${name}@example.test`, password:'test-password-only'});
const partner = await user('partner');
const publisher = await user('publisher', 'publisher');
const admin = await user('admin', 'admin');
let profile, client;
after(() => db.close());

test('enrollment is idempotent; referral is attached only to eligible new clients', async () => {
  const profiles = await Promise.all([enrollAffiliate(partner), enrollAffiliate(partner)]);
  profile = profiles[0];
  assert.equal(profiles[1].code, profile.code);
  client = await user('customer', 'client', profile.code);
  assert.equal((await record(`referral:${client.id}`)).owner, partner.id);
  const other = await user('other');
  const otherProfile = await enrollAffiliate(other);
  await attachReferral(client, otherProfile.code);
  assert.equal((await record(`referral:${client.id}`)).owner, partner.id);
  await attachReferral(partner, profile.code);
  assert.equal(await record(`referral:${partner.id}`), null);
  const invalid = await user('invalid', 'client', 'not-a-code');
  assert.equal(await record(`referral:${invalid.id}`), null);
  const pub = await user('referred-pub', 'publisher', profile.code);
  assert.equal(await record(`referral:${pub.id}`), null);
});

async function readyApp(id, publisherId = publisher.id, affiliateBps = 1000) {
  await save('publisher', {id:`publisher:${publisherId}`, owner:publisherId, status:'approved'});
  await post(client.id, 0, 5000, 'fixture', id, `fixture:${id}`);
  return save('app', {id, owner:client.id, publisherId, title:'App', status:'verified',
    price:{publishFee:5000, publisherShare:4000, affiliateBps}, releaseAt:new Date(0).toISOString(),
    verification:{status:'verified', checkedAt:new Date().toISOString()}});
}

test('commission is paid only on final settlement, from platform margin exactly once', async () => {
  await readyApp('settlement');
  assert.equal((await balance(affiliateAccount(partner.id))).available, 0);
  const results = await Promise.allSettled([settle('settlement'), settle('settlement')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await balance(affiliateAccount(partner.id))).available, 100);
  assert.equal((await balance(partner.id)).available, 0);
  assert.equal((await balance('platform')).available, 900);
  assert.equal((await balance(publisher.id)).available, 4000);
  const view = await affiliateState(partner);
  assert.equal(view.totalEarned, 100);
  assert.equal(view.referrals, 1);
  assert.equal('customerId' in view.commissions[0], false);
  assert.equal((await affiliateState(publisher)).commissions.length, 0);
});

test('own publisher, disputed and old unsnapshotted orders earn no commission', async () => {
  await readyApp('self-publisher', partner.id);
  await settle('self-publisher');
  await readyApp('old-order', publisher.id, 0);
  await settle('old-order');
  const disputed = await readyApp('disputed');
  await save('app', {...disputed, status:'disputed'});
  await assert.rejects(settle('disputed'));
  assert.equal((await balance(affiliateAccount(partner.id))).available, 100);
});

const request = {amount:100, network:'USDT-BEP20', address:`0x${'1'.repeat(40)}`, confirmed:true};
test('withdrawals use separate earnings ledger and cannot spend deposits; rejection restores funds', async () => {
  await save('settings', {...await settings(), id:'settings', minWithdrawal:100, withdrawFee:0});
  await post(partner.id, 10000, 0, 'deposit fixture', 'deposit', 'deposit');
  await assert.rejects(withdraw(partner, {...request, amount:200}, 'affiliate'));
  await assert.rejects(withdraw(partner, {...request, source:'affiliate'}), e => e.status === 403);
  const pending = await withdraw(partner, request, 'affiliate');
  assert.deepEqual(await balance(affiliateAccount(partner.id)), {available:0, held:100});
  await adminAction(admin, 'withdrawals', pending.id, {action:'reject', reference:'Rejected for test'});
  assert.deepEqual(await balance(affiliateAccount(partner.id)), {available:100, held:0});
  assert.equal((await balance(partner.id)).available, 14000);
});

test('payment risk suspension blocks pending affiliate payout; approval is idempotent', async () => {
  const pending = await withdraw(partner, request, 'affiliate');
  await db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(client.id);
  const body = {action:'approve', cryptoAmount:1, reference:`0x${'a'.repeat(64)}`};
  await assert.rejects(adminAction(admin, 'withdrawals', pending.id, body), e => e.status === 409);
  await db.prepare("UPDATE users SET status='active' WHERE id=?").run(client.id);
  await adminAction(admin, 'withdrawals', pending.id, body);
  await assert.rejects(adminAction(admin, 'withdrawals', pending.id, body), e => e.status === 409);
  assert.deepEqual(await balance(affiliateAccount(partner.id)), {available:0, held:0});
});

test('admin-only rate validation and program pause', async () => {
  await assert.rejects(adminAction(partner, 'settings', 'settings', {affiliateBps:2000}), e => e.status === 403);
  await assert.rejects(adminAction(admin, 'settings', 'settings', {affiliateBps:10001}));
  await adminAction(admin, 'settings', 'settings', {affiliateEnabled:false, affiliateBps:2000});
  const noReferral = await user('paused-customer', 'client', profile.code);
  assert.equal(await record(`referral:${noReferral.id}`), null);
  await assert.rejects(enrollAffiliate(noReferral));
});
