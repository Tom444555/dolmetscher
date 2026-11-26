// Vorlesen: neuronale Stimme (Piper, offline nach dem ersten Laden) oder die Stimmen des Geräts.
import { LANGS } from './langs.js';
import { settings } from './store.js';
import { ensureLib } from './offline.js';

const BASE = new URL('../lib/piper/', import.meta.url).href;
const WASM = { onnxWasm: BASE + 'ort/', piperData: BASE + 'piper_phonemize.data', piperWasm: BASE + 'piper_phonemize.wasm' };

let piperMod = null, session = null, sessionVoice = null;
let audio = null;
const wavCache = new Map();

async function piper() { return piperMod || (piperMod = await import('../lib/piper/piper-entry.js')); }

async function getSession(voiceId, onProgress) {
  const P = await piper();
  if (session && sessionVoice === voiceId) return session;
  P.TtsSession._instance = null; // je Stimme eigene Sitzung
  try {
    session = await P.TtsSession.create({ voiceId, wasmPaths: WASM, progress: onProgress });
  } catch (e) {
    // Gespeicherte Stimme beschädigt (z. B. App beim Speichern geschlossen) → Datei verwerfen, neu holen
    // (kommt dann aus dem Offline-Speicher der App oder aus dem Netz)
    console.warn('Stimme neu laden', e);
    await P.remove(voiceId).catch(() => {});
    P.TtsSession._instance = null;
    session = await P.TtsSession.create({ voiceId, wasmPaths: WASM, progress: onProgress });
  }
  sessionVoice = voiceId;
  ensureLib();
  return session;
}

export function stop() {
  if (audio) { audio.pause(); audio = null; }
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
      audio = new Audio(url);
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
  try { const P = await piper(); return await P.stored(); } catch { return []; }
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
