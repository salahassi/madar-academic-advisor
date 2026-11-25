import * as ort from '../voice-natural/ort.wasm.min.mjs';

const directory = new URL('.', import.meta.url);
const runtime = new URL('../voice-natural/', directory);
const sampleRate = 44100;
const steps = 5;
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.wasm.wasmPaths = runtime.href;

async function fetchBinary(part, report, cache) {
  const url = new URL(part.file, directory).href;
  const cached = await cache?.match(url).catch(() => undefined);
  if (cached) {
    const data = new Uint8Array(await cached.arrayBuffer());
    if (data.length === part.bytes) {
      report(data.length);
      return data;
    }
  }
  const response = await fetch(url, {cache: 'force-cache'});
  if (!response.ok) throw new Error('تعذّر تنزيل ملف الصوت.');
  const bytes = new Uint8Array(part.bytes);
  if (response.body) {
    const reader = response.body.getReader();
    let written = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      bytes.set(value, written);
      written += value.length;
      report(value.length);
    }
    if (written !== bytes.length) throw new Error('لم يكتمل تنزيل الصوت.');
  } else {
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length !== bytes.length) throw new Error('لم يكتمل تنزيل الصوت.');
    bytes.set(data);
    report(data.length);
  }
  if (cache) await cache.put(url, new Response(bytes)).catch(() => {});
  return bytes;
}

const options = {executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3};

export async function createStudioEngine(onProgress = () => {}) {
  const response = await fetch(new URL('manifest.json', directory));
  if (!response.ok) throw new Error('تعذرت قراءة ملفات الصوت.');
  const manifest = await response.json();
  const total = Object.values(manifest).flat().reduce((sum, part) => sum + part.bytes, 0);
  const cache = await globalThis.caches?.open('madar-voice-studio-v1').catch(() => undefined);
  let received = 0;
  const report = size => { received += size; onProgress(0.92 * received / total); };
  async function read(name) {
    const parts = manifest[name];
    if (parts.length === 1) return fetchBinary(parts[0], report, cache);
    const data = new Uint8Array(parts.reduce((sum, part) => sum + part.bytes, 0));
    let offset = 0;
    for (const part of parts) {
      data.set(await fetchBinary(part, report, cache), offset);
      offset += part.bytes;
    }
    return data;
  }

  // Create sessions one at a time to limit peak RAM on mobile browsers.
  const sessions = {};
  try {
    for (const name of ['encoder', 'denoiser', 'decoder']) {
      sessions[name] = await ort.InferenceSession.create(await read(name), options);
    }
    const [indexBytes, styleBytes] = await Promise.all([read('index'), read('voice')]);
    const index = new Int16Array(indexBytes.buffer, indexBytes.byteOffset, indexBytes.byteLength / 2);
    const style = new ort.Tensor('float32', new Float32Array(styleBytes.buffer, styleBytes.byteOffset, styleBytes.byteLength / 4), [1, 101, 128]);
    onProgress(1);
    return {synthesize: (phrase, rate, active) => synthesize(phrase, rate, active, sessions, index, style)};
  } catch (error) {
    await Promise.allSettled(Object.values(sessions).map(session => session.release()));
    throw error;
  }
}

function tokenize(text, index) {
  // Supertonic was trained with NFKD and a language tag, including for plain Arabic.
  let value = text.normalize('NFKD').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/[–‑—]/gu, '-').replace(/[_|/#[\]←→]/gu, ' ')
    .replace(/[“”]/gu, '"').replace(/[‘’´`]/gu, "'").replace(/\s+/gu, ' ').trim();
  if (!/[.!?;:,'")\]}…]$/u.test(value)) value += '.';
  return BigInt64Array.from(Array.from('<ar>' + value + '</ar>', char => BigInt(index[char.codePointAt(0)] ?? -1)));
}

const floats = (values, dims) => new ort.Tensor('float32', values, dims);
const longs = (values, dims) => new ort.Tensor('int64', values, dims);
const scalar = value => floats(Float32Array.of(value), [1]);

function normalNoise(length, phrase) {
  // Stable noise makes the same phrase and voice sound consistent on replay.
  let state = 2166136261;
  for (const ch of phrase) state = Math.imul(state ^ ch.codePointAt(0), 16777619);
  state >>>= 0;
  if (!state) state = 1;
  function uniform() {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return ((state >>> 0) + 1) / 4294967297;
  }
  const result = new Float32Array(length);
  for (let i = 0; i < length; i += 2) {
    const radius = Math.sqrt(-2 * Math.log(uniform()));
    const angle = 2 * Math.PI * uniform();
    result[i] = radius * Math.cos(angle);
    if (i + 1 < length) result[i + 1] = radius * Math.sin(angle);
  }
  return result;
}

async function synthesize(phrase, rate = 1, active = () => true, sessions, index, style) {
  const ids = tokenize(phrase, index);
  const buffers = [];
  const use = tensor => { buffers.push(tensor); return tensor; };
  const attention = use(longs(new BigInt64Array(ids.length).fill(1n), [1, ids.length]));
  try {
    const encoded = await sessions.encoder.run({
      input_ids: use(longs(ids, [1, ids.length])), attention_mask: attention, style
    });
    const hidden = use(encoded.last_hidden_state);
    const seconds = use(encoded.durations).data[0] / (1.03 * rate);
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 65) throw new Error('تعذّر تحديد مدة العبارة.');
    const samples = Math.floor(seconds * sampleRate);
    const frames = Math.ceil(samples / 3072);
    const shape = [1, 144, frames];
    let latent = use(floats(normalNoise(144 * frames, phrase), shape));
    const fixed = {
      encoder_outputs: hidden, attention_mask: attention, style,
      latent_mask: use(longs(new BigInt64Array(frames).fill(1n), [1, frames])),
      num_inference_steps: use(scalar(steps))
    };
    for (let step = 0; step < steps; step++) {
      // A queued stop can run even when ORT runs WASM synchronously in this worker.
      await new Promise(resolve => setTimeout(resolve, 0));
      if (!active()) return null;
      const out = await sessions.denoiser.run({...fixed, timestep: use(scalar(step)), noisy_latents: latent});
      latent = use(out.denoised_latents);
    }
    if (!active()) return null;
    const decoded = await sessions.decoder.run({latents: latent});
    const audio = use(decoded.waveform).data.slice(0, samples);
    if (!audio.length || audio.some(n => !Number.isFinite(n))) throw new Error('تعذّر توليد الصوت.');
    return audio;
  } finally {
    for (const tensor of buffers) tensor.dispose();
  }
}

export {ort, sampleRate};
