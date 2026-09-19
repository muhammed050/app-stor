import {test,after} from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV='test';
process.env.DATABASE_DRIVER='pglite';
const {db,post,atomic,balance,records}=await import('../server/db.mjs');
const {createUser}=await import('../server/auth.mjs');
const {withdraw,adminAction}=await import('../server/domain.mjs');
const {cryptoMethods,validAddress,validTransaction,transactionUrl}=await import('../shared/crypto.mjs');
const pub=await createUser({name:'Publisher',email:'crypto@test.invalid',password:'fixture-test-password',role:'publisher'});
const admin=await createUser({name:'Admin',email:'crypto-admin@test.invalid',password:'fixture-test-password',role:'admin'});
await atomic(()=>post(pub.id,100000,0,'fixture','crypto','crypto-fixture'));
test('all six methods reserve exact amounts, reject wrong transaction format and settle once',async()=>{
 for(const [index,m] of cryptoMethods.entries()) {
  const before=await balance(pub.id);
  const address=m.family==='tron'?'T'+'A'.repeat(33):'0x'+'a'.repeat(40);
  assert.ok(validAddress(m.id,address));
  const w=await withdraw(pub,{amount:3000,network:m.id,address,confirmed:true});
  assert.equal(w.fee,200);assert.equal(w.net,2800);
  assert.equal((await balance(pub.id)).available,before.available-3000);
  assert.equal((await balance(pub.id)).held,before.held+3000);
  await assert.rejects(adminAction(admin,'withdrawals',w.id,{action:'approve',reference:'wrong-network-format',cryptoAmount:28}));
  const tx=(m.family==='evm'?'0x':'')+String(index+1).repeat(64);
  assert.ok(validTransaction(m.id,tx));assert.ok(transactionUrl(m.id,tx).startsWith(m.explorer));
  await adminAction(admin,'withdrawals',w.id,{action:'approve',reference:tx,cryptoAmount:28});
  assert.equal((await balance(pub.id)).held,before.held);
  await assert.rejects(adminAction(admin,'withdrawals',w.id,{action:'approve',reference:tx,cryptoAmount:28}));
 }
});
test('disabled methods reject new requests while existing requests can be refunded',async()=>{
 const before=await balance(pub.id);
 const w=await withdraw(pub,{amount:3000,network:'USDC-BASE',address:'0x'+'b'.repeat(40),confirmed:true});
 await adminAction(admin,'settings','settings',{withdrawalNetworks:[]});
 const count=(await records('withdrawal')).length;
 await assert.rejects(withdraw(pub,{amount:3000,network:'USDC-BASE',address:'0x'+'b'.repeat(40),confirmed:true}));
 assert.equal((await records('withdrawal')).length,count);
 await adminAction(admin,'withdrawals',w.id,{action:'reject',reference:'Test refund'});
 assert.deepEqual(await balance(pub.id),before);
 await assert.rejects(adminAction(admin,'settings','settings',{withdrawalNetworks:['INVALID']}));
});
test('address and explorer validation reject unknown networks, zero EVM addresses and unsafe references',()=>{
 assert.equal(validAddress('USDC-BASE','0x'+'0'.repeat(40)),false);
 assert.ok(!validAddress('INVALID','0x'+'a'.repeat(40)));
 assert.equal(transactionUrl('USDC-BASE','javascript:alert(1)'),null);
 assert.equal(transactionUrl('USDT-TRC20','0x'+'a'.repeat(64)),null);
});
after(()=>db.close());
