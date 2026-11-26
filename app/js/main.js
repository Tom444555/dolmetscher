// Dolmetscher – Oberfläche
import { LANGS, WHISPER_MODELS, modelsFor, route } from './langs.js';
import { settings, history, vocab, phraseCache } from './store.js';
import { translate, transcribe, loadModel, routeInfo } from './engine.js';
import { speak, stop as stopSpeak, piperDownload, piperStored, piperRemove } from './tts.js';
import { recognize, downloadLang as ocrDownload, hasLang as ocrHas, removeLang as ocrRemove } from './ocr.js';
import { Recorder, decodeFile } from './rec.js';
import { PHRASES } from './phrases.js';
import { llmTest } from './llm.js';
import { libStatus, libCache } from './offline.js';

export const VERSION = 'v1.1 · 26.11.2026';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mb = b => (b / 1e6).toFixed(b > 1e8 ? 0 : 1).replace('.', ',') + ' MB';

function toast(msg, ms = 2600) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function fillLangSelect(sel, value) {
  // Deutsch und Englisch oben, Rest alphabetisch
  const top = ['de', 'en'];
  const rest = Object.keys(LANGS).filter(k => !top.includes(k)).sort((a, b) => LANGS[a].name.localeCompare(LANGS[b].name, 'de'));
  sel.innerHTML = [...top, ...rest].map(k => `<option value="${k}">${LANGS[k].flag} ${LANGS[k].name}</option>`).join('');
  sel.value = value;
}
function setDir(el, lang) { el.dir = LANGS[lang]?.rtl ? 'rtl' : 'ltr'; }

// Fortschritt beim ersten Laden eines Modells anzeigen
function progressUI(bar, status, label) {
  return p => {
    if (!p.total) return;
    bar.classList.remove('hidden');
    bar.firstElementChild.style.width = Math.round(p.loaded / p.total * 100) + '%';
    if (status) status.textContent = `${label} wird geladen (einmalig): ${mb(p.loaded)} von ${mb(p.total)}`;
  };
}

// iOS gibt Ton erst nach einer Berührung frei – beim ersten Tippen einmal stumm abspielen.
document.addEventListener('touchend', function unlock() {
  try { const a = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='); a.play().catch(() => {}); } catch {}
  document.removeEventListener('touchend', unlock);
}, { once: true });

/* ---------- Navigation ---------- */
const TITLES = { uebersetzen: 'Übersetzen', gespraech: 'Gespräch', foto: 'Foto', lernen: 'Lernen', mehr: 'Mehr' };
function show(v) {
  $$('section.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('#title').textContent = TITLES[v];
  stopSpeak();
  if (v === 'lernen') renderLernen();
  if (v === 'mehr') goMehr('start');
  window.history.replaceState(null, '', '#' + v);
}
$$('#tabs button').forEach(b => b.onclick = () => show(b.dataset.v));

function updateNet() {
  const off = !navigator.onLine;
  $('#netz').textContent = off ? 'offline' : 'online';
  $('#netz').classList.toggle('off', off);
}
addEventListener('online', updateNet); addEventListener('offline', updateNet); updateNet();

/* ---------- Übersetzen ---------- */
const S = settings.get();
fillLangSelect($('#von'), S.von); fillLangSelect($('#nach'), S.nach);
let lastResult = null, timer = null, runId = 0;

function curPair() { return { von: $('#von').value, nach: $('#nach').value }; }

async function doTranslate({ save = true, autoSpeak = false } = {}) {
  const text = $('#eingabe').value.trim();
  const { von, nach } = curPair();
  const out = $('#ausgabe'), st = $('#status'), bar = $('#prog');
  setDir($('#eingabe'), von); setDir(out, nach);
  if (!text) { out.textContent = 'Übersetzung erscheint hier.'; out.classList.add('muted'); st.textContent = ''; lastResult = null; updateStar(); return; }
  const my = ++runId;
  st.textContent = 'Übersetze …';
  try {
    const r = await translate(text, von, nach, {
      onProgress: progressUI(bar, st, 'Sprachpaket'),
      onPartial: p => { if (p.total > 1) st.textContent = `Übersetze … ${p.done}/${p.total}`; },
      onNote: n => toast(n),
    });
    if (my !== runId) return;
    bar.classList.add('hidden');
    out.textContent = r; out.classList.remove('muted');
    const info = routeInfo(von, nach);
    st.textContent = settings.get().llmAn ? '' : (info === 'über Englisch' ? 'Übersetzt über Englisch als Zwischenschritt.' : '');
    lastResult = { text, ergebnis: r, von, nach };
    if (save) { history.add(lastResult); renderZuletzt(); }
    updateStar();
    if (autoSpeak) speak(r, nach).catch(e => toast(e.message));
  } catch (e) {
    if (my !== runId) return;
    bar.classList.add('hidden');
    st.textContent = '';
    out.classList.add('muted');
    out.textContent = /fetch|network|Failed|load/i.test(e.message) && !navigator.onLine
      ? 'Dieses Sprachpaket ist noch nicht auf dem Gerät. Einmal mit Internet übersetzen oder unter Mehr › Sprachpakete laden.'
      : 'Fehler: ' + e.message;
  }
}

$('#eingabe').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => doTranslate(), 700); });
$('#von').onchange = $('#nach').onchange = () => { settings.set(curPair()); doTranslate({ save: false }); };
$('#tausch').onclick = () => {
  const { von, nach } = curPair();
  $('#von').value = nach; $('#nach').value = von;
  if (lastResult) $('#eingabe').value = lastResult.ergebnis;
  settings.set(curPair()); doTranslate({ save: false });
};
$('#leeren').onclick = () => { $('#eingabe').value = ''; doTranslate(); $('#eingabe').focus(); };
$('#einfuegen').onclick = async () => {
  try { $('#eingabe').value = await navigator.clipboard.readText(); doTranslate(); } catch { toast('Einfügen nicht erlaubt – lange ins Feld tippen und „Einsetzen“ wählen.'); }
};
$('#vorlesen').onclick = () => lastResult && speak(lastResult.ergebnis, lastResult.nach).catch(e => toast(e.message));
$('#langsam').onclick = () => lastResult && speak(lastResult.ergebnis, lastResult.nach, { slow: true }).catch(e => toast(e.message));
$('#vorlesenSrc').onclick = () => { const t = $('#eingabe').value.trim(); t && speak(t, $('#von').value).catch(e => toast(e.message)); };
$('#kopieren').onclick = async () => { if (!lastResult) return; try { await navigator.clipboard.writeText(lastResult.ergebnis); toast('Kopiert'); } catch { toast('Kopieren nicht möglich'); } };
$('#teilen').onclick = async () => {
  if (!lastResult) return;
  const text = `${lastResult.text}\n\n${LANGS[lastResult.nach].flag} ${lastResult.ergebnis}`;
  if (navigator.share) navigator.share({ text }).catch(() => {}); else { navigator.clipboard.writeText(text); toast('Kopiert'); }
};
function updateStar() {
  const h = history.all();
  const on = lastResult && h.some(x => x.text === lastResult.text && x.nach === lastResult.nach && x.stern);
  $('#merken').classList.toggle('on', !!on);
}
$('#merken').onclick = () => {
  if (!lastResult) return;
  let h = history.all(); let i = h.findIndex(x => x.text === lastResult.text && x.nach === lastResult.nach);
  if (i < 0) { history.add(lastResult); h = history.all(); i = 0; }
  const n = history.toggleStar(i); updateStar(); renderZuletzt();
  toast(n[i].stern ? 'Gemerkt – auch als Vokabelkarte' : 'Nicht mehr gemerkt');
};

