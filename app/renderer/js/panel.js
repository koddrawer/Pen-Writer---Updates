// Bảng điều khiển Pen Writer
import { ORNAMENTS, buildOrnament, ornamentPad, avatarFrame, FRAME_LEVELS, frameExtent } from './ornaments.js';
const api = window.api;
let cfg = await api.getConfig();
const $ = (s, r = document) => r.querySelector(s);
const h = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') e.className = v; else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const get = (p, o = cfg) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const mk = (p, v) => p.split('.').reverse().reduce((acc, k) => ({ [k]: acc }), v);
const setPath = (p, v) => api.setConfig(mk(p, v));
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2600); }
const fname = (p) => (p || '').split(/[\\/]/).pop();

// ---------- ô nhập liệu gắn với cấu hình. getter/setter tuỳ chỉnh để dùng cho mức donate
const binds = [];
function control(read, write, type, o = {}) {
  let input; const cur = read();
  if (type === 'bool') {
    const cb = h('input', { type: 'checkbox' }); cb.checked = !!cur; cb.onchange = () => write(cb.checked);
    input = h('label', { class: 'switch' }, cb, h('span')); binds.push(() => { cb.checked = !!read(); });
  } else if (type === 'select') {
    const opts = () => (typeof o.options === 'function' ? o.options() : o.options);
    const sel = h('select', {}, ...opts().map(([v, t]) => h('option', { value: v }, t)));
    sel.value = cur ?? ''; sel.onchange = () => write(o.num ? +sel.value : sel.value); input = sel;
    binds.push(() => { if (document.activeElement === sel) return; if (typeof o.options === 'function') sel.replaceChildren(...opts().map(([a, t]) => h('option', { value: a }, t))); sel.value = read() ?? ''; });
  } else if (type === 'range') {
    const r = h('input', { type: 'range', min: o.min ?? 0, max: o.max ?? 100, step: o.step ?? 1 }); r.value = cur ?? 0;
    const out = h('span', { class: 'unit', style: 'min-width:52px;text-align:right' }, `${cur ?? 0}${o.unit || ''}`);
    r.oninput = () => { out.textContent = r.value + (o.unit || ''); }; r.onchange = () => write(+r.value);
    input = h('div', { class: 'ctl' }, r, out);
    binds.push(() => { if (document.activeElement !== r) { r.value = read() ?? 0; out.textContent = (read() ?? 0) + (o.unit || ''); } });
  } else if (type === 'textarea' || type === 'lines') {
    const ta = h('textarea', { rows: o.rows || 2, placeholder: o.ph || '', style: 'resize:vertical;font-size:13px' });
    const val = () => { const v = read(); return type === 'lines' ? (v || []).join('\n') : (v ?? ''); };
    ta.value = val(); ta.onchange = () => write(type === 'lines' ? ta.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean) : ta.value);
    binds.push(() => { if (document.activeElement !== ta) ta.value = val(); }); input = ta;
  } else if (type === 'color') {
    const c = h('input', { type: 'color' }); c.value = cur || o.def || '#000000'; c.onchange = () => write(c.value);
    const clr = o.clearable ? h('button', { class: 'b sm', onclick: () => write('') }, 'Mặc định') : null;
    input = h('div', { class: 'ctl' }, c, clr); binds.push(() => { c.value = read() || o.def || '#000000'; });
  } else {
    const inp = h('input', { type: type === 'number' ? 'number' : 'text', min: o.min, max: o.max, step: o.step ?? 'any', placeholder: o.ph || '' });
    inp.value = cur ?? ''; inp.onchange = () => write(type === 'number' ? (inp.value === '' ? 0 : +inp.value) : inp.value);
    input = h('div', { class: 'ctl' }, inp, o.unit ? h('span', { class: 'unit' }, o.unit) : null);
    binds.push(() => { if (document.activeElement !== inp) inp.value = read() ?? ''; });
  }
  return input;
}
const row = (label, input, tip) => h('div', { class: 'row', title: tip || '' }, h('label', {}, label), input);
function field(path, label, type = 'number', o = {}) {
  const input = control(() => get(path), (v) => setPath(path, v), type, o);
  if ((type === 'textarea' || type === 'lines') && o.full) return h('div', { style: 'padding:5px 0' }, h('label', { class: 'hint', style: 'display:block;margin-bottom:4px' }, label), input);
  return row(label, input, o.tip);
}
const card = (title, ...kids) => h('div', { class: 'card' }, h('h3', {}, ...(Array.isArray(title) ? title : [title])), ...kids);
const note = (t) => h('p', { class: 'note' }, t);
const btn = (t, f, cls = '') => h('button', { class: 'b ' + cls, onclick: f }, t);
const fontOptions = (withDefault) => [...(withDefault ? [['', '— dùng font chung —']] : []), ...cfg.fonts.map(f => [f.id, f.name])];

function refreshFontFaces() {
  $('#fontfaces').textContent = cfg.fonts.map(f => {
    const srcs = f.builtin ? f.files.map(x => `url("../assets/fonts/${x}")`) : [`url("${api.mediaUrl(f.file)}")`];
    return srcs.map(s => `@font-face{font-family:"pw-${f.id}";src:${s};font-display:swap;}`).join('\n');
  }).join('\n');
}
const ff = (id) => `"pw-${id}", serif`;

