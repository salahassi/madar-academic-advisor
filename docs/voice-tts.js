/* Opt-in offline synthesis with the Emirati Piper voice, separate from the operating system's voices. */
(() => {
  'use strict';
  let phase='idle',progress=0,worker,ctx,source,seq=0,pending,ending,problem='';
  const ready=()=>phase==='ready'&&Boolean(worker);
  const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function control() {
    let inner='';
    if(phase==='loading') inner='<span role="status">تهيئة الصوت المحلي · '+progress+'٪</span><button type="button" class="btn" data-tts-command="cancel">إلغاء التنزيل</button>';
    else if(ready()) inner='<span>الصوت العربي المحلي جاهز</span><button type="button" class="btn" data-tts-command="preview">استمع إلى عيّنة</button>';
    else inner=(problem?'<small role="status">'+safe(problem)+'</small>':'')+'<button type="button" class="btn" data-tts-command="setup">تفعيل صوت عربي محلي</button><small>صوت إماراتي مولّد من Piper. يتطلب نحو ٩٣ م.ب. عند أول تحميل. تتم معالجة النص على جهازك.</small>';
    return '<div class="mad-voice-tts-control" style="display:grid;gap:7px;font-size:.85rem;margin-top:10px">'+inner+'<a href="assets/voice-tts/NOTICE.txt" target="_blank" rel="noopener" style="font-size:.76rem;text-decoration:underline">حقوق النموذج ومصادر الصوت</a></div>';
  }
  function update(notify=true) {
    document.querySelectorAll('.mad-voice-tts-control').forEach(el=>{el.outerHTML=control();});
    if(notify) window.dispatchEvent(new CustomEvent('madar-tts-state',{detail:{phase,ready:ready()}}));
  }
  function unlock() {
    const AC=window.AudioContext || window.webkitAudioContext;
    if(!AC) return Promise.reject(new Error('جهازك لا يدعم تشغيل الصوت المحلي.'));
    if(!ctx||ctx.state==='closed') ctx=new AC();
    return ctx.state==='running'?Promise.resolve():ctx.resume();
  }
  function stop() {
    ++seq;
    if(pending) {const end=pending.reject;pending=null;end(new DOMException('أُوقف النطق','AbortError'));}
    if(source) {try{source.onended=null;source.stop();source.disconnect();}catch(_){}source=null;}
    if(ending){const end=ending;ending=null;end(new DOMException('أُوقف النطق','AbortError'));}
  }
  function dispose() {
    stop();worker?.terminate();worker=null;phase='idle';progress=0;problem='';update();
  }
  function fail() {
    stop();worker?.terminate();worker=null;phase='error';problem='تعذّر تشغيل الصوت المحلي. تحقّق من الاتصال ومساحة الجهاز ثم أعد المحاولة.';update();
  }
  async function setup() {
    if(ready()||phase==='loading')return;
    unlock().catch(()=>{});
    phase='loading';progress=0;problem='';update();
    try {
      worker=new Worker('voice-tts-worker.js');const active=worker;
      worker.onmessage=({data})=>{
        if(worker!==active)return;
        if(data.type==='progress'){progress=data.percent;update(false);}
        else if(data.type==='ready'){phase='ready';progress=100;update();}
        else if(data.type==='error'){
          if(data.id && pending?.id===data.id){const end=pending.reject;pending=null;end(Error('تعذّر نطق هذه العبارة.'));}else if(!data.id) fail();
        }else if(data.type==='audio'&&pending?.id===data.id){const end=pending.resolve;pending=null;end(data.samples);}
      };
      worker.onerror=fail;worker.postMessage({type:'load'});
    }catch(_){fail();}
  }
  const arabicDigits='٠١٢٣٤٥٦٧٨٩';
  function sentences(text){
    const prepared=String(text).replace(/[A-Z]{1,8}\d{2,5}/gi,x=>x.replace(/[A-Z]+/gi,letters=>letters.toUpperCase().split('').map(c=>({'C':'سي','S':'إس','T':'تي','A':'إيه','M':'إم','H':'إتش','E':'إي','N':'إن','G':'جي','U':'يو','I':'آي','R':'آر','B':'بي','P':'بي','Y':'واي','L':'إل'}[c]||c)).join(' ')+' ')).replace(/[٠-٩]/g,d=>String(arabicDigits.indexOf(d)));
    const parts=prepared.match(/[^.!?؟؛،\n]+[.!?؟؛،]?/g)||[];
    const bounded=[];
    for(const part of parts){let current='';for(const word of part.trim().split(/\s+/)){if(current.length+word.length>165&&current){bounded.push(current);current='';}current+=(current?' ':'')+word;}if(current)bounded.push(current);}
    return bounded;
  }
  async function speak(text) {
    if(!ready()) throw Error('الصوت المحلي غير جاهز.');
    stop();const token=seq;
    await unlock();
    for(const line of sentences(text)){
      if(token!==seq) throw new DOMException('أُوقف النطق','AbortError');
      const id=String(token)+'-'+Math.random().toString(36).slice(2);
      const arr=await new Promise((resolve,reject)=>{pending={id,resolve,reject};worker.postMessage({type:'speak',text:line,id});});
      if(token!==seq) throw new DOMException('أُوقف النطق','AbortError');
      if(!arr.length)continue;
      const audio=ctx.createBuffer(1,arr.length,22050);audio.copyToChannel(arr,0);
      await new Promise((resolve,reject)=>{
        ending=reject;source=ctx.createBufferSource();source.buffer=audio;source.connect(ctx.destination);
        source.onended=()=>{if(token!==seq)return;source.disconnect();source=null;ending=null;resolve();};
        source.start();
      });
    }
  }
  document.addEventListener('click',event=>{
    const btn=event.target.closest?.('[data-tts-command]');
    if(!btn) return;
    if(btn.dataset.ttsCommand==='setup') setup();
    if(btn.dataset.ttsCommand==='cancel') dispose();
    if(btn.dataset.ttsCommand==='preview') speak('مرحبًا بك في مدار. يسعدني أن أساعدك في تخطيط دراستك.').catch(e=>{if(e.name!=='AbortError')window.UI?.toast('تعذّر تشغيل العيّنة على جهازك.');});
  });
  function cancelDownload(){if(phase==='loading') dispose();}
  window.MadarTTS={control,ready,setup,speak,stop,unlock,cancelDownload};
})();
