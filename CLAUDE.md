# Arbeitsweise im Lager „dolmetscher“

- Tom arbeitet am iPad/iPhone/Mac, Antworten auf Deutsch, einfache Sprache, keine Fachbegriffe ohne Erklärung.
- App = statische Web-App in `app/`, veröffentlicht über GitHub Actions (`.github/workflows/pages.yml`) auf GitHub Pages. Kein Build-Schritt für eigenen Code.
- Eigener Code: `app/js/*.js`, `app/css/app.css`, `app/index.html`. Fremd-Bibliotheken nur in `app/lib/` (neu bauen mit `tools/bausteine-bauen.sh`).
- Neue Sprache: Eintrag in `app/js/langs.js` (whisper, tess, piper, bcp, ggf. `mul`-Kennung). Ob es ein direktes Opus-MT-Modell gibt: Liste `DIRECT` in `langs.js`.
- Nach jeder Änderung: `python3 tools/test.py` und `python3 tools/test_ui.py` (brauchen Internet zu huggingface.co und tessdata).
- Bei Änderungen an App-Dateien `VERSION` in `app/sw.js` und `VERSION` in `app/js/main.js` hochzählen, sonst bekommt das iPad die neue Fassung erst später.
- Werden Piper-Dateien neu gebaut, ändern sich die Dateinamen mit Prüfsumme → `LIB_FILES` in `app/js/main.js` anpassen.
- Keine KI-Cloud in der App. Einzige Ausnahme: Schalter „Lokales Modell“ (LM Studio auf Toms Mac).
- Am Ende größerer Sitzungen `UEBERGABE.md` aktualisieren.
