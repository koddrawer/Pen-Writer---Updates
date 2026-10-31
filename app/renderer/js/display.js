// Màn hiển thị 9:16: cảnh bàn viết, nhận việc từ core, chạy bút viết, nhạc nền, voice cảm ơn.
import * as THREE from 'three';
import { OrbitControls } from '../lib/addons/controls/OrbitControls.js';
import { RoomEnvironment } from '../lib/addons/environments/RoomEnvironment.js';
import { EffectComposer } from '../lib/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../lib/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../lib/addons/postprocessing/OutputPass.js';
import { ShaderPass } from '../lib/addons/postprocessing/ShaderPass.js';
import { Desk } from './desk.js';
import { Writer } from './writer.js';
import { loadChain } from './text.js';
import { Music } from './music.js';
import { Voice } from './voice.js';
import { Dust } from './dust.js';

const api = window.api;
const $ = (id) => document.getElementById(id);
const errBox = $('err');
window.addEventListener('error', e => { errBox.textContent = String(e.message || e); });
window.addEventListener('unhandledrejection', e => { errBox.textContent = String(e.reason && e.reason.stack || e.reason); });

let cfg = await api.getConfig();
const getCfg = () => cfg;

// ---------- renderer / cảnh
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0907);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(20, 9 / 16, 0.02, 40);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.screenSpacePanning = true;

