// Rechenkerne (Übersetzung, Stimme, Foto-Text) sicher in den Offline-Speicher legen
export const LIB_FILES = ['transformers/transformers.min.js', 'transformers/ort-wasm-simd-threaded.jsep.mjs', 'transformers/ort-wasm-simd-threaded.jsep.wasm',
  'piper/piper-entry.js', 'piper/chunk-I7AUKTXE.js', 'piper/piper-o91UDS6e-GW32FZS3.js', 'piper/ort.wasm.bundle.min-KDMJSHNQ.js',
  'piper/voices_static-D_OtJDHM-LIMG2ZKR.js', 'piper/ort/ort-wasm-simd-threaded.mjs', 'piper/ort/ort-wasm-simd-threaded.wasm',
  'piper/piper_phonemize.wasm', 'piper/piper_phonemize.data', 'tesseract/tesseract.min.js', 'tesseract/worker.min.js',
  'tesseract/core/tesseract-core-simd-lstm.wasm.js', 'tesseract/core/tesseract-core-lstm.wasm.js', 'pdf/pdf.min.mjs', 'pdf/pdf.worker.min.mjs'].map(f => new URL('../lib/' + f, import.meta.url).href);
export async function libStatus() {
  try { const c = await caches.open('dolmetscher-lib'); const have = new Set((await c.keys()).map(r => r.url)); return LIB_FILES.filter(f => !have.has(f)); }
  catch { return LIB_FILES; }
}
export async function libCache() {
  const c = await caches.open('dolmetscher-lib');
  for (const f of await libStatus()) await c.add(f);
}


// Nach dem ersten erfolgreichen Gebrauch einmal im Hintergrund alles sichern.
let once = null;
export function ensureLib() {
  if (once || !navigator.onLine) return;
  once = libCache().catch(() => { once = null; });
}
