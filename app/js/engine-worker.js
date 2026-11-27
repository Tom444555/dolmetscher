// Rechen-Arbeiter: Spracherkennung (Whisper) und Übersetzung (Opus-MT / NLLB) über Transformers.js.
// Läuft getrennt von der Oberfläche, damit nichts ruckelt. Modelle landen nach dem ersten
// Laden im Browser-Speicher ("transformers-cache") und gehen danach offline.
import { pipeline, env, Tensor } from '../lib/transformers/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('../lib/transformers/', import.meta.url).href;
env.backends.onnx.wasm.proxy = false;

// Höchstens so viele Übersetzungsmodelle gleichzeitig im Arbeitsspeicher (iPad: Safari beendet sonst die App).
const MAX_TRANSLATORS = 4; // 4 = Hin- und Rückweg über Englisch passen gleichzeitig hinein
const pipes = new Map(); // Schlüssel -> { p: Promise<pipeline>, task, used }
let gpuOk = null;

async function hasGpu(mode) {
  if (mode === 'cpu') return false;
  if (gpuOk !== null) return gpuOk;
  try { gpuOk = !!(self.navigator.gpu && await self.navigator.gpu.requestAdapter()); } catch { gpuOk = false; }
  return gpuOk;
}

function progressFor(id, model) {
  const files = {};
  return p => {
    if (p.status === 'progress' && p.file) {
      files[p.file] = { loaded: p.loaded || 0, total: p.total || 0 };
      let l = 0, t = 0;
      for (const f of Object.values(files)) { l += f.loaded; t += f.total; }
      postMessage({ id, type: 'progress', model, loaded: l, total: t });
    }
  };
}

async function freePipe(e) { try { const p = await e.p; await p?.dispose?.(); } catch {} }

// Eintrag aus der Liste nehmen; rechnet er noch, wird er freigegeben, sobald er fertig ist.
async function dispose(key) {
  const e = pipes.get(key); if (!e) return;
  pipes.delete(key);
  if (e.busy > 0) e.evict = true; else await freePipe(e);
}

async function trimTranslators(keep) {
  const all = [...pipes.entries()].filter(([k, e]) => e.task === 'translation' && k !== keep);
  const idle = all.filter(([, e]) => !e.busy).sort((a, b) => a[1].used - b[1].used);
  let n = all.length;
  while (n >= MAX_TRANSLATORS && idle.length) { await dispose(idle.shift()[0]); n--; }
}

async function getPipe(id, task, model, mode) {
  const gpu = task === 'automatic-speech-recognition' && await hasGpu(mode);
  const key = `${task}|${model}|${gpu ? 'gpu' : 'cpu'}`;
  let e = pipes.get(key);
  if (!e) {
    // Eintrag sofort (ohne Pause dazwischen) anlegen, damit ein zweiter Auftrag dasselbe Modell nicht doppelt lädt
    const opts = { progress_callback: progressFor(id, model) };
    if (gpu) { opts.device = 'webgpu'; opts.dtype = { encoder_model: 'fp32', decoder_model_merged: 'q4' }; }
    else { opts.device = 'wasm'; opts.dtype = 'q8'; }
    const p = pipeline(task, model, opts).catch(err => {
      if (pipes.get(key) === e) pipes.delete(key);
      if (gpu) { gpuOk = false; return null; } // Grafikweg klappt nicht -> Aufrufer nimmt CPU
      throw err;
    });
    e = { p, task, used: Date.now(), gpu, busy: 0 };
    pipes.set(key, e);
    if (task === 'translation') await trimTranslators(key);
    if (task === 'automatic-speech-recognition') { // nur eine Spracherkennung gleichzeitig
      for (const [k, x] of [...pipes]) if (x.task === task && k !== key) await dispose(k);
    }
  }
  e.used = Date.now(); e.busy++;
  let pipe;
  try { pipe = await e.p; } catch (err) { e.busy--; throw err; }
  if (!pipe) { e.busy--; return getPipe(id, task, model, 'cpu'); }
  let released = false;
  const done = () => {
    if (released) return; released = true; e.busy--;
    if (e.evict && e.busy === 0) freePipe(e);
  };
  return { pipe, key, gpu: e.gpu, done };
}

