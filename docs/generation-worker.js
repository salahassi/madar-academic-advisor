// The inference runtime spawns its own WASM computation worker; this outer
// worker also isolates integrity checks and supports cancellation during load.
import { Wllama } from './assets/gen/wllama-2.3.7.mjs';
import './assets/gen/sha256-4.12.0.js';
const expectedDigest = '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db';
let runner;
let generating;

async function verify(file) {
  const hash = await globalThis.hashwasm.createSHA256();
  const reader = file.stream().getReader();
  let loaded = 0, last = -1;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    hash.update(chunk.value);
    loaded += chunk.value.byteLength;
    const each = Math.floor(100 * loaded / file.size);
    if (each !== last) { last = each; postMessage({type:'verifying', percent:each}); }
  }
  if (hash.digest('hex') !== expectedDigest) throw new Error('digest');
}
function clean(value, limit) {
  return String(value ?? '').replace(/<\|[^>]{0,50}\|>/g, '').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/٫/g,'.').trim().slice(0, limit);
}
async function respond({question, facts, history}, signal) {
  const system = 'You are an academic adviser. Answer in Arabic in one or two short sentences. Use only the verified facts below. Copy any necessary number exactly as given. If information is missing, say so. Never claim to change records.';
  const evidence = clean(facts, 2800), query = clean(question, 700);
  const turns = Array.isArray(history) ? history.slice(-2).map(m => ({role:m.role==='assistant'?'assistant':'user',content:clean(m.content,250)})) : [];
  let excerpt = evidence;
  let prompt;
  for (;;) {
    const chat = [{role:'system',content:system}, ...turns, {role:'user',content:'حقائق السجل:\n'+excerpt+'\n\nسؤال الطالب: '+query+'\nأجب بالعربية اعتماداً على الحقائق المذكورة.'}];
    prompt = chat.map(t => '<|im_start|>'+t.role+'\n'+t.content+'<|im_end|>\n').join('')+'<|im_start|>assistant\n';
    if (signal.aborted) throw new Error('cancelled');
    if ((await runner.tokenize(prompt,true)).length <= 1750) break;
    if (turns.length) turns.shift();
    else if (excerpt.length > 280) excerpt = excerpt.slice(0,Math.floor(excerpt.length * .76));
    else throw new Error('context');
  }
  const result = await runner.createCompletion(prompt, {nPredict:100, useCache:false, abortSignal:signal, sampling:{temp:0,top_p:.8,top_k:20,penalty_repeat:1.08}});
  if (signal.aborted) throw new Error('cancelled');
  const answer = String(result || '').split(/<\|(?:im_end|im_start|endoftext)\|>/)[0].trim();
  if (!answer || !/[\u0600-\u06ff]/.test(answer)) throw new Error('no-arabic');
  // A small model may invent quantities or course codes. The authoritative
  // calculated result remains available to the caller if verification fails.
  const normalized=clean(answer,2000);
  const numbers=s=>new Set(s.match(/\d+(?:\.\d+)?/g)||[]);
  const codes=s=>new Set((s.toUpperCase().match(/\b[A-Z]{2,8}[- ]?\d{2,4}\b/g)||[]).map(c=>c.replace(/[- ]/g,'')));
  const evidenceNumbers=numbers(evidence), evidenceCodes=codes(evidence);
  if([...numbers(normalized)].some(n=>!evidenceNumbers.has(n)) || [...codes(normalized)].some(c=>!evidenceCodes.has(c))) throw new Error('ungrounded');
  if(/تم (?:تسجيلك|تسجيل المقرر|حذف المقرر|تثبيت|تعديل سجلك|اعتماد الجدول)/.test(normalized)) throw new Error('ungrounded');
  return answer;
}
self.onmessage = async ({data}) => {
  if (data.type==='cancel') { generating?.abort(); return; }
  if (data.type==='init') {
    try {
      await verify(data.file);
      postMessage({type:'loading'});
      runner = new Wllama({'single-thread/wllama.wasm':new URL('assets/gen/wllama-2.3.7.wasm', self.location.href).href},
        {suppressNativeLog:true,logger:{log(){},debug(){},warn(){},error(){}}});
      await runner.loadModel([data.file],{n_ctx:2048,n_batch:96,n_ubatch:48,n_threads:1});
      postMessage({type:'ready'});
    } catch (error) { postMessage({type:'init-error',reason:error.message==='digest'?'digest':'runtime'}); }
    return;
  }
  if (data.type==='generate' && runner && !generating) {
    generating = new AbortController();
    try { postMessage({type:'answer',id:data.id,text:await respond(data.input,generating.signal)}); }
    catch (error) { postMessage({type:'generation-error',id:data.id,reason:generating.signal.aborted?'cancelled':'generation'}); }
    finally { generating = null; }
  }
};
