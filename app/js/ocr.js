// Texterkennung auf Fotos mit Tesseract.js (läuft im Browser, Sprachdaten bleiben nach dem ersten Laden auf dem Gerät).
import { LANGS, TESS_BASE } from './langs.js';
import { ensureLib } from './offline.js';

const LIB = new URL('../lib/tesseract/', import.meta.url).href;
let libReady = null, worker = null, workerLang = null, progressCb = null;

function loadLib() {
  return libReady || (libReady = new Promise((res, rej) => {
    if (window.Tesseract) return res();
    const s = document.createElement('script');
    s.src = LIB + 'tesseract.min.js'; s.onload = res; s.onerror = () => rej(new Error('Texterkennung konnte nicht geladen werden'));
    document.head.appendChild(s);
  }));
}

async function getWorker(lang, onProgress) {
  progressCb = onProgress;
  const code = LANGS[lang].tess;
  if (worker && workerLang === code) return worker;
  await loadLib();
  if (worker) { await worker.terminate(); worker = null; }
  worker = await window.Tesseract.createWorker(code, 1, {
    workerPath: LIB + 'worker.min.js',
    corePath: LIB + 'core/',
    langPath: TESS_BASE,
    workerBlobURL: false,
    logger: m => progressCb && progressCb(m),
  });
  workerLang = code;
  ensureLib();
  return worker;
}

// Erkennt Text auf einem Bild. Liefert Gesamttext und Absätze mit Rahmen (für die Übersetzung im Bild).
export async function recognize(image, lang, onProgress) {
  const wk = await getWorker(lang, onProgress);
  const { data } = await wk.recognize(image, {}, { text: true, blocks: true });
  const paras = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) {
    if (p.confidence <= 30) continue;
    const lines = (p.lines || []).map(l => ({ text: l.text.replace(/\s+/g, ' ').trim(), bbox: l.bbox })).filter(l => l.text);
    if (!lines.length) continue;
    // Kurze Zeilen (Speisekarte, Schilder, Listen) einzeln übersetzen, Fließtext als Absatz.
    const avg = lines.reduce((a, l) => a + l.text.length, 0) / lines.length;
    const list = lines.length > 1 && (avg < 45 || lines.every(l => !/[,;-]$/.test(l.text) && /^[\p{Lu}\p{N}•\-–]/u.test(l.text)));
    if (list) lines.forEach(l => paras.push({ text: l.text, bbox: l.bbox, lines: 1 }));
    else paras.push({ text: lines.map(l => l.text).join(' ').replace(/- (\p{Ll})/gu, '$1'), bbox: p.bbox, lines: lines.length });
  }
  return { text: (data.text || '').trim(), paras };
}

export async function downloadLang(lang, onProgress) { await getWorker(lang, onProgress); }

// Prüft, ob die Sprachdaten schon auf dem Gerät liegen (Tesseract legt sie in IndexedDB ab).
export function hasLang(lang) {
  const code = LANGS[lang].tess;
  return new Promise(res => {
    const rq = indexedDB.open('keyval-store');
    rq.onerror = () => res(false);
    rq.onupgradeneeded = () => { rq.transaction.abort(); res(false); };
    rq.onsuccess = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains('keyval')) { db.close(); return res(false); }
      const k = db.transaction('keyval').objectStore('keyval').getAllKeys();
      k.onsuccess = () => { db.close(); res(k.result.some(x => String(x).endsWith('/' + code + '.traineddata') || String(x) === code + '.traineddata' || String(x).endsWith(code + '.traineddata'))); };
      k.onerror = () => { db.close(); res(false); };
    };
  });
}

export function removeLang(lang) {
  const code = LANGS[lang].tess;
  return new Promise(res => {
    const rq = indexedDB.open('keyval-store');
    rq.onerror = () => res();
    rq.onsuccess = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains('keyval')) { db.close(); return res(); }
      const st = db.transaction('keyval', 'readwrite').objectStore('keyval');
      const k = st.getAllKeys();
      k.onsuccess = () => { k.result.filter(x => String(x).endsWith(code + '.traineddata')).forEach(x => st.delete(x)); };
      st.transaction.oncomplete = () => { db.close(); res(); };
    };
  });
}
