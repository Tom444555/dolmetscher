// PDF lesen: Text direkt aus der Datei; eingescannte Seiten (ohne Text) werden per Foto-Texterkennung gelesen.
import { recognize } from './ocr.js';

const LIB = new URL('../lib/pdf/', import.meta.url).href;
let lib = null;

async function pdfjs() {
  if (!lib) {
    lib = await import(LIB + 'pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = LIB + 'pdf.worker.min.mjs';
  }
  return lib;
}

// Liefert den Text der PDF. lang = Sprache für eingescannte Seiten. maxSeiten schützt vor Riesen-Dateien.
export async function pdfText(file, lang, onStatus = () => {}, maxSeiten = 30) {
  const P = await pdfjs();
  const doc = await P.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const n = Math.min(doc.numPages, maxSeiten);
  const pages = [];
  try {
  for (let i = 1; i <= n; i++) {
    onStatus(`Lese Seite ${i} von ${n} …`);
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    // Zeilen anhand der Höhe auf der Seite wieder zusammensetzen
    let text = '', lastY = null;
    for (const it of tc.items) {
      const y = it.transform ? Math.round(it.transform[5]) : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) text += '\n';
      else if (text && !text.endsWith(' ') && !text.endsWith('\n')) text += ' ';
      text += it.str; if (it.hasEOL) text += '\n';
      lastY = y;
    }
    text = text.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (text.replace(/\s/g, '').length < 20) { // eingescannt -> Texterkennung
      onStatus(`Seite ${i}: eingescannt, erkenne Text …`);
      const vp = page.getViewport({ scale: 2 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      text = (await recognize(c, lang)).text;
      c.width = 0; c.height = 0; // Speicher freigeben
    }
    page.cleanup();
    // Zeilenumbrüche mitten im Satz entfernen (Fließtext), Absätze behalten
    text = text.replace(/([^\n.!?:;])\n(?=[a-zäöüß\p{Ll}])/gu, '$1 ').replace(/-\n(\p{Ll})/gu, '$1');
    pages.push(text);
  }
  } finally { doc.destroy(); }
  return { text: pages.join('\n\n'), seiten: doc.numPages, gelesen: n };
}
