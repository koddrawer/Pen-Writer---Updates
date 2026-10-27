// Lập kế hoạch dòng chữ (tên + nội dung + hoa văn theo mức donate) và điều khiển ngòi bút: nhấc/hạ, di chuyển, viết, thay giấy.
import { layoutText, textToStrokes, sanitize, hasRenderable, hatch, simplify, wrapText } from './text.js';
import { buildOrnament, ornamentPad } from './ornaments.js';

const LIFT = 0.008;

export function pickTier(tiers, total) {
  const list = (tiers || []).filter(t => t.enabled !== false).sort((a, b) => (b.min || 0) - (a.min || 0));
  return list.find(t => total >= (t.min || 0)) || list[list.length - 1] || null;
}

export class Writer {
  constructor(desk, fonts, getCfg, hooks = {}) {
    this.d = desk; this.fonts = fonts; this.cfg = getCfg; this.hooks = hooks;
    const pk = this.park();
    this.pen = { u: pk[0], v: pk[1], z: pk[2] }; this.vel = [0, 0];
    this.steps = []; this.step = null; this.used = 0;
    this.busy = false; this.idleT = 0; this.job = null; this.t = 0;
  }
  get sheet() { return this.d.sheet; }
  park() { const p = this.cfg().display.penPark || {}; const P = this.d.P; return [P.W * (p.u ?? 1.08), P.H * (p.v ?? 0.55), p.h ?? 0.05]; }

  fill(t, job, name) {
    return String(t || '').replace(/\{name\}/g, name).replace(/\{gift\}/g, job.gift || 'quà').replace(/\{count\}/g, job.count || 1)
      .replace(/\{coins\}/g, job.total ?? (job.diamonds || 0) * (job.count || 1)).replace(/\{date\}/g, new Date().toLocaleDateString('vi-VN'))
      .replace(/\s+/g, ' ').trim();
  }

