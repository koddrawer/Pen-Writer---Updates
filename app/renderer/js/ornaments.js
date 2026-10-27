// Hoa văn trang trí quanh tên người tặng – sinh bằng nét (bút vẽ được), toạ độ giấy: u sang phải, v xuống dưới (mét).
// Mỗi kiểu trả về: { strokes: [[ [u,v,w], ... ]], fills: [polygon] } – w = bề rộng nét tại điểm (m).

export const ORNAMENTS = {
  none:      { name: 'Không hoa văn', pad: { t: 0, b: 0, s: 0 } },
  underline: { name: 'Gạch chân bay', pad: { t: 0, b: 0.6, s: 0.1 } },
  swash:     { name: 'Nét bay cuộn hai đầu', pad: { t: 0, b: 0.8, s: 0.55 } },
  vines:     { name: 'Dây lá cuộn hai bên', pad: { t: 0.15, b: 0.6, s: 1.3 } },
  laurel:    { name: 'Vòng nguyệt quế', pad: { t: 0.45, b: 0.75, s: 1.0 } },
  frame:     { name: 'Khung hoa văn', pad: { t: 0.7, b: 0.75, s: 0.95 } },
  royal:     { name: 'Khung + vương miện', pad: { t: 1.55, b: 0.95, s: 1.35 } },
};