// Datei: Sprachnachricht → Text, Textdatei → Text
$('#datei').onchange = async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (f.type.startsWith('text') || f.name.endsWith('.txt')) { $('#eingabe').value = await f.text(); doTranslate(); return; }
  const st = $('#status');
  try {
    st.textContent = 'Lese Audiodatei …';
    const audio = await decodeFile(f);
    st.textContent = 'Erkenne Sprache …';
    const text = await transcribe(audio, $('#von').value, { onProgress: progressUI($('#prog'), st, 'Spracherkennung') });
    $('#prog').classList.add('hidden');
    $('#eingabe').value = text; doTranslate();
  } catch (err) { st.textContent = 'Audiodatei ging nicht: ' + err.message; }
};

// Mikrofon
function micButton(btn, { lang, statusEl, progEl, onText }) {
  let rec = null, busy = false;
  const finish = async () => {
    if (!rec) return;
    const r = rec; rec = null;
    btn.classList.remove('rec'); btn.style.removeProperty('--lvl');
    const { audio, heard, seconds } = await r.stop();
    if (!heard || seconds < 0.4) { statusEl.textContent = 'Nichts gehört – nochmal versuchen.'; return; }
    busy = true; btn.classList.add('busy');
    statusEl.textContent = 'Erkenne Sprache …';
    try {
      const text = await transcribe(audio, lang(), { onProgress: progressUI(progEl, statusEl, 'Spracherkennung') });
      progEl && progEl.classList.add('hidden');
      statusEl.textContent = '';
      if (!text) statusEl.textContent = 'Nichts verstanden – nochmal versuchen.';
      else await onText(text);
    } catch (e) { statusEl.textContent = 'Spracherkennung: ' + e.message; }
    busy = false; btn.classList.remove('busy');
  };
  btn.onclick = async () => {
    if (busy) return;
    if (rec) return finish();
    stopSpeak();
    try {
      rec = new Recorder({ autoStop: settings.get().autoStopp, onLevel: l => btn.style.setProperty('--lvl', l.toFixed(2)), onAutoStop: finish });
      await rec.start();
      btn.classList.add('rec');
      statusEl.textContent = `Sprich jetzt (${LANGS[lang()].name}) … tippen zum Beenden`;
    } catch (e) { rec = null; statusEl.textContent = 'Kein Zugriff aufs Mikrofon: ' + e.message; }
  };
}
micButton($('#mic'), {
  lang: () => $('#von').value, statusEl: $('#status'), progEl: $('#prog'),
  onText: async t => { $('#eingabe').value = t; await doTranslate({ autoSpeak: settings.get().autoVorlesen }); },
});

