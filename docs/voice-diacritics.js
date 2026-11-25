/* Local char-and-hint Arabic vowel restoration, using the libtashkeel ONNX model. */
(() => {
  'use strict';
  const symbols = /[\u064b-\u0652\u0670]/u;
  const arLetter = /^[\u0621-\u063a\u0641-\u064a]$/u;
  const allMarks = /[\u064b-\u0652\u0670]/gu;
  const uris = ['libtashkeel.onnx','maps.json'].map(n=>new URL('assets/voice-diacritics/'+n, globalThis.location.href));
  const cache = new Map();
  let boot;

  function units(text) {
    const out=[];
    for(const ch of text){
      if(symbols.test(ch) && out.length && arLetter.test(out.at(-1).ch)) out.at(-1).mark+=ch;
      else out.push({ch,mark:''});
    }
    return out;
  }

  // Keep known academic terminology unambiguous even in short menu fragments.
  // Word-final inflection is filled from the surrounding sentence by the model.
  const terms = new Map();
  for(const form of [
    'مُقَرَّر','مُقَرَّرات','شُعْبَة','شُعَب','مُعَدَّل','تَراكُمِيّ','تَسْجيل','مُتَطَلَّب','مُتَطَلَّبات',
    'مُرْشِد','أَكادِيمِيّ','أَكادِيمِيَّة','مُخَطِّط','خُطَّة','خُطَّتك','مَواعِيد','جامِعِيّ','تَخَرُّج',
    'قَارِن','اِخْتَر','اِفْتَح','اِسْتَمِع','مَرْحَبًا','فَاصِلَة','بَيَانَات','قَوَاعِد','مُحَاضَرَات','مِهْنِيّ','بَرْمَجَة','بَرْمَجيّات','خَوارِزْمِيّات','حَاسِب','تَفاضُل','إِحْصاء','اصْطِناعيّ',
    'مُحاكاة','مُحاضَرة','قاعَة','دِراسِيّ','مُسْتَجِدّ','مُسْتَجِدَّة','عُمَر','لَيَان','مَدار'
  ]) {
    terms.set(form.replace(allMarks,''), units(form));
  }

  function lexicalHints(text){
    return text.replace(/[\u0621-\u063a\u0641-\u0652\u0670]+/gu, raw=>{
      const letters=units(raw), key=raw.replace(allMarks,'');
      const exact=terms.get(key);
      const prefix=exact?0:key.startsWith('ال')&&terms.has(key.slice(2))?2:0;
      const template=exact||(prefix?terms.get(key.slice(2)):null);
      if(!template || letters.length!==prefix+template.length) return raw;
      return letters.map(({ch,mark},i)=>{
        let suggested=template[i-prefix]?.mark||'';
        if(prefix && i===prefix && /[تثدذرزسشصضطظلن]/u.test(ch) && !suggested.includes('ّ')) suggested='ّ'+suggested;
        // Preserve explicit vowels; if a caller has supplied only shadda, a
        // compatible lexical vowel may still fill the remaining position.
        if(mark==='ّ' && suggested.includes('ّ')) return ch+suggested;
        return ch+(mark||suggested);
      }).join('');
    });
  }

  async function load(runtime){
    if(!boot) boot=(async()=>{
      const ort=runtime||globalThis.ort;
      if(!ort?.InferenceSession)throw Error('Arabic diacritization requires the speech worker runtime.');
      const [model,map]=await Promise.all(uris.map(async(uri,i)=>{
        const response=await fetch(uri);
        if(!response.ok) throw Error('Unable to load Arabic vowel model.');
        return i?response.json():response.arrayBuffer();
      }));
      const session=await ort.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
      return {ort,map,session,targets:Object.fromEntries(Object.entries(map.target).map(([k,v])=>[v,k]))};
    })().catch(e=>{boot=undefined;throw e;});
    return boot;
  }
  function rankedMark(mark) {
    const ordered=mark.includes('ّ')?'ّ'+mark.replace(/ّ/gu,''):mark;
    return ordered.replace(/ٰ/gu,'');
  }
  function appendMark(unit, inferred, pause){
    const supplied=unit.mark;
    if(!arLetter.test(unit.ch)) return unit.ch+supplied;
    if(supplied && supplied!=='ّ')return unit.ch+supplied;
    let remainder=inferred==='_'?'':inferred||'';
    if(pause) remainder=remainder.replace(/[ًٌٍَُِ]/gu,'');
    if(supplied==='ّ'&&!remainder.includes('ّ')) remainder='ّ'+remainder;
    return unit.ch+remainder;
  }

  async function block(text,model) {
    const {ort,map,session,targets}=model, graphemes=units(text);
    const neutralNumberEnd=new Set();
    const numericWords=/^(?:و)?(?:صفر|واحد|واحدة|اثنان|اثنين|اثنتان|اثنتين|اثنا|اثني|اثنتا|اثنتي|ثلاث|أربع|خمس|ست|سبع|ثمان|تسع|عشر|أحد|إحدى|عشرين|ثلاثين|أربعين|خمسين|ستين|سبعين|ثمانين|تسعين|مئة|مائة|ألف|فاصلة)(?:ة|ا|ون|ين|ية|مئة|مائة)?$/u;
    for(let i=0;i<graphemes.length;){
      if(!arLetter.test(graphemes[i].ch)){i++;continue;}
      const first=i;
      while(i<graphemes.length && arLetter.test(graphemes[i].ch))i++;
      if(numericWords.test(graphemes.slice(first,i).map(g=>g.ch).join('')))neutralNumberEnd.add(i-1);
    }
    const input=[], hints=[], values=new Map();
    graphemes.forEach((g,i)=>{
      const key=Object.hasOwn(map.input,g.ch)?g.ch:/[0-9٠-٩۰-۹]/u.test(g.ch)?'#':/\s/u.test(g.ch)?' ':null;
      if(key===null)return;
      values.set(i,input.length);
      input.push(BigInt(map.input[key]));
      hints.push(BigInt(map.hint[rankedMark(g.mark)]??map.hint['']));
    });
    if(!input.length)return text;
    const shape=[1,input.length],tensor=(values,dimensions)=>new ort.Tensor('int64',BigInt64Array.from(values),dimensions);
    const {predictions}=await session.run({char_inputs:tensor(input,shape),diac_inputs:tensor(hints,shape),input_lengths:tensor([BigInt(input.length)],[1])},['predictions']);
    let out='';
    try {
      graphemes.forEach((unit,index)=>{
        if(!values.has(index)){out+=unit.ch+unit.mark;return;}
        let next=index+1;while(next<graphemes.length && /^\s$/u.test(graphemes[next].ch))next++;
        const pause=neutralNumberEnd.has(index)||next===graphemes.length||!!graphemes[next]?.ch.match(/^[،,:;؛؟!?.…]$/u);
        out+=appendMark(unit,targets[predictions.data[values.get(index)]],pause);
      });
    } finally {predictions.dispose?.();}
    return out;
  }
  async function prepare(value,options={}) {
    const text=String(value??'');
    if(!/[\u0621-\u064a]/u.test(text))return text;
    if(cache.has(text))return cache.get(text);
    const hinted=lexicalHints(text);
    const model=await load(options.ort);
    const parts=hinted.match(/.{1,245}(?:[\s،.؛؟!]|$)|.{1,245}/gsu)||[];
    const result=[];
    for(const part of parts)result.push(await block(part,model));
    const joined=result.join('');
    if(cache.size>=48)cache.delete(cache.keys().next().value);
    cache.set(text,joined);
    return joined;
  }
  globalThis.MadarDiacritics={prepare,lexicalHints};
})();
