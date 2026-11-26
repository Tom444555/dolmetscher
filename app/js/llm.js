// Schalter "Lokales Modell": schickt die Übersetzung an LM Studio auf dem Mac
// (z. B. TranslateGemma 4B/12B). Nur lokal, nichts geht ins Internet.
import { settings } from './store.js';
import { LANGS } from './langs.js';

export async function llmTranslate(text, src, tgt) {
  const s = settings.get();
  const url = (s.llmUrl || 'http://localhost:1234').replace(/\/$/, '') + '/v1/chat/completions';
  const sn = LANGS[src].name, tn = LANGS[tgt].name;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60000);
  const res = await fetch(url, {
    method: 'POST', signal: ctl.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: s.llmModell || undefined,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: `Du bist ein professioneller Übersetzer. Übersetze den folgenden Text von ${sn} nach ${tn}. ` +
          `Behalte Bedeutung, Ton und Zeilenumbrüche bei. Gib ausschließlich die Übersetzung aus, ohne Erklärungen.\n\n${text}`
      }]
    })
  });
  clearTimeout(timer);
  if (!res.ok) throw new Error('LM Studio antwortet mit ' + res.status);
  const j = await res.json();
  let out = j.choices?.[0]?.message?.content || '';
  out = out.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  if (!out) throw new Error('leere Antwort');
  return out;
}

export async function llmTest() {
  const s = settings.get();
  const url = (s.llmUrl || 'http://localhost:1234').replace(/\/$/, '') + '/v1/models';
  const res = await fetch(url);
  const j = await res.json();
  return (j.data || []).map(m => m.id);
}
