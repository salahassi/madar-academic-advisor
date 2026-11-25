/* Optional on-device explanation of the currently visible academic calculation. */
(() => {
  'use strict';
  const cache = new Map();
  let pending = null;
  const words = {
    optimizer: {title:'شرح المقارنة', button:'فسّر لي الخيارات', question:'اشرح بإيجاز أهم الفرق بين الجداول المحسوبة. اربط نصيحتك بالتفضيلات المعروضة وأشر إلى المفاضلة إن وجدت.'},
    insights: {title:'قراءة التحليل', button:'فسّر لي النتيجة', question:'فسّر باختصار النتائج المتاحة للطالب. اذكر خطوة دراسية عملية مستندة إلى هذه البيانات واعرض أي افتراض يؤثر في الاستنتاج.'}
  };
  function snapshot(){
    const root = document.getElementById('madar-interpret');
    if(!root) return null;
    const context=root.dataset.context;
    const source=context==='optimizer'?window.MadarOptimize:window.MadarInsights;
    const facts=source.summaryFacts?.();
    if(!facts||!words[context]) return null;
    const detail=typeof facts==='string'?facts:JSON.stringify(facts);
    return {root,context,detail,key:window.Madar.getProfile().id+'|'+context+'|'+detail};
  }
  function controls(){
    const s=snapshot();if(!s)return;
    const {root,key,context}=s, config=words[context];
    const reading=cache.get(key),busy=pending===key;
    const ready=window.MadarGen?.ready();
    const helper=busy?'النموذج يقرأ النتائج المعروضة…':ready?'يتولّد الشرح على جهازك من الأرقام والمقررات أعلاه.':'يتطلب الشرح تفعيل النموذج اللغوي على جهازك.';
    root.innerHTML='<section class="plan-explain"><div class="plan-explain-top"><span class="explain-ico">'+window.UI.icon('sparkles',20)+'</span><div><h3>'+config.title+'</h3><small>'+helper+'</small></div><button type="button" class="btn" data-explain="'+(busy?'stop':ready?'run':'enable')+'">'+(busy?'إيقاف':ready?config.button:'تفعيل النموذج')+'</button></div>'+(reading?'<p class="explain-output" role="status">'+window.UI.esc(reading)+'</p>':'')+'</section>';
  }
  function normalize(v){
    return String(v).replace(/[٠-٩]/g,v=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(v))).replace(/[۰-۹]/g,v=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(v))).replace(/٫/g,'.').toLowerCase();
  }
  function grounded(value,facts){
    const n=normalize(value), source=normalize(facts);
    const tokens=s=>s.match(/\b[a-z]{2,5}\s*\d{3}\b|\d+(?:[.:]\d+)?/g)||[];
    const known=new Set(tokens(source).map(v=>v.replace(/\s+/g,'')));
    return n.length>10 && tokens(n).every(v=>known.has(v.replace(/\s+/g,''))) && !/تم (التسجيل|الحذف|التبديل)|ضمان التخرج|بتاريخ محدد|سجلت لك/.test(n);
  }
  document.addEventListener('click', async event=>{
    const mode=event.target.closest?.('[data-explain]')?.dataset.explain;
    if(!mode)return;
    if(mode==='enable'){window.MadarGen.open();return;}
    if(mode==='stop'){pending=null;window.MadarGen.cancel?.();controls();return;}
    const s=snapshot();
    if(!s || pending)return;
    pending=s.key;controls();
    try {
      const text=await window.MadarGen.generate({question:words[s.context].question,facts:s.detail,history:[]});
      if(pending!==s.key)return;
      const result=grounded(text,s.detail)?String(text).trim():'تضمّن الشرح تفاصيل يتعذّر التحقق منها. اعتمد النتائج المحسوبة أعلاه.';
      if(cache.size>=12)cache.delete(cache.keys().next().value);
      cache.set(s.key,result);
    } catch {
      if(pending===s.key)window.UI.toast('تعذّر توليد الشرح على هذا الجهاز. يمكنك متابعة مقارنة النتائج المحسوبة.');
    } finally {
      if(pending===s.key)pending=null;
      controls();
    }
  });
  document.addEventListener('madar:gen-state',event=>{
    if(['off','ready','error'].includes(event.detail?.phase))controls();
  });
  window.MadarInterpret={controls};
})();
