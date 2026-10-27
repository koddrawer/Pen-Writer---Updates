// Hàng đợi viết: người tặng quà ưu tiên trước, rồi tới tên người xem, khi vắng thì viết câu quote.
class JobQueue {
  constructor(getCfg, onChange) {
    this.cfg = getCfg; this.onChange = onChange;
    this.donors = []; this.names = []; this.seen = new Map(); this.current = null; this.paused = false; this.nextId = 1;
    this.lastActivity = Date.now(); this.lastQuoteEnd = 0; this.lastJobEnd = 0; this.recentQuotes = []; this.quoteIdx = -1;
    this.stats = { written: 0, coins: 0, dropped: 0, sheets: 0, names: 0, quotes: 0 };
  }
  label(u, mode) {
    const nick = (u.nickname || '').trim(), id = (u.uniqueId || '').trim();
    return mode === 'uniqueId' ? (id || nick) : (nick || id);
  }
  activity() { this.lastActivity = Date.now(); }

  // ---- tên người xem (vào phòng / bình luận / thả tim / theo dõi / chia sẻ)
  addName(u, source, force) {
    const c = this.cfg().viewers || {};
    if (!force && (!c.enabled || !(c.sources || {})[source])) return;
    const key = (u.uniqueId || u.nickname || '').toLowerCase(); if (!key) return;
    const now = Date.now(); const last = this.seen.get(key);
    if (!force && last && now - last < (c.dedupeMin ?? 30) * 60000) return;
    if (this.names.some(j => j.key === key)) return;
    if (this.donors.some(j => j.key === key)) return;               // đang chờ viết dòng donate rồi
    this.seen.set(key, now);
    if (this.seen.size > 5000) [...this.seen.entries()].sort((a, b) => a[1] - b[1]).slice(0, 1000).forEach(([k]) => this.seen.delete(k));
    const name = [...this.label(u, c.display || 'nickname')].slice(0, c.maxChars || 18).join('');
    this.names.push({ id: this.nextId++, type: 'name', key, name, alt: u.uniqueId, source, t: now });
    while (this.names.length > (c.maxQueue || 40)) { this.names.shift(); this.stats.dropped++; }   // bỏ người cũ, giữ người mới
    this.onChange();
  }

  addDonor(g, force) {
    const c = this.cfg().writer;
    const total = (g.diamonds || 0) * (g.count || 1);
    if (!force && total < (c.minDiamonds ?? 1)) return;
    const key = (g.user.uniqueId || g.user.nickname || '').toLowerCase();
    const now = Date.now(); this.activity();
    const ex = this.donors.find(j => j.key === key && now - j.t < (c.mergeSec ?? 5) * 1000);
    if (ex) {
      if (ex.gift === g.gift) ex.count += g.count || 1; else { ex.gift = g.gift; ex.count = g.count || 1; }
      ex.diamonds = Math.max(ex.diamonds, g.diamonds || 0); ex.total += total; ex.t = now; this.onChange(); return;
    }
    this.donors.push({ id: this.nextId++, type: 'donor', key, name: this.label(g.user, c.display), alt: g.user.uniqueId,
      gift: g.gift, count: g.count || 1, diamonds: g.diamonds || 0, total, t: now, test: !!force });
    while (this.donors.length > (c.maxQueue || 60)) { this.donors.shift(); this.stats.dropped++; }
    this.names = this.names.filter(j => j.key !== key);             // người tặng không cần viết tên nhỏ nữa
    this.onChange();
  }
  next() {
    if (this.current && Date.now() - this.current.startedAt > 180000) this.current = null;   // an toàn
    if (this.paused || this.current) return null;
    const wait = Math.min(2500, (this.cfg().writer.mergeSec ?? 5) * 1000 * 0.4);
    let j = null;
    const i = this.donors.findIndex(d => Date.now() - d.t >= wait);
    if (i >= 0) j = this.donors.splice(i, 1)[0];
    else if (!this.donors.length) j = this.names.shift() || this.makeQuote(false);
    if (!j) return null;
    j.startedAt = Date.now(); this.current = j; this.onChange();
    return j;
  }
  // khi vắng: viết câu quote (tiếng Việt / tiếng Anh)
  makeQuote(force) {
    const q = this.cfg().quotes || {}; const now = Date.now();
    if (!force) {
      if (!q.enabled) return null;
      if (now - this.lastActivity < (q.afterSec ?? 20) * 1000) return null;
      if (now - this.lastJobEnd < (q.afterJobSec ?? 6) * 1000) return null;
      if (now - this.lastQuoteEnd < (q.gapSec ?? 15) * 1000) return null;
    }
    const lang = q.language || 'both';
    const list = [...(lang !== 'en' ? (q.list || []).map(x => [x, 'vi']) : []), ...(lang !== 'vi' ? (q.listEn || []).map(x => [x, 'en']) : [])]
      .map(([x, l]) => [String(x).trim(), l]).filter(([x]) => x);
    if (!list.length) return null;
    let i;
    if (q.random !== false) {
      // xen kẽ Việt – Anh khi chọn cả hai
      let pool = list.map((_, k) => k).filter(k => !this.recentQuotes.includes(k));
      if (lang === 'both' && this.lastLang) { const other = pool.filter(k => list[k][1] !== this.lastLang); if (other.length) pool = other; }
      if (!pool.length) pool = list.map((_, k) => k);
      i = pool[Math.floor(Math.random() * pool.length)];
    } else { this.quoteIdx = (this.quoteIdx + 1) % list.length; i = this.quoteIdx; }
    this.recentQuotes.push(i); while (this.recentQuotes.length > Math.min(12, Math.floor(list.length / 2))) this.recentQuotes.shift();
    this.lastLang = list[i][1];
    const parts = list[i][0].split(/\s+[—–]\s+|\s+-\s+(?=[^-]*$)/);
    const text = parts[0].trim(), author = (parts[1] || '').trim();
    return { id: this.nextId++, type: 'quote', name: '“' + text.slice(0, 28) + (text.length > 28 ? '…”' : '”'), text, author, lang: list[i][1], t: now };
  }
  forceQuote() { if (this.current) return false; this.lastActivity = 0; this.lastQuoteEnd = 0; this.lastJobEnd = 0; this.onChange(); return true; }
  done(j) {
    if (this.current && (!j || this.current.id === j.id)) {
      const t = this.current.type;
      if (t === 'quote') this.lastQuoteEnd = Date.now(); else this.lastJobEnd = Date.now();
      if (j && !j.skipped) {
        if (t === 'donor') { this.stats.written++; this.stats.coins += this.current.total || 0; }
        else if (t === 'name') this.stats.names++; else if (t === 'quote') this.stats.quotes++;
      }
      this.current = null; this.onChange();
    }
  }
  sheet() { this.stats.sheets++; this.onChange(); }
  requeueCurrent() { const j = this.current; if (!j) return; this.current = null; if (j.type === 'donor') this.donors.unshift(j); else if (j.type === 'name') this.names.unshift(j); this.onChange(); }
  remove(id) { this.donors = this.donors.filter(j => j.id !== id); this.names = this.names.filter(j => j.id !== id); this.onChange(); }
  clear(which) { if (!which || which === 'donors') this.donors = []; if (!which || which === 'names') this.names = []; this.onChange(); }
  setPaused(v) { this.paused = !!v; this.onChange(); }
  snapshot() { return { donors: this.donors, names: this.names, current: this.current, paused: this.paused, stats: this.stats }; }
}
module.exports = { JobQueue };
