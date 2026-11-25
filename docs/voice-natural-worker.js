/* Arabic speech generation runs off the UI thread, even when WebGPU is unavailable. */
import {createEngine,ort,sampleRate} from './assets/voice-natural/synthesis.mjs';
import './voice-diacritics.js';

let enginePromise;
let currentId = null;
let serial = Promise.resolve();
const wait = () => new Promise(resolve=>setTimeout(resolve,0));

function load(){
  if (!enginePromise) {
    enginePromise=createEngine(value=>self.postMessage({type:'progress',value:value*0.88}))
      .then(async engine=>{
        await globalThis.MadarDiacritics.prepare('مَرْحَبًا',{ort});
        self.postMessage({type:'progress',value:1});
        return engine;
      })
      .catch(error=>{enginePromise=null;throw error;});
  }
  return enginePromise;
}
function lightPhrasing(text) {
  // This speaker consistently enunciates the possessive GPA label more clearly in this wording.
  const words = text.split(/(\s+)/u);
  const plain = word => word?.replace(/[\u064b-\u0652\u0670]/gu, '') || '';
  for (let i=0; i+4<words.length; i+=2) {
    if (plain(words[i]) !== 'معدلك' || !/^التراكمي[،:]?$/u.test(plain(words[i+2]))) continue;
    const next = plain(words[i+4]);
    if (/^(?:[0-9٠-٩]|صفر|واحد|اثن|ثلاث|أربع|خمس|ستة|سبع|ثمان|تسع|عشر)/u.test(next)) {
      words[i]='المعدل'; words[i+2]='التراكمي هو';
    }
  }
  return words.join('');
}
function divide(text){
  const sentences=text.match(/[^.؟!؛\n]+[.؟!؛\n]*|[.؟!؛\n]+/gu)||[];
  const result=[];
  for (const sentence of sentences) {
    let line='';
    for (const word of sentence.trim().split(/\s+/u)) {
      if (!word) continue;
      if (line && (line.length+word.length>165 || (line.length>25 && /[،,:]$/u.test(line)))) {
        result.push(line); line='';
      }
      line+=(line?' ':'')+word;
    }
    if (line) result.push(line);
  }
  return result;
}

async function generate({id,text,rate}){
  if (currentId!==id) return;
  const engine=await load();
  let count=0;
  for (const sentence of divide(lightPhrasing(text))) {
    if (currentId!==id) return;
    const line=await globalThis.MadarDiacritics.prepare(sentence,{ort});
    if (currentId!==id) return;
    for await (const samples of engine.synthesize(line,rate)) {
      if (currentId!==id) return;
      self.postMessage({type:'chunk',id,samples,sampleRate,breakMs:/[.؟!]$/u.test(sentence)?125:60},[samples.buffer]);
      count++;
      await wait(); // Let a stop or navigation supersede inference between chunks.
    }
  }
  if (currentId!==id) return;
  if (!count) throw new Error('لم يتضمّن النص كلمات عربية قابلة للنطق.');
  self.postMessage({type:'done',id});
}
self.onmessage=({data})=>{
  if(data.type==='cancel'){
    if(data.id===currentId) currentId=null;
    return;
  }
  if(data.type==='load'){
    load().then(()=>self.postMessage({type:'ready'})).catch(()=>self.postMessage({type:'load-error'}));
    return;
  }
  if(data.type!=='speak') return;
  currentId=data.id;
  const job={...data,text:String(data.text||''),rate:Math.max(.8,Math.min(1.2,Number(data.rate)||1))};
  serial=serial.then(()=>generate(job)).catch(()=>{
    if (currentId===job.id) self.postMessage({type:'error',id:job.id});
  });
};