function renderZuletzt() {
  const h = history.all().slice(0, 6);
  $('#zuletzt').innerHTML = h.length ? h.map((x, i) => `
    <button class="item" data-i="${i}"><span class="t"><b>${esc(x.ergebnis)}</b><span>${LANGS[x.von].flag} ${esc(x.text)}</span></span>${x.stern ? '<span style="color:var(--orange)">★</span>' : ''}<span>${LANGS[x.nach].flag}</span></button>`).join('')
    : '<div class="item hint">Noch nichts übersetzt.</div>';
  $$('#zuletzt .item[data-i]').forEach(b => b.onclick = () => openEntry(history.all()[+b.dataset.i]));
}
function openEntry(x) {
  show('uebersetzen');
  $('#von').value = x.von; $('#nach').value = x.nach; $('#eingabe').value = x.text;
  $('#ausgabe').textContent = x.ergebnis; $('#ausgabe').classList.remove('muted');
  lastResult = { text: x.text, ergebnis: x.ergebnis, von: x.von, nach: x.nach }; updateStar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
renderZuletzt();

/* ---------- Gespräch ---------- */
fillLangSelect($('#gA'), S.von); fillLangSelect($('#gB'), S.nach);
const conv = [];
function renderConv() {
  for (const side of ['A', 'B']) {
    const box = $(`#seite${side} .bubbles`);
    box.innerHTML = conv.map(m => {
      const mine = m.side === side;
      return `<div class="bubble ${mine ? 'me' : 'other'}" ${LANGS[mine ? m.von : m.nach].rtl ? 'dir="rtl"' : ''}>${esc(mine ? m.text : m.ergebnis)}${mine ? `<small>${esc(m.ergebnis)}</small>` : ''}</div>`;
    }).join('');
    box.scrollTop = box.scrollHeight;
  }
}
for (const side of ['A', 'B']) {
  const other = side === 'A' ? 'B' : 'A';
  micButton($(`#seite${side} .mic`), {
    lang: () => $('#g' + side).value,
    statusEl: $(`#seite${side} .status`), progEl: null,
    onText: async text => {
      const von = $('#g' + side).value, nach = $('#g' + other).value;
      const st = $(`#seite${side} .status`);
      st.textContent = 'Übersetze …';
      try {
        const r = await translate(text, von, nach, { onProgress: p => p.total && (st.textContent = `Sprachpaket wird geladen: ${Math.round(p.loaded / p.total * 100)} %`) });
        st.textContent = '';
        conv.push({ side, text, ergebnis: r, von, nach }); renderConv();
        history.add({ text, ergebnis: r, von, nach });
        speak(r, nach).catch(() => {});
      } catch (e) { st.textContent = 'Fehler: ' + e.message; }
    },
  });
}
$$('#gModus button').forEach(b => b.onclick = () => {
  $$('#gModus button').forEach(x => x.classList.toggle('on', x === b));
  $('#seiteB').classList.toggle('flip', b.dataset.m === 'gegenueber');
});
$('#gLeeren').onclick = () => { conv.length = 0; renderConv(); };

/* ---------- Foto ---------- */
fillLangSelect($('#fVon'), S.nach); fillLangSelect($('#fNach'), S.von);
let foto = null; // { img, paras, translations }
$('#fTausch').onclick = () => { const a = $('#fVon').value; $('#fVon').value = $('#fNach').value; $('#fNach').value = a; if (foto) runFoto(foto.img); };
$('#fVon').onchange = () => foto && runFoto(foto.img);
$('#fNach').onchange = () => foto && translateFoto();
$$('#fModus button').forEach(b => b.onclick = () => { $$('#fModus button').forEach(x => x.classList.toggle('on', x === b)); settings.set({ bildModus: b.dataset.m }); drawFoto(); });
if (S.bildModus === 'original') $$('#fModus button').forEach(x => x.classList.toggle('on', x.dataset.m === 'original'));
for (const id of ['#fKamera', '#fBild']) $(id).onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const img = await loadImage(f); runFoto(img);
};

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image(); img.src = url; await img.decode();
  // auf handliche Größe bringen (schneller, weniger Speicher)
  const max = 2000, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c;
}

async function runFoto(img) {
  foto = { img, paras: [], tr: [] };
  $('#fBox').classList.remove('hidden'); $('#fText').classList.add('hidden');
  drawFoto();
  const st = $('#fStatus'), bar = $('#fProg');
  st.textContent = 'Erkenne Text …';
  try {
    const r = await recognize(img, $('#fVon').value, m => {
      if (m.status === 'recognizing text') { bar.classList.remove('hidden'); bar.firstElementChild.style.width = Math.round(m.progress * 100) + '%'; st.textContent = 'Erkenne Text … ' + Math.round(m.progress * 100) + ' %'; }
      else if (/loading/.test(m.status)) st.textContent = 'Lade Texterkennung (einmalig) …';
    });
    bar.classList.add('hidden');
    foto.paras = r.paras;
    if (!r.paras.length) { st.textContent = 'Kein Text gefunden. Stimmt die Ausgangssprache?'; return; }
    await translateFoto();
  } catch (e) { bar.classList.add('hidden'); st.textContent = 'Texterkennung: ' + e.message; }
}

