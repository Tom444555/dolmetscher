// Verbindung zur Oberfläche: Übersetzen, Spracherkennung, Modelle laden.
import { route, WHISPER_MODELS, LANGS } from './langs.js';
import { settings, glossary } from './store.js';
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
    // Abgestürzt (z. B. Speicher voll auf dem iPad): neu starten, offene Aufträge melden Fehler
    worker.onerror = e => { for (const p of pending.values()) p.reject(new Error('Rechen-Arbeiter neu gestartet – bitte nochmal versuchen')); pending.clear(); try { worker.terminate(); } catch {} worker = null; };
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

export const stepsFor = (src, tgt) => route(src, tgt, { nllb: settings.get().nllb });

// Kleiner Zwischenspeicher: gleiche Sätze nicht doppelt rechnen.
const memo = new Map();

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function termRe(t) { return new RegExp('(^|[^\\p{L}\\p{N}])(' + escRe(t) + ')(?=$|[^\\p{L}\\p{N}])', 'giu'); }

// Fachwörterbuch: feste Begriffe vor dem Übersetzen einsetzen, danach prüfen.
function glossFor(src, tgt) {
  const g = glossary.all();
  if (src === 'de') return g.filter(e => e.lang === tgt).map(e => ({ from: e.de, to: e.ziel }));
  if (tgt === 'de') return g.filter(e => e.lang === src).map(e => ({ from: e.ziel, to: e.de }));
  return [];
}

async function rawTranslate(text, src, tgt, cb) {
  const s = settings.get();
  if (s.llmAn) {
    try { return await llmTranslate(text, src, tgt); }
    catch (e) { cb.onNote && cb.onNote('Lokales Modell nicht erreichbar – nehme das Offline-Modell.'); }
  }
  const steps = stepsFor(src, tgt);
  if (!steps) throw new Error(`${LANGS[tgt].name} als Zielsprache geht offline nur mit dem großen Sprachmodell (Mehr › Einstellungen) oder dem lokalen Modell.`);
  return call({ type: 'translate', text, steps }, cb);
}

function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
// Wortgruppe im Text finden, die dem Begriff sehr ähnlich ist (kleine Tippfehler des Modells).
// Nur bei längeren Begriffen, damit kurze Wörter wie „seal“/„seat“ nicht verwechselt werden.
function fuzzyFind(out, term) {
  const low = term.toLowerCase(); if (low.length < 6) return null;
  const n = term.split(/\s+/).length;
  const words = [...out.matchAll(/[\p{L}\p{N}'-]+/gu)];
  for (let i = 0; i + n <= words.length; i++) {
    const start = words[i].index, last = words[i + n - 1], end = last.index + last[0].length;
    const cand = out.slice(start, end);
    if (lev(cand.toLowerCase(), low) <= Math.max(1, Math.floor(low.length / 6))) return { start, end };
  }
  return null;
}
const ARTIKEL = /^(the|a|an|le|la|les|l'|un|une|el|los|las|il|lo|gli|i|de|het|een|der|die|das|ein|eine|o|os|as|um|uma)\s+/i;

export async function translate(text, src, tgt, cb = {}) {
  text = (text || '').trim();
  if (!text) return '';
  if (src === tgt) return text;
  const s = settings.get();
  const terms = cb.ohneFachwoerter ? [] : glossFor(src, tgt).filter(t => termRe(t.from).test(text));
  const key = `${src}|${tgt}|${s.nllb ? 'n' : ''}${s.llmAn ? 'l' : ''}|${JSON.stringify(terms)}|${text}`;
  if (memo.has(key)) return memo.get(key);
  let out = await rawTranslate(text, src, tgt, cb);
  // Fachwörter: die Übersetzung des Begriffs im Ergebnis gegen deinen festen Begriff tauschen
  for (const t of terms) {
    if (termRe(t.to).test(out)) continue;
    const near = fuzzyFind(out, t.to);
    if (near) { out = out.slice(0, near.start) + t.to + out.slice(near.end); continue; }
    let plain = '';
    try { plain = (await rawTranslate(t.from, src, tgt, {})).replace(/[.!?]+$/, '').trim(); } catch {}
    const cands = [plain, plain.replace(ARTIKEL, '')].filter(Boolean);
    const exact = cands.find(c => termRe(c).test(out));
    if (exact) { out = out.replace(termRe(exact), (m, pre) => pre + t.to); continue; }
    const f = cands.map(c => fuzzyFind(out, c)).find(Boolean);
    if (f) { out = out.slice(0, f.start) + t.to + out.slice(f.end); continue; }
    // letzter Versuch: Begriff vorab einsetzen und nur übernehmen, wenn er heil durchkommt
    try {
      const alt = await rawTranslate(text.replace(termRe(t.from), (m, pre) => pre + t.to), src, tgt, {});
      if (termRe(t.to).test(alt)) out = alt;
    } catch {}
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

// Sprache bestimmen, nur zwischen den angegebenen Kandidaten (z. B. ['de','fr'])
export async function whichLang(audio, cands) {
  const model = WHISPER_MODELS[settings.get().whisper || 'base'].id;
  const map = {}; for (const c of cands) map[WHISPER_CODE[c] || c] = c;
  const sc = await call({ type: 'lid', audio: audio.slice(), model, cands: map });
  let best = cands[0], bv = -Infinity;
  for (const [code, v] of Object.entries(sc)) if (v > bv) { bv = v; best = map[code]; }
  return best;
}
const WHISPER_CODE = { he: 'he', zh: 'zh', fa: 'fa', bs: 'bs' };

export function loadModel(task, model, cb = {}) {
  return call({ type: 'load', task, model }, cb);
}

export function freeModels(task) { return worker ? call({ type: 'free', task }) : Promise.resolve(); }

export function routeInfo(src, tgt) {
  const r = stepsFor(src, tgt);
  if (!r) return 'nicht offline verfügbar';
  if (r.length === 0) return '';
  if (r[0].nllb) return 'großes Sprachmodell';
  return r.length === 1 ? 'direkt' : 'über Englisch';
}
