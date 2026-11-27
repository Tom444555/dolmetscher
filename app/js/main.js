// Dolmetscher – Oberfläche
import { LANGS, WHISPER_MODELS, modelsFor, route, NLLB } from './langs.js';
import { settings, history, vocab, phraseCache, glossary, backup, restore } from './store.js';
import { pdfText } from './pdf.js';
import { translate, transcribe, loadModel, routeInfo, freeModels, whichLang } from './engine.js';
import { speak, stop as stopSpeak, piperDownload, piperStored, piperRemove, unlockAudio } from './tts.js';
import { recognize, downloadLang as ocrDownload, hasLang as ocrHas, removeLang as ocrRemove } from './ocr.js';
import { Recorder, LiveRecorder, decodeFile } from './rec.js';
import { PHRASES } from './phrases.js';
import { KAPITEL, TEST, STAND } from './deutsch.js';
import { llmTest } from './llm.js';
import { libStatus, libCache } from './offline.js';

export const VERSION = 'v1.3 · 27.11.2026';
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
  sel.innerHTML = [...top, ...rest].map(k => `<option value="${k}">${LANGS[k].flag} ${LANGS[k].name}${k !== 'de' && offlineSet.has(k) ? ' ✓' : ''}</option>`).join('');
  sel.value = value;
}
// Offline-Haken: Sprachen, deren Übersetzung (mit Deutsch) schon auf dem Gerät liegt
let offlineSet = new Set(['de']);
async function refreshOffline() {
  try {
    const urls = (await (await caches.open('transformers-cache')).keys()).map(r => r.url);
    const has = id => urls.some(u => u.includes('/' + id + '/') && /decoder_model_merged/.test(u));
    const nllb = settings.get().nllb && has(NLLB.id);
    offlineSet = new Set(Object.keys(LANGS).filter(k => k === 'de' || nllb || (modelsFor(k).length && modelsFor(k).every(has))));
  } catch { return; }
  for (const sel of $$('select.langsel')) { const v = sel.value; if (sel.options.length > 20) fillLangSelect(sel, v); }
}
function setDir(el, lang) { el.dir = LANGS[lang]?.rtl ? 'rtl' : 'ltr'; }

// Fortschritt beim ersten Laden eines Modells anzeigen
function progressUI(bar, status, label) {
  return p => {
    if (!p.total) return;
    if (!bar) { if (status) status.textContent = `${label} wird geladen (einmalig): ${Math.round(p.loaded / p.total * 100)} %`; return; }
    bar.classList.remove('hidden');
    bar.firstElementChild.style.width = Math.round(p.loaded / p.total * 100) + '%';
    if (status) status.textContent = `${label} wird geladen (einmalig): ${mb(p.loaded)} von ${mb(p.total)}`;
  };
}

// iOS gibt Ton erst nach einer Berührung frei – beim ersten Tippen den Abspieler freischalten.
for (const ev of ['touchend', 'click']) document.addEventListener(ev, () => unlockAudio(), { passive: true });

