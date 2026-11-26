// Mikrofon-Aufnahme. Liefert 16-kHz-Mono-Audio für die Spracherkennung.
// Optional automatischer Stopp, wenn man 1,5 s nichts mehr sagt.
export class Recorder {
  constructor({ autoStop = true, onLevel, onAutoStop } = {}) {
    this.autoStop = autoStop; this.onLevel = onLevel; this.onAutoStop = onAutoStop;
  }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctx.createMediaStreamSource(this.stream);
    // Rohdaten direkt abgreifen (zuverlässiger auf iPad als MediaRecorder-Formate).
    const proc = this.ctx.createScriptProcessor(4096, 1, 1);
    this.buf = []; this.started = performance.now(); this.lastVoice = performance.now(); this.heard = false;
    proc.onaudioprocess = e => {
      const d = e.inputBuffer.getChannelData(0);
      this.buf.push(new Float32Array(d));
      let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
      const rms = Math.sqrt(sum / d.length);
      this.onLevel && this.onLevel(Math.min(1, rms * 8));
      const now = performance.now();
      if (rms > 0.02) { this.lastVoice = now; this.heard = true; }
      if (this.autoStop && this.heard && now - this.lastVoice > 1500 && now - this.started > 1200) {
        this.autoStop = false; this.onAutoStop && this.onAutoStop();
      }
      if (now - this.started > 120000) { this.autoStop = false; this.onAutoStop && this.onAutoStop(); }
    };
    src.connect(proc); proc.connect(this.ctx.destination);
    this.proc = proc; this.src = src;
  }
  async stop() {
    try { this.proc.disconnect(); this.src.disconnect(); } catch {}
    this.stream.getTracks().forEach(t => t.stop());
    const rate = this.ctx.sampleRate;
    await this.ctx.close();
    let n = 0; for (const b of this.buf) n += b.length;
    const all = new Float32Array(n); let o = 0; for (const b of this.buf) { all.set(b, o); o += b.length; }
    return { audio: resample(all, rate, 16000), heard: this.heard, seconds: n / rate };
  }
}

export function resample(data, from, to) {
  if (from === to) return data;
  const ratio = from / to, len = Math.floor(data.length / ratio), out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const p = i * ratio, i0 = Math.floor(p), f = p - i0;
    out[i] = (data[i0] || 0) * (1 - f) + (data[i0 + 1] || 0) * f;
  }
  return out;
}

// Audiodatei (z. B. Sprachnachricht) in 16-kHz-Mono umwandeln.
export async function decodeFile(file) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const ab = await file.arrayBuffer();
  const buf = await ctx.decodeAudioData(ab);
  const ch = buf.getChannelData(0);
  const out = resample(ch, buf.sampleRate, 16000);
  ctx.close();
  return out;
}
