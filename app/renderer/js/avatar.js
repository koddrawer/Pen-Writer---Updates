// Chuyển ảnh đại diện thành nét bút: đan nét nhiều lớp (crosshatch) theo độ tối + viền nét chính của khuôn mặt.
// Kết quả: polyline trong toạ độ giấy (u, v – mét), bút vẽ lại như một bức ký hoạ mực.

const cache = new Map();   // url -> Promise<{ lum, N }>

function loadImage(url) {
  return new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => rej(new Error('ảnh lỗi')); im.src = url; });
}

// ảnh -> lưới độ sáng N×N (cắt vuông giữa, tăng tương phản, làm mịn nhẹ)
async function luminance(url, N) {
  const key = url + '|' + N;
  if (!cache.has(key)) cache.set(key, (async () => {
    const im = await loadImage(url);
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const c = cv.getContext('2d');
    const s = Math.min(im.naturalWidth, im.naturalHeight);
    c.fillStyle = '#fff'; c.fillRect(0, 0, N, N);
    c.filter = 'blur(0.6px)';
    c.drawImage(im, (im.naturalWidth - s) / 2, (im.naturalHeight - s) / 2, s, s, 0, 0, N, N);
    const d = c.getImageData(0, 0, N, N).data;
    const lum = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) lum[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255;
    // kéo giãn tương phản theo phân vị 3% – 97% trong vòng tròn
    const inside = []; const R = N / 2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x - R + 0.5) ** 2 + (y - R + 0.5) ** 2 < R * R) inside.push(lum[y * N + x]);
    inside.sort((a, b) => a - b);
    const lo = inside[Math.floor(inside.length * 0.03)] ?? 0, hi = inside[Math.floor(inside.length * 0.97)] ?? 1;
    for (let i = 0; i < lum.length; i++) lum[i] = Math.pow(Math.min(1, Math.max(0, (lum[i] - lo) / Math.max(0.05, hi - lo))), 0.8);
    return { lum, N };
  })().catch(e => { cache.delete(key); throw e; }));
  return cache.get(key);
}

/**
 * url: ảnh; cx, cy: tâm trên giấy (m); D: đường kính (m); detail: 0.6 – 1.6 (mật độ nét)
 * trả về { strokes: [[ [u,v], ... ]], nib }
 */
export async function avatarStrokes(url, { cx, cy, D, detail = 1 }) {
  const N = 112;
  const { lum } = await luminance(url, N);
  const R = N / 2;
  const at = (x, y) => { const xi = Math.min(N - 1, Math.max(0, x | 0)), yi = Math.min(N - 1, Math.max(0, y | 0)); return lum[yi * N + xi]; };
  const inC = (x, y) => (x - R) ** 2 + (y - R) ** 2 < (R - 0.8) ** 2;
  const lines = Math.round(58 * detail);            // số đường quét qua đường kính
  const sp = N / lines;
  // lớp đan nét: góc quét + ngưỡng tối (vùng càng tối càng nhiều lớp)
  const layers = [
    { a: Math.PI / 4, t: 0.78, off: 0 },
    { a: -Math.PI / 4, t: 0.6, off: 0.5 },
    { a: 0, t: 0.43, off: 0.25 },
    { a: Math.PI / 2, t: 0.28, off: 0.75 },
    { a: Math.PI / 8, t: 0.15, off: 0.4 },
  ];
  const px = [];
  for (const L of layers) {
    const ca = Math.cos(L.a), sa = Math.sin(L.a);
    const nx = -sa, ny = ca;              // pháp tuyến của đường quét
    let flip = false;
    for (let k = -R; k <= R; k += sp) {
      const off = k + L.off * sp;
      const ox = R + nx * off, oy = R + ny * off;
      // đi dọc đường quét, gom các đoạn đủ tối
      const segs = []; let cur = null;
      for (let t = -R; t <= R; t += 0.5) {
        const x = ox + ca * t, y = oy + sa * t;
        const dark = inC(x, y) && at(x, y) < L.t;
        if (dark && !cur) cur = [[x, y]];
        else if (!dark && cur) { cur.push([x - ca * 0.5, y - sa * 0.5]); segs.push(cur); cur = null; }
      }
      if (cur) { segs.push(cur); }
      const keep = segs.filter(s => s.length > 1 && Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) > 1.2);
      // quét zigzag cho bút đỡ phải chạy xa
      if (flip) keep.reverse().forEach(s => s.reverse());
      px.push(...keep); flip = !flip;
    }
  }
  // viền nét chính: đường đồng mức độ sáng (mắt, tóc, khuôn mặt) – nét liền mảnh
  px.push(...contours(lum, N, 0.36, inC).filter(c => c.length > 5));
  const k = D / N;
  const toP = ([x, y]) => [cx + (x - R) * k, cy + (y - R) * k];
  return { strokes: px.map(s => s.map(toP)), nib: Math.max(0.0002, sp * k * 0.42) };
}

