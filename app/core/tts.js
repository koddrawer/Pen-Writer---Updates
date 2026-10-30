// Giọng đọc cảm ơn qua Google Translate TTS (cần mạng). Có bộ nhớ đệm file mp3 trong userData/tts.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { edgeSynth, VOICES } = require('./edge-tts.js');

class TTS {
  constructor(dir, fetch, getWS) { this.dir = dir; this.fetch = fetch; this.getWS = getWS; fs.mkdirSync(dir, { recursive: true }); this.clean(); }
  clean() {
    try {
      const files = fs.readdirSync(this.dir).map(f => ({ f, t: fs.statSync(path.join(this.dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      for (const x of files.slice(400)) fs.unlinkSync(path.join(this.dir, x.f));
    } catch { }
  }
  // trả về đường dẫn file mp3 (hoặc ném lỗi)
  async google(text, lang = 'vi') {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 190);
    if (!text) throw new Error('Câu đọc trống');
    const key = crypto.createHash('sha1').update(lang + '|' + text).digest('hex').slice(0, 20);
    const file = path.join(this.dir, key + '.mp3');
    if (fs.existsSync(file) && fs.statSync(file).size > 500) return file;
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
    const r = await this.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Referer: 'https://translate.google.com/' } });
    if (!r.ok) throw new Error('Google TTS HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 500) throw new Error('Google TTS trả về dữ liệu rỗng');
    fs.writeFileSync(file, buf);
    return file;
  }
  // giọng neural Microsoft Edge (tự nhiên hơn Google), đệm mp3 theo câu + giọng + tốc độ/cao độ
  async edge(text, o = {}) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    if (!text) throw new Error('Câu đọc trống');
    const voice = o.voice || 'vi-VN-HoaiMyNeural';
    const rate = Math.round(((o.rate || 1) - 1) * 100), pitch = Math.round(o.pitch || 0);
    const key = crypto.createHash('sha1').update(['edge', voice, rate, pitch, text].join('|')).digest('hex').slice(0, 20);
    const file = path.join(this.dir, key + '.mp3');
    if (fs.existsSync(file) && fs.statSync(file).size > 500) return file;
    const WS = this.getWS && this.getWS();
    if (!WS) throw new Error('thiếu thư viện ws');
    const buf = await edgeSynth(WS, text, { voice, rate, pitch });
    if (buf.length < 500) throw new Error('Edge TTS trả về dữ liệu rỗng');
    fs.writeFileSync(file, buf);
    return file;
  }
}
module.exports = { TTS, EDGE_VOICES: VOICES };