async function translateFoto() {
  if (!foto || !foto.paras.length) return;
  const st = $('#fStatus'), von = $('#fVon').value, nach = $('#fNach').value;
  st.textContent = 'Übersetze …';
  try {
    const joined = foto.paras.map(p => p.text).join('\n');
    const r = await translate(joined, von, nach, { onProgress: progressUI($('#fProg'), st, 'Sprachpaket') });
    $('#fProg').classList.add('hidden');
    const lines = r.split('\n');
    foto.tr = foto.paras.map((p, i) => lines[i] ?? '');
    st.textContent = `${foto.paras.length} Textstellen erkannt und übersetzt.`;
    history.add({ text: joined.slice(0, 500), ergebnis: r.slice(0, 500), von, nach });
  } catch (e) { st.textContent = 'Übersetzung: ' + e.message; foto.tr = []; }
  drawFoto();
  $('#fText').classList.remove('hidden');
  $('#fParas').innerHTML = foto.paras.map((p, i) => `<div class="para" data-i="${i}"><div class="o" ${LANGS[von].rtl ? 'dir="rtl"' : ''}>${esc(p.text)}</div><div class="r" ${LANGS[nach].rtl ? 'dir="rtl"' : ''}>${esc(foto.tr[i] || '')}</div></div>`).join('');
  $$('#fParas .para').forEach(d => d.onclick = () => speak(foto.tr[+d.dataset.i], nach).catch(e => toast(e.message)));
}