// ================= TAB: Tổng quan
const live = {};
function renderHome() {
  const user = h('input', { type: 'text', placeholder: 'username TikTok (không cần @)' }); user.value = cfg.tiktok.username || '';
  user.onchange = () => setPath('tiktok.username', user.value.trim().replace(/^@/, ''));
  live.tikMsg = h('div', { class: 'hint' }, '—');
  live.kpi = h('div', { class: 'kpis' }); live.queue = h('div', { class: 'list' });
  live.log = h('div', { class: 'log' }); live.writing = h('div', { class: 'hint' }, '—');
  const paused = h('input', { type: 'checkbox' }); paused.onchange = () => api.invoke('queue:pause', paused.checked); live.pausedCb = paused;
  const gname = h('input', { type: 'text', placeholder: 'Tên người tặng' });
  const gift = h('input', { type: 'text', value: 'Rose' });
  const gcount = h('input', { type: 'number', value: 1, min: 1 }); const gcoin = h('input', { type: 'number', value: 1, min: 0 });
  const tierBtns = h('div', { class: 'btns' });
  const drawTierBtns = () => tierBtns.replaceChildren(...cfg.tiers.filter(t => t.enabled !== false).map(t =>
    btn(`${t.name} (${t.min} xu)`, () => api.invoke('test:gift', { name: gname.value.trim() || undefined, gift: gift.value || 'Rose', count: 1, diamonds: t.min }), 'sm')));
  drawTierBtns(); binds.push(drawTierBtns);
  $('#tab-home').replaceChildren(h('div', { class: 'grid' },
    card('Kết nối TikTok LIVE',
      row('Username', user),
      field('tiktok.autoConnect', 'Tự kết nối khi mở app', 'bool'),
      field('tiktok.autoReconnect', 'Tự kết nối lại khi rớt', 'bool'),
      field('tiktok.signApiKey', 'Euler API key (tuỳ chọn)', 'text', { ph: 'để trống nếu không có', tip: 'Khoá ký của eulerstream.com giúp kết nối ổn định hơn' }),
      h('div', { class: 'btns' }, btn('Kết nối', async () => { await setPath('tiktok.username', user.value.trim().replace(/^@/, '')); api.invoke('tiktok:connect', user.value); }, 'pri'),
        btn('Ngắt', () => api.invoke('tiktok:disconnect'), 'red')),
      live.tikMsg, note('Nhập username của tài khoản đang LIVE. App nhận quà tặng của phiên live và viết tên người tặng lên giấy.')),
    card('Trạng thái', live.kpi, live.writing,
      row('Tạm dừng bút', h('label', { class: 'switch' }, paused, h('span'))),
      h('div', { class: 'btns' }, btn('Thay tờ giấy mới', () => api.invoke('paper:new'), 'pri'), btn('Xoá trắng tờ hiện tại', () => api.invoke('paper:clear')),
        btn('Hiện màn hiển thị', () => api.invoke('win:show')), btn('Tải lại màn hiển thị', () => api.invoke('win:recreateDisplay')))),
    card(['Hàng chờ viết', h('small', {}, 'người tặng quà')], live.queue,
      h('div', { class: 'btns' }, btn('Xoá chờ donate', () => api.invoke('queue:clear', 'donors'), 'red sm'), btn('Xoá chờ tên người xem', () => api.invoke('queue:clear', 'names'), 'red sm'))),
    card(['Thử nghiệm', h('small', {}, 'không cần live')],
      row('Người tặng', gname), row('Quà × số lượng', h('div', { class: 'ctl' }, gift, gcount)), row('Giá 1 quà (xu)', gcoin),
      h('div', { class: 'btns' }, btn('Gửi quà thử', () => api.invoke('test:gift', { name: gname.value.trim() || undefined, gift: gift.value || 'Rose', count: +gcount.value || 1, diamonds: +gcoin.value }), 'pri'),
        btn('5 người liên tiếp', () => { for (let i = 0; i < 5; i++) setTimeout(() => api.invoke('test:gift', { diamonds: [1, 1, 5, 10, 30][i] }), i * 200); })),
      h('div', { class: 'hint', style: 'margin-top:8px' }, 'Thử từng mức:'), tierBtns),
    card('Nhật ký sự kiện', live.log)));
  api.invoke('log:get').then(l => l.forEach(addLog));
}
function addLog(e) {
  if (!live.log) return;
  const tm = new Date(e.t).toLocaleTimeString('vi-VN', { hour12: false });
  live.log.prepend(h('div', { class: e.kind }, `${tm}  ${e.text}`));
  while (live.log.childElementCount > 250) live.log.lastChild.remove();
}
function renderQueue(q) {
  if (!live.kpi || !q) return;
  const s = q.stats || {};
  live.kpi.style.gridTemplateColumns = 'repeat(5, 1fr)';
  live.kpi.replaceChildren(
    h('div', { class: 'kpi' }, h('small', {}, 'Đang chờ'), h('div', { class: 'big' }, q.donors.length)),
    h('div', { class: 'kpi' }, h('small', {}, 'Đã viết'), h('div', { class: 'big' }, s.written || 0)),
    h('div', { class: 'kpi' }, h('small', {}, 'Tên người xem'), h('div', { class: 'big' }, `${s.names || 0}${q.names && q.names.length ? ' (+' + q.names.length + ')' : ''}`)),
    h('div', { class: 'kpi' }, h('small', {}, 'Tổng xu'), h('div', { class: 'big' }, s.coins || 0)),
    h('div', { class: 'kpi' }, h('small', {}, 'Tờ đã thay'), h('div', { class: 'big' }, s.sheets || 0)));
  if (live.pausedCb) live.pausedCb.checked = !!q.paused;
  const items = [...(q.current ? [{ ...q.current, cur: true }] : []), ...q.donors, ...(q.names || []).slice(0, 30)];
  live.queue.replaceChildren(...(items.length ? items.map(j => h('div', { class: 'item qitem' },
    h('span', { class: 'grow' }, (j.cur ? '✒ ' : '') + j.name),
    j.type === 'donor' ? h('span', { class: 'coin' }, `${j.total} xu`) : null,
    h('span', { class: 'tag' }, j.type === 'donor' ? `${j.gift} x${j.count}` : j.type === 'quote' ? 'quote' : 'người xem'),
    j.cur ? null : btn('×', () => api.invoke('queue:remove', j.id), 'sm red'))) : [h('div', { class: 'hint' }, 'Trống')]));
}

