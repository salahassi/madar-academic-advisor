/* Emit short mono PCM blocks for voice activity detection and local transcription. */
class MadarMicrophone extends AudioWorkletProcessor {
  constructor(){super();this.block=new Float32Array(1024);this.offset=0;}
  process(inputs){
    const input=inputs[0]?.[0];
    if(!input?.length)return true;
    let source=0;
    while(source<input.length){
      const length=Math.min(this.block.length-this.offset,input.length-source);
      this.block.set(input.subarray(source,source+length),this.offset);this.offset+=length;source+=length;
      if(this.offset===this.block.length){
        this.port.postMessage(this.block,[this.block.buffer]);this.block=new Float32Array(1024);this.offset=0;
      }
    }
    return true;
  }
}
registerProcessor('madar-microphone',MadarMicrophone);
