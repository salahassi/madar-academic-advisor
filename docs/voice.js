/* No model or microphone access until the student chooses local recognition. */
(() => {
  'use strict';
  let worker,ready=false,loading=false,busy=false,capture,serial=0,progress,readyResolve,failReject,replyResolve;
  const supported=()=>!!(window.Worker&&window.WebAssembly&&navigator.mediaDevices?.getUserMedia&&window.AudioWorkletNode&&(window.AudioContext||window.webkitAudioContext));
  function terminate(){
    worker?.terminate();worker=null;ready=false;busy=false;loading=false;
    if(failReject)failReject(new Error('canceled'));
    readyResolve=null;failReject=null;replyResolve=null;progress=null;
  }
  function cleanup(c) {
    if(!c||c.disposed)return;
    c.disposed=true;clearTimeout(c.timer);
    if(c.node)c.node.port.onmessage=null;
    for(const n of [c.node,c.source,c.mute]){try{n?.disconnect();}catch(_){/* Already disconnected. */}}
    for(const t of c.stream?.getTracks()||[])t.stop();
    if(c.context&&c.context.state!=='closed')void c.context.close().catch(()=>{});
  }
  function cancelTurn() {
    ++serial;
    if(capture){const c=capture;capture=null;cleanup(c);c.reject?.(new Error('canceled'));}
    if(busy)terminate();
  }
  function close(){cancelTurn();terminate();}
  function load(onProgress) {
    if(ready)return Promise.resolve();
    close();loading=true;progress=onProgress;
    return new Promise((resolve,reject)=>{
      readyResolve=resolve;failReject=reject;
      try{
        worker=new Worker('voice-whisper-worker.js',{type:'module',name:'madar-whisper'});
        const mine=worker;
        mine.onmessage=({data})=>{
          if(mine!==worker)return;
          if(data.type==='progress'){progress?.(data.file,data.loaded);}
          if(data.type==='ready'){loading=false;ready=true;const done=readyResolve;readyResolve=null;failReject=null;done?.();}
          if(data.type==='text'){busy=false;const done=replyResolve;replyResolve=null;failReject=null;done?.(data.text);}
          if(data.type==='error'){const fail=failReject;failReject=null;terminate();fail?.(new Error(data.detail||'model-error'));}
        };
        mine.onerror=()=>{if(mine===worker){const fail=failReject;failReject=null;terminate();fail?.(new Error('worker-error'));}};
        mine.postMessage({type:'load'});
      }catch(err){failReject=null;terminate();reject(err);}
    });
  }
  function resample(blocks,rate) {
    const length=blocks.reduce((total,b)=>total+b.length,0),full=new Float32Array(length);
    let pos=0;for(const block of blocks){full.set(block,pos);pos+=block.length;}
    if(rate===16000)return full;
    const output=new Float32Array(Math.floor(length*16000/rate));
    for(let i=0;i<output.length;i++){
      const from=Math.floor(i*rate/16000),to=Math.min(length,Math.max(from+1,Math.floor((i+1)*rate/16000)));
      let total=0;for(let j=from;j<to;j++)total+=full[j];output[i]=total/(to-from);
    }
    return output;
  }
  function record(callback) {
    const id=++serial;
    return new Promise((resolve,reject)=>{
      const c={blocks:[],frames:0,sound:0,silence:0,reject};capture=c;
      const valid=()=>id===serial&&capture===c&&!c.disposed;
      function finish(error) {
        if(!valid())return;
        const samples=error?null:resample(c.blocks,c.context.sampleRate);
        capture=null;cleanup(c);
        if(error)reject(new Error(error));else resolve(samples);
      }
      (async()=>{
        const Ctx=window.AudioContext||window.webkitAudioContext;
        c.context=new Ctx();
        const resumed=c.context.resume();
        resumed.catch(()=>{});
        const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,noiseSuppression:true,echoCancellation:true}});
        if(!valid()){stream.getTracks().forEach(t=>t.stop());return;}
        c.stream=stream;
        c.timer=setTimeout(()=>finish('capture-error'),9000);
        await resumed;
        if(!valid())return;
        await c.context.audioWorklet.addModule('voice-capture-worklet.js');
        if(!valid())return;
        c.source=c.context.createMediaStreamSource(stream);
        c.node=new AudioWorkletNode(c.context,'madar-microphone',{channelCount:1,channelCountMode:'explicit'});
        c.mute=c.context.createGain();c.mute.gain.value=0;
        c.source.connect(c.node);c.node.connect(c.mute);c.mute.connect(c.context.destination);
        clearTimeout(c.timer);callback('listening');c.timer=setTimeout(()=>finish(c.sound<.2?'no-speech':null),14000);
        c.node.port.onmessage=({data:block})=>{
          if(!valid())return;
          let energy=0;for(const x of block)energy+=x*x;
          const seconds=block.length/c.context.sampleRate,audible=Math.sqrt(energy/block.length)>.006;
          c.blocks.push(block);c.frames+=seconds;
          if(audible){c.sound+=seconds;c.silence=0;}else c.silence+=seconds;
          if(c.sound>=.20&&c.silence>=1.0)finish();
          else if(c.frames>7&&c.sound<.20)finish('no-speech');
          else if(c.frames>=12)finish();
        };
      })().catch(err=>{if(valid())finish(err.name==='NotAllowedError'?'not-allowed':err.name==='NotFoundError'?'audio-capture':'capture-error');});
    });
  }
  async function listen(callback) {
    if(!ready||!worker)throw new Error('not-ready');
    const capturePromise=record(callback),expected=serial;
    const samples=await capturePromise;
    if(expected!==serial||!ready||!worker)throw new Error('canceled');
    callback('transcribing');
    return new Promise((resolve,reject)=>{
      busy=true;replyResolve=resolve;failReject=reject;
      try{worker.postMessage({type:'infer',audio:samples},[samples.buffer]);}
      catch(err){failReject=null;terminate();reject(err);}
    });
  }
  window.MadarWhisper={supported,load,listen,cancelTurn,close,isReady:()=>ready,isLoading:()=>loading};
})();

