import {test,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.NODE_ENV='test';process.env.DATABASE_DRIVER='pglite';process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'dorucenie-email-'));
delete process.env.EMAIL_WEBHOOK_URL;delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM;
const {db,save,record,records,atomic}=await import('../server/db.mjs');
const {createUser}=await import('../server/auth.mjs');
const {state}=await import('../server/domain.mjs');
const {queueEmail,processEmails,retryEmail}=await import('../server/email.mjs');
const {emailContent}=await import('../server/email-template.mjs');
const user=await createUser({name:'محمد',email:'email-test@example.test',password:'safe-test-password',role:'client'});
const welcome=(await records('email'))[0];
beforeEach(async()=>{await db.prepare("DELETE FROM records WHERE kind='email'").run();delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM;});
const enqueue=()=>queueEmail({owner:user.id,key:'test',subject:'تجربة',message:'تفاصيل الطلب',path:'/wallet'});
const configure=()=>{process.env.RESEND_API_KEY='re_test_only';process.env.EMAIL_FROM='Dorucenie <notifications@dorucenie.com>';};
test('registration creates a private welcome email',async()=>{assert.equal(welcome.owner,user.id);assert.match(welcome.subject,/Dorucenie/);assert.equal(welcome.status,'pending');});
test('missing provider keeps messages pending without network',async()=>{const id=await enqueue();const result=await processEmails({fetcher:()=>{throw new Error('must not run')}});assert.equal(result.configured,false);assert.equal((await record(id)).attempts,0);});
test('status changes queue once and rollback with the financial transaction',async()=>{
 const p=await save('publisher',{owner:user.id,status:'pending'});assert.equal((await records('email')).length,0);
 const approved=await save('publisher',{...p,status:'approved'});await save('publisher',approved);assert.equal((await records('email')).length,1);
 await assert.rejects(()=>atomic(async()=>{await save('withdrawal',{owner:user.id,status:'paid',amount:3000,net:2800,fee:200,network:'USDT-TRC20'});throw new Error('rollback')}));
 assert.equal((await records('email')).length,1);
 const privateState=await state(user);assert.equal(privateState.email,undefined);assert.ok(!JSON.stringify(privateState).includes('email-test@example.test')||privateState.user.email===user.email);
});
test('two workers send a queued email once and use a stable idempotency key',async()=>{
 configure();const id=await enqueue();let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers['Idempotency-Key'],id);const b=JSON.parse(options.body);assert.deepEqual(b.to,[user.email]);assert.ok(b.html.includes('dir="rtl"'));return Response.json({id:'resend-test-id'});};
 await Promise.all([processEmails({fetcher}),processEmails({fetcher})]);assert.equal(calls,1);assert.equal((await record(id)).status,'accepted');
 await processEmails({fetcher});assert.equal(calls,1);
});
test('provider throttling retries; errors redact provider response; permanent failure supports admin retry',async()=>{
 configure();const id=await enqueue();let time=Date.now()+100;
 await processEmails({clock:()=>time,fetcher:async()=>new Response('secret provider details',{status:429})});let m=await record(id);assert.equal(m.status,'retry');assert.equal(m.lastError,'HTTP_429');assert.ok(!JSON.stringify(m).includes('secret provider'));
 time=m.nextAttemptAt+1;await processEmails({clock:()=>time,fetcher:async()=>new Response('invalid key',{status:401})});assert.equal((await record(id)).status,'failed');
 await retryEmail(id,user.id);await processEmails({fetcher:async()=>Response.json({id:'accepted-retry'})});assert.equal((await record(id)).status,'accepted');
 await assert.rejects(()=>retryEmail(id,user.id));
});
test('expired reset tokens and expired idempotency windows are never sent',async()=>{
 configure();const id=await queueEmail({owner:user.id,key:'expired',subject:'reset',message:'reset',path:'/reset?token=test-secret',expiresAt:Date.now()-1});
 await processEmails({fetcher:()=>{throw new Error('must not send')}});assert.equal((await record(id)).status,'expired');assert.ok(!(await record(id)).path.includes('test-secret'));
 const old=await enqueue();await save('email',{...await record(old),status:'retry',firstAttemptAt:Date.now()-24*3600000});
 await processEmails({fetcher:()=>{throw new Error('outside idempotency window')}});assert.equal((await record(old)).status,'expired');
});
test('email variables are escaped and external CTA links rejected',()=>{
 const content=emailContent({name:'<script>bad</script>',subject:'A&B',message:'<img src=x>',path:'/wallet'});assert.ok(!content.html.includes('<script>'));assert.ok(content.html.includes('&lt;img'));assert.throws(()=>emailContent({path:'https://evil.example'}));
});
after(async()=>{await db.close();rmSync(process.env.DATA_DIR,{recursive:true,force:true});});