  async planDonor(job) {
    const C = this.cfg(); const W = C.writer; const S = C.sheet; const P = this.d.P;
    const tier = pickTier(C.tiers, job.total ?? (job.diamonds || 0) * (job.count || 1));
    if (!tier) return false;
    job.tierId = tier.id; job.tierName = tier.name; this.tier = tier;
    const chain = await this.fonts.chain(tier.fontId || W.fontId);
    let name = sanitize(chain, job.name, W.maxChars || 24);
    if (!name || !hasRenderable(chain, name)) name = sanitize(chain, job.alt || '', W.maxChars || 24) || 'Bạn';
    job.written = name;
    const tpls = String(tier.text || '{name}').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const text = sanitize(chain, this.fill(tpls[Math.floor(Math.random() * tpls.length)] || '{name}', job, name), 90) || name;
    const subT = tier.sub ? sanitize(chain, this.fill(tier.sub, job, name), 90) : '';

    const side = (S.marginSideCm ?? 1.5) / 100, top0 = (S.marginTopCm ?? 2.4) / 100, limit = P.H - (S.marginBottomCm ?? 2.2) / 100;
    const pad = ornamentPad(tier.ornament || 'none');
    const capR = layoutText(chain, 'H', 1).capHeight || 0.7;
    let cap = Math.max(0.004, (tier.sizeCm || 1.2) / 100);
    const full = P.W - 2 * side;
    let L, Ls, asc, desc, sasc, sdesc, subCap, blockH, k = 1;
    const measure = () => {
      L = layoutText(chain, text, cap / capR);
      const wNeed = L.width + 2 * pad.s * cap;
      if (wNeed > full) { cap *= Math.max(0.3, full / wNeed); L = layoutText(chain, text, cap / capR); }
      asc = Math.max(L.bbox.y1, cap * 1.05); desc = Math.max(-L.bbox.y0, cap * 0.32);
      Ls = null; sasc = sdesc = 0;
      if (subT) {
        subCap = cap * (tier.subSizePct || 42) / 100;
        Ls = layoutText(chain, subT, subCap / capR);
        const sw = full - 2 * pad.s * cap;
        if (Ls.width > sw) { subCap *= sw / Ls.width; Ls = layoutText(chain, subT, subCap / capR); }
        sasc = Math.max(Ls.bbox.y1, subCap * 1.0); sdesc = Math.max(-Ls.bbox.y0, subCap * 0.3);
      }
      blockH = (pad.t + pad.b) * cap + asc + desc + (Ls ? cap * 0.22 + sasc + sdesc : 0);
    };
    measure();
    // cao quá cả tờ giấy: thu nhỏ
    while (blockH > limit - top0 && k++ < 12) { cap *= 0.88; measure(); }

    const gap = (S.lineGapCm ?? 0.5) / 100;
    let top = this.used > 0 ? this.used + gap : top0;
    if (top + blockH > limit && this.used > 0) {
      // hết giấy -> thay tờ mới
      this.steps.push({ k: 'swap' });
      top = top0;
    }
    this.row = null;
    this.used = top + blockH; this.row = null;
    this.steps.push({ k: 'call', fn: () => this.sheet.trackStart() });

    const cx = W.align === 'left' ? side + pad.s * cap + L.width / 2 : W.align === 'right' ? P.W - side - pad.s * cap - L.width / 2 : P.W / 2;
    const textTop = top + pad.t * cap;
    const jit = W.jitter !== false ? (Math.random() - 0.5) * cap * 0.06 : 0;
    const base = textTop + asc + jit;
    const ox = cx - (L.bbox.x0 + L.bbox.x1) / 2;
    const ink = tier.color || W.inkColor || '#16121c';
    const nib = Math.max(0.0004, (W.nibMm ?? 0.7) / 1000 * cap * 100);
    const fillMode = W.fill || 'hatch';
    const nameStrokes = textToStrokes(L, { nib, fill: fillMode, place: ([x, y]) => [ox + x, base - y] });
    const speed = W.speed || 0.16;
    this.queue(nameStrokes, nib, speed, ink);
    let x0 = ox + L.bbox.x0, x1 = ox + L.bbox.x1, bot = base + desc;
    if (Ls) {
      const sb = base + desc + cap * 0.22 + sasc; const sox = cx - (Ls.bbox.x0 + Ls.bbox.x1) / 2;
      const snib = Math.max(0.0003, nib * subCap / cap * 1.1);
      this.queue(textToStrokes(Ls, { nib: snib, fill: fillMode, place: ([x, y]) => [sox + x, sb - y] }), snib, speed, tier.ornColor || ink);
      x0 = Math.min(x0, sox + Ls.bbox.x0); x1 = Math.max(x1, sox + Ls.bbox.x1); bot = sb + sdesc;
    }
    // hoa văn
    if (tier.ornament && tier.ornament !== 'none') {
      const o = buildOrnament(tier.ornament, { x0, x1, top: textTop, bot, cx, cap });
      const oc = tier.ornColor || ink; const onib = Math.max(0.0004, cap * 0.05);
      for (const st of o.strokes) this.steps.push(this.mk(st.map(p => [p[0], p[1], p[2] ?? onib]), onib, speed * 1.3, oc));
      for (const poly of o.fills) {
        const fn = Math.max(0.0003, cap * 0.022);
        const hs = hatch([poly.map(p => [p[0], -p[1]])], fn * 0.8, 0.6).map(h => h.map(p => [p[0], -p[1]]));
        for (const h of hs) this.steps.push(this.mk(h, fn, speed * 1.3, oc));
        this.steps.push(this.mk(simplify(poly, fn * 0.3), fn, speed * 1.3, oc));
      }
    }
    return true;
  }
  // vị trí khối mới: dưới dòng đã viết, hết chỗ thì thay giấy
  placeBlock(blockH) {
    const S = this.cfg().sheet; const P = this.d.P;
    const top0 = (S.marginTopCm ?? 2.4) / 100, limit = P.H - (S.marginBottomCm ?? 2.2) / 100, gap = (S.lineGapCm ?? 0.5) / 100;
    let top = this.used > 0 ? this.used + gap : top0;
    if (top + blockH > limit && this.used > 0) { this.steps.push({ k: 'swap' }); top = top0; this.row = null; }
    this.used = top + blockH;
    return top;
  }

