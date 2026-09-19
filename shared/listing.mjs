// Google Play listing requirements, reviewed 2026-09-19.
export const assetRules = {
  icon: {label:'أيقونة التطبيق', hint:'PNG ‏32-bit، مقاس 512 × 512، حتى 1 MB', max:1048576},
  feature: {label:'الصورة المميزة', hint:'1024 × 500، JPEG أو PNG ‏24-bit بدون شفافية', max:8388608},
  screenshots: {label:'لقطات شاشة الهاتف', hint:'من 2 إلى 8 صور، JPEG أو PNG بدون شفافية؛ الأبعاد 320–3840 والنسبة لا تتجاوز 2:1', max:8388608},
};
export function imageMetadata(input) {
  const b = new Uint8Array(input), v = new DataView(b.buffer,b.byteOffset,b.byteLength);
  if(b.length>=33 && [137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x)) {
    let transparent = [4,6].includes(b[25]);
    for(let p=8;p+12<=b.length;) { const n=v.getUint32(p); if(n>b.length-p-12) throw new Error('صورة PNG غير مكتملة'); const type=String.fromCharCode(...b.slice(p+4,p+8)); if(type==='tRNS') transparent=true; p+=n+12; if(type==='IEND') break; }
    return {format:'png',width:v.getUint32(16),height:v.getUint32(20),depth:b[24],color:b[25],transparent};
  }
  if(b[0]===255 && b[1]===216) {
    let p=2;
    while(p+4<b.length) { if(b[p++]!==255) break; while(b[p]===255) p++; const marker=b[p++]; if(marker===217||marker===218) break; if(marker===1||(marker>=208&&marker<=215)) continue; const n=v.getUint16(p); if(n<2||p+n>b.length) break; if([192,193,194].includes(marker)&&n>=8) return {format:'jpeg',height:v.getUint16(p+3),width:v.getUint16(p+5),transparent:false}; p+=n; }
  }
  throw new Error('اختر صورة PNG أو JPEG صالحة');
}
export function validateAsset(meta, type, size) {
  const r=assetRules[type]; if(!r) throw new Error('نوع صورة غير صالح');
  if(!meta || size>r.max || size<=0) throw new Error(`${r.label}: حجم الملف غير مسموح`);
  const {width:w,height:h}=meta;
  if(type==='icon') { if(meta.format!=='png'||w!==512||h!==512||meta.depth!==8||meta.color!==6) throw new Error('الأيقونة: استخدم PNG ‏32-bit بمقاس 512 × 512'); }
  else {
    if(meta.transparent || (meta.format==='png'&&(meta.depth!==8||meta.color!==2))) throw new Error(`${r.label}: استخدم JPEG أو PNG ‏24-bit بدون قناة شفافية`);
    if(type==='feature'&&(w!==1024||h!==500)) throw new Error('الصورة المميزة يجب أن تكون 1024 × 500');
    if(type==='screenshots'&&(Math.min(w,h)<320||Math.max(w,h)>3840||Math.max(w,h)>2*Math.min(w,h))) throw new Error('لقطة الشاشة: الأبعاد 320–3840 والنسبة القصوى 2:1؛ مثال مناسب 1080 × 1920');
  }
  return meta;
}
