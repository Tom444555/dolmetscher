# Übergabe – Stand 27.11.2026 (v1.2)

## Neu in v1.2 (alles im Browser getestet, `tools/test_v12.py`)
- Stabilität: höchstens 3 Übersetzungsmodelle im Arbeitsspeicher (rechnende werden nie freigegeben), ein beim ersten Tippen freigeschalteter Abspieler (iOS), Spracherkennung wechselt mitten im Erkennen vom Grafikchip auf CPU, abgestürzter Rechen-Arbeiter startet neu
- Fachwörterbuch (Mehr): Ersetzung nach dem Übersetzen (genau, ähnlich, über die Einzelübersetzung des Begriffs, zuletzt Vorab-Einsetzen); Sanitär-Grundwortschatz Englisch als Vorlage
- Rückübersetzung unter jeder Übersetzung (Einstellung), „Groß zeigen“ mit Drehen, Schriftgröße
- Gespräch: „Ein Knopf“ – Whisper entscheidet nur zwischen den zwei gewählten Sprachen (`lid` im Worker), Gespräch als Textdatei sichern/teilen
- Live-Untertitel (Gespräch › Live-Untertitel): Pausen-Schnitt 0,7 s / max. 12 s, Abarbeitung in Reihenfolge
- PDF über das Datei-Symbol (pdf.js in app/lib/pdf), eingescannte Seiten per Texterkennung, max. 30 Seiten
- ✓ in der Sprachauswahl = Übersetzung liegt offline vor
- Kurzbefehl-Link `#uebersetzen?text=…&von=de&nach=en&vorlesen=1` (Anleitung in Hilfe)
- Großes Sprachmodell NLLB-200 (Xenova/nllb-200-distilled-600M, ca. 900 MB) unter Sprachpakete, Schalter in Einstellungen; getestet de→ko, de→pl
- Sicherung/Wiederherstellung als JSON-Datei (Einstellungen)

## Tests
`python3 tools/test.py`, `python3 tools/test_ui.py`, `python3 tools/test_v12.py` (NLLB zusätzlich: `python3 tools/test_v12.py nllb`, lädt 900 MB)

## Noch nicht am echten Gerät geprüft
- iPad/iPhone Safari: Mikrofon, Live-Untertitel-Tempo, Ton-Freigabe, WebGPU, Speicher dauerhaft, PDF-Auswahl aus „Dateien“
- Mac + echtes LM Studio mit TranslateGemma

## Offen / Ideen
- Fachwörter: Artikel/Geschlecht im Deutschen passt nicht immer („Das Absperrhahn“)
- Lokales Modell vom iPad aus geht nicht direkt (https-Seite → http im Heimnetz)
- Lautschrift; Liedtexte für Loopsmiths „Mitsingen lernen“
