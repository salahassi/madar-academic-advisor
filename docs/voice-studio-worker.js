import {createStudioEngine, sampleRate} from './assets/voice-studio/synthesis.mjs';

let engine;
let speaking = null;
let queue = Promise.resolve();
function load() {
  if (!engine) engine = createStudioEngine(value => self.postMessage({type: 'progress', value}))
    .catch(error => { engine = null; throw error; });
  return engine;
}

function phrases(text) {
  const result = [];
  for (const sentence of text.match(/[^.!؟?!؛\n]+[.!؟?!؛]*|[^\s]/gu) || []) {
    let line = '';
    for (const word of sentence.trim().split(/\s+/u)) {
      if (!word) continue;
      if (line && (line.length + word.length > 165 || (line.length > 65 && /[،,:]$/u.test(line)))) {
        result.push(line);
        line = '';
      }
      // Bound even a pasted word without spaces to the model's training window.
      if (word.length > 160) {
        if (line) result.push(line);
        const pieces = Array.from(word).join('').match(/.{1,145}/gu) || [];
        result.push(...pieces.slice(0, -1));
        line = pieces.at(-1) || '';
      } else line += (line ? ' ' : '') + word;
    }
    if (line) result.push(line);
  }
  return result.filter(text => /[\p{L}\p{N}]/u.test(text));
}

async function generate({id, text, rate}) {
  const active = () => speaking === id;
  if (!active()) return;
  const studio = await load();
  const lines = phrases(text);
  if (!lines.length) throw new Error('لا توجد عبارات قابلة للنطق.');
  for (const line of lines) {
    if (!active()) return;
    const samples = await studio.synthesize(line, rate, active);
    if (!active() || !samples) return;
    const breakMs = /[.؟!?]$/u.test(line) ? 160 : 85;
    self.postMessage({type: 'chunk', id, samples, sampleRate, breakMs}, [samples.buffer]);
  }
  if (active()) self.postMessage({type: 'done', id});
}

self.onmessage = ({data}) => {
  if (data.type === 'load') {
    load().then(() => self.postMessage({type: 'ready'}))
      .catch(() => self.postMessage({type: 'load-error'}));
  } else if (data.type === 'cancel') {
    if (speaking === data.id) speaking = null;
  } else if (data.type === 'speak') {
    speaking = data.id;
    const job = {id: data.id, text: String(data.text || ''), rate: Math.max(0.8, Math.min(1.2, Number(data.rate) || 1))};
    queue = queue.then(() => generate(job)).catch(() => {
      if (speaking === job.id) self.postMessage({type: 'error', id: job.id});
    });
  }
};
