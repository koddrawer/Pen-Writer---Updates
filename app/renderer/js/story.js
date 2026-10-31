// Kể truyện audio: phát lần lượt các file truyện người dùng thêm vào, nhớ vị trí đang nghe,
// tạm dừng (hoặc nhỏ lại) khi có voice cảm ơn/chào rồi kể tiếp; nhạc nền tự nhỏ lại khi đang kể.
const POS_KEY = 'pw-story-pos';
const readPos = () => { try { return JSON.parse(localStorage.getItem(POS_KEY) || '{}'); } catch { return {}; } };
const writePos = (o) => { try { localStorage.setItem(POS_KEY, JSON.stringify(o)); } catch { } };

export class Story {
  constructor(api, getCfg) {
    Object.assign(this, { api, cfg: getCfg });
    this.a = new Audio(); this.a.preload = 'auto';
    this.file = null; this.userPaused = false; this.hold = 0; this.vol = 0; this.gapT = null; this.err = 0;
    this.pos = readPos();          // { file: giây đã nghe }, { __last: file đang nghe dở }
    this.a.addEventListener('ended', () => { delete this.pos[this.file]; this.savePos(); this.afterEnd(); });
    this.a.addEventListener('error', () => { if (!this.a.src) return; this.err++; if (this.err < 5) setTimeout(() => this.next(), 1200); });
    this.a.addEventListener('playing', () => { this.err = 0; });
    api.on('story:cmd', ({ cmd, arg }) => {
      if (cmd === 'play') { this.userPaused = false; if (this.file && this.a.src) this.resume(); else this.start(); }
      else if (cmd === 'pause') { this.userPaused = true; this.a.pause(); if (this.file) { this.pos[this.file] = Math.floor(this.a.currentTime); this.savePos(); } }
      else if (cmd === 'next') { this.userPaused = false; this.next(); }
      else if (cmd === 'prev') { this.userPaused = false; this.prev(); }
      else if (cmd === 'restart') { this.userPaused = false; if (this.file) { this.a.currentTime = 0; this.resume(); } }
      else if (cmd === 'seek') { if (this.file && isFinite(this.a.duration)) this.a.currentTime = Math.max(0, Math.min(this.a.duration - 1, this.a.currentTime + (+arg || 0))); }
      else if (cmd === 'track') { this.userPaused = false; this.load(arg, true); }
      this.report();
    });
    this.last = performance.now();
    setInterval(() => this.tick(), 50);
    setInterval(() => { if (this.file && !this.a.paused) { this.pos[this.file] = Math.floor(this.a.currentTime); this.pos.__last = this.file; this.savePos(); } this.report(); }, 1000);
    setTimeout(() => this.sync(), 1500);
  }
  c() { return this.cfg().story || {}; }
  files() { return (this.c().files || []).slice(); }
  playing() { return !!this.file && !this.a.paused; }
  active() { return !!this.file && !this.userPaused && !!this.c().enabled; }   // đang kể (kể cả lúc tạm nhường voice)
  savePos() { const keep = new Set(this.files()); for (const k of Object.keys(this.pos)) if (k !== '__last' && !keep.has(k)) delete this.pos[k]; writePos(this.pos); }
  // gọi khi cấu hình đổi
  sync() {
    const s = this.c(); const list = this.files();
    if (!s.enabled || !list.length) { this.a.pause(); clearTimeout(this.gapT); if (this.file && !list.includes(this.file)) { this.file = null; this.a.removeAttribute('src'); } this.report(); return; }
    if (this.file && !list.includes(this.file)) { this.next(); return; }
    if (!this.file && !this.userPaused && s.autoPlay !== false) this.start();
    else if (this.file && !this.userPaused && this.a.paused && !this.hold && !this.gapT) this.resume();
  }
  start() {
    const list = this.files(); if (!list.length) return;
    const last = this.pos.__last && list.includes(this.pos.__last) ? this.pos.__last : null;
    this.load(last || (this.c().order === 'shuffle' ? list[Math.floor(Math.random() * list.length)] : list[0]), false);
  }
  pickNext() {
    const list = this.files(); if (!list.length) return null;
    if (this.c().order === 'shuffle' && list.length > 1) { let f; do f = list[Math.floor(Math.random() * list.length)]; while (f === this.file); return f; }
    const i = list.indexOf(this.file);
    if (i === list.length - 1 && this.c().loop === false) return null;
    return list[(i + 1) % list.length];
  }
  afterEnd() {
    const f = this.pickNext();
    if (!f) { this.file = null; this.pos.__last = null; this.savePos(); this.report(); return; }
    clearTimeout(this.gapT);
    this.gapT = setTimeout(() => { this.gapT = null; this.load(f, true); }, Math.max(0, this.c().gapSec ?? 3) * 1000);
    this.report();
  }
  next() { clearTimeout(this.gapT); this.gapT = null; if (this.file) { delete this.pos[this.file]; } const f = this.pickNext() || this.files()[0]; if (f) this.load(f, true); }
  prev() {
    clearTimeout(this.gapT); this.gapT = null;
    if (this.file && this.a.currentTime > 5) { this.a.currentTime = 0; return this.resume(); }
    const list = this.files(); const i = list.indexOf(this.file); const f = list[(i - 1 + list.length) % list.length]; if (f) this.load(f, true);
  }
  load(f, fromStart) {
    if (!f) return;
    clearTimeout(this.gapT); this.gapT = null;
    this.file = f; this.pos.__last = f; this.savePos();
    const a = this.a; a.pause(); a.src = this.api.mediaUrl(f);
    const at = fromStart ? 0 : (this.pos[f] || 0);
    const seek = () => { try { if (at > 0 && isFinite(a.duration) && at < a.duration - 2) a.currentTime = Math.max(0, at - 2); } catch { } };
    a.addEventListener('loadedmetadata', seek, { once: true });
    if (fromStart) delete this.pos[f];
    this.resume();
  }
  resume() {
    if (!this.file || this.userPaused || !this.c().enabled) return;
    if (this.hold && (this.c().onVoice || 'pause') === 'pause') return;     // đang nhường voice cảm ơn/chào
    this.a.play().catch(() => { });
    this.report();
  }
  // voice cảm ơn/chào bắt đầu (true) / xong (false)
  holdFor(on) {
    this.hold = Math.max(0, this.hold + (on ? 1 : -1));
    if ((this.c().onVoice || 'pause') !== 'pause' || !this.file) return;
    if (this.hold && !this.a.paused) { this.a.pause(); this.heldAt = this.a.currentTime; }
    else if (!this.hold && this.heldAt != null) {
      // lùi lại 1 giây cho người nghe nối mạch truyện
      try { this.a.currentTime = Math.max(0, this.heldAt - 1); } catch { }
      this.heldAt = null;
      setTimeout(() => this.resume(), 350);
    }
  }
  tick() {
    const now = performance.now(); const dt = Math.min(1, (now - this.last) / 1000); this.last = now;
    const s = this.c(); let tgt = Math.max(0, Math.min(1, s.volume ?? 1));
    if (this.hold && s.onVoice === 'duck') tgt *= (s.duckPct ?? 25) / 100;
    this.vol += (tgt - this.vol) * (1 - Math.exp(-dt * 5));
    this.a.volume = Math.max(0, Math.min(1, this.vol));
  }
  report() {
    const a = this.a;
    this.api.send('story:status', { file: this.file, playing: this.playing(), userPaused: this.userPaused, waiting: !!this.gapT, holding: !!this.hold && !!this.file,
      t: Math.floor(a.currentTime || 0), dur: Math.floor(isFinite(a.duration) ? a.duration : 0), enabled: !!this.c().enabled });
  }
}