// đường đồng mức bằng marching squares, nối thành polyline, bỏ đoạn quá ngắn
function contours(lum, N, iso, inC) {
  const segs = [];
  const v = (x, y) => lum[y * N + x];
  for (let y = 0; y < N - 1; y += 1) for (let x = 0; x < N - 1; x += 1) {
    if (!inC(x + 0.5, y + 0.5)) continue;
    const a = v(x, y), b = v(x + 1, y), c = v(x + 1, y + 1), d = v(x, y + 1);
    const code = (a < iso) | ((b < iso) << 1) | ((c < iso) << 2) | ((d < iso) << 3);
    if (code === 0 || code === 15) continue;
    const ip = (p, q, P, Q) => { const t = (iso - p) / ((q - p) || 1e-6); return [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]; };
    const T = ip(a, b, [x, y], [x + 1, y]), Rr = ip(b, c, [x + 1, y], [x + 1, y + 1]), B = ip(d, c, [x, y + 1], [x + 1, y + 1]), Lf = ip(a, d, [x, y], [x, y + 1]);
    const E = { 1: [[Lf, T]], 2: [[T, Rr]], 3: [[Lf, Rr]], 4: [[Rr, B]], 5: [[Lf, T], [Rr, B]], 6: [[T, B]], 7: [[Lf, B]], 8: [[Lf, B]], 9: [[T, B]], 10: [[T, Rr], [Lf, B]], 11: [[Rr, B]], 12: [[Lf, Rr]], 13: [[T, Rr]], 14: [[Lf, T]] }[code];
    if (E) segs.push(...E);
  }
  // nối các đoạn thành đường
  const key = (p) => Math.round(p[0] * 100) + ',' + Math.round(p[1] * 100);
  const map = new Map();
  segs.forEach((s, i) => { for (const p of s) { const k = key(p); if (!map.has(k)) map.set(k, []); map.get(k).push(i); } });
  const used = new Uint8Array(segs.length); const out = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = 1;
    const line = [segs[i][0], segs[i][1]];
    for (const dir of [1, 0]) {
      let guard = 0;
      while (guard++ < 5000) {
        const end = dir ? line[line.length - 1] : line[0];
        const nb = (map.get(key(end)) || []).find(j => !used[j]); if (nb === undefined) break;
        used[nb] = 1; const s = segs[nb]; const nxt = key(s[0]) === key(end) ? s[1] : s[0];
        if (dir) line.push(nxt); else line.unshift(nxt);
      }
    }
    if (line.length > 4) out.push(line.filter((_, j) => j % 2 === 0 || j === line.length - 1));
  }
  return out;
}

// hình người mặc định khi không có ảnh đại diện
export function silhouetteStrokes({ cx, cy, D }) {
  const r = D / 2; const out = [];
  const circ = (x, y, rr, a0 = 0, a1 = Math.PI * 2, n = 40) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]); } return p; };
  out.push(circ(cx, cy - r * 0.22, r * 0.3));
  out.push(circ(cx, cy + r * 0.75, r * 0.62, Math.PI * 1.08, Math.PI * 1.92));
  return { strokes: out, nib: Math.max(0.0004, D * 0.012) };
}
