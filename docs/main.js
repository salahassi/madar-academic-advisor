(() => {
  'use strict';
  const M = window.Madar;
  const icon = window.siteIcon;
  const $ = id => document.getElementById(id);
  const esc = text => String(text ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const routes = {
    dashboard:['لوحة الطالب','grid'], schedule:['جدولي الأسبوعي','calendar'], plan:['الخطة الدراسية','route'],
    register:['تسجيل المقررات','register'], advisor:['المرشد الذكي','sparkles'], simulator:['محاكاة المعدل والتأجيل','sliders'], optimizer:['مخطط الجداول','calendarClock'], insights:['تحليل مساري','network'], history:['سجل العمليات','file']
  };
  const asOf = new Date('2026-11-25T09:00:00+03:00');
  const demoDate = new Intl.DateTimeFormat('ar-SA-u-ca-gregory',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Riyadh'}).format(asOf);
  const ordinals = ['','الأول','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن'];
  let selectedDay = 3, noticeRead = false, pageRoute = '';
  const route = () => Object.hasOwn(routes, location.hash.slice(1)) ? location.hash.slice(1) : 'dashboard';
  const navLink = key => '<a class="nav-link '+(route()===key?'active':'')+'" href="#'+key+'" '+(route()===key?'aria-current="page"':'')+'>'+icon(routes[key][1],19)+'<span>'+routes[key][0]+'</span></a>';
  function renderShell(){
    const p = M.getProfile();
    const initials = p.name.split(' ').map(n=>n[0]).slice(0,2).join(' ');
    $('sidebar').innerHTML='<a href="#dashboard" class="brand" aria-label="مدار، لوحة الطالب"><img src="assets/mark.svg" alt=""><div><b>مدار</b><span>الإرشاد الجامعي</span></div></a>'+
      '<p class="nav-heading">مساحة الطالب</p><nav class="nav-group">'+['dashboard','schedule','plan','register'].map(navLink).join('')+'</nav>'+
      '<p class="nav-heading">الإرشاد والأدوات</p><nav class="nav-group">'+['advisor','optimizer','insights','simulator','history'].map(navLink).join('')+'</nav>'+
      '<div class="side-bottom"><button class="nav-foot" data-do="help">'+icon('help',19)+'دليل المنصة</button><button class="side-user" data-do="profile" title="عرض الملف أو تبديل الطالب"><span class="avatar">'+esc(initials)+'</span><span class="who"><b>'+esc(p.name)+'</b><small>'+esc(p.major)+'</small></span>'+icon('chevronDown',15)+'</button></div>';
    $('topbar').innerHTML='<div class="breadcrumbs"><button class="icon-button mobile-menu" data-do="menu" aria-expanded="'+document.body.classList.contains('menu-open')+'" aria-label="فتح قائمة التنقل">'+icon('menu')+'</button><span>مساحة الطالب</span>'+icon('chevronLeft',14)+'<strong>'+routes[route()][0]+'</strong></div>'+
      '<div class="bar-tools"><span class="bar-date">'+icon('calendar',16)+demoDate+'</span><div class="bell-wrap"><button class="icon-button notification '+(!noticeRead?'has-notice':'')+'" data-do="notifications" aria-label="الإشعارات">'+icon('bell',20)+'</button></div></div>';
  }
  function stat(title, val, unit, ico, color){
    return '<div class="stat"><div><div class="stat-title">'+title+'</div><div><strong dir="ltr">'+val+'</strong><span class="stat-note">'+unit+'</span></div></div><span class="stat-icon '+color+'">'+icon(ico,20)+'</span></div>';
  }
  function lecture(item){
    const c=item.course,s=item.section;
    return '<button class="lecture" data-course="'+esc(c.code)+'"><i class="lecture-rail" style="background:'+c.color+'"></i><span class="lecture-text"><span class="lecture-name">'+esc(c.name)+'</span><span class="class-meta"><bdi class="code">'+esc(c.code)+'</bdi><span>·</span>'+icon('pin',12)+'<span>'+esc(s.room)+'</span></span></span><span class="lecture-time"><b>'+esc(s.start)+'</b><span>'+esc(s.end)+'</span></span></button>';
  }
  function dayCard(){
    return '<section class="surface"><div class="panel-head"><div class="panel-title">'+icon('calendar',21)+'<h2>جدول المحاضرات</h2></div><a class="panel-link" href="#schedule">عرض الأسبوع '+icon('chevronLeft',13)+'</a></div>'+
      '<div class="day-tabs" aria-label="أيام المحاضرات">'+M.days.map((d,i)=>'<button class="day-tab '+(i===selectedDay?'selected':'')+'" aria-pressed="'+(i===selectedDay)+'" data-day="'+i+'">'+d+'</button>').join('')+'</div><div class="course-list">'+(M.schedule(selectedDay).map(lecture).join('')||'<p class="day-empty">جدولك خالٍ من المحاضرات لهذا اليوم.</p>')+'</div></section>';
  }
  function progressCard(){
    const s=M.stats(),end=(s.completed+s.registered)/s.total*100;
    const row=(text,number,color)=>'<div class="legend-row"><i style="background:'+color+'"></i><span>'+text+'</span><b>'+number+'</b></div>';
    return '<section class="surface"><div class="panel-head"><div class="panel-title">'+icon('target',21)+'<h2>التقدم في الخطة</h2></div><a class="panel-link" href="#plan">عرض الخطة '+icon('chevronLeft',13)+'</a></div><div class="progress-content"><div class="donut-wrap"><div class="donut" style="--pc:'+s.percent+'%;--pr:'+end+'%"><div class="donut-label"><b>'+s.percent+'<small style="font:600 17px Arial">%</small></b><small>نسبة الإنجاز</small></div></div></div><div class="legend">'+row('ساعات مجتازة',s.completed,'#385fc9')+row('ساعات مسجّلة',s.registered,'#90b5ff')+row('ساعات غير مسجّلة',s.remaining,'#dfe5ef')+'</div></div></section>';
  }
  function dashboard(){
    const p=M.getProfile(),s=M.stats();
    const intro=p.level===1&&!s.registered?'اختر مقررات فصلك الأول وابنِ جدولك مع المرشد الأكاديمي.':'تخصص '+p.major+'<span aria-hidden="true"> &nbsp;·&nbsp; </span> المستوى '+ordinals[p.level]+'<span aria-hidden="true"> &nbsp;·&nbsp; </span> بكالوريوس';
    return '<section class="hero"><div class="hero-copy"><span class="season"><span class="dot"></span> الفصل الدراسي الأول ٢٠٢٦ / ٢٠٢٧</span><h1>أهلًا بك في مدار</h1><p>'+intro+'</p><div class="hero-acts"><button class="hero-btn" data-do="voice">'+icon('mic',17)+' محادثة صوتية</button><button class="hero-outline" data-go="advisor">'+icon('message',16)+' اكتب للمرشد</button></div></div></section>'+
      '<div class="ai-launches"><a href="#optimizer" class="ai-launch"><span class="ai-launch-icon plan-ic">'+icon('calendarClock',23)+'</span><span class="launch-body"><b>ابنِ جدولي</b><small>قارن جداول تناسب أيام حضورك وأوقاتك.</small></span>'+icon('chevronLeft',17)+'</a><a href="#insights" class="ai-launch"><span class="ai-launch-icon path-ic">'+icon('network',23)+'</span><span class="launch-body"><b>حلّل مساري</b><small>اكتشف مقررات هدفك المهني وأثر تأجيلها.</small></span>'+icon('chevronLeft',17)+'</a></div>'+
      '<div class="sectionheading"><h2>نظرة أكاديمية</h2><span class="term-label">ملخص الفصل الحالي</span></div><div class="stat-grid">'+
      stat('المعدل التراكمي',s.gpa==null?'—':Number(s.gpa).toFixed(2),'من 5','chart','teal')+stat('الساعات المجتازة',s.completed,'من '+s.total,'cap','cobalt')+stat('الساعات المسجّلة',s.registered,'ساعة','book','violet')+stat('مقررات الفصل',s.courseCount,'مقررات','layers','amber')+'</div>'+
      '<div class="dash-panels">'+dayCard()+progressCard()+'</div>'+window.MadarInsights.brief();

  }
  function schedulePage(){
    return '<div class="page-intro"><h1>جدولي الأسبوعي</h1><p>مواعيد المحاضرات وقاعات الشُّعب المسجّلة في الفصل الأول.</p></div><div class="week-grid">'+M.days.map((d,i)=>'<section class="week-day"><h3>'+d+'</h3>'+ (M.schedule(i).map(({course:c,section:s})=>'<button class="week-class" style="--accent:'+c.color+'" data-course="'+c.code+'"><b>'+c.name+'</b><span dir="ltr">'+s.start+' – '+s.end+'</span><small>'+s.room+'</small></button>').join('')||'<p>لا توجد محاضرات.</p>')+'</section>').join('')+'</div><div class="detail-action"><button class="btn primary" data-go="register">'+icon('register',17)+'تعديل التسجيل</button><button class="btn" data-go="optimizer">'+icon('calendarClock',17)+'قارن جداول بديلة</button></div>';
  }
  function historyPage(){
    const records=M.getProfile().history.slice().sort((a,b)=>new Date(b.time)-new Date(a.time));
    return '<div class="page-intro"><h1>سجل العمليات</h1><p>إيصالات عمليات الإضافة والحذف وتبديل الشُّعب المنفّذة لهذا الطالب.</p></div><section class="surface large-card">'+(records.length?records.map(h=>'<div class="record-line"><div><b>'+esc(h.text)+'</b><br><small>'+esc(new Date(h.time).toLocaleString('ar-SA-u-ca-gregory'))+'</small></div><small dir="ltr">'+esc(h.id)+'</small></div>').join(''):'<h2 style="font-size:18px">لا توجد عمليات جديدة</h2><p class="quiet">عند تثبيت تعديل على جدولك، سيظهر إيصال العملية هنا.</p><div class="detail-action"><button class="btn" data-go="register">الانتقال إلى التسجيل</button></div>')+'</section>';
  }
  function render(){
    const key=route();
    if(pageRoute==='advisor' && key!=='advisor') {window.MadarVoice.stop(); window.MadarGen.cancel?.();}
    renderShell();
    let content;
    if(key==='dashboard') content=dashboard();
    else if(key==='schedule') content=schedulePage();
    else if(key==='history') content=historyPage();
    else if(key==='advisor') content=window.Advisor.render();
    else if(key==='optimizer') content=window.MadarOptimize.render();
    else if(key==='insights') content=window.MadarInsights.render();
    else content=window.Pages.render(key);
    $('page').innerHTML=content;
    if(key==='optimizer'||key==='insights') window.MadarInterpret.controls();
    document.title=routes[key][0]+' | مدار';
    if(pageRoute!==key) window.scrollTo(0,0);
    pageRoute=key;
  }
  function closeMenu(){document.body.classList.remove('menu-open');$('backdrop').hidden=true;const b=document.querySelector('.mobile-menu');if(b)b.setAttribute('aria-expanded','false');}
  function closeModal(){if($('dialog').open)$('dialog').close();}
  function modal(title,content){closeMenu();$('dialog-title').textContent=title;$('dialog-content').innerHTML=content;if(!$('dialog').open)$('dialog').showModal();}
  function toast(msg){const el=document.createElement('div');el.className='toast-item';el.textContent=msg;$('toasts').replaceChildren(el);setTimeout(()=>el.remove(),4200);}
  function go(key){if(!routes[key])return;closeModal();closeMenu();if(route()===key)render();else{history.pushState(null,'','#'+key);render();}}
  function courseModal(code){
    const c=M.course(code);if(!c)return;
    const p=M.getProfile(),s=p.registration[c.code]?M.section(code,p.registration[c.code]):null;
    const row=(label,val)=>'<div class="detail-row"><span>'+label+'</span><b>'+esc(val)+'</b></div>';
    modal(c.name,'<p class="dialog-intro">'+esc(c.description)+'</p>'+row('رمز المقرر',c.code)+row('الساعات المعتمدة',c.credits)+(s?row('الشعبة',s.id)+row('المحاضر',s.instructor)+row('القاعة',s.room)+row('أيام المحاضرات',s.days.map(i=>M.days[i]).join('، ')):'')+'<div class="detail-action"><button class="btn primary" data-question="'+esc('ما أثر تأجيل '+c.code+'؟')+'">'+icon('sparkles',17)+'اسأل عن المقرر</button><button class="btn" data-go="register">التسجيل والشُّعب</button></div>');
  }
  function profileDialog(){
    const p=M.getProfile(); modal('الملف الأكاديمي','<p class="dialog-intro">اختر ملفًا تجريبيًا لاستكشاف رحلة طالب مستجد أو طالب في المستوى الخامس. تُحفظ تغييرات كل ملف في هذا المتصفح.</p><div class="dialog-section">'+M.profiles.map(u=>{
      const current=u.id===p.id;return '<button class="profile-choice '+(current?'selected':'')+'" data-profile="'+u.id+'"><span class="avatar">'+esc(u.name.split(' ').map(n=>n[0]).slice(0,2).join(' '))+'</span><span class="who"><b>'+esc(u.name)+'</b><small>'+esc(u.level===5?'علوم الحاسب · المستوى الخامس':'علوم الحاسب · المستوى الأول')+'</small></span>'+icon(current?'checkCircle':'chevronLeft',18)+'</button>';
    }).join('')+'</div><div class="detail-row"><span>رمز السيناريو التجريبي</span><b dir="ltr">'+p.id+'</b></div>');
  }
  function help(){
    modal('دليل منصة مدار','<p class="dialog-intro">منصة إرشاد جامعي بملفات طلاب تجريبية. يطابق نموذج تعلّم آلي أهدافك مع المقررات، ويقارن مخطط الجداول الشعب المتاحة وفق أوقاتك.</p><div class="help-list"><div><strong>تجربة المستجد</strong><p>من ملف الطالب أسفل القائمة، اختر «تجربة بداية الدراسة»، ثم اطلب من المرشد اقتراح جدول الفصل الأول.</p></div><div><strong>تجربة الطالب المستمر</strong><p>اختر «تجربة المستوى الخامس» وقارن الجداول، أو اكتب هدفك المهني في «تحليل مساري» لترى المقررات التي تدعم هدفك. يمكنك من صفحة المرشد بدء محادثة صوتية أو تفعيل النموذج اللغوي المحلي.</p></div></div><div class="detail-action"><button class="btn primary" data-do="profile">اختيار ملف طالب</button><button class="btn" data-go="advisor">فتح المرشد</button></div>');
  }
  function notifications(){
    noticeRead=true;renderShell();const p=M.getProfile(),h=p.history[0];modal('الإشعارات','<div class="help-list"><div><strong>التسجيل متاح للفصل الأول</strong><p>يمكنك مراجعة المقررات المطروحة والشُّعب من صفحة التسجيل.</p></div>'+(h?'<div><strong>تحديث في سجلك</strong><p>'+esc(h.text)+'</p></div>':'')+'</div><div class="detail-action"><button class="btn primary" data-go="register">فتح التسجيل</button></div>');
  }
  window.UI={icon,esc,modal,closeModal,toast,go,render};
  $('close-dialog').innerHTML=icon('x',19);
  $('close-dialog').onclick=closeModal;
  $('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const a=$('dialog').getBoundingClientRect();if(e.clientX<a.left||e.clientX>a.right||e.clientY<a.top||e.clientY>a.bottom)closeModal();}});
  $('backdrop').onclick=closeMenu;
  document.addEventListener('click',e=>{
    const el=e.target.closest('button,a');if(!el)return;
    if(el.matches('.nav-link,.brand')){closeMenu();return;}
    const d=el.dataset;
    if(d.go){go(d.go);return;}
    if(d.day!==undefined){selectedDay=Number(d.day);render();return;}
    if(d.course){courseModal(d.course);return;}
    if(d.question){closeModal();go('advisor');window.Advisor.ask(d.question);return;}
    if(d.profile){window.MadarVoice.stop();window.MadarGen.cancel?.();M.setProfile(d.profile);noticeRead=false;closeModal();go('dashboard');toast('تم فتح ملف '+M.getProfile().name);return;}
    if(d.do==='voice'){go('advisor');window.MadarVoice.open();return;}
    if(d.do==='menu'){document.body.classList.add('menu-open');$('backdrop').hidden=false;el.setAttribute('aria-expanded','true');}
    if(d.do==='profile')profileDialog();if(d.do==='help')help();if(d.do==='notifications')notifications();
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
  window.addEventListener('storage',e=>{if(e.key==='madar-public-scenarios-v1'){window.MadarVoice.stop();closeModal();render();}});
  function openRoute(){
    const voiceRequested=location.hash==='#voice';
    if(voiceRequested)history.replaceState(null,'','#advisor');
    closeModal();
    closeMenu();
    render();
    if(voiceRequested)window.MadarVoice.open();
  }
  window.addEventListener('hashchange',openRoute);
  openRoute();
})();
