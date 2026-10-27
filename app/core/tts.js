// Giọng đọc cảm ơn qua Google Translate TTS (cần mạng). Có bộ nhớ đệm file mp3 trong userData/tts.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class TTS {
  constructor(dir, fetch) { this.dir = dir; this.fetch = fetch; fs.mkdirSync(dir, { recursive: true }); this.clean(); }
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
}
module.exports = { TTS };