// ---------- hình học cơ bản
const lerp = (a, b, t) => a + (b - a) * t;
function bez(p0, p1, p2, p3, n = 28) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}
const join = (...parts) => parts.reduce((a, p) => a.concat(a.length ? p.slice(1) : p), []);
// xoắn ốc: tâm (cx,cy), bán kính r0 -> r1, góc bắt đầu a0, số vòng, chiều (1: thuận chiều kim đồng hồ trên giấy)
function spiral(cx, cy, r0, r1, a0, turns, dir = 1, n = 40) {
  const out = []; const N = Math.max(12, Math.round(n * turns));
  for (let i = 0; i <= N; i++) { const t = i / N; const a = a0 + dir * t * turns * Math.PI * 2; const r = lerp(r0, r1, Math.pow(t, 0.85));
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}
// đường cong kết thúc bằng một vòng cuộn: điểm đầu p0, hướng tới điểm cuộn (cx,cy) bán kính r
function curlTo(p0, c1, cx, cy, r, a0, turns, dir) {
  const sp = spiral(cx, cy, r, r * 0.12, a0, turns, dir);
  const s0 = sp[0]; const ta = a0 + dir * Math.PI / 2;           // tiếp tuyến tại điểm vào vòng cuộn
  const c2 = [s0[0] - Math.cos(ta) * r * 1.2, s0[1] - Math.sin(ta) * r * 1.2];
  return join(bez(p0, c1, c2, s0, 24), sp);
}
// gán bề rộng nét: dày ở giữa, mảnh hai đầu
function taper(pts, wMax, w0 = 0.25, w1 = 0.15) {
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const T = L[L.length - 1] || 1;
  return pts.map((p, i) => { const t = L[i] / T; const prof = Math.sin(Math.PI * Math.min(1, t * 1.15)) ; const e = t < 0.5 ? lerp(w0, 1, prof) : lerp(w1, 1, prof);
    return [p[0], p[1], Math.max(wMax * 0.18, wMax * e)]; });
}
const mirror = (st, cx) => st.map(p => [2 * cx - p[0], p[1], p[2]]);
const mirrorY = (st, cy) => st.map(p => [p[0], 2 * cy - p[1], p[2]]);
// lá: gốc (x,y), góc a, dài L, rộng w -> đa giác kín
function leaf(x, y, a, L, w) {
  const ca = Math.cos(a), sa = Math.sin(a), nx = -sa, ny = ca;
  const tip = [x + ca * L, y + sa * L];
  const side = (s) => bez([x, y], [x + ca * L * 0.25 + nx * w * s, y + sa * L * 0.25 + ny * w * s], [x + ca * L * 0.7 + nx * w * 0.9 * s, y + sa * L * 0.7 + ny * w * 0.9 * s], tip, 14);
  const A = side(1), B = side(-1).reverse();
  return A.concat(B.slice(1));
}
function diamond(cx, cy, r) { return [[cx - r, cy], [cx, cy - r * 1.3], [cx + r, cy], [cx, cy + r * 1.3], [cx - r, cy]]; }
function dot(cx, cy, r) { const o = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; }
// điểm + tiếp tuyến trên polyline theo tỉ lệ độ dài
function along(pts, t) {
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const target = t * L[L.length - 1];
  let i = 1; while (i < pts.length - 1 && L[i] < target) i++;
  const a = pts[i - 1], b = pts[i]; const k = (target - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
  return { p: [lerp(a[0], b[0], k), lerp(a[1], b[1], k)], ang: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}

// ---------- từng kiểu
// box: { x0, x1, top, bot, cx, cap } – khung chữ (tên + dòng phụ)
function underline(b, out) {
  const c = b.cap, w = c * 0.075;
  const y = b.bot + c * 0.28;
  const p0 = [b.x0 - c * 0.2, y + c * 0.05];
  const main = curlTo(p0, [lerp(b.x0, b.x1, 0.35), y + c * 0.32], b.x1 + c * 0.08, y - c * 0.12, c * 0.13, Math.PI / 2, 1.1, -1);
  out.strokes.push(taper(main, w, 0.15, 0.3));
}
function swash(b, out) {
  const c = b.cap, w = c * 0.07, cy = b.bot + c * 0.42;
  const right = curlTo([b.cx + c * 0.25, cy], [lerp(b.cx, b.x1, 0.6), cy + c * 0.22], b.x1 + c * 0.22, b.bot - c * 0.12, c * 0.2, Math.PI / 2, 1.25, -1);
  const R = taper(right, w, 0.2, 0.25);
  out.strokes.push(R, mirror(R, b.cx));
  out.fills.push(diamond(b.cx, cy, c * 0.09));
  out.fills.push(dot(b.cx - c * 0.24, cy, c * 0.025), dot(b.cx + c * 0.24, cy, c * 0.025));
}
function scrollSide(b, out, w, withLeaves = true) {
  const c = b.cap, my = (b.top + b.bot) / 2;
  // cuộn chữ S phía phải: đi từ sát chữ ra ngoài, cuộn vào trong
  const sx = b.x1 + c * 0.18;
  const S = curlTo([sx, my + c * 0.1], [sx + c * 0.5, my + c * 0.55], sx + c * 0.78, my - c * 0.05, c * 0.24, Math.PI * 0.9, 1.15, 1);
  const R = taper(S, w, 0.2, 0.3);
  out.strokes.push(R, mirror(R, b.cx));
  if (withLeaves) {
    for (const [t, side, len] of [[0.16, -1, 0.5], [0.34, 1, 0.44], [0.52, -1, 0.34]]) {
      const { p, ang } = along(S, t);
      const L = leaf(p[0], p[1], ang + side * 0.9, c * len, c * len * 0.32);
      out.fills.push(L, mirror(L.map(q => [q[0], q[1]]), b.cx));
    }
  }
  // tua nhỏ phía dưới
  const T = spiral(sx + c * 0.28, my + c * 0.42, c * 0.1, c * 0.015, -Math.PI * 0.6, 0.9, -1);
  const Tt = taper(T, w * 0.6, 0.6, 0.2);
  out.strokes.push(Tt, mirror(Tt, b.cx));
}
function vines(b, out) {
  const c = b.cap, w = c * 0.06;
  scrollSide(b, out, w, true);
  const y = b.bot + c * 0.35;
  const L = taper(bez([b.x0 + c * 0.1, y], [lerp(b.x0, b.cx, 0.5), y + c * 0.12], [lerp(b.x0, b.cx, 0.8), y - c * 0.05], [b.cx - c * 0.16, y], 20), w * 0.6, 0.1, 0.4);
  out.strokes.push(L, mirror(L, b.cx));
  out.fills.push(diamond(b.cx, y, c * 0.08));
}
function laurelBranch(b, out, w, reach = 1) {
  const c = b.cap; const cx = b.cx;
  const rx = (b.x1 - b.x0) / 2 + c * 0.75 * reach, ry = (b.bot - b.top) / 2 + c * 0.55;
  const ey = (b.top + b.bot) / 2 + c * 0.05;
  // cung từ đáy giữa lên mép phải
  const arc = []; const a0 = Math.PI * 0.56, a1 = -Math.PI * 0.32;
  for (let i = 0; i <= 40; i++) { const a = lerp(a0, a1, i / 40); arc.push([cx + Math.cos(a) * rx * (i === 0 ? 0.92 : 1) * Math.min(1, 0.25 + i / 12), ey + Math.sin(a) * ry]); }
  const stem = taper(arc, w, 0.4, 0.15);
  out.strokes.push(stem, mirror(stem, cx));
  const n = 8;
  for (let k = 1; k <= n; k++) {
    const t = 0.1 + 0.88 * k / n; const { p, ang } = along(arc, t);
    const len = c * (0.42 - 0.18 * t);
    for (const s of [1, -1]) {
      if (k === n && s === -1) continue;
      const L = leaf(p[0], p[1], ang + s * 0.62, len, len * 0.36);
      out.fills.push(L, mirror(L.map(q => [q[0], q[1]]), cx));
    }
  }
  return { ey, ry };
}
function laurel(b, out) {
  const c = b.cap, w = c * 0.055;
  const { ey, ry } = laurelBranch(b, out, w);
  // nơ dưới đáy
  const by = ey + ry * 0.93;
  const loop = [[b.cx, by], [b.cx + c * 0.22, by - c * 0.12], [b.cx + c * 0.26, by + c * 0.08], [b.cx, by]];
  const Lp = taper(bez(loop[0], loop[1], loop[2], loop[3], 18), w, 0.4, 0.4);
  out.strokes.push(Lp, mirror(Lp, b.cx));
  const tail = taper(bez([b.cx, by], [b.cx + c * 0.06, by + c * 0.12], [b.cx + c * 0.16, by + c * 0.2], [b.cx + c * 0.24, by + c * 0.3], 14), w, 0.6, 0.1);
  out.strokes.push(tail, mirror(tail, b.cx));
  out.fills.push(dot(b.cx, by, c * 0.045));
  // ba chấm trên đỉnh
  const ty = b.top - c * 0.28;
  out.fills.push(diamond(b.cx, ty, c * 0.06), dot(b.cx - c * 0.17, ty + c * 0.03, c * 0.025), dot(b.cx + c * 0.17, ty + c * 0.03, c * 0.025));
}
function frameRect(b, out, w) {
  const c = b.cap;
  const X0 = b.x0 - c * 0.62, X1 = b.x1 + c * 0.62, Y0 = b.top - c * 0.42, Y1 = b.bot + c * 0.42, r = c * 0.24;
  const rect = (x0, y0, x1, y1, r) => {
    // hình chữ nhật góc khuyết vào trong (cung lõm)
    const P = [];
    const arc = (cx, cy, a0, a1) => { for (let i = 0; i <= 8; i++) { const a = lerp(a0, a1, i / 8); P.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    P.push([x0 + r, y0]); P.push([x1 - r, y0]); arc(x1, y0, Math.PI, Math.PI / 2); P.push([x1, y1 - r]); arc(x1, y1, -Math.PI / 2, -Math.PI); P.push([x0 + r, y1]);
    arc(x0, y1, 0, -Math.PI / 2); P.push([x0, y0 + r]); arc(x0, y0, Math.PI / 2, 0);
    return P.map(p => [p[0], p[1], w]);
  };
  out.strokes.push(rect(X0, Y0, X1, Y1, r));
  const d = c * 0.1; const inner = rect(X0 + d, Y0 + d, X1 - d, Y1 - d, r * 0.7).map(p => [p[0], p[1], w * 0.45]);
  out.strokes.push(inner);
  // cuộn ở 4 góc (bên ngoài)
  const corner = (x, y, sx, sy) => {
    const s = spiral(x + sx * c * 0.16, y + sy * c * 0.16, c * 0.13, c * 0.02, Math.atan2(-sy, -sx), 1.1, sx * sy);
    return taper(s, w * 0.9, 0.5, 0.2);
  };
  out.strokes.push(corner(X0, Y0, -1, -1), corner(X1, Y0, 1, -1), corner(X0, Y1, -1, 1), corner(X1, Y1, 1, 1));
  // hoa văn giữa cạnh trên/dưới
  const mid = (y, s) => {
    const R = taper(curlTo([b.cx + c * 0.1, y], [b.cx + c * 0.3, y + s * c * 0.18], b.cx + c * 0.52, y - s * c * 0.02, c * 0.1, s > 0 ? Math.PI / 2 : -Math.PI / 2, 1, s > 0 ? -1 : 1), w * 0.9, 0.3, 0.2);
    out.strokes.push(R, mirror(R, b.cx)); out.fills.push(diamond(b.cx, y + s * c * 0.02, c * 0.075));
  };
  mid(Y0 - c * 0.18, -1); mid(Y1 + c * 0.18, 1);
  return { X0, X1, Y0, Y1 };
}
function frame(b, out) { frameRect(b, out, b.cap * 0.05); }
function crown(cx, baseY, size, w, out) {
  const s = size, h = s * 0.62;
  // đường viền vương miện: đáy + 5 răng
  const pts = [[cx - s * 0.5, baseY]];
  const tips = [-0.5, -0.25, 0, 0.25, 0.5];
  const tipH = [0.78, 0.6, 1, 0.6, 0.78];
  for (let i = 0; i < tips.length; i++) {
    const x = cx + tips[i] * s * 0.92, y = baseY - h * tipH[i];
    if (i > 0) { const vx = cx + (tips[i - 1] + tips[i]) / 2 * s * 0.92; pts.push([vx, baseY - h * 0.3]); }
    pts.push([x, y]);
  }
  pts.push([cx + s * 0.5, baseY]);
  out.strokes.push(pts.map(p => [p[0], p[1], w]));
  out.strokes.push([[cx - s * 0.52, baseY + s * 0.08, w], [cx + s * 0.52, baseY + s * 0.08, w]]);
  out.strokes.push([[cx - s * 0.5, baseY, w * 0.8], [cx + s * 0.5, baseY, w * 0.8]]);
  for (let i = 0; i < tips.length; i++) out.fills.push(dot(cx + tips[i] * s * 0.92, baseY - h * tipH[i] - s * 0.05, s * 0.045));
  out.fills.push(diamond(cx, baseY - h * 0.22, s * 0.05), diamond(cx - s * 0.27, baseY - h * 0.16, s * 0.035), diamond(cx + s * 0.27, baseY - h * 0.16, s * 0.035));
}
function royal(b, out) {
  const c = b.cap, w = c * 0.05;
  const F = frameRect(b, out, w);
  crown(b.cx, F.Y0 - c * 0.42, c * 1.25, w * 0.9, out);
  // cuộn lá hai bên khung
  const bb = { ...b, x0: F.X0 - c * 0.1, x1: F.X1 + c * 0.1 };
  const my = (F.Y0 + F.Y1) / 2;
  const sx = F.X1 + c * 0.05;
  const S = curlTo([sx, my], [sx + c * 0.35, my + c * 0.4], sx + c * 0.5, my - c * 0.1, c * 0.18, Math.PI * 0.9, 1.1, 1);
  const R = taper(S, w, 0.3, 0.3);
  out.strokes.push(R, mirror(R, b.cx));
  for (const [t, side, len] of [[0.2, -1, 0.3], [0.42, 1, 0.26]]) {
    const { p, ang } = along(S, t); const L = leaf(p[0], p[1], ang + side * 0.9, c * len, c * len * 0.32);
    out.fills.push(L, mirror(L, b.cx));
  }
  // nơ / dải lụa dưới đáy
  const by = F.Y1 + c * 0.5;
  const rib = taper(bez([b.cx - c * 0.9, by - c * 0.05], [b.cx - c * 0.4, by + c * 0.22], [b.cx + c * 0.4, by - c * 0.22], [b.cx + c * 0.9, by + c * 0.05], 30), w, 0.2, 0.2);
  out.strokes.push(rib);
  void bb;
}

const BUILD = { underline, swash, vines, laurel, frame, royal };

export function buildOrnament(style, box) {
  const out = { strokes: [], fills: [] };
  const f = BUILD[style]; if (f) f(box, out);
  return out;
}
export function ornamentPad(style) { return (ORNAMENTS[style] || ORNAMENTS.none).pad; }