// Text in handliche Stücke (Sätze/Zeilen) teilen, damit lange Texte sauber durchlaufen.
function chunks(text) {
  const out = [];
  for (const para of text.split(/\n/)) {
    if (!para.trim()) { out.push({ t: '', nl: true }); continue; }
    const sents = para.match(/[^.!?…;。！？]+[.!?…;。！？]*["'»«”“)]*\s*/g) || [para];
    let cur = '';
    for (const s of sents) {
      if ((cur + s).length > 300 && cur) { out.push({ t: cur.trim() }); cur = ''; }
      cur += s;
    }
    if (cur.trim()) out.push({ t: cur.trim() });
    out.push({ t: '', nl: true });
  }
  out.pop();
  return out;
}

async function translateStep(id, text, step, mode) {
  const { pipe: tr, done } = await getPipe(id, 'translation', step.model, mode);
  try { return await runTranslate(id, tr, text, step); } finally { done(); }
}
async function runTranslate(id, tr, text, step) {
  const parts = chunks(text);
  const todo = parts.filter(p => p.t);
  const BATCH = step.nllb ? 4 : 8;
  const opts = { max_new_tokens: 400, num_beams: 1 };
  if (step.nllb) { opts.src_lang = step.nllb.src; opts.tgt_lang = step.nllb.tgt; }
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const res = await tr(batch.map(p => (step.prefix || '') + p.t), opts);
    batch.forEach((p, k) => { p.r = res[k].translation_text; });
    postMessage({ id, type: 'partial', done: Math.min(i + BATCH, todo.length), total: todo.length });
  }
  let s = '';
  for (const p of parts) s += p.nl ? '\n' : (s && !s.endsWith('\n') ? ' ' : '') + p.r;
  return s;
}

async function stt(id, data) {
  const opts = { task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 };
  if (data.language) opts.language = data.language;
  const { pipe, key, gpu, done } = await getPipe(id, 'automatic-speech-recognition', data.model, data.mode);
  try {
    return await pipe(data.audio, opts);
  } catch (e) {
    if (!gpu) throw e;
    // Grafikchip hat mitten im Erkennen aufgegeben -> ab jetzt CPU
    gpuOk = false; done(); await dispose(key);
    const c = await getPipe(id, 'automatic-speech-recognition', data.model, 'cpu');
    try { return await c.pipe(data.audio, opts); } finally { c.done(); }
  } finally { done(); }
}

// Welche der vorgegebenen Sprachen wird gesprochen? Whisper liefert für jede Sprache eine Wahrscheinlichkeit;
// wir vergleichen nur die Kandidaten (zuverlässiger als die freie Erkennung bei kurzen Sätzen).
async function lid(id, data) {
  const { pipe, done } = await getPipe(id, 'automatic-speech-recognition', data.model, data.mode);
  try {
    const audio = data.audio.length > 16000 * 30 ? data.audio.subarray(0, 16000 * 30) : data.audio;
    const { input_features } = await pipe.processor(audio);
    const tok = t => pipe.tokenizer.model.tokens_to_ids.get(t);
    const sot = tok('<|startoftranscript|>');
    const out = await pipe.model({ input_features, decoder_input_ids: new Tensor('int64', BigInt64Array.from([BigInt(sot)]), [1, 1]) });
    const logits = out.logits.data, V = out.logits.dims.at(-1), base = logits.length - V;
    const scores = {};
    for (const [code, name] of Object.entries(data.cands)) { const t = tok(`<|${code}|>`); scores[code] = t == null ? -Infinity : logits[base + t]; }
    return scores;
  } finally { done(); }
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'translate') {
      let text = data.text;
      for (const step of data.steps) text = await translateStep(id, text, step, data.mode);
      postMessage({ id, type: 'done', result: text });
    } else if (type === 'stt') {
      const out = await stt(id, data);
      postMessage({ id, type: 'done', result: (out.text || '').trim() });
    } else if (type === 'lid') {
      postMessage({ id, type: 'done', result: await lid(id, data) });
    } else if (type === 'load') {
      const g = await getPipe(id, data.task, data.model, data.mode); g.done();
      postMessage({ id, type: 'done', result: true });
    } else if (type === 'free') {
      for (const k of [...pipes.keys()]) if (!data.task || pipes.get(k).task === data.task) await dispose(k);
      postMessage({ id, type: 'done', result: true });
    }
  } catch (e) {
    postMessage({ id, type: 'error', error: String(e && e.message || e) });
  }
};
