export const origin = 'https://dorucenie.com';
export const publicPages = {
  '/': {title:'Dorucenie | نشر تطبيقات Android مع شريك نشر مناسب', description:'منصة Dorucenie تربط أصحاب تطبيقات Android بشركاء نشر Google Play. مراجعة للتطبيق، ميزانية تختارها، متابعة للنشر ومحفظة موثقة.'},
  '/how-it-works': {title:'كيف تعمل Dorucenie؟ من مراجعة التطبيق إلى التحقق من النشر', description:'تعرّف على خطوات نشر تطبيقك عبر Dorucenie: تقديم الملفات، المراجعة، اختيار الناشر، متابعة الطلب والتحقق من صفحة Google Play.'},
  '/pricing': {title:'رسوم نشر التطبيقات والدفع والسحب | Dorucenie', description:'تعرف على طريقة احتساب رسم المراجعة، ميزانية نشر التطبيق وعمولة Dorucenie، وكيفية الدفع عبر Whop وسحب أرباح الناشرين.'},
  '/publishers': {title:'انضم كشريك نشر لتطبيقات Google Play | Dorucenie', description:'استقبل طلبات تطبيقات تمت مراجعتها، اختر ما يناسب حساب النشر، تابع الأرباح واطلب سحبها عبر USDT أو USDC.'},
  '/faq': {title:'الأسئلة الشائعة حول نشر التطبيقات والسحب | Dorucenie', description:'إجابات حول التسجيل، مراجعة التطبيقات، الدفع عبر Whop، التحقق من النشر، النزاعات وسحب أرباح الناشرين بالعملات الرقمية.'},
  '/legal/terms': {title:'شروط استخدام منصة Dorucenie', description:'شروط التعامل بين أصحاب التطبيقات وشركاء النشر، المراجعة، التسوية ومسؤوليات مستخدمي Dorucenie.'},
  '/legal/privacy': {title:'سياسة الخصوصية | Dorucenie', description:'كيفية استخدام بيانات الحساب والملفات وسجلات المعاملات وحمايتها في Dorucenie.'},
  '/legal/refunds': {title:'سياسة الاسترداد والسحب الرقمي | Dorucenie', description:'سياسة رسوم الفحص وميزانية النشر، النزاعات، استرداد الرصيد وطلبات سحب أرباح الناشرين.'},
};
export const faqs = [
  ['هل أحتاج حساب Google Play لنشر تطبيقي؟','يمكنك تقديم تطبيقك كصاحب تطبيق والتعامل مع شريك نشر يقبل الطلب. شريك النشر يدير حسابه ويتحمل مسؤولياته أمام Google.'],
  ['هل تضمن Dorucenie قبول التطبيق في Google Play؟','لا. نراجع الطلب ونوثق الاتفاق ونتحقق من صفحة المتجر، لكن قرار قبول التطبيق واستمراره يعود إلى Google.'],
  ['هل أشارك كلمة مرور حساب Google؟','لا نطلب كلمة مرور Google أو رموز الدخول. يقدّم شريك النشر رابط صفحته العامة والبيانات المطلوبة للمراجعة.'],
  ['متى تُصرف ميزانية النشر؟','تُحجز عند اختيار الناشر، ثم تُسوّى بعد التحقق من النشر وانتهاء مهلة الاعتراض المحددة في الطلب، ما لم يوجد نزاع مفتوح.'],
  ['كيف أدفع وأضيف الرصيد؟','تُنشأ جلسة Whop داخل صفحة الدفع في الموقع. لا يُضاف الرصيد إلا بعد وصول تأكيد دفع موثوق من Whop.'],
  ['كيف أسحب أرباح النشر بالكريبتو؟','اختر USDT أو USDC والشبكة المتاحة في المحفظة، وأدخل العنوان والمبلغ. تظهر الرسوم والصافي قبل التأكيد. تراجع الإدارة الطلب وتنفذ التحويل وتسجّل معرّف المعاملة.'],
  ['هل يمكنني سحب الرصيد الذي أضفته كصاحب تطبيق؟','رصيد صاحب التطبيق مخصص للخدمات. السحب الرقمي مخصص لأرباح الناشرين؛ طلب الاسترداد إلى وسيلة الدفع الأصلية يُراجع عبر الدعم.'],
  ['كيف أتابع النشر أو أفتح نزاعاً؟','تجد المراحل والرسائل والتسليم في صفحة الطلب. افتح النزاع قبل نهاية مهلة الاعتراض لإيقاف التسوية لحين مراجعته.'],
];
export function pageSchema(path) {
  const page = publicPages[path];
  if (!page) return null;
  const graph = [{ '@type':'Organization', '@id':origin+'/#organization', name:'Dorucenie', alternateName:'دوروتشيني', url:origin+'/', logo:{'@type':'ImageObject',url:origin+'/brand/dorucenie-logo.png',contentUrl:origin+'/brand/dorucenie-logo.png',width:1280,height:1280},description:publicPages['/'].description },
    {'@type':'WebSite','@id':origin+'/#website',name:'Dorucenie',alternateName:'دوروتشيني',url:origin+'/',inLanguage:'ar',publisher:{'@id':origin+'/#organization'}},
    {'@type':'WebPage','@id':origin+path+'#page',url:origin+path,name:page.title,description:page.description,inLanguage:'ar',isPartOf:{'@id':origin+'/#website'}}];
  if(path !== '/') graph.push({'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'الرئيسية',item:origin+'/'},{'@type':'ListItem',position:2,name:page.title,item:origin+path}]});
  return {'@context':'https://schema.org','@graph':graph};
}
