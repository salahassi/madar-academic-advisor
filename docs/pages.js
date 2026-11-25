(() => {
  'use strict';

  const state = {
    profileId: '',
    regFilter: 'offered',
    query: '',
    planFilter: 'all',
    deferCourse: '',
    gpa: '4.50',
    hours: '15'
  };
  const numbers = new Intl.NumberFormat('ar-SA');
  const n = value => numbers.format(value);
  const esc = value => window.UI.esc(String(value ?? ''));
  const icon = (name, size=18) => window.UI.icon(name, size);
  const M = () => window.Madar;
  const attr = value => esc(value);
  const levels = ['الأول','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن'];
  const statusText = {completed:'مجتاز',registered:'مسجّل',eligible:'متاح',locked:'متطلب سابق'};
  const statusColor = {completed:'good',registered:'blue',eligible:'',locked:'amber'};
  let dialogIntent = null;

  function resetForProfile() {
    const p = M().getProfile();
    if (p.id !== state.profileId) {
      state.profileId = p.id;
      state.regFilter = 'offered';
      state.query = '';
      state.planFilter = 'all';
      state.gpa = '4.50';
      state.hours = String(M().stats().registered || 15);
      state.deferCourse = '';
      dialogIntent = null;
    }
  }
  function badge(text, color='') {
    return '<span class="ac-tag '+color+'">'+esc(text)+'</span>';
  }
  function courseStatus(course) {
    const status = M().status(course.code);
    if (status === 'eligible' && !course.sections.length) return badge('غير مطروح');
    return badge(statusText[status], statusColor[status]);
  }
  function head(title, subtitle, action='') {
    return '<div class="ac-titlebar"><div><h1>'+esc(title)+'</h1><p>'+esc(subtitle)+'</p></div>'+action+'</div>';
  }
  function btn(label, action, data='', cls='', ico='') {
    return '<button type="button" class="ac-button '+cls+'" data-ac="'+action+'" '+data+'>'+(ico ? icon(ico) : '')+esc(label)+'</button>';
  }
  function tabGroup(tabs, selected, action, label) {
    return '<div class="ac-tabs" role="group" aria-label="'+attr(label)+'">'+tabs.map(([key,text]) =>
      '<button type="button" class="ac-tab" data-ac="'+action+'" data-value="'+attr(key)+'" aria-pressed="'+(key===selected)+'">'+esc(text)+'</button>'
    ).join('')+'</div>';
  }
  function summary(title, subtitle, label, value, max, unit) {
    const progress = Math.min(100, Math.round(value/max*100));
    return '<div class="ac-summary"><div><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div><div><div class="ac-sumlabels"><span>'+esc(label)+'</span><strong>'+n(value)+' / '+n(max)+'</strong></div><div class="ac-track" role="progressbar" aria-label="'+esc(label)+'" aria-valuenow="'+value+'" aria-valuemin="0" aria-valuemax="'+max+'"><i style="width:'+progress+'%"></i></div><p>'+esc(unit)+'</p></div></div>';
  }
  function catalogueRow(c) {
    return '<button type="button" class="ac-planrow" data-ac="detail" data-code="'+attr(c.code)+'"><strong>'+esc(c.name)+'</strong><bdi class="ac-code">'+esc(c.code)+'</bdi><span class="ac-subline">'+n(c.credits)+' ساعات</span><span>'+courseStatus(c)+'</span></button>';
  }
  function plan() {
    const m = M(), p = m.getProfile(), stats = m.stats();
    const filters = [['all','كل المستويات'],['completed','المجتازة'],['registered','المسجّلة'],['left','المتبقية']];
    let grouped = '';
    for (let term=1; term<=8; term++) {
      const all = m.courses.filter(c=>c.term===term);
      const list = all.filter(c=>{
        const s=m.status(c.code);
        return state.planFilter==='all' || (state.planFilter==='left' ? !['completed','registered'].includes(s) : s===state.planFilter);
      });
      if (!list.length) continue;
      const done = all.filter(c=>m.status(c.code)==='completed').length;
      const current = term === p.level;
      const open = current || state.planFilter!=='all';
      const label = done===all.length ? badge('مكتمل','good') : current ? badge('المستوى الحالي','blue') : '';
      grouped += '<details class="ac-level" '+(open?'open':'')+'><summary><div class="ac-levellabel"><strong>المستوى '+levels[term-1]+'</strong>'+label+'</div><div class="ac-levelmeta"><span>'+n(list.length)+' مقررات · '+n(list.reduce((a,c)=>a+c.credits,0))+' ساعة</span><span class="ac-chevron">'+icon('chevronDown',16)+'</span></div></summary><div class="ac-planrows">'+list.map(catalogueRow).join('')+'</div></details>';
    }
    return '<div class="ac-page">'+head('خطتي الدراسية','تابع المقررات المطلوبة وتقدّمك من المستوى الأول حتى التخرج.',btn('تحليل أثر المقررات','goto','data-route="insights"','','network'))+
      summary('بكالوريوس '+p.major,'خطة من ثمانية مستويات دراسية تشمل متطلبات الجامعة والتخصص.','الساعات المجتازة',stats.completed,stats.total,'ساعات معتمدة من متطلبات التخرج')+
      '<section class="ac-panel"><div class="ac-panelhead"><h2>مقررات الخطة</h2>'+tabGroup(filters,state.planFilter,'planfilter','تصفية المقررات')+'</div>'+ (grouped || '<div class="ac-empty">لا توجد مقررات في هذه الفئة حاليًا.</div>')+'</section></div>';
  }
  function daysAndTime(section) {
    return section.days.map(d=>M().days[d]).join('، ')+' · <bdi>'+esc(section.start)+' – '+esc(section.end)+'</bdi>';
  }
  function courseCard(c) {
    const m = M(), p=m.getProfile(), status=m.status(c.code);
    const selected = status==='registered' ? m.section(c.code,p.registration[c.code]) : null;
    const missing = c.prereqs.filter(code=>!p.completed.includes(code)).map(code=>m.course(code)?.name || code);
    let meta = esc(c.group)+' · '+n(c.credits)+' ساعات معتمدة';
    let detail = selected ? 'الشعبة '+esc(selected.id)+' · '+daysAndTime(selected) : missing.length ? 'يلزم اجتياز '+esc(missing.join('، ')) : c.sections.length ? n(c.sections.length)+' شعب مطروحة' : 'الطرح متوقع في فصل لاحق';
    const data='data-code="'+attr(c.code)+'"';
    const action = status==='registered' ? '<button type="button" class="ac-smallbtn" data-ac="sections" '+data+'>تبديل الشعبة</button><button type="button" class="ac-smallbtn ghost" data-ac="drop" '+data+'>حذف</button>' :
      status==='eligible' && c.sections.length ? '<button type="button" class="ac-smallbtn" data-ac="sections" '+data+'>اختيار شعبة</button>' :
      '<button type="button" class="ac-smallbtn ghost" data-ac="detail" '+data+'>التفاصيل</button>';
    return '<article class="ac-course"><div class="ac-course-top"><bdi class="ac-code">'+esc(c.code)+'</bdi>'+courseStatus(c)+'</div><div><h3>'+esc(c.name)+'</h3><span class="ac-subline">'+meta+'</span></div><div class="ac-cardfoot"><span class="ac-subline">'+detail+'</span><span class="ac-rowactions">'+action+'</span></div></article>';
  }
  function normalize(text) {
    return text.toLowerCase().replace(/[\u064B-\u065F\u0670]/g,'').replace(/[ً-ْـ]/g,'').replace(/[إأآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
  }
  function filteredCourses() {
    const m = M(), query=normalize(state.query);
    return m.courses.filter(c=>{
      const status=m.status(c.code);
      if (state.regFilter==='registered' && status!=='registered') return false;
      if (state.regFilter==='offered' && (!c.sections.length || !['eligible','registered'].includes(status))) return false;
      return !query || normalize(c.name+' '+c.code+' '+c.group).includes(query);
    }).sort((a,b)=>a.term-b.term || a.code.localeCompare(b.code));
  }
  function registrationList() {
    const list=filteredCourses();
    return list.length ? list.map(courseCard).join('') : '<div class="ac-empty">'+icon('search',24)+(state.query?'لم نعثر على مقرر يطابق البحث. جرّب رمز المقرر أو جزءًا من اسمه.':state.regFilter==='registered'?'لم تسجّل أي مقرر بعد. اعرض المقررات المطروحة لاختيار شعبتك الأولى.':'لا توجد مقررات تطابق هذه التصفية.')+'</div>';
  }
  function register() {
    const m=M(), stats=m.stats();
    const filters=[['offered','المطروحة لي'],['registered','المسجّلة'],['all','دليل المقررات']];
    return '<div class="ac-page">'+head('تسجيل المقررات','اختر مقرراتك وشُعبك وتحقّق من أثر أي تعديل قبل تثبيته.',btn('ابنِ جدولي حسب تفضيلاتي','goto','data-route="optimizer"','strong','calendarClock'))+
      summary('التسجيل للفصل الدراسي الأول','تُراجع المتطلبات السابقة وتعارض المواعيد وتوافر المقاعد عند كل عملية.','العبء المسجّل',stats.registered,18,n(stats.courseCount)+' مقررات مسجّلة من أصل ١٨ ساعة متاحة في الفصل')+
      '<section aria-label="المقررات"><div class="ac-toolbar">'+tabGroup(filters,state.regFilter,'regfilter','تصفية دليل المقررات')+'<label class="ac-search">'+icon('search',18)+'<input type="search" id="ac-course-search" placeholder="ابحث باسم المقرر أو رمزه" aria-label="ابحث في المقررات" value="'+attr(state.query)+'"></label></div><div class="ac-coursegrid" id="ac-course-results">'+registrationList()+'</div></section></div>';
  }
  function courseDetail(code) {
    const m=M(), c=m.course(code); if(!c) return;
    const prereqs=c.prereqs.map(pre=>m.course(pre)?.name || pre);
    const successors=m.successors(code).map(s=>s.name);
    let action='';
    const s=m.status(code);
    if (['registered','eligible'].includes(s) && c.sections.length) action=btn(s==='registered'?'عرض الشُّعب المسجّلة والبديلة':'عرض الشُّعب المتاحة','sections','data-code="'+attr(code)+'"','strong');
    const first='<div class="ac-dialoghead"><bdi class="ac-code">'+esc(code)+'</bdi><div class="ac-detailbits">'+courseStatus(c)+'<span>'+n(c.credits)+' ساعات · المستوى '+levels[c.term-1]+'</span></div></div>';
    window.UI.modal(c.name,'<div class="ac-dialog">'+first+'<p>'+esc(c.description)+'</p><div><h3>المتطلبات السابقة</h3><p>'+esc(prereqs.length?prereqs.join('، '):'يمكن دراسة المقرر دون متطلبات سابقة.')+'</p></div>'+(successors.length?'<div><h3>مقررات تعتمد عليه</h3><p>'+esc(successors.join('، '))+'</p></div>':'')+'<div class="ac-dialog-actions">'+action+btn('إغلاق','cancel')+'</div></div>');
  }
  function sectionsDialog(code) {
    const m=M(), p=m.getProfile(), c=m.course(code); if(!c) return;
    const current=p.registration[code], kind=current?'swap':'add';
    const entries=c.sections.map(s=>({s, check:m.preview(kind,code,s.id)}));
    const first=entries.find(x=>x.check.ok && x.s.id!==current);
    const options=entries.map(({s,check})=>{
      const same=s.id===current;
      const available=check.ok && !same;
      let label=same ? badge('مسجّلة حاليًا','blue') : available ? badge(n(s.seats)+' مقاعد','good') : badge('غير متاحة','amber');
      return '<label class="ac-option"><input type="radio" name="ac-section" value="'+attr(s.id)+'" '+(available?'':'disabled')+' '+(first?.s.id===s.id?'checked':'')+'><div class="ac-optbody"><div class="ac-optline"><strong>شعبة '+esc(s.id)+'</strong>'+label+'</div><p class="ac-subline">'+daysAndTime(s)+' · '+esc(s.room)+'</p><p class="ac-subline">'+esc(s.instructor)+'</p>'+(!available&&!same?'<p class="ac-subline">'+esc(check.message)+'</p>':'')+'</div></label>';
    }).join('');
    dialogIntent={kind,code,profile:p.id};
    window.UI.modal(current?'تبديل الشعبة':'اختيار الشعبة','<div class="ac-dialog"><div class="ac-dialoghead"><h3>'+esc(c.name)+'</h3><span class="ac-code">'+esc(code)+'</span></div><div class="ac-optlist">'+options+'</div><div class="ac-dialog-actions">'+btn('مراجعة التعديل','review',first?'':'disabled','strong')+btn('إلغاء','cancel')+'</div></div>');
  }
  function confirmIntent(kind,code,sectionId) {
    const m=M(), p=m.getProfile(), c=m.course(code); if(!c) return;
    const check=m.preview(kind,code,sectionId);
    const newSection=sectionId && m.section(code,sectionId);
    const heading=kind==='drop'?'تأكيد حذف المقرر':kind==='swap'?'تأكيد تبديل الشعبة':'تأكيد إضافة المقرر';
    const desc=kind==='drop'?'سيُحذف المقرر من جدولك لهذا الفصل.':kind==='swap'?'سيُنقل تسجيلك إلى الشعبة المحددة.':'سيُضاف المقرر إلى جدولك لهذا الفصل.';
    dialogIntent={kind,code,sectionId,profile:p.id};
    const change='<div class="ac-result"><span>العبء الدراسي بعد التعديل</span><strong>'+n(check.before)+' ← '+n(check.after)+' ساعة</strong></div>';
    window.UI.modal(heading,'<div class="ac-dialog"><div class="ac-dialoghead"><h3>'+esc(c.name)+'</h3><bdi class="ac-code">'+esc(code)+'</bdi></div><p>'+esc(check.ok?desc:check.message)+'</p>'+(newSection?'<p class="ac-subline">الشعبة '+esc(newSection.id)+' · '+daysAndTime(newSection)+'</p>':'')+(check.ok?change:'')+(check.impact?'<div class="'+(kind==='drop'?'ac-warn':'ac-info')+'">'+esc(check.impact)+'</div>':'')+'<div class="ac-dialog-actions">'+btn(kind==='drop'?'تأكيد الحذف':'تثبيت التعديل','commit',check.ok?'':'disabled',kind==='drop'?'danger':'strong')+btn('إلغاء','cancel')+'</div></div>');
  }
  function gpaResult() {
    const m=M(), term=Number(state.gpa), hours=Number(state.hours);
    if(!state.gpa || !state.hours || !Number.isFinite(term) || !Number.isInteger(hours) || term<0 || term>5 || hours<1 || hours>18) return '<div class="ac-warn">أدخل معدلًا من ٠ إلى ٥ وعدد ساعات صحيحًا بين ١ و١٨.</div>';
    const next=m.simulateGpa(term,hours);
    return '<div class="ac-result"><span>المعدل التراكمي المتوقع</span><strong class="ac-bignum">'+Number(next).toFixed(2)+' <small style="font-size:.9rem">/ 5</small></strong><span class="ac-subline">تقدير مبني على المعدل الفصلي المفترض و'+n(hours)+' ساعة محتسبة.</span></div>';
  }
  function deferResult() {
    const m=M(), p=m.getProfile(), code=state.deferCourse;
    if(!code || !p.registration[code]) return '<div class="ac-empty">سجّل مقررًا أولًا حتى تتمكّن من اختبار أثر تأجيله.</div>';
    const check=m.preview('drop',code), courses=m.successors(code).filter(c=>!p.completed.includes(c.code));
    return '<div class="ac-result"><span>عبء الفصل بعد التأجيل</span><strong>'+n(check.after)+' ساعة بدلًا من '+n(check.before)+'</strong><span class="ac-subline">'+esc(check.impact)+'</span></div>'+(courses.length?'<div><strong>مقررات لاحقة تعتمد عليه</strong><p class="ac-fieldhelp">'+esc(courses.map(c=>c.name).join('، '))+'</p></div>':'')+(!check.ok?'<div class="ac-warn">'+esc(check.message)+'</div>':'');
  }
  function simulator() {
    const m=M(), p=m.getProfile(), current=Object.keys(p.registration).map(c=>m.course(c)).filter(Boolean);
    if(!p.registration[state.deferCourse]) state.deferCourse=current[0]?.code || '';
    return '<div class="ac-page">'+head('محاكاة القرارات','جرّب أثر الخيارات على معدلك وخطتك قبل تعديل تسجيلك.')+'<div class="ac-simulator"><section class="ac-panel"><div class="ac-panelhead"><div><h2>ماذا لو أجّلت مقررًا؟</h2><p>اعرف أثر التأجيل على عبء الفصل والمقررات اللاحقة.</p></div></div><div class="ac-formbody">'+(current.length?'<label class="ac-field">المقرر المسجّل<select id="ac-defer">'+current.map(c=>'<option value="'+attr(c.code)+'" '+(c.code===state.deferCourse?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></label>':'')+'<div id="ac-defer-result">'+deferResult()+'</div>'+btn('فتح التسجيل','goto','data-route="register"','','book')+'</div></section><section class="ac-panel"><div class="ac-panelhead"><div><h2>محاكاة المعدل التراكمي</h2><p>أدخل توقعاتك لهذا الفصل على مقياس ٥ نقاط.</p></div></div><div class="ac-formbody"><div class="ac-formrow"><label class="ac-field">المعدل الفصلي المتوقع<input id="ac-gpa-value" type="number" min="0" max="5" step=".01" dir="ltr" value="'+attr(state.gpa)+'"></label><label class="ac-field">الساعات المحتسبة<input id="ac-gpa-hours" type="number" min="1" max="18" step="1" dir="ltr" value="'+attr(state.hours)+'"></label></div><div id="ac-gpa-result" aria-live="polite">'+gpaResult()+'</div><p class="ac-fieldhelp">الحساب يفترض اجتياز ساعات جديدة، وفق الساعات والمعدل المثبتين في ملفك.</p></div></section></div></div>';
  }
  function render(route) {
    resetForProfile();
    return route==='register'?register():route==='simulator'?simulator():plan();
  }
  document.addEventListener('click', event=>{
    const el=event.target.closest?.('[data-ac]'); if(!el || el.disabled) return;
    const action=el.dataset.ac, code=el.dataset.code;
    if(action==='goto') window.UI.go(el.dataset.route);
    else if(action==='cancel') window.UI.closeModal();
    else if(action==='planfilter') {state.planFilter=el.dataset.value;window.UI.render();}
    else if(action==='regfilter') {state.regFilter=el.dataset.value;window.UI.render();}
    else if(action==='detail') courseDetail(code);
    else if(action==='sections') sectionsDialog(code);
    else if(action==='drop') confirmIntent('drop',code);
    else if(action==='review' && dialogIntent) {
      const selection=document.querySelector('input[name="ac-section"]:checked');
      if(selection) confirmIntent(dialogIntent.kind,dialogIntent.code,selection.value);
    } else if(action==='commit' && dialogIntent) {
      if(dialogIntent.profile!==M().getProfile().id) {window.UI.closeModal();return;}
      const {kind,code:c,sectionId}=dialogIntent;
      const result=M().commit(kind,c,sectionId);
      dialogIntent=null;window.UI.closeModal();window.UI.render();
      window.UI.toast(result.message+(result.ok && result.receipt?' · '+result.receipt:''));
    }
  });
  document.addEventListener('input', event=>{
    const el=event.target;
    if(el.id==='ac-course-search'){
      state.query=el.value;document.getElementById('ac-course-results').innerHTML=registrationList();
    } else if(el.id==='ac-gpa-hours' || el.id==='ac-gpa-value'){
      if(el.id==='ac-gpa-hours') state.hours=el.value; else state.gpa=el.value;
      document.getElementById('ac-gpa-result').innerHTML=gpaResult();
    }
  });
  document.addEventListener('change',event=>{
    if(event.target.id==='ac-defer'){
      state.deferCourse=event.target.value;document.getElementById('ac-defer-result').innerHTML=deferResult();
    }
  });
  window.Pages={render};
})();
