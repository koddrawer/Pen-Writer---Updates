// Popup trên màn hiển thị: "Danh sách chờ" và "Kênh chat" – nền mờ, có avatar, kéo thả đổi vị trí / kéo góc đổi kích thước.
// Vị trí + kích thước lưu theo tỉ lệ khung hình (display.overlays.<loại>.{x,y,w,h}), nên đúng cả khi xoay khung 90°.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NAME_COLORS = ['#ffd27a', '#9fd8ff', '#ffb3c7', '#b9f1a8', '#d7b8ff', '#ffc89a', '#8ff0e0'];
const colorOf = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return NAME_COLORS[h % NAME_COLORS.length]; };

const CSS = `
.pw-ov{position:absolute;z-index:20;box-sizing:border-box;border-radius:calc(var(--u)*12px);overflow:hidden;display:flex;flex-direction:column;
  color:#f6ecd8;font:500 calc(var(--u)*13px*var(--fs))/1.3 "Segoe UI",system-ui,sans-serif;text-shadow:0 1px 2px rgba(0,0,0,.6);
  border:1px solid rgba(255,220,160,.18);box-shadow:0 calc(var(--u)*6px) calc(var(--u)*20px) rgba(0,0,0,.35);touch-action:none;user-select:none}
.pw-ov.locked{pointer-events:none}
.pw-ov:not(.locked){outline:calc(var(--u)*2px) dashed rgba(255,210,122,.75);outline-offset:calc(var(--u)*-2px);cursor:move}
.pw-ov h4{margin:0;padding:calc(var(--u)*7px) calc(var(--u)*10px) calc(var(--u)*5px);font-size:calc(var(--u)*12px*var(--fs));letter-spacing:.12em;text-transform:uppercase;
  color:#ffd27a;font-weight:700;display:flex;justify-content:space-between;gap:6px;flex:none;border-bottom:1px solid rgba(255,220,160,.12)}
.pw-ov h4 small{color:#d9c7a4;letter-spacing:0;font-weight:500;text-transform:none}
.pw-ov .body{flex:1;overflow:hidden;padding:calc(var(--u)*4px) calc(var(--u)*8px);display:flex;flex-direction:column;gap:calc(var(--u)*4px)}
.pw-ov.chat .body{justify-content:flex-end}
.pw-ov .row{display:flex;align-items:center;gap:calc(var(--u)*7px);min-width:0;flex:none;animation:pwIn .35s ease-out}
.pw-ov.chat .row{align-items:flex-start}
@keyframes pwIn{from{opacity:0;transform:translateY(calc(var(--u)*6px))}to{opacity:1;transform:none}}
.pw-ov .av{width:calc(var(--u)*26px*var(--fs));height:calc(var(--u)*26px*var(--fs));border-radius:50%;flex:none;background:#3a2c1c center/cover no-repeat;border:1px solid rgba(255,220,160,.35);
  display:grid;place-items:center;font-size:calc(var(--u)*11px*var(--fs));font-weight:700;color:#ffd27a}
.pw-ov .tx{min-width:0;flex:1}
.pw-ov .nm{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.pw-ov .sub{opacity:.85;font-size:.86em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.pw-ov.chat .msg{word-break:break-word;opacity:.95}
.pw-ov.chat .nm{display:inline;margin-right:.35em}
.pw-ov .tag{flex:none;font-size:.8em;padding:0 .45em;border-radius:99px;background:rgba(255,210,122,.18);color:#ffd27a;white-space:nowrap}
.pw-ov .row.cur .tag{background:#ffd27a;color:#2a1c0c}
.pw-ov .row.gift .msg{color:#ffd27a}
.pw-ov .row.join .msg{opacity:.7;font-style:italic}
.pw-ov .empty{opacity:.6;font-style:italic;text-align:center;margin:auto}
.pw-ov .grip{position:absolute;right:0;bottom:0;width:calc(var(--u)*26px);height:calc(var(--u)*26px);cursor:nwse-resize;
  background:linear-gradient(135deg,transparent 50%,rgba(255,210,122,.85) 50%,rgba(255,210,122,.85) 58%,transparent 58%,transparent 70%,rgba(255,210,122,.85) 70%,rgba(255,210,122,.85) 78%,transparent 78%)}
.pw-ov.locked .grip{display:none}
`;

