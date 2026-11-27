// Sprachliste: alle Bausteine je Sprache an einer Stelle.
// whisper = Sprachname für die Spracherkennung, tess = Texterkennungs-Paket,
// piper = neuronale Stimme (falls vorhanden), bcp = Systemstimme/Sprachcode,
// mul = Kennung im Mehrsprachen-Modell (nur nötig, wenn kein direktes Modell en→xx existiert).
export const LANGS = {
  de: { name: 'Deutsch',      flag: '🇩🇪', whisper: 'german',     tess: 'deu',     piper: 'de_DE-thorsten-medium', bcp: 'de-DE' },
  en: { name: 'Englisch',     flag: '🇬🇧', whisper: 'english',    tess: 'eng',     piper: 'en_GB-alan-medium',     bcp: 'en-GB' },
  fr: { name: 'Französisch',  flag: '🇫🇷', whisper: 'french',     tess: 'fra',     piper: 'fr_FR-siwis-medium',    bcp: 'fr-FR' },
  es: { name: 'Spanisch',     flag: '🇪🇸', whisper: 'spanish',    tess: 'spa',     piper: 'es_ES-davefx-medium',   bcp: 'es-ES' },
  it: { name: 'Italienisch',  flag: '🇮🇹', whisper: 'italian',    tess: 'ita',     piper: 'it_IT-paola-medium',    bcp: 'it-IT' },
  nl: { name: 'Niederländisch', flag: '🇳🇱', whisper: 'dutch',    tess: 'nld',     piper: 'nl_NL-mls-medium',      bcp: 'nl-NL' },
  pt: { name: 'Portugiesisch', flag: '🇵🇹', whisper: 'portuguese', tess: 'por',    piper: 'pt_PT-tugão-medium',    bcp: 'pt-PT', mul: 'por' },
  pl: { name: 'Polnisch',     flag: '🇵🇱', whisper: 'polish',     tess: 'pol',     piper: 'pl_PL-gosia-medium',    bcp: 'pl-PL', mul: 'pol' },
  tr: { name: 'Türkisch',     flag: '🇹🇷', whisper: 'turkish',    tess: 'tur',     piper: 'tr_TR-dfki-medium',     bcp: 'tr-TR', mul: 'tur' },
  ru: { name: 'Russisch',     flag: '🇷🇺', whisper: 'russian',    tess: 'rus',     piper: 'ru_RU-irina-medium',    bcp: 'ru-RU' },
  uk: { name: 'Ukrainisch',   flag: '🇺🇦', whisper: 'ukrainian',  tess: 'ukr',     piper: 'uk_UA-ukrainian_tts-medium', bcp: 'uk-UA' },
  ro: { name: 'Rumänisch',    flag: '🇷🇴', whisper: 'romanian',   tess: 'ron',     piper: 'ro_RO-mihai-medium',    bcp: 'ro-RO' },
  hr: { name: 'Kroatisch',    flag: '🇭🇷', whisper: 'croatian',   tess: 'hrv',     piper: null,                    bcp: 'hr-HR', mul: 'hrv' },
  sr: { name: 'Serbisch',     flag: '🇷🇸', whisper: 'serbian',    tess: 'srp_latn', piper: 'sr_RS-serbski_institut-medium', bcp: 'sr-RS', mul: 'srp_Latn' },
  bs: { name: 'Bosnisch',     flag: '🇧🇦', whisper: 'bosnian',    tess: 'bos',     piper: null,                    bcp: 'bs-BA', mul: 'bos_Latn' },
  sq: { name: 'Albanisch',    flag: '🇦🇱', whisper: 'albanian',   tess: 'sqi',     piper: null,                    bcp: 'sq-AL', mul: 'sqi' },
  bg: { name: 'Bulgarisch',   flag: '🇧🇬', whisper: 'bulgarian',  tess: 'bul',     piper: null,                    bcp: 'bg-BG', mul: 'bul' },
  el: { name: 'Griechisch',   flag: '🇬🇷', whisper: 'greek',      tess: 'ell',     piper: 'el_GR-rapunzelina-low', bcp: 'el-GR', mul: 'ell' },
  cs: { name: 'Tschechisch',  flag: '🇨🇿', whisper: 'czech',      tess: 'ces',     piper: 'cs_CZ-jirka-medium',    bcp: 'cs-CZ' },
  hu: { name: 'Ungarisch',    flag: '🇭🇺', whisper: 'hungarian',  tess: 'hun',     piper: 'hu_HU-anna-medium',     bcp: 'hu-HU' },
  sv: { name: 'Schwedisch',   flag: '🇸🇪', whisper: 'swedish',    tess: 'swe',     piper: 'sv_SE-nst-medium',      bcp: 'sv-SE' },
  da: { name: 'Dänisch',      flag: '🇩🇰', whisper: 'danish',     tess: 'dan',     piper: 'da_DK-talesyntese-medium', bcp: 'da-DK' },
  fi: { name: 'Finnisch',     flag: '🇫🇮', whisper: 'finnish',    tess: 'fin',     piper: 'fi_FI-harri-medium',    bcp: 'fi-FI' },
  ar: { name: 'Arabisch',     flag: '🇸🇦', whisper: 'arabic',     tess: 'ara',     piper: 'ar_JO-kareem-medium',   bcp: 'ar-SA', rtl: true },
  fa: { name: 'Persisch',     flag: '🇮🇷', whisper: 'persian',    tess: 'fas',     piper: 'fa_IR-amir-medium',     bcp: 'fa-IR', mul: 'pes', rtl: true },
  he: { name: 'Hebräisch',    flag: '🇮🇱', whisper: 'hebrew',     tess: 'heb',     piper: null,                    bcp: 'he-IL', mul: 'heb', rtl: true },
  hi: { name: 'Hindi',        flag: '🇮🇳', whisper: 'hindi',      tess: 'hin',     piper: null,                    bcp: 'hi-IN' },
  zh: { name: 'Chinesisch',   flag: '🇨🇳', whisper: 'chinese',    tess: 'chi_sim', piper: 'zh_CN-huayan-medium',   bcp: 'zh-CN' },
  ja: { name: 'Japanisch',    flag: '🇯🇵', whisper: 'japanese',   tess: 'jpn',     piper: null,                    bcp: 'ja-JP', mul: 'jpn' },
  ko: { name: 'Koreanisch',   flag: '🇰🇷', whisper: 'korean',     tess: 'kor',     piper: null,                    bcp: 'ko-KR', mul: null },
  vi: { name: 'Vietnamesisch', flag: '🇻🇳', whisper: 'vietnamese', tess: 'vie',    piper: 'vi_VN-vais1000-medium', bcp: 'vi-VN' },
  th: { name: 'Thailändisch', flag: '🇹🇭', whisper: 'thai',       tess: 'tha',     piper: null,                    bcp: 'th-TH', mul: 'tha' },
  id: { name: 'Indonesisch',  flag: '🇮🇩', whisper: 'indonesian', tess: 'ind',     piper: null,                    bcp: 'id-ID' },
};