// ================= TAB: Mức donate
function ornPreview(cv, t) {
  const c = cv.getContext('2d'); const W = cv.width = cv.clientWidth * 2 || 760, H = cv.height = 220;
  c.fillStyle = '#efe6d2'; c.fillRect(0, 0, W, H);
  const pad = ornamentPad(t.ornament || 'none');
  const cap = 1, text = 'Minh Anh';
  const fid = t.fontId || cfg.writer.fontId;
  // khung chữ ước lượng (đơn vị cap), sau đó co vừa canvas
  c.font = `100px ${ff(fid)}`; const tw = c.measureText(text).width / 100 * 1.3;
  const sub = t.sub ? 0.7 : 0;
  const box = { x0: -tw / 2, x1: tw / 2, top: -1.05, bot: 0.32 + sub, cx: 0, cap };
  const o = buildOrnament(t.ornament, box);
  const totW = tw + 2 * pad.s + 0.6, totH = 1.37 + sub + pad.t + pad.b + 0.4;
  const k = Math.min(W / totW, H / totH);
  const ox = W / 2, oy = H / 2 - ((box.bot + pad.b) - (box.top - pad.t)) / 2 * k - (box.top - pad.t) * k;
  const P = (p) => [ox + p[0] * k, oy + p[1] * k];
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = c.fillStyle = t.ornColor || t.color || cfg.writer.inkColor;
  for (const st of o.strokes) for (let i = 1; i < st.length; i++) { const a = P(st[i - 1]), b = P(st[i]); c.lineWidth = Math.max(1, (st[i][2] || 0.05) * k); c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); }
  for (const f of o.fills) { c.beginPath(); f.forEach((p, i) => { const q = P(p); i ? c.lineTo(...q) : c.moveTo(...q); }); c.fill(); }
  c.fillStyle = t.color || cfg.writer.inkColor; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.font = `${k * 1.3}px ${ff(fid)}`; c.fillText(text, ox, oy);
  if (t.sub) { c.fillStyle = t.ornColor || t.color || cfg.writer.inkColor; c.font = `${k * 0.42 * 1.3}px ${ff(fid)}`; c.fillText(t.sub.replace('{gift}', 'Rose').replace('{count}', '1').replace('{name}', text).replace('{coins}', t.min), ox, oy + k * 0.95); }
}
// xem trước khung avatar
function framePreview(cv, t) {
  const c = cv.getContext('2d'); const S = cv.width = cv.height = 220;
  c.fillStyle = '#efe6d2'; c.fillRect(0, 0, S, S);
  const lvl = t.avatarFrame ?? 0; const ext = frameExtent(lvl);
  const R = S * 0.92 / (2 * ext.r + ext.top) ; const cx = S / 2, cy = S / 2 + R * ext.top / 2;
  // mặt người giản lược
  c.fillStyle = '#d9cdb6'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#9b8c75'; c.beginPath(); c.arc(cx, cy - R * 0.2, R * 0.32, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(cx, cy + R * 0.75, R * 0.62, R * 0.45, 0, Math.PI, 0); c.fill();
  const o = avatarFrame(lvl, cx, cy, R); const col = t.ornColor || t.color || cfg.writer.inkColor;
  c.strokeStyle = c.fillStyle = col; c.lineCap = 'round';
  for (const st of o.strokes) for (let i = 1; i < st.length; i++) { c.lineWidth = Math.max(1, st[i][2] || R * 0.03); c.beginPath(); c.moveTo(st[i - 1][0], st[i - 1][1]); c.lineTo(st[i][0], st[i][1]); c.stroke(); }
  for (const f of o.fills) { c.beginPath(); f.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.fill(); }
}
function renderTiers() {
  const wrap = h('div', { class: 'tiers' });
  const draw = () => {
    wrap.replaceChildren(...cfg.tiers.map(t0 => {
      const id = t0.id; const T = () => cfg.tiers.find(x => x.id === id) || {};
      const tf = (key, label, type = 'number', o = {}) => {
        const input = control(() => T()[key], (v) => api.invoke('tier:set', id, { [key]: v }), type, o);
        if (o.full) return h('div', { style: 'padding:5px 0' }, h('label', { class: 'hint', style: 'display:block;margin-bottom:4px' }, label), input);
        return row(label, input, o.tip);
      };
      const nm = h('input', { type: 'text', value: t0.name }); nm.onchange = () => api.invoke('tier:set', id, { name: nm.value });
      const cv = h('canvas', { class: 'ornprev' });
      const fcv = h('canvas', { style: 'width:110px;height:110px;border-radius:8px;flex:none' });
      setTimeout(() => { ornPreview(cv, T()); framePreview(fcv, T()); }, 30);
      const voices = h('div', { class: 'list', style: 'max-height:120px' });
      const drawVoices = () => voices.replaceChildren(...((T().voiceFiles || []).length ? T().voiceFiles.map(f => h('div', { class: 'item' }, h('span', { class: 'grow' }, fname(f)), btn('×', () => api.invoke('tier:removeVoice', id, f), 'sm red'))) : [h('div', { class: 'hint' }, 'Chưa có file voice riêng cho mức này')]));
      drawVoices();
      return h('div', { class: 'card tier' },
        h('h3', {}, nm, h('span', { class: 'ctl' }, control(() => T().enabled !== false, (v) => api.invoke('tier:set', id, { enabled: v }), 'bool'))),
        cv,
        h('div', { style: 'display:flex;gap:12px;align-items:center' }, fcv, h('div', { style: 'flex:1' },
          tf('avatarFrame', 'Khung avatar', 'select', { num: true, options: FRAME_LEVELS }),
          tf('avatarCm', 'Cỡ avatar', 'range', { min: 1.5, max: 7, step: 0.1, unit: ' cm' }))),
        tf('min', 'Từ bao nhiêu xu', 'number', { min: 0, unit: 'xu trở lên', tip: 'Tổng xu của lần tặng (đã gộp combo)' }),
        tf('sizeCm', 'Cỡ chữ', 'range', { min: 0.5, max: 6, step: 0.1, unit: ' cm' }),
        tf('ornament', 'Hoa văn', 'select', { options: Object.entries(ORNAMENTS).map(([k, v]) => [k, v.name]) }),
        tf('fontId', 'Font chữ', 'select', { options: () => fontOptions(true) }),
        tf('text', 'Nội dung dòng chính', 'textarea', { full: true, rows: 2, ph: '{name}', tip: 'Nhiều dòng = chọn ngẫu nhiên' }),
        tf('sub', 'Dòng nhỏ bên dưới (để trống = không có)', 'textarea', { full: true, rows: 1, ph: 'vd: {gift} x{count}' }),
        tf('subSizePct', 'Cỡ dòng nhỏ', 'range', { min: 20, max: 80, step: 2, unit: '%' }),
        tf('color', 'Màu chữ', 'color', { clearable: true, def: cfg.writer.inkColor }),
        tf('ornColor', 'Màu hoa văn', 'color', { clearable: true, def: cfg.writer.inkColor }),
        tf('sec', 'Viết xong trong tối đa', 'range', { min: 2, max: 30, step: 1, unit: ' giây' }),
        tf('ttsText', 'Câu cảm ơn riêng (để trống = câu chung)', 'text', { ph: 'vd: Cảm ơn {name} đã tặng {gift}' }),
        h('div', { class: 'hint', style: 'margin-top:6px' }, 'File voice cảm ơn của mức này (ngẫu nhiên 1 file):'), voices,
        h('div', { class: 'btns' }, btn('+ File voice', () => api.invoke('tier:addVoice', id), 'sm'),
          btn('Nghe thử voice', () => api.invoke('voice:test', { tierId: id }), 'sm'),
          btn('Viết thử', () => api.invoke('test:gift', { diamonds: T().min || 1 }), 'sm pri'),
          btn('Xoá mức', () => { if (confirm('Xoá mức này?')) api.invoke('tier:remove', id); }, 'sm red')));
    }));
  };
  let sig = '';
  const redraw = () => { const s = JSON.stringify(cfg.tiers.map(t => [t.id, t.voiceFiles])) + cfg.fonts.length; if (s !== sig) { sig = s; draw(); } else wrap.querySelectorAll('.tier').forEach((el, i) => { const t = cfg.tiers[i]; if (!t) return; const cs = el.querySelectorAll('canvas'); ornPreview(cs[0], t); if (cs[1]) framePreview(cs[1], t); }); };
  binds.push(redraw);
  $('#tab-tiers').replaceChildren(h('div', { class: 'grid', style: 'margin-bottom:14px' },
    card('Chữ viết chung',
      field('writer.fontId', 'Font chữ chung', 'select', { options: () => fontOptions(false) }),
      field('writer.inkColor', 'Màu mực', 'color'),
      field('writer.nibMm', 'Độ dày nét (ở cỡ 1 cm)', 'range', { min: 0.3, max: 2, step: 0.05, unit: ' mm' }),
      field('writer.fill', 'Kiểu nét', 'select', { options: [['hatch', 'Tô kín chữ'], ['outline', 'Chỉ viền chữ']] }),
      field('writer.align', 'Căn dòng', 'select', { options: [['center', 'Giữa'], ['left', 'Trái'], ['right', 'Phải']] }),
      field('writer.display', 'Viết tên theo', 'select', { options: [['nickname', 'Tên hiển thị (nickname)'], ['uniqueId', 'ID (@username)']] }),
      field('writer.maxChars', 'Tối đa ký tự tên', 'number', { min: 4, max: 40 }),
      field('writer.jitter', 'Lệch dòng nhẹ cho tự nhiên', 'bool')),
    card('Nhận quà',
      field('writer.minDiamonds', 'Viết khi tặng từ', 'number', { min: 0, unit: 'xu' }),
      field('writer.mergeSec', 'Gộp quà liên tiếp trong', 'number', { min: 0, unit: 'giây', tip: 'Cùng một người tặng nhiều lần liền nhau thì cộng dồn thành 1 dòng' }),
      field('writer.maxQueue', 'Hàng chờ tối đa', 'number', { min: 5 }),
      field('writer.gapAfterSec', 'Nghỉ giữa 2 người', 'range', { min: 0, max: 5, step: 0.1, unit: ' giây' }),
      note('Mã dùng trong nội dung: {name} tên · {gift} tên quà · {count} số lượng · {coins} tổng xu · {date} ngày.'),
      h('div', { class: 'btns' }, btn('+ Thêm mức', () => api.invoke('tier:add'), 'pri'), btn('Khôi phục mức mặc định', () => { if (confirm('Khôi phục 7 mức mặc định?')) api.invoke('tier:reset'); }, 'red'))),
    card('Ảnh đại diện (avatar)',
      note('Bút in avatar TikTok (màu sắc nét hoặc ký hoạ mực), tên viết ngay bên dưới. Người donate có khung hoa văn quanh avatar, chi tiết tăng theo mức (chỉnh ở từng mức bên dưới).'),
      field('avatars.enabled', 'Bật vẽ avatar', 'bool'),
      field('avatars.style', 'Kiểu avatar', 'select', { options: [['print', 'In màu sắc nét (bút quét nhanh như đầu in)'], ['sketch', 'Ký hoạ mực đan nét']] }),
      field('avatars.printSec', 'Thời gian in mỗi avatar', 'range', { min: 0.2, max: 5, step: 0.1, unit: ' giây', tip: 'Kiểu in màu' }),
      field('avatars.donors', 'Vẽ avatar người donate', 'bool'),
      field('avatars.viewers', 'Vẽ avatar người xem', 'bool', { tip: 'Áp dụng khi tên người xem viết kiểu mỗi người một dòng' }),
      field('avatars.viewerCm', 'Cỡ avatar người xem', 'range', { min: 1, max: 5, step: 0.1, unit: ' cm' }),
      field('avatars.viewerFrame', 'Khung avatar người xem', 'select', { num: true, options: FRAME_LEVELS }),
      field('avatars.detail', 'Độ chi tiết nét vẽ (ký hoạ)', 'range', { min: 0.6, max: 1.8, step: 0.05, unit: '×', tip: 'Cao = nhiều nét hơn, giống ảnh hơn nhưng vẽ lâu hơn' }),
      field('avatars.color', 'Màu mực vẽ avatar', 'color', { clearable: true, def: cfg.writer.inkColor }),
      field('avatars.donorSec', 'Thời gian vẽ ký hoạ (donate)', 'range', { min: 1, max: 20, step: 0.5, unit: ' giây' }),
      field('avatars.viewerSec', 'Thời gian vẽ ký hoạ (người xem)', 'range', { min: 1, max: 15, step: 0.5, unit: ' giây' }),
      h('div', { class: 'btns' }, btn('Chọn ảnh thử', async () => { const f = await api.invoke('test:pickAvatar'); if (f) toast('Các lượt thử sẽ dùng ảnh này làm avatar'); }, 'sm'),
        btn('Bỏ ảnh thử', () => setPath('testAvatar', ''), 'sm red')))),
  wrap);
  draw(); sig = JSON.stringify(cfg.tiers.map(t => [t.id, t.voiceFiles])) + cfg.fonts.length;
}

