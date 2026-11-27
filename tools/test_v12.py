"""Tests für die Neuerungen v1.2: Fachwörterbuch, Rückübersetzung, Groß zeigen, Kurzbefehl-Link, PDF (Text + eingescannt),
Speicher-Begrenzung (viele Sprachen nacheinander), Offline-Haken, Ein-Knopf-Gespräch, Live-Untertitel, Sichern.
Aufruf: python3 tools/test_v12.py   (NLLB extra: python3 tools/test_v12.py nllb)"""
import subprocess, sys, time, os, base64, json
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..', 'app')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8771', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://localhost:8771/'
ok = True
def check(name, cond, info=''):
    global ok
    print(('OK   ' if cond else 'FEHL ') + name + (('  → ' + str(info)[:260]) if info else ''))
    ok = ok and bool(cond)

# künstliches Mikro: lange Stille vorn und hinten, damit die Aufnahme den ganzen Satz erwischt
import wave
r = wave.open('/tmp/sprache.wav'); pr = r.getparams(); fr = r.readframes(r.getnframes()); r.close()
w = wave.open('/tmp/sprache3.wav', 'wb'); w.setparams(pr); sil = b'\x00' * pr.sampwidth * pr.framerate * 6; w.writeframes(sil + fr + sil); w.close()

# eingescannte PDF (nur Bild)
img = Image.new('RGB', (1240, 600), 'white'); d = ImageDraw.Draw(img)
d.text((80, 120), 'Bitte die Tür schließen.', font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 64), fill='black')
img.save('/tmp/scan.pdf')