// Direkt vorhandene Übersetzungsmodelle (Opus-MT als ONNX bei Hugging Face, Konto Xenova).
const DIRECT = new Set(('de-en de-es de-fr en-de en-es en-fr en-it en-nl en-ru en-uk en-ar en-cs en-hu en-sv en-da en-fi ' +
  'en-ro en-vi en-zh en-hi en-id es-de es-en es-fr es-it es-ru fr-de fr-en fr-es fr-ro fr-ru it-en it-es it-fr ' +
  'nl-en nl-fr ru-en ru-es ru-fr ru-uk uk-en uk-ru da-de da-en fi-de fi-en sv-en cs-en hu-en ar-en hi-en id-en ' +
  'ja-en ko-en zh-en vi-en th-en pl-en tr-en et-en').split(/\s+/));

const ID = pair => 'Xenova/opus-mt-' + pair;

// Großes Mehrsprachen-Modell (optional, ca. 900 MB, eher für den Mac): kann jede Richtung direkt.
export const NLLB = { id: 'Xenova/nllb-200-distilled-600M', mb: 900 };
export const NLLB_CODES = {"de": "deu_Latn", "en": "eng_Latn", "fr": "fra_Latn", "es": "spa_Latn", "it": "ita_Latn", "nl": "nld_Latn", "pt": "por_Latn", "pl": "pol_Latn", "tr": "tur_Latn", "ru": "rus_Cyrl", "uk": "ukr_Cyrl", "ro": "ron_Latn", "hr": "hrv_Latn", "sr": "srp_Cyrl", "bs": "bos_Latn", "sq": "als_Latn", "bg": "bul_Cyrl", "el": "ell_Grek", "cs": "ces_Latn", "hu": "hun_Latn", "sv": "swe_Latn", "da": "dan_Latn", "fi": "fin_Latn", "ar": "arb_Arab", "fa": "pes_Arab", "he": "heb_Hebr", "hi": "hin_Deva", "zh": "zho_Hans", "ja": "jpn_Jpan", "ko": "kor_Hang", "vi": "vie_Latn", "th": "tha_Thai", "id": "ind_Latn"};

// Liefert die Schritte (Modelle) für eine Richtung. Gibt es kein direktes Modell,
// geht es über Englisch als Zwischensprache. null = Richtung nicht möglich.
export function route(src, tgt, { nllb = false } = {}) {
  if (src === tgt) return [];
  if (nllb) return [{ model: NLLB.id, nllb: { src: NLLB_CODES[src], tgt: NLLB_CODES[tgt] } }];
  if (DIRECT.has(`${src}-${tgt}`)) return [{ model: ID(`${src}-${tgt}`) }];
  const toEn = src === 'en' ? [] : DIRECT.has(`${src}-en`) ? [{ model: ID(`${src}-en`) }] : [{ model: ID('mul-en') }];
  let fromEn;
  if (tgt === 'en') fromEn = [];
  else if (DIRECT.has(`en-${tgt}`)) fromEn = [{ model: ID(`en-${tgt}`) }];
  else if (LANGS[tgt] && LANGS[tgt].mul) fromEn = [{ model: ID('en-mul'), prefix: `>>${LANGS[tgt].mul}<< ` }];
  else return null;
  return [...toEn, ...fromEn];
}

