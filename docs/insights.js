(() => {
  'use strict';
  const M = () => window.Madar;
  const ui = () => window.UI;
  const num = n => Number(n).toLocaleString('ar-SA');
  const esc = text => ui().esc(String(text ?? ''));
  const icon = (name, size = 20) => ui().icon(name, size);
  const scenarios = new Map();
  const prompts = ['أحب تحليل البيانات وبناء النماذج', 'أريد حماية الشبكات والأنظمة', 'أستمتع بتصميم تجارب المستخدم'];
  function options(profile) {
    if (!scenarios.has(profile.id)) scenarios.set(profile.id, {tab:'impact', code:'', cap:15, annual:false, goal:'', submitted:''});
    return scenarios.get(profile.id);
  }
  function nextCourses(profile, catalog) {
    const registered = catalog.filter(c => Object.hasOwn(profile.registration,c.code));
    if (registered.length) return registered;
    const proposal = {...profile, registration:{}};
    return catalog.filter(c => {
      if (c.term !== profile.level) return false;
      const section = c.sections.find(s => M().preview('add',c.code,s.id,proposal).ok);
      if (!section) return false;
      proposal.registration[c.code] = section.id;
      return true;
    });
  }
  function dependencies(catalog) {
    const children = new Map(catalog.map(c => [c.code,[]]));
    catalog.forEach(c => c.prereqs.forEach(p => children.get(p)?.push(c)));
    const reach = new Map();
    function downstream(code, active = new Set()) {
      if (reach.has(code)) return reach.get(code);
      if (active.has(code)) return new Set();
      const path = new Set(active).add(code);
      const result = new Set();
      (children.get(code) || []).forEach(c => {
        result.add(c.code);
        downstream(c.code,path).forEach(id => result.add(id));
      });
      reach.set(code,result);
      return result;
    }
    catalog.forEach(c=>downstream(c.code));
    return reach;
  }
  function project(profile, seeds, delayed, opts, reach) {
    const catalog=M().courses, complete = new Set(profile.completed);
    const chosen = seeds.filter(c => c.code !== delayed);
    const terms = [{level:profile.level,list:chosen}];
    const placement = new Map(chosen.map(c => [c.code,profile.level]));
    chosen.forEach(c=>complete.add(c.code));
    const order = [...catalog].sort((a,b) => a.term-b.term || reach.get(b.code).size-reach.get(a.code).size || a.code.localeCompare(b.code));
    const maxTerm = profile.level + catalog.length * 2 + 2;
    for (let level = profile.level+1; complete.size < catalog.length && level <= maxTerm; level++) {
      const term = [];
      let hours = 0;
      for (const c of order) {
        if (complete.has(c.code) || c.term>level || c.credits+hours>opts.cap) continue;
        if (opts.annual && (level-c.term)%2) continue;
        if (c.prereqs.some(code => !complete.has(code))) continue;
        term.push(c);
        hours += c.credits;
      }
      term.forEach(c => {complete.add(c.code); placement.set(c.code,level);});
      terms.push({level,list:term});
      if (!term.length && terms.length>3 && terms.slice(-2).every(t=>!t.list.length) && level>=Math.max(...catalog.map(c=>c.term))) break;
    }
    return {terms,placement,finish:complete.size>=catalog.length ? terms[terms.length-1].level : null};
  }
  function analyse(profile, opts) {
    const catalog=M().courses, reach=dependencies(catalog);
    const seeds=nextCourses(profile,catalog).sort((a,b)=>reach.get(b.code).size-reach.get(a.code).size || a.code.localeCompare(b.code));
    const selected=seeds.find(c=>c.code===opts.code) || seeds[0];
    if (!selected) return {seeds};
    const baseline=project(profile,seeds,null,opts,reach);
    const deferred=project(profile,seeds,selected.code,opts,reach);
    const linked=catalog.filter(c=>reach.get(selected.code).has(c.code) && !profile.completed.includes(c.code));
    const later=linked.filter(c=>{
      const a=baseline.placement.get(c.code),b=deferred.placement.get(c.code);
      return a!=null && b!=null && b>a;
    });
    return {selected,seeds,baseline,deferred,linked,later};
  }
  function courseButton(c) {
    return '<button type="button" data-ac="detail" data-code="'+esc(c.code)+'" class="intel-course"><bdi>'+esc(c.code)+'</bdi> '+esc(c.name)+'</button>';
  }
  function metric(label,value,detail,accent) {
    return '<div class="intel-metric '+accent+'"><span>'+label+'</span><b>'+value+'</b><small>'+detail+'</small></div>';
  }
  function termLabel(n) {return n==null?'غير متاح':'الفصل '+num(n);}
  const interpretSlot = '<div id="madar-interpret" data-context="insights"></div>';
  function renderImpact(p,state) {
    const a=analyse(p,state);
    if(!a.selected) return '<div class="intel-card intel-panel"><h2>اختر مقررات فصلك أولًا</h2><p>يبدأ التحليل بالمقررات المسجّلة أو بخيارات المستوى الحالي التي يمكن جمعها في جدول واحد.</p><button class="btn" data-go="register">فتح التسجيل</button></div>';
    const fresh=!Object.keys(p.registration).length;
    const {selected,baseline,deferred}=a;
    const finishA=baseline.finish, finishB=deferred.finish;
    const delta = finishA!==null && finishB!==null ? finishB-finishA : null;
    const changeLabel=delta===null?'غير محسوم':delta===0?'نفس الفصل':delta>0?'تأخّر '+num(delta)+' فصل':'تقدّم '+num(-delta)+' فصل';
    const lead=fresh?'عند بناء جدولك الأول، «'+esc(selected.name)+'» يرتبط بـ '+num(a.linked.length)+' من مقرراتك اللاحقة.':'في جدولك الحالي، يعتمد '+num(a.linked.length)+' من المقررات اللاحقة على «'+esc(selected.name)+'» مباشرةً أو عبر مقررات أخرى.';
    const optionsHTML=a.seeds.map(c=>'<option value="'+c.code+'" '+(c.code===selected.code?'selected':'')+'>'+esc(c.name)+' · '+c.code+'</option>').join('');
    const timeline=deferred.terms.map(t=>{
      const bt=baseline.terms.find(x=>x.level===t.level);
      return '<details class="intel-term"><summary><span>'+termLabel(t.level)+'</span><b>'+num((bt?.list||[]).reduce((sum,c)=>sum+c.credits,0))+' / '+num(t.list.reduce((sum,c)=>sum+c.credits,0))+' ساعة</b>'+icon('chevronDown',15)+'</summary><div class="intel-term-plans"><div><strong>الخطة الأساسية</strong><p>'+((bt?.list||[]).map(c=>esc(c.name)).join('، ')||'لا توجد مقررات.')+'</p></div><div><strong>بعد التأجيل</strong><p>'+(t.list.map(c=>esc(c.name)).join('، ')||'لا توجد مقررات.')+'</p></div></div></details>';
    }).join('');
    return '<section class="intel-card intel-impact"><div class="intel-card-title"><span class="intel-icon">'+icon('route',22)+'</span><div><h2>ماذا يحدث لو أجّلت مقررًا؟</h2><p>قارن خطتين للفصول المتبقية حتى اكتمال متطلبات التخرج.</p></div></div>'+
      '<div class="intel-fields"><label>المقرر المراد تأجيله<select data-intel-field="code">'+optionsHTML+'</select></label><label>العبء لكل فصل قادم<select data-intel-field="cap">'+[12,15,18].map(v=>'<option value="'+v+'" '+(state.cap===v?'selected':'')+'>'+num(v)+' ساعة</option>').join('')+'</select></label><label>افتراض الطرح المستقبلي<select data-intel-field="rotation"><option value="term" '+(!state.annual?'selected':'')+'>كل فصل</option><option value="year" '+(state.annual?'selected':'')+'>مرة كل سنة</option></select></label></div>'+
      '<div class="intel-result" aria-live="polite"><div><span class="intel-icon mint">'+icon('activity',20)+'</span><p>'+lead+'</p></div><div class="intel-metrics">'+
      metric('اكتمال المتطلبات بالخطة الأساسية',termLabel(finishA),'وفق الافتراضات المحددة','')+metric('اكتمال المتطلبات بعد التأجيل',termLabel(finishB),changeLabel,'indigo')+
      metric('مقررات لاحقة تغيّر فصلها',num(a.later.length),'من أصل '+num(a.linked.length)+' مقررات مترابطة','')+'</div></div>'+interpretSlot+
      '<details class="intel-notes"><summary>'+icon('info',16)+'افتراضات الحساب</summary><p>'+ (fresh?'بدأنا بجدول افتراضي من مقررات مستواك ذات الشُّعب المتاحة. ':'بدأنا بمقرراتك المسجّلة لهذا الفصل. ')+'في سيناريو التأجيل يبقى مكان المقرر شاغرًا في الفصل الحالي. للفصول التالية نفترض النجاح في المحاولة الأولى، ونملأ الساعات بحسب مستوى كل مقرر ومتطلباته، مع إعطاء الأولوية للمقرر الذي يفتح خيارات أكثر في المستوى نفسه. عند اختيار الطرح السنوي نفترض فصلين سنويًا وطرح المقرر في الفصل المناظر لمستواه. التقديرات مرتبطة بهذه الافتراضات، ومواعيد الطرح والسعة المستقبلية تحتاج تأكيد الجامعة.</p></details></section>'+
      '<div class="intel-secondary"><section class="intel-card intel-panel"><h2>'+icon('layers',20)+' المقررات المرتبطة</h2><p>ترتيب مقررات تتطلب اجتياز «'+esc(selected.name)+'».</p>'+
      (a.linked.length?'<div class="intel-tablewrap"><table><thead><tr><th>المقرر</th><th>أساسي</th><th>بعد التأجيل</th></tr></thead><tbody>'+a.linked.map(c=>'<tr><td>'+courseButton(c)+'</td><td>'+num(baseline.placement.get(c.code))+'</td><td class="'+(a.later.includes(c)?'intel-delay':'')+'">'+num(deferred.placement.get(c.code))+'</td></tr>').join('')+'</tbody></table></div>':'<div class="intel-neutral">هذا المقرر يستكمل جزءًا من ساعات الخطة. يمكن دراسة بقية المقررات بحسب متطلباتها الخاصة.</div>')+
      '</section><section class="intel-card intel-panel"><h2>'+icon('calendar',20)+' الخطتان فصلًا بفصل</h2><p>الساعات الأساسية / الساعات بعد التأجيل. افتح أي فصل لعرض مقرراته.</p>'+timeline+'</section></div>';
  }
  function careerResults(p,goal) {
    const rec=window.MadarML?.recommend(goal,p);
    const near=[],later=[];
    if (!rec?.recognized) return {recognized:false,near,later};
    for (const item of rec.items || []) {
      const c=typeof item.course==='string'?M().course(item.course):item.course;
      if (!c || p.completed.includes(c.code)) continue;
      const status=M().status(c.code,p);
      const canAdd=status==='eligible' && c.sections.some(s=>M().preview('add',c.code,s.id,p).ok);
      const canSwap=status==='registered';
      const missing=c.prereqs.filter(id=>!p.completed.includes(id)).map(id=>M().course(id)?.name || id);
      const stateLabel=canSwap?'مسجّل في جدولك':canAdd?'متاح للإضافة':missing.length?'متطلبات سابقة':'للتخطيط القادم';
      (canAdd || canSwap ? near : later).push({c,canAdd,canSwap,missing,stateLabel,reason:item.reason||c.description});
    }
    return {recognized:true,near:near.slice(0,4),later:later.slice(0,4)};
  }
  function careerGroup(title,items) {
    if(!items.length) return '';
    return '<section class="intel-career-group"><h3>'+title+'</h3>'+items.map(({c,canAdd,canSwap,missing,stateLabel,reason})=>{
      const action=canAdd || canSwap ? '<button type="button" class="btn" data-ac="sections" data-code="'+esc(c.code)+'">'+(canSwap?'الشُّعب المسجّلة والبديلة':'مراجعة الشُّعب')+'</button>':'<button type="button" class="btn" data-ac="detail" data-code="'+esc(c.code)+'">تفاصيل المقرر</button>';
      return '<article class="intel-skill-course"><div><div class="intel-skill-head"><strong>'+esc(c.name)+'</strong><bdi>'+esc(c.code)+'</bdi></div><p>'+esc(reason)+'</p><small>'+esc(stateLabel)+(missing.length?' · '+esc(missing.join('، ')):'')+'</small></div>'+action+'</article>';
    }).join('')+'</section>';
  }
  function renderCareer(p,state) {
    let output='';
    if(state.submitted) {
      const {recognized,near,later}=careerResults(p,state.submitted);
      if(!recognized) output='<div class="intel-neutral" role="status">لم يتضح المجال من الوصف. أضف مهارة أو نوع مشروع تحب تنفيذه، ثم جرّب مجددًا.</div>';
      else {
        output='<div class="intel-career-result" aria-live="polite"><h2>المسار المقترح لهدفك</h2><p>'+esc(state.submitted)+'</p>'+
          (near.length?careerGroup('خطوات ممكنة في هذا الفصل',near):'<div class="intel-neutral">لم يظهر مقرر مطابق يمكن إضافته إلى جدولك الحالي. افتح متطلبات المقررات أدناه للتخطيط للفصول المقبلة.</div>')+
          careerGroup('مقررات تُخطّط لها في الفصول القادمة',later)+'</div>';
      }
    }
    return '<section class="intel-card intel-panel"><div class="intel-card-title"><span class="intel-icon mint">'+icon('compass',22)+'</span><div><h2>ما العمل الذي تود القيام به؟</h2><p>يحلّل نموذج التوصية وصفك ويقترح مقررات من تخصصك مع مراعاة ما اجتزته والشُّعب المتاحة لك.</p></div></div>'+
      '<form class="intel-goal" id="intel-goal-form"><label for="intel-goal">مهاراتك أو هدفك المهني</label><textarea maxlength="350" rows="2" id="intel-goal" required placeholder="مثلاً، أريد أن أستخرج أنماطًا من بيانات العملاء وأعرضها بصريًا">'+esc(state.goal)+'</textarea><div class="intel-goal-actions"><div>'+prompts.map((str,i)=>'<button type="button" class="intel-prompt" data-intel-prompt="'+i+'">'+str+'</button>').join('')+'</div><button type="submit" class="btn primary">'+icon('target',17)+'تحليل هدفي</button></div></form>'+output+(state.submitted?interpretSlot:'')+'</section>';
  }
  function summaryFacts() {
    const p=M().getProfile(),s=options(p);
    if(s.tab==='career') {
      if(!s.submitted) return '';
      const r=careerResults(p,s.submitted);
      if(!r.recognized) return 'هدف الطالب المدخل '+JSON.stringify(s.submitted)+' لم يحدّد مجالًا معروفًا للنموذج، ولا توجد توصيات لهذا الاستعلام.';
      const details=[...r.near,...r.later].map(x=>x.c.name+' ('+x.c.code+')، '+x.stateLabel+(x.missing.length?'، متطلبات لم تُجتز بعد: '+x.missing.join('، '):'')+'، سبب التوصية: '+x.reason);
      return ['هدف الطالب المدخل '+JSON.stringify(s.submitted)+'.','نتائج المطابقة في تخصص '+p.major+'، من المستوى '+num(p.level)+'.',...details].join('\n');
    }
    const a=analyse(p,s);
    if(!a.selected) return '';
    const label=c=>c.name+' ('+c.code+')';
    const delta=a.baseline.finish!==null&&a.deferred.finish!==null?a.deferred.finish-a.baseline.finish:null;
    return ['محاكاة تأجيل '+label(a.selected)+' من '+termLabel(a.baseline.placement.get(a.selected.code))+' إلى '+termLabel(a.deferred.placement.get(a.selected.code))+'.',
      'اكتمال المتطلبات في الخطة الأساسية: '+termLabel(a.baseline.finish)+'، وبعد التأجيل: '+termLabel(a.deferred.finish)+'، والفرق بالفصول: '+(delta===null?'غير محسوم':num(delta))+'.',
      'مقررات لاحقة ترتبط بالمقرر: '+num(a.linked.length)+'، ويتأخر '+num(a.later.length)+' منها عند إعادة التخطيط.'+(a.later.length?' أمثلة: '+a.later.slice(0,3).map(c=>label(c)+' من '+termLabel(a.baseline.placement.get(c.code))+' إلى '+termLabel(a.deferred.placement.get(c.code))).join('، '):''),
      'نقطة البداية '+(Object.keys(p.registration).length?'تسجيل الطالب الحالي.':'جدول مبدئي من شعب متاحة، لم يُثبّت.')+' نفترض اجتياز كل المقررات من المحاولة الأولى، وعدم استبدال المقرر المؤجل في هذا الفصل، وسقف '+num(s.cap)+' ساعة لكل فصل مستقبلي.',
      'نفترض الطرح '+(s.annual?'سنوياً في الفصل المناظر لمستوى المقرر وبواقع فصلين في السنة.':'كل فصل بعد بلوغ مستوى المقرر.')+' النتائج تقديرات مشروطة بهذه الافتراضات، والسعة والطرح الفعليان تحددهما الجامعة.'
    ].join('\n');
  }
  function render() {
    const p=M().getProfile(),state=options(p);
    return '<div class="intel-view"><div class="page-intro"><h1>تحليل المسار الأكاديمي</h1><p>اختبر أثر قراراتك على التخرج وابحث عن مقررات تخدم أهدافك المهنية.</p></div><nav class="intel-tabs" aria-label="أدوات تحليل المسار">'+[['impact','route','أثر تأجيل مقرر'],['career','compass','مساري المهني']].map(([id,ico,title])=>'<button type="button" data-intel-tab="'+id+'" aria-pressed="'+(state.tab===id)+'" class="'+(state.tab===id?'current':'')+'">'+icon(ico,17)+title+'</button>').join('')+'</nav>'+(state.tab==='career'?renderCareer(p,state):renderImpact(p,state))+'</div>';
  }
  function brief() {
    const p=M().getProfile(),a=analyse(p,options(p));
    if(!a.selected) return '';
    return '<section class="surface insight intel-brief"><span class="heading-icon violet">'+icon('activity',20)+'</span><div><h3>تحليل مسارك الدراسي</h3><p>يرتبط مقرر «'+esc(a.selected.name)+'» بـ '+num(a.linked.length)+' من مقرراتك اللاحقة. قارن أثر تأجيله على خطتك.</p></div><button class="panel-link" data-intel-open="impact">استكشف الأثر '+icon('chevronLeft',14)+'</button></section>';
  }
  document.addEventListener('click',event=>{
    const el=event.target.closest?.('[data-intel-tab],[data-intel-prompt],[data-intel-open]');
    if(!el) return;
    const s=options(M().getProfile());
    if(el.hasAttribute('data-intel-open')) {s.tab=el.dataset.intelOpen;ui().go('insights');return;}
    if(el.hasAttribute('data-intel-tab')) s.tab=el.dataset.intelTab;
    else {s.goal=prompts[Number(el.dataset.intelPrompt)];s.submitted=s.goal;}
    ui().render();
    if(el.hasAttribute('data-intel-tab')) document.querySelector('[data-intel-tab="'+s.tab+'"]')?.focus();
  });
  document.addEventListener('change',event=>{
    const el=event.target;
    if(!el.dataset?.intelField) return;
    const s=options(M().getProfile());
    if(el.dataset.intelField==='cap') s.cap=Number(el.value);
    if(el.dataset.intelField==='rotation') s.annual=el.value==='year';
    if(el.dataset.intelField==='code') s.code=el.value;
    ui().render();
    document.querySelector('[data-intel-field="'+el.dataset.intelField+'"]')?.focus();
  });
  document.addEventListener('input',event=>{if(event.target.id==='intel-goal') options(M().getProfile()).goal=event.target.value;});
  document.addEventListener('submit',event=>{
    if(event.target.id!=='intel-goal-form') return;
    event.preventDefault();
    const s=options(M().getProfile());
    s.goal=document.getElementById('intel-goal').value.trim();
    if(!s.goal) {ui().toast('اكتب مهارة أو هدفًا مهنيًا أولًا.');return;}
    s.submitted=s.goal;ui().render();
  });
  window.MadarInsights={render,brief,analyse,summaryFacts};
})();
