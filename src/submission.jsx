import React, {useState,useEffect} from 'react';
import {assetRules,imageMetadata,validateAsset} from '../shared/listing.mjs';
export function ListingAssets({onChange}) {
  const [files,setFiles]=useState({icon:[],feature:[],screenshots:[]});
  const [error,setError]=useState('');
  useEffect(()=>{onChange(files)},[files]);
  return <section className="submission-section"><h3>2. صور صفحة المتجر</h3><p>اختر الصور لمعاينتها والتحقق من المقاسات قبل الرفع. الحد 8 MB للصورة داخل منصتنا، والأيقونة 1 MB.</p>
    {Object.entries(assetRules).map(([key,r])=><div className="listing-upload" key={key}><label><strong>{r.label} *</strong><small>{r.hint}</small><input name={key} type="file" accept={key==='icon'?'.png':'.png,.jpg,.jpeg'} multiple={key==='screenshots'} required={!files[key].length} onChange={async e=>{
      const input=e.target, picked=[...input.files];
      try {if(picked.length>(key==='screenshots'?8:1))throw new Error('اختر 8 لقطات كحد أقصى');
        const checked=[]; for(const file of picked){if(file.size>r.max)throw new Error(`${file.name}: حجم الصورة أكبر من الحد`);const meta=validateAsset(imageMetadata(await file.arrayBuffer()),key,file.size);checked.push({file,meta});}
        setFiles(old=>({...old,[key]:checked}));setError('');
      }catch(err){setError(err.message);input.value='';setFiles(old=>({...old,[key]:[]}));}
    }}/></label><div className="asset-previews">{files[key].map((x,i)=><AssetPreview key={x.file.name+i} item={x}/>)}</div>{key==='screenshots'&&<small>{files[key].length} / 8 — مطلوب صورتان على الأقل. اختيار مجموعة جديدة يستبدل المجموعة الحالية.</small>}</div>)}
    {error&&<p role="alert" className="notice error">{error}</p>}
    <p><a href="https://support.google.com/googleplay/android-developer/answer/9866151?hl=ar" target="_blank" rel="noreferrer">دليل المقاسات من Google Play</a></p>
  </section>;
}
function AssetPreview({item}) {const [url,setUrl]=useState('');useEffect(()=>{const u=URL.createObjectURL(item.file);setUrl(u);return()=>URL.revokeObjectURL(u)},[item.file]);return <figure><img src={url} alt={item.file.name}/><figcaption>{item.file.name}<br/>{item.meta.width} × {item.meta.height} ✓</figcaption></figure>}
export function ReviewFields({Field}) {
 const [access,setAccess]=useState('no'),[accounts,setAccounts]=useState('no'),[data,setData]=useState('no');
 const choice=(name,label,onChange)=><Field label={label}><select name={name} required defaultValue="" onChange={onChange}><option value="" disabled>اختر الإجابة</option><option value="no">لا</option><option value="yes">نعم</option></select></Field>;
 return <section className="submission-section"><h3>3. الخصوصية ومعلومات المراجعة</h3><p>تُتاح التفاصيل للإدارة والناشر الذي تختاره فقط. استخدم حساب اختبار، وليس كلمة مرور حسابك الشخصي.</p>
 <Field label="بريد الدعم الظاهر في المتجر" name="supportEmail" type="email" required maxLength={200}/>
 <Field label="رابط سياسة الخصوصية" name="privacyUrl" type="url" required placeholder="https://example.com/privacy"/>
 <div className="form-grid">{choice('containsAds','هل يحتوي التطبيق على إعلانات؟')}{choice('inAppPurchases','هل توجد مشتريات أو اشتراكات داخل التطبيق؟')}{choice('requiresLogin','هل يتطلب الوصول تسجيل دخول أو قيودًا خاصة؟',e=>setAccess(e.target.value))}{choice('createsAccounts','هل يمكن إنشاء حساب داخل التطبيق؟',e=>setAccounts(e.target.value))}</div>
 {access==='yes'&&<Field label="تعليمات دخول المراجع وحساب الاختبار" hint="بيانات اختبار صالحة وخطوات الوصول لكل الميزات وتجاوز OTP أو القيود الجغرافية."><textarea name="accessInstructions" required minLength={10} maxLength={3000} rows={4}/></Field>}
 {accounts==='yes'&&<Field label="رابط طلب حذف الحساب" name="deletionUrl" type="url" required hint="صفحة عامة تشرح طلب الحذف؛ يلزم أيضًا مسار حذف داخل التطبيق وفق السياسة."/>}
 <Field label="الفئات العمرية المستهدفة" name="targetAudience" required maxLength={200} placeholder="مثال: 18 سنة فأكثر، أو 13–15 و16–17"/>
 {choice('collectsData','هل يجمع التطبيق أو SDK بيانات أو يشاركها؟',e=>setData(e.target.value))}
 {data==='yes'&&<Field label="تفاصيل أمان البيانات" hint="أنواع البيانات، الغرض، المشاركة، التشفير، الاحتفاظ والحذف؛ يشمل SDK الإعلانات والتحليلات."><textarea name="dataSafety" required minLength={20} maxLength={5000} rows={5}/></Field>}
 <Field label="الأذونات والمكتبات الخارجية SDK" hint="اكتب الأذونات وسببها ومكتبات الإعلانات والتحليلات؛ اكتب «لا يوجد» عند عدم وجودها."><textarea name="permissions" required minLength={3} maxLength={3000} rows={3}/></Field>
 <Field label="محتوى التطبيق وإقراراته الخاصة" hint="اذكر العنف، المحادثات ومحتوى المستخدمين، الصحة، المال، الأخبار، الأطفال أو الأذونات الحساسة؛ أو اكتب «لا يوجد». تُستكمل استبيانات Google الرسمية مع الناشر حسب التطبيق."><textarea name="contentDeclarations" required minLength={3} maxLength={3000} rows={3}/></Field>
 <Field label="الأجهزة المستهدفة ومتطلبات إضافية" name="deviceNotes" maxLength={1000} placeholder="هاتف Android؛ اذكر هنا إن كان يدعم التلفاز أو الساعة أو الأجهزة اللوحية" hint="الصور أعلاه للهاتف. الأجهزة الأخرى قد تحتاج صورًا وإقرارات إضافية يطلبها فريق الفحص قبل النشر."/>
 <Field label="دول التوزيع المطلوبة" name="countries" required maxLength={1000} placeholder="كل الدول المتاحة، أو أسماء الدول المطلوبة"/>
 <Field label="رابط فيديو توضيحي — اختياري" name="videoUrl" type="url" hint="YouTube عام أو غير مدرج؛ بدون تقييد عمري أو إعلانات."/>
 <label className="checkbox"><input type="checkbox" name="declarationsConfirmed" required/> أؤكد دقة البيانات وشمولها للمكتبات الخارجية، وأن نسخة التطبيق موقّعة وجاهزة للمراجعة.</label>
 </section>;
}
export function ListingDetails({listing}) {
 if(!listing)return null;
 const labels={shortDescription:'الوصف المختصر',language:'اللغة',appType:'نوع التطبيق',distribution:'مجاني / مدفوع',supportEmail:'بريد الدعم',containsAds:'إعلانات',inAppPurchases:'مشتريات داخل التطبيق',requiresLogin:'دخول مقيد',accessInstructions:'تعليمات المراجع',createsAccounts:'إنشاء حساب',deletionUrl:'رابط حذف الحساب',targetAudience:'الجمهور',collectsData:'جمع البيانات',dataSafety:'أمان البيانات',permissions:'الأذونات وSDK',contentDeclarations:'إقرارات المحتوى',deviceNotes:'الأجهزة',countries:'الدول',videoUrl:'الفيديو'};
 return <section className="submission-section"><h3>حزمة النشر وبيانات المتجر</h3><dl className="listing-details">{Object.entries(labels).filter(([k])=>listing[k]).map(([k,label])=><div key={k}><dt>{label}</dt><dd className="pre-wrap">{listing[k]==='yes'?'نعم':listing[k]==='no'?'لا':listing[k]}</dd></div>)}</dl><div className="listing-downloads">{listing.assets.map((f,i)=><a key={f.id} className="button secondary small-button" href={`/api/files/${f.id}`}>{assetRules[f.type]?.label} {f.type==='screenshots'?i-1:''} ↓</a>)}</div></section>;
}