// ================= TAB: Người xem & Quote
const QL = [['vi', 'tiếng Việt'], ['en', 'tiếng Anh'], ['zh', 'tiếng Trung'], ['ja', 'tiếng Nhật'], ['ko', 'tiếng Hàn'], ['ar', 'tiếng Ả Rập'], ['ru', 'tiếng Nga']];
const QLIST = { vi: 'list', en: 'listEn', zh: 'listZh', ja: 'listJa', ko: 'listKo', ar: 'listAr', ru: 'listRu' };
function renderViewers() {
  const src = (k, t) => { const cb = h('input', { type: 'checkbox' }); const sync = () => { cb.checked = !!(cfg.viewers.sources || {})[k]; }; sync(); binds.push(sync);
    cb.onchange = () => setPath('viewers.sources.' + k, cb.checked); return h('label', { style: 'display:flex;gap:4px;align-items:center' }, cb, t); };
  const tname = h('input', { type: 'text', placeholder: 'Tên thử', style: 'min-width:90px' });
  $('#tab-viewers').replaceChildren(h('div', { class: 'grid' },
    card('Viết tên người xem',
      field('viewers.enabled', 'Bật viết tên người xem', 'bool'),
      row('Viết khi người xem', h('div', { class: 'ctl', style: 'gap:12px;flex-wrap:wrap' }, src('join', 'Vào phòng'), src('chat', 'Bình luận'), src('like', 'Thả tim'), src('follow', 'Theo dõi'), src('share', 'Chia sẻ'))),
      field('viewers.sizeCm', 'Cỡ chữ', 'range', { min: 0.3, max: 3, step: 0.05, unit: ' cm' }),
      field('viewers.fontId', 'Font chữ', 'select', { options: () => fontOptions(true) }),
      field('viewers.color', 'Màu chữ', 'color', { clearable: true, def: cfg.writer.inkColor }),
      field('viewers.gapCm', 'Khoảng cách giữa 2 tên (cùng dòng)', 'range', { min: 0.2, max: 3, step: 0.05, unit: ' cm' }),
      field('viewers.align', 'Căn dòng', 'select', { options: [['line', 'Mỗi người một dòng, căn giữa'], ['center', 'Nhiều tên một dòng, căn giữa'], ['left', 'Nhiều tên một dòng, từ trái sang phải']] }),
      field('viewers.separator', 'Dấu ngăn cách', 'select', { options: [['dot', 'Chấm ·'], ['dash', 'Gạch –'], ['none', 'Không có']] }),
      field('viewers.display', 'Viết theo', 'select', { options: [['nickname', 'Tên hiển thị (nickname)'], ['uniqueId', 'ID (@username)']] }),
      field('viewers.maxChars', 'Tối đa ký tự', 'number', { min: 3, max: 40 }),
      field('viewers.sec', 'Viết mỗi tên trong tối đa', 'range', { min: 1, max: 10, step: 0.5, unit: ' giây' }),
      field('viewers.dedupeMin', 'Không viết lại cùng người trong', 'number', { min: 0, unit: 'phút' }),
      field('viewers.maxQueue', 'Hàng chờ tối đa', 'number', { min: 5, tip: 'Đông người: bỏ bớt người vào sớm, giữ người mới' }),
      note('Các tên viết nối tiếp trên cùng một dòng, hết dòng thì xuống dòng, hết giấy thì thay tờ. Người tặng quà luôn được viết trước.'),
      row('Thử', h('div', { class: 'ctl' }, tname, btn('Vào phòng', () => api.invoke('test:join', tname.value.trim() || undefined), 'sm'),
        btn('10 người', () => { for (let i = 0; i < 10; i++) setTimeout(() => api.invoke('test:join'), i * 120); }, 'sm')))),
    card('Quote khi rảnh',
      field('quotes.enabled', 'Bật viết quote', 'bool'),
      row('Ngôn ngữ (xen kẽ)', h('div', { class: 'ctl', style: 'gap:10px;flex-wrap:wrap' }, ...QL.map(([k, t]) => {
        const cb = h('input', { type: 'checkbox' }); const sync = () => { cb.checked = !!(cfg.quotes.langs || {})[k]; }; sync(); binds.push(sync);
        cb.onchange = () => setPath('quotes.langs.' + k, cb.checked); return h('label', { style: 'display:flex;gap:4px;align-items:center' }, cb, t); }))),
      field('quotes.showMeaning', 'Viết nghĩa tiếng Việt bên dưới câu nước ngoài', 'bool'),
      field('quotes.meaningSizePct', 'Cỡ chữ phần nghĩa', 'range', { min: 30, max: 100, step: 2, unit: '%' }),
      field('quotes.afterSec', 'Viết khi vắng sau', 'number', { min: 3, unit: 'giây', tip: 'Không có ai vào phòng / tặng quà trong khoảng này' }),
      field('quotes.gapSec', 'Cách giữa 2 câu quote', 'number', { min: 0, unit: 'giây' }),
      field('quotes.random', 'Chọn ngẫu nhiên', 'bool', { tip: 'Tắt = lần lượt theo danh sách' }),
      field('quotes.fontId', 'Font chữ Việt / Anh', 'select', { options: () => fontOptions(true) }),
      ...QL.filter(([k]) => !['vi', 'en'].includes(k)).map(([k, t]) => field('quotes.langFonts.' + k, 'Font ' + t, 'select', { options: () => fontOptions(true) })),
      field('quotes.sizeCm', 'Cỡ chữ', 'range', { min: 0.5, max: 3, step: 0.05, unit: ' cm' }),
      field('quotes.authorSizePct', 'Cỡ tên tác giả', 'range', { min: 30, max: 100, step: 5, unit: '%' }),
      field('quotes.widthPct', 'Độ rộng khối chữ', 'range', { min: 40, max: 100, step: 2, unit: '%' }),
      field('quotes.color', 'Màu chữ', 'color', { clearable: true, def: cfg.writer.inkColor }),
      field('quotes.divider', 'Nét gạch trang trí bên dưới', 'bool'),
      field('quotes.sec', 'Viết xong trong tối đa', 'range', { min: 4, max: 40, step: 1, unit: ' giây' }),
      h('div', { class: 'btns' }, btn('Viết 1 câu ngay', () => api.invoke('test:quote'), 'pri'))),
    ...QL.map(([k, t]) => card(['Quote ' + t, h('small', {}, k === 'vi' || k === 'en' ? 'mỗi dòng 1 câu · tác giả sau dấu —' : 'câu gốc || nghĩa tiếng Việt — nguồn')],
      field('quotes.' + QLIST[k], '', 'lines', { full: true, rows: 12 })))));
}