// Alle Modelle, die eine Sprache in beide Richtungen mit Deutsch braucht (für Sprachpakete).
export function modelsFor(code, home = 'de') {
  const set = new Set();
  for (const r of [route(home, code), route(code, home)]) (r || []).forEach(s => set.add(s.model));
  return [...set];
}

export const WHISPER_MODELS = {
  tiny:  { id: 'onnx-community/whisper-tiny',  name: 'Schnell (tiny)',     mb: 40 },
  base:  { id: 'onnx-community/whisper-base',  name: 'Ausgewogen (base)',  mb: 80 },
  small: { id: 'onnx-community/whisper-small', name: 'Genau (small)',      mb: 250 },
};

export const TESS_BASE = 'https://tessdata.projectnaptha.com/4.0.0_fast';
export const PIPER_BASE = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main';

// Welche von zwei Sprachen ist das? (für „Gespräch mit einem Knopf“)
// Erst nach Schrift (Kyrillisch, Arabisch …), dann nach typischen kurzen Wörtern.
const SCRIPT = { ru: /[\u0400-\u04FF]/, uk: /[\u0400-\u04FF]/, bg: /[\u0400-\u04FF]/, sr: /[\u0400-\u04FF]/, el: /[\u0370-\u03FF]/,
  ar: /[\u0600-\u06FF]/, fa: /[\u0600-\u06FF]/, he: /[\u0590-\u05FF]/, hi: /[\u0900-\u097F]/, th: /[\u0E00-\u0E7F]/,
  zh: /[\u4E00-\u9FFF]/, ja: /[\u3040-\u30FF\u4E00-\u9FFF]/, ko: /[\uAC00-\uD7AF]/ };
const WORDS = {
  de: 'der die das und ist ich nicht sie es ein eine zu mit auf wir ja nein bitte danke wo was wie haben sind auch noch mal',
  en: 'the and is are you i it to of a in that not yes no please thank what where how have this we can do',
  fr: 'le la les et est je vous il elle pas un une de des que oui non merci où quoi comment avec pour nous',
  es: 'el la los las y es yo usted no un una de que sí gracias dónde qué cómo con para por está muy',
  it: 'il la le e è io lei non un una di che sì grazie dove cosa come con per sono molto',
  nl: 'de het een en is ik je niet wat waar hoe met voor ja nee dank zijn van op',
  pt: 'o a os as e é eu você não um uma de que sim obrigado onde como com para está muito',
  pl: 'i w nie to jest się na że z do tak co jak gdzie dziękuję proszę jestem',
  tr: 've bir bu ne evet hayır teşekkür nerede nasıl için çok ben sen mi var yok',
  ro: 'și este eu nu un o de că da mulțumesc unde ce cum cu pentru sunt',
  hr: 'i je u ne da se na što kako gdje hvala molim sam to',
  bs: 'i je u ne da se na šta kako gdje hvala molim sam to',
  sr: 'i je u ne da se na šta kako gde hvala molim sam to',
  sq: 'dhe është unë nuk një të që po jo faleminderit ku si me për',
  cs: 'a je v ne to se na že jak kde děkuji prosím jsem ano',
  hu: 'a az és hogy nem van egy igen köszönöm hol mi hogyan vagyok',
  sv: 'och är jag inte en ett att det ja nej tack var vad hur med för',
  da: 'og er jeg ikke en et at det ja nej tak hvor hvad hvordan med for',
  fi: 'ja on minä ei se että kyllä kiitos missä mitä miten kanssa',
  vi: 'và là tôi không một của có cảm ơn ở đâu gì như thế nào với',
  id: 'dan adalah saya tidak satu yang ya terima kasih di mana apa bagaimana dengan',
};
export function detectScores(text, cands) {
  const t = ' ' + text.toLowerCase().replace(/[^\p{L}\s']/gu, ' ') + ' ';
  const score = {};
  for (const c of cands) {
    let s = 0;
    if (SCRIPT[c]) s += SCRIPT[c].test(text) ? 5 : -5;
    else if (Object.entries(SCRIPT).some(([k, r]) => !cands.includes(k) && r.test(text))) s -= 2;
    for (const w of (WORDS[c] || '').split(' ')) if (w && t.includes(' ' + w + ' ')) s += 1;
    score[c] = s;
  }
  return score;
}
export function detectLang(text, cands) {
  const score = detectScores(text, cands);
  return cands.slice().sort((a, b) => score[b] - score[a])[0];
}
