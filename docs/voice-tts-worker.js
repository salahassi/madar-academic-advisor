/* Arabic text stays in this worker. Remote requests only retrieve the pinned model. */
'use strict';
importScripts('./assets/voice-tts/piper_phonemize.js','./assets/voice-tts/ort.wasm.min.js');
const base=new URL('./assets/voice-tts/',self.location.href);
const url='https://huggingface.co/vadimbelsky/arabic-emirati-female-piper/resolve/f89f1aec8e6486871ffdf8d878c5a39eaf918d60/arabic-emirati-female-model.onnx';
const bytes=63516686;
const digest='1578a9b27d01a0626227225b148179628b770607dd61bdbbc41865bd399106b1';
let session,phonemizer,collected=[];
async function loadVoice() {
  const cache=await self.caches?.open('madar-emirati-piper-mit-v1').catch(()=>null);
  let response=await cache?.match(url);
  const cached=Boolean(response);
  if(!response) response=await fetch(url,{credentials:'omit'});
  if(!response.ok) throw Error('تعذّر تنزيل نموذج النطق.');
  const reader=response.body.getReader(),model=new Uint8Array(bytes);
  let offset=0,last=0;
  for(;;) {
    const {done,value}=await reader.read();if(done) break;
    if(offset+value.length>bytes) throw Error('حجم نموذج النطق غير مطابق.');
    model.set(value,offset);offset+=value.length;
    if(offset-last>1048576) {postMessage({type:'progress',percent:Math.round(offset/bytes*94)});last=offset;}
  }
  const md=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',model)),b=>b.toString(16).padStart(2,'0')).join('');
  if(offset!==bytes || md!==digest) {if(cached) await cache.delete(url);throw Error('تعذّر التحقق من سلامة النموذج.');}
  if(cache&&!cached) await cache.put(url,new Response(model)).catch(()=>{});
  ort.env.wasm.numThreads=1;
  ort.env.wasm.wasmPaths=new URL('./assets/voice-whisper/',self.location.href).href;
  const files=await Promise.all(['piper_phonemize.wasm','piper_phonemize.data'].map(async filename=>{
    const r=await fetch(new URL(filename,base));if(!r.ok) throw Error('تعذّر تحميل ملفات النطق.');return r.arrayBuffer();
  }));
  phonemizer=await createPiperPhonemize({
    noInitialRun:true,wasmBinary:files[0],getPreloadedPackage:()=>files[1],
    locateFile:name=>new URL(name,base).href,
    print(line){const parsed=JSON.parse(line);if(parsed.phoneme_ids) collected.push(parsed.phoneme_ids);},
    printErr(){}
  });
  session=await ort.InferenceSession.create(model,{executionProviders:['wasm']});
}
async function synth(text) {
  collected=[];
  phonemizer.callMain(['-l','ar','--input',JSON.stringify([{text}]),'--espeak_data','/espeak-ng-data']);
  if(!collected.length) throw Error('تعذّر نطق هذه العبارة.');
  const chunks=[];
  for(const ids of collected) {
    const inputs={
      input:new ort.Tensor('int64',BigInt64Array.from(ids,BigInt),[1,ids.length]),
      input_lengths:new ort.Tensor('int64',BigInt64Array.of(BigInt(ids.length)),[1]),
      scales:new ort.Tensor('float32',Float32Array.of(.667,1,.8),[3])
    };
    const outputs=await session.run(inputs);
    chunks.push(outputs.output.data);
  }
  const samples=new Float32Array(chunks.reduce((n,c)=>n+c.length,0));
  let offset=0;for(const chunk of chunks){samples.set(chunk,offset);offset+=chunk.length;}
  return samples;
}
self.onmessage=async({data})=>{
  try{
    if(data.type==='load'){await loadVoice();postMessage({type:'ready'});}
    if(data.type==='speak'){const samples=await synth(data.text);postMessage({type:'audio',id:data.id,samples},[samples.buffer]);}
  }catch(err){postMessage({type:'error',id:data.id,message:String(err?.message||err)});}
};