// ================= TAB: Giấy & ánh vàng
function renderPaper() {
  $('#tab-paper').replaceChildren(h('div', { class: 'grid' },
    card('Tờ giấy',
      field('sheet.marginTopCm', 'Lề trên', 'range', { min: 0.5, max: 8, step: 0.1, unit: ' cm' }),
      field('sheet.marginBottomCm', 'Lề dưới', 'range', { min: 0.5, max: 8, step: 0.1, unit: ' cm' }),
      field('sheet.marginSideCm', 'Lề hai bên', 'range', { min: 0.3, max: 5, step: 0.1, unit: ' cm' }),
      field('sheet.lineGapCm', 'Khoảng cách giữa các dòng', 'range', { min: 0, max: 3, step: 0.1, unit: ' cm' }),
      field('sheet.tint', 'Màu giấy', 'color'),
      field('sheet.grain', 'Độ vân giấy', 'range', { min: 0, max: 1.5, step: 0.05 }),
      note('Tờ giấy thật trong model rộng 21,4 cm × cao 38 cm. Mỗi người một dòng; hết chỗ thì tờ đã viết trượt đi, lộ tờ trắng bên dưới.'),
      field('sheet.swapSec', 'Thời gian thay giấy', 'range', { min: 0.8, max: 6, step: 0.1, unit: ' giây' }),
      h('div', { class: 'btns' }, btn('Thay tờ mới ngay', () => api.invoke('paper:new'), 'pri'), btn('Xoá trắng tờ hiện tại', () => api.invoke('paper:clear')))),
    card('Ánh vàng sau khi viết xong',
      field('glow.enabled', 'Bật hiệu ứng ánh vàng', 'bool'),
      field('glow.sec', 'Thời gian', 'range', { min: 0.5, max: 6, step: 0.1, unit: ' giây' }),
      field('glow.color', 'Màu ánh', 'color'),
      field('glow.strength', 'Độ sáng', 'range', { min: 0.2, max: 3, step: 0.1 }),
      field('glow.types.donor', 'Áp dụng cho người tặng quà', 'bool'),
      field('glow.types.name', 'Áp dụng cho tên người xem', 'bool'),
      field('glow.types.quote', 'Áp dụng cho câu quote', 'bool'),
      note('Chữ vừa viết chuyển vàng kim, có vệt sáng quét từ trái sang phải rồi trở về màu mực.'),
      h('div', { class: 'btns' }, btn('Xem thử lên dòng vừa viết', () => api.invoke('display:cmd', { cmd: 'glowTest' }), 'pri')))));
}

