// Vorlesen: neuronale Stimme (Piper, offline nach dem ersten Laden) oder die Stimmen des Geräts.
import { LANGS, PIPER_BASE } from './langs.js';
import { settings } from './store.js';
import { ensureLib } from './offline.js';

const BASE = new URL('../lib/piper/', import.meta.url).href;
const WASM = { onnxWasm: BASE + 'ort/', piperData: BASE + 'piper_phonemize.data', piperWasm: BASE + 'piper_phonemize.wasm' };

let piperMod = null, session = null, sessionVoice = null;
let audio = null;
// Ein einziger Abspieler, der beim ersten Tippen freigeschaltet wird. iOS erlaubt Ton sonst nur
// direkt nach einer Berührung – und zwischen Tippen und Vorlesen liegt hier Rechenzeit.
const player = new Audio();
player.setAttribute('playsinline', '');
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
let unlocked = false;
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  try { player.src = SILENT; player.play().catch(() => { unlocked = false; }); } catch { unlocked = false; }
  try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch {}
}
const wavCache = new Map();

async function piper() { return piperMod || (piperMod = await import('../lib/piper/piper-entry.js')); }

// Stimmen selbst zuverlässig ablegen (eigener Speicher der App, vollständig geprüft).
// Die Bibliothek legt sie zusätzlich im Gerätespeicher (OPFS) ab – ist die Kopie dort unvollständig, wird sie verworfen.
const VOICES = 'dolmetscher-modelle';
function voiceUrls(id) {
  const [loc, name, q] = id.split('-');
  const p = `${loc.split('_')[0]}/${loc}/${encodeURIComponent(name)}/${q}/${id}.onnx`;
  return [`${PIPER_BASE}/${p}`, `${PIPER_BASE}/${p}.json`];
}
async function ensureVoice(id, onProgress) {
  const c = await caches.open(VOICES);
  const sizes = {};
  for (const url of voiceUrls(id)) {
    let hit = await c.match(url);
    if (!hit) {
      if (!navigator.onLine) throw new Error('Stimme noch nicht auf dem Gerät');
      const res = await origFetch(url);
      if (!res.ok) throw new Error('Stimme nicht ladbar (' + res.status + ')');
      const total = +(res.headers.get('Content-Length') || 0);
      const reader = res.body.getReader(); const parts = []; let got = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; if (url.endsWith('.onnx') && onProgress) onProgress({ loaded: got, total }); }
      if (total && got !== total) throw new Error('Stimme unvollständig geladen');
      await c.put(url, new Response(new Blob(parts), { headers: { 'Content-Type': 'application/octet-stream' } }));
      hit = await c.match(url);
    }
    sizes[url.split('/').at(-1)] = (await hit.clone().blob()).size;
  }
  // Alte Zweitkopie im Gerätespeicher (OPFS, aus v1.0/1.1) entfernen – spart Platz
  try {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('piper', { create: true });
    for (const name of Object.keys(sizes)) { try { await dir.removeEntry(name); } catch {} }
  } catch {}
}
// Während die Bibliothek die Stimme lädt, ihren eigenen Gerätespeicher sperren:
// sie holt die Stimme dann aus dem App-Speicher und legt keine zweite Kopie an.
async function withoutOpfs(fn) {
  const st = navigator.storage, orig = st && st.getDirectory;
  // Schein-Ordner: Lesen findet nichts, Schreiben landet nirgends (keine Fehlermeldungen)
  const fakeFile = { createWritable: async () => ({ write: async () => {}, close: async () => {} }) };
  const fakeDir = { getFileHandle: async (n, o) => { if (o && o.create) return fakeFile; throw new DOMException('nicht da', 'NotFoundError'); }, removeEntry: async () => {} };
  if (orig) st.getDirectory = async () => ({ getDirectoryHandle: async () => fakeDir });
  try { return await fn(); } finally { if (orig) st.getDirectory = orig; }
}
// Anfragen der Bibliothek nach Stimmen aus dem eigenen Speicher bedienen
const origFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input && input.url;
  if (url && url.startsWith(PIPER_BASE)) {
    const hit = await (await caches.open(VOICES)).match(url);
    if (hit) return hit;
  }
  return origFetch(input, init);
};

