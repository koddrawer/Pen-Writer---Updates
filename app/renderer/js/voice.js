// Voice cảm ơn: file ghi âm theo mức donate và/hoặc đọc câu cảm ơn (Google TTS hoặc giọng Windows). Tự giảm nhạc nền khi đọc.
export class Voice {
  constructor(api, getCfg, music) {
    this.api = api; this.cfg = getCfg; this.music = music;
    this.a = new Audio(); this.a.preload = 'auto';
    this.q = []; this.busy = false;
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
  async pump() {
    if (this.busy || !this.q.length) return;
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
    if ((v.engine || 'google') === 'google') {
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