/* ---------- Navigation ---------- */
const TITLES = { uebersetzen: 'Übersetzen', gespraech: 'Gespräch', foto: 'Foto', lernen: 'Lernen', mehr: 'Mehr' };
function show(v) {
  $$('section.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('#title').textContent = TITLES[v];
  stopSpeak();
  if (v !== 'gespraech' && typeof stopUntertitel === 'function') stopUntertitel();
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
  $('#rueck').classList.add('hidden');
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
    showRueck(r, nach, von, my);
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

async function showRueck(r, nach, von, my) {
  const box = $('#rueck');
  if (!settings.get().rueck || settings.get().llmAn) { box.classList.add('hidden'); return; }
  try {
    const back = await translate(r, nach, von);
    if (my !== runId) return;
    box.innerHTML = `<b>Zur Kontrolle zurück:</b> ${esc(back)}`; setDir(box, von); box.classList.remove('hidden');
  } catch { box.classList.add('hidden'); }
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
// Groß zeigen: Übersetzung bildschirmfüllend für dein Gegenüber
function zeigen(text, lang) {
  const box = $('#zeigenBox'), t = $('#zText');
  t.textContent = text; setDir(t, lang);
  const n = text.length;
  t.style.fontSize = (n < 25 ? 64 : n < 60 ? 48 : n < 140 ? 34 : 26) * settings.get().schrift + 'px';
  box.dataset.lang = lang; box.classList.remove('hidden', 'flip');
}
$('#zeigen').onclick = () => lastResult && zeigen(lastResult.ergebnis, lastResult.nach);
$('#zZu').onclick = () => $('#zeigenBox').classList.add('hidden');
$('#zDrehen').onclick = () => $('#zeigenBox').classList.toggle('flip');
$('#zHoer').onclick = () => speak($('#zText').textContent, $('#zeigenBox').dataset.lang).catch(e => toast(e.message));

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
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
    try {
      const r = await pdfText(f, $('#von').value, s => st.textContent = s);
      $('#eingabe').value = r.text;
      st.textContent = r.gelesen < r.seiten ? `Erste ${r.gelesen} von ${r.seiten} Seiten übernommen.` : '';
      doTranslate();
    } catch (err) { st.textContent = 'PDF ging nicht: ' + err.message; }
    return;
  }
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
function micButton(btn, { lang, statusEl, progEl, onText, pickLang }) {
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
      const L = pickLang ? await pickLang(audio) : lang();
      const text = await transcribe(audio, L, { onProgress: progressUI(progEl, statusEl, 'Spracherkennung') });
      progEl && progEl.classList.add('hidden');
      statusEl.textContent = '';
      if (!text) statusEl.textContent = 'Nichts verstanden – nochmal versuchen.';
      else await onText(text, L);
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
      statusEl.textContent = `Sprich jetzt (${lang() ? LANGS[lang()].name : 'egal welche Sprache'}) … tippen zum Beenden`;
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
    box.innerHTML = conv.filter(m => !m.eins).map(m => {
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
  const eins = b.dataset.m === 'einknopf';
  $('#gConv').classList.toggle('hidden', eins); $('#gEins').classList.toggle('hidden', !eins);
  $('#seiteB').classList.toggle('flip', b.dataset.m === 'gegenueber');
  settings.set({ gEinKnopf: eins });
});

// Ein Knopf: Whisper erkennt die gesprochene Sprache, die App ordnet sie einer der beiden Sprachen zu
fillLangSelect($('#g1A'), S.von); fillLangSelect($('#g1B'), S.nach);
function renderEins() {
  const a = $('#g1A').value;
  $('#g1Liste').innerHTML = conv.filter(x => x.eins).map(x => `<div class="bubble ${x.von === a ? 'me' : 'other'}"><span class="lang">${LANGS[x.von].flag} → ${LANGS[x.nach].flag}</span><span ${LANGS[x.nach].rtl ? 'dir="rtl"' : ''}>${esc(x.ergebnis)}</span><small>${esc(x.text)}</small></div>`).join('');
  $('#g1Liste').scrollTop = $('#g1Liste').scrollHeight;
}
micButton($('#g1Mic'), {
  lang: () => null, statusEl: $('#g1Status'), progEl: null,
  // Whisper entscheidet nur zwischen den beiden gewählten Sprachen
  pickLang: audio => whichLang(audio, [$('#g1A').value, $('#g1B').value]),
  onText: async (text, von) => {
    const a = $('#g1A').value, b = $('#g1B').value;
    const nach = von === a ? b : a;
    const st = $('#g1Status'); st.textContent = `${LANGS[von].flag} erkannt – übersetze …`;
    try {
      const r = await translate(text, von, nach);
      st.textContent = '';
      conv.push({ side: von === a ? 'A' : 'B', text, ergebnis: r, von, nach, eins: true, zeit: Date.now() }); renderEins();
      history.add({ text, ergebnis: r, von, nach });
      speak(r, nach).catch(() => {});
    } catch (e) { st.textContent = 'Fehler: ' + e.message; }
  },
});
if (S.gEinKnopf) $('#gModus button[data-m="einknopf"]').click();

$('#gLeeren').onclick = () => { conv.length = 0; renderConv(); renderEins(); };

// Gespräch / Untertitel als Text sichern
function teileText(titel, text, endung = '.txt', typ = 'text/plain') {
  const file = new File([text], titel.replace(/[^\wäöüÄÖÜß-]+/g, '_') + endung, { type: typ });
  if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: titel }).catch(() => {});
  if (navigator.share) return navigator.share({ title: titel, text }).catch(() => {});
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
}
const stamp = () => new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
$('#gSichern').onclick = () => {
  if (!conv.length) return toast('Noch nichts gesprochen.');
  const lines = conv.map(x => `${LANGS[x.von].name}: ${x.text}\n→ ${LANGS[x.nach].name}: ${x.ergebnis}`);
  teileText('Gespräch ' + stamp(), `Gespräch vom ${stamp()}\n\n` + lines.join('\n\n'));
};

// Reiter Gespräch / Live-Untertitel
$$('#gArt button').forEach(b => b.onclick = () => {
  $$('#gArt button').forEach(x => x.classList.toggle('on', x === b));
  $('#g-gespraech').classList.toggle('hidden', b.dataset.a !== 'gespraech');
  $('#g-untertitel').classList.toggle('hidden', b.dataset.a !== 'untertitel');
  if (b.dataset.a !== 'untertitel') stopUntertitel();
});

// Live-Untertitel: laufend mitschreiben und jeden Satz übersetzen
fillLangSelect($('#uVon'), S.nach === 'de' ? 'en' : S.nach); fillLangSelect($('#uNach'), 'de');
const uZeilen = []; let uRec = null, uQueue = Promise.resolve(), uOffen = 0, uStartet = false;
function renderUntertitel() {
  const box = $('#uListe');
  box.innerHTML = uZeilen.length ? uZeilen.map(z => `<div class="z ${z.r ? '' : 'wait'}"><div class="o">${esc(z.o || '…')}</div><div class="r" ${LANGS[$('#uNach').value].rtl ? 'dir="rtl"' : ''}>${esc(z.r || 'wird übersetzt …')}</div></div>`).join('') : box.innerHTML;
  box.scrollTop = box.scrollHeight;
}
async function stopUntertitel() {
  if (!uRec) return;
  const r = uRec; uRec = null; await r.stop();
  $('#uStart').textContent = '▶︎ Start'; $('#uStatus').textContent = uOffen ? 'Beende die letzten Sätze …' : 'Angehalten.';
}
$('#uStart').onclick = async () => {
  if (uStartet) return; // Mikrofon-Freigabe läuft noch
  if (uRec) return stopUntertitel();
  stopSpeak();
  const von = $('#uVon').value, nach = $('#uNach').value;
  uRec = new LiveRecorder({
    onLevel: l => $('#uStart').style.setProperty('--lvl', l.toFixed(2)),
    onSegment: audio => {
      const z = { o: '', r: '' }; uZeilen.push(z); uOffen++; renderUntertitel();
      // nacheinander abarbeiten, damit die Reihenfolge stimmt
      uQueue = uQueue.then(async () => {
        try {
          z.o = await transcribe(audio, von);
          if (!z.o || /^[\s.…]*$/.test(z.o)) { const i = uZeilen.indexOf(z); if (i >= 0) uZeilen.splice(i, 1); }
          else { renderUntertitel(); z.r = await translate(z.o, von, nach); }
        } catch (e) { z.r = '⚠︎ ' + e.message; }
        uOffen--; renderUntertitel();
        if (!uRec && !uOffen) $('#uStatus').textContent = 'Angehalten.';
        else if (uOffen > 2) $('#uStatus').textContent = `Hängt ${uOffen} Sätze hinterher – kleineres Erkennungsmodell wählen hilft.`;
        else if (uRec) $('#uStatus').textContent = 'Hört zu …';
      });
    },
  });
  const rec = uRec; uStartet = true;
  try { await rec.start(); uStartet = false; if (uRec !== rec) { await rec.stop(); return; } $('#uStart').textContent = '■ Stopp'; $('#uStatus').textContent = 'Hört zu …'; if (!uZeilen.length) $('#uListe').innerHTML = ''; }
  catch (e) { uStartet = false; uRec = null; $('#uStatus').textContent = 'Kein Zugriff aufs Mikrofon: ' + e.message; }
};
$('#uLeeren').onclick = () => { uZeilen.length = 0; $('#uListe').innerHTML = '<p class="hint">Leer.</p>'; };
$('#uSichern').onclick = () => {
  if (!uZeilen.length) return toast('Noch nichts mitgeschrieben.');
  teileText('Untertitel ' + stamp(), `Mitschrift vom ${stamp()} (${LANGS[$('#uVon').value].name} → ${LANGS[$('#uNach').value].name})\n\n` + uZeilen.map(z => `${z.o}\n→ ${z.r}`).join('\n\n'));
};

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
  for (const t of ['satzbuch', 'vokabeln', 'aussprache', 'deutsch']) $('#l-' + t).classList.toggle('hidden', t !== lTab);
  if (lTab === 'deutsch') renderDeutsch();
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

// Deutsch-Regeln
$('#dStand').textContent = STAND;
fillLangSelect($('#dSprache'), S.nach === 'de' ? 'en' : S.nach);
$('#dSuche').addEventListener('input', () => renderDeutsch());
const dOffen = new Set();
function renderDeutsch() {
  const q = $('#dSuche').value.trim().toLowerCase();
  const fit = e => !q || (e.t + ' ' + e.x + ' ' + e.b.join(' ')).toLowerCase().includes(q);
  $('#dListe').innerHTML = KAPITEL.map((k, ki) => {
    const es = k.eintraege.map((e, ei) => ({ e, id: ki + '-' + ei })).filter(o => fit(o.e));
    if (!es.length) return '';
    return `<details class="cat" data-k="${ki}" ${q || dOffen.has(ki) ? 'open' : ''}><summary><span>${k.icon} ${esc(k.titel)}</span><span class="hint small">${es.length} ›</span></summary>
      ${es.map(({ e, id }) => `<div class="phrase regel" data-id="${id}"><b>${esc(e.t)}</b><div class="regel-x">${esc(e.x)}</div>
        ${e.b.length ? `<ul class="regel-b">${e.b.map(x => `<li class="${x.startsWith('✗') ? 'w-no2' : ''}">${esc(x)}</li>`).join('')}</ul>` : ''}
        <div class="tools"><button class="btn sec small" data-dvor="${id}">🔊 Vorlesen</button><button class="btn sec small" data-dtr="${id}">Übersetzen</button></div>
        <div class="regel-tr hidden"></div></div>`).join('')}</details>`;
  }).join('') || '<div class="card hint">Nichts gefunden.</div>';
  $$('#dListe details').forEach(d => d.addEventListener('toggle', () => { d.open ? dOffen.add(+d.dataset.k) : dOffen.delete(+d.dataset.k); }));
  const get = id => { const [k, e] = id.split('-').map(Number); return KAPITEL[k].eintraege[e]; };
  $$('#dListe [data-dvor]').forEach(b => b.onclick = () => { const e = get(b.dataset.dvor); speak(e.t + '. ' + e.x, 'de').catch(err => toast(err.message)); });
  $$('#dListe [data-dtr]').forEach(b => b.onclick = async () => {
    const e = get(b.dataset.dtr), box = b.closest('.regel').querySelector('.regel-tr'), lang = $('#dSprache').value;
    if (lang === 'de') return toast('Bitte oben eine andere Sprache wählen.');
    box.classList.remove('hidden'); box.textContent = 'Übersetze …'; setDir(box, lang);
    try { box.textContent = await translate(e.t + '. ' + e.x, 'de', lang); } catch (err) { box.textContent = err.message; }
  });
  renderTest();
}
let tIdx = 0, tPunkte = 0, tAntwort = null;
function renderTest() {
  const box = $('#dTest');
  if (tIdx >= TEST.length) {
    box.innerHTML = `<div class="score">${tPunkte} / ${TEST.length}</div><p style="text-align:center">${tPunkte >= 9 ? 'Super – fast alles richtig!' : tPunkte >= 6 ? 'Gut gemacht!' : 'Schau dir die Regeln oben noch einmal an.'}</p><div class="tools" style="justify-content:center"><button class="btn" id="tNeu">Nochmal</button></div>`;
    $('#tNeu').onclick = () => { tIdx = 0; tPunkte = 0; tAntwort = null; renderTest(); };
    return;
  }
  const f = TEST[tIdx];
  box.innerHTML = `<p class="hint small">Frage ${tIdx + 1} von ${TEST.length}</p><p><b>${esc(f.q)}</b></p>
    ${f.a.map((a, i) => `<button class="item test-a ${tAntwort === null ? '' : i === f.r ? 'ok' : i === tAntwort ? 'no' : ''}" data-a="${i}" style="border:1px solid var(--line);border-radius:12px;margin:6px 0">${esc(a)}</button>`).join('')}
    ${tAntwort === null ? '' : `<p class="${tAntwort === f.r ? 'w-ok' : 'w-no'}">${tAntwort === f.r ? 'Richtig!' : 'Leider falsch.'}</p><p class="hint">${esc(f.e)}</p><button class="btn" id="tWeiter">Weiter</button>`}`;
  if (tAntwort === null) $$('#dTest [data-a]').forEach(b => b.onclick = () => { tAntwort = +b.dataset.a; if (tAntwort === f.r) tPunkte++; renderTest(); });
  else $('#tWeiter').onclick = () => { tIdx++; tAntwort = null; renderTest(); };
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
  for (const id of ['start', 'verlauf', 'fachwoerter', 'pakete', 'einstellungen', 'hilfe']) $('#m-' + id).classList.toggle('hidden', id !== p);
  if (p === 'verlauf') renderVerlauf();
  if (p === 'fachwoerter') renderFach();
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

// Fachwörterbuch
fillLangSelect($('#fwLang'), S.nach === 'de' ? 'en' : S.nach);
function renderFach() {
  const g = glossary.all();
  $('#fwListe').innerHTML = g.length ? g.map((e, i) => `<div class="item"><span class="t"><b>${esc(e.de)} → ${esc(e.ziel)}</b><span>${LANGS[e.lang].flag} ${LANGS[e.lang].name}</span></span><button class="icon" data-fwdel="${i}">✕</button></div>`).join('')
    : '<div class="item hint">Noch keine Einträge.</div>';
  $$('#fwListe [data-fwdel]').forEach(b => b.onclick = () => { glossary.remove(+b.dataset.fwdel); renderFach(); });
}
$('#fwAdd').onclick = () => {
  const de = $('#fwDe').value.trim(), ziel = $('#fwZiel').value.trim(), lang = $('#fwLang').value;
  if (!de || !ziel) return toast('Bitte beide Felder ausfüllen.');
  if (lang === 'de') return toast('Bitte eine Fremdsprache wählen.');
  glossary.add({ de, ziel, lang }); $('#fwDe').value = ''; $('#fwZiel').value = ''; renderFach(); toast('Gespeichert ✓');
};
$('#fwVorschlag').onclick = async () => {
  const de = $('#fwDe').value.trim(); if (!de) return toast('Erst den deutschen Begriff eintragen.');
  $('#fwZiel').value = '…';
  try { $('#fwZiel').value = (await translate(de, 'de', $('#fwLang').value, { ohneFachwoerter: true })).replace(/[.!]$/, ''); }
  catch (e) { $('#fwZiel').value = ''; toast(e.message); }
};
const SANITAER_EN = [['Absperrhahn', 'shut-off valve'], ['Kugelhahn', 'ball valve'], ['Fallrohr', 'downpipe'], ['Abwasserrohr', 'waste pipe'],
  ['Wasserzähler', 'water meter'], ['Druckminderer', 'pressure reducer'], ['Rückflussverhinderer', 'backflow preventer'], ['Siphon', 'trap'],
  ['Spülkasten', 'cistern'], ['Vorwandelement', 'pre-wall frame'], ['Mischbatterie', 'mixer tap'], ['Durchlauferhitzer', 'instantaneous water heater'],
  ['Warmwasserspeicher', 'hot water cylinder'], ['Heizkörper', 'radiator'], ['Fußbodenheizung', 'underfloor heating'], ['Pressfitting', 'press fitting'],
  ['Muffe', 'socket'], ['Bogen', 'elbow'], ['Dichtung', 'seal'], ['Rohrschelle', 'pipe clamp'], ['Gefälle', 'slope'], ['Dichtheitsprüfung', 'leak test'],
  ['Hauptleitung', 'main line'], ['Zirkulationsleitung', 'circulation line'], ['Revisionsöffnung', 'access panel']];
$('#fwVorlage').onclick = () => { for (const [de, ziel] of SANITAER_EN) glossary.add({ de, ziel, lang: 'en' }); renderFach(); toast(SANITAER_EN.length + ' Begriffe eingefügt'); };

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
  const nOk = hasModel(urls, NLLB.id);
  $('#pkNllbInfo').textContent = `ca. ${NLLB.mb} MB · ${nOk ? 'geladen ✓' : 'nicht geladen'}${settings.get().nllb ? ' · eingeschaltet' : ' · aus'}`;
  $('#pkNllb').textContent = nOk ? 'Löschen' : 'Laden'; $('#pkNllb').className = nOk ? 'btn red small' : 'btn small';
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
  refreshOffline(); renderPakete();
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
$('#pkNllb').onclick = async () => {
  const urls = await cachedModels();
  if (hasModel(urls, NLLB.id)) {
    if (!confirm('Großes Sprachmodell löschen?')) return;
    await freeModels('translation');
    const c = await caches.open('transformers-cache');
    for (const r of await c.keys()) if (r.url.includes('/' + NLLB.id + '/')) await c.delete(r);
    settings.set({ nllb: false }); refreshOffline(); return renderPakete();
  }
  if (!navigator.onLine) return toast('Zum Laden braucht es einmal Internet.');
  $('#pkNllb').disabled = true;
  try {
    await libCache();
    await loadModel('translation', NLLB.id, { onProgress: progressUI($('#pkNProg'), $('#pkNllbInfo'), 'Großes Sprachmodell') });
    settings.set({ nllb: true }); toast('Großes Sprachmodell geladen und eingeschaltet ✓');
  } catch (e) { toast('Fehler: ' + e.message); }
  $('#pkNllb').disabled = false; $('#pkNProg').classList.add('hidden'); refreshOffline(); renderPakete();
};
$('#pkPersist').onclick = async () => {
  const ok = await navigator.storage?.persist?.();
  toast(ok ? 'Speicher ist jetzt dauerhaft gesichert ✓' : 'Safari erlaubt das nur, wenn die App auf dem Home-Bildschirm liegt.');
  renderPakete();
};

// Einstellungen
function renderEinst() {
  const s = settings.get();
  $('#stSchrift').value = String(s.schrift); $('#stRueck').checked = s.rueck; $('#stNllb').checked = s.nllb;
  $('#stWhisper').innerHTML = Object.entries(WHISPER_MODELS).map(([k, m]) => `<option value="${k}">${m.name} · ${m.mb} MB</option>`).join('');
  $('#stStimme').value = s.stimme; $('#stTempo').value = String(s.tempo); $('#stAuto').checked = s.autoVorlesen;
  $('#stWhisper').value = s.whisper; $('#stStopp').checked = s.autoStopp; $('#stRechen').value = s.rechenweg;
  $('#stLlm').checked = s.llmAn; $('#stLlmUrl').value = s.llmUrl; $('#stLlmModell').value = s.llmModell;
}
$('#stStimme').onchange = e => settings.set({ stimme: e.target.value });
$('#stSchrift').onchange = e => { settings.set({ schrift: +e.target.value }); applySchrift(); };
$('#stRueck').onchange = e => settings.set({ rueck: e.target.checked });
$('#stNllb').onchange = async e => {
  settings.set({ nllb: e.target.checked });
  if (e.target.checked) {
    const urls = await cachedModels();
    if (!hasModel(urls, NLLB.id)) toast('Großes Sprachmodell noch nicht geladen – wird beim ersten Übersetzen geladen (ca. 900 MB) oder unter Sprachpakete.', 4500);
  } else freeModels('translation');
  refreshOffline();
};
$('#stBackup').onclick = () => {
  const b = JSON.stringify(backup(), null, 1);
  teileText('Dolmetscher-Sicherung ' + new Date().toISOString().slice(0, 10), b, '.json', 'application/json');
};
$('#stRestore').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { restore(JSON.parse(await f.text()), Object.keys(LANGS)); toast('Sicherung eingespielt ✓'); renderZuletzt(); renderEinst(); applySchrift(); }
  catch (err) { toast('Ging nicht: ' + err.message); }
};
function applySchrift() { document.documentElement.style.setProperty('--fs', settings.get().schrift); }
applySchrift();
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
  <h3>Neu in v1.2</h3>
  <p>• <b>Fachwörterbuch</b> (Mehr): feste Übersetzungen für deine Begriffe, mit Sanitär-Grundwortschatz auf Englisch.<br>
  • <b>Rückübersetzung</b> unter jeder Übersetzung zur Kontrolle.<br>
  • <b>Groß zeigen</b> (Knopf mit den vier Ecken): Übersetzung bildschirmfüllend, auf Wunsch gedreht fürs Gegenüber.<br>
  • <b>Gespräch › Ein Knopf</b>: egal wer spricht, die App erkennt die Sprache. <b>Gespräch sichern</b> als Textdatei.<br>
  • <b>Live-Untertitel</b>: schreibt laufend mit und übersetzt Satz für Satz.<br>
  • <b>PDF</b> über das Datei-Symbol, auch eingescannte Seiten.<br>
  • ✓ in der Sprachauswahl = liegt schon offline auf dem Gerät.<br>
  • <b>Großes Sprachmodell</b> (NLLB, ca. 900 MB) unter Sprachpakete – besser und ohne Umweg über Englisch.</p>
  <h3>Neu in v1.3</h3>
  <p>• <b>Lernen › Deutsch</b>: Grundregeln der deutschen Sprache, was sich seit 1901 geändert hat (Reformen 1996, 2006, 2017, 2024), häufige Fehler, Tipps zum Deutschlernen und ein Selbsttest. Jede Erklärung lässt sich vorlesen und in eine andere Sprache übersetzen – praktisch für Kollegen, die Deutsch lernen.</p>
  <h3>Kurzbefehl / Siri</h3>
  <p>In der App „Kurzbefehle“: Aktion <b>„Nach Eingabe fragen“</b>, dann <b>„URL öffnen“</b> mit<br>
  <code>https://tom444555.github.io/dolmetscher/#uebersetzen?nach=en&amp;vorlesen=1&amp;text=</code> und dahinter die Eingabe.<br>
  Zwischen beiden Aktionen <b>„URL codieren“</b> einfügen, sonst brechen Zeichen wie &amp;, # oder + den Text ab.
  Den Kurzbefehl z. B. „Übersetze“ nennen – dann reicht „Hey Siri, Übersetze“. Statt <code>en</code> geht jede Sprache: fr, pl, ru, tr …<br>
  Wichtig: Ein Kurzbefehl öffnet Safari, nicht die App auf dem Home-Bildschirm. Safari hat einen eigenen Speicher – die Sprachpakete müssen dort einmal mit Internet geladen werden, sonst geht es nur online.</p>
  <h3>Lokales Modell (Mac)</h3>
  <p>LM Studio öffnen → Modell <b>TranslateGemma 4B</b> oder <b>12B</b> laden → Reiter „Developer“ → Server starten und <b>„Enable CORS“</b> einschalten. Dann hier in den Einstellungen „Lokales Modell“ an. Am Mac im Browser klappt das direkt (localhost). Ist LM Studio aus, nimmt die App automatisch wieder das Offline-Modell.</p>`;
}

/* ---------- Start ---------- */
// Start, auch über Kurzbefehl-Link: …/dolmetscher/#uebersetzen?text=Hallo&von=de&nach=en&vorlesen=1
const [start, query] = (location.hash || '').slice(1).split('?');
const Q = new URLSearchParams(query || location.search.slice(1));
if (TITLES[start]) show(start);
if (Q.get('text')) {
  show('uebersetzen');
  if (LANGS[Q.get('von')]) $('#von').value = Q.get('von');
  if (LANGS[Q.get('nach')]) $('#nach').value = Q.get('nach');
  $('#eingabe').value = Q.get('text');
  doTranslate().then(() => {
    // iOS spielt Ton erst nach einer Berührung ab – deshalb ein großer Knopf
    if (Q.get('vorlesen') === '1' && lastResult) { zeigen(lastResult.ergebnis, lastResult.nach); toast('Auf 🔊 tippen zum Vorlesen', 4000); }
  });
  window.history.replaceState(null, '', '#uebersetzen');
}
refreshOffline();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