async function getSession(voiceId, onProgress) {
  const P = await piper();
  if (session && sessionVoice === voiceId) return session;
  await ensureVoice(voiceId, onProgress);
  P.TtsSession._instance = null; // je Stimme eigene Sitzung
  try {
    session = await withoutOpfs(() => P.TtsSession.create({ voiceId, wasmPaths: WASM, progress: onProgress }));
  } catch (e) {
    // Gespeicherte Stimme beschädigt (z. B. App beim Speichern geschlossen) → Datei verwerfen, neu holen
    // (kommt dann aus dem Offline-Speicher der App oder aus dem Netz)
    console.warn('Stimme neu laden', e);
    if (!navigator.onLine) throw e; // ohne Netz nichts wegwerfen
    P.TtsSession._instance = null;
    const c = await caches.open(VOICES);
    for (const r of await c.keys()) if (r.url.includes(voiceId)) await c.delete(r);
    await ensureVoice(voiceId, onProgress);
    session = await withoutOpfs(() => P.TtsSession.create({ voiceId, wasmPaths: WASM, progress: onProgress }));
  }
  sessionVoice = voiceId;
  ensureLib();
  return session;
}

export function stop() {
  if (audio) { audio.pause(); audio = null; }
  try { player.pause(); } catch {}
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

function systemVoice(bcp) {
  const vs = speechSynthesis.getVoices();
  const l = bcp.toLowerCase(), short = l.split('-')[0];
  return vs.find(v => v.lang.toLowerCase().replace('_', '-') === l && v.localService) ||
         vs.find(v => v.lang.toLowerCase().startsWith(short) && v.localService) ||
         vs.find(v => v.lang.toLowerCase().startsWith(short)) || null;
}

function speakSystem(text, lang, rate) {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) return reject(new Error('Keine Sprachausgabe im Browser'));
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANGS[lang].bcp;
    const v = systemVoice(u.lang); if (v) u.voice = v;
    u.rate = rate;
    u.onend = resolve; u.onerror = e => reject(new Error(e.error || 'Sprachausgabe fehlgeschlagen'));
    speechSynthesis.speak(u);
  });
}

// Liest Text in Sprache lang vor. slow = langsam (zum Nachsprechen).
export async function speak(text, lang, { slow = false, onProgress } = {}) {
  stop();
  text = (text || '').trim(); if (!text) return;
  const s = settings.get();
  const rate = (s.tempo || 1) * (slow ? 0.7 : 1);
  const voice = LANGS[lang].piper;
  if (s.stimme === 'piper' && voice) {
    try {
      const key = voice + '|' + text;
      let url = wavCache.get(key);
      if (!url) {
        const sess = await getSession(voice, onProgress);
        const wav = await sess.predict(text);
        url = URL.createObjectURL(wav);
        if (wavCache.size > 40) { for (const u of wavCache.values()) URL.revokeObjectURL(u); wavCache.clear(); }
        wavCache.set(key, url);
      }
      audio = player;
      audio.src = url;
      audio.playbackRate = rate;
      audio.preservesPitch = true; audio.webkitPreservesPitch = true;
      await audio.play();
      await new Promise(r => { audio.onended = r; audio.onpause = r; });
      return;
    } catch (e) {
      console.warn('Piper fehlgeschlagen, nehme Gerätestimme', e);
    }
  }
  await speakSystem(text, lang, rate);
}

export async function piperDownload(voiceId, onProgress) {
  const P = await piper();
  // Laden über die Sitzung legt die Dateien im Gerätespeicher ab (und im Offline-Speicher der App).
  P.TtsSession._instance = null; session = null; sessionVoice = null;
  await getSession(voiceId, onProgress);
}

export async function piperStored() {
  try {
    const keys = (await (await caches.open(VOICES)).keys()).map(r => decodeURIComponent(r.url.split('/').at(-1)));
    return keys.filter(k => k.endsWith('.onnx')).map(k => k.slice(0, -5));
  } catch { return []; }
}

export async function piperRemove(voiceId) {
  const P = await piper();
  await P.remove(voiceId);
  const c = await caches.open('dolmetscher-modelle');
  for (const r of await c.keys()) if (r.url.includes(voiceId)) await c.delete(r);
  if (sessionVoice === voiceId) { session = null; sessionVoice = null; P.TtsSession._instance = null; }
}

if ('speechSynthesis' in window) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices(); }

// Nur erzeugen, nicht abspielen (für Tests und spätere Export-Funktion)
export async function synth(text, lang) {
  const sess = await getSession(LANGS[lang].piper);
  return sess.predict(text);
}