export class Overlays {
  constructor(api, getCfg, stage) {
    Object.assign(this, { api, cfg: getCfg, stage });
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.el = {}; this.av = new Map(); this.queue = null; this.chat = [];
    for (const k of ['queue', 'chat']) this.el[k] = this.make(k);
    api.on('queue', (s) => { this.queue = s; this.renderQueue(); });
    api.on('chat:msg', (m) => { this.chat.push(m); if (this.chat.length > 80) this.chat.shift(); this.renderChat(); });
    api.invoke('queue:get').then(s => { this.queue = s; this.renderQueue(); }).catch(() => { });
    new ResizeObserver(() => this.unit()).observe(stage);
    this.apply();
  }
  o(k) { return ((this.cfg().display || {}).overlays || {})[k] || {}; }
  locked() { return !!((this.cfg().display || {}).overlays || {}).locked; }
  unit() { this.stage.style.setProperty('--u', (this.stage.clientWidth / 540).toFixed(4)); }
  make(k) {
    const d = document.createElement('div'); d.className = 'pw-ov ' + k;
    d.innerHTML = `<h4><span>${k === 'queue' ? 'Danh sách chờ' : 'Kênh chat'}</span><small></small></h4><div class="body"></div><div class="grip"></div>`;
    this.stage.appendChild(d);
    // kéo thả: toạ độ màn hình -> toạ độ khung (khung có thể đang xoay 90°)
    const toStage = (dx, dy) => {
      const m = new DOMMatrix(getComputedStyle(this.stage).transform === 'none' ? undefined : getComputedStyle(this.stage).transform).inverse();
      return { x: m.a * dx + m.c * dy, y: m.b * dx + m.d * dy };
    };
    let drag = null;
    const down = (e, mode) => {
      if (this.locked()) return;
      e.preventDefault(); e.stopPropagation();
      const o = this.o(k); drag = { mode, sx: e.clientX, sy: e.clientY, o: { x: o.x, y: o.y, w: o.w, h: o.h } };
      d.setPointerCapture(e.pointerId);
    };
    d.addEventListener('pointerdown', (e) => down(e, e.target.classList.contains('grip') ? 'size' : 'move'));
    d.addEventListener('pointermove', (e) => {
      if (!drag) return; e.stopPropagation();
      const v = toStage(e.clientX - drag.sx, e.clientY - drag.sy);
      const W = this.stage.clientWidth, H = this.stage.clientHeight; const o = drag.o; const n = { ...o };
      if (drag.mode === 'move') { n.x = Math.min(1 - o.w, Math.max(0, o.x + v.x / W)); n.y = Math.min(1 - o.h, Math.max(0, o.y + v.y / H)); }
      else { n.w = Math.min(1 - o.x, Math.max(0.15, o.w + v.x / W)); n.h = Math.min(1 - o.y, Math.max(0.08, o.h + v.y / H)); }
      drag.n = n; this.place(d, n);
    });
    const up = (e) => {
      if (!drag) return; e.stopPropagation();
      const n = drag.n; drag = null;
      if (n) { const r = (v) => Math.round(v * 1000) / 1000; this.api.setConfig({ display: { overlays: { [k]: { x: r(n.x), y: r(n.y), w: r(n.w), h: r(n.h) } } } }); }
    };
    d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    return d;
  }
  place(d, o) {
    d.style.left = (o.x ?? 0.04) * 100 + '%'; d.style.top = (o.y ?? 0.05) * 100 + '%';
    d.style.width = (o.w ?? 0.4) * 100 + '%'; d.style.height = (o.h ?? 0.3) * 100 + '%';
  }
  // gọi khi cấu hình đổi
  apply() {
    this.unit();
    for (const k of ['queue', 'chat']) {
      const d = this.el[k], o = this.o(k);
      d.style.display = o.enabled ? 'flex' : 'none';
      d.classList.toggle('locked', this.locked());
      this.place(d, o);
      const a = Math.max(0, Math.min(1, o.bg ?? 0.45));
      d.style.background = `rgba(${o.tint || '18,12,7'},${a})`;
      const bl = Math.max(0, o.blur ?? 8);
      d.style.backdropFilter = d.style.webkitBackdropFilter = bl ? `blur(${bl}px)` : 'none';
      d.style.setProperty('--fs', String(o.font ?? 1));
    }
    this.renderQueue(); this.renderChat();
  }
  avatar(url, name) {
    const ini = esc((String(name || '?').trim()[0] || '?').toUpperCase());
    if (!url) return `<span class="av">${ini}</span>`;
    let v = this.av.get(url);
    if (v === undefined) {
      this.av.set(url, null);
      const p = /^https?:/.test(url) ? this.api.invoke('avatar:get', url) : Promise.resolve(this.api.mediaUrl(url));
      p.then(u => { this.av.set(url, u || ''); if (this.av.size > 600) this.av.delete(this.av.keys().next().value); this.renderQueue(); this.renderChat(); }).catch(() => this.av.set(url, ''));
      v = null;
    }
    return v ? `<span class="av" style="background-image:url('${esc(v)}')"></span>` : `<span class="av">${ini}</span>`;
  }
  renderQueue() {
    const d = this.el.queue, o = this.o('queue'); if (!o.enabled) return;
    const s = this.queue || { donors: [], names: [] };
    const rows = [];
    const cur = s.current;
    if (cur) rows.push({ j: cur, cur: true });
    for (const j of s.donors || []) rows.push({ j });
    if (o.showViewers !== false) for (const j of s.names || []) rows.push({ j });
    const total = (s.donors || []).length + (o.showViewers !== false ? (s.names || []).length : 0);
    d.querySelector('h4 small').textContent = total ? `${total} người` : '';
    const max = Math.max(1, o.rows ?? 8);
    const html = rows.slice(0, max).map(({ j, cur }) => {
      const sub = j.type === 'donor' ? `${esc(j.gift || 'Quà')} x${j.count || 1}${j.total ? ` · ${j.total} xu` : ''}` : j.type === 'quote' ? 'Câu quote' : ({ join: 'vừa vào phòng', chat: 'đã bình luận', follow: 'đã theo dõi', share: 'đã chia sẻ', like: 'đã thả tim' }[j.source] || 'người xem');
      return `<div class="row${cur ? ' cur' : ''}">${this.avatar(j.avatar, j.name)}<span class="tx"><span class="nm" style="color:${colorOf(j.key || j.name)}">${esc(j.name)}</span><span class="sub">${sub}</span></span>${cur ? '<span class="tag">✒ đang viết</span>' : j.type === 'donor' ? '<span class="tag">🎁</span>' : ''}</div>`;
    }).join('');
    d.querySelector('.body').innerHTML = html || '<div class="empty">Chưa có ai trong danh sách</div>';
  }
  renderChat() {
    const d = this.el.chat, o = this.o('chat'); if (!o.enabled) return;
    const list = this.chat.filter(m => m.type === 'chat' || (m.type === 'gift' && o.gifts !== false) || (m.type === 'join' && o.joins));
    const html = list.slice(-Math.max(1, o.rows ?? 30)).map(m => {
      const msg = m.type === 'gift' ? `🎁 tặng ${esc(m.gift || 'quà')} x${m.count || 1}` : m.type === 'join' ? 'đã vào phòng' : esc(m.text);
      return `<div class="row ${m.type}">${this.avatar(m.avatar, m.name)}<span class="tx"><span class="nm" style="color:${colorOf(m.id || m.name)}">${esc(m.name)}</span><span class="msg">${msg}</span></span></div>`;
    }).join('');
    d.querySelector('.body').innerHTML = html || '<div class="empty">Chưa có bình luận</div>';
  }
}
