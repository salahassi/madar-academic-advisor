import {env,pipeline} from './assets/voice-whisper/transformers.min.js';

const revision='5332fcc35e32a33b86612b9a57a89be7906102b1';
env.allowLocalModels=false;
env.allowRemoteModels=true;
env.backends.onnx.wasm.numThreads=1;
env.backends.onnx.wasm.proxy=false;
env.backends.onnx.wasm.wasmPaths=new URL('./assets/voice-whisper/',self.location.href).href;
let model;
self.onmessage=async({data})=>{
  try{
    if(data.type==='load'){
      model=await pipeline('automatic-speech-recognition','Xenova/whisper-tiny',{
        revision,quantized:true,progress_callback:event=>{
          if(event.status==='progress'&&event.total) self.postMessage({type:'progress',file:event.file,loaded:event.loaded});
        }
      });
      self.postMessage({type:'ready'});
    }else if(data.type==='infer'&&model){
      const result=await model(data.audio,{language:'arabic',task:'transcribe',max_new_tokens:96,return_timestamps:false,do_sample:false});
      self.postMessage({type:'text',text:String(result.text||'').trim()});
    }
  }catch(err){self.postMessage({type:'error',detail:String(err?.message||err).slice(0,240)});}
};