// ================= TAB: Nhạc nền & Voice
function renderSound() {
  live.mstat = h('div', { class: 'hint' }, '—');
  const list = h('div', { class: 'list' });
  const draw = async () => {
    const files = cfg.music.files || [];
    const ex = files.length ? await api.invoke('files:exists', files) : [];
    list.replaceChildren(...(files.length ? files.map((f, i) => h('div', { class: 'item' + (ex[i] ? '' : ' missing'), title: f },
      h('span', { class: 'grow' }, fname(f)), btn('▶', () => api.invoke('music:cmd', 'track', f), 'sm'), btn('×', () => api.invoke('music:remove', f), 'sm red'))) : [h('div', { class: 'hint' }, 'Chưa có bài nào')]));
  };
  const vname = h('input', { type: 'text', value: 'Minh Anh' });
  const voiceOpts = () => [['', '— tự chọn theo ngôn ngữ —'], ...(live.voices || []).map(v => [v.name, `${v.name} (${v.lang})`])];
  $('#tab-sound').replaceChildren(h('div', { class: 'grid' },
    card('Nhạc nền', live.mstat,
      h('div', { class: 'btns' }, btn('⏮', () => api.invoke('music:cmd', 'prev')), btn('▶ Phát', () => api.invoke('music:cmd', 'play'), 'pri'),
        btn('⏸ Dừng', () => api.invoke('music:cmd', 'pause')), btn('⏭', () => api.invoke('music:cmd', 'next'))),
      field('music.enabled', 'Bật nhạc nền', 'bool'),
      field('music.volume', 'Âm lượng nhạc', 'range', { min: 0, max: 1, step: 0.05 }),
      field('music.shuffle', 'Trộn bài ngẫu nhiên', 'bool'),
      field('music.crossfadeSec', 'Chuyển bài mượt trong', 'range', { min: 0, max: 10, step: 0.5, unit: ' giây' }),
      field('music.duck', 'Giảm nhạc khi đọc voice cảm ơn', 'bool'),
      field('music.duckPct', 'Giảm còn', 'range', { min: 0, max: 100, step: 5, unit: '%' }),
      list, h('div', { class: 'btns' }, btn('+ Thêm nhạc', () => api.invoke('music:add'), 'pri')),
      note('Nhạc và voice phát từ cửa sổ hiển thị – trong LIVE Studio nhớ thu âm thanh của ứng dụng.')),
    card('Voice cảm ơn',
      field('voice.enabled', 'Bật voice cảm ơn', 'bool'),
      field('voice.mode', 'Kiểu', 'select', { options: [['tts', 'Đọc câu cảm ơn (có tên)'], ['files', 'Phát file ghi âm của mức'], ['both', 'File ghi âm rồi đọc tên']] }),
      field('voice.when', 'Phát lúc', 'select', { options: [['start', 'Bắt đầu viết'], ['end', 'Viết xong']] }),
      field('voice.text', 'Câu cảm ơn chung', 'text', { ph: 'Cảm ơn {name} đã tặng {gift}' }),
      field('voice.engine', 'Giọng đọc', 'select', { options: [['google', 'Google (tự nhiên, cần mạng)'], ['system', 'Giọng Windows (offline)']] }),
      field('voice.lang', 'Ngôn ngữ', 'select', { options: [['vi', 'Tiếng Việt'], ['en', 'English'], ['zh-CN', '中文'], ['th', 'ไทย'], ['id', 'Indonesia']] }),
      field('voice.systemVoice', 'Giọng Windows', 'select', { options: voiceOpts }),
      field('voice.rate', 'Tốc độ đọc', 'range', { min: 0.6, max: 1.6, step: 0.05, unit: '×' }),
      field('voice.volume', 'Âm lượng voice', 'range', { min: 0, max: 1, step: 0.05 }),
      field('voice.minDiamonds', 'Chỉ đọc khi tặng từ', 'number', { min: 0, unit: 'xu' }),
      row('Tên thử', h('div', { class: 'ctl' }, vname, btn('Nghe thử', () => api.invoke('voice:test', { name: vname.value }), 'sm pri'))),
      note('File ghi âm riêng cho từng mức thêm ở tab "Mức donate". Giọng Google lỗi/mất mạng sẽ tự chuyển sang giọng Windows.'))));
  draw(); binds.push(draw);
}
function renderMStat(s) {
  if (!live.mstat || !s) return;
  const mm = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  live.mstat.textContent = !cfg.music.enabled ? 'Nhạc nền đang tắt' : !s.file ? 'Chưa phát' : `${s.playing ? '▶' : '⏸'} ${fname(s.file)}  ${mm(s.t)} / ${mm(s.dur)}${s.ducked ? '  · đang giảm âm' : ''}`;
}

