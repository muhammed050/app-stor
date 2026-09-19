import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
process.env.NODE_ENV='test';
process.env.DATABASE_DRIVER='pglite';
process.env.ADMIN_EMAIL='admin@example.test';
process.env.ADMIN_PASSWORD='short';
const { db }=await import('../server/db.mjs');
const { bootstrapAdmin }=await import('../server/bootstrap.mjs');
const { default: handler }=await import('../api/index.js');
const server=createServer(handler);
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
test('invalid administrator password leaves public API available and creates no admin',async(t)=>{
  await assert.rejects(bootstrapAdmin(),{code:'ADMIN_PASSWORD_TOO_SHORT'});
  const log=t.mock.method(console,'error',()=>{});
  for(const path of ['/api/health','/api/config','/api/me']) {
    const response=await fetch(base+path);
    assert.equal(response.status,200);
    assert.ok(await response.json());
  }
  assert.equal(log.mock.calls.length,1);
  assert.deepEqual(log.mock.calls[0].arguments,['Administrator setup:','ADMIN_PASSWORD_TOO_SHORT']);
  assert.equal(await db.prepare("SELECT 1 FROM users WHERE role='admin'").get(),undefined);
});
test('valid configuration creates one administrator and does not reset an existing password',async()=>{
  process.env.ADMIN_PASSWORD='A-secure-bootstrap-password';
  await bootstrapAdmin();
  const original=await db.prepare("SELECT * FROM users WHERE role='admin'").get();
  assert.equal(original.email,'admin@example.test');
  process.env.ADMIN_PASSWORD='A-different-long-password';
  await bootstrapAdmin();
  const rows=await db.prepare("SELECT * FROM users WHERE role='admin'").all();
  assert.equal(rows.length,1);
  assert.equal(rows[0].password,original.password);
});
after(async()=>{await new Promise(resolve=>server.close(resolve));await db.close();});
