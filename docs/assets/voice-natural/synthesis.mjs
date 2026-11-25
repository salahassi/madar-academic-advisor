import * as ort from './ort.wasm.min.mjs';
import {prepare as encode, initEspeak} from './g2p/index.mjs';

export {ort};
export const sampleRate = 24000;
const base = new URL('.', import.meta.url);
const styleWidth = 256;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = base.href;

async function bytes(file, notify) {
  const url = new URL(file, base).href;
  const expected = file === 'model_fp16.onnx' ? 15969086 : 522240;
  const cache = await globalThis.caches?.open('madar-nabra-bbac0f1').catch(() => undefined);
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) {
    const data = new Uint8Array(await cached.arrayBuffer());
    if (data.length === expected) { notify(data.length); return data; }
  }
  const response = await fetch(url, {cache: 'force-cache'});
  if (!response.ok) throw new Error('تعذّر تحميل محرك النطق.');
  if (!response.body) {
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length !== expected) throw new Error('لم يكتمل تنزيل الصوت.');
    notify(data.length);
    await cache?.put(url, new Response(data)).catch(() => {});
    return data;
  }
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    parts.push(value);
    notify(size);
  }
  if (size !== expected) throw new Error('لم يكتمل تنزيل الصوت.');
  const result = new Uint8Array(size);
  let position = 0;
  for (const part of parts) { result.set(part, position); position += part.length; }
  await cache?.put(url, new Response(result)).catch(() => {});
  return result;
}
export async function createEngine(onProgress = () => {}, files = bytes) {
  const counts = [0, 0];
  const bytesTotal = 15969086 + 522240;
  function report(index, n) {
    counts[index] = n;
    onProgress(Math.min(0.85, 0.85 * (counts[0] + counts[1]) / bytesTotal));
  }
  const [model, voice] = await Promise.all([
    files('model_fp16.onnx', n => report(0, n)),
    files('af_msa.bin', n => report(1, n)),
    initEspeak()
  ]);
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3
  });
  const styles = new Float32Array(voice.buffer, voice.byteOffset, voice.byteLength / 4);
  onProgress(1);
  return {
    async *synthesize(text, rate = 1) {
      for (const chunk of await encode(text)) {
        if (chunk.inputIds.length <= 2) continue;
        const row = Math.min(chunk.styleIndex, Math.floor(styles.length / styleWidth) - 1);
        const feeds = {
          input_ids: new ort.Tensor('int64', BigInt64Array.from(chunk.inputIds, BigInt), [1, chunk.inputIds.length]),
          style: new ort.Tensor('float32', styles.subarray(row * styleWidth, (row + 1) * styleWidth), [1, styleWidth]),
          speed: new ort.Tensor('float32', new Float32Array([rate]), [1])
        };
        let output, result;
        try {
          output = await session.run(feeds);
          result = output.waveform.data.slice();
        } finally {
          for (const tensor of Object.values(output || {})) tensor.dispose();
          for (const tensor of Object.values(feeds)) tensor.dispose();
        }
        if (!result.length || result.some(value => !Number.isFinite(value))) throw new Error('تعذّر توليد الصوت.');
        yield result;
      }
    }
  };
}
