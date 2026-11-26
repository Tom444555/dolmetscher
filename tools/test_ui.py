"""Bedien-Test: Mikrofon (künstliches Mikro mit Piper-Sprache), Gespräch, Foto-Seite, Satzbuch, Aussprache, Sprachpakete.
Aufruf: python3 tools/test_ui.py"""
import subprocess, sys, time, os, base64
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..', 'app')
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8766', '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
URL = 'http://localhost:8766/'
ok = True
def check(name, cond, info=''):
    global ok
    print(('OK   ' if cond else 'FEHL ') + name + (('  → ' + str(info)[:250]) if info else ''))
    ok = ok and bool(cond)

# Testbild: Speisekarte auf Englisch
img = Image.new('RGB', (1000, 520), (250, 244, 230)); d = ImageDraw.Draw(img)
fb = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 64)
fr = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 40)
d.text((60, 50), 'Daily Menu', font=fb, fill=(40, 30, 20))
d.text((60, 190), 'Tomato soup with fresh bread', font=fr, fill=(40, 30, 20))
d.text((60, 300), 'Grilled chicken with potatoes', font=fr, fill=(40, 30, 20))
img.save('/tmp/menu.png')

try:
    with sync_playwright() as p:
        # 1) Sprache als WAV erzeugen
        b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
        pg = b.new_page(); pg.goto(URL); pg.wait_for_timeout(800)
        b64 = pg.evaluate("""async () => { const P = await import('./lib/piper/piper-entry.js'); const base = new URL('./lib/piper/', location.href).href;
          const s = await P.TtsSession.create({ voiceId: 'de_DE-thorsten-medium', wasmPaths: { onnxWasm: base+'ort/', piperData: base+'piper_phonemize.data', piperWasm: base+'piper_phonemize.wasm' } });
          const w = await s.predict('Wo ist die nächste Apotheke?'); const bytes = new Uint8Array(await w.arrayBuffer());
          let s2=''; for (const x of bytes) s2 += String.fromCharCode(x); return btoa(s2); }""")
        open('/tmp/sprache.wav', 'wb').write(base64.b64decode(b64)); b.close()
        # Stille anhängen, damit "automatisch stoppen" greift (künstliches Mikro spielt in Schleife)
        subprocess.run(['python3', '-c', """
import wave
r=wave.open('/tmp/sprache.wav'); p=r.getparams(); f=r.readframes(r.getnframes()); r.close()
w=wave.open('/tmp/sprache2.wav','wb'); w.setparams(p); w.writeframes(b'\\x00'*p.sampwidth*p.framerate*1 + f + b'\\x00'*p.sampwidth*p.framerate*4); w.close()"""])

        b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
            '--use-file-for-fake-audio-capture=/tmp/sprache2.wav', '--autoplay-policy=no-user-gesture-required'])
        ctx = b.new_context(permissions=['microphone'], viewport={'width': 820, 'height': 1180})
        pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(URL); pg.wait_for_timeout(1000)

        # Mikrofon auf "Übersetzen"
        pg.select_option('#von', 'de'); pg.select_option('#nach', 'en')
        pg.click('#mic')
        pg.wait_for_function("document.querySelector('#eingabe').value.length > 3", timeout=180000)
        check('Reinsprechen → Text', 'apotheke' in pg.input_value('#eingabe').lower(), pg.input_value('#eingabe'))
        pg.wait_for_function("document.querySelector('#ausgabe').textContent.toLowerCase().includes('pharmacy')", timeout=120000)
        check('… und übersetzt', True, pg.inner_text('#ausgabe'))
        pg.click('#merken'); pg.wait_for_timeout(300)
        check('Merken → Vokabelkarte', pg.evaluate("JSON.parse(localStorage.getItem('dm.vokabeln')||'[]').length") == 1)
        pg.screenshot(path='/tmp/ui_mic.png')

        # Gespräch: untere Seite (Deutsch) spricht
        pg.click('#tabs button[data-v="gespraech"]'); pg.select_option('#gB', 'fr')
        pg.click('#seiteA .mic')
        pg.wait_for_selector('#seiteB .bubble', timeout=180000)
        check('Gespräch: Übersetzung erscheint beim Gegenüber', len(pg.inner_text('#seiteB .bubble')) > 3, pg.inner_text('#seiteB .bubble'))
        pg.screenshot(path='/tmp/ui_gespraech.png')

        # Foto
        pg.click('#tabs button[data-v="foto"]'); pg.select_option('#fVon', 'en'); pg.select_option('#fNach', 'de')
        pg.set_input_files('#fBild', '/tmp/menu.png')
        pg.wait_for_selector('#fParas .para', timeout=180000)
        pg.wait_for_function("[...document.querySelectorAll('#fParas .r')].some(e=>e.textContent.length>3)", timeout=180000)
        check('Foto: erkannt und übersetzt', 'suppe' in pg.inner_text('#fParas').lower(), pg.inner_text('#fParas'))
        pg.screenshot(path='/tmp/ui_foto.png', full_page=True)

        # Satzbuch
        pg.click('#tabs button[data-v="lernen"]'); pg.select_option('#sbNach', 'es')
        pg.click('#sbListe details[data-k="Notfall"] summary')
        pg.click('#sbListe [data-alle="Notfall"]')
        pg.wait_for_function("document.querySelector('#sbListe details[data-k=\"Notfall\"] .phrase .r') && document.querySelector('#sbListe details[data-k=\"Notfall\"] .phrase .r').textContent.length>1", timeout=180000)
        check('Satzbuch: Thema übersetzt', True, pg.inner_text('#sbListe details[data-k="Notfall"] .phrase'))
        pg.screenshot(path='/tmp/ui_satzbuch.png')

        # Vokabeln
        pg.click('#lSeg button[data-l="vokabeln"]'); pg.wait_for_timeout(300)
        check('Vokabelkarte da', 'apotheke' in pg.inner_text('#vkKarte').lower(), pg.inner_text('#vkKarte'))
        pg.click('#vkZeig'); pg.click('#vkJa'); pg.wait_for_timeout(200)
        check('Karte ins nächste Fach', pg.evaluate("JSON.parse(localStorage.getItem('dm.vokabeln'))[0].fach") == 2)

        # Aussprache (Deutsch als "Fremdsprache", damit die künstliche Stimme passt)
        pg.click('#lSeg button[data-l="aussprache"]'); pg.select_option('#apSprache', 'de'); pg.wait_for_timeout(500)
        pg.fill('#apText', 'Wo ist die nächste Apotheke?')
        pg.click('#apMic')
        pg.wait_for_selector('#apErgebnis:not(.hidden)', timeout=180000)
        score = pg.inner_text('#apErgebnis .score')
        check('Aussprache-Bewertung erscheint (Wert hängt davon ab, wo das künstliche Mikro in seiner Schleife steht)', score.strip().endswith('%'), score)
        pg.screenshot(path='/tmp/ui_aussprache.png')

        # Sprachpakete-Seite
        pg.click('#tabs button[data-v="mehr"]'); pg.click('[data-go="pakete"]'); pg.wait_for_timeout(2500)
        pg.screenshot(path='/tmp/ui_pakete.png')
        check('Keine Seitenfehler', not errs, errs[-3:])
        b.close()
finally:
    srv.terminate()
print('ALLES OK' if ok else 'ES GIBT FEHLER')
