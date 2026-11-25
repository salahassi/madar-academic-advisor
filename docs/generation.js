(() => {
  'use strict';
  const scriptBase = new URL('.',document.currentScript?.src || document.baseURI);
  const filename = 'qwen2.5-0.5b-instruct-q4_k_m.gguf';
  const revision = '9217f5db79a29953eb74d5343926648285ec7e67';
  const source = 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF';
  const downloadUrl = source+'/resolve/'+revision+'/'+filename+'?download=true';
  const expected = 491400032;
  const state = {phase:'off',percent:0,error:'',cached:false,source:''};
  const titles = {off:'غير مفعّل',download:'جارٍ تنزيل النموذج',verify:'التحقق من ملف النموذج',load:'تحميل النموذج في الذاكرة',ready:'جاهز على هذا الجهاز',generate:'يكتب إجابة محلية',error:'تعذّر تشغيل النموذج'};
  const faults = {
    download:'تعذّر إكمال التنزيل. يمكنك إعادة المحاولة أو اختيار ملف النموذج الرسمي من جهازك.',
    storage:'لا تتوفر مساحة تخزين كافية في هذا المتصفح. يمكنك اختيار ملف النموذج من جهازك لهذه الجلسة.',
    digest:'الملف مختلف عن النسخة الرسمية المحددة. اختر ملف Q4_K_M المرتبط أدناه.',
    runtime:'تعذّر تشغيل النموذج بذاكرة أو إمكانات هذا المتصفح. جرّب متصفحًا حديثًا على حاسوب.',
    cancelled:'أُلغي الطلب.',
    size:'حجم الملف لا يطابق الإصدار المحدد. اختر ملف Q4_K_M الرسمي.',
    generation:'تعذّر إكمال الشرح التوليدي.',
    timeout:'استغرق التشغيل وقتًا طويلًا في هذا الجهاز. أوقفنا النموذج لتحرير موارده.'
  };
  let worker, activeDownload, startupTimer, cancelTimer, job, serial=0, version=0, pendingCacheCheck;
  function supported() {return typeof Worker==='function' && typeof WebAssembly==='object' && window.isSecureContext;}
  function textState(){return state.error || (state.phase==='off'&&state.cached?'محفوظ على هذا الجهاز':titles[state.phase]);}
  function renderControl() {
    return '<div class="gen-control" data-gen-control><span class="gen-icon">'+window.UI.icon('sparkles',21)+'</span><div><strong>النموذج اللغوي المحلي</strong><small data-gen-summary>'+textState()+'</small></div><button class="gen-link" type="button" data-gen="open">إدارة</button></div>';
  }
  function controls(){
    const busy=['download','verify','load'].includes(state.phase), live=['ready','generate'].includes(state.phase);
    const badge=state.phase==='generate'?'يولّد شرحًا':textState();
    const canCache=Boolean(navigator.storage?.getDirectory);
    return '<section class="gen-panel" data-gen-panel><p>يكتب النموذج شرحًا بالعربية اعتمادًا على سجل الطالب ونتيجة محرك الخطة. يجري التوليد على هذا الجهاز.</p>'+
      '<div class="gen-model"><bdi>Qwen2.5-0.5B-Instruct</bdi><small>Q4_K_M · '+(state.cached?'نسخة محفوظة':'حوالي ٤٩١ ميغابايت')+'</small></div>'+
      '<div class="gen-state" role="status">'+(busy?'<progress max="100" '+(state.phase==='load'?'':'value="'+state.percent+'"')+'></progress>':'')+'<span>'+badge+(busy&&state.phase!=='load'?' · '+state.percent+'%':'')+'</span></div>'+
      (!supported()?'<p>هذا المتصفح لا يدعم إمكانات التشغيل المحلي المطلوبة.</p>':
      busy?'<button class="btn" type="button" data-gen="cancel">إلغاء التشغيل</button>':
      live?'<div class="gen-actions">'+(state.phase==='generate'?'<button type="button" class="btn" data-gen="abort">إيقاف الإجابة</button>':'')+'<button type="button" class="btn" data-gen="unload">إيقاف النموذج وتحرير الذاكرة</button></div>':
      '<div class="gen-actions">'+(canCache?'<button class="btn primary" type="button" data-gen="start">'+(state.cached?'تشغيل النسخة المحفوظة':'تنزيل النموذج وتشغيله')+'</button>':'')+'<label class="btn gen-file">اختيار ملف من جهازي<input type="file" data-gen-file accept=".gguf"></label></div>')+
      '<p class="gen-help">التنزيل الأول يحتاج اتصالًا بمستودع Hugging Face. يعاد استخدام الملف المحفوظ عند تفعيله لاحقًا. يظل الملف الذي تختاره يدويًا على جهازك.</p>'+
      '<div class="gen-bottom"><a href="'+source+'/blob/'+revision+'/'+filename+'" target="_blank" rel="noopener noreferrer">صفحة الملف الرسمي</a>'+
      (state.cached&&!busy&&!live?'<button type="button" data-gen="remove">إزالة النسخة المحفوظة</button>':'')+'</div></section>';
  }
  function update() {
    document.querySelectorAll('[data-gen-summary]').forEach(n=>{n.textContent=textState();});
    const panel=document.querySelector('[data-gen-panel]');
    if(panel && panel.closest('dialog')?.open) panel.outerHTML=controls();
  }
  function set(phase, extra={}) {
    const changed=phase!==state.phase;
    Object.assign(state,{phase,error:''},extra);
    if(!changed && (phase==='download'||phase==='verify')) {
      const progress=document.querySelector('[data-gen-panel] progress');
      if(progress){progress.value=state.percent;progress.nextElementSibling.textContent=textState()+' · '+state.percent+'%';}
    } else update();
    if(changed)document.dispatchEvent(new CustomEvent('madar:gen-state',{detail:{phase}}));
  }
  function open(){window.UI.modal('إعدادات النموذج اللغوي',controls());checkCache();}
  async function directory(create=false) {
    if(!navigator.storage?.getDirectory) throw new Error('storage');
    return (await navigator.storage.getDirectory()).getDirectoryHandle('madar-ai-models',{create});
  }
  async function cached() {
    try {const f=await (await (await directory()).getFileHandle(filename)).getFile();return f.size===expected?f:null;} catch {return null;}
  }
  async function checkCache(){
    if(!pendingCacheCheck) pendingCacheCheck=cached().then(file=>{state.cached=Boolean(file);update();}).finally(()=>{pendingCacheCheck=null;});
    return pendingCacheCheck;
  }
  async function removeCache(){
    try {await (await directory()).removeEntry(filename);state.cached=false;update();}
    catch {await checkCache();}
  }
  function clearWorker(){
    clearTimeout(startupTimer);clearTimeout(cancelTimer);
    if(worker)worker.terminate(); worker=null;
    if(job){job.reject(new Error('cancelled'));job=null;}
  }
  function stop(){++version;activeDownload?.abort();activeDownload=null;clearWorker();set('off',{percent:0,source:''});}
  function fail(reason){
    clearWorker();
    set('error',{error:faults[reason]||faults.runtime,percent:0});
  }
  function watchdog(){
    clearTimeout(startupTimer);
    startupTimer=setTimeout(()=>fail('timeout'),120000);
  }
  function spawn(file,origin,attempt){
    if(attempt!==version)return;
    if(file.size!==expected){fail('size');return;}
    set('verify',{percent:0,source:origin});watchdog();
    worker=new Worker(new URL('generation-worker.js',scriptBase),{type:'module',name:'madar-qwen'});
    worker.onerror=()=>{if(attempt===version)fail('runtime');};
    worker.onmessage=({data})=>{
      if(attempt!==version)return;
      if(data.type==='verifying'){watchdog();set('verify',{percent:data.percent});}
      else if(data.type==='loading'){watchdog();set('load');}
      else if(data.type==='ready'){clearTimeout(startupTimer);set('ready');}
      else if(data.type==='init-error'){if(data.reason==='digest'&&origin==='cache')void removeCache();fail(data.reason);}
      else if(job && job.id===data.id) {
        clearTimeout(cancelTimer);clearTimeout(startupTimer);const previous=job;job=null;set('ready');
        if(data.type==='answer')previous.resolve(data.text);
        else previous.reject(new Error(data.reason||'generation'));
      }
    };
    worker.postMessage({type:'init',file});
  }
  async function start(pickedFile=null){
    if(!supported()||['download','verify','load','ready','generate'].includes(state.phase))return;
    const attempt=++version;
    activeDownload=new AbortController();
    const signal=activeDownload.signal;
    set('download',{percent:0}); let writer;
    try {
      if(pickedFile){spawn(pickedFile,'file',attempt);return;}
      const local=await cached();if(signal.aborted)return;
      if(local){state.cached=true;spawn(local,'cache',attempt);return;}
      let dir;
      try{
        dir=await directory(true);
        const quota=await navigator.storage.estimate();
        if(quota.quota&&quota.usage!=null&&quota.quota-quota.usage<expected)throw new Error('storage');
        writer=await (await dir.getFileHandle(filename,{create:true})).createWritable();
      }catch{throw new Error('storage');}
      if(signal.aborted){await writer.abort();return;}
      const response=await fetch(downloadUrl,{signal,referrerPolicy:'no-referrer',credentials:'omit',cache:'no-store'});
      if(!response.ok||!response.body)throw new Error('download');
      const reader=response.body.getReader(); let count=0;
      while(true){
        if(signal.aborted)throw new Error('cancelled');
        const {done,value}=await reader.read();if(done)break;
        count+=value.byteLength;if(count>expected)throw new Error('size');
        await writer.write(value);const percent=Math.floor(100*count/expected);
        if(percent!==state.percent&&attempt===version)set('download',{percent});
      }
      if(count!==expected)throw new Error('size');
      await writer.close();writer=null;
      if(attempt!==version)return;
      const file=await cached();if(!file)throw new Error('storage');
      state.cached=true;spawn(file,'cache',attempt);
    } catch(error) {
      try{await writer?.abort();}catch{}
      if(attempt===version&&!signal.aborted)fail(error.name==='QuotaExceededError'?'storage':faults[error.message]?error.message:'download');
    } finally{if(attempt===version)activeDownload=null;}
  }
  function generate(input){
    if(!worker||state.phase!=='ready'||!input?.question||!input?.facts)return Promise.reject(new Error('not-ready'));
    const id=++serial;
    return new Promise((resolve,reject)=>{
      job={id,resolve,reject};
      set('generate');worker.postMessage({type:'generate',id,input});
      startupTimer=setTimeout(()=>fail('timeout'),150000);
    });
  }
  function cancel(){
    if(job&&worker){worker.postMessage({type:'cancel'});clearTimeout(cancelTimer);cancelTimer=setTimeout(stop,4000);}
  }
  document.addEventListener('click',event=>{
    const action=event.target.closest('[data-gen]')?.dataset.gen;
    if(action==='open')open();
    else if(action==='start')void start();
    else if(action==='cancel'||action==='unload')stop();
    else if(action==='abort')cancel();
    else if(action==='remove')void removeCache();
  });
  document.addEventListener('change',event=>{
    if(!event.target.matches('[data-gen-file]'))return;
    const file=event.target.files?.[0];if(file)void start(file);
  });
  window.addEventListener('pagehide',stop);
  window.addEventListener('hashchange',()=>{if(location.hash!=='#advisor')cancel();});
  window.MadarGen={open,renderControl,ready:()=>state.phase==='ready',generate,cancel,stop};
})();