/* Voice conversations, local response voices and Arabic device voices. */
(() => {
  'use strict';

  const recognitionConstructor = () => window.SpeechRecognition || window.webkitSpeechRecognition;
  const speech = () => window.speechSynthesis;
  const profileId = () => window.Madar.getProfile().id;
  const nextFrame = fn => window.requestAnimationFrame(fn);
  let dialog;
  let session;
  let sequence = 0;
  let recognizer;
  let utterance;
  let timer;
  let speakingTimer;
  let navigationObserver;
  let rejectDeviceLine;
  let voicePreference = 'natural';
  const voicePreferenceKey = 'madar-arabic-reply-voice-v2';
  const sampleText = 'أهلًا بك في مدار. عندك اليوم محاضرتان، وتبدأ المحاضرة الأولى الساعة التاسعة صباحًا.';
  try { voicePreference = localStorage.getItem(voicePreferenceKey) || 'natural'; } catch (_) {}
  const html = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const deviceKey = voice => 'device:' + (voice.voiceURI || voice.name) + '|' + voice.lang;
  function naturalMode() {
    if(voicePreference==='natural')return 'studio';
    if(voicePreference==='natural-light')return 'light';
    return null;
  }
  function selectEngine(){
    const mode=naturalMode();
    if(mode)window.MadarNatural?.select?.(mode);
    return mode;
  }
  function voiceHint(){
    const mode=naturalMode();
    if(mode==='studio')return 'العينة فورية. حجم الصوت عند أول محادثة نحو ١٤٩ م.ب.';
    if(mode==='light')return 'العينة فورية. حجم الصوت عند أول محادثة نحو ٣٦ م.ب.';
    if(voicePreference==='piper')return window.MadarTTS?.ready() ? 'الصوت الإماراتي جاهز على جهازك.' : 'فعّل الصوت الإماراتي من الإعدادات أدناه.';
    return 'يستخدم مدار الصوت العربي الذي اخترته من جهازك.';
  }
  function arabicVoices() {
    const rank = voice => (/natural|neural|premium|wavenet|enhanced|عصبي|محسن|طبيعي/i.test(voice.name) ? 8 : 0)
      + (/^ar[-_]SA$/i.test(voice.lang) ? 2 : 0);
    return (speech()?.getVoices() || [])
      .filter(v=>/^ar(?:[-_]|$)/i.test(v.lang))
      .sort((a,b)=>rank(b)-rank(a) || String(a.name).localeCompare(String(b.name),'ar'));
  }
  function refreshVoices() {
    if(!dialog||!session)return;
    const selector=find('.mv-voice-select');
    const voices=arabicVoices();
    const options=['<option value="natural">مدار · صوت المرشد</option><option value="natural-light">مدار · الصوت الخفيف</option>'];
    if(voices.length) options.push('<optgroup label="أصوات الجهاز">'+voices.map(v=>'<option value="'+html(deviceKey(v))+'">'+html(v.name)+' · '+html(v.lang)+'</option>').join('')+'</optgroup>');
    if(voicePreference.startsWith('device:')&&!voices.some(v=>deviceKey(v)===voicePreference)){
      options.push('<option disabled value="'+html(voicePreference)+'">صوت الجهاز المختار غير متاح</option>');
    }
    if(window.MadarTTS) options.push('<option value="piper">صوت إماراتي محلي</option>');
    selector.innerHTML=options.join('');
    selector.value=voicePreference;
    find('.mv-voice-hint').textContent=voiceHint();
    find('.mv-voice-license').hidden=naturalMode()!=='studio';
    const piper=voicePreference==='piper';
    find('.mv-voice-prefs').hidden=!piper;
    if(piper) find('.mv-tts-options').innerHTML=window.MadarTTS?.control()||'';
  }
  function saveVoice(value) {
    voicePreference=value;
    try{localStorage.setItem(voicePreferenceKey,value);}catch(_){}
    if(!naturalMode())window.MadarNatural?.release?.();
    selectEngine();
    pause('تم اختيار صوت الرد','يمكنك سماع العيّنة قبل بدء المحادثة.');
    refreshVoices();
    find('.mv-voice-prefs').open=value==='piper';
  }

  const glyph = {
    mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1M12 18v4m-4 0h8"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    stop:'<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
    speech:'<path d="M10 17H7l-4 3v-5a3 3 0 0 1-1-2V7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4M7 9h8m-8 3h3"/><path d="M14 18v-2m3 4v-6m3 5v-4m3 2h0"/>',
    volume:'<path d="m3 9 4 0 5-4v14l-5-4H3zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>'
  };
  const svg = name => '<svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+glyph[name]+'</svg>';
  const find = selector => dialog.querySelector(selector);
  const stillHere = token => !!(session && session.token===token && dialog.open && session.profile===profileId());
  const active = token => stillHere(token) && session.running;
  const stopEvents = r => {r.onresult=null;r.onerror=null;r.onend=null;r.onstart=null;};

  function releaseAudio() {
    clearTimeout(timer);clearTimeout(speakingTimer);
    window.MadarWhisper.cancelTurn();
    window.MadarNatural?.stop();
    window.MadarTTS?.stop();
    if(recognizer){
      const r=recognizer;recognizer=null;stopEvents(r);
      try{r.abort();}catch(_){/* The recognizer may already be closed. */}
    }
    if(utterance){
      utterance.onend=null;utterance.onerror=null;utterance=null;
      try{speech().cancel();}catch(_){/* The system voice service may have gone away. */}
    }
    if(rejectDeviceLine){
      const reject=rejectDeviceLine;rejectDeviceLine=null;
      reject(new DOMException('أُوقف الصوت','AbortError'));
    }
  }
  function setStatus(phase, title, detail) {
    if(!session||!dialog.open)return;
    session.phase=phase;
    const area=find('.mv-stage');
    area.dataset.phase=phase;
    find('.mv-state').textContent=title;
    find('.mv-detail').textContent=detail||'';
    find('.mv-toggle').innerHTML=svg(session.running?'stop':'mic')+(session.running?'إيقاف المحادثة':session.started?'استئناف الصوت':'بدء المحادثة الصوتية');
    find('.mv-toggle').disabled=(!session.running&&!recognitionConstructor()&&!window.MadarWhisper.isReady())||phase==='downloading'||(phase==='thinking'&&!session.running);
    find('.mv-interrupt').hidden=!['speaking','preparing','review'].includes(phase)||(!recognitionConstructor()&&!window.MadarWhisper.isReady());
    find('.mv-replay').hidden=!session.lastReply||['speaking','preparing','preview','thinking','downloading','connecting','listening','transcribing','review'].includes(phase);
    find('.mv-interrupt').textContent=phase==='review'?'إعادة التسجيل':'مقاطعة الرد والتحدث';
    find('.mv-form button').disabled=phase==='thinking';
    const sampling=phase==='preview';
    const example=find('.mv-sample');
    example.innerHTML=svg(sampling?'stop':'volume')+(sampling?'إيقاف العيّنة':'استمع إلى عيّنة');
    example.disabled=phase==='downloading'||phase==='thinking';
    example.setAttribute('aria-pressed',String(sampling));

  }
  function pause(title='المحادثة متوقفة', detail='يمكنك استئناف الصوت أو كتابة سؤالك.') {
    if(!session)return;
    if(session.running&&naturalMode()&&!window.MadarNatural?.ready?.())window.MadarNatural?.release?.();
    session.running=false;
    session.token=++sequence;
    if(window.MadarWhisper.isLoading()){window.MadarWhisper.close();find('.mv-local-button').textContent='تنزيل وتشغيل النموذج المحلي';}
    releaseAudio();
    setStatus('paused',title,detail);
  }
  function stop() {
    if(!session)return;
    session.running=false;
    navigationObserver?.disconnect();
    window.MadarTTS?.cancelDownload?.();
    window.MadarWhisper.close();
    if(!window.MadarNatural?.ready?.())window.MadarNatural?.release?.();
    ++sequence;
    releaseAudio();
    session=null;
    if(dialog.open)dialog.close();
  }
  function appendTurn(label, text, student) {
    const block=document.createElement('div');block.className='mv-turn '+(student?'student':'advisor');
    const title=document.createElement('b');title.textContent=label;
    const content=document.createElement('p');content.textContent=text;
    block.append(title,content);
    find('.mv-log').appendChild(block);
    nextFrame(()=>{if(dialog.open){const log=find('.mv-log');log.scrollTop=log.scrollHeight;}});
  }
  function textOnly(note) {
    pause('الرد متاح للقراءة',note+' يمكنك متابعة الإرشاد كتابةً أو استئناف الاستماع.');
  }
  function unlockVoice() {
    const engine=selectEngine()?window.MadarNatural:voicePreference==='piper'?window.MadarTTS:null;
    if(engine?.unlock) {
      try{Promise.resolve(engine.unlock()).catch(()=>{});}catch(_){/* The playback action reports errors. */}
    }
  }
  function nativeLines(text) {
    const phrases=text.match(/[^.!?؟؛،\n]+[.!?؟؛،]?/g) || [];
    const result=[];let line='';
    for(const phrase of phrases){
      const part=phrase.trim();if(!part)continue;
      if(line && line.length+part.length>155){result.push(line);line='';}
      for(const word of part.split(/\s+/)){
        if(line && line.length+word.length>165){result.push(line);line='';}
        line+=(line?' ':'')+word;
      }
    }
    if(line)result.push(line);
    return result;
  }
  function deviceLine(voice,line) {
    return new Promise((resolve,reject)=>{
      if(!window.SpeechSynthesisUtterance || !speech()){reject(Error('لا يدعم الجهاز هذا الصوت.'));return;}
      const item=new window.SpeechSynthesisUtterance(line);
      utterance=item;rejectDeviceLine=reject;item.voice=voice;item.lang=voice.lang;item.rate=.97;
      const finish=error=>{
        if(utterance!==item)return;
        clearTimeout(speakingTimer);utterance=null;rejectDeviceLine=null;
        item.onend=null;item.onerror=null;
        if(error){try{speech().cancel();}catch(_){}reject(error);}else resolve();
      };
      item.onend=()=>finish();item.onerror=()=>finish(Error('تعذّر النطق بالصوت المحدد على الجهاز.'));
      speakingTimer=setTimeout(()=>finish(Error('لم يستجب صوت الجهاز المحدد.')),32000);
      try{speech().speak(item);}catch(error){finish(error);}
    });
  }
  async function playVoice(text,token,sample=false) {
    if(!stillHere(token))return;
    const norm=sample?sampleText:(window.MadarSpoken?.prepare(text)||text);
    if(!norm.trim())throw Error('لا تتضمن الإجابة نصًا صالحًا للقراءة.');
    if(selectEngine()){
      const engine=window.MadarNatural;
      if(!engine || (!sample&&!engine.supported()))throw Error('صوت مدار غير متاح في هذا المتصفح. يمكنك اختيار صوت عربي من القائمة.');
      if(sample){await engine.preview();return;}
      const progress=value=>{
        if(stillHere(token)&&session.phase==='preparing'&&Number.isFinite(value))
          find('.mv-detail').textContent='تجهيز الصوت على الجهاز · '+Math.max(0,Math.min(100,Math.round(value*100)))+'٪';
      };
      setStatus('preparing','يُجهّز مدار الصوت','يعتمد وقت التجهيز الأول على سرعة الاتصال.');
      await engine.prepare({onProgress:progress});
      if(!stillHere(token))return;
      setStatus('speaking','المرشد يجيب','يمكنك مقاطعة الرد للانتقال إلى سؤالك التالي.');
      await engine.speak(norm);
      return;
    }
    if(voicePreference==='piper'){
      if(!window.MadarTTS?.ready())throw Error('فعّل الصوت الإماراتي من خياراته، أو اختر صوت مدار.');
      await window.MadarTTS.speak(norm);return;
    }
    const v=arabicVoices().find(voice=>deviceKey(voice)===voicePreference);
    if(!v)throw Error('صوت الجهاز المختار غير متاح. اختر صوت مدار أو صوتًا عربيًا آخر.');
    for(const line of nativeLines(norm)){
      if(!stillHere(token))return;
      await deviceLine(v,line);
    }
  }
  function playbackError(error) {
    if(error?.name==='NotAllowedError')return 'اسمح بالتشغيل الصوتي أو اضغط زرّ الاستماع مجددًا.';
    return /[\u0600-\u06ff]/.test(error?.message||'')?error.message:'تعذّر تشغيل الصوت المحدد. أعد المحاولة أو اختر صوتًا عربيًا آخر.';
  }
  async function sampleVoice(){
    if(!session)return;
    if(session.phase==='preview'){pause('توقفت العيّنة','يمكنك بدء المحادثة أو اختيار صوت آخر.');return;}
    pause();unlockVoice();
    const token=session.token;
    setStatus('preview','عيّنة من صوت المرشد',sampleText);
    try{
      await playVoice(sampleText,token,true);
      if(stillHere(token))setStatus('idle','جاهز للمحادثة','اضغط بدء المحادثة عندما تكون مستعدًا.');
    }catch(error){
      if(stillHere(token))pause('تعذّر تشغيل العيّنة',playbackError(error));
    }
  }
  async function speakReply(token, reply, listenAfter=true) {
    if(!active(token))return;
    setStatus('speaking','المرشد يجيب',listenAfter?'سأستمع إلى سؤالك التالي بعد انتهاء الرد.':'أقرأ لك آخر رد من المرشد.');
    try{
      await playVoice(reply,token);
      if(!active(token))return;
      if(listenAfter)timer=setTimeout(()=>{if(active(token))listen(token);},300);
      else pause('اكتملت قراءة الرد','يمكنك كتابة سؤال آخر أو بدء محادثة صوتية.');
    }catch(error){
      if(active(token))textOnly(playbackError(error));
    }
  }
  async function submitTurn(raw, useVoice) {
    const text=String(raw||'').trim().slice(0,650);
    if(!text||!session)return;
    const token=session.token;
    appendTurn('أنت',text,true);
    setStatus('thinking','المرشد يراجع سؤالك','يستعين بملفك الأكاديمي وخطتك الدراسية.');
    try{
      const result=await window.Advisor.ask(text,{voice:true});
      if(!stillHere(token))return;
      const reply=typeof result==='string'?result.trim():'';
      if(!reply){pause('افتح نص المحادثة لعرض النتيجة','يمكنك مراجعة الخيارات والإجراءات المقترحة هناك.');return;}
      session.lastReply=reply;appendTurn('مرشد مدار',reply,false);
      if(useVoice&&active(token))speakReply(token,reply);
      else setStatus('paused','وصل رد المرشد','يمكنك إرسال سؤال آخر أو بدء الصوت.');
    }catch(_){
      if(stillHere(token))pause('تعذّر إكمال الرد','أعد إرسال سؤالك أو انتقل إلى محادثة المرشد.');
    }
  }
  const errors={
    'not-allowed':['لم يُسمح باستخدام الميكروفون','اسمح للموقع باستخدام الميكروفون من إعدادات المتصفح، أو اكتب سؤالك أدناه.'],
    'service-not-allowed':['خدمة التعرّف على الكلام غير متاحة','يمكنك استخدام المحادثة النصية أو تجربة متصفح يدعم التعرّف على الكلام بالعربية.'],
    'audio-capture':['تعذّر التقاط الصوت','تحقّق من توصيل الميكروفون واختياره في إعدادات الجهاز.'],
    'no-speech':['لم يصل صوت واضح','اضغط استئناف الصوت وحاول التحدث مجددًا.'],
    'network':['تعذّر الاتصال بخدمة التعرّف على الصوت','تحقّق من اتصال الجهاز أو اكتب سؤالك أدناه.'],
    'language-not-supported':['التعرّف على العربية غير متاح','جرّب متصفحًا يدعم العربية أو اكتب سؤالك.']
  };
  function warmVoice() {
    if(session.warmed||!naturalMode()||!window.MadarNatural?.supported())return;
    session.warmed=true;
    void window.MadarNatural.prepare({}).catch(()=>{});
  }
  function listen(token) {
    if(!active(token))return;
    if(session.local&&window.MadarWhisper.isReady()){
      setStatus('connecting','جاري تشغيل الميكروفون','سيبقى الصوت على هذا الجهاز.');
      window.MadarWhisper.listen(stage=>{
        if(!active(token))return;
        if(stage==='listening'){
          warmVoice();
          setStatus('listening','أستمع إليك على جهازك','تحدث في جملة قصيرة ثم توقف قليلًا.');
        }
        else setStatus('transcribing','جارٍ تفريغ كلامك على الجهاز','ستتمكن من مراجعة النص قبل إرساله للمرشد.');
      }).then(text=>{
        if(!active(token))return;
        if(!text){pause(...errors['no-speech']);return;}
        find('#mv-question').value=text;
        setStatus('review','راجع النص ثم اضغط إرسال','يمكنك تعديل أسماء المقررات أو الأرقام قبل أن يجيبك المرشد.');
      }).catch(error=>{
        if(!active(token))return;
        pause(...(errors[error.message]||['تعذّر التفريغ على الجهاز','يمكنك إعادة المحاولة أو كتابة السؤال أدناه.']));
      });
      return;
    }
    const Recognizer=recognitionConstructor();
    if(!Recognizer){pause('التعرّف على الصوت غير متاح','اكتب سؤالك أدناه.');return;}
    let r;
    try{r=new Recognizer();}catch(_){pause('تعذّر تشغيل خدمة الصوت','اكتب سؤالك أدناه أو جرّب متصفحًا آخر.');return;}
    let finalText='';
    recognizer=r;r.lang='ar-SA';r.interimResults=true;r.continuous=false;r.maxAlternatives=1;
    setStatus('connecting','جاري تشغيل الميكروفون','انتظر إشارة الاستماع قبل التحدث.');
    const current=()=>recognizer===r&&active(token);
    r.onstart=()=>{
      if(!current())return;
      warmVoice();
      setStatus('listening','أستمع إليك','اسأل عن مقرر أو جدولك الدراسي أو معدلك.');
    };
    function finish(){
      if(!current())return;
      clearTimeout(timer);stopEvents(r);recognizer=null;
      try{r.abort();}catch(_){/* Already ended. */}
      if(finalText) void submitTurn(finalText,true);
      else pause(...errors['no-speech']);
    }
    r.onresult=e=>{
      if(!current()||finalText)return;
      const values=Array.from(e.results);
      finalText=values.filter(x=>x.isFinal).map(x=>x[0].transcript).join(' ').trim();
      const interim=values.map(x=>x[0].transcript).join(' ').trim();
      if(interim)find('.mv-detail').textContent=interim;
      if(finalText){
        timer=setTimeout(finish,700);
        try{r.stop();}catch(_){finish();}
      }
    };
    r.onend=finish;
    r.onerror=ev=>{if(current())pause(...(errors[ev.error]||['توقّف التعرّف على الصوت','استأنف الجلسة أو اكتب سؤالك أدناه.']));};
    try{r.start();}catch(_){pause('تعذّر تشغيل الميكروفون','تحقّق من إذن الميكروفون ثم استأنف، أو اكتب سؤالك.');}
  }
  function begin(){
    if(!session||(!recognitionConstructor()&&!window.MadarWhisper.isReady()))return;
    releaseAudio();
    unlockVoice();session.started=true;session.running=true;session.token=++sequence;
    session.warmed=false;
    listen(session.token);
  }
  async function enableLocal(){
    const local=window.MadarWhisper;
    if(!session||!local.supported())return;
    const button=find('.mv-local-button');
    if(local.isLoading()){
      local.close();session.local=false;pause('أُلغي التنزيل','يمكنك استخدام صوت المتصفح أو المحادثة النصية.');
      button.textContent='تنزيل وتشغيل النموذج المحلي';return;
    }
    if(session.local&&local.isReady()){
      pause();session.local=false;local.close();button.textContent='تنزيل وتشغيل النموذج المحلي';
      setStatus('idle','تم إيقاف نموذج الجهاز','يمكنك استخدام ميكروفون المتصفح المدعوم أو كتابة سؤالك.');return;
    }
    pause();const token=session.token,files=new Map();
    setStatus('downloading','جارٍ تجهيز Whisper على الجهاز','قد يستغرق التنزيل الأول بعض الوقت.');button.textContent='إلغاء التنزيل';
    try{
      await local.load((file,loaded)=>{
        if(!stillHere(token))return;
        files.set(file,Number(loaded)||0);
        const bytes=Array.from(files.values()).reduce((a,b)=>a+b,0);
        find('.mv-detail').textContent='تم استلام '+(bytes/1000000).toFixed(1)+' م.ب من ملفات النموذج.';
      });
      if(!stillHere(token))return;
      session.local=true;button.textContent='إيقاف النموذج المحلي';
      setStatus('idle','التعرّف المحلي جاهز','اضغط بدء الصوت. سيُعالج كلامك على الجهاز ويمكنك مراجعة التفريغ.');
    }catch(_){
      if(!stillHere(token))return;
      session.local=false;button.textContent='إعادة تنزيل النموذج المحلي';
      setStatus('paused','تعذّر تشغيل نموذج Whisper','تحقّق من الاتصال ومساحة المتصفح المتاحة، أو استخدم الكتابة.');
    }
  }
  function createDialog() {
    const d=document.createElement('dialog');
    d.className='madar-voice';d.dir='rtl';d.setAttribute('aria-labelledby','mv-title');
    d.innerHTML='<header class="mv-header"><span class="mv-head-icon">'+svg('speech')+'</span><div><h2 id="mv-title">المرشد الصوتي</h2><small>محادثة بالعربية</small></div><button class="mv-close" type="button" aria-label="إغلاق المحادثة الصوتية">'+svg('close')+'</button></header>'+
      '<div class="mv-body"><section class="mv-stage"><div class="mv-orb">'+svg('mic')+'</div><div class="mv-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><h3 class="mv-state" role="status"></h3><p class="mv-detail"></p><div class="mv-controls"><button class="mv-toggle" type="button"></button><button type="button" class="mv-interrupt" hidden>مقاطعة الرد والتحدث</button></div></section>'+
      '<div class="mv-voice-choice"><div><label for="mv-voice-select">صوت الرد</label><select class="mv-voice-select" id="mv-voice-select" aria-describedby="mv-voice-hint"></select></div><button type="button" class="mv-sample" aria-pressed="false">'+svg('volume')+'استمع إلى عيّنة</button></div><p class="mv-voice-note"><span class="mv-voice-hint" id="mv-voice-hint"></span> <a class="mv-voice-license" href="assets/voice-studio/MODEL-LICENSE.txt" target="_blank" rel="noopener" hidden>ترخيص الصوت</a></p>'+
      '<details class="mv-local mv-voice-prefs" hidden><summary>إعداد الصوت الإماراتي</summary><div class="mv-tts-options"></div></details>'+
      '<p class="mv-privacy">عند بدء الصوت سيطلب المتصفح إذن الميكروفون، وقد يرسل الصوت إلى خدمة التعرّف التابعة له. تُضاف الأسئلة والردود إلى سجل محادثتك في مدار.</p>'+
      '<details class="mv-local mv-asr-prefs"><summary>التعرّف على الكلام على جهازي</summary><p>يمكن تنزيل نموذج Whisper Tiny متعدد اللغات من Hugging Face للتعرّف على العربية محليًا. ملفات النموذج ٤٣٬٦٢٢٬١٢٧ بايت (٤٣٫٦ م.ب)، ويضاف عند التشغيل نحو ١٠ إلى ١١ م.ب للمحرك. يبقى صوت الميكروفون على الجهاز في هذا الوضع.</p><button class="mv-local-button" type="button">تنزيل وتشغيل النموذج المحلي</button></details>'+
      '<button type="button" class="mv-replay" hidden>'+svg('volume')+'استمع إلى آخر رد</button>'+
      '<div class="mv-log" aria-label="نص المحادثة الصوتية" role="log"></div>'+
      '<form class="mv-form"><label for="mv-question">أو اكتب سؤالك</label><div><input id="mv-question" maxlength="650" autocomplete="off" placeholder="مثلًا، كيف يؤثر تأجيل مقرر على خطتي؟"><button type="submit">إرسال</button></div></form>'+
      '<button class="mv-chat" type="button">عرض المحادثة وخيارات التسجيل</button></div>';
    document.body.appendChild(d);
    d.querySelector('.mv-close').onclick=stop;
    d.querySelector('.mv-sample').onclick=sampleVoice;
    d.querySelector('.mv-voice-select').onchange=e=>saveVoice(e.target.value);
    speech()?.addEventListener?.('voiceschanged',refreshVoices);
    d.querySelector('.mv-replay').onclick=()=>{
      if(!session?.lastReply)return;
      releaseAudio();unlockVoice();session.running=true;session.token=++sequence;
      speakReply(session.token,session.lastReply,false);
    };
    d.querySelector('.mv-local-button').onclick=enableLocal;
    d.querySelector('.mv-chat').onclick=()=>{stop();window.UI.go('advisor');};
    d.querySelector('.mv-toggle').onclick=()=>{if(session?.running)pause();else begin();};
    d.querySelector('.mv-interrupt').onclick=()=>{if(session?.running){releaseAudio();session.token=++sequence;listen(session.token);}};
    d.querySelector('.mv-form').onsubmit=e=>{
      e.preventDefault();
      if(!session||session.phase==='thinking')return;
      const input=find('#mv-question'),text=input.value.trim();if(!text)return;
      const voiced=session.running&&session.phase==='review';
      if(!voiced)pause();input.value='';void submitTurn(text,voiced);
    };
    d.addEventListener('cancel',e=>{e.preventDefault();stop();});
    d.addEventListener('close',()=>{if(session&&!d.open)stop();});
    return d;
  }
  function open() {
    if(session&&dialog?.open)return;
    if(location.hash!=='#advisor')window.UI.go('advisor');
    if(!dialog)dialog=createDialog();
    session={token:++sequence,running:false,started:false,phase:'idle',profile:profileId()};
    find('.mv-log').replaceChildren();find('#mv-question').value='';
    dialog.showModal();
    selectEngine();refreshVoices();
    find('.mv-asr-prefs').hidden=!window.MadarWhisper.supported();find('.mv-asr-prefs').open=false;
    find('.mv-voice-prefs').open=voicePreference==='piper';
    find('.mv-local-button').textContent='تنزيل وتشغيل النموذج المحلي';
    const page=document.getElementById?.('page');
    if(window.MutationObserver&&page){
      navigationObserver??=new window.MutationObserver(stopIfLeaving);
      navigationObserver.observe(page,{childList:true});
    }
    if(recognitionConstructor()){
      setStatus('idle','جاهز للمحادثة','جرّب صوت المرشد أو ابدأ المحادثة مباشرة.');
    }else{
      setStatus('unsupported','الكتابة متاحة على هذا المتصفح','يمكنك كتابة سؤالك أدناه.'+(window.MadarWhisper.supported()?' أو اختر التعرّف على الكلام على جهازك لتنزيل النموذج المحلي.':''));
    }
  }
  function stopIfLeaving() {if(session&&(location.hash!=='#advisor'||profileId()!==session.profile))stop();}
  window.addEventListener('hashchange',stopIfLeaving);
  window.addEventListener('popstate',stopIfLeaving);
  window.addEventListener('pagehide',stop);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden||!session)return;window.MadarTTS?.stop();if(session.running||session.phase==='preview')pause('تم إيقاف الصوت','استأنف المحادثة عند عودتك إلى الصفحة.');});
  document.addEventListener('click',e=>{
    if(!session)return;
    if(e.target.closest('.nav-link,.brand,[data-go],[data-profile]')){stop();return;}
    if(session.running&&e.target.closest('[data-tts-command="preview"]'))pause('تجربة الصوت المحلي','يمكنك استئناف المحادثة بعد سماع العينة.');
  },true);
  window.MadarVoice={open,stop};
})();