function drawFoto() {
  if (!foto) return;
  const c = $('#fCanvas'), img = foto.img; c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const overlay = settings.get().bildModus !== 'original';
  if (!overlay || !foto.tr.length) return;
  foto.paras.forEach((p, i) => {
    const t = foto.tr[i]; if (!t) return;
    const { x0, y0, x1, y1 } = p.bbox, w = x1 - x0, h = y1 - y0;
    // Hintergrundfarbe aus dem Rand schätzen
    const px = g.getImageData(Math.max(0, x0 - 2), Math.max(0, y0 - 2), 1, 1).data;
    const light = (px[0] * 299 + px[1] * 587 + px[2] * 114) / 1000 > 128;
    g.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`;
    g.fillRect(x0 - 3, y0 - 3, w + 6, h + 6);
    g.fillStyle = light ? '#111' : '#fff';
    // Schrift so groß wie möglich, die noch in den Rahmen passt
    let size = Math.max(10, Math.min(h / Math.max(1, p.lines) * 0.85, 80));
    let lines;
    for (; size >= 9; size -= 1) {
      g.font = `600 ${size}px -apple-system, Helvetica, Arial, sans-serif`;
      lines = wrap(g, t, w);
      if (lines.length * size * 1.15 <= h + size * 0.3) break;
    }
    g.textBaseline = 'top';
    lines.forEach((l, k) => g.fillText(l, x0, y0 + k * size * 1.15, w));
  });
}
function wrap(g, text, w) {
  const out = []; let cur = '';
  for (const word of text.split(/\s+/)) {
    const t = cur ? cur + ' ' + word : word;
    if (g.measureText(t).width > w && cur) { out.push(cur); cur = word; } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}
$('#fAlles').onclick = () => foto && speak(foto.tr.join('\n'), $('#fNach').value).catch(e => toast(e.message));
$('#fKopie').onclick = () => { if (!foto) return; navigator.clipboard.writeText(foto.paras.map((p, i) => p.text + '\n→ ' + (foto.tr[i] || '')).join('\n\n')); toast('Kopiert'); };
$('#fUebernehmen').onclick = () => {
  if (!foto) return;
  show('uebersetzen'); $('#von').value = $('#fVon').value; $('#nach').value = $('#fNach').value;
  $('#eingabe').value = foto.paras.map(p => p.text).join('\n'); doTranslate();
};

/* ---------- Lernen ---------- */
let lTab = 'satzbuch';
$$('#lSeg button').forEach(b => b.onclick = () => { lTab = b.dataset.l; $$('#lSeg button').forEach(x => x.classList.toggle('on', x === b)); renderLernen(); });
fillLangSelect($('#sbNach'), S.nach === 'de' ? 'en' : S.nach);
$('#sbNach').onchange = () => renderSatzbuch();
fillLangSelect($('#apSprache'), S.nach === 'de' ? 'en' : S.nach);

function renderLernen() {
  for (const t of ['satzbuch', 'vokabeln', 'aussprache']) $('#l-' + t).classList.toggle('hidden', t !== lTab);
  if (lTab === 'satzbuch') renderSatzbuch();
  if (lTab === 'vokabeln') renderVokabeln();
  if (lTab === 'aussprache' && !$('#apText').value) neuerSatz();
}

function renderSatzbuch() {
  const nach = $('#sbNach').value;
  const open = new Set($$('#sbListe details[open]').map(d => d.dataset.k));
  $('#sbListe').innerHTML = Object.entries(PHRASES).map(([k, list]) => `
    <details class="cat" data-k="${esc(k)}" ${open.has(k) ? 'open' : ''}><summary><span>${esc(k)}</span><span class="hint small">${list.length} Sätze ›</span></summary>
      ${list.map(p => { const r = phraseCache.get(nach, p); return `<div class="phrase" data-p="${esc(p)}"><div>${esc(p)}</div><div class="r" ${LANGS[nach].rtl ? 'dir="rtl"' : ''}>${r ? esc(r) : ''}</div></div>`; }).join('')}
      <div class="phrase"><button class="btn sec small" data-alle="${esc(k)}">Alle übersetzen (für offline)</button></div>
    </details>`).join('');
  $$('#sbListe .phrase[data-p]').forEach(d => d.onclick = async () => {
    const p = d.dataset.p; const rEl = d.querySelector('.r');
    let r = phraseCache.get(nach, p);
    if (!r) { rEl.textContent = '…'; try { r = await translate(p, 'de', nach); phraseCache.set(nach, p, r); rEl.textContent = r; } catch (e) { rEl.textContent = e.message; return; } }
    speak(r, nach).catch(e => toast(e.message));
  });
  $$('#sbListe [data-alle]').forEach(b => b.onclick = async ev => {
    ev.stopPropagation(); b.disabled = true;
    const list = PHRASES[b.dataset.alle];
    try {
      const rs = (await translate(list.join('\n'), 'de', nach)).split('\n');
      list.forEach((p, i) => rs[i] && phraseCache.set(nach, p, rs[i].trim()));
      renderSatzbuch(); toast('Fertig – jetzt auch offline da');
    } catch (e) { toast(e.message); b.disabled = false; }
  });
}

let vkCur = null, vkShow = false;
function renderVokabeln() {
  const all = vocab.all(), due = vocab.due();
  vkCur = due[0] || null; vkShow = false;
  const box = $('#vkKarte');
  if (!all.length) box.innerHTML = '<div class="flash">Noch keine Karten<small>Merke Übersetzungen mit ★, dann landen sie hier.</small></div>';
  else if (!vkCur) box.innerHTML = `<div class="flash">Alles gelernt für heute ✓<small>${all.length} Karten · nächste Abfrage kommt automatisch</small></div>`;
  else drawCard();
  $('#vkListe').innerHTML = all.map((c, i) => `<div class="item"><span class="t"><b>${esc(c.ergebnis)}</b><span>${esc(c.text)}</span></span><span class="chip">Fach ${c.fach}</span><button class="icon" data-del="${i}" title="Löschen">✕</button></div>`).join('') || '<div class="item hint">–</div>';
  $$('#vkListe [data-del]').forEach(b => b.onclick = () => { vocab.remove(+b.dataset.del); renderVokabeln(); });
}
function drawCard() {
  const c = vkCur, due = vocab.due().length;
  $('#vkKarte').innerHTML = `
    <h3>Noch ${due} fällig · Fach ${c.fach}</h3>
    <div class="flash" id="vkFlip" ${LANGS[vkShow ? c.nach : c.von].rtl ? 'dir="rtl"' : ''}>${esc(vkShow ? c.ergebnis : c.text)}<small>${vkShow ? LANGS[c.nach].name + ' – antippen zum Anhören' : 'Wie heißt das auf ' + LANGS[c.nach].name + '? Antippen zum Umdrehen'}</small></div>
    <div class="tools" style="justify-content:center">${vkShow ? '<button class="btn red" id="vkNein">Nicht gewusst</button><button class="btn" id="vkJa" style="background:var(--green)">Gewusst</button>' : '<button class="btn sec" id="vkZeig">Umdrehen</button>'}</div>`;
  const flip = () => { if (!vkShow) { vkShow = true; drawCard(); } speak(c.ergebnis, c.nach).catch(() => {}); };
  $('#vkFlip').onclick = flip; $('#vkZeig') && ($('#vkZeig').onclick = flip);
  $('#vkJa') && ($('#vkJa').onclick = () => { vocab.answer(c.i, true); renderVokabeln(); });
  $('#vkNein') && ($('#vkNein').onclick = () => { vocab.answer(c.i, false); renderVokabeln(); });
}

// Aussprache-Training
let apDe = '';
async function neuerSatz() {
  const lang = $('#apSprache').value;
  // Erst gemerkte Sätze in dieser Sprache, sonst ein Satz aus dem Satzbuch
  const fav = history.all().filter(x => x.stern && x.nach === lang && x.ergebnis.length < 120);
  const pool = Object.values(PHRASES).flat().filter(p => p.length > 6 && !p.includes('…'));
  if (fav.length && Math.random() < 0.6) { const f = fav[Math.floor(Math.random() * fav.length)]; apDe = f.text; $('#apText').value = f.ergebnis; }
  else {
    apDe = pool[Math.floor(Math.random() * pool.length)];
    $('#apText').value = phraseCache.get(lang, apDe) || '…';
    if (!phraseCache.get(lang, apDe)) {
      try { const r = await translate(apDe, 'de', lang); phraseCache.set(lang, apDe, r); $('#apText').value = r; }
      catch (e) { $('#apText').value = ''; $('#apStatus').textContent = e.message; }
    }
  }
  setDir($('#apText'), lang);
  $('#apDe').textContent = apDe ? 'Bedeutung: ' + apDe : '';
  $('#apErgebnis').classList.add('hidden');
}
$('#apNeu').onclick = neuerSatz;
$('#apText').addEventListener('input', () => { apDe = ''; $('#apDe').textContent = ''; });
$('#apSprache').onchange = neuerSatz;
$('#apHoer').onclick = () => speak($('#apText').value, $('#apSprache').value).catch(e => toast(e.message));
$('#apLangsam').onclick = () => speak($('#apText').value, $('#apSprache').value, { slow: true }).catch(e => toast(e.message));
micButton($('#apMic'), {
  lang: () => $('#apSprache').value, statusEl: $('#apStatus'), progEl: null,
  onText: async said => {
    const target = $('#apText').value;
    const { score, html } = compare(target, said);
    const box = $('#apErgebnis'); box.classList.remove('hidden');
    const note = score >= 90 ? 'Sehr gut! 🎉' : score >= 70 ? 'Gut – fast perfekt.' : score >= 45 ? 'Geht so – hör nochmal langsam rein.' : 'Nochmal versuchen – erst langsam anhören.';
    box.innerHTML = `<div class="score" style="color:${score >= 70 ? 'var(--green)' : score >= 45 ? 'var(--orange)' : 'var(--red)'}">${score} %</div>
      <p style="text-align:center;margin:4px 0 12px">${note}</p>
      <h3>Zielsatz (grün = getroffen, rot = fehlte/anders)</h3><p style="font-size:20px" ${LANGS[$('#apSprache').value].rtl ? 'dir="rtl"' : ''}>${html}</p>
      <h3>Verstanden wurde</h3><p class="hint">${esc(said)}</p>`;
    $('#apStatus').textContent = '';
  },
});

// Wortweiser Vergleich: wie viele Wörter des Zielsatzes wurden erkannt (mit Toleranz für kleine Abweichungen)
function norm(s) { return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean); }
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function compare(target, said) {
  const words = target.split(/\s+/).filter(Boolean);
  const S2 = norm(said);
  // Sprachen ohne Leerzeichen (Chinesisch/Japanisch/Thai): zeichenweise vergleichen
  if (words.length <= 2 && target.length > 8) {
    const a = norm(target).join(''), b = S2.join('');
    const score = Math.max(0, Math.round((1 - lev(a, b) / Math.max(a.length, 1)) * 100));
    return { score, html: esc(target) };
  }
  let hit = 0;
  const html = words.map(w => {
    const n = norm(w)[0] || '';
    const ok = !n || S2.some(s => s === n || (n.length > 3 && lev(s, n) <= Math.floor(n.length / 4)));
    if (ok) hit++;
    return `<span class="${ok ? 'w-ok' : 'w-no'}">${esc(w)}</span>`;
  }).join(' ');
  return { score: Math.round(hit / Math.max(words.length, 1) * 100), html };
}

/* ---------- Mehr ---------- */
function goMehr(p) {
  for (const id of ['start', 'verlauf', 'pakete', 'einstellungen', 'hilfe']) $('#m-' + id).classList.toggle('hidden', id !== p);
  if (p === 'verlauf') renderVerlauf();
  if (p === 'pakete') renderPakete();
  if (p === 'einstellungen') renderEinst();
  if (p === 'hilfe') renderHilfe();
  window.scrollTo(0, 0);
}
document.addEventListener('click', e => { const g = e.target.closest('[data-go]'); if (g) goMehr(g.dataset.go); });
$('#version').textContent = 'Dolmetscher ' + VERSION;

let vlFilter = 'alle';
$$('#vlSeg button').forEach(b => b.onclick = () => { vlFilter = b.dataset.f; $$('#vlSeg button').forEach(x => x.classList.toggle('on', x === b)); renderVerlauf(); });
function renderVerlauf() {
  const h = history.all();
  const rows = h.map((x, i) => ({ x, i })).filter(r => vlFilter === 'alle' || r.x.stern);
  $('#vlListe').innerHTML = rows.length ? rows.map(({ x, i }) => `
    <div class="item"><button class="t" data-open="${i}" style="text-align:left"><b>${esc(x.ergebnis)}</b><span>${LANGS[x.von].flag}→${LANGS[x.nach].flag} ${esc(x.text)} · ${new Date(x.zeit).toLocaleDateString('de-DE')}</span></button>
    <button class="icon star ${x.stern ? 'on' : ''}" data-star="${i}">★</button><button class="icon" data-del="${i}">✕</button></div>`).join('')
    : '<div class="item hint">Leer.</div>';
  $$('#vlListe [data-open]').forEach(b => b.onclick = () => openEntry(history.all()[+b.dataset.open]));
  $$('#vlListe [data-star]').forEach(b => b.onclick = () => { history.toggleStar(+b.dataset.star); renderVerlauf(); renderZuletzt(); });
  $$('#vlListe [data-del]').forEach(b => b.onclick = () => { history.remove(+b.dataset.del); renderVerlauf(); renderZuletzt(); });
}
$('#vlLeeren').onclick = () => { if (confirm('Verlauf leeren? Gemerkte bleiben.')) { history.clear(); renderVerlauf(); renderZuletzt(); } };

// Sprachpakete
async function cachedModels() {
  try { const c = await caches.open('transformers-cache'); return (await c.keys()).map(r => r.url); } catch { return []; }
}
const hasModel = (urls, id) => urls.some(u => u.includes('/' + id + '/') && /decoder_model_merged/.test(u));

async function renderPakete() {
  try {
    const e = await navigator.storage.estimate();
    const p = await navigator.storage.persisted?.();
    $('#pkSpeicher').innerHTML = `Belegt: <b>${mb(e.usage || 0)}</b> · frei für die App: ca. ${mb((e.quota || 0) - (e.usage || 0))}<br>${p ? '✓ Speicher ist dauerhaft gesichert.' : '⚠︎ Noch nicht dauerhaft gesichert – Safari kann ungenutzte Daten löschen. Tipp: App zum Home-Bildschirm hinzufügen.'}`;
  } catch { $('#pkSpeicher').textContent = '–'; }
  const urls = await cachedModels();
  const wm = WHISPER_MODELS[settings.get().whisper];
  const libMiss = (await libStatus()).length;
  const wOk = hasModel(urls, wm.id) && !libMiss;
  $('#pkWhisperInfo').textContent = `App-Bausteine (60 MB) + ${wm.name} (${wm.mb} MB) · ${wOk ? 'geladen ✓' : 'noch nicht vollständig'}`;
  $('#pkWhisper').textContent = wOk ? 'Geladen ✓' : 'Laden'; $('#pkWhisper').disabled = wOk;
  const voices = await piperStored();
  const rows = [];
  const order = Object.keys(LANGS).filter(k => k !== 'de').sort((a, b) => a === 'en' ? -1 : b === 'en' ? 1 : LANGS[a].name.localeCompare(LANGS[b].name, 'de'));
  for (const k of order) {
    const l = LANGS[k];
    const ms = modelsFor(k);
    const trOk = ms.length && ms.every(m => hasModel(urls, m));
    const trPart = ms.filter(m => hasModel(urls, m)).length;
    const ocrOk = await ocrHas(k);
    const vOk = !l.piper || voices.includes(l.piper);
    const dir = route('de', k) ? '' : ' (nur nach Deutsch)';
    rows.push(`<div class="item" data-k="${k}"><span style="font-size:26px">${l.flag}</span><span class="t"><b>${l.name}${dir}</b>
      <span class="chips"><span class="chip ${trOk ? 'ok' : ''}">Übersetzung ${trOk ? '✓' : trPart ? trPart + '/' + ms.length : ''}</span><span class="chip ${ocrOk ? 'ok' : ''}">Foto-Text ${ocrOk ? '✓' : ''}</span><span class="chip ${l.piper ? (vOk ? 'ok' : '') : 'no'}">${l.piper ? 'Stimme' + (vOk ? ' ✓' : '') : 'Gerätestimme'}</span></span>
      <div class="progress hidden"><i></i></div><span class="pst"></span></span>
      ${trOk && ocrOk && vOk ? `<button class="btn red small" data-rm="${k}">Löschen</button>` : `<button class="btn small" data-dl="${k}">Laden</button>`}</div>`);
  }
  // Deutsch selbst (Foto-Text + Stimme)
  const deOcr = await ocrHas('de'), deV = voices.includes(LANGS.de.piper);
  rows.unshift(`<div class="item" data-k="de"><span style="font-size:26px">🇩🇪</span><span class="t"><b>Deutsch</b><span class="chips"><span class="chip ${deOcr ? 'ok' : ''}">Foto-Text ${deOcr ? '✓' : ''}</span><span class="chip ${deV ? 'ok' : ''}">Stimme ${deV ? '✓' : ''}</span></span><div class="progress hidden"><i></i></div><span class="pst"></span></span>
    ${deOcr && deV ? '' : '<button class="btn small" data-dl="de">Laden</button>'}</div>`);
  $('#pkListe').innerHTML = rows.join('');
  $$('#pkListe [data-dl]').forEach(b => b.onclick = () => ladePaket(b.dataset.dl, b));
  $$('#pkListe [data-rm]').forEach(b => b.onclick = () => loeschePaket(b.dataset.rm));
}

async function ladePaket(k, btn) {
  if (!navigator.onLine) return toast('Zum Laden braucht es einmal Internet.');
  const row = btn.closest('.item'), bar = row.querySelector('.progress'), st = row.querySelector('.pst');
  btn.disabled = true; st.className = 'hint small';
  try {
    navigator.storage.persist?.();
    await libCache();
    if (k !== 'de') for (const m of modelsFor(k)) {
      st.textContent = 'Übersetzung …';
      await loadModel('translation', m, { onProgress: progressUI(bar, st, 'Übersetzung') });
    }
    st.textContent = 'Foto-Text …';
    await ocrDownload(k, m => { if (m.progress != null && /loading/.test(m.status)) { bar.classList.remove('hidden'); bar.firstElementChild.style.width = Math.round(m.progress * 100) + '%'; } });
    if (LANGS[k].piper) { st.textContent = 'Stimme …'; await piperDownload(LANGS[k].piper, progressUI(bar, st, 'Stimme')); }
    toast(LANGS[k].name + ' ist jetzt offline da ✓');
  } catch (e) { toast('Laden fehlgeschlagen: ' + e.message); }
  renderPakete();
}

async function loeschePaket(k) {
  if (!confirm(LANGS[k].name + ' vom Gerät löschen?')) return;
  const c = await caches.open('transformers-cache');
  // Nur Modelle löschen, die keine andere geladene Sprache noch braucht
  const keep = new Set();
  const urls = await cachedModels();
  for (const o of Object.keys(LANGS)) if (o !== k && o !== 'de' && modelsFor(o).every(m => hasModel(urls, m))) modelsFor(o).forEach(m => keep.add(m));
  for (const r of await c.keys()) for (const m of modelsFor(k)) if (!keep.has(m) && r.url.includes('/' + m + '/')) await c.delete(r);
  await ocrRemove(k);
  if (LANGS[k].piper) await piperRemove(LANGS[k].piper);
  renderPakete();
}

$('#pkWhisper').onclick = async () => {
  if (!navigator.onLine) return toast('Zum Laden braucht es einmal Internet.');
  $('#pkWhisper').disabled = true;
  try { $('#pkWhisperInfo').textContent = 'App-Bausteine …'; await libCache(); await loadModel('automatic-speech-recognition', WHISPER_MODELS[settings.get().whisper].id, { onProgress: progressUI($('#pkWProg'), $('#pkWhisperInfo'), 'Spracherkennung') }); toast('Spracherkennung ist offline da ✓'); }
  catch (e) { toast('Fehler: ' + e.message); }
  $('#pkWProg').classList.add('hidden'); renderPakete();
};
$('#pkPersist').onclick = async () => {
  const ok = await navigator.storage?.persist?.();
  toast(ok ? 'Speicher ist jetzt dauerhaft gesichert ✓' : 'Safari erlaubt das nur, wenn die App auf dem Home-Bildschirm liegt.');
  renderPakete();
};

// Einstellungen
function renderEinst() {
  const s = settings.get();
  $('#stWhisper').innerHTML = Object.entries(WHISPER_MODELS).map(([k, m]) => `<option value="${k}">${m.name} · ${m.mb} MB</option>`).join('');
  $('#stStimme').value = s.stimme; $('#stTempo').value = String(s.tempo); $('#stAuto').checked = s.autoVorlesen;
  $('#stWhisper').value = s.whisper; $('#stStopp').checked = s.autoStopp; $('#stRechen').value = s.rechenweg;
  $('#stLlm').checked = s.llmAn; $('#stLlmUrl').value = s.llmUrl; $('#stLlmModell').value = s.llmModell;
}
$('#stStimme').onchange = e => settings.set({ stimme: e.target.value });
$('#stTempo').onchange = e => settings.set({ tempo: +e.target.value });
$('#stAuto').onchange = e => settings.set({ autoVorlesen: e.target.checked });
$('#stWhisper').onchange = e => settings.set({ whisper: e.target.value });
$('#stStopp').onchange = e => settings.set({ autoStopp: e.target.checked });
$('#stRechen').onchange = e => settings.set({ rechenweg: e.target.value });
$('#stLlm').onchange = e => settings.set({ llmAn: e.target.checked });
$('#stLlmUrl').onchange = e => settings.set({ llmUrl: e.target.value.trim() });
$('#stLlmModell').onchange = e => settings.set({ llmModell: e.target.value.trim() });
$('#stLlmTest').onclick = async () => {
  const info = $('#stLlmInfo'); info.textContent = 'Prüfe …';
  try { const ms = await llmTest(); info.textContent = '✓ Verbunden. Modelle: ' + (ms.join(', ') || '–'); }
  catch (e) { info.textContent = '✗ Nicht erreichbar. LM Studio starten, Server einschalten und „CORS“ aktivieren. Am iPad klappt das nur über das Mac-Netzwerk, siehe Hilfe.'; }
};

function renderHilfe() {
  $('#hilfeText').innerHTML = `
  <h3>So kommt alles aufs Gerät</h3>
  <p>1. In Safari öffnen → Teilen → <b>Zum Home-Bildschirm</b>. Dann läuft die App wie eine normale App und Safari löscht die Sprachdaten nicht.</p>
  <p>2. <b>Mehr › Sprachpakete</b>: Spracherkennung und die gewünschten Sprachen einmal mit WLAN laden. Danach geht alles ohne Internet.</p>
  <h3>Was die App kann</h3>
  <p>• <b>Übersetzen</b>: tippen, einfügen, reinsprechen oder Sprachnachricht/Textdatei laden. Vorlesen normal und langsam, kopieren, teilen, merken.<br>
  • <b>Gespräch</b>: zwei Seiten, jeder spricht seine Sprache, die App übersetzt und liest vor. „Gegenüber“ dreht die obere Hälfte für dein Gegenüber.<br>
  • <b>Foto</b>: Schild, Speisekarte, Brief fotografieren → Text wird erkannt und direkt im Bild übersetzt.<br>
  • <b>Lernen</b>: Satzbuch mit fertigen Sätzen (auch Baustelle), Vokabelkarten aus Gemerktem, Aussprache-Training mit Bewertung.</p>
  <h3>Woher kommt die Technik</h3>
  <p>Spracherkennung: Whisper (OpenAI) · Übersetzung: Opus-MT (Universität Helsinki) · Stimmen: Piper · Foto-Text: Tesseract. Alles läuft auf deinem Gerät, nichts geht an einen Server.</p>
  <h3>Grenzen</h3>
  <p>• Die Offline-Übersetzung ist gut für Alltag und Reise, aber schwächer als Google/DeepL bei langen oder schwierigen Texten. Für mehr Qualität: Lokales Modell am Mac.<br>
  • Manche Sprachen gehen über Englisch als Zwischenschritt (etwas ungenauer).<br>
  • Koreanisch geht offline nur <i>nach</i> Deutsch.<br>
  • Dialekt, Lärm und Nuscheln verschlechtern die Spracherkennung. Dann „Genau (small)“ in den Einstellungen wählen.</p>
  <h3>Lokales Modell (Mac)</h3>
  <p>LM Studio öffnen → Modell <b>TranslateGemma 4B</b> oder <b>12B</b> laden → Reiter „Developer“ → Server starten und <b>„Enable CORS“</b> einschalten. Dann hier in den Einstellungen „Lokales Modell“ an. Am Mac im Browser klappt das direkt (localhost). Ist LM Studio aus, nimmt die App automatisch wieder das Offline-Modell.</p>`;
}

/* ---------- Start ---------- */
const start = (location.hash || '').slice(1);
if (TITLES[start]) show(start);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