try:
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            '--use-file-for-fake-audio-capture=/tmp/sprache3.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = b.new_context(permissions=['microphone'], viewport={'width': 820, 'height': 1180}, accept_downloads=True)
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_timeout(1000)
        T = lambda t, a, z: pg.evaluate("async ([t,a,z]) => (await import('./js/engine.js')).translate(t,a,z)", [t, a, z])

        # Text-PDF über Chrome erzeugen
        p2 = ctx.new_page(); p2.set_content('<h1>Wartungsanleitung</h1><p>Der Filter muss jedes Jahr gereinigt werden.</p>'); p2.pdf(path='/tmp/text.pdf'); p2.close()

        # Fachwörterbuch
        r0 = T('Der Absperrhahn ist kaputt.', 'de', 'en')
        pg.evaluate("async () => { const s = await import('./js/store.js'); s.glossary.add({de:'Absperrhahn', ziel:'shut-off valve', lang:'en'}); }")
        r1 = T('Der Absperrhahn ist kaputt.', 'de', 'en')
        check('Fachwort wird eingesetzt', 'shut-off valve' in r1.lower(), f'ohne: {r0} | mit: {r1}')
        r2 = T('The shut-off valve is leaking.', 'en', 'de')
        check('Fachwort auch in Gegenrichtung', 'absperrhahn' in r2.lower(), r2)

        # Rückübersetzung + Groß zeigen in der Oberfläche
        pg.select_option('#von', 'de'); pg.select_option('#nach', 'fr')
        pg.fill('#eingabe', 'Wo ist der nächste Bahnhof?')
        pg.wait_for_function("!document.querySelector('#rueck').classList.contains('hidden')", timeout=180000)
        check('Rückübersetzung erscheint', 'bahnhof' in pg.inner_text('#rueck').lower(), pg.inner_text('#rueck'))
        pg.click('#zeigen'); pg.wait_for_timeout(200)
        check('Groß zeigen', not pg.is_hidden('#zeigenBox') and len(pg.inner_text('#zText')) > 5, pg.inner_text('#zText'))
        pg.click('#zDrehen'); check('… gedreht', 'flip' in pg.get_attribute('#zeigenBox', 'class'))
        pg.click('#zZu')
        pg.screenshot(path='/tmp/v12_rueck.png')

        # Schriftgröße
        pg.evaluate("async () => { const s = await import('./js/store.js'); s.settings.set({schrift:1.5}); }")
        pg.reload(); pg.wait_for_timeout(800)
        check('Schriftgröße wirkt', pg.evaluate("getComputedStyle(document.querySelector('#eingabe')).fontSize") == '33px', pg.evaluate("getComputedStyle(document.querySelector('#eingabe')).fontSize"))
        pg.evaluate("async () => { const s = await import('./js/store.js'); s.settings.set({schrift:1}); }")

        # Kurzbefehl-Link
        pg.goto(URL + '#uebersetzen?text=Guten%20Morgen&von=de&nach=es'); pg.reload(); pg.wait_for_timeout(500)
        pg.wait_for_function("document.querySelector('#ausgabe').textContent.toLowerCase().includes('buen')", timeout=180000)
        check('Kurzbefehl-Link übersetzt', True, pg.inner_text('#ausgabe'))

        # PDF mit Text
        pg.select_option('#von', 'en'); pg.select_option('#nach', 'de')
        pg.set_input_files('#datei', '/tmp/text.pdf')
        pg.wait_for_function("document.querySelector('#eingabe').value.includes('Filter')", timeout=60000)
        check('PDF mit Text gelesen', 'Wartungsanleitung' in pg.input_value('#eingabe'), pg.input_value('#eingabe'))
        # eingescannte PDF
        pg.select_option('#von', 'de'); pg.select_option('#nach', 'en')
        pg.set_input_files('#datei', '/tmp/scan.pdf')
        pg.wait_for_function("document.querySelector('#eingabe').value.toLowerCase().includes('schlie')", timeout=180000)
        check('Eingescannte PDF erkannt', True, pg.input_value('#eingabe'))

        # Viele Sprachen nacheinander (Speicher-Begrenzung: höchstens 3 Modelle)
        outs = []
        for z in ['es', 'it', 'nl', 'pl', 'en']:
            outs.append(T('Danke für die Hilfe.', 'de', z))
        check('5 Sprachen nacheinander ohne Absturz', all(len(o) > 3 for o in outs), outs)

        # Offline-Haken
        pg.evaluate("async () => { const m = await import('./js/main.js'); }")
        pg.reload(); pg.wait_for_timeout(2500)
        opts = pg.evaluate("[...document.querySelectorAll('#nach option')].map(o=>o.textContent)")
        check('Offline-Haken bei geladener Sprache', any('Englisch ✓' in o for o in opts), [o for o in opts if '✓' in o])

        # Ein-Knopf-Gespräch (künstliches Mikro spricht Deutsch)
        pg.click('#tabs button[data-v="gespraech"]'); pg.click('#gModus button[data-m="einknopf"]')
        pg.select_option('#g1A', 'fr'); pg.select_option('#g1B', 'de')
        pg.click('#g1Mic')
        pg.wait_for_selector('#g1Liste .bubble', timeout=180000)
        check('Ein Knopf: Deutsch erkannt → Französisch', '🇩🇪 → 🇫🇷' in pg.inner_text('#g1Liste .bubble'), pg.inner_text('#g1Liste .bubble'))
        with pg.expect_download(timeout=10000) as dl:
            pg.evaluate("navigator.share = undefined; navigator.canShare = undefined;")
            pg.click('#gSichern')
        check('Gespräch sichern (Datei)', 'Gespräch vom' in open(dl.value.path(), encoding='utf-8').read())
        pg.screenshot(path='/tmp/v12_eins.png')

        # Live-Untertitel
        pg.click('#gArt button[data-a="untertitel"]'); pg.select_option('#uVon', 'de'); pg.select_option('#uNach', 'en')
        pg.click('#uStart')
        pg.wait_for_function("[...document.querySelectorAll('#uListe .z .r')].some(e => /pharmac|drug/i.test(e.textContent))", timeout=240000)
        pg.click('#uStart')
        check('Live-Untertitel schreibt mit und übersetzt', True, pg.inner_text('#uListe')[:200])
        pg.screenshot(path='/tmp/v12_unt.png')

        # Deutsch-Regeln (v1.3)
        pg.click('#tabs button[data-v="lernen"]'); pg.click('#lSeg button[data-l="deutsch"]'); pg.wait_for_timeout(300)
        check('Deutsch-Regeln: Kapitel da', pg.locator('#dListe details').count() == 4, pg.locator('#dListe details').count())
        pg.fill('#dSuche', 'Spaghetti'); pg.wait_for_timeout(200)
        check('Deutsch-Regeln: Suche', 'Spaghetti' in pg.inner_text('#dListe') and pg.locator('#dListe .regel').count() <= 3, pg.locator('#dListe .regel').count())
        pg.select_option('#dSprache', 'en'); pg.click('#dListe [data-dtr]')
        pg.wait_for_function("document.querySelector('#dListe .regel-tr') && !/Übersetze/.test(document.querySelector('#dListe .regel-tr').textContent) && document.querySelector('#dListe .regel-tr').textContent.length > 20", timeout=180000)
        check('Deutsch-Regeln: Erklärung übersetzt', True, pg.inner_text('#dListe .regel-tr')[:120])
        pg.fill('#dSuche', ''); pg.click('#dTest [data-a="1"]')
        check('Selbsttest wertet aus', 'Richtig' in pg.inner_text('#dTest'))
        pg.screenshot(path='/tmp/v13_deutsch.png', full_page=True)

        # Sicherung
        bk = pg.evaluate("async () => (await import('./js/store.js')).backup()")
        check('Sicherung enthält Fachwörter', any(e['de'] == 'Absperrhahn' for e in bk['daten']['g']))

        if 'nllb' in sys.argv:
            pg.evaluate("async () => { const s = await import('./js/store.js'); s.settings.set({nllb:true}); }")
            t0 = time.time(); r = T('Wo ist der Bahnhof?', 'de', 'ko')
            check(f'NLLB de→ko ({time.time()-t0:.0f}s)', any('가' <= c <= '힯' for c in r), r)
            r = T('Wo ist der Bahnhof?', 'de', 'pl'); check('NLLB de→pl direkt', len(r) > 3, r)
            pg.evaluate("async () => { const s = await import('./js/store.js'); s.settings.set({nllb:false}); }")

        check('Keine Seitenfehler', not errs, errs[-3:])
        b.close()
finally:
    srv.terminate()
print('ALLES OK' if ok else 'ES GIBT FEHLER')
