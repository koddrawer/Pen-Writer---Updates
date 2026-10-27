// Màn hiển thị 9:16: cảnh bàn viết, nhận việc từ core, chạy bút viết, nhạc nền, voice cảm ơn.
import * as THREE from 'three';
import { OrbitControls } from '../lib/addons/controls/OrbitControls.js';
import { RoomEnvironment } from '../lib/addons/environments/RoomEnvironment.js';
import { EffectComposer } from '../lib/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../lib/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../lib/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../lib/addons/postprocessing/OutputPass.js';
import { Desk } from './desk.js';
import { Writer } from './writer.js';
import { loadChain } from './text.js';
import { Music } from './music.js';
import { Voice } from './voice.js';

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

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.5, 1.4);
composer.addPass(bloom);
composer.addPass(new OutputPass());

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

// ---- camera
const DEFAULT_CAMS = { main: { ...meta.camera } };
const camOf = (name) => (cfg.display.cameras && cfg.display.cameras[name]) || DEFAULT_CAMS[name] || DEFAULT_CAMS.main;
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
  controls.enabled = d.mouseCamera !== false && !rotated();   // xoay khung: chỉnh camera ở chế độ thường
  document.body.classList.toggle('drag', !!d.dragWindow);
}
// xoay 90°: cửa sổ ngang 16:9 chứa khung dọc 9:16 (để màn hình Full HD vẫn xuất được 1080×1920 sắc nét)
const rotated = () => [90, -90].includes(+cfg.display.rotate);
function resize() {
  const rot = rotated();
  document.body.classList.toggle('rot', +cfg.display.rotate === -90);
  document.body.classList.toggle('rotR', +cfg.display.rotate === 90);
  const w = rot ? window.innerHeight : window.innerWidth, h = rot ? window.innerWidth : window.innerHeight;
  renderer.setSize(w, h, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  bloom.resolution.set(Math.round(w / 2), Math.round(h / 2));
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
applyDisplayCfg();

// ---------- font
const FALLBACK = ['playfair-display-vietnamese-700-normal.woff', 'dancing-script-vietnamese-700-normal.woff', 'playfair-display-latin-ext-700-normal.woff', 'playfair-display-latin-700-normal.woff'].map(f => '../assets/fonts/' + f);
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
api.on('voice:test', (o) => {
  const tier = (cfg.tiers || []).find(t => t.id === o.tierId) || (cfg.tiers || [])[0];
  voice.say({ name: o.name || 'Minh Anh', written: o.name || 'Minh Anh', gift: o.gift || 'Hoa hồng', count: 1, total: tier ? tier.min : 1 }, tier, true);
});
api.on('display:cmd', (m) => {
  if (m.cmd === 'newSheet') writer.newSheet();
  if (m.cmd === 'clearSheet') writer.clearSheet();
  if (m.cmd === 'glowTest') { const g = cfg.glow || {}; desk.sheet.glow(desk.sheet.lastBox, { sec: g.sec ?? 2.4, color: g.color || '#ffc94a', strength: g.strength ?? 1.2 }); }
  if (m.cmd === 'camera') tweenCam(camOf(m.name || 'main'), m.sec ?? 1.2);
  if (m.cmd === 'resetCamera') { tweenCam(DEFAULT_CAMS.main, 1); api.send('display:camera', { name: 'main', cam: null }); }
  if (m.cmd === 'saveCamera') api.send('display:camera', { name: 'main', cam: { pos: camera.position.toArray().map(r4), target: controls.target.toArray().map(r4), fov: camera.fov } });
});
const r4 = v => Math.round(v * 1e4) / 1e4;

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
function render() { if (bloom.strength > 0.001 && desk.sheets.some(s => s.glowBox)) composer.render(); else renderer.render(scene, camera); }

// ---------- vòng lặp
const clock = new THREE.Clock();
let fpsT = 0, frames = 0;
function frame() {
  const raw = clock.getDelta(); const dt = Math.min(raw, 0.1);
  writer.tick(Math.min(raw, 0.25));   // máy yếu/khựng: bút vẫn viết đúng tốc độ
  desk.update(dt, performance.now());
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
window.__pw = { desk, writer, camera, controls, scene, renderer, sun, hemi, lamp, voice, music, applyCam,
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
