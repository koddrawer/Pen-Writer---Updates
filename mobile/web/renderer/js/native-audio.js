// Phần thay thế <audio> trên Android: cùng cách dùng (src, play, pause, volume, currentTime, duration, sự kiện ended/playing/error…)
// nhưng phát bằng MediaPlayer của Android (plugin NativeAudio) để TikTok live chia sẻ màn hình thu được tiếng.
(() => {
  const C = window.Capacitor || {};
  if (!C.isPluginAvailable || !C.isPluginAvailable('NativeAudio')) return;   // APK cũ chưa có plugin -> dùng <audio> như cũ
  const N = (C.Plugins && C.Plugins.NativeAudio) || C.registerPlugin('NativeAudio');
  const all = new Map(); let seq = 0;
  N.addListener('audio', (e) => { const a = all.get(e.id); if (a) a._ev(e); });

  class NativeAudio {
    constructor() {
      this.id = 'a' + (++seq); all.set(this.id, this);
      this._src = ''; this._vol = 1; this._rate = 1; this._dur = NaN; this._pos = 0; this._t0 = 0;
      this.paused = true; this.preload = 'auto'; this._ls = {}; this.onended = null; this.onerror = null; this._playP = null;
    }
    get src() { return this._src; }
    set src(u) {
      this._src = String(u || ''); this._dur = NaN; this._pos = 0; this.paused = true; this._failPlay(new Error('src đổi'));
      N.src({ id: this.id, url: this._src }).catch(() => { });
    }
    removeAttribute(k) { if (k === 'src') this.src = ''; }
    load() { }
    get volume() { return this._vol; }
    set volume(v) {
      v = Math.max(0, Math.min(1, +v || 0));
      if (Math.abs(v - this._vol) < 0.004 && !(v === 0 && this._vol !== 0)) return;   // đỡ gọi native liên tục khi nhạc fade
      this._vol = v; N.volume({ id: this.id, v }).catch(() => { });
    }
    get playbackRate() { return this._rate; }
    set playbackRate(r) { r = +r || 1; if (r === this._rate) return; this._sync(); this._rate = r; N.rate({ id: this.id, r }).catch(() => { }); }
    get duration() { return this._dur; }
    get currentTime() { return this.paused ? this._pos : this._pos + (performance.now() - this._t0) / 1000 * this._rate; }
    set currentTime(t) { t = Math.max(0, +t || 0); this._pos = t; this._t0 = performance.now(); N.seek({ id: this.id, t }).catch(() => { }); }
    _sync() { this._pos = this.currentTime; this._t0 = performance.now(); }
    play() {
      if (!this._src) return Promise.reject(new Error('Chưa có nguồn âm thanh'));
      if (!this.paused && !this._playP) return Promise.resolve();
      const p = this._playP || (this._playP = new Promise((res, rej) => { this._res = res; this._rej = rej; }));
      N.play({ id: this.id }).catch((e) => this._failPlay(e));
      return p;
    }
    pause() { this._sync(); this.paused = true; this._failPlay(new Error('pause')); N.pause({ id: this.id }).catch(() => { }); }
    _failPlay(e) { if (this._playP) { const r = this._rej; this._playP = null; this._res = this._rej = null; r && r(e); } }
    _ev(e) {
      if (e.type === 'loadedmetadata') { this._dur = e.dur > 0 ? e.dur : NaN; }
      if (e.type === 'playing') { this.paused = false; this._pos = e.t || 0; this._t0 = performance.now(); if (this._playP) { const r = this._res; this._playP = null; this._res = this._rej = null; r && r(); } }
      if (e.type === 'time') { this._pos = e.t; this._t0 = performance.now(); }
      if (e.type === 'pause') { this.paused = true; if (e.t != null) this._pos = e.t; }
      if (e.type === 'ended') { this.paused = true; this._pos = isFinite(this._dur) ? this._dur : this._pos; }
      if (e.type === 'error') { this.paused = true; this._failPlay(new Error('Không phát được âm thanh')); }
      const h = this['on' + e.type]; if (typeof h === 'function') { try { h.call(this, { type: e.type }); } catch (err) { console.error(err); } }
      for (const l of (this._ls[e.type] || []).slice()) {
        if (l.once) this._ls[e.type] = this._ls[e.type].filter(x => x !== l);
        try { l.fn.call(this, { type: e.type }); } catch (err) { console.error(err); }
      }
    }
    addEventListener(type, fn, opts) { (this._ls[type] = this._ls[type] || []).push({ fn, once: !!(opts && opts.once) }); }
    removeEventListener(type, fn) { this._ls[type] = (this._ls[type] || []).filter(l => l.fn !== fn); }
  }
  window.__nativeAudio = true;
  window.__createAudio = () => new NativeAudio();
})();
