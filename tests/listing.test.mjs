import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {png,listingFixture} from './listing-fixtures.mjs';
import {imageMetadata,validateAsset} from '../shared/listing.mjs';
process.env.NODE_ENV='test';process.env.DATABASE_DRIVER='pglite';process.env.DATA_DIR=mkdtempSync(join(tmpdir(),'listing-tests-'));
const {save,db,balance,post}=await import('../server/db.mjs');
const {createUser}=await import('../server/auth.mjs');
const {createApp}=await import('../server/domain.mjs');
const {validateListing}=await import('../server/listing.mjs');
const user=await createUser({name:'Client',email:'listing@example.test',password:'secure-password-1234',role:'client'});
const listing=await listingFixture(save,user.id);
test('image requirements reject wrong size, format, transparency and ratio',()=>{
 assert.equal(validateAsset(imageMetadata(png(512,512,true)),'icon',2000).width,512);
 assert.throws(()=>validateAsset(imageMetadata(png(500,500,true)),'icon',2000));
 assert.throws(()=>validateAsset(imageMetadata(png(1024,500,true)),'feature',2000));
 assert.throws(()=>validateAsset(imageMetadata(png(400,1200)),'screenshots',2000));
 assert.throws(()=>imageMetadata(Buffer.from('not an image')));
});
test('listing enforces ownership, conditional declarations and screenshot count',async()=>{
 assert.equal((await validateListing(listing,user)).assets.length,4);
 await assert.rejects(()=>validateListing(listing,{id:'another-user'}));
 await assert.rejects(()=>validateListing({...listing,assets:listing.assets.slice(0,3)},user));
 await assert.rejects(()=>validateListing({...listing,requiresLogin:'yes'},user));
 await assert.rejects(()=>validateListing({...listing,createsAccounts:'yes'},user));
 await assert.rejects(()=>validateListing({...listing,collectsData:'yes'},user));
});
test('incomplete listing never reserves review funds or creates app',async()=>{
 await post(user.id,10000,0,'seed','seed','seed');
 const file=await save('file',{owner:user.id,kind:'app',name:'app.aab'});
 const before=await balance(user.id);
 await assert.rejects(()=>createApp(user,{title:'Tasks',packageName:'com.test.tasks',version:'1',description:'A complete long description',category:'Tools',privacyUrl:'https://example.test/privacy',rights:true,fileId:file.id,budget:5000,listing:{...listing,assets:[]}}));
 assert.deepEqual(await balance(user.id),before);
});
after(async()=>{await db.close();rmSync(process.env.DATA_DIR,{recursive:true,force:true});});
