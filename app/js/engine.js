// Verbindung zur Oberfläche: Übersetzen, Spracherkennung, Modelle laden.
import { route, WHISPER_MODELS, LANGS } from './langs.js';
import { settings } from './store.js';
import { llmTranslate } from './llm.js';
import { ensureLib } from './offline.js';

let worker = null, seq = 0;
const pending = new Map();

function w() {
  if (!worker) {
    worker = new Worker(new URL('./engine-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      if (data.type === 'progress') p.onProgress && p.onProgress(data);
      else if (data.type === 'partial') p.onPartial && p.onPartial(data);
      else if (data.type === 'done') { pending.delete(data.id); p.resolve(data.result); }
      else if (data.type === 'error') { pending.delete(data.id); p.reject(new Error(data.error)); }
    };
    worker.onerror = e => { for (const p of pending.values()) p.reject(new Error(e.message || 'Rechen-Arbeiter abgestürzt')); pending.clear(); worker = null; };
  }
  return worker;
}

function call(msg, { onProgress, onPartial, transfer } = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress, onPartial });
    w().postMessage({ ...msg, id, mode: settings.get().rechenweg }, transfer || []);
  });
}

// Kleiner Zwischenspeicher: gleiche Sätze nicht doppelt rechnen.
const memo = new Map();

export async function translate(text, src, tgt, cb = {}) {
  text = (text || '').trim();
  if (!text) return '';
  if (src === tgt) return text;
  const key = `${src}|${tgt}|${text}`;
  if (memo.has(key)) return memo.get(key);
  const s = settings.get();
  let out = null;
  if (s.llmAn) {
    try { out = await llmTranslate(text, src, tgt); }
    catch (e) { cb.onNote && cb.onNote('Lokales Modell nicht erreichbar – nehme das Offline-Modell.'); }
  }
  if (out == null) {
    const steps = route(src, tgt);
    if (!steps) throw new Error(`${LANGS[tgt].name} als Zielsprache geht offline noch nicht (nur in die andere Richtung oder mit lokalem Modell).`);
    out = await call({ type: 'translate', text, steps }, cb);
  }
  ensureLib();
  if (memo.size > 500) memo.clear();
  memo.set(key, out);
  return out;
}

export async function transcribe(audio, lang, cb = {}) {
  const model = WHISPER_MODELS[settings.get().whisper || 'base'].id;
  return call({ type: 'stt', audio, model, language: lang ? LANGS[lang].whisper : null }, { ...cb, transfer: [audio.buffer] });
}

export function loadModel(task, model, cb = {}) {
  return call({ type: 'load', task, model }, cb);
}

export function routeInfo(src, tgt) {
  const r = route(src, tgt);
  if (!r) return 'nicht offline verfügbar';
  if (r.length === 0) return '';
  return r.length === 1 ? 'direkt' : 'über Englisch';
}