// ================= TAB: Font
function renderFonts() {
  const sample = h('input', { type: 'text', value: 'Nguyễn Thị Hồng Nhung – Đặng Quốc Bảo' });
  const list = h('div', { class: 'list', style: 'max-height:none' });
  const draw = () => list.replaceChildren(...cfg.fonts.map(f => h('div', { class: 'item', style: 'flex-direction:column;align-items:stretch' },
    h('div', { class: 'ctl' }, h('span', { class: 'grow' }, f.name), h('span', { class: 'tag' }, f.builtin ? 'có sẵn' : fname(f.file)),
      f.builtin ? null : btn('Xoá', () => api.invoke('fonts:remove', f.id), 'sm red')),
    h('div', { class: 'preview', style: `font-family:${ff(f.id)};font-size:30px` }, sample.value))));
  sample.oninput = draw; draw(); binds.push(draw);
  $('#tab-fonts').replaceChildren(h('div', { class: 'grid' },
    card('Thêm font của bạn', note('Hỗ trợ .ttf, .otf, .woff. Nên dùng font có dấu tiếng Việt; ký tự font thiếu tự lấy từ font dự phòng. Emoji được bỏ qua.'),
      h('div', { class: 'row' }, h('label', {}, 'Chữ mẫu'), sample), h('div', { class: 'btns' }, btn('+ Thêm font', () => api.invoke('fonts:add'), 'pri'))),
    card('Danh sách font', list)));
}

// ================= TAB: Hiển thị & camera
function renderDisplay() {
  $('#tab-display').replaceChildren(h('div', { class: 'grid' },
    card('Cửa sổ hiển thị 9:16',
      note('Khung hình xuất ra LIVE phải đúng độ phân giải của LIVE Studio (thường 1080×1920). Cửa sổ nhỏ hơn thì LIVE Studio phải phóng to lên → bị mờ.'),
      h('div', { class: 'btns' }, ...[[540, 960], [720, 1280], [1080, 1920]].map(([w, hh]) => btn(`${w}×${hh}`, async () => {
        const r = await api.invoke('win:displaySize', w, hh);
        const rot = [90, -90].includes(+cfg.display.rotate); const want = rot ? [hh, w] : [w, hh];
        if (r && (r.w < want[0] - 2 || r.h < want[1] - 2)) toast(`Màn hình không đủ chỗ: cửa sổ chỉ được ${r.w}×${r.h}. Hãy bật "Xoay khung 90°" để có 1080×1920 trên màn Full HD.`);
        else toast(`Cửa sổ hiển thị: ${want[0]}×${want[1]}`);
      }, 'sm'))),
      row('Xoay khung 90°', control(() => +cfg.display.rotate || 0, (v) => api.invoke('win:setRotate', +v), 'select', { options: [[0, 'Không xoay (cửa sổ dọc 9:16)'], [-90, 'Xoay trái (cửa sổ ngang 16:9)'], [90, 'Xoay phải (cửa sổ ngang 16:9)']] }),
        'Màn hình 1920×1080 không chứa nổi cửa sổ dọc 1080×1920. Xoay khung thì cửa sổ thành 1920×1080, trong LIVE Studio xoay nguồn lại 90° là được hình 1080×1920 sắc nét'),
      note('Màn Full HD: chọn 1080×1920 + Xoay trái → trong LIVE Studio chuột phải nguồn Window capture → Xoay 90° theo chiều kim đồng hồ (xoay phải thì chọn ngược chiều) → kéo vừa khung. Khi xoay, chỉnh camera bằng chuột tạm tắt.'),
      field('display.frameless', 'Ẩn khung cửa sổ', 'bool', { tip: 'Áp dụng khi tải lại màn hiển thị' }),
      field('display.alwaysOnTop', 'Luôn nằm trên', 'bool'),
      field('display.dragWindow', 'Kéo cửa sổ bằng chuột (tắt xoay camera)', 'bool'),
      field('display.renderScale', 'Độ nét render', 'range', { min: 0.5, max: 2, step: 0.25, unit: '×', tip: 'Máy yếu (GTX 1050) để 1 hoặc 0.75' }),
      note('LIVE Studio: thêm nguồn Window capture, chọn cửa sổ "Pen Writer - Display".'),
      h('div', { class: 'btns' }, btn('Tải lại màn hiển thị', () => api.invoke('win:recreateDisplay')))),
    card('Camera',
      note('Trong màn hiển thị: chuột trái xoay, chuột phải kéo, lăn để zoom. Chỉnh xong bấm lưu.'),
      h('div', { class: 'btns' }, btn('Lưu góc camera', () => api.invoke('display:cmd', { cmd: 'saveCamera' }), 'pri'),
        btn('Về góc đã lưu', () => api.invoke('display:cmd', { cmd: 'camera' })), btn('Về góc gốc trong model', () => api.invoke('display:cmd', { cmd: 'resetCamera' }), 'red')),
      field('display.mouseCamera', api.platform === 'android' ? 'Mở khoá chỉnh camera (hiện thanh Xoay / Di chuyển / Zoom)' : 'Cho phép chỉnh camera bằng chuột', 'bool'),
      h('div', { class: 'btns' }, btn('⟳ Kéo để xoay', () => api.invoke('display:cmd', { cmd: 'camMode', mode: 'rotate' }), 'sm'), btn('✥ Kéo để di chuyển', () => api.invoke('display:cmd', { cmd: 'camMode', mode: 'pan' }), 'sm'),
        btn('＋ Gần', () => api.invoke('display:cmd', { cmd: 'zoom', f: 0.88 }), 'sm'), btn('－ Xa', () => api.invoke('display:cmd', { cmd: 'zoom', f: 1.14 }), 'sm')),
      h('p', { class: 'note' }, api.platform === 'android' ? 'Mở khoá → đóng bảng này → chỉnh trên màn hình bằng thanh công cụ ở dưới → bấm 🔒 Khoá (tự lưu góc). Khoá rồi thì chạm màn hình không làm lệch camera.' : 'Chuột trái: xoay (hoặc di chuyển nếu chọn "Kéo để di chuyển"), chuột phải: di chuyển, cuộn: zoom. Tắt ô trên để khoá camera khi live.'),
      field('display.followPen', 'Camera bám theo ngòi bút', 'range', { min: 0, max: 100, step: 5, unit: '%' })),
    card('Ánh sáng & chất lượng',
      field('display.sun', 'Nắng qua cửa sổ', 'range', { min: 0, max: 2.5, step: 0.05, unit: '×' }),
      field('display.ambient', 'Ánh sáng phòng', 'range', { min: 0, max: 2.5, step: 0.05, unit: '×' }),
      field('display.lamp', 'Đèn bàn ấm', 'bool'),
      field('display.exposure', 'Độ sáng tổng', 'range', { min: 0.4, max: 2, step: 0.05 }),
      field('display.shadows', 'Đổ bóng', 'bool', { tip: 'Tắt nếu máy yếu' }),
      field('display.bloom', 'Hào quang ánh vàng (bloom)', 'range', { min: 0, max: 1.5, step: 0.05, tip: 'Chỉ chạy lúc chữ ánh vàng' }),
      field('display.vignette', 'Tối viền', 'range', { min: 0, max: 1, step: 0.05 })),
    card('Hạt bụi lơ lửng',
      field('display.dust.enabled', 'Bật hạt bụi bay', 'bool'),
      field('display.dust.count', 'Số hạt', 'range', { min: 50, max: 1500, step: 50 }),
      field('display.dust.size', 'Cỡ hạt', 'range', { min: 0.3, max: 3, step: 0.1, unit: '×' }),
      field('display.dust.brightness', 'Độ sáng', 'range', { min: 0.2, max: 3, step: 0.1, unit: '×' }),
      field('display.dust.speed', 'Tốc độ trôi', 'range', { min: 0.2, max: 3, step: 0.1, unit: '×' }),
      note('Hạt bụi trôi chậm, sáng hơn khi bắt nắng từ cửa sổ. Rất nhẹ máy.')),
    card('Vị trí bút khi nghỉ',
      field('display.penPark.u', 'Ngang (0 = mép trái, 1 = mép phải)', 'range', { min: -0.2, max: 1.2, step: 0.02 }),
      field('display.penPark.v', 'Dọc (0 = mép trên, 1 = mép dưới)', 'range', { min: -0.2, max: 1.2, step: 0.02 }),
      field('display.penPark.h', 'Độ cao nhấc bút', 'range', { min: 0.01, max: 0.15, step: 0.005, unit: ' m' }))));
}

