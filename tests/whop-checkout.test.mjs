import { test, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV='test';
process.env.DATABASE_DRIVER='pglite';
Object.assign(process.env,{WHOP_API_KEY:' key_test ',WHOP_COMPANY_ID:' biz_test ',WHOP_PRODUCT_ID:' prod_test ',WHOP_WEBHOOK_SECRET:'secret'});
const {db,records,balance}=await import('../server/db.mjs');
const {createCheckout}=await import('../server/whop.mjs');
for (const [status,code] of [[401,'AUTHENTICATION'],[403,'PERMISSIONS'],[404,'NOT_FOUND'],[422,'CONFIGURATION'],[429,'RATE_LIMIT'],[503,'PROVIDER_UNAVAILABLE']]) {
  test(`classifies Whop ${status} without leaking provider response`,async(t)=>{
    t.mock.method(globalThis,'fetch',async()=>new Response('secret echoed upstream',{status}));
    const log=t.mock.method(console,'error',()=>{});
    const user={id:`test-${status}`,name:'Test',role:'client'};
    await assert.rejects(createCheckout(user,{amount:1000}),e=>e.message.includes(code)&&!e.message.includes('secret echoed'));
    const payment=(await records('payment')).find(p=>p.owner===user.id);
    assert.equal(payment.failureCode,code);
    assert.equal(payment.status,'failed');
    assert.ok(!JSON.stringify(log.mock.calls).includes('secret echoed'));
  });
}
test('successful unpaid checkout retains IDs and reuses session',async(t)=>{
  const fetchMock=t.mock.method(globalThis,'fetch',async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer key_test');
    const body=JSON.parse(options.body);
    assert.equal(body.plan.company_id,'biz_test');
    assert.equal(body.plan.product_id,'prod_test');
    assert.equal(body.plan.initial_price,10);
    return Response.json({id:'ch_test',plan:{id:'plan_test'}});
  });
  const user={id:'success',name:'Test',role:'client'};
  const payment=await createCheckout(user,{amount:1000});
  assert.equal(payment.status,'pending');
  assert.equal(payment.planId,'plan_test');
  assert.equal((await createCheckout(user,{amount:1000})).id,payment.id);
  assert.equal(fetchMock.mock.calls.length,1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM ledger').get()).count,0);
});
after(()=>db.close());
