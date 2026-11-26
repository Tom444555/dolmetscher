// Rechen-Arbeiter: Spracherkennung (Whisper) und Übersetzung (Opus-MT) über Transformers.js.
// Läuft getrennt von der Oberfläche, damit nichts ruckelt. Modelle landen nach dem ersten
// Laden im Browser-Speicher ("transformers-cache") und gehen danach offline.
import { pipeline, env } from '../lib/transformers/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = new URL('../lib/transformers/', import.meta.url).href;
env.backends.onnx.wasm.proxy = false;

const pipes = new Map(); // Schlüssel -> Promise<pipeline>
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

async function getPipe(id, task, model, mode) {
  const gpu = task === 'automatic-speech-recognition' && await hasGpu(mode);
  const key = `${task}|${model}|${gpu ? 'gpu' : 'cpu'}`;
  if (!pipes.has(key)) {
    const opts = { progress_callback: progressFor(id, model) };
    if (gpu) { opts.device = 'webgpu'; opts.dtype = { encoder_model: 'fp32', decoder_model_merged: 'q4' }; }
    else { opts.device = 'wasm'; opts.dtype = 'q8'; }
    const p = pipeline(task, model, opts).catch(async e => {
      pipes.delete(key);
      if (gpu) { // Grafikweg klappt nicht -> CPU
        gpuOk = false;
        return getPipe(id, task, model, 'cpu');
      }
      throw e;
    });
    pipes.set(key, p);
  }
  return pipes.get(key);
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
  const tr = await getPipe(id, 'translation', step.model, mode);
  const parts = chunks(text);
  const todo = parts.filter(p => p.t);
  const BATCH = 8;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const res = await tr(batch.map(p => (step.prefix || '') + p.t), { max_new_tokens: 400, num_beams: 1 });
    batch.forEach((p, k) => { p.r = res[k].translation_text; });
    postMessage({ id, type: 'partial', done: Math.min(i + BATCH, todo.length), total: todo.length });
  }
  let s = '';
  for (const p of parts) s += p.nl ? '\n' : (s && !s.endsWith('\n') ? ' ' : '') + p.r;
  return s;
}

self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'translate') {
      let text = data.text;
      for (const step of data.steps) text = await translateStep(id, text, step, data.mode);
      postMessage({ id, type: 'done', result: text });
    } else if (type === 'stt') {
      const asr = await getPipe(id, 'automatic-speech-recognition', data.model, data.mode);
      const opts = { task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 };
      if (data.language) opts.language = data.language;
      const out = await asr(data.audio, opts);
      postMessage({ id, type: 'done', result: (out.text || '').trim() });
    } else if (type === 'load') {
      await getPipe(id, data.task, data.model, data.mode);
      postMessage({ id, type: 'done', result: true });
    }
  } catch (e) {
    postMessage({ id, type: 'error', error: String(e && e.message || e) });
  }
};
