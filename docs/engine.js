/* Academic catalog, degree audit and simulated registration for the Madar campus. */
(() => {
  "use strict";
  const days = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"];
  const university = "متطلبات الجامعة";
  const college = "متطلبات الكلية";
  const major = "متطلبات التخصص";
  const elective = "مقررات اختيارية";
  const plan = [
    [
      ["CS101","مقدمة في علوم الحاسب",college,[],"أساسيات الحوسبة وتمثيل المعلومات وحل المشكلات."],
      ["MATH101","التفاضل والتكامل ١",college,[],"الدوال والنهايات والمشتقات وتطبيقاتها."],
      ["ENG101","اللغة الإنجليزية ١",university,[],"القراءة والاستماع والتواصل في البيئة الجامعية."],
      ["UNI101","مهارات التعلّم الجامعي",university,[],"تنظيم الدراسة والتعلّم الذاتي والبحث عن المصادر."],
      ["ARAB101","مهارات الكتابة العربية",university,[],"الكتابة العلمية والتعبير والتحرير باللغة العربية."]
    ],
    [
      ["CS102","البرمجة ١",college,["CS101"],"تصميم البرامج باستخدام الشروط والتكرار والدوال."],
      ["MATH102","التفاضل والتكامل ٢",college,["MATH101"],"التكامل والمتسلسلات وتطبيقاتهما."],
      ["ENG102","اللغة الإنجليزية ٢",university,["ENG101"],"القراءة الأكاديمية وعرض الأفكار باللغة الإنجليزية."],
      ["PHYS101","الفيزياء العامة",college,[],"المبادئ الفيزيائية للأنظمة الهندسية والحاسوبية."],
      ["ISL101","الثقافة الإسلامية",university,[],"الأخلاق والقيم الإسلامية وتطبيقاتها المعاصرة."]
    ],
    [
      ["CS201","البرمجة كائنية التوجه",major,["CS102"],"بناء البرامج باستخدام الكائنات والواجهات والوراثة."],
      ["CS202","الرياضيات المتقطعة",college,["MATH101"],"المجموعات والمنطق والتوافقيات والرسوم البيانية."],
      ["CS203","التصميم الرقمي",major,["CS101"],"الدارات المنطقية والأنظمة الرقمية."],
      ["MATH201","الجبر الخطي",college,["MATH101"],"المتجهات والمصفوفات والتحويلات الخطية."],
      ["UNI201","التفكير الناقد",university,[],"تحليل الحجج وتقييم الأدلة واتخاذ القرار."]
    ],
    [
      ["CS211","هياكل البيانات",major,["CS201"],"القوائم والأشجار والجداول الهاشية وتطبيقاتها."],
      ["CS212","تنظيم الحاسب",major,["CS203"],"المعالج والذاكرة وترابط مكونات الحاسب."],
      ["CS213","مبادئ نظم المعلومات",major,["CS102"],"نمذجة المعلومات ودورة حياتها في المؤسسات."],
      ["CS214","أسس تطوير الويب",major,["CS102"],"تقنيات الويب وواجهات التطبيقات."],
      ["TECH201","الكتابة التقنية",college,["ENG102"],"كتابة التقارير والمواصفات التقنية وعرض النتائج."]
    ],
    [
      ["CS301","تصميم وتحليل الخوارزميات",major,["CS211","CS202"],"تصميم الخوارزميات وتحليل كفاءتها ومقارنة استراتيجيات الحل."],
      ["CS302","نظم قواعد البيانات",major,["CS213"],"نمذجة قواعد البيانات العلائقية وتصميم الاستعلامات."],
      ["CS303","هندسة البرمجيات",major,["CS201"],"هندسة المتطلبات وتصميم البرمجيات واختبارها ضمن فريق."],
      ["CS304","نظم التشغيل",major,["CS212"],"إدارة الذاكرة والعمليات والملفات في أنظمة التشغيل."],
      ["STAT301","الاحتمالات والإحصاء",college,["MATH102"],"النماذج الاحتمالية والاستدلال الإحصائي وتحليل البيانات."]
    ],
    [
      ["CS311","مبادئ الذكاء الاصطناعي",major,["CS301","STAT301"],"البحث والتمثيل والاستدلال وبناء الأنظمة الذكية."],
      ["CS312","شبكات الحاسب",major,["CS212"],"مكونات الشبكات وبروتوكولات الاتصال وتطبيقاتها."],
      ["CS313","تطوير تطبيقات الجوال",major,["CS303"],"تصميم وبناء تطبيقات الجوال واختبارها."],
      ["CS314","تفاعل الإنسان والحاسب",elective,["CS201"],"تصميم واجهات قابلة للاستخدام وتقييم تجربة المستخدم."],
      ["UNI301","ريادة الأعمال التقنية",university,[],"دراسة الفرص التقنية وتصميم نموذج عمل أولي."]
    ],
    [
      ["CS401","تعلّم الآلة",elective,["CS311","MATH201"],"بناء نماذج تعلم الآلة وتقييم نتائجها."],
      ["CS402","مبادئ الأمن السيبراني",major,["CS312","CS304"],"أسس حماية الأنظمة والشبكات وإدارة المخاطر."],
      ["CS403","هندسة البيانات",major,["CS302","STAT301"],"تصميم مسارات البيانات وإدارتها للاستخدام التحليلي."],
      ["CS404","مشروع التخرج ١",major,["CS303","CS301"],"تصميم مشروع التخرج وبناء نموذج أولي."],
      ["CS405","الحوسبة السحابية",elective,["CS304"],"تصميم الخدمات الحاسوبية وتوزيع الموارد."]
    ],
    [
      ["CS411","مشروع التخرج ٢",major,["CS404"],"تنفيذ المشروع وتقييمه وعرض نتائجه."],
      ["CS412","التدريب الميداني",major,["CS303","CS312"],"تطبيق المهارات التقنية في بيئة عمل مهنية."],
      ["CS413","الأنظمة الموزعة",major,["CS304","CS312"],"التنسيق والاتساق في الأنظمة متعددة العُقد."],
      ["CS414","أخلاقيات الحوسبة",major,["TECH201"],"المسؤولية المهنية والأثر الاجتماعي للتقنية."],
      ["CS415","تصوّر البيانات",elective,["CS302"],"تحويل البيانات إلى رسوم تفاعلية تدعم اتخاذ القرار."]
    ]
  ];

  const colors = ["#4770cf", "#8862c5", "#309888", "#ca8651", "#5c829b"];
  const instructors = ["فريق تدريس (أ)", "فريق تدريس (ب)", "فريق تدريس (ج)", "فريق تدريس (د)", "فريق تدريس (هـ)"];
  const normalSlots = [
    [[0,2],"09:00","10:15"], [[1,3],"09:00","10:15"], [[0,2],"11:00","12:15"],
    [[1,3],"11:00","12:15"], [[3,4],"13:00","14:15"]
  ];
  const alternateSlots = [
    [[1,3],"14:30","15:45"], [[0,2],"13:00","14:15"], [[0,2],"14:30","15:45"],
    [[0,2],"09:00","10:15"], [[1,4],"10:30","11:45"]
  ];
  function makeSection(id, slot, room, instructor, seats) {
    return {id, days:slot[0], start:slot[1], end:slot[2], room, instructor, seats};
  }
  function offerings(term, index, code) {
    if (term===1 || term===5) {
      const floor = term===1 ? "١" : "٢";
      const room = "قاعة "+floor+"٠"+["١","٢","٣","٤","٥"][index];
      const sections = [
        makeSection("01",normalSlots[index],room,instructors[index],7+index),
        makeSection("02",alternateSlots[index],room,instructors[(index+1)%5],index===2?0:4+index)
      ];
      return sections;
    }
    if (code==="CS314") return [
      makeSection("01",[[0,4],"14:30","15:45"],"مختبر التصميم",instructors[2],6),
      makeSection("02",[[1,3],"09:00","10:15"],"قاعة ٣٠٤",instructors[2],3)
    ];
    if (code==="UNI301") return [makeSection("01",[[0,2],"16:00","17:15"],"قاعة ١١٢",instructors[1],9)];
    if (code==="CS312") return [makeSection("01",[[0,2],"09:00","10:15"],"مختبر الشبكات",instructors[3],0)];
    return [];
  }
  const courses = plan.flatMap((level,levelIndex)=>level.map(([code,name,group,prereqs,description],index)=>({
    code,name,group,prereqs,description,term:levelIndex+1,credits:3,color:colors[index],
    sections:offerings(levelIndex+1,index,code)
  })));
  const catalog = new Map(courses.map(item=>[item.code,item]));
  const profiles = [
    {id:"DEMO-05",name:"تجربة المستوى الخامس",major:"علوم الحاسب",level:5,gpa:4.32},
    {id:"DEMO-NEW",name:"تجربة بداية الدراسة",major:"علوم الحاسب",level:1,gpa:null}
  ];
  const storageKey = "madar-public-scenarios-v1";
  const MAX_CREDITS=18;
  const newId = () => typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  function initialData() {
    return {
      active:"DEMO-05",
      "DEMO-05":{registration:Object.fromEntries(courses.filter(c=>c.term===5).map(c=>[c.code,"01"])),history:[]},
      "DEMO-NEW":{registration:{},history:[]}
    };
  }
  let memory=initialData();
  function read() {
    try {
      const saved=JSON.parse(localStorage.getItem(storageKey));
      if (saved && profiles.some(p=>p.id===saved.active) && profiles.every(p=>saved[p.id]?.registration && Array.isArray(saved[p.id].history))) memory=saved;
    } catch (_) { /* Private contexts retain session memory. */ }
    return memory;
  }
  function write(data) {
    memory=data;
    try {localStorage.setItem(storageKey,JSON.stringify(data));} catch (_) { /* Session remains usable if storage is full. */ }
  }
  function getProfile() {
    const state=read(), info=profiles.find(p=>p.id===state.active);
    return {...info,completed:courses.filter(c=>c.term<info.level).map(c=>c.code),registration:{...state[info.id].registration},history:[...state[info.id].history]};
  }
  function setProfile(id) {
    if (!profiles.some(p=>p.id===id)) return false;
    write({...read(),active:id});
    return true;
  }
  const course = code => catalog.get(code);
  const section = (code,id) => course(code)?.sections.find(s=>s.id===id);
  function stats(profile=getProfile()) {
    const sum=codes=>codes.reduce((n,code)=>n+(course(code)?.credits||0),0);
    const completed=sum(profile.completed), registered=sum(Object.keys(profile.registration)), total=courses.reduce((n,c)=>n+c.credits,0);
    return {completed,registered,remaining:total-completed-registered,total,percent:Math.round(100*completed/total),gpa:profile.gpa,courseCount:Object.keys(profile.registration).length};
  }
  function status(code,profile=getProfile()) {
    const c=course(code);
    if (!c) return "locked";
    if (profile.completed.includes(code)) return "completed";
    if (profile.registration[code]) return "registered";
    return c.prereqs.every(pre=>profile.completed.includes(pre))?"eligible":"locked";
  }
  function schedule(day,profile=getProfile()) {
    const entries=[];
    for (const [code,id] of Object.entries(profile.registration)) {
      const s=section(code,id);
      if (!s) continue;
      for (const d of s.days) {
        if (day==null || d===Number(day)) entries.push({course:course(code),section:s,day:d});
      }
    }
    return entries.sort((a,b)=>a.day-b.day||a.section.start.localeCompare(b.section.start));
  }
  function successors(code) {
    const considered=new Set([code]);
    for (const c of courses) if (c.prereqs.some(p=>considered.has(p))) considered.add(c.code);
    considered.delete(code);
    return courses.filter(c=>considered.has(c.code));
  }
  const overlaps = (a,b) => a.start<b.end && b.start<a.end && a.days.some(d=>b.days.includes(d));
  function preview(kind,code,sectionId,profile=getProfile()) {
    const c=course(code), before=stats(profile).registered;
    const result={ok:false,message:"",impact:"",successors:[],before,after:before};
    const fail=message=>({...result,message});
    if (!c || !["add","drop","swap"].includes(kind)) return fail("تعذّر تحديد المقرر أو نوع الطلب.");
    const current=profile.registration[code];
    if (kind==="add" && current) return fail("المقرر مسجّل بالفعل. اختر تبديل الشعبة لتعديل موعده.");
    if (kind!=="add" && !current) return fail("المقرر غير مسجّل في جدولك.");
    if (kind==="add" && profile.completed.includes(code)) return fail("سبق لك اجتياز هذا المقرر.");
    const next=kind==="drop"?null:section(code,sectionId);
    if (kind!=="drop" && !next) return fail("اختر شعبة مطروحة لهذا المقرر.");
    if (kind==="swap" && sectionId===current) return fail("هذه هي شعبتك الحالية.");
    if (kind==="add") {
      const missing=c.prereqs.filter(p=>!profile.completed.includes(p));
      if (missing.length) return fail("يلزم اجتياز "+missing.map(p=>course(p).name).join(" و")+" أولًا.");
      if (before+c.credits>MAX_CREDITS) return fail("تتجاوز الإضافة حد التسجيل المتاح، وهو ١٨ ساعة في الفصل.");
    }
    if (next) {
      if (next.seats<=0) return fail("اكتمل عدد المقاعد المتاحة في هذه الشعبة.");
      const conflict=Object.entries(profile.registration).find(([other,id])=>other!==code && section(other,id) && overlaps(next,section(other,id)));
      if (conflict) return fail("يتعارض موعد الشعبة مع مقرر "+course(conflict[0]).name+".");
    }
    const following=successors(code).filter(item=>!profile.completed.includes(item.code));
    const after=before+(kind==="add"?c.credits:kind==="drop"?-c.credits:0);
    let impact="يبقى عبء الفصل ومتطلبات التخرج كما هما، وتتغير مواعيد هذا المقرر في جدولك.";
    if (kind==="drop") impact=following.length
      ?"عند التأجيل، يتوقف التقدم إلى مقررات منها "+following.slice(0,2).map(f=>f.name).join(" و")+" حتى تجتاز سلسلة متطلباتها. يتوقف أثر ذلك على التخرج على موعد الطرح القادم."
      :"يبقى المقرر ضمن متطلبات خطتك. يمكنك إعادة إدراجه في فصل لاحق بحسب الطرح المتاح.";
    if (kind==="add") impact=following.length
      ?"يدعم اجتياز هذا المقرر التقدّم نحو "+following.slice(0,2).map(f=>f.name).join(" و")+" وفق بقية المتطلبات."
      :"تُحتسب ساعات المقرر ضمن "+c.group+" عند اجتيازه.";
    return {...result,ok:true,message:kind==="add"?"يمكن إضافة هذه الشعبة إلى جدولك.":kind==="drop"?"يمكن حذف المقرر من تسجيل هذا الفصل.":"يمكن الانتقال إلى هذه الشعبة.",impact,successors:following,before,after};
  }
  function commit(kind,code,sectionId) {
    const profile=getProfile(), checked=preview(kind,code,sectionId,profile);
    if (!checked.ok) return checked;
    const registration={...profile.registration};
    if (kind==="drop") delete registration[code]; else registration[code]=sectionId;
    const id="MD-"+newId().slice(0,8).toUpperCase();
    const action={add:"إضافة",drop:"حذف",swap:"تبديل شعبة"}[kind];
    const entry={id,kind,code,sectionId:kind==="drop"?profile.registration[code]:sectionId,time:new Date().toISOString(),text:action+" مقرر "+course(code).name};
    const data=read();
    write({...data,[profile.id]:{registration,history:[entry,...data[profile.id].history]}});
    return {...checked,message:"تم "+action+" مقرر "+course(code).name+" وتحديث جدولك.",receipt:id};
  }
  function sameRegistration(a,b) {
    if (!a || !b) return false;
    const keys=Object.keys(a);
    return keys.length===Object.keys(b).length && keys.every(code=>Object.hasOwn(b,code) && a[code]===b[code]);
  }
  function applyPlan(registration,expected) {
    const profile=getProfile();
    const fail=message=>({ok:false,message});
    if (!expected || expected.profileId!==profile.id || !sameRegistration(profile.registration,expected.registration))
      return fail("تغيّر الملف أو جدول التسجيل. أعد حساب الخيارات قبل تثبيتها.");
    if (!registration || typeof registration!=="object" || Array.isArray(registration))
      return fail("تعذّر التحقق من الجدول المقترح.");
    if (Object.keys(profile.registration).some(code=>!Object.hasOwn(registration,code)))
      return fail("يتطلب حذف مقرر مسجّل تأكيدًا مستقلًا من صفحة التسجيل.");
    if (sameRegistration(registration,profile.registration)) return fail("هذا الجدول مثبّت بالفعل.");
    const proposed={...profile,registration:{}};
    for (const [code,id] of Object.entries(registration)) {
      const offered=section(code,id);
      if (!offered) return fail("لم تعد الشعبة المحددة متاحة.");
      if (profile.registration[code]===id) {
        const conflict=Object.entries(proposed.registration).some(([other,sec])=>overlaps(offered,section(other,sec)));
        if (conflict) return fail("يوجد تعارض بين مواعيد الشُّعب المقترحة.");
      } else {
        const check=preview("add",code,id,proposed);
        if (!check.ok) return fail(check.message);
      }
      proposed.registration[code]=id;
    }
    if (stats(proposed).registered>MAX_CREDITS) return fail("تجاوز الجدول الحد الأعلى للساعات.");
    const data=read();
    if (data.active!==expected.profileId || !sameRegistration(data[profile.id].registration,expected.registration))
      return fail("تغيّر تسجيلك أثناء المراجعة. أعد حساب الخيارات.");
    const id="MD-"+newId().slice(0,8).toUpperCase();
    const changes=Object.entries(registration).filter(([code,sec])=>profile.registration[code]!==sec).map(([code,sec])=>({code,from:profile.registration[code]||null,to:sec}));
    const entry={id,kind:"plan",time:new Date().toISOString(),changes,text:"تثبيت الجدول المقترح · "+changes.map(c=>c.code+" ("+(c.from?c.from+" ← ":"")+c.to+")").join("، ")};
    write({...data,[profile.id]:{registration:{...registration},history:[entry,...data[profile.id].history]}});
    return {ok:true,receipt:id,message:"تم تثبيت الجدول وتحديث سجل العمليات."};
  }
  function simulateGpa(termGpa,hours=stats().registered) {
    const grade=Number(termGpa), credits=Number(hours);
    if (!Number.isFinite(grade)||grade<0||grade>5||!Number.isFinite(credits)||credits<0) return null;
    const profile=getProfile(), completed=stats(profile).completed;
    if (!completed && !credits) return null;
    return Math.round(100*((profile.gpa||0)*completed+grade*credits)/(completed+credits))/100;
  }

  window.Madar={profiles,courses,days,getProfile,setProfile,course,section,stats,status,schedule,successors,preview,commit,applyPlan,simulateGpa,maxCredits:MAX_CREDITS};
})();
