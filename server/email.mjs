import {createHash,randomUUID} from 'node:crypto';
import {db,atomic} from './connection.mjs';
import {emailContent} from './email-template.mjs';
export function emailConfiguration(){
 const resend=Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
 const webhook=Boolean(process.env.EMAIL_WEBHOOK_URL);
 return {configured:resend||webhook,provider:resend?'resend':webhook?'webhook':null};
}
const get=async id=>{const r=await db.prepare("SELECT body FROM records WHERE id=? AND kind='email'").get(id);return r?JSON.parse(r.body):null;};
const put=async row=>{await db.prepare("UPDATE records SET body=? WHERE id=? AND kind='email'").run(JSON.stringify(row),row.id);};
export async function queueEmail({owner,key,subject,message,path='/dashboard',expiresAt=Date.now()+7*86400000}) {
 return atomic(async()=>{
  const user=await db.prepare('SELECT name,email FROM users WHERE id=?').get(owner);if(!user)return null;
  const id='email:'+createHash('sha256').update(key+':'+owner).digest('hex');
  const row={id,owner,to:user.email,name:user.name,subject,message,path,status:'pending',attempts:0,nextAttemptAt:Date.now(),expiresAt,createdAt:new Date().toISOString()};
  await db.prepare("INSERT INTO records(id,kind,owner,body,created_at) VALUES(?,'email',?,?,?) ON CONFLICT(id) DO NOTHING").run(id,owner,JSON.stringify(row),row.createdAt);
  return id;
 });
}
const statusNames={reviewing:'قيد الفحص',open:'متاح لاستقبال عروض الناشرين',assigned:'تم اختيار الناشر',submitted:'أُرسل للتحقق',verified:'تم التحقق وبدأت مهلة الاعتراض',completed:'مكتمل',cancelled:'ملغى',rejected:'مرفوض',disputed:'نزاع قيد المراجعة',pending:'قيد المراجعة',approved:'معتمد',paid:'تم تنفيذ التحويل',failed:'تعذر إنشاء الدفع',refunded:'أُعيد الرصيد'};
const usd=n=>`${(Number(n||0)/100).toFixed(2)} USD`;
export async function queueRecordEmails(kind,previous,value) {
 if(previous?.status===value.status)return;
 const status=statusNames[value.status]||value.status;
 const key=`${kind}:${value.id}:${value.emailRevision}`;
 if(kind==='publisher'&&['approved','rejected'].includes(value.status)){
  await queueEmail({owner:value.owner,key,subject:value.status==='approved'?'تم تفعيل حساب الناشر':'تحديث طلب اعتماد الناشر',message:value.status==='approved'?'أصبح حساب الناشر معتمدًا. يمكنك الآن مشاهدة فرص النشر وتقديم عروضك.':`حالة طلبك: ${status}. راجع ملاحظات الإدارة داخل الموقع.`,path:'/publisher'});
 } else if(kind==='app'||kind==='update'){
  const subject=kind==='app'?'تحديث حالة طلب النشر':'تحديث حالة طلب تحديث التطبيق';
  for(const owner of new Set([value.owner,value.publisherId].filter(Boolean)))await queueEmail({owner,key,subject,message:`${value.title || 'طلبك'}\nالحالة: ${status}\nرقم الطلب: ${value.id}`,path:`/apps/${kind==='app'?value.id:value.appId}`});
 } else if(kind==='payment'&&['approved','rejected','failed'].includes(value.status)){
  await queueEmail({owner:value.owner,key,subject:value.status==='approved'?'تم تأكيد الدفع وإضافة الرصيد':'تحديث حالة الدفع',message:value.status==='approved'?`تم تأكيد دفع ${usd(value.amount)} وإضافته إلى محفظتك.`:`حالة طلب الدفع: ${status}. المبلغ: ${usd(value.amount)}. راجع التفاصيل في المحفظة.`,path:'/wallet'});
 } else if(kind==='withdrawal'){
  await queueEmail({owner:value.owner,key,subject:value.status==='paid'?'تم تنفيذ طلب السحب':'تحديث طلب السحب',message:`حالة الطلب: ${status}\nالمبلغ: ${usd(value.amount)}\nالرسوم: ${usd(value.fee)}\nالصافي: ${usd(value.net)}\nالشبكة: ${value.network}\n${value.status==='paid'?`معرّف المعاملة: ${value.adminReference}`:value.status==='rejected'?'أُعيد المبلغ المحجوز إلى الرصيد المتاح.':'سيراجع فريق الإدارة الطلب قبل تنفيذ التحويل.'}`,path:'/wallet'});
 }
}
export async function processEmails({limit=8,fetcher=fetch,clock=Date.now}={}){
 const config=emailConfiguration();if(!config.configured)return {configured:false,accepted:0};
 let accepted=0,failed=0;
 for(let i=0;i<limit;i++){
  const now=clock();
  const item=await atomic(async()=>{
   const row=await db.prepare("SELECT body FROM records WHERE kind='email' AND ((body::jsonb->>'status' IN ('pending','retry') AND (body::jsonb->>'nextAttemptAt')::bigint<=?) OR (body::jsonb->>'status'='sending' AND (body::jsonb->>'leaseUntil')::bigint<=?)) ORDER BY created_at LIMIT 1").get(now,now);
   if(!row)return null;
   const m=JSON.parse(row.body);
   if(m.expiresAt<=now || (m.firstAttemptAt && now-m.firstAttemptAt>=23*3600000)) {m.status='expired';m.message='';m.path='/dashboard';await put(m);return {skip:true};}
   m.status='sending';m.lease=randomUUID();m.leaseUntil=now+60000;m.attempts++;m.firstAttemptAt ||= now;await put(m);return m;
  });
  if(!item)break;if(item.skip)continue;
  let result,error;
  try {
   const content=emailContent(item);
   const resend=config.provider==='resend';
   const endpoint=resend?'https://api.resend.com/emails':process.env.EMAIL_WEBHOOK_URL;
   if(!endpoint.startsWith('https://'))throw Object.assign(new Error('CONFIGURATION'),{permanent:true});
   const payload=resend?{from:process.env.EMAIL_FROM,to:[item.to],subject:item.subject,...content}:{to:item.to,subject:item.subject,...content};
   const response=await fetcher(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${resend?process.env.RESEND_API_KEY:process.env.EMAIL_WEBHOOK_TOKEN||''}`,'Idempotency-Key':item.id},body:JSON.stringify(payload)});
   if(!response.ok)throw Object.assign(new Error(`HTTP_${response.status}`),{permanent:[400,401,403,404,409,422].includes(response.status)});
   const data=await response.json().catch(()=>({}));
   if(resend&&typeof data.id!=='string')throw new Error('INVALID_PROVIDER_RESPONSE');
   result={providerId:typeof data.id==='string'?data.id:undefined};
  }catch(e){error={code:/^(HTTP_\d{3}|CONFIGURATION|INVALID_PROVIDER_RESPONSE)$/.test(e.message)?e.message:'NETWORK',permanent:!!e.permanent};}
  await atomic(async()=>{
   const current=await get(item.id);if(current?.lease!==item.lease)return;
   delete current.lease;delete current.leaseUntil;
   if(!error){current.status='accepted';current.acceptedAt=new Date(clock()).toISOString();current.provider=config.provider;current.providerId=result.providerId;delete current.lastError;accepted++;if(current.path.startsWith('/reset?')){current.path='/reset';current.message='تم إرسال رابط استعادة كلمة المرور';}}
   else {current.status=error.permanent||current.attempts>=5?'failed':'retry';current.lastError=error.code;current.nextAttemptAt=clock()+Math.min(3600000,60000*2**current.attempts);failed++;}
   await put(current);
  });
 }
 return {configured:true,accepted,failed};
}
export async function emailSummary(){
 const counts=await db.prepare("SELECT body::jsonb->>'status' AS status,count(*)::int AS count FROM records WHERE kind='email' GROUP BY body::jsonb->>'status'").all();
 const rows=await db.prepare("SELECT id,body::jsonb->>'to' AS recipient,body::jsonb->>'subject' AS subject,body::jsonb->>'status' AS status,body::jsonb->>'lastError' AS error,created_at FROM records WHERE kind='email' ORDER BY created_at DESC LIMIT 20").all();
 return {...emailConfiguration(),counts:Object.fromEntries(counts.map(x=>[x.status,x.count])),recent:rows};
}
export async function retryEmail(id,actor){
 return atomic(async()=>{
  const m=await get(id);
  if(!m||m.status!=='failed'||m.expiresAt<Date.now()||(m.firstAttemptAt&&Date.now()-m.firstAttemptAt>=23*3600000))throw Object.assign(new Error('هذه الرسالة غير قابلة لإعادة المحاولة؛ راجع حالة الإرسال ووقت الصلاحية.'),{status:400});
  m.status='retry';m.attempts=0;m.nextAttemptAt=Date.now();await put(m);
  await db.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?)').run(randomUUID(),actor,'email.retry',id,'Manual retry requested',new Date().toISOString());
 });
}
