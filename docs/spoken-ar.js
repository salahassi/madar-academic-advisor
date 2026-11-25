/* Convert the visible academic answer into a script intended to be spoken in Arabic. */
(() => {
  'use strict';
  const ones = ['صفر','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة'];
  const feminineOnes = ['صفر','واحدة','اثنتان','ثلاث','أربع','خمس','ست','سبع','ثماني','تسع','عشر'];
  const tens = ['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
  const hundreds = ['','مئة','مئتان','ثلاثمئة','أربعمئة','خمسمئة','ستمئة','سبعمئة','ثمانمئة','تسعمئة'];
  const ordinal = ['','الأولى','الثانية','الثالثة','الرابعة','الخامسة','السادسة','السابعة','الثامنة','التاسعة','العاشرة','الحادية عشرة','الثانية عشرة'];
  const dualAcc = new Map([['اثنان','اثنين'],['اثنتان','اثنتين'],['اثنا','اثني'],['اثنتا','اثنتي'],['مئتان','مئتين'],['ألفان','ألفين'],['مليونان','مليونين']]);
  const inflect = (s, oblique) => oblique ? s.split(' ').map(w=>{
    const conjunction=w.startsWith('و')&&w.length>4;
    const wd=conjunction?w.slice(1):w;
    const changed=dualAcc.get(wd) || (tens.includes(wd) ? wd.slice(0,-2)+'ين' : wd);
    return changed===wd?w:(conjunction?'و':'')+changed;
  }).join(' ') : s;
  const digits = str => str.replace(/[٠-٩]/g,ch=>String(ch.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,ch=>String(ch.charCodeAt(0)-0x6f0)).replace(/٫/g,'.').replace(/(?<=\d)٬(?=\d)/g,'');
  const joinAnd = (a,b) => b ? a+' و'+b : a;
  function number(n, feminine=false) {
    const unit=feminine?feminineOnes:ones;
    if(n<=10)return unit[n];
    if(n<20){
      if(n===11)return feminine?'إحدى عشرة':'أحد عشر';
      if(n===12)return feminine?'اثنتا عشرة':'اثنا عشر';
      return unit[n-10]+' '+(feminine?'عشرة':'عشر');
    }
    if(n<100)return n%10 ? (feminine&&n%10===1?'إحدى':unit[n%10])+' و'+tens[Math.floor(n/10)] : tens[n/10];
    if(n<1000)return joinAnd(hundreds[Math.floor(n/100)],n%100?number(n%100,feminine):'');
    for(const [unitValue,one,two,few] of [[1e6,'مليون','مليونان','ملايين'],[1e3,'ألف','ألفان','آلاف']]){
      if(n<unitValue)continue;
      const count=Math.floor(n/unitValue);
      const higher=count===1?one:count===2?two:number(count)+' '+(count%100>=3&&count%100<=10?few:one);
      return joinAnd(higher,n%unitValue?number(n%unitValue,feminine):'');
    }
  }
  const letterNames = {A:'إيه',B:'بي',C:'سي',D:'دي',E:'إي',F:'إف',G:'جي',H:'إتش',I:'آي',J:'جاي',K:'كاي',L:'إل',M:'إم',N:'إن',O:'أو',P:'بي',Q:'كيو',R:'آر',S:'إس',T:'تي',U:'يو',V:'ڤي',W:'دَبْل يو',X:'إكس',Y:'واي',Z:'زِد'};
  function standalone(value,oblique=false){
    const [whole,fraction]=value.split('.');
    // Keep leading zeroes on identifiers and avoid rounding long values.
    const asDigits=whole.length>9 || (!fraction && /^0\d/.test(whole));
    const main=asDigits?[...whole].map(c=>ones[Number(c)]).join(' '):inflect(number(Number(whole)),oblique);
    if(!fraction||!Number(fraction))return main;
    const frac=fraction.replace(/0+$/,'');
    return main+' فاصلة '+(/^[1-9]\d?$/.test(frac)?inflect(number(Number(frac)),true):[...frac].map(c=>ones[Number(c)]).join(' '));
  }
  const unitForms=[
    {rx:'ساعات|ساعة',f:true,one:'ساعة',dual:'ساعتان',dualAcc:'ساعتين',many:'ساعات'},
    {rx:'أيام|ايام|يوما[ً]?|يومًا|يوم',one:'يوم',dual:'يومان',dualAcc:'يومين',many:'أيّام'},
    {rx:'مقررات|مقرراتٍ|مقرّر(?:ات)?|مقررا[ً]?|مقررًا|مقرر',one:'مُقَرَّر',dual:'مُقَرَّران',dualAcc:'مُقَرَّرَين',many:'مُقَرَّرات'},
    {rx:'دقائق|دقيقة',f:true,one:'دقيقة',dual:'دقيقتان',dualAcc:'دقيقتين',many:'دقائق'},
    {rx:'فصول|فصلًا|فصلا[ً]?|فصل',one:'فصل',dual:'فصلان',dualAcc:'فصلين',many:'فصول'},
    {rx:'نقاط|نقطة',f:true,one:'نقطة',dual:'نقطتان',dualAcc:'نقطتين',many:'نقاط'}
  ];
  const followsPreposition=prefix=>/(?:^|[\s،؛])(?:و|ف)?(?:مِن|من|حتى|إلى|على|بعد|قبل|نحو|في|بحدّ|بحد|خلال|بحوالي|ضمن|بمقدار|من أصل|سقف|من إجمالي|مجموع|تقريبًا|أنجزت|اجتزت|سجلت|سجّلت|اخترت|حققت|تجاوز|تتجاوز|تحتاج|تستهدف|يتجاوز|يساوي|سجّل|سَجِّل|يتطلب|يتطلّب)\s*$/u.test(prefix);
  function counted(n,form,oblique){
    const base=count=>inflect(number(count,form.f),oblique);
    if(n===1)return form.one+' '+(form.f?'واحدة':'واحد');
    if(n===2)return oblique?form.dualAcc:form.dual;
    const end=n%100;
    return base(n)+' '+(end>=3&&end<=10?form.many:form.one);
  }
  function clock(h,m) {
    const hr=Number(h),mn=Number(m),period=hr===0||hr>=5&&hr<12?'صباحًا':hr===12?'ظهرًا':hr<5?'فجرًا':hr<16?'بعد الظهر':'مساءً';
    const shownHour=(hr+(mn===45?1:0))%12;
    const label=(shownHour===1?'الواحدة':shownHour===0?'الثانية عشرة':ordinal[shownHour]);
    const minute=mn===0?'':mn===15?' والربع':mn===30?' والنصف':mn===45?' إلّا رُبعًا':mn===1?' ودقيقة واحدة':mn===2?' ودقيقتان':(' و'+counted(mn,unitForms[3],false));
    return label+minute+' '+period;
  }
  const calendarMonths=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  const bare=s=>digits(s).normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  function expandCodes(text,catalog){
    const codes=new Map((catalog||[]).map(c=>[c.code,c.name]));
    return text.replace(/\b([A-Z]{2,5})\s*[-–]?\s*(\d{3})\b/gi,(s,prefix,id,offset)=>{
      const code=prefix.toUpperCase()+id,name=codes.get(code),before=text.slice(0,offset), after=text.slice(offset+s.length);
      if(!name|| /(?:رمز|الكود|رمزه|رقم المقرر)(?:\s+المقرر)?\s*[:：]?\s*$/u.test(before)){
        return [...prefix.toUpperCase()].map(ch=>letterNames[ch]).join(' ')+' '+number(Number(id));
      }
      if(bare(before.slice(-80)).endsWith(bare(name)) || bare(after.slice(0,80)).startsWith(bare(name)))return '';
      return digits(name);
    });
  }
  function clarifyGpaScale(text) {
    // Keep any study load or qualification in the original sentence, then speak
    // the denominator separately so it cannot be mistaken for a decimal digit.
    const sentence = /(?:[^.!؟\n]|\.(?=\d))+/gu;
    return text.replace(sentence,clause=>{
      const estimates=[];
      const valueAndScale=/(?<![\d.])([0-5](?:\.\d+)?)\s*(?:من(?:\s+أصل)?|\/)\s*([45])(?![\d.][0-9]|[0-9])/gu;
      for(const match of clause.matchAll(valueAndScale)){
        const prefix=bare(clause.slice(0,match.index).split(/[،؛,]/).pop());
        const suffix=clause.slice(match.index+match[0].length);
        const standaloneEstimate=!prefix && !suffix.trim() && match[1].includes('.');
        if (+match[1]>+match[2] || /^\s+(?:مقررات|ساعات|شعب|فصول|طلاب)/u.test(suffix)) continue;
        if (!standaloneEstimate && !/(?:معدل|جي بي ايه|gpa)(?=.{0,95}$)/iu.test(prefix)) continue;
        estimates.push(match);
      }
      if(!estimates.length)return clause;
      const scales=new Set(estimates.map(m=>m[2]));
      let result=clause;
      for(let i=estimates.length-1;i>=0;i--){
        const m=estimates[i];
        const spoken=standalone(m[1])+(scales.size===1?'':' على مقياسٍ حدّه الأعلى '+number(+m[2]));
        result=result.slice(0,m.index)+spoken+result.slice(m.index+m[0].length);
      }
      return scales.size===1?result.trimEnd()+'. الحد الأعلى للمُعَدَّل هو '+number(+estimates[0][2]):result;
    });
  }
  const knownPhrases=[
    ['سجل العمليات','سِجِلّ العمليّات'],['سجلّك','سِجِلّك'],['سجلك','سِجِلّك'],['سجل الطالب','سِجِلّ الطالب'],['السجل','السِّجِلّ'],
    ['مسجلة','مُسَجَّلة'],['مسجلةً','مُسَجَّلة'],['المسجلة','المُسَجَّلة'],['المسجل','المُسَجَّل'],['مسجل','مُسَجَّل'],
    ['الشعب المتاحة','الشُّعَب المُتاحة'],['الشعب الحالية','الشُّعَب الحالية'],['الشعب','الشُّعَب'],['شعب','شُعَب'],['الشعبة','الشُّعْبة'],['شعبة','شُعْبة'],
    ['معدلك','مُعَدَّلك'],['المعدل','المُعَدَّل'],['معدل','مُعَدَّل'],['خطتك','خُطَّتك'],['خطتي','خُطَّتي'],['الخطة','الخُطَّة'],['التخرج','التخرُّج'],
    ['المقررات','المُقَرَّرات'],['مقررات','مُقَرَّرات'],['المقرر','المُقَرَّر'],['مقرر','مُقَرَّر'],['متطلباته','مُتَطَلِّباته'],
    ['نظم التشغيل','نُظُم التشغيل'],['نظم قواعد البيانات','نُظُم قواعد البيانات'],['نظم المعلومات','نُظُم المعلومات'],
    ['الطلبة','الطَّلَبة'],['سجلني','سَجِّلْني'],['سجّل','سَجِّل'],['سجل','سَجِّل']
  ];
  // Standalone tokens only. For example شُعَب courses and سِجِلّ academic record have unrelated spoken forms.
  const phraseMap=new Map(knownPhrases);
  const phraseRegex=new RegExp('(?<![\\p{L}\\p{M}])('+knownPhrases.map(x=>x[0]).join('|')+')(?![\\p{L}\\p{M}])','gu');
  function prepare(raw, options={}){
    let t=digits(String(raw??'')).normalize('NFC').replace(/[\u0640\u200e\u200f\u061c\u2066-\u2069]/g,'');
    if(!t.trim())return '';
    // A programming tip about another hypothetical GPA is useful on screen;
    // introducing a second, unrelated grade in the spoken answer is confusing.
    t=t.replace(/(?<=[.؟!]\s)(?:جرّب|جرب) سؤال[ًًا]* مثل «لو جبت [0-5](?:\.\d+)?، شو بصير معدلي؟»\.?/gu,'');
    // The transaction reference stays visible in the transcript; say where to find it.
    t=t.replace(/(?:مرجع|رقم) العملية\s*[:：]?\s*MD-[A-Z0-9-]+/gi,'مرجع العمليّة متاح في سِجِلّ العمليّات');
    t=expandCodes(t,options.courses||window.Madar?.courses||[]);
    t=t.replace(/\(\s*\)/g,' ').replace(/\[\s*\]/g,' ').replace(/\*\*|\x60/g,'');
    t=t.replace(/(?:الساعة\s+)?([01]?\d|2[0-3]):([0-5]\d)(?:\s*[-–—]\s*(?:الساعة\s+)?([01]?\d|2[0-3]):([0-5]\d))?/g,(s,h,m,h2,m2,offset,str)=>{
      let first=Number(h)===0 && Number(m)===0?'منتصف اللّيل':'الساعة '+clock(h,m);
      if(!h2)return first;
      let second=Number(h2)===0 && Number(m2)===0?'منتصف اللّيل':'الساعة '+clock(h2,m2);
      const period=first.match(/ (صباحًا|فجرًا|ظهرًا|بعد الظهر|مساءً)$/u);
      if(period && second.endsWith(period[0])) first=first.slice(0,-period[0].length);
      const pre=str.slice(0,offset);
      return (/(?:^|[\s،؛])(?:و|ف)?(?:من|مِن)\s*$/u.test(pre)?'':'من ')+first+' إلى '+second;
    });
    function dateLabel(original,y,m,d){
      const month=calendarMonths[+m-1];
      return month&&+d>0&&+d<32?'يوم '+inflect(number(+d),true)+' من '+month+'، من عام '+inflect(number(+y),true):original;
    }
    t=t.replace(/(?<!\d)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)/g,dateLabel);
    t=t.replace(/(?<!\d)(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?!\d)/g,(s,d,m,y)=>dateLabel(s,y,m,d));
    t=t.replace(/(الشعبة|شعبة|الشُّعْبة|شُعْبة)\s+(?:رقم\s*)?(\d{1,2})\b/g,(s,p,n)=>ordinal[+n]?'الشُّعْبة '+ordinal[+n]:'الشُّعْبة رقم '+number(+n));
    t=clarifyGpaScale(t);
    t=t.replace(/(\d+(?:\.\d+)?)\s*[%٪]/g,(s,n,offset,str)=>standalone(n,followsPreposition(str.slice(0,offset)))+' في المئة');
    t=t.replace(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)(?!\s*[\/\d])/g,(s,a,b)=>standalone(a)+' من '+standalone(b,true));
    for(const unit of unitForms){
      const span=new RegExp('((?:من|مِن)\\s+)(\\d{1,3})\\s+إلى\\s+(\\d{1,3})\\s+('+unit.rx+')(?![\\p{L}\\p{M}])','gu');
      t=t.replace(span,(s,from,start,end)=>from+counted(+start,unit,true)+' إلى '+counted(+end,unit,true));
      const rx=new RegExp('(?<![\\d.])(\\d{1,3})\\s+('+unit.rx+')(?![\\p{L}\\p{M}])','gu');
      t=t.replace(rx,(s,n,ignored,offset,str)=>counted(+n,unit,followsPreposition(str.slice(0,offset))));
    }
    t=t.replace(/(?<![\d.])(\d+(?:\.\d+)?)(?!\d)/g,(s,n,offset,str)=>standalone(n,followsPreposition(str.slice(0,offset))));
    // Prosody: produce brief clauses in place of visual separators and duplicate codes.
    t=t.replace(/[«»“”"]/g,'').replace(/\s*[·|•]\s*/g,'، ').replace(/[()]/g,' ').replace(/\s*[:：]\s*/g,'، ')
      .replace(/\s*\n+\s*/g,'. ').replace(/(?:\s*[،,]\s*){2,}/g,'، ').replace(/\s*،\s*([.؟!])/g,'$1').replace(/([.؟!])\s*،/g,'$1 ')
      .replace(/(?:\.\s*){2,}/g,'. ').replace(/([؟!])\.+/g,'$1').replace(/؛/g,'، ').replace(/\s+([،.؟!])/g,'$1').replace(/\s+/g,' ').trim();
    t=t.replace(/([^،.؟!\s]) (عبؤك الحالي|تُحتسب ساعات|أيام الحضور|وفق سجلك الحالي)/gu,'$1، $2');
    t=t.replace(/عبؤك الحالي/gu,'عدد ساعاتك المسجّلة حاليًا');
    if (t.includes('عند تحقيق معدل فصلي')) t=t.replace(/وفق سجلك الحالي/gu,'بحسب نتائجك الحالية');
    return options.vocalize===false?t:t.replace(phraseRegex,word=>phraseMap.get(word));
  }
  window.MadarSpoken={prepare};
})();