  // tên người xem: nối tiếp trên cùng một dòng, hết dòng thì xuống dòng
  async planName(job) {
    const C = this.cfg(); const c = C.viewers || {}; const W = C.writer; const S = C.sheet; const P = this.d.P;
    const chain = await this.fonts.chain(c.fontId || W.fontId);
    let name = sanitize(chain, job.name, c.maxChars || 18);
    if (!name || !hasRenderable(chain, name)) name = sanitize(chain, job.alt || '', c.maxChars || 18);
    if (!name) return false;
    job.written = name;
    const side = (S.marginSideCm ?? 1.5) / 100, full = P.W - 2 * side;
    let cap = Math.max(0.003, (c.sizeCm || 0.8) / 100);
    const capR = layoutText(chain, 'H', 1).capHeight || 0.7;
    let L = layoutText(chain, name, cap / capR);
    if (L.width > full) { L = layoutText(chain, name, cap / capR * full / L.width); }
    const gap = Math.max(cap * 0.5, (c.gapCm ?? 0.7) / 100);
    const r = this.row;
    if (!r || Math.abs(r.cap - cap) > 1e-6 || r.font !== (c.fontId || W.fontId) || r.x + gap + L.width > P.W - side) {
      const rowH = cap * 2.1;
      const top = this.placeBlock(rowH);
      this.row = { top, base: top + cap * 1.4, x: side, n: 0, cap, font: c.fontId || W.fontId };
    }
    const row = this.row;
    const ink = c.color || W.inkColor || '#16121c';
    const nib = Math.max(0.0003, (W.nibMm ?? 0.85) / 1000 * cap * 100);
    const jit = W.jitter !== false ? (Math.random() - 0.5) * cap * 0.08 : 0;
    this.steps.push({ k: 'call', fn: () => this.sheet.trackStart() });
    let x = row.x;
    if (row.n > 0) {
      const mx = row.x + gap / 2, my = row.base - cap * 0.35;
      if (c.separator === 'dot') { const rr = Math.max(nib * 0.8, cap * 0.07); const d = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 2; d.push([mx + Math.cos(a) * rr * 0.5, my + Math.sin(a) * rr * 0.5]); } this.queue([d], rr, W.speed || 0.16, ink); }
      else if (c.separator === 'dash') this.queue([[[mx - gap * 0.18, my], [mx + gap * 0.18, my]]], nib, W.speed || 0.16, ink);
      x += gap;
    }
    const ox = x - L.bbox.x0;
    this.queue(textToStrokes(L, { nib, fill: W.fill || 'hatch', place: ([px, py]) => [ox + px, row.base + jit - py] }), nib, W.speed || 0.16, ink);
    row.x = x + L.width; row.n++;
    this.jobSec = c.sec ?? 3;
    return true;
  }

  // câu quote khi rảnh: khối chữ căn giữa nhiều dòng, tên tác giả bên dưới
  async planQuote(job) {
    const C = this.cfg(); const q = C.quotes || {}; const W = C.writer; const S = C.sheet; const P = this.d.P;
    const chain = await this.fonts.chain(q.fontId || W.fontId);
    const text = sanitize(chain, job.text, 300); if (!text) return false;
    const author = job.author ? sanitize(chain, job.author, 60) : '';
    const capR = layoutText(chain, 'H', 1).capHeight || 0.7;
    const top0 = (S.marginTopCm ?? 2.4) / 100, limit = P.H - (S.marginBottomCm ?? 2.2) / 100;
    const maxW = (P.W - 2 * (S.marginSideCm ?? 1.5) / 100) * Math.min(1, (q.widthPct || 86) / 100);
    let cap = (q.sizeCm || 1.3) / 100, lines, H, acap;
    for (let k = 0; k < 14; k++) {
      acap = cap * (q.authorSizePct || 60) / 100;
      lines = wrapText(chain, text, cap / capR, maxW);
      H = lines.length * cap * 1.9 + (author ? acap * 2.3 : 0) + (q.divider !== false ? cap * 1.1 : 0) + cap * 0.4;
      if (H <= (limit - top0) * 0.6 && lines.every(l => layoutText(chain, l, cap / capR).width <= maxW)) break;
      cap *= 0.9;
    }
    this.row = null;
    const top = this.placeBlock(H);
    const ink = q.color || W.inkColor || '#16121c';
    const nib = Math.max(0.0003, (W.nibMm ?? 0.85) / 1000 * cap * 100);
    const cx = P.W / 2; const sp = W.speed || 0.16;
    this.steps.push({ k: 'call', fn: () => this.sheet.trackStart() });
    let y = top + cap * 1.4, right = cx;
    for (const ln of lines) {
      const L = layoutText(chain, ln, cap / capR); const ox = cx - (L.bbox.x0 + L.bbox.x1) / 2; const base = y;
      right = Math.max(right, ox + L.bbox.x1);
      this.queue(textToStrokes(L, { nib, fill: W.fill || 'hatch', place: ([px, py]) => [ox + px, base - py] }), nib, sp, ink);
      y += cap * 1.9;
    }
    if (author) {
      const La = layoutText(chain, '— ' + author, acap / capR); const ab = y - cap * 0.6 + acap * 0.9; const ox = right - La.bbox.x1;
      const anib = nib * 0.8;
      this.queue(textToStrokes(La, { nib: anib, fill: W.fill || 'hatch', place: ([px, py]) => [ox + px, ab - py] }), anib, sp, ink);
      y = ab + acap * 1.2;
    }
    if (q.divider !== false) {
      const dy = y + cap * 0.1, w = Math.min(maxW * 0.3, cap * 4), dn = nib * 0.7, r = cap * 0.14;
      const dia = [[cx - r, dy], [cx, dy - r * 1.2], [cx + r, dy], [cx, dy + r * 1.2], [cx - r, dy]];
      this.queue([[[cx - w, dy], [cx - r * 1.8, dy]], dia, [[cx + r * 1.8, dy], [cx + w, dy]]], dn, sp, ink);
    }
    this.jobSec = q.sec ?? 12;
    return true;
  }

  mk(pts, nib, speed, color) { return { k: 'stroke', pts: pts.map(p => [Math.min(this.d.P.W, Math.max(0, p[0])), Math.min(this.d.P.H, Math.max(0, p[1])), p[2]]), nib, speed, travel: speed * 2.4, zv: 0.12, mc: 0.03, color }; }
  queue(strokes, nib, speed, color) { for (const s of strokes) if (s.length > 1) this.steps.push(this.mk(s, nib, speed, color)); }

  async start(job) {
    this.job = job; this.busy = true; this.steps = []; this.planning = true;
    let ok = false;
    this.tier = null; this.jobSec = 6;
    try { ok = job.type === 'name' ? await this.planName(job) : job.type === 'quote' ? await this.planQuote(job) : await this.planDonor(job); }
    catch (e) { console.error('plan lỗi', e); }
    this.planning = false;
    if (!ok) { this.busy = false; this.job = null; return false; }
    this.fitTime(job.type === 'donor' ? (this.tier?.sec ?? 6) : this.jobSec);
    this.steps.push({ k: 'done' });
    this.hooks.onJobStart && this.hooks.onJobStart(job, this.tier);
    return true;
  }
  // ước lượng thời gian rồi tăng tốc đều để viết xong trong <= sec giây
  estimate(strokes) {
    let u = this.pen.u, v = this.pen.v, down = false, t = 0;
    for (const st of strokes) {
      const d = Math.hypot(st.pts[0][0] - u, st.pts[0][1] - v);
      if (!(d < st.nib * 0.6 && down)) { const lift = d < 0.01 ? 0.002 : d < 0.04 ? 0.004 : LIFT; t += (down ? lift : 0) / st.zv + lift / st.zv + d / st.travel + st.mc; }
      for (let i = 1; i < st.pts.length; i++) t += Math.hypot(st.pts[i][0] - st.pts[i - 1][0], st.pts[i][1] - st.pts[i - 1][1]) / st.speed;
      [u, v] = st.pts[st.pts.length - 1]; down = true;
    }
    return t;
  }
  fitTime(sec) {
    const limit = Math.min(60, Math.max(1, +sec || 6));
    const strokes = this.steps.filter(s => s.k === 'stroke'); if (!strokes.length) return;
    const t = this.estimate(strokes);
    const k = t / (limit * 0.96);
    if (k > 1) for (const st of strokes) { st.speed *= k; st.travel *= k; st.zv *= k; st.mc /= k; }
    this.lastEstimate = Math.min(t, limit);
  }

  afterJob(job) {
    const box = this.sheet.trackStop();
    const g = this.cfg().glow || {};
    const kind = job && (job.type || 'donor');
    if (job && box && g.enabled !== false && (g.types || {})[kind] !== false) this.sheet.glow(box, { sec: g.sec ?? 2.4, color: g.color || '#ffc94a', strength: g.strength ?? 1.2 });
  }
  newSheet() { if (this.busy) { this.wantNew = true; return; } this.row = null; this.steps.push({ k: 'swap' }, { k: 'call', fn: () => { this.used = 0; this.row = null; } }, { k: 'done', silent: true }); this.busy = true; }
  clearSheet() { this.sheet.clear(); this.used = 0; this.row = null; }

  // ---------------- chuyển động (gọi mỗi khung hình)
  tick(dt) {
    this.t += dt;
    const u0 = this.pen.u, v0 = this.pen.v;
    let budget = dt, guard = 0;
    while (budget > 1e-6 && guard++ < 6000) {
      if (!this.step) { this.step = this.steps.shift() || null; if (!this.step) break; this.prep(this.step); }
      const st = this.step;
      if (st.k === 'stroke') {
        if (st.phase === 'lift') { budget = this.zTo(st.lift, budget, st.zv); if (this.pen.z >= st.lift - 1e-7) st.phase = 'move'; continue; }
        if (st.phase === 'move') {
          const [tu, tv] = st.pts[0];
          if (!st.mv) { const d = Math.hypot(tu - this.pen.u, tv - this.pen.v); st.mv = { u0: this.pen.u, v0: this.pen.v, T: d / st.travel + st.mc, t: 0 }; }
          const mv = st.mv; const use = Math.min(budget, mv.T - mv.t); mv.t += use; budget -= use;
          const q = mv.t / mv.T, e = q * q * (3 - 2 * q);
          this.pen.u = mv.u0 + (tu - mv.u0) * e; this.pen.v = mv.v0 + (tv - mv.v0) * e;
          if (mv.t >= mv.T - 1e-9) st.phase = 'lower';
          continue;
        }
        if (st.phase === 'lower') { budget = this.zTo(0, budget, st.zv); if (this.pen.z <= 1e-7) { st.phase = 'draw'; st.i = 1; } continue; }
        if (st.phase === 'draw') {
          if (st.alpha === undefined) st.alpha = 0.86 + Math.random() * 0.14;
          let dist = budget * st.speed; const sh = this.sheet;
          while (dist > 0 && st.i < st.pts.length) {
            const p = st.pts[st.i]; const prev = st.pts[st.i - 1];
            const dx = p[0] - this.pen.u, dy = p[1] - this.pen.v; const d = Math.hypot(dx, dy);
            const w = ((p[2] ?? st.nib) + (prev[2] ?? st.nib)) / 2;
            if (d <= dist) { sh.drawSeg(this.pen.u, this.pen.v, p[0], p[1], w, st.color, st.alpha); this.pen.u = p[0]; this.pen.v = p[1]; dist -= d; st.i++; }
            else { const nu = this.pen.u + dx / d * dist, nv = this.pen.v + dy / d * dist; sh.drawSeg(this.pen.u, this.pen.v, nu, nv, w, st.color, st.alpha); this.pen.u = nu; this.pen.v = nv; dist = 0; }
          }
          budget = dist / st.speed;
          if (st.i >= st.pts.length) this.step = null; else budget = 0;
          continue;
        }
      } else if (st.k === 'swap') {
        // nhấc bút về chỗ đỗ rồi thay giấy
        if (!st.started) {
          const pk = this.park();
          if (this.pen.z < 0.03) { budget = this.zTo(0.03, budget, 0.15); continue; }
          if (!st.mv) { const d = Math.hypot(pk[0] - this.pen.u, pk[1] - this.pen.v); st.mv = { u0: this.pen.u, v0: this.pen.v, T: d / 0.35 + 0.2, t: 0 }; }
          const mv = st.mv; const use = Math.min(budget, mv.T - mv.t); mv.t += use; budget -= use;
          const q = mv.t / mv.T, e = q * q * (3 - 2 * q);
          this.pen.u = mv.u0 + (pk[0] - mv.u0) * e; this.pen.v = mv.v0 + (pk[1] - mv.v0) * e;
          if (mv.t < mv.T - 1e-9) continue;
          st.started = true; st.fin = false;
          this.d.swap(this.cfg().sheet?.swapSec ?? 2.4).then(() => { st.fin = true; });
          this.hooks.onSheet && this.hooks.onSheet();
        }
        if (st.fin) this.step = null; else budget = 0;
      } else if (st.k === 'call') { st.fn(); this.step = null; }
      else if (st.k === 'wait') { st.t = (st.t || 0) + budget; budget = 0; if (st.t >= st.T) this.step = null; }
      else if (st.k === 'done') {
        this.step = null; this.busy = false; const j = this.job; this.job = null;
        if (!st.silent) { this.afterJob(j); this.hooks.onJobDone && this.hooks.onJobDone(j, this.tier); }
        if (this.wantNew) { this.wantNew = false; this.newSheet(); }
        break;
      }
    }
    // rảnh: bút về chỗ đỗ, lơ lửng nhẹ
    if (!this.busy && !this.step && !this.steps.length) {
      this.idleT += dt;
      if (this.idleT > (this.cfg().writer.gapAfterSec ?? 0.6)) {
        const k = 1 - Math.exp(-dt * 1.4); const pk = this.park(); const t = this.t;
        const tu = pk[0] + Math.sin(t * 0.37) * 0.006, tv = pk[1] + Math.sin(t * 0.23) * 0.008, tz = pk[2] + Math.sin(t * 0.6) * 0.003;
        this.pen.u += (tu - this.pen.u) * k; this.pen.v += (tv - this.pen.v) * k; this.pen.z += (tz - this.pen.z) * k;
      } else if (this.pen.z < LIFT) this.pen.z = Math.min(LIFT, this.pen.z + dt * 0.1);
    } else this.idleT = 0;
    const vu = dt > 0 ? (this.pen.u - u0) / dt : 0, vv = dt > 0 ? (this.pen.v - v0) / dt : 0;
    this.d.setPen(this.pen.u, this.pen.v, this.pen.z, vu, vv, dt, this.t);
  }
  prep(st) {
    if (st.k !== 'stroke') return;
    const [u, v] = st.pts[0]; const d = Math.hypot(u - this.pen.u, v - this.pen.v);
    st.lift = d < 0.01 ? 0.002 : d < 0.04 ? 0.004 : LIFT;
    const near = d < st.nib * 0.6 && this.pen.z < 0.0005;
    st.phase = near ? 'draw' : (this.pen.z < st.lift - 1e-7 ? 'lift' : 'move'); st.i = 1;
  }
  zTo(z, budget, v) {
    const d = z - this.pen.z; const need = Math.abs(d) / v;
    if (need <= budget) { this.pen.z = z; return budget - need; }
    this.pen.z += Math.sign(d) * v * budget; return 0;
  }
}