// bloom chọn lọc: chỉ chữ ánh vàng trên giấy toả sáng (các vật khác – nắp bút kim loại… – bị che đen khi tính bloom)
const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 0.15);
bloomComposer.addPass(bloom);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const mixPass = new ShaderPass(new THREE.ShaderMaterial({
  uniforms: { baseTexture: { value: null }, bloomTexture: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv; void main() { gl_FragColor = texture2D(baseTexture, vUv) + vec4(texture2D(bloomTexture, vUv).rgb, 0.0); }',
}), 'baseTexture');
mixPass.needsSwap = true;
composer.addPass(mixPass);
composer.addPass(new OutputPass());
const darkMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
const BLACK = new THREE.Color(0);

// ---------- bàn viết
const bar = $('bar').firstElementChild;
const desk = await new Desk(scene).load(p => { bar.style.width = Math.round(p * 100) + '%'; });
const meta = desk.meta;

// ---- đèn: nắng qua cửa sổ (theo model) + trời + đèn bàn ấm
const sunMeta = (meta.lights || []).find(l => l.type === 'SUN');
const sunDir = new THREE.Vector3().fromArray(sunMeta ? sunMeta.dir : [-0.4, -0.5, 0.77]).normalize();
const focus = desk.sheetCenter.clone();
const sun = new THREE.DirectionalLight(0xfff1dc, 4);
sun.position.copy(focus).addScaledVector(sunDir, -6); sun.target.position.copy(focus);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.004;
Object.assign(sun.shadow.camera, { left: -0.9, right: 0.9, top: 0.9, bottom: -0.9, near: 2, far: 10 });
const hemi = new THREE.HemisphereLight(0xffeedd, 0x3a2418, 0.55);
const lampPos = new THREE.Vector3(0.6, 0.69, -0.08);
const lamp = new THREE.PointLight(0xffb36b, 0.5, 2.2, 2); lamp.position.copy(lampPos);
const fill = new THREE.DirectionalLight(0xffd9b0, 0.35); fill.position.copy(focus).add(new THREE.Vector3(0.4, 1.4, 1.6)); fill.target.position.copy(focus);
scene.add(sun, sun.target, hemi, lamp, fill, fill.target);
// ---- hạt bụi lơ lửng
const dust = new Dust(scene, { center: desk.sheetCenter, sunDir });

// ---- camera
const DEFAULT_CAMS = { main: { ...meta.camera } };
const camOf = (name) => (cfg.display.cameras && cfg.display.cameras[name]) || DEFAULT_CAMS[name] || DEFAULT_CAMS.main;
// dừng quán tính (damping) để camera đứng yên ngay khi khoá
function stopInertia() { const d = controls.enableDamping; controls.enableDamping = false; controls.update(); controls.enableDamping = d; }
function applyCam(c) { camera.position.fromArray(c.pos); controls.target.fromArray(c.target); camera.fov = c.fov || 20; camera.updateProjectionMatrix(); controls.update(); }
let tween = null;
function tweenCam(c, sec = 1.4) {
  tween = { t: 0, T: sec, p0: camera.position.clone(), t0: controls.target.clone(), f0: camera.fov,
    p1: new THREE.Vector3().fromArray(c.pos), t1: new THREE.Vector3().fromArray(c.target), f1: c.fov || camera.fov };
}
applyCam(camOf('main'));

function applyDisplayCfg() {
  const d = cfg.display;
  renderer.setPixelRatio((window.devicePixelRatio || 1) * (d.renderScale || 1));
  resize();
  renderer.shadowMap.enabled = d.shadows !== false; sun.castShadow = d.shadows !== false;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  sun.intensity = 4 * (d.sun ?? 1);
  hemi.intensity = 0.55 * (d.ambient ?? 1); scene.environmentIntensity = 0.35 * (d.ambient ?? 1); fill.intensity = 0.35 * (d.ambient ?? 1);
  lamp.visible = d.lamp !== false;
  renderer.toneMappingExposure = d.exposure ?? 1;
  bloom.strength = d.bloom ?? 0.35;
  $('vig').style.opacity = String(d.vignette ?? 0.45);
  dust.set(d.dust || {});
  controls.enabled = d.mouseCamera !== false && !rotated();   // xoay khung: chỉnh camera ở chế độ thường
  if (!controls.enabled) stopInertia();
  try { updateCamBar(); } catch { }   // lần đầu (trước khi tạo thanh camera) bỏ qua
  document.body.classList.toggle('drag', !!d.dragWindow);
}
// xoay 90°: cửa sổ ngang 16:9 chứa khung dọc 9:16 (để màn hình Full HD vẫn xuất được 1080×1920 sắc nét)
const rotated = () => [90, -90].includes(+cfg.display.rotate);
function resize() {
  const rot = rotated();
  document.body.classList.toggle('rot', +cfg.display.rotate === -90);
  document.body.classList.toggle('rotR', +cfg.display.rotate === 90);
  const w = rot ? window.innerHeight : window.innerWidth, h = rot ? window.innerWidth : window.innerHeight;
  renderer.setSize(w, h, false); for (const c of [composer, bloomComposer]) { c.setPixelRatio(renderer.getPixelRatio()); c.setSize(w, h); }
  bloom.resolution.set(Math.round(w / 2), Math.round(h / 2));
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
applyDisplayCfg();

// ---------- font
// dự phòng: Latin/Việt, rồi tới Nga, Ả Rập, Hàn, Hán, Nhật (tên người xem nước ngoài cũng viết được)
const FALLBACK = ['playfair-display-vietnamese-700-normal.woff', 'dancing-script-vietnamese-700-normal.woff', 'playfair-display-latin-ext-700-normal.woff', 'playfair-display-latin-700-normal.woff',
  'marck-script-cyrillic.woff', 'marhey-arabic.woff', 'nanum-brush-script-ko.woff', 'ma-shan-zheng-cjk.woff', 'yuji-syuku-cjk.woff'].map(f => '../assets/fonts/' + f);
const fonts = {
  cache: new Map(),
  urlsFor(id) {
    const f = (cfg.fonts || []).find(x => x.id === id) || (cfg.fonts || [])[0];
    if (!f) return FALLBACK;
    const own = f.builtin ? f.files.map(x => '../assets/fonts/' + x) : [api.mediaUrl(f.file)];
    return [...own, ...FALLBACK];
  },
  async chain(id) { const urls = this.urlsFor(id); const k = urls.join('|'); if (!this.cache.has(k)) this.cache.set(k, loadChain(urls)); return this.cache.get(k); },
};

// ---------- giấy + bút
const S = cfg.sheet || {};
desk.makeSheets({ pxPerM: S.pxPerM || 4200, ink: cfg.writer.inkColor, tint: S.tint, grain: S.grain ?? 1 });
const music = new Music($('mus1'), $('mus2'), api, getCfg);
const voice = new Voice(api, getCfg, music);
const writer = new Writer(desk, fonts, getCfg, {
  onJobStart: (job, tier) => { report(); if (job.type === 'donor' && (cfg.voice.when || 'start') === 'start') voice.say(job, tier); },
  onJobDone: (job, tier) => {
    if (job) api.send('display:jobDone', { id: job.id, name: job.name, tier: tier && tier.name });
    if (job && job.type === 'donor' && cfg.voice.when === 'end') voice.say(job, tier);
    report();
  },
  onSheet: () => api.send('display:sheet', {}),
});
$('loading').classList.add('hide');
api.send('display:ready', {});

// ---------- hàng đợi (core giữ hàng, màn hiển thị xin việc khi rảnh)
let asking = false, lastAsk = 0;
async function pull() {
  if (writer.busy || asking) return;
  asking = true; lastAsk = performance.now();
  try {
    const job = await api.invoke('job:next');
    if (job) { const ok = await writer.start(job); report(); if (!ok) api.send('display:jobDone', { id: job.id, skipped: true }); }
  } finally { asking = false; }
}
function report() { api.send('display:status', { busy: writer.busy, job: writer.job && { type: writer.job.type, name: writer.job.written || writer.job.name, tier: writer.job.tierName } }); }
api.on('job:available', () => pull());

api.on('config', (c) => {
  const old = cfg; cfg = c;
  applyDisplayCfg(); music.sync();
  const os = old.sheet || {}, ns = c.sheet || {};
  desk.setSheetOpts({ tint: ns.tint !== os.tint ? ns.tint : null, grain: ns.grain !== os.grain ? ns.grain ?? 1 : null, ink: c.writer.inkColor });
  fonts.cache.clear();
});
api.on('voice:greet', (u) => voice.greet(u));
api.on('voice:test', (o) => {
  if (o.greet) return voice.greet({ name: o.name || 'Minh Anh', id: 'test-' + Date.now() }, true);
  const tier = (cfg.tiers || []).find(t => t.id === o.tierId) || (cfg.tiers || [])[0];
  voice.say({ name: o.name || 'Minh Anh', written: o.name || 'Minh Anh', gift: o.gift || 'Hoa hồng', count: 1, total: tier ? tier.min : 1 }, tier, true);
});
api.on('display:cmd', (m) => {
  if (m.cmd === 'newSheet') writer.newSheet();
  if (m.cmd === 'clearSheet') writer.clearSheet();
  if (m.cmd === 'glowTest') { const g = cfg.glow || {}; desk.sheet.glow(desk.sheet.lastBox, { sec: g.sec ?? 2.4, color: g.color || '#ffc94a', strength: g.strength ?? 1.2 }); }
  if (m.cmd === 'camera') tweenCam(camOf(m.name || 'main'), m.sec ?? 1.2);
  if (m.cmd === 'resetCamera') { tweenCam(DEFAULT_CAMS.main, 1); api.send('display:camera', { name: 'main', cam: null }); }
  if (m.cmd === 'saveCamera') saveCam();
  if (m.cmd === 'camMode') setCamMode(m.mode);
  if (m.cmd === 'zoom') zoomCam(m.f || 1);
});
const r4 = v => Math.round(v * 1e4) / 1e4;

// ---- chỉnh camera: xoay / di chuyển (kéo ngang dọc) / zoom; khoá lại để không lỡ tay làm lệch khi live
let camMode = 'rotate';
function setCamMode(m) {
  camMode = m;
  const pan = m === 'pan';
  controls.mouseButtons = { LEFT: pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: pan ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN };
  controls.touches = { ONE: pan ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  if (camBar) camBar.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === m));
}
function zoomCam(f) {
  const off = camera.position.clone().sub(controls.target);
  const len = THREE.MathUtils.clamp(off.length() * f, 0.05, 20);
  camera.position.copy(controls.target).add(off.setLength(len)); controls.update();
}
const saveCam = () => api.send('display:camera', { name: 'main', cam: { pos: camera.position.toArray().map(r4), target: controls.target.toArray().map(r4), fov: camera.fov } });
// thanh công cụ camera trên màn hình (bản điện thoại: chỉ hiện khi đang mở khoá camera)
let camBar = null;
if (api.platform === 'android') {
  const st = document.createElement('style');
  st.textContent = `#camBar{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:60;display:none;gap:6px;padding:6px;
    background:rgba(20,14,9,.88);border:1px solid #6a5232;border-radius:14px;font:600 13px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.5);flex-wrap:wrap;justify-content:center;max-width:94vw}
  #camBar.show{display:flex}
  #camBar button{background:#2a2015;color:#efe3cc;border:1px solid #4a3a26;border-radius:9px;padding:9px 11px;font:inherit;white-space:nowrap}
  #camBar button.on{background:#d6a95a;color:#1a120a;border-color:#d6a95a}
  #camBar button.lock{background:#7a3a24;border-color:#a0533a}
  #camBar .tip{width:100%;text-align:center;color:#a8977c;font-weight:400;font-size:11px}`;
  document.head.appendChild(st);
  camBar = document.createElement('div'); camBar.id = 'camBar';
  camBar.innerHTML = `<button data-m="rotate">⟳ Xoay</button><button data-m="pan">✥ Di chuyển</button><button data-z="0.88">＋</button><button data-z="1.14">－</button>
    <button data-a="save">💾 Lưu</button><button data-a="lock" class="lock">🔒 Khoá</button>
    <div class="tip">Kéo 1 ngón/chuột để xoay hoặc di chuyển · 2 ngón: zoom &amp; di chuyển · Khoá xong thanh này ẩn đi</div>`;
  document.body.appendChild(camBar);
  camBar.addEventListener('pointerdown', e => e.stopPropagation());
  camBar.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.m) setCamMode(b.dataset.m);
    if (b.dataset.z) zoomCam(+b.dataset.z);
    if (b.dataset.a === 'save') { stopInertia(); saveCam(); }
    if (b.dataset.a === 'lock') { stopInertia(); saveCam(); api.setConfig({ display: { mouseCamera: false } }); }
  });
}
function updateCamBar() { if (camBar) camBar.classList.toggle('show', controls.enabled); }
setCamMode('rotate'); updateCamBar();

