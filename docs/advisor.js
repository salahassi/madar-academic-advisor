(() => {
  'use strict';
  const M = () => window.Madar;
  const U = () => window.UI;
  const esc = value => U().esc(String(value ?? ''));
  const icon = (name, size = 20) => U().icon(name, size);
  const ar = (value, digits = 0) => Number(value).toLocaleString('ar-SA', { maximumFractionDigits: digits });
  const state = new Map();
  const key = id => 'madar.advisor.v2.' + id;
  const normalize = text => String(text || '').toLowerCase().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/٫/g, '.').replace(/[,،]/g, ' ').trim();
  function messages() {
    const id = M().getProfile().id;
    if (!state.has(id)) {
      try {
        const stored = JSON.parse(localStorage.getItem(key(id)) || '[]');
        state.set(id, Array.isArray(stored) ? stored.filter(x => x && ['student','advisor'].includes(x.role)).slice(-60) : []);
      } catch { state.set(id, []); }
    }
    return state.get(id);
  }
  function persist() {
    const id = M().getProfile().id;
    const items = messages().slice(-60);
    state.set(id, items);
    try { localStorage.setItem(key(id), JSON.stringify(items)); } catch {}
  }
  function note(role, data) { messages().push({role, time:Date.now(), ...data}); }
  function reply(title, body = [], actions = [], choices = [], code = '') {
    const references=choices.map(x=>x.ref).filter(Boolean);
    return {title, body, actions, choices, code, ...(references.length?{references}:{})};
  }
  const say = (label, text = label) => ({label, kind:'ask', value:text});
  const go = (label, value) => ({label, kind:'go', value});
  const operation = (label, kind, course, section = '') => ({label, kind:'change', value:kind, course, section});
  const labels = {registered:'مسجّل', eligible:'مؤهّل للتسجيل', locked:'له متطلبات غير مكتملة', completed:'مجتاز'};
  function matchCourse(raw) {
    const school = M();
    const text = normalize(raw);
    const compact = text.replace(/[^a-z0-9]/g, '');
    const byCode = school.courses.find(c => compact.includes(c.code.toLowerCase().replace(/[^a-z0-9]/g,'')));
    if (byCode) return byCode;
    const exact = school.courses.find(c => text.includes(normalize(c.name)));
    if (exact) return exact;
    const tokens = text.split(/[^\u0621-\u064aa-z0-9]+/).filter(Boolean).map(s => s.replace(/^(?:وال|بال|لل|ال)/,''));
    const ignore = new Set(['مدخل','مبادئ','تطبيقات','اساسيات','انظمه','نظم','علوم','مقدمه','تحليل','الاول','الثاني','هندسه','تصميم','اداره','لغه','برمجه','مهارات']);
    const ranked = school.courses.map(c => {
      const words = normalize(c.name).split(/\s+/).map(s => s.replace(/^(?:وال|بال|لل|ال)/,''));
      let score = 0;
      for (const word of words) if (word.length > 2 && tokens.includes(word)) score += ignore.has(word) ? 0.45 : 2;
      return {c,score};
    }).filter(x => x.score >= 2).sort((a,b) => b.score - a.score);
    if (ranked.length && (!ranked[1] || ranked[0].score > ranked[1].score)) return ranked[0].c;
    if (/(?:احذفها|بدلها|اضفها|اسجلها|سجلها|هذا المقرر|هذه الماده|نفس الماد|الشعبه الثانيه|والشعبه|الخيار الثاني)/.test(text) && !/المقررات|المواد/.test(text)) {
      for (const msg of [...messages()].reverse()) if (msg.role === 'advisor' && msg.code) return school.course(msg.code);
    }
    return null;
  }
  function eligible() {
    return M().courses.filter(c => M().status(c.code) === 'eligible' && c.sections.some(s=>M().preview('add',c.code,s.id).ok)).sort((a,b) => a.term-b.term || a.code.localeCompare(b.code));
  }
  function offered(c, replace) {
    return c.sections.filter(s=>M().preview(replace ? 'swap' : 'add',c.code,s.id).ok && (!replace || M().getProfile().registration[c.code] !== s.id));
  }
  const sectionLine = s => s.days.map(i=>M().days[i]).join(' و') + '، ' + s.start + '–' + s.end;
  function details(c) {
    const current = M().status(c.code);
    const requirement = c.prereqs.length ? c.prereqs.map(code=>M().course(code)?.name || code).join('، ') : 'لا توجد متطلبات سابقة';
    const actions = [go('عرض الخطة','plan')];
    if (current === 'registered') actions.unshift(say('أثر حذف المقرر','ما أثر حذف ' + c.code + '؟'),say('بدائل الشعبة','بدّل شعبة ' + c.code));
    if (current === 'eligible') actions.unshift(say('استعرض الشُّعب','أريد تسجيل ' + c.code));
    return reply(c.name + ' · ' + c.code,[c.description || '', 'الحالة في سجلك: '+labels[current]+'، '+ar(c.credits)+' ساعات.','المتطلبات السابقة: '+requirement+'.'],actions,[],c.code);
  }
  function changes(c, kind) {
    if (!c) {
      const list = kind === 'add' ? eligible() : M().courses.filter(x=>M().status(x.code) === 'registered');
      if (!list.length) return reply('لا توجد مقررات مناسبة لهذا الإجراء حاليًا.',[],[go('راجع التسجيل','register')]);
      const phrase = {add:'سجّل', drop:'ما أثر حذف', swap:'بدّل شعبة'}[kind];
      const offeredCourses=list.slice(0,6);
      return {...reply('أي مقرر تقصد؟',['اختر مقررًا بالاسم أو بترتيبه لأراجع سجلك.'],offeredCourses.map(x=>say(x.name,phrase+' '+x.code))),
        references:offeredCourses.map(x=>({type:'course',code:x.code}))};
    }
    if (kind === 'drop') {
      const result = M().preview('drop',c.code);
      const successorList = (result.successors || []).filter(x=>M().status(x.code) !== 'completed');
      const body = result.ok ? [result.impact,'يتغير العبء المسجّل من '+ar(result.before)+' إلى '+ar(result.after)+' ساعة.'] : [result.message];
      if (successorList.length && result.ok) body.push('مقررات لاحقة تتأثر بترتيب هذا المتطلب: '+successorList.slice(0,4).map(x=>x.name).join('، ')+'.');
      return reply('أثر حذف '+c.name,body,result.ok ? [operation('مراجعة الحذف','drop',c.code),say('هل أستطيع تغيير الشعبة؟','بدّل شعبة '+c.code)] : [go('راجع خطتي','plan')],[],c.code);
    }
    if (kind === 'add' && M().status(c.code) === 'registered') return details(c);
    if (kind === 'add' && M().status(c.code) === 'completed') return reply('سبق لك اجتياز '+c.name,['يظهر هذا المقرر في الساعات المجتازة من سجلك الحالي.'],[go('مراجعة الخطة','plan')],[],c.code);
    if (kind === 'add' && M().status(c.code) === 'locked') {
      const missing=c.prereqs.filter(code=>!M().getProfile().completed.includes(code)).map(code=>M().course(code));
      return reply('تحتاج إلى إكمال متطلبات '+c.name+' أولًا.',['المتطلبات التي لم تُجتز بعد: '+missing.map(x=>x.name+' ('+x.code+')').join('، ')+'.'],[go('مراجعة تسلسل الخطة','plan')],[],c.code);
    }
    if (kind === 'swap' && M().status(c.code) !== 'registered') return reply('المقرر غير مسجّل في جدولك.',[],[say('تحقّق من التسجيل','سجّل '+c.code)],[],c.code);
    const choices = offered(c,kind === 'swap').slice(0,4);
    if (!choices.length) {
      const checked = c.sections.filter(s=>s.id !== M().getProfile().registration[c.code]).map(s=>M().preview(kind,c.code,s.id));
      return reply('لا تتوفر شعبة مناسبة لـ'+c.name,[checked[0]?.message || 'لا توجد شعبة بديلة مطروحة لهذا المقرر.'],[go('استكشف التسجيل','register')],[],c.code);
    }
    return reply(kind === 'swap' ? 'شُعب بديلة لـ'+c.name : 'يمكنك تسجيل '+c.name,['تحققت من المتطلبات والمقاعد والتعارض مع جدولك الحالي.'],choices.map(s=>operation('اختيار شعبة '+s.id,kind,c.code,s.id)),choices.map(s=>({title:'شعبة '+s.id,meta:sectionLine(s),ref:{type:'section',code:c.code,section:s.id,kind}})),c.code);
  }
  function schedulePreferences(t) {
    const school=M(), pref={maxDays:5, time:'any', priority:'balanced', avoidDays:[]};
    const maxDays=t.match(/(?:^|\s)([1-5]|ثلاثه|ثلاث|اربع|اربعه|خمس|خمسه|واحد)\s*(?:ايام|يوم)/);
    const dayNumbers={ثلاثه:3,ثلاث:3,اربع:4,اربعه:4,خمس:5,خمسه:5,واحد:1};
    if(maxDays) pref.maxDays=dayNumbers[maxDays[1]] || Number(maxDays[1]);
    if(/يومين|يومان/.test(t)) pref.maxDays=2;
    if(/يوم واحد/.test(t)) pref.maxDays=1;
    if(pref.maxDays<5) pref.priority='compact';
    const credits=t.match(/(\d+)\s*ساع/);
    if(credits && !/(?:قبل|بعد|الساعه)\s*\d+\s*ساع/.test(t)) pref.credits=Number(credits[1]);
    const dayIds=school.days.flatMap((day,i)=>t.includes(normalize(day))?[i]:[]);
    if(/بدون|الا |ما (?:بدي|ابي|بقدر|اقدر|يناسب)|مش قادر|اتجنب|استبعد|تجنب|اجازه|عندي شغل|ما بناسب|ما ودي|ما اداوم/.test(t)) pref.avoidDays=dayIds;
    else if(dayIds.length && /فقط|بس|حصرا/.test(t)) pref.avoidDays=[0,1,2,3,4].filter(i=>!dayIds.includes(i));
    if(/صباح|مبكر|بكير/.test(t)) {pref.time='morning';pref.priority='early';}
    if(/بعد الظهر|مساء|مساي/.test(t)) pref.time='afternoon';
    const end=t.match(/(?:قبل|اخلص (?:الساعه|علي)|اخلص ع|اخلص عال|ينتهي (?:عند|الساعه))\s*(?:الساعه\s*)?(\d{1,2}(?:[:.]\d{2})?|الظهر|الواحده|وحده|الواحد|الثانيه عشره|الثانيه|ثنتين|تنتين|الثالثه|ثلاثه|الرابعه|الخامسه)/);
    if(end){
      const hourNames={الظهر:12,الواحده:13,وحده:13,الواحد:13,'الثانيه عشره':12,الثانيه:14,ثنتين:14,تنتين:14,الثالثه:15,ثلاثه:15,الرابعه:16,الخامسه:17};
      const parts=end[1].split(/[:.]/);
      let hours=hourNames[end[1]] || Number(parts[0]);
      if(hours>=1 && hours<=7) hours+=12;
      const minute=Number(parts[1] || 0);
      if(hours>=0 && hours<=23 && minute<60) pref.endBy=60*hours+minute;
      if(pref.time==='afternoon' && !/بعد الظهر|مساي/.test(t)) pref.time='any';
    }
    if(/شعبي الحاليه|ثبت شعبي|نفس الشعب|ما (?:تبدل|تغير).*شعب/.test(t)) pref.lockSections=true;
    return pref;
  }
  const creditCount = value => ar(value)+(value>=3 && value<=10?' ساعات':' ساعة');
  const attendanceDays = value => value===1?'يوم حضور واحد':value===2?'يومي حضور':ar(value)+' أيام حضور';
  function formatClock(minutes) {
    return [Math.floor(minutes/60),minutes%60].map(v=>String(v).padStart(2,'0')).join(':');
  }
  function planSchedule(t) {
    const prefs=schedulePreferences(t), planner=window.MadarOptimize, school=M();
    if(!planner?.search) return reply('تعذّر تحميل مخطط الجداول.',[],[go('عرض التسجيل','register')]);
    if(prefs.credits && (prefs.credits>school.maxCredits || prefs.credits<1)) {
      return {...reply('العبء المطلوب خارج نطاق التسجيل المتاح.',['يمكن البحث ضمن سقف '+ar(school.maxCredits)+' ساعة للفصل.'],[go('ضبط العبء في المخطط','optimizer')]),factualOnly:true};
    }
    const result=planner.search(prefs), best=result.options[0], cfg=result.preferences;
    const action={kind:'planner',value:JSON.stringify(prefs),label:'مراجعة الخيارات وتثبيت جدول'};
    const limits=['العبء المستهدف '+creditCount(cfg.credits),'حتى '+attendanceDays(cfg.maxDays)];
    if(prefs.avoidDays.length) limits.push('استبعاد '+prefs.avoidDays.map(i=>school.days[i]).join(' و'));
    if(prefs.time==='morning') limits.push('انتهاء المحاضرات بحلول 14:00');
    if(prefs.time==='afternoon') limits.push('بداية المحاضرات من 12:00');
    if(prefs.endBy!==undefined) limits.push('آخر انتهاء '+formatClock(prefs.endBy));
    if(prefs.lockSections) limits.push('الاحتفاظ بالشُّعب الحالية');
    if(!best) return {...reply('لم أجد جدولًا بهذه الشروط.',[limits.join('، ')+'.',...result.tips],[action]),factualOnly:true};
    const days=best.days.map(i=>school.days[i]).join('، ');
    const details=[limits.join('، ')+'.','أيام الحضور '+days+'، وآخر محاضرة تنتهي عند '+formatClock(best.last)+'.'];
    if(best.credits<cfg.credits) details.push('تتيح الشُّعب '+creditCount(best.credits)+' من أصل '+creditCount(cfg.credits)+' مستهدفة.');
    if(best.moved.length) details.push('يتطلب هذا البديل تبديل '+ar(best.moved.length)+' من الشُّعب الحالية. يمكنك مراجعة التغييرات في المخطط.');
    const choices=Object.entries(best.registration).map(([code,id])=>({title:school.course(code).name,meta:code+' · شعبة '+id+' · '+sectionLine(school.section(code,id)),ref:{type:'course',code}}));
    const spokenDays=best.days.map(i=>school.days[i]).join(' و');
    const spokenPlan = [
      'وجدتُ لك جدولًا من '+creditCount(best.credits)+'.',
      'أيام حضورك هي '+spokenDays+'.',
      'آخر محاضرة تنتهي عند '+formatClock(best.last)+'.',
      best.credits<cfg.credits ? 'هذا أقل من هدفك، وهو '+creditCount(cfg.credits)+'.' : '',
      best.moved.length ? 'يحتاج هذا الخيار إلى تغيير بعض الشُّعَب المسجّلة. يمكنك مراجعتها قبل التأكيد.' : ''
    ].filter(Boolean).join(' ');
    return {...reply('وجدت جدولًا من '+creditCount(best.credits)+'.',details,[action],choices),factualOnly:true,spokenPlan};
  }
  function careerReply(input) {
    const rec = window.MadarML?.recommend(input, M().getProfile());
    if (!rec?.recognized || !rec.items?.length) return reply('أي مجال ترغب في استكشافه؟',
      ['اكتب ما تحب عمله، مثل «أستمتع بتحليل الأرقام» أو «أريد تصميم تطبيق سهل الاستخدام».'],
      [go('استكشف المسار المهني','insights')]);
    const items = rec.items.slice(0,4);
    return reply('مقررات من خطتك تناسب اهتماماتك',[],
      [go('استكشف توصياتي','insights'),go('افتح الخطة الدراسية','plan')],
      items.map(x => ({title:x.course.name+' · '+x.course.code,meta:[x.reason, labels[x.status], x.offered?'مطروح هذا الفصل':''].filter(Boolean).join(' · '),ref:{type:'course',code:x.course.code}})),
      items[0].course.code);
  }
  const ordinals={اول:0,اولي:0,اولاني:0,ثاني:1,ثانيه:1,تاني:1,تانيه:1,ثالث:2,ثالثه:2,رابع:3,رابعه:3,خامس:4,خامسه:4,سادس:5,سادسه:5};
  function optionPosition(q) {
    if (/اول (?:فصل|سنه|مره|يوم|جدول)|(?:الفصل|المستوي|السنه) (?:ال)?(?:اول|ثاني|ثالث)|(?:قبل|بعد|الساعه|عند) (?:الساعه )?(?:ال)?(?:واحد|ثاني|ثالث|رابع|خامس|سادس)/.test(q)) return null;
    const tokens=q.split(/[^\u0621-\u064aa-z0-9]+/);
    for(const token of tokens) {
      const word=token.replace(/^(?:وبال|وال|بال|لل|ال)/,'');
      if(Object.hasOwn(ordinals,word)) return ordinals[word];
      if(word==='اخير' || word==='اخيره') return -1;
    }
    const number=q.match(/(?:الخيار|الاقتراح|المقرر|الماده|الشعبه)\s+رقم\s+(\d{1,2})(?!\d)/);
    return number ? Number(number[1])-1 : null;
  }
  function referenceFollowUp(input) {
    const q=normalize(input), school=M(), index=optionPosition(q);
    const pronoun=/متطلباته|شروطه|اسجله|سجله|اسجلها|سجلها|اضيفها|اضيفه|بدلها|احذفها|احذفه|موعدها|موعده|ساعاتها|ساعاته|عنها|احكي.*عنه|حذفه|حذفها|شعبه الماده|هذا المقرر|هذه الماده/.test(q);
    if(index===null && !pronoun) return null;
    // Explicit course names outrank conversational references in mixed questions.
    if(school.courses.some(c=>q.includes(c.code.toLowerCase()) || q.includes(normalize(c.name)))) return null;
    const last=[...messages()].reverse().find(m=>m.role==='advisor');
    const refs=(last?.references || []).filter(ref=>ref && school.course(ref.code));
    const clarify=()=>({...reply('أي مقرر أو شعبة تقصد؟',['اكتب اسم المقرر أو رمزه، أو اختر من قائمة المقررات لتتمكن من الإشارة إليها بالترتيب.'],[say('عرض المقررات المتاحة','ما المقررات التي يمكنني تسجيلها؟')]),factualOnly:true});
    if(index!==null && !refs.length) return clarify();
    const asksSection=/شعبه|الشعب|شعبت/.test(q);
    const asksCourse=/المقرر|الماده|مقرر |ماده /.test(q);
    if(index!==null && /جدول|جداول/.test(q)) return {...reply('يمكنك مقارنة الجداول المرقّمة داخل مخطّط الجداول.',[],[go('عرض بدائل الجدول','optimizer')]),factualOnly:true};
    if(index!==null && ((asksSection && refs.every(x=>x.type==='course')) || (asksCourse && refs.every(x=>x.type==='section')))) return clarify();
    const singularCode=last?.focusCourse || (refs.length<=1 && last?.code) || (refs.length && refs.every(x=>x.code===refs[0].code) && refs[0].code);
    if(index===null && !singularCode) {
      if(!refs.length) return clarify();
      const distinct=[...new Set(refs.map(x=>x.code))].map(code=>school.course(code));
      return {...reply('أيّ من هذه المقررات تقصد؟',[],distinct.map(x=>say(x.name,'ما متطلبات '+x.code+'؟')),
        distinct.map(x=>({title:x.name,meta:x.code,ref:{type:'course',code:x.code}}))),factualOnly:true};
    }
    const ref=index===null ? {type:'course',code:singularCode} : refs[index<0?refs.length-1:index];
    if(!ref) return {...reply('هذا الترتيب خارج القائمة السابقة.',['عدد الخيارات المعروضة '+ar(refs.length)+'. اذكر اسم المقرر أو اختر ترتيبًا منها.']),references:refs,factualOnly:true};
    const course=school.course(ref.code);
    if(!course) return clarify();
    const requestDrop=/احذف|حذف|اسحب|انسحب|اجل|تاجيل/.test(q);
    const requestSwap=/بدل|تبديل|غير.*شعب/.test(q);
    const requestAdd=/سجل|اضف|اضيف|نزل|خذها|اخذه/.test(q);
    let response;
    if(ref.type==='section' && !requestDrop) {
      const part=school.section(ref.code,ref.section);
      if(!part) return clarify();
      const check=school.preview(ref.kind,ref.code,part.id);
      response=reply('الشعبة '+part.id+' من '+course.name,
        [sectionLine(part)+'، '+part.room+'.',check.ok?'هذه الشعبة مستوفية للشروط الحالية. يلزم تأكيدها من شاشة المراجعة.':check.message],
        check.ok?[operation('مراجعة الشعبة '+part.id,ref.kind,course.code,part.id)]:[go('عرض التسجيل','register')],[],course.code);
    } else if(requestDrop || requestSwap || requestAdd) {
      response=changes(course,requestDrop?'drop':requestSwap?'swap':'add');
    } else {
      response=details(course);
    }
    return {...response, references:response.references || refs, focusCourse:course.code, factualOnly:true};
  }
  function answer(input, inferred = {}) {
    const q=normalize(input), school=M(), p=school.getProfile(), st=school.stats(), c=matchCourse(input);
    const intent=inferred.intent || 'unknown';
    if (/^(?:صباح (?:الخير|النور)|مسا(?:ء)? (?:الخير|النور))[!.؟\s]*$/.test(q))
      return reply('أهلًا بك! كيف أساعدك اليوم؟',[],initialPrompts(p).map(x=>say(x.name,x.q)));
    if (/تكلف|تكاليف|كلفه|الرسوم|رسوم|منحتي|المنحه|منحه ماليه|بعثتي|مكافاتي/.test(q)) {
      return {...reply('تفاصيل التمويل غير متاحة في هذا الملف.',
        ['أستطيع حساب عدد الساعات قبل تعديل التسجيل وبعده. لمعرفة تكلفتها أو أثرها على المنحة، تحتاج إلى تعرفة الساعات وشروط عقد المنحة المعتمد.'],
        [go('مراجعة الساعات في الخطة','plan')]), factualOnly:true};
    }
    if (/جدول/.test(q) && /اخلص|ينتهي|قبل|بعد الظهر|(?:اريد|بدي|ابي|ابغي) جدول|جدول.*\d+ ساع/.test(q)) return planSchedule(q);
    const namedDay=school.days.some(day=>q.includes(normalize(day)));
    if (namedDay && /مش قادر|ما بقدر|ما اقدر|ما بدي|ما ابي|ما بناسب|عندي شغل|ما بقدر اداوم|بدون|استبعد|اتجنب/.test(q)) {
      return planSchedule(q);
    }
    if (intent==='recommend' || /مسار مهني|مهنه|وظيف|مهنتي|اشتغل في|ميول|اهتمامي|شغفي|career/.test(q)) return careerReply(input);
    if (/صباح|مساي|مساء|قبل الظهر|قبل 12|قبل الثانيه عشره|اقترح.*جدول|جدول.*(جديد|مناسب|ثلاث|ايام|يومين)|جدول.*تفضيل|جدول.*بدون|schedule.*plan/.test(q)) {
      return planSchedule(q);
    }
    if (/مستجد|جديد.*جامع|اول فصل|اول جدول|ابدا التسجيل|بدايه رحل/.test(q)) return reply('خلّينا نبدأ من خطتك.',['تخصصك '+p.major+'، وخطتك تتطلب '+ar(st.total)+' ساعة. سأرتّب المقررات المؤهلة وأتحقق من تداخل الشُّعب. أي توقيت تفضّل؟'],[say('صباحي','اقترح جدولًا صباحيًا'),say('بعد الظهر','اقترح جدولًا بعد الظهر'),say('كل الفترات','اقترح جدولًا مناسبًا')]);
    if (/حرج|اولويه|اهم .*مقرر|اهم .*ماد|يفتح.*مقررات|اكثر.*يؤخر|اكثر.*ياخر|تتاخر|تتاخرني/.test(q)) {
      const order = school.courses.filter(x=>school.status(x.code)==='registered' || (!st.registered && school.status(x.code)==='eligible')).map(x=>({course:x,following:school.successors(x.code).filter(n=>school.status(n.code)!=='completed')})).sort((a,b)=>b.following.length-a.following.length).filter(x=>x.following.length);
      if (order.length) {
        const strongest=order[0];
        return reply('أولوية المسار الحالي: '+strongest.course.name,['يعتمد '+ar(strongest.following.length)+' من مقررات الخطة اللاحقة عليه مباشرةً أو عبر سلسلة متطلبات. إكماله يحافظ على أكبر عدد من الخيارات ضمن المقررات التي قارنتها.','يعتمد موعد التخرج الفعلي على بقية المتطلبات وطرح الشُّعب في الفصول المقبلة.'],[go('رؤية الخطة كاملة','plan')],order.slice(0,3).map(x=>({title:x.course.name,meta:'من المقررات المرتبطة به: '+x.following.slice(0,2).map(n=>n.name).join('، '),ref:{type:'course',code:x.course.code}})),strongest.course.code);
      }
    }
    if (/رسبت|ما نجحت|لم اجتز|ما اجتزت/.test(q) && c) {
      const dependents=school.successors(c.code).filter(x=>school.status(x.code)!=='completed');
      return reply('إذا لم تجتز '+c.name,['لا تُحتسب ساعاته ضمن الساعات المجتازة. يظل استكمال المقرر مطلوبًا إذا كان إلزاميًا في خطتك.',dependents.length?'وتتأثر مقررات لاحقة منها '+dependents.slice(0,3).map(x=>x.name).join('، ')+'.':'لا تظهر في الخطة الحالية مقررات تتخذ هذا المقرر متطلبًا سابقًا.'],[go('راجع تسلسل المقررات','plan')],[],c.code);
    }
    if (intent==='drop' || intent==='impact' && c && school.status(c.code)==='registered' || /حذف|احذف|اسحب|انسح|سحب|انسحاب|تاجيل|اجل |تاجل|drop/.test(q)) return changes(c,'drop');
    if (intent==='swap' || /بدل|بديل.*شعب|بدائل.*شعب|تبديل|غير.*شعب|تغيير.*شعب|swap/.test(q)) return changes(c,'swap');
    if ((intent==='register' || /اسجل|تسجيل|سجلني|سجل |اضيف|اضف|اضافه|اقدر اخذ|اقدر اخد|can i take|register|يسمح.*اخذ/.test(q)) && !/لوايح|لوائح|سياس|ضابط|ضوابط|حد.*تسجيل/.test(q)) return changes(c,'add');
    if (intent==='gpa' || /معدل|gpa|تقدير|لو (?:جبت|حققت|حصلت)|شو لازم اجيب/.test(q)) {
      const target = q.match(/(?:اوصل|اصل|ارفع.{0,14}?الي|استهدف|هدفي|مستهدف|الهدف)\s*(?:معدلي|لمعدل|معدلي الي|الي|ل)?\s*([0-5](?:\.\d+)?)/);
      const term = q.replace(/\d+\s*ساع\S*/g,'').match(/(?<![\d.])([0-5](?:\.\d+)?)(?![\d.])/);
      const customHrs=q.match(/(\d+)\s*ساع/);
      const hrs=customHrs ? Number(customHrs[1]) : st.registered;
      if (hrs<0 || hrs>school.maxCredits) return reply('اختر عبئًا بين ساعة و'+ar(school.maxCredits)+' ساعة.',[],[go('افتح المحاكي','simulator')]);
      if (target && hrs>0) {
        const val=Number(target[1]), needed=st.completed? (val*(st.completed+hrs)-(p.gpa*st.completed))/hrs : val;
        const text = needed > 5 ? 'الهدف يتطلب معدلًا يتجاوز ٥ من ٥، لذا يتعذر بلوغه خلال هذا الفصل بهذا العبء.' : 'تحتاج إلى معدل فصلي لا يقل عن '+ar(Math.ceil(Math.max(0,needed)*100)/100,2)+' من ٥ في '+ar(hrs)+' ساعة مسجّلة.';
        return reply('الوصول إلى معدل '+ar(val,2),[text,'يفترض الحساب نجاحك في الساعات المسجلة واحتسابها جميعًا دون إعادة.'],[go('جرّب محاكي المعدل','simulator')]);
      }
      if(term && Number(term[1])<=5 && hrs) return reply('المعدل التراكمي المتوقع '+ar(school.simulateGpa(Number(term[1]),hrs),2)+' من ٥',['عند تحقيق معدل فصلي '+ar(Number(term[1]),2)+' في '+ar(hrs)+' ساعة، وفق سجلك الحالي.'],[go('تعديل افتراضات المحاكاة','simulator')]);
      return reply(p.gpa ? 'معدلك التراكمي '+ar(p.gpa,2)+' من ٥' : 'يبدأ احتساب معدلك بعد أول فصل.',[hrs?'عبؤك الحالي '+ar(hrs)+' ساعة. جرّب سؤالًا مثل «لو جبت ٤٫٧، شو بصير معدلي؟».':'يمكنك اختبار معدل فصلي في المحاكي قبل تسجيل مقرراتك.'],[go('فتح المحاكي','simulator')]);
    }
    if (intent==='progress' || /تخرج|متبقي|باقي|ضل |انجاز|تقدمي|ساعه.*خلص|خطتي|graduate|progress/.test(q)) {
      const incomplete=st.total-st.completed;
      return reply('أنجزت '+ar(st.percent)+'٪ من خطتك.',['اجتزت '+ar(st.completed)+' من '+ar(st.total)+' ساعة. يتبقى للتخرج '+ar(incomplete)+' ساعة، منها '+ar(st.registered)+' مسجلة حاليًا و'+ar(st.remaining)+' غير مسجلة.','يمكن مراجعة كل مستوى لمعرفة المقررات التي تمهّد للمستوى التالي.'],[go('استعراض الخطة','plan'),say('ما المتاح لي؟','ما المقررات التي يمكنني تسجيلها؟')]);
    }
    if (intent==='schedule' && !/متي|مواعيد|محاضر|اليوم|غدا|بكره|متي دوامي|جدولي|محاضراتي/.test(q)) {
      return planSchedule(q);
    }
    if (/جدول|محاضر|اليوم|بكره|غدا|class|schedule/.test(q) || intent==='schedule') {
      const day=school.days.findIndex(d=>q.includes(normalize(d)));
      const actual=(new Date().getDay()+(/بكره|غدا/.test(q)?1:0))%7;
      const idx=day>=0 ? day : /اليوم|غدا|بكره/.test(q) ? actual : undefined;
      const rows=idx===undefined ? school.schedule() : idx>4 ? [] : school.schedule(idx);
      const weekday = idx === 5 ? 'الجمعة' : idx === 6 ? 'السبت' : school.days[idx];
      return reply(idx===undefined?'جدولك الأسبوعي':'محاضرات '+weekday,rows.length?[]:['لا توجد محاضرات مسجلة لهذه الفترة.'],[go('عرض التسجيل','register')],rows.map(x=>({title:x.course.name,meta:school.days[x.day]+' · '+x.section.start+'–'+x.section.end+' · '+x.section.room,ref:{type:'course',code:x.course.code}})));
    }
    if (/ضابط|ضوابط|لوايح|لوائح|سياس|حد .*ساع|الحد|شروط/.test(q)) return reply('ضوابط التسجيل في هذه التجربة',['العبء الأقصى ١٨ ساعة. يتطلب التسجيل مقعدًا شاغرًا واجتياز المتطلبات السابقة وعدم تعارض الشعبة مع أي مقرر مسجل.','قبل الحذف أو التبديل، أراجع العملية وأعرض أثرها لتأكيدها.'],[go('فتح التسجيل','register'),say('ما المقررات المتاحة؟','ما المقررات التي يمكنني تسجيلها؟')]);
    if (intent==='impact') return reply('قارِن أثر تأجيل مقرر قبل التعديل',['يحسب تحليل المسار الفرق بين بقاء المقرر في خطة هذا الفصل وتأجيله، ويحدد المقررات اللاحقة التي ستنتظره.'],[go('تحليل أثر القرار','insights')]);
    if (intent==='eligibility') return c ? details(c) : changes(null,'add');
    if(c) return details(c);
    if (/مؤهل|موهل|متاح|مقرراتي|مواد انزل|مسموح/.test(q)) return changes(null,'add');
    if (/اهل|مرحبا|هلا|سلام|hello|ابدأ|ابدا/.test(q)) return reply('أهلًا بك! كيف أساعدك اليوم؟',['يمكنك سؤالي عن خطتك أو مقرراتك أو أثر تغيير في جدولك.'],initialPrompts(p).map(x=>say(x.name,x.q)));
    const more=window.MadarGen && !window.MadarGen.ready() ? [{kind:'model',value:'',label:'تفعيل الإجابات التوليدية'}] : [];
    return {...reply('ممكن تحدد المقرر أو القرار اللي تفكر فيه؟',['أستطيع فحص حالة مقرر باسمه أو رمزه، حساب أثر الحذف، اقتراح شُعب، أو محاكاة معدلك بالاعتماد على بيانات هذا الحساب.'],[say('فحص المتاح للتسجيل','ما المقررات التي يمكنني تسجيلها؟'),say('مراجعة تقدم الخطة','كم ساعة متبقية للتخرج؟'),...more]),openQuestion:true};
  }
  function initialPrompts(p) {
    const enrolled=M().courses.find(c=>M().status(c.code)==='registered');
    return [
      {name:p.completed.length?'أثَر تغيير المقرر':'أبدأ أول فصل لي',description:p.completed.length?'اعرف كيف يتأثر مسارك قبل الحذف.':'رتّب خطوات تسجيلك الأولى.', icon:'route',q:enrolled?'ما أثر حذف '+enrolled.code+'؟':'أنا طالب مستجد، كيف أبدأ؟'},
      {name:'جدول يناسب وقتي',description:'اكتشف شُعبًا تلائم تفضيلاتك.',icon:'calendar',q:'اقترح لي جدولًا صباحيًا'},
      {name:'موادي واهتماماتي',description:'اكتشف مقررات تخدم هدفك المهني.',icon:'compass',q:'أحب تحليل الأرقام وأريد العمل في مجال البيانات. ما المقررات المناسبة؟'},
      {name:'توقّعات المعدل',description:'جرّب أثر نتائج الفصل على معدلك.',icon:'target',q:'كيف أحسب معدلي المتوقع؟'}
    ];
  }
  function actionHTML(a) { return '<button type="button" class="mad-ad-action" data-ad-kind="'+esc(a.kind)+'" data-ad-value="'+esc(a.value)+'" data-ad-course="'+esc(a.course||'')+'" data-ad-section="'+esc(a.section||'')+'">'+esc(a.label)+'</button>'; }
  function messageHTML(m) {
    if (m.role==='student') return '<div class="mad-ad-message student"><span>'+esc(m.title)+'</span></div>';
    const list = Array.isArray(m.choices)&&m.choices.length?'<ul class="mad-ad-options">'+m.choices.map(x=>'<li><b>'+esc(x.title)+'</b><small>'+esc(x.meta)+'</small></li>').join('')+'</ul>':'';
    const extension = m.generated ? '<div class="mad-ad-generated"><small>'+icon('sparkles',13)+' شرح النموذج المحلي</small><p>'+esc(m.generated)+'</p></div>' : '';
    return '<div class="mad-ad-message advisor"><div class="mad-ad-by"><span class="mad-ad-mini">'+icon('sparkles',16)+'</span>مرشد مدار</div><div class="mad-ad-answer"><strong>'+esc(m.title)+'</strong>'+(m.body||[]).filter(Boolean).map(t=>'<p>'+esc(t)+'</p>').join('')+list+extension+(m.actions?.length?'<div class="mad-ad-actions">'+m.actions.map(actionHTML).join('')+'</div>':'')+'</div></div>';
  }
  function render() {
    const p=M().getProfile(), st=M().stats(), current=messages();
    if (current.length) endScroll();
    const intro='<div class="mad-ad-intro"><div class="mad-ad-sphere">'+icon('sparkles',30)+'</div><h2>كيف أساعدك اليوم؟</h2><p>اسألني عن قرار أكاديمي أو اختَر نقطة بداية.</p></div><div class="mad-ad-launch">'+initialPrompts(p).map(x=>'<button type="button" data-ad-kind="ask" data-ad-value="'+esc(x.q)+'"><span class="mad-ad-topic">'+icon(x.icon,19)+'</span><span><b>'+esc(x.name)+'</b><small>'+esc(x.description)+'</small></span></button>').join('')+'</div>';
    const genControl = window.MadarGen?.renderControl() || '';
    const mic = '<svg class="ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M9 22h6"/></svg>';
    return '<section class="mad-ad"><div class="mad-ad-heading"><div><h1>المرشد الأكاديمي</h1><p>ناقش خطتك بصوتك أو اكتب سؤالك.</p></div><div class="mad-ad-head-actions"><button type="button" class="mad-ad-voice" data-ad-kind="voice">'+mic+'محادثة صوتية</button>'+(current.length?'<button class="mad-ad-restart" type="button" data-ad-kind="reset">'+icon('plus',17)+'محادثة جديدة</button>':'')+'</div></div><div class="mad-ad-layout"><div class="mad-ad-panel"><div class="mad-ad-chathead"><span class="mad-ad-avatar">'+icon('sparkles',21)+'</span><div><b>مرشد مدار</b><small>إرشاد شخصي</small></div></div><div class="mad-ad-stream" aria-label="محادثة الإرشاد">'+(current.length?current.map(messageHTML).join(''):intro)+'</div><form class="mad-ad-compose" id="madar-ad-form"><label class="mad-ad-visually" for="madar-ad-input">سؤالك للمرشد</label><textarea id="madar-ad-input" rows="1" maxlength="650" placeholder="اكتب سؤالك للمرشد…" dir="auto"></textarea><button type="submit" aria-label="إرسال السؤال">'+icon('send',18)+'</button></form><div class="mad-ad-foot">تُراجع أهلية المقررات باستخدام سجلك وخطتك الدراسية.</div></div><aside class="mad-ad-side"><div class="mad-ad-record"><div class="mad-ad-recordhead"><span>'+icon('book',19)+'</span><h2>سجل الإرشاد</h2></div><strong>'+esc(p.name)+'</strong><p>'+esc(p.major)+'</p><dl><div><dt>المستوى الدراسي</dt><dd>'+ar(p.level)+'</dd></div><div><dt>العبء الحالي</dt><dd>'+ar(st.registered)+' ساعة</dd></div><div><dt>المعدل التراكمي</dt><dd>'+ (p.gpa?ar(p.gpa,2)+' / ٥':'مستجد') +'</dd></div></dl><div class="mad-ad-meter"><i style="width:'+Math.max(0,Math.min(100,st.percent))+'%"></i></div><small>اجتزت '+ar(st.completed)+' من '+ar(st.total)+' ساعة</small></div>'+genControl+'<div class="mad-ad-shortcuts"><h3>أدوات مرتبطة</h3>'+[{i:'calendar',n:'مخطط الجداول',r:'optimizer'},{i:'compass',n:'تحليل المسار والتوصيات',r:'insights'},{i:'route',n:'الخطة الدراسية',r:'plan'},{i:'calendar',n:'تسجيل المقررات',r:'register'},{i:'target',n:'محاكي القرارات',r:'simulator'}].map(a=>'<button data-ad-kind="go" data-ad-value="'+a.r+'">'+icon(a.i,18)+'<span>'+a.n+'</span>'+icon('chevronLeft',15)+'</button>').join('')+'</div></aside></div></section>';
  }
  function endScroll(){requestAnimationFrame(()=>{const s=document.querySelector('.mad-ad-stream');if(s)s.scrollTop=s.scrollHeight;});}
  const ongoing = new Map();
  const sessionFingerprint = p => JSON.stringify([p.id, p.completed, p.registration, p.gpa]);
  function textFor(response, choiceLimit = 3) {
    const choices = (response.choices || []).slice(0,choiceLimit).map(x => x.title+'، '+x.meta);
    if(!choices.length && response.references?.length && response.title==='أي مقرر تقصد؟')
      choices.push(...response.references.slice(0,choiceLimit).map(x=>M().course(x.code)?.name).filter(Boolean));
    return [response.title, ...(response.body || []), ...choices, response.generated].filter(Boolean).join(' ');
  }
  function spokenReply(response) {
    if (response.spokenPlan) return response.spokenPlan;
    if (response.openQuestion && response.generated) return response.generated;
    const sentence = value => {
      const line=String(value || '').trim();
      return line && !/[.؟?!…]$/.test(line) ? line+'.' : line;
    };
    const parts=[response.title,...(response.body || [])].filter(Boolean).map(sentence);
    const choices=response.choices || [];
    const refs=response.references || [];
    if (response.title==='أي مقرر تقصد؟' && !choices.length) {
      const names=refs.slice(0,3).map(r=>M().course(r.code)?.name).filter(Boolean);
      if(names.length) parts.push('الخيارات تشمل '+names.join('، و')+'.');
    } else if (choices.length) {
      const ranked=['أولًا','ثانيًا','ثالثًا'];
      choices.slice(0,3).forEach((option,index)=>{
        const ref=option.ref;
        const course=ref?.type==='course' && M().course(ref.code);
        const shortName=course?course.name:option.title;
        const isRecommendation=course && /^مقررات من خطتك/.test(response.title);
        const detail=isRecommendation && index>0 ? labels[M().status(course.code)] : option.meta;
        const ordinal=choices.length>1?ranked[index]+'، ':'';
        parts.push(sentence(ordinal+shortName+(detail?'، '+detail:'')));
      });
    }
    return parts.join(' ');
  }
  function modelFacts(p, context) {
    const school=M(), totals=school.stats();
    const enrolled=Object.keys(p.registration).map(code => code+' '+school.course(code).name);
    const mentioned=context.code ? school.course(context.code) : null;
    const extra = mentioned ? [mentioned.code,mentioned.name,mentioned.description,labels[school.status(mentioned.code)],'متطلباته '+(mentioned.prereqs.join('، ') || 'لا يوجد')].join(' · ') : '';
    return ['تخصص '+p.major+'، المستوى '+ar(p.level)+'.',
      'المعدل '+(p.gpa==null?'لم يُحسب':ar(p.gpa,2))+' من ٥. الساعات المجتازة '+ar(totals.completed)+' من '+ar(totals.total)+'، التسجيل '+ar(totals.registered)+' ساعة.',
      'المقررات المسجلة '+(enrolled.join('، ') || 'لا يوجد')+'.',
      'حد التسجيل '+ar(school.maxCredits)+' ساعة. لم يُجر أي تغيير على التسجيل في هذا السؤال.',
      extra, textFor(context,7)].filter(Boolean).join('\n');
  }
  function refreshResponse() {
    const stream=document.querySelector('.mad-ad-stream');
    if(!stream) return;
    stream.innerHTML=messages().map(messageHTML).join('');
    const id=M().getProfile().id;
    if(ongoing.has(id)) stream.insertAdjacentHTML('beforeend','<p class="mad-ad-working" role="status">يصوغ النموذج المحلي شرحًا…</p>');
    endScroll();
  }
  function currentReply(id, ticket, fingerprint) {
    return ongoing.get(id)===ticket && sessionFingerprint(M().getProfile())===fingerprint;
  }
  async function ask(text, options = {}) {
    const prompt=String(text||'').trim().slice(0,650);
    if(!prompt) return '';
    const p=M().getProfile(), id=p.id, fingerprint=sessionFingerprint(p);
    const history=messages().slice(-5).map(m=>({role:m.role==='student'?'user':'assistant',content:textFor(m).slice(0,450)}));
    const inferred=window.MadarML?.infer(prompt) || {};
    const result=referenceFollowUp(prompt) || answer(prompt,inferred);
    note('student',{title:prompt});
    const item={role:'advisor',time:Date.now(),...result};
    messages().push(item); persist();
    const ticket=Symbol('advisor request');
    ongoing.delete(id);
    const mayEnrich = !result.factualOnly && typeof window.MadarGen?.ready==='function' && window.MadarGen.ready() &&
      !result.actions?.some(a=>a.kind==='change') && !['gpa','drop','swap','register'].includes(inferred.intent);
    if(mayEnrich) ongoing.set(id,ticket);
    if(document.querySelector('.mad-ad')) U().render();
    else if(!options.voice) U().go('advisor');
    if(!mayEnrich) return options.voice ? spokenReply(item) : textFor(item);
    refreshResponse();
    try {
      const generated=await window.MadarGen.generate({question:prompt, facts:modelFacts(p,result), history});
      if(!currentReply(id,ticket,fingerprint)) return '';
      if(typeof generated==='string' && generated.trim()) {
        const candidate=generated.trim().slice(0,2000);
        const grounded=modelFacts(p,result);
        const codes=candidate.toUpperCase().match(/\b[A-Z]{2,5}[- ]?\d{3}\b/g) || [];
        const claimedWrite=/(تم (?:تسجيل|حذف|تعديل|تبديل|اضافه)|(?:سجلت|حذفت|عدلت|بدلت) (?:لك|المقرر|الماده|الشعبه))/.test(normalize(candidate));
        if(!claimedWrite && codes.every(code=>grounded.toUpperCase().includes(code.replace(/[- ]/g,'')))) {
          item.generated=candidate;
          if(result.openQuestion) {
            item.title='بشأن سؤالك';
            item.body=[];
            item.actions=[];
          }
        }
      }
    } catch {
      if(!currentReply(id,ticket,fingerprint)) return '';
      // Verified course facts remain available when the optional device model stops.
    } finally {
      if(ongoing.get(id)===ticket) {
        ongoing.delete(id);
        if(M().getProfile().id===id) { persist(); refreshResponse(); }
      }
    }
    if(sessionFingerprint(M().getProfile())!==fingerprint) return '';
    // Speak only the verified record for course information or institutional policy.
    const policyTopic=/شروط|لوايح|لوائح|سياسه|نظام الجامعه|رسوم|مواعيد رسميه|جدول|معدل|ساعات|تخرج|تسجيل|شعبه/i.test(normalize(prompt));
    if(options.voice) return spokenReply(!result.openQuestion || policyTopic ? result : item);
    return textFor(item);
  }
  function currentAction(btn) {
    const a=btn.dataset;
    if (a.adKind==='voice') return window.MadarVoice?.open();
    if (a.adKind==='model') return window.MadarGen?.open();
    if (a.adKind==='ask') return ask(a.adValue);
    if (a.adKind==='planner') {
      try { window.MadarOptimize?.prepare(JSON.parse(a.adValue)); } catch { return U().toast('تعذّر فتح إعدادات الجدول.'); }
      return U().go('optimizer');
    }
    if (a.adKind==='go') return U().go(a.adValue);
    if (a.adKind==='reset') return U().modal('بدء محادثة جديدة','<div class="mad-ad-confirm"><p>تُمسح رسائل هذه المحادثة لهذا الحساب. تظل عمليات التسجيل محفوظة في السجل.</p><div><button class="btn primary" data-ad-kind="reset-confirm">بدء محادثة جديدة</button><button class="btn" data-ad-kind="cancel">إلغاء</button></div></div>');
    if (a.adKind==='reset-confirm') {ongoing.delete(M().getProfile().id);state.set(M().getProfile().id,[]);persist();U().closeModal();U().render();return;}
    if (a.adKind==='cancel') return U().closeModal();
    if (a.adKind==='change' || a.adKind==='confirm') {
      const verb={add:'تسجيل',drop:'حذف',swap:'تبديل شعبة'}[a.adValue];
      if(!verb) return;
      const c=M().course(a.adCourse);if(!c) return;
      const check=M().preview(a.adValue,c.code,a.adSection||undefined);
      if(!check.ok) {U().closeModal();note('advisor',reply('تغيّرت حالة المقرر.',[check.message],[go('مراجعة التسجيل','register')]));persist();U().render();endScroll();return;}
      if(a.adKind==='change') {
        const sec=a.adSection?M().section(c.code,a.adSection):null;
        return U().modal('تأكيد '+verb+' المقرر','<div class="mad-ad-confirm"><h3>'+esc(c.name)+'</h3><p>'+esc(sec?sectionLine(sec)+' · '+sec.room:'ستُحذف الشعبة المسجلة من جدولك.')+'</p><p>'+esc(check.impact)+'</p><div><button class="btn primary" data-ad-kind="confirm" data-ad-value="'+esc(a.adValue)+'" data-ad-course="'+esc(c.code)+'" data-ad-section="'+esc(a.adSection||'')+'">تأكيد '+esc(verb)+'</button><button class="btn" data-ad-kind="cancel">رجوع</button></div></div>');
      }
      const result=M().commit(a.adValue,c.code,a.adSection||undefined);
      U().closeModal();
      note('advisor',reply(result.ok?'تم '+verb+' '+c.name:result.message,result.ok?['العبء الحالي '+ar(M().stats().registered)+' ساعة.'+(result.receipt?' مرجع العملية: '+result.receipt+'.':'')]:[],[go('عرض التسجيل','register')],[],c.code));persist();U().render();endScroll();
    }
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-ad-kind]');if(b)currentAction(b);});
  document.addEventListener('submit',e=>{if(e.target.id!=='madar-ad-form')return;e.preventDefault();ask(e.target.querySelector('textarea').value);});
  document.addEventListener('keydown',e=>{if(e.target.id==='madar-ad-input'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.target.form.requestSubmit();}});
  window.Advisor={render,ask};
})();
