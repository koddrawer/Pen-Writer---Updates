// Voice cảm ơn: file ghi âm theo mức donate và/hoặc đọc câu cảm ơn (Google TTS hoặc giọng Windows). Tự giảm nhạc nền khi đọc.
export class Voice {
  constructor(api, getCfg, music) {
    this.api = api; this.cfg = getCfg; this.music = music;
    this.a = new Audio(); this.a.preload = 'auto';
    this.q = []; this.busy = false;
    this.gq = []; this.greeted = new Map(); this.lastGreet = 0;
    const sendVoices = () => {
      const vs = (window.speechSynthesis ? speechSynthesis.getVoices() : []).map(v => ({ name: v.name, lang: v.lang }));
      api.send('display:status', { voices: vs });
    };
    if (window.speechSynthesis) { speechSynthesis.onvoiceschanged = sendVoices; setTimeout(sendVoices, 800); }
  }
  text(job, tier) {
    const v = this.cfg().voice || {};
    const name = String(job.written || job.name || '').replace(/[^\p{L}\p{N}\s._-]/gu, '').trim() || 'bạn';
    const t = (tier && tier.ttsText) || v.text || 'Cảm ơn {name}';
    return t.replace(/\{name\}/g, name).replace(/\{gift\}/g, job.gift || 'quà').replace(/\{count\}/g, job.count || 1)
      .replace(/\{coins\}/g, job.total || 0).replace(/\s+/g, ' ').trim();
  }
  say(job, tier, force) {
    const v = this.cfg().voice || {};
    if (!force && (!v.enabled || (job.total || 0) < (v.minDiamonds ?? 1))) return;
    if (this.q.length >= 4) this.q.shift();
    this.q.push({ job, tier });
    this.pump();
  }
  // lời chào người mới vào phòng: hàng chờ riêng, ưu tiên thấp hơn lời cảm ơn donate
  greet(u, force) {
    const v = this.cfg().voice || {}; const g = v.greet || {};
    if (!force && (!g.enabled || !v.enabled)) return;
    const name = String(u.name || '').replace(/[^\p{L}\p{N}\s._-]/gu, '').trim().slice(0, 24);
    if (!name) return;
    const key = u.id || name, now = Date.now();
    if (!force && now - (this.greeted.get(key) || 0) < (g.dedupeMin ?? 30) * 60000) return;
    this.greeted.set(key, now);
    if (this.greeted.size > 3000) this.greeted.clear();
    this.gq.push({ name, t: now });
    const max = Math.max(1, g.maxWait ?? 3);
    while (this.gq.length > max) this.gq.shift();     // phòng đông: bỏ người vào sớm, giữ người mới nhất
    this.pump();
  }
  greetText(name) {
    const g = (this.cfg().voice || {}).greet || {};
    const list = String(g.texts || 'Chào mừng {name} đã đến với phiên live').split('|').map(s => s.trim()).filter(Boolean);
    return list[Math.floor(Math.random() * list.length)].replace(/\{name\}/g, name);
  }
  async pump() {
    if (this.busy) return;
    if (!this.q.length) return this.pumpGreet();
    this.busy = true; const { job, tier } = this.q.shift();
    const v = this.cfg().voice || {};
    this.music && this.music.duck('voice');
    try {
      const files = (tier && tier.voiceFiles) || [];
      const mode = v.mode || 'tts';
      if ((mode === 'files' || mode === 'both') && files.length) await this.playFile(files[Math.floor(Math.random() * files.length)]);
      if (mode === 'tts' || mode === 'both' || (mode === 'files' && !files.length)) await this.speak(this.text(job, tier));
    } catch (e) { console.warn('voice lỗi', e); }
    this.music && this.music.duck(null);
    this.busy = false;
    setTimeout(() => this.pump(), 150);
  }
  async pumpGreet() {
    if (this.busy || !this.gq.length) return;
    const g = (this.cfg().voice || {}).greet || {};
    const wait = (g.gapSec ?? 4) * 1000 - (Date.now() - this.lastGreet);
    if (wait > 0) { clearTimeout(this.gT); this.gT = setTimeout(() => this.pump(), wait + 20); return; }
    const it = this.gq.shift();
    if (Date.now() - it.t > 20000) return this.pump();   // chờ quá lâu thì bỏ (người đó vào từ lâu rồi)
    this.busy = true;
    this.music && this.music.duck('voice');
    try { await this.speak(this.greetText(it.name)); } catch (e) { console.warn('voice chào lỗi', e); }
    this.music && this.music.duck(null);
    this.lastGreet = Date.now(); this.busy = false;
    setTimeout(() => this.pump(), 150);
  }
  playFile(file) {
    return new Promise((res) => {
      const a = this.a; const v = this.cfg().voice || {};
      a.src = /^(media|app|https?|data|blob):/.test(file) ? file : this.api.mediaUrl(file);
      a.volume = Math.max(0, Math.min(1, v.volume ?? 1)); a.playbackRate = 1;
      let to = setTimeout(res, 30000);
      const end = () => { clearTimeout(to); a.onended = a.onerror = null; res(); };
      a.onended = end; a.onerror = end;
      a.play().catch(end);
    });
  }
  async speak(text) {
    const v = this.cfg().voice || {};
    if (!text) return;
    const eng = v.engine || 'edge';
    if (eng === 'edge') {
      const r = await this.api.invoke('tts:edge', text, { voice: v.edgeVoice || 'vi-VN-HoaiMyNeural', rate: v.rate || 1, pitch: v.pitch || 0 });
      if (r && r.file) { this.a.playbackRate = 1; await this.playFile(r.file); return; }
    }
    if (eng === 'edge' || eng === 'google') {
      const r = await this.api.invoke('tts:google', text, v.lang || 'vi');
      if (r && r.file) {
        this.a.playbackRate = Math.max(0.5, Math.min(2, v.rate || 1));
        await this.playFile(r.file);
        return;
      }
    }
    await this.system(text);
  }
  system(text) {
    return new Promise((res) => {
      if (!window.speechSynthesis) return res();
      const v = this.cfg().voice || {};
      const u = new SpeechSynthesisUtterance(text);
      const all = speechSynthesis.getVoices();
      const pick = all.find(x => x.name === v.systemVoice) || all.find(x => (x.lang || '').toLowerCase().startsWith((v.lang || 'vi').toLowerCase()));
      if (pick) { u.voice = pick; u.lang = pick.lang; } else u.lang = v.lang || 'vi';
      u.rate = v.rate || 1; u.volume = Math.max(0, Math.min(1, v.volume ?? 1));
      const to = setTimeout(res, 20000);
      u.onend = u.onerror = () => { clearTimeout(to); res(); };
      speechSynthesis.speak(u);
    });
  }
}