// camera bám nhẹ theo ngòi bút (tuỳ chọn)
const followOff = new THREE.Vector3(), tmp = new THREE.Vector3();
function followPen(dt) {
  const f = (cfg.display.followPen ?? 0) / 100;
  if (tween) return;
  const want = new THREE.Vector3();
  if (f > 0 && writer.busy) { desk.paperToWorld(writer.pen.u, writer.pen.v, 0, tmp); want.copy(tmp).sub(desk.sheetCenter).multiplyScalar(f); want.y = 0; }
  const k = 1 - Math.exp(-dt * (writer.busy ? 2.5 : 1));
  const d = want.sub(followOff).multiplyScalar(k);
  followOff.add(d); camera.position.add(d); controls.target.add(d);
}
// bloom chỉ chạy khi có chữ đang ánh vàng (nhẹ máy, không làm loang sáng nét mực)
const sheetMeshes = new Set(desk.sheets.map(s => s.mesh)); const saved = new Map();
function render() {
  if (!(bloom.strength > 0.001 && desk.sheets.some(s => s.glowBox))) { renderer.render(scene, camera); return; }
  // lượt 1: chỉ giữ tờ giấy, mọi vật khác sơn đen (vẫn che khuất chữ đúng chỗ), tắt bụi + nền
  scene.traverse(o => { if (o.isMesh && !sheetMeshes.has(o)) { saved.set(o, o.material); o.material = darkMat; } });
  const bg = scene.background, dv = dust.points.visible; scene.background = BLACK; dust.points.visible = false;
  for (const sh of desk.sheets) sh.uniforms.bloomOnly.value = 1;
  bloomComposer.render();
  for (const sh of desk.sheets) sh.uniforms.bloomOnly.value = 0;
  mixPass.uniforms.bloomTexture.value = bloom.renderTargetsHorizontal[0].texture;   // chỉ phần quầng sáng
  for (const [o, m] of saved) o.material = m; saved.clear();
  scene.background = bg; dust.points.visible = dv;
  // lượt 2: cảnh thường + cộng quầng sáng
  composer.render();
}

