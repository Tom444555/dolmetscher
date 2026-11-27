// Speicher auf dem Gerät: Einstellungen, Verlauf, Favoriten, Vokabelkarten.
const K = { s: 'dm.einstellungen', h: 'dm.verlauf', v: 'dm.vokabeln', p: 'dm.satzcache', g: 'dm.fachwoerter' };

function load(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

const DEFAULTS = {
  von: 'de', nach: 'en',
  whisper: 'base', rechenweg: 'auto',
  stimme: 'piper', tempo: 1, autoVorlesen: false,
  autoStopp: true,
  llmAn: false, llmUrl: 'http://localhost:1234', llmModell: '',
  bildModus: 'overlay',
  nllb: false,          // großes Sprachmodell (ca. 900 MB)
  rueck: true,          // Rückübersetzung zur Kontrolle anzeigen
  schrift: 1,           // Schriftgröße (1 = normal, 1.25 = groß, 1.5 = sehr groß)
  gEinKnopf: false,     // Gespräch: ein Knopf, Sprache wird erkannt
};

export const settings = {
  get() { return { ...DEFAULTS, ...load(K.s, {}) }; },
  set(patch) { const s = { ...this.get(), ...patch }; save(K.s, s); return s; },
};

export const history = {
  all() { return load(K.h, []); },
  add(e) {
    const h = this.all().filter(x => !(x.text === e.text && x.von === e.von && x.nach === e.nach));
    h.unshift({ ...e, zeit: Date.now(), stern: false });
    save(K.h, h.slice(0, 300));
  },
  toggleStar(i) { const h = this.all(); if (h[i]) { h[i].stern = !h[i].stern; save(K.h, h); if (h[i].stern) vocab.add(h[i]); } return h; },
  remove(i) { const h = this.all(); h.splice(i, 1); save(K.h, h); return h; },
  clear() { save(K.h, this.all().filter(x => x.stern)); },
};

// Vokabelkarten mit 5 Fächern (Lernkartei). Fach 1 = jeden Tag, Fach 5 = selten.
const INTERVAL = [0, 0, 1, 3, 7, 21]; // Tage bis zur nächsten Abfrage je Fach
export const vocab = {
  all() { return load(K.v, []); },
  add(e) {
    const v = this.all();
    if (v.some(x => x.text === e.text && x.nach === e.nach)) return;
    v.push({ text: e.text, ergebnis: e.ergebnis, von: e.von, nach: e.nach, fach: 1, faellig: Date.now() });
    save(K.v, v);
  },
  due() { const now = Date.now(); return this.all().map((c, i) => ({ ...c, i })).filter(c => c.faellig <= now); },
  answer(i, gewusst) {
    const v = this.all(); const c = v[i]; if (!c) return;
    c.fach = gewusst ? Math.min(5, c.fach + 1) : 1;
    c.faellig = Date.now() + INTERVAL[c.fach] * 864e5;
    save(K.v, v);
  },
  remove(i) { const v = this.all(); v.splice(i, 1); save(K.v, v); },
};

// Bereits übersetzte Sätze aus dem Satzbuch (damit sie sofort und offline da sind).
export const phraseCache = {
  get(nach, text) { return load(K.p, {})[nach + '|' + text]; },
  set(nach, text, r) { const c = load(K.p, {}); c[nach + '|' + text] = r; save(K.p, c); },
};

// Fachwörterbuch: { de: 'Absperrhahn', ziel: 'shut-off valve', lang: 'en' }
export const glossary = {
  all() { return load(K.g, []); },
  add(e) {
    const g = this.all().filter(x => !(x.de.toLowerCase() === e.de.toLowerCase() && x.lang === e.lang));
    g.push(e); g.sort((a, b) => a.de.localeCompare(b.de, 'de')); save(K.g, g);
  },
  remove(i) { const g = this.all(); g.splice(i, 1); save(K.g, g); },
  replaceAll(list) { save(K.g, list); },
};

// Alles sichern / wiederherstellen (Datei)
export function backup() {
  const o = {}; for (const [n, k] of Object.entries(K)) o[n] = load(k, null);
  return { app: 'dolmetscher', stand: new Date().toISOString(), daten: o };
}
export function restore(b, known) {
  if (!b || b.app !== 'dolmetscher' || !b.daten || typeof b.daten !== 'object') throw new Error('Keine Dolmetscher-Sicherung');
  const ok = c => !known || known.includes(c);
  const d = { ...b.daten };
  // Einträge mit unbekannten Sprachen weglassen, damit die App sicher startet
  if (Array.isArray(d.h)) d.h = d.h.filter(x => x && typeof x.text === 'string' && ok(x.von) && ok(x.nach));
  if (Array.isArray(d.v)) d.v = d.v.filter(x => x && typeof x.text === 'string' && ok(x.von) && ok(x.nach));
  if (Array.isArray(d.g)) d.g = d.g.filter(x => x && x.de && x.ziel && ok(x.lang));
  if (d.s && typeof d.s === 'object') { if (!ok(d.s.von)) delete d.s.von; if (!ok(d.s.nach)) delete d.s.nach; }
  for (const [n, k] of Object.entries(K)) if (d[n] != null) save(k, d[n]);
}
