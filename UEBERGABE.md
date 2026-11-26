# Übergabe – Stand 26.11.2026 (v1.0)

## Fertig und geprüft (Chrome ohne Bildschirm, echte Modelle)
- Übersetzen de→en, de→pl (über Englisch), fr→de, Tippen in der Oberfläche
- Reinsprechen (künstliches Mikrofon) → Whisper → Übersetzung; Sprachnachricht/Textdatei laden
- Piper-Stimme erzeugt, von Whisper korrekt wiedererkannt („Ich brauche dringend einen Arzt“)
- Foto-Text: Speisekarte erkannt, zeilenweise übersetzt, Übersetzung im Bild
- Gespräch (de ↔ fr), Satzbuch „Alle übersetzen“, Vokabelkarte (Fach 1 → 2), Aussprache-Bewertung
- **Offline**: Start, Übersetzen, Foto-Text und Stimme ohne Netz
- Schalter „Lokales Modell“ gegen einen nachgebauten LM-Studio-Server

## Noch nicht am echten Gerät geprüft
- iPad/iPhone Safari: Mikrofon, WebGPU-Weg für Whisper (fällt sonst auf CPU zurück), Speicher dauerhaft (Home-Bildschirm), Piper-Speicher (OPFS; zusätzlich im Service-Worker-Speicher)
- Mac + echtes LM Studio mit TranslateGemma (CORS in LM Studio einschalten)

## Offen / Ideen für später
- Lokales Modell vom iPad aus: geht nicht direkt (https-Seite darf kein http im Heimnetz ansprechen). Möglicher Weg: LM Studio über https-Tunnel oder Mac-Browser nutzen.
- Koreanisch als Zielsprache offline (kein passendes Modell), PDF-Dokumente direkt (bisher: Foto/Textdatei)
- Lautschrift, Live-Untertitel (laufend mitschreiben), Anbindung an Loopsmiths „Mitsingen lernen“ (Liedtext übersetzen)
- Größeres Mehrsprachen-Modell NLLB-200 (ca. 900 MB) nur für den Mac als Option
