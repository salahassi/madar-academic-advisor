/* Both Arabic voices generate replies in a local worker. The preview is synthesized
   in advance with that voice so it can play before a model has been downloaded. */
(() => {
  'use strict';
  const base = new URL('.', document.currentScript?.src || document.baseURI);
  const voices = {
    studio: {worker: 'voice-studio-worker.js', preview: 'assets/voice-natural/preview.mp3'},
    light: {worker: 'voice-natural-worker.js', preview: 'assets/voice-natural/preview-light.mp3'}
  };
  const playing = new Set();
  const samples = new Map();
  const callbacks = new Set();
  let selected = 'studio';
  let context, worker, loading, loadTimer, resolveLoad, rejectLoad, playback;
  let nextId = 0, progress = 0, ready = false;

  const abort = () => new DOMException('توقّف تشغيل الصوت.', 'AbortError');
  const supported = () => Boolean(window.Worker && window.WebAssembly && (window.AudioContext || window.webkitAudioContext));
  function unlock() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('خدمة الصوت غير متاحة في هذا المتصفح.');
      if (!context || context.state === 'closed') context = new Audio();
      return context.state === 'running' ? Promise.resolve() : context.resume();
    } catch (error) { return Promise.reject(error); }
  }
  function report(value) {
    progress = Math.min(1, Math.max(0, Number(value) || 0));
    for (const cb of callbacks) { try { cb(progress); } catch {} }
  }
  function stop(error = abort()) {
    const job = playback;
    playback = null;
    if (job) {
      job.controller.abort();
      worker?.postMessage({type: 'cancel', id: job.id});
      job.reject(error);
    }
    for (const source of playing) {
      source.onended = null;
      try { source.stop(); source.disconnect(); } catch {}
    }
    playing.clear();
  }
  function release(error = abort()) {
    stop(error);
    clearTimeout(loadTimer);
    if (worker) {
      worker.onmessage = worker.onerror = null;
      worker.terminate();
    }
    worker = null;
    const reject = rejectLoad;
    loading = resolveLoad = rejectLoad = null;
    progress = 0;
    ready = false;
    callbacks.clear();
    reject?.(error);
  }
  function select(key) {
    if (!Object.hasOwn(voices, key)) throw new RangeError('صوت غير معروف.');
    if (selected !== key) { release(); selected = key; }
    return selected;
  }
  function finish() {
    if (!playback || !playback.finished || playing.size) return;
    const job = playback;
    playback = null;
    job.resolve();
  }
  function enqueue(job, buffer, delay = 0, rate = 1) {
    if (playback !== job) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.connect(context.destination);
    const start = Math.max(context.currentTime + 0.025, job.next);
    job.next = start + buffer.duration / rate + delay;
    playing.add(source);
    source.onended = () => {
      playing.delete(source);
      source.disconnect();
      if (playback === job) finish();
    };
    source.start(start);
  }
  function failWorker() {
    release(new Error('تعذّر تجهيز الصوت. تحقق من الاتصال ثم أعد المحاولة.'));
  }
  function armWatchdog() {
    clearTimeout(loadTimer);
    loadTimer = setTimeout(failWorker, 180000);
  }
  function connected({data}) {
    if (data.type === 'progress') { if (!ready) armWatchdog(); report(data.value); return; }
    if (data.type === 'ready') {
      clearTimeout(loadTimer);
      ready = true;
      report(1);
      callbacks.clear();
      const resolve = resolveLoad;
      loading = resolveLoad = rejectLoad = null;
      resolve?.();
      return;
    }
    if (data.type === 'load-error') { failWorker(); return; }
    const job = playback;
    if (!job || job.id !== data.id) return;
    if (data.type === 'error') { stop(new Error('تعذّر نطق الرد. يمكنك إعادة تشغيله.')); return; }
    if (data.type === 'chunk') {
      try {
        const buffer = context.createBuffer(1, data.samples.length, data.sampleRate);
        buffer.copyToChannel(data.samples, 0);
        enqueue(job, buffer, (Number(data.breakMs) || 0) / 1000);
      } catch { stop(new Error('تعذّر تشغيل الصوت.')); }
    } else if (data.type === 'done') { job.finished = true; finish(); }
  }
  function prepare(opts = {}) {
    if (!supported()) return Promise.reject(new Error('صوت مدار يتطلب متصفحًا يدعم WebAssembly والصوت.'));
    if (ready) { opts.onProgress?.(1); return Promise.resolve(); }
    if (opts.onProgress) { callbacks.add(opts.onProgress); opts.onProgress(progress); }
    if (loading) return loading;
    loading = new Promise((resolve, reject) => { resolveLoad = resolve; rejectLoad = reject; });
    const result = loading;
    try {
      worker = new Worker(new URL(voices[selected].worker, base), {type: 'module', name: 'madar-' + selected});
      const instance = worker;
      worker.onmessage = event => { if (worker === instance) connected(event); };
      worker.onerror = () => { if (worker === instance) failWorker(); };
      worker.onmessageerror = worker.onerror;
      armWatchdog();
      worker.postMessage({type: 'load'});
    } catch { failWorker(); }
    return result;
  }
  function start(action) {
    stop();
    return new Promise((resolve, reject) => {
      const job = {id: ++nextId, resolve, reject, finished: false, next: 0, controller: new AbortController()};
      playback = job;
      unlock().then(() => { if (playback === job) return action(job); })
        .catch(error => { if (playback === job) stop(error); });
    });
  }
  function speak(text, opts = {}) {
    if (!String(text || '').trim()) return Promise.resolve();
    return start(async job => {
      await prepare(opts);
      if (playback === job) worker.postMessage({type: 'speak', id: job.id, text: String(text), rate: opts.rate || 1});
    });
  }
  function preview(opts = {}) {
    const key = selected;
    return start(async job => {
      if (!samples.has(key)) {
        const response = await fetch(new URL(voices[key].preview, base), {signal: job.controller.signal});
        if (!response.ok) throw new Error('تعذّر تحميل عيّنة الصوت.');
        samples.set(key, await context.decodeAudioData(await response.arrayBuffer()));
      }
      if (playback === job) {
        enqueue(job, samples.get(key), 0, Math.max(0.8, Math.min(1.2, Number(opts.rate) || 1)));
        job.finished = true;
        finish();
      }
    });
  }
  window.addEventListener('pagehide', () => release());
  window.MadarNatural = {available: supported, supported, unlock, prepare, speak, preview, stop, release, select,
    mode: () => selected, ready: () => ready};
})();