// ================= TAB: Cập nhật
function renderUpdate() {
  live.upd = h('div', { class: 'hint' }, '—'); live.info = h('div', { class: 'hint' });
  live.applyBtn = btn('Khởi động lại để cập nhật', () => api.invoke('update:apply'), 'pri'); live.applyBtn.style.display = 'none';
  $('#tab-update').replaceChildren(h('div', { class: 'grid' },
    card('Cập nhật từ xa qua GitHub', note('App tải thư mục app/ mới nhất từ repo GitHub (public) khi version.json trong repo có số phiên bản lớn hơn. Đang live vẫn chạy bình thường, chỉ áp dụng khi bạn bấm khởi động lại.'),
      field('update.owner', 'Tài khoản GitHub', 'text'), field('update.repo', 'Tên repo', 'text'), field('update.branch', 'Nhánh', 'text'),
      field('update.autoCheck', 'Tự kiểm tra', 'bool'), field('update.intervalMin', 'Kiểm tra mỗi', 'number', { unit: 'phút', min: 10 }),
      live.upd, h('div', { class: 'btns' }, btn('Kiểm tra ngay', () => api.invoke('update:check')), live.applyBtn)),
    card('Ứng dụng', live.info,
      h('div', { class: 'btns' }, btn('Mở thư mục dữ liệu', () => api.invoke('open:userData')), btn('Xuất cấu hình', () => api.invoke('config:export')), btn('Nhập cấu hình', () => api.invoke('config:import'))))));
  api.invoke('app:info').then(i => { live.info.textContent = `Phiên bản app v${i.appVersion} (${i.appSource === 'update' ? 'bản cập nhật' : 'bản cài'}) · shell v${i.shellVersion} · dữ liệu: ${i.userData}`; $('#ver').textContent = `v${i.appVersion}`; });
  api.invoke('update:status').then(renderUpd);
}
function renderUpd(s) { if (!live.upd || !s) return; live.upd.textContent = s.message || s.state; live.applyBtn.style.display = s.state === 'ready' ? '' : 'none'; if (s.state === 'ready') toast(s.message); }

// ---------------- khởi tạo
refreshFontFaces();
renderHome(); renderTiers(); renderViewers(); renderPaper(); renderSound(); renderFonts(); renderDisplay(); renderUpdate();
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'tiers') binds.forEach(f => f());
});
document.fonts && document.fonts.ready.then(() => binds.forEach(f => f()));
api.on('config', (c) => { const fontsChanged = JSON.stringify(c.fonts) !== JSON.stringify(cfg.fonts); cfg = c; if (fontsChanged) refreshFontFaces(); binds.forEach(f => f()); });
api.on('log', addLog);
api.on('queue', renderQueue);
api.on('music:status', renderMStat);
api.on('update:status', renderUpd);
function renderTik(s) {
  const p = $('#pTik'); p.textContent = 'TikTok: ' + ({ connected: 'đã kết nối', connecting: 'đang kết nối', error: 'lỗi', disconnected: 'chưa kết nối' }[s.state] || s.state) + (s.viewers ? ` · ${s.viewers} người xem` : '');
  p.className = 'pill ' + ({ connected: 'ok', connecting: 'warn', error: 'err' }[s.state] || '');
  if (live.tikMsg) live.tikMsg.textContent = s.message;
}
api.on('tiktok:status', renderTik);
api.on('display:status', (s) => {
  if (s.voices && JSON.stringify(s.voices) !== JSON.stringify(live.voices)) { live.voices = s.voices; binds.forEach(f => f()); }
  const p = $('#pWrite'); p.textContent = 'Bút: ' + (s.busy ? (s.job ? `đang viết "${s.job.name}"` : 'đang viết') : 'rảnh') + (s.fps ? ` · ${s.fps} fps` : '');
  p.className = 'pill ' + (s.busy ? 'ok' : '');
  if (live.writing) live.writing.textContent = s.busy && s.job ? `Đang viết: ${s.job.name}${s.job.tier ? ' · ' + s.job.tier : s.job.type === 'quote' ? ' · quote' : s.job.type === 'name' ? ' · người xem' : ''}` : 'Bút đang chờ';
});
api.invoke('queue:get').then(renderQueue);
api.invoke('tiktok:status').then(s => s && renderTik(s));
