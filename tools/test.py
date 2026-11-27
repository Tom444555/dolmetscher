"""Ende-zu-Ende-Test im echten Chrome (ohne Bildschirm):
Übersetzen (direkt + über Englisch), Vorlesen (Piper), Spracherkennung (Whisper, mit der Piper-Stimme als Eingabe),
Foto-Text (Tesseract) und danach alles nochmal OFFLINE.
Aufruf: python3 tools/test.py   (startet selbst einen Server auf Port 8765)"""
import subprocess, sys, time, json, os
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', 'app')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://localhost:8765/'
ok = True
def check(name, cond, info=''):
    global ok
    print(('OK   ' if cond else 'FEHL ') + name + (('  → ' + str(info)[:300]) if info else ''))
    ok = ok and bool(cond)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
        ctx = b.new_context(service_workers='allow')
        page = ctx.new_page()
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: m.type in ('warning','error') and 'Stimme' in m.text and print('KONSOLE', m.text[:300]))
        page.on('requestfailed', lambda r: print('REQFAIL', r.url[-80:], r.failure))
        page.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        page.goto(URL); page.wait_for_timeout(1500)
        check('Seite lädt ohne Fehler', not errs, errs)
        page.screenshot(path='/tmp/dm_start.png', full_page=True)

        def tr(text, a, b_, t=240000):
            return page.evaluate("""async ([t,a,b]) => { const m = await import('./js/engine.js'); return await m.translate(t,a,b); }""", [text, a, b_])
        t0 = time.time(); r = tr('Guten Morgen, wo ist der Bahnhof?', 'de', 'en'); check(f'de→en ({time.time()-t0:.0f}s)', 'station' in r.lower(), r)
        t0 = time.time(); r = tr('Guten Morgen, wo ist der Bahnhof?', 'de', 'pl'); check(f'de→pl über Englisch ({time.time()-t0:.0f}s)', len(r) > 5 and r != 'Guten Morgen, wo ist der Bahnhof?', r)
        t0 = time.time(); r = tr('Où est la gare ?', 'fr', 'de'); check(f'fr→de direkt ({time.time()-t0:.0f}s)', 'bahnhof' in r.lower(), r)

        # Piper-Stimme erzeugen und gleich als Spracheingabe für Whisper nehmen
        t0 = time.time()
        res = page.evaluate("""async () => {
          const t = await import('./js/tts.js');
          const wav = await t.synth('Ich brauche dringend einen Arzt.', 'de');
          const ctx = new AudioContext(); const buf = await ctx.decodeAudioData(await wav.arrayBuffer());
          const rec = await import('./js/rec.js'); const a = rec.resample(buf.getChannelData(0), buf.sampleRate, 16000);
          const e = await import('./js/engine.js');
          const text = await e.transcribe(a, 'de');
          return { bytes: wav.size, text };
        }""")
        check(f'Piper-Stimme ({time.time()-t0:.0f}s inkl. Whisper)', res['bytes'] > 20000, res['bytes'])
        check('Whisper erkennt die Stimme', 'arzt' in res['text'].lower(), res['text'])

        # Foto-Text: Bild mit Schrift erzeugen
        t0 = time.time()
        ocr = page.evaluate("""async () => {
          const c = document.createElement('canvas'); c.width = 900; c.height = 300; const g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0,0,900,300); g.fillStyle = '#000'; g.font = 'bold 56px Arial';
          g.fillText('Sortie de secours', 60, 120); g.font = '40px Arial'; g.fillText('Ne pas bloquer la porte', 60, 210);
          const o = await import('./js/ocr.js'); const r = await o.recognize(c, 'fr');
          return r;
        }""")
        check(f'Foto-Text erkannt ({time.time()-t0:.0f}s)', 'secours' in ocr['text'].lower(), ocr['text'])
        check('Absätze mit Rahmen', len(ocr['paras']) >= 1, ocr['paras'][:1])

        # Oberfläche: Text eintippen
        page.fill('#eingabe', 'Danke schön für die Hilfe.')
        page.select_option('#nach', 'en')
        page.wait_for_function("document.querySelector('#ausgabe').textContent.toLowerCase().includes('thank')", timeout=120000)
        check('Oberfläche übersetzt beim Tippen', True, page.inner_text('#ausgabe'))
        page.screenshot(path='/tmp/dm_uebersetzen.png', full_page=True)

        # OFFLINE
        page.reload(); page.wait_for_timeout(1500)
        print('CTRL', page.evaluate('!!navigator.serviceWorker.controller'))
        ctx.set_offline(True)
        page.reload(); page.wait_for_timeout(2000)
        check('App startet offline', page.inner_text('#title') != '', page.inner_text('#netz'))
        r = tr('Wo ist die Toilette?', 'de', 'en'); check('Offline de→en', 'toilet' in r.lower() or 'bathroom' in r.lower() or 'restroom' in r.lower(), r)
        r = tr('Wo ist die Toilette?', 'de', 'pl'); check('Offline de→pl', len(r) > 3, r)
        ocr2 = page.evaluate("""async () => { const c = document.createElement('canvas'); c.width=700;c.height=160; const g=c.getContext('2d'); g.fillStyle='#fff';g.fillRect(0,0,700,160);g.fillStyle='#000';g.font='bold 60px Arial';g.fillText('Fermé le lundi',40,100); const o = await import('./js/ocr.js'); return (await o.recognize(c,'fr')).text; }""")
        check('Offline Foto-Text', 'lundi' in ocr2.lower(), ocr2)
        wav = page.evaluate("async () => { const t = await import('./js/tts.js'); return (await t.synth('Offline klappt es auch.', 'de')).size; }")
        check('Offline Stimme', wav > 20000, wav)
        for v in ['gespraech', 'foto', 'lernen', 'mehr']:
            page.click(f'#tabs button[data-v="{v}"]'); page.wait_for_timeout(400)
            page.screenshot(path=f'/tmp/dm_{v}.png', full_page=True)
        page.click('[data-go="pakete"]'); page.wait_for_timeout(2500); page.screenshot(path='/tmp/dm_pakete.png', full_page=True)
        check('Keine Fehler in der Konsole', not [e for e in errs if 'net::ERR' not in e and 'Failed to load resource' not in e], errs[-5:])
        b.close()
finally:
    srv.terminate()
print('ALLES OK' if ok else 'ES GIBT FEHLER')
