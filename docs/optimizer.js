/* Enumerate eligible course/section assignments, then compare feasible alternatives. */
(() => {
  'use strict';
  const M = () => window.Madar;
  const U = () => window.UI;
  const nf = new Intl.NumberFormat('ar-SA');
  const n = v => nf.format(v);
  const e = value => U().esc(value);
  const icon = (name, size = 18) => U().icon(name, size);
  const clock = value => [Math.floor(value / 60), value % 60].map(v => String(v).padStart(2,'0')).join(':');
  const minutes = t => Number(t.slice(0,2)) * 60 + Number(t.slice(3));
  const fingerprint = r => JSON.stringify(Object.entries(r).sort(([a],[b])=>a.localeCompare(b)));
  const sessionKey = p => p.id + fingerprint(p.registration);
  const dayCount = ['','يوم واحد','يومين','ثلاثة أيام','أربعة أيام','خمسة أيام'];
  const priorities = [
    {key:'balanced', label:'الجدول المتوازن', icon:'sliders'},
    {key:'compact', label:'تركيز أيام الحضور', icon:'calendar'},
    {key:'early', label:'الانتهاء مبكرًا', icon:'clock'},
    {key:'academic', label:'التقدّم في الخطة', icon:'route'}
  ];
  let state = null;
  function defaultPreferences(profile) {
    return {credits:Math.max(15,M().stats(profile).registered), maxDays:5, avoidDay:-1, time:'any', lockSections:false, priority:'balanced'};
  }
  function optionsFor(profile, lockSections) {
    return M().courses.filter(c => {
      const status = M().status(c.code,profile);
      return status==='registered' || (status==='eligible' && c.sections.some(s=>s.seats>0));
    }).map(c => {
      const saved = profile.registration[c.code];
      const sections = c.sections.filter(s => saved===s.id || (!saved || !lockSections) && s.seats>0);
      return {c, mandatory:!!saved, sections};
    }).sort((a,b)=>Number(b.mandatory)-Number(a.mandatory));
  }
  function overlaps(s, t) {
    return s.start<t.end && t.start<s.end && s.days.some(day=>t.days.includes(day));
  }
  function totalGaps(buckets) {
    let gap=0;
    for (const sections of buckets) {
      sections.sort((a,b)=>a.start.localeCompare(b.start));
      for (let i=1;i<sections.length;i++) gap += minutes(sections[i].start) - minutes(sections[i-1].end);
    }
    return gap;
  }
  function summarize(chosen, credits, profile) {
    const registration = {}, buckets = M().days.map(()=>[]);
    const gained = new Set(), unlocked = new Set(), added=[], moved=[];
    let first=24*60, last=0, levelScore=0;
    for (const {c,s} of chosen) {
      registration[c.code]=s.id;
      for (const d of s.days) buckets[d].push(s);
      first=Math.min(first,minutes(s.start)); last=Math.max(last,minutes(s.end));
      if(!profile.registration[c.code]) added.push(c.code);
      else if(profile.registration[c.code]!==s.id) moved.push(c.code);
      levelScore += Math.max(0,4-Math.abs(profile.level-c.term));
      gained.add(c.code);
    }
    const completed=new Set(profile.completed);
    for (const c of M().courses) {
      if (completed.has(c.code) || gained.has(c.code) || !c.prereqs.some(code=>gained.has(code))) continue;
      if (c.prereqs.every(code=>completed.has(code)||gained.has(code))) unlocked.add(c.code);
    }
    return {registration,credits,added,moved,first,last,levelScore,unlocked:[...unlocked],
      days:buckets.map((sections,day)=>sections.length?day:-1).filter(v=>v>=0),
      gaps:totalGaps(buckets), key:fingerprint(registration)};
  }
  function enumerate(profile, lockSections, target) {
    const list=optionsFor(profile,lockSections), chosen=[], all=[];
    function visit(index,credits) {
      if(index===list.length) {
        if(credits) all.push(summarize(chosen,credits,profile));
        return;
      }
      const {c,sections,mandatory}=list[index];
      if (!mandatory) visit(index+1,credits);
      if (credits+c.credits>target) return;
      for(const s of sections){
        if(chosen.some(item=>overlaps(s,item.s))) continue;
        chosen.push({c,s}); visit(index+1,credits+c.credits); chosen.pop();
      }
    }
    visit(0,0); return all;
  }
  function matches(row,p) {
    return row.days.length<=p.maxDays && !row.days.includes(p.avoidDay) && !p.avoidDays.some(day=>row.days.includes(day))
      && (p.endBy===null || row.last<=p.endBy) && (p.time!=='morning' || row.last<=14*60)
      && (p.time!=='afternoon' || row.first>=12*60);
  }
  function costs(row) {
    return {days: row.days.length, gaps: row.gaps/60, end: (row.last-8*60)/60,
      move: row.moved.length, academic: row.unlocked.length, level: row.levelScore};
  }
  function rank(row,mode) {
    const c=costs(row);
    if(mode==='compact') return 80*c.days+3*c.gaps+c.end+c.move-.04*c.level;
    if(mode==='early') return 30*c.end+2*c.gaps+c.days+c.move-.03*c.level;
    if(mode==='academic') return -30*c.academic-3*c.level+2*c.days+c.gaps+c.move;
    return 7*c.days+2.7*c.gaps+1.8*c.end+2*c.move-1.4*c.academic-.4*c.level;
  }
  function readings(rows,p,bestLoad) {
    const proposed=new Map();
    const exclusions=new Set([p.avoidDay,...p.avoidDays]);
    for(const row of rows){
      if(row.credits<=bestLoad) continue;
      const changes=[], names=[];
      if(row.days.length>p.maxDays){
        changes.push('days'); names.push('رفع حدّ الحضور إلى '+dayCount[row.days.length]);
      }
      const affected=row.days.filter(day=>exclusions.has(day));
      if(affected.length){
        changes.push('excluded'); names.push('السماح بالحضور '+affected.map(day=>'يوم '+M().days[day]).join(' و'));
      }
      if(p.time==='morning'&&row.last>840 || p.time==='afternoon'&&row.first<720){
        changes.push('time'); names.push('توسيع فترة المحاضرات');
      }
      if(p.endBy!==null&&row.last>p.endBy){
        changes.push('end'); names.push('تأخير آخر وقت للانتهاء إلى '+clock(row.last));
      }
      if(p.lockSections&&row.moved.length){
        changes.push('locked'); names.push('السماح بتبديل الشُّعب المسجّلة');
      }
      if(!changes.length) continue;
      const key=changes.concat(affected).join('-');
      const extraDays=Math.max(0,row.days.length-p.maxDays);
      const extraMinutes=p.endBy===null?0:Math.max(0,row.last-p.endBy);
      const size=extraDays*10000+affected.length*1000+extraMinutes+row.moved.length/100;
      const existing=proposed.get(key);
      if(!existing||row.credits>existing.credits||(row.credits===existing.credits&&size<existing.size)){
        proposed.set(key,{credits:row.credits,size,changes:changes.length,names});
      }
    }
    const alternatives=[...proposed.values()].sort((a,b)=>b.credits-a.credits||a.changes-b.changes||a.size-b.size);
    if(!alternatives.length) return [];
    const {credits,changes}=alternatives[0];
    return alternatives.filter(a=>a.credits===credits&&a.changes===changes).slice(0,2)
      .map(a=>a.names.join(' مع ')+' يتيح '+n(a.credits)+' ساعة.');
  }
  function describeAlternatives(options) {
    const first=options[0];
    if(!first) return;
    first.label=options.length===1?'الجدول الموافق للشروط':'الأقرب إلى تفضيلاتك';
    first.icon=priorities.find(v=>v.key===first.mode).icon;
    const used=new Set();
    for(const row of options.slice(1)){
      const actual=[
        ['compact',row.days.length<first.days.length,'أيام حضور أقل','calendar'],
        ['early',row.last<first.last,'انتهاء أبكر للمحاضرات','clock'],
        ['academic',row.unlocked.length>first.unlocked.length,'يفتح مقررات أكثر','route'],
        ['gaps',row.gaps<first.gaps,'انتظار أقل بين المحاضرات','clock'],
        ['stability',row.moved.length<first.moved.length,'تغييرات أقل في الشُّعب','register']
      ].filter(a=>a[1]&&!used.has(a[0]));
      const choice=actual.find(a=>a[0]===row.mode)||actual[0];
      if(choice){used.add(choice[0]);row.label=choice[2];row.icon=choice[3];}
      else{row.label='جدول بديل';row.icon='calendar';}
    }
  }
  function search(preferences={}) {
    const profile=M().getProfile(), defaults=defaultPreferences(profile);
    const p={...defaults,...preferences};
    p.credits=Math.max(0,Math.min(M().maxCredits||18,Math.floor(Number(p.credits)||0)));
    p.maxDays=Math.max(1,Math.min(5,Math.floor(Number(p.maxDays)||5)));
    p.avoidDay=Number(p.avoidDay);
    p.avoidDays=Array.isArray(p.avoidDays)?[...new Set(p.avoidDays.filter(day=>Number.isInteger(day)&&day>=0&&day<5&&day!==p.avoidDay))]:[];
    p.endBy=Number.isInteger(p.endBy)&&p.endBy>=0&&p.endBy<=1440?p.endBy:null;
    const expected={profileId:profile.id,registration:{...profile.registration}};
    const result={preferences:p,expected,profileKey:sessionKey(profile),options:[],examined:0,feasibleCount:0,bestLoad:0,tips:[]};
    const registered=M().stats(profile).registered;
    if(registered>p.credits) {
      result.tips.push('يتضمن تسجيلك الحالي '+n(registered)+' ساعة. ارفع العبء المستهدف إلى هذا العدد أو أكثر، أو راجع حذف مقرر أولًا من صفحة التسجيل.');
      return result;
    }
    const all=enumerate(profile,p.lockSections,p.credits), feasible=all.filter(r=>matches(r,p));
    result.examined=all.length; result.feasibleCount=feasible.length;
    result.bestLoad=feasible.reduce((max,r)=>Math.max(max,r.credits),0);
    const best=feasible.filter(r=>r.credits===result.bestLoad);
    if(result.bestLoad<p.credits) {
      const relaxedCandidates=p.lockSections&&registered?enumerate(profile,false,p.credits):all;
      result.tips=readings(relaxedCandidates,p,result.bestLoad);
      if(!result.tips.length) result.tips.push(result.bestLoad?'أعلى عبء ممكن بهذه الشعب والشروط هو '+n(result.bestLoad)+' ساعة.':'جرّب توسيع فترة المحاضرات أو عدد أيام الحضور معًا، ثم أعد المقارنة.');
    }
    const modes=[p.priority,'compact','early','academic','balanced'].filter((v,i,a)=>priorities.some(k=>k.key===v)&&a.indexOf(v)===i);
    const taken=new Set();
    for(const mode of modes){
      const alternative=best.filter(v=>!taken.has(v.key)).sort((a,b)=>rank(a,mode)-rank(b,mode)||a.key.localeCompare(b.key))[0];
      if(!alternative) break;
      taken.add(alternative.key); result.options.push({...alternative,mode});
      if(result.options.length===3) break;
    }
    describeAlternatives(result.options);
    return result;
  }
  function prepare(preferences={}) {
    const result=search(preferences);
    state={key:result.profileKey,prefs:result.preferences,result,confirmed:null};
    return result;
  }
  function ensureState() {
    const p=M().getProfile(), key=sessionKey(p);
    if(!state || state.key!==key) {
      prepare(defaultPreferences(p));
    }
  }
  const menu = (id,title,choices,value) => '<label class="opt-field"><span>'+title+'</span><select name="'+id+'">'+choices.map(([key,label])=>'<option value="'+e(key)+'" '+(String(value)===String(key)?'selected':'')+'>'+e(label)+'</option>').join('')+'</select></label>';
  function form(p){
    const enrolled=M().stats().registered>0;
    const extra=[];
    if(p.endBy!=null) extra.push('<label class="opt-toggle"><input name="keepEnd" type="checkbox" checked> الانتهاء حتى <bdi>'+clock(p.endBy)+'</bdi></label>');
    if(p.avoidDays.length) extra.push('<label class="opt-toggle"><input name="keepDays" type="checkbox" checked> استبعاد '+p.avoidDays.map(i=>M().days[i]).join('، ')+'</label>');
    const imported=extra.length?'<div class="opt-note opt-formend" style="margin-block:8px 14px"><strong>تفضيلات من المرشد</strong>'+extra.join('')+'</div>':'';
    return '<form id="opt-form" class="opt-editor"><div class="opt-headline"><span class="opt-symbol">'+icon('sliders',21)+'</span><div><h2>تفضيلات الجدول</h2><p>اضبط العبء ووقت المحاضرات، ثم قارن الجداول القابلة للتسجيل.</p></div></div><div class="opt-fields">'+
      menu('credits','العبء المستهدف',[3,6,9,12,15,18].map(v=>[v,n(v)+' ساعة']),p.credits)+
      menu('maxDays','أقصى أيام حضور',[[1,'يوم واحد'],[2,'يومان'],[3,'ثلاثة أيام'],[4,'أربعة أيام'],[5,'خمسة أيام']],p.maxDays)+
      menu('time','فترة المحاضرات',[['any','كل الأوقات'],['morning','تنتهي حتى ١٤:٠٠'],['afternoon','تبدأ من ١٢:٠٠']],p.time)+
      menu('avoidDay','اليوم المستبعد',[[-1,'دون استبعاد'],...M().days.map((d,i)=>[i,d])],p.avoidDay)+
      menu('priority','أولوية المفاضلة',priorities.map(v=>[v.key,v.label]),p.priority)+'</div>'+imported+'<div class="opt-formend">'+
      (enrolled?'<label class="opt-toggle"><input type="checkbox" name="lockSections" '+(p.lockSections?'checked':'')+'><span>الاحتفاظ بأرقام الشُّعب الحالية</span></label>':'<span class="opt-small">تُفحص المتطلبات السابقة والمقاعد المتاحة عند البحث.</span>')+
      '<button type="submit" class="btn primary">'+icon('sparkles',17)+'احسب الجداول</button></div></form>';
  }
  function stripes(row) {
    const bars=M().days.map((d,i)=>{
      const sections=Object.entries(row.registration).map(([code,id])=>({course:M().course(code),s:M().section(code,id)})).filter(x=>x.s.days.includes(i));
      return '<div class="opt-stripe"><small>'+d+'</small><div>'+sections.map(x=>'<i style="inset-inline-start:'+((minutes(x.s.start)-480)/600*100)+'%;width:'+((minutes(x.s.end)-minutes(x.s.start))/600*100)+'%;background:'+e(x.course.color)+'" title="'+e(x.course.name)+'"></i>').join('')+'</div></div>';
    }).join('');
    return '<div class="opt-stripes" aria-label="توزيع محاضرات الأسبوع بين الثامنة صباحًا والسادسة مساءً">'+bars+'</div>';
  }
  function resultCard(row,idx){
    const stats='<div class="opt-stats"><div><b>'+n(row.credits)+'</b><small>ساعة معتمدة</small></div><div><b>'+n(row.days.length)+'</b><small>أيام حضور</small></div><div><b dir="ltr">'+clock(row.last)+'</b><small>آخر انتهاء</small></div></div>';
    const planned='إضافة '+n(row.added.length)+' · تبديل '+n(row.moved.length);
    return '<article class="opt-card '+(!idx?'opt-first':'')+'"><header><span class="opt-symbol">'+icon(row.icon,18)+'</span><h3>'+row.label+'</h3></header>'+stats+stripes(row)+
      '<div class="opt-facts"><span>فترات الانتظار</span><b>'+n(row.gaps)+' دقيقة / أسبوع</b><span>مقررات تُفتح بعد الاجتياز</span><b>'+n(row.unlocked.length)+'</b></div><div class="opt-review"><small>'+planned+'</small><button type="button" class="btn" data-opt="review" data-opt-index="'+idx+'">مراجعة الجدول</button></div></article>';
  }
  function output(result){
    const count=result.options.length;
    const title=count?'الجداول المقترحة':'تعذّر تحقيق الشروط';
    const desc=count?'عُثر على '+n(result.feasibleCount)+' توليفة موافقة للشروط ضمن العبء المستهدف. تُعرض البدائل الأقرب إلى '+n(result.preferences.credits)+' ساعة.':'حافظ البحث على مقرراتك المسجّلة وفحص المقاعد والمتطلبات وتعارض المواعيد.';
    return '<section class="opt-results" aria-live="polite"><div class="opt-resultshead"><div><h2>'+title+'</h2><p>'+desc+'</p></div></div>'+
      (result.tips.length?'<div class="opt-note">'+icon('info',18)+'<div>'+result.tips.map(t=>'<p>'+e(t)+'</p>').join('')+'</div></div>':'')+
      (count?'<div class="opt-grid">'+result.options.map(resultCard).join('')+'</div><div id="madar-interpret" data-context="optimizer"></div>':'')+'</section>';
  }
  function summaryFacts() {
    ensureState();
    const {preferences:p,options,tips}=state.result;
    if(!options.length) return '';
    const time=({any:'كل الأوقات',morning:'كل المحاضرات تنتهي بحلول ١٤:٠٠',afternoon:'كل المحاضرات تبدأ من ١٢:٠٠'})[p.time];
    const avoided=M().days.filter((day,i)=>i===p.avoidDay||p.avoidDays.includes(i));
    const all=[[
      'تفضيلات الطالب', 'الهدف '+n(p.credits)+' ساعة','الحد الأقصى '+n(p.maxDays)+' أيام',time,
      p.endBy===null?'':'آخر وقت للانتهاء '+clock(p.endBy),
      avoided.length?'الأيام المستبعدة '+avoided.join(' و'):'',
      p.lockSections?'الشعب الحالية مثبتة':'يجوز تبديل الشعب الحالية',
      'أولوية المفاضلة '+(priorities.find(v=>v.key===p.priority)?.label||'الجدول المتوازن')
    ].filter(Boolean).join('، ')];
    options.forEach((o,i)=>{
      const courses=Object.entries(o.registration).map(([code,id])=>M().course(code).name+' (شعبة '+id+')');
      all.push(['الخيار '+n(i+1)+' «'+o.label+'»',n(o.credits)+' ساعة معتمدة','أيام الحضور '+o.days.map(d=>M().days[d]).join(' و'),
        'آخر انتهاء '+clock(o.last),'الانتظار الأسبوعي '+n(o.gaps)+' دقيقة','مقررات لاحقة تكتمل متطلباتها السابقة بعد اجتياز هذا الجدول '+n(o.unlocked.length),
        'المقررات '+courses.join('، ')].join('، '));
    });
    return [...all,...tips].join('\n');
  }
  function render(){
    ensureState(); return '<section class="opt-page"><div class="page-intro"><h1>مخطط الجداول الذكي</h1><p>قارن أثر مواعيد الشُّعب على أيام حضورك وتقدّمك في الخطة.</p></div>'+
      form(state.prefs)+output(state.result)+'</section>';
  }
  function stillCurrent(){
    if(!state||state.result.profileKey!==sessionKey(M().getProfile())){
      U().closeModal(); U().render(); U().toast('تغيّر تسجيلك. أُعيد حساب الخيارات من جدولك الحالي.'); return false;
    }
    return true;
  }
  function review(index){
    if(!stillCurrent()) return;
    const row=state.result.options[index];
    if(!row) return;
    state.confirmed=index;
    const changes=row.added.length+row.moved.length;
    const entries=Object.entries(row.registration).map(([code,id])=>{
      const c=M().course(code),s=M().section(code,id), saved=state.result.expected.registration[code];
      const tag=!saved?'إضافة':saved!==id?'تبديل الشعبة':'مسجّل';
      return '<div class="opt-class"><div><strong>'+e(c.name)+'</strong><small>'+e(s.days.map(i=>M().days[i]).join('، '))+' · <bdi>'+e(s.start)+'–'+e(s.end)+'</bdi> · شعبة <bdi>'+e(id)+'</bdi></small></div><span class="opt-tag '+(saved===id?'':'opt-changed')+'">'+tag+'</span></div>';
    }).join('');
    const impact=row.unlocked.length?'<p class="opt-impact">'+icon('route',16)+' عند اجتياز هذا الجدول تستوفي المتطلبات السابقة لـ '+row.unlocked.slice(0,3).map(c=>'«'+e(M().course(c).name)+'»').join('، ')+(row.unlocked.length>3?' وغيرها':'')+'.</p>':'';
    U().modal('مراجعة الجدول المقترح','<div class="opt-dialog"><p class="quiet">'+n(row.credits)+' ساعة معتمدة ضمن '+n(row.days.length)+' أيام حضور.</p>'+entries+impact+
      '<div class="detail-action">'+(changes?'<button class="btn primary" data-opt="apply">تأكيد تسجيل الجدول</button>':'<span class="quiet">هذا هو جدولك المسجّل حاليًا.</span>')+'<button class="btn" data-opt="close">إغلاق</button></div></div>');
  }
  document.addEventListener('change',ev=>{
    const form=ev.target.closest('#opt-form');
    if(!form) return;
    const results=form.parentElement.querySelector('.opt-results');
    if(results) results.innerHTML='<div class="opt-note">'+icon('info',18)+'<p>تغيّرت تفضيلاتك. اختر «احسب الجداول» لعرض الخيارات الجديدة.</p></div>';
    state.confirmed=null;
  });
  document.addEventListener('submit',ev=>{
    if(ev.target.id!=='opt-form') return;
    ev.preventDefault(); const f=new FormData(ev.target);
    const prefs={credits:Number(f.get('credits')),maxDays:Number(f.get('maxDays')),time:f.get('time'),avoidDay:Number(f.get('avoidDay')),priority:f.get('priority'),lockSections:f.has('lockSections')};
    prefs.endBy=f.has('keepEnd')?state.prefs.endBy:null;
    prefs.avoidDays=f.has('keepDays')?state.prefs.avoidDays:[];
    prepare(prefs); U().render();
  });
  document.addEventListener('click',ev=>{
    const el=ev.target.closest('[data-opt]'); if(!el) return;
    if(el.dataset.opt==='close') {U().closeModal();return;}
    if(el.dataset.opt==='review') {review(Number(el.dataset.optIndex));return;}
    if(el.dataset.opt!=='apply'||!stillCurrent()||state.confirmed===null) return;
    const row=state.result.options[state.confirmed]; state.confirmed=null;
    const applied=M().applyPlan(row.registration,state.result.expected);
    U().closeModal(); U().render(); U().toast(applied.message||'تم تحديث الجدول.');
    if(applied.ok) U().go('schedule');
  });
  window.MadarOptimize={search,render,prepare,summaryFacts};
})();
