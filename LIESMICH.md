# Dolmetscher

Übersetzer, der **komplett offline** auf iPad, iPhone und Mac läuft, als Web-App von GitHub Pages.

## Was er kann
- **Übersetzen**: tippen, einfügen, **reinsprechen**, Sprachnachricht oder Textdatei laden
- **Vorlesen** mit neuronaler Stimme (Piper), normal und langsam, alternativ mit der Gerätestimme
- **Gespräch**: zwei Seiten, jede spricht ihre Sprache, die App übersetzt und liest vor (Ansicht „Gegenüber“ dreht die obere Hälfte)
- **Foto**: Schild, Speisekarte oder Brief fotografieren. Der Text wird erkannt und **direkt im Bild** übersetzt.
- **Lernen**: Satzbuch (auch Baustelle & Arbeit), Vokabelkarten aus Gemerktem (5 Fächer), Aussprache-Training mit Bewertung
- **Verlauf & Gemerkt**, Kopieren, Teilen
- **Sprachpakete**: 33 Sprachen einzeln laden und löschen, mit Speicheranzeige
- **Lokales Modell** (Schalter): am Mac über LM Studio mit TranslateGemma für bessere Qualität
- **Fachwörterbuch**, **Rückübersetzung**, **Groß zeigen**, **Gespräch mit einem Knopf**, **Live-Untertitel**, **PDF**, **Kurzbefehl-Link**, **großes Sprachmodell NLLB** (v1.2)

## Einrichten (einmalig)
1. Seite in Safari öffnen → Teilen → **Zum Home-Bildschirm**
2. App öffnen → **Mehr › Sprachpakete** → zuerst „App-Bausteine & Spracherkennung“, dann die gewünschten Sprachen laden (WLAN)
3. Fertig, danach funktioniert alles ohne Internet.

## Technik
| Aufgabe | Baustein | Quelle |
|---|---|---|
| Sprache → Text | Whisper (tiny/base/small) über Transformers.js | Hugging Face `onnx-community/whisper-*` |
| Übersetzen | Opus-MT (Uni Helsinki) über Transformers.js, sonst über Englisch, sonst Mehrsprachen-Modell `en-mul`/`mul-en` | `Xenova/opus-mt-*` |
| Vorlesen | Piper (WebAssembly) | `diffusionstudio/piper-voices` |
| Foto-Text | Tesseract.js 5 | `tessdata.projectnaptha.com/4.0.0_fast` |
| Lokales Modell | LM Studio, OpenAI-kompatibel | `http://localhost:1234` |

Die Rechenkerne liegen in `app/lib/` (rund 60 MB), die Modelle werden beim ersten Gebrauch geladen und im Browser gespeichert.

## Prüfen
```
python3 tools/test.py      # Übersetzen, Stimme, Whisper, Foto-Text, alles auch offline
python3 tools/test_ui.py   # Bedienung mit künstlichem Mikrofon
python3 tools/test_v12.py  # Neuerungen v1.2
```