// ---------- vòng lặp
const clock = new THREE.Clock();
let fpsT = 0, frames = 0;
function frame() {
  const raw = clock.getDelta(); const dt = Math.min(raw, 0.1);
  writer.tick(Math.min(raw, 0.25));   // máy yếu/khựng: bút vẫn viết đúng tốc độ
  desk.update(dt, performance.now());
  dust.update(dt, camera, renderer.domElement.height);
  if (tween) {
    tween.t += dt; const u = Math.min(1, tween.t / tween.T), e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.t0, tween.t1, e);
    camera.fov = tween.f0 + (tween.f1 - tween.f0) * e; camera.updateProjectionMatrix();
    if (u >= 1) tween = null;
  }
  followPen(dt);
  controls.update();
  render();
  if (!writer.busy && performance.now() - lastAsk > 400) pull();
  frames++; fpsT += raw; if (fpsT > 2) { api.send('display:fps', Math.round(frames / fpsT)); frames = 0; fpsT = 0; }
}
if (!window.__manual) renderer.setAnimationLoop(frame);

// tiện cho kiểm thử
window.__pw = { dust, desk, writer, camera, controls, scene, renderer, sun, hemi, lamp, voice, music, applyCam,
  async sim(sec, dt = 1 / 30) {
    const sl = (ms) => new Promise(r => setTimeout(r, ms)); const n = Math.round(sec / dt);
    for (let i = 0; i < n; i++) {
      let g = 0; while ((asking || writer.planning) && g++ < 500) await sl(10);
      writer.tick(dt); desk.update(dt, i * 40);
      if (!writer.busy && !writer.steps.length) await pull();
      if (i % 30 === 0) await sl(0);
    }
    for (const s of desk.sheets) s.tex.needsUpdate = true;
  },
  snap() { controls.update(); render(); return canvas.toDataURL('image/jpeg', 0.9); } };
