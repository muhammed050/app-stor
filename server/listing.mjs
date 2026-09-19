import {record} from './db.mjs';
import {validateAsset} from '../shared/listing.mjs';
export async function validateListing(b,user) {
 const bad=m=>{const e=new Error(m);e.status=400;throw e;};
 if(!b||typeof b!=='object'||!Array.isArray(b.assets))bad('أكمل صور المتجر وبيانات المراجعة');
 const out={};
 const txt=(key,min,max)=>{const value=typeof b[key]==='string'?b[key].trim():'';if(value.length<min||value.length>max)bad(`الحقل ${key} غير مكتمل أو أطول من الحد`);out[key]=value;return value;};
 txt('shortDescription',1,80);txt('language',2,20);txt('supportEmail',3,200);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.supportEmail))bad('بريد الدعم غير صالح');
 for(const [key,values] of Object.entries({appType:['app','game'],distribution:['free','paid'],containsAds:['yes','no'],inAppPurchases:['yes','no'],requiresLogin:['yes','no'],createsAccounts:['yes','no'],collectsData:['yes','no']})){if(!values.includes(b[key]))bad('أجب عن أسئلة التطبيق والخصوصية');out[key]=b[key];}
 txt('targetAudience',3,200);txt('permissions',3,3000);txt('contentDeclarations',3,3000);txt('countries',2,1000);txt('deviceNotes',0,1000);
 if(out.requiresLogin==='yes')txt('accessInstructions',10,3000);
 if(out.collectsData==='yes')txt('dataSafety',20,5000);
 for(const key of ['deletionUrl','videoUrl']){const value=txt(key,key==='deletionUrl'&&out.createsAccounts==='yes'?8:0,2000);if(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)throw 0;if(key==='videoUrl'&&!['youtube.com','www.youtube.com','youtu.be'].includes(u.hostname))throw 0;}catch{bad(key==='videoUrl'?'أدخل رابط فيديو YouTube HTTPS صالح':'أدخل رابط حذف حساب HTTPS صالح');}}}
 if(b.declarationsConfirmed!==true)bad('أكد دقة بيانات النشر');
 if(b.assets.length<4||b.assets.length>10)bad('أرفق أيقونة وصورة مميزة و2–8 لقطات شاشة');
 const counts={icon:0,feature:0,screenshots:0},seen=new Set();out.assets=[];
 for(const ref of b.assets){if(!ref||!Object.hasOwn(counts,ref.type)||typeof ref.id!=='string'||seen.has(ref.id))bad('قائمة الصور غير صالحة أو مكررة');seen.add(ref.id);const f=await record(ref.id);if(!f||f.owner!==user.id||f.kind!=='listing'||f.storage!=='postgres')bad('صورة غير موجودة أو ليست ملك حسابك');try{validateAsset(f.image,ref.type,f.size);}catch(e){bad(e.message);}counts[ref.type]++;out.assets.push({id:f.id,type:ref.type,name:f.name,width:f.image.width,height:f.image.height});}
 if(counts.icon!==1||counts.feature!==1||counts.screenshots<2||counts.screenshots>8)bad('أرفق أيقونة واحدة وصورة مميزة واحدة و2–8 لقطات شاشة');
 return {...out,declarationsConfirmed:true,requirementsVersion:'2026-09-19'};
}
