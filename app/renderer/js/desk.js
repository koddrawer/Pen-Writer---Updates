// Cảnh bàn viết: nạp scene.glb, dựng khung toạ độ tờ giấy, bút (xoay quanh ngòi), 2 tờ giấy luân phiên + hiệu ứng thay giấy.
import * as THREE from 'three';
import { GLTFLoader } from '../lib/addons/loaders/GLTFLoader.js';
import { Sheet } from './sheet.js';

const V3 = (a) => new THREE.Vector3().fromArray(a);
const ease = (u) => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;

export class Desk {
  constructor(scene, base = '../assets/') { this.scene = scene; this.base = base; }

  async load(onProgress) {
    const [meta, gltf, tex] = await Promise.all([
      fetch(this.base + 'scene.json').then(r => r.json()),
      new GLTFLoader().loadAsync(this.base + 'scene.glb', e => e.total && onProgress && onProgress(e.loaded / e.total)),
      this.loadPaperTex(),
    ]);
    this.meta = meta; this.paperTex = tex;
    const root = gltf.scene; this.root = root;
    root.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material;
      if (m && /glass/i.test(m.name)) {
        // kính cửa sổ: trong suốt nhẹ, không tính khúc xạ (đỡ nặng card yếu)
        o.material = new THREE.MeshStandardMaterial({ color: 0xdfe8f0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false });
        o.castShadow = false;
      } else if (m && m.isMeshPhysicalMaterial) {
        const s = new THREE.MeshStandardMaterial(); THREE.MeshStandardMaterial.prototype.copy.call(s, m); o.material = s;
      }
      if (o.material.map) o.material.map.anisotropy = 4;
    });
    this.scene.add(root);

    // ---- khung toạ độ tờ giấy
    const P = meta.paper; const tl = V3(P.tl), tr = V3(P.tr), bl = V3(P.bl);
    const W = tr.distanceTo(tl), H = bl.distanceTo(tl);
    const U = tr.clone().sub(tl).normalize(), Vd = bl.clone().sub(tl).normalize();
    const N = new THREE.Vector3().crossVectors(Vd, U).normalize();      // pháp tuyến hướng lên
    if (N.y < 0) N.negate();
    this.P = { W, H, O: tl.clone().add(N.clone().multiplyScalar(0.0006)), U, V: Vd, N };
    // ma trận đặt tờ giấy: x -> U, y -> -V, z -> N, tâm ở giữa tờ
    const basis = new THREE.Matrix4().makeBasis(U, Vd.clone().negate(), N);
    this.sheetQuat = new THREE.Quaternion().setFromRotationMatrix(basis);
    this.sheetCenter = this.P.O.clone().add(U.clone().multiplyScalar(W / 2)).add(Vd.clone().multiplyScalar(H / 2));

    // ---- bút: tách thành khớp xoay quanh ngòi
    this.pen = root.getObjectByName('Pen');
    this.pivot = new THREE.Group(); this.pivot.name = 'PenPivot';
    this.tip0 = V3(meta.pen.tip);
    this.pivot.position.copy(this.tip0);
    this.scene.add(this.pivot);
    root.updateMatrixWorld(true);
    if (this.pen) this.pivot.attach(this.pen);
    this.penAxis = V3(meta.pen.tail).sub(this.tip0).normalize();
    this.tilt = new THREE.Quaternion(); this.lean = new THREE.Vector2();
    return this;
  }

  async loadPaperTex() {
    const L = new THREE.TextureLoader(); const ld = (f, srgb) => L.loadAsync(this.base + f).then(t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }).catch(() => null);
    const [diffuse, normal, rough] = await Promise.all([ld('paper_diffuse.jpg', true), ld('paper_normal.jpg'), ld('paper_rough.jpg')]);
    return { diffuse, normal, rough };
  }

  // xấp giấy: tờ đang viết nằm trên, tờ trắng kế tiếp nằm sẵn bên dưới
  makeSheets(opts) {
    this.sheets = [new Sheet(this.P, this.paperTex, opts), new Sheet(this.P, this.paperTex, opts)];
    this.cur = 0;
    for (const s of this.sheets) this.scene.add(s.mesh);
    this.place(this.sheets[0], 0, 0, 0, 0, 0); this.place(this.sheets[1], 0, 0, 0, 0, 1);
    return this.sheet;
  }
  get sheet() { return this.sheets[this.cur]; }
  setSheetOpts({ tint, grain, ink }) {
    for (const s of this.sheets || []) { if (tint) s.mat.color.set(tint); if (grain != null) s.uniforms.grainAmt.value = grain; if (ink) s.setInk(ink); }
  }
  // đặt tờ giấy: dịch theo trục giấy, nâng, xoay quanh pháp tuyến; layer 0 = trên cùng, 1 = tờ bên dưới
  place(s, lift = 0, du = 0, dv = 0, rot = 0, layer = 0) {
    const P = this.P; const m = s.mesh;
    m.position.copy(this.sheetCenter).addScaledVector(P.U, du).addScaledVector(P.V, dv).addScaledVector(P.N, lift + (layer ? 0.0003 : 0.0011));
    m.quaternion.copy(this.sheetQuat);
    if (rot) m.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(P.N, rot));
  }

  // toạ độ giấy (u, v, độ cao h) -> thế giới
  paperToWorld(u, v, h, out = new THREE.Vector3()) {
    const P = this.P;
    return out.copy(P.O).addScaledVector(P.U, u).addScaledVector(P.V, v).addScaledVector(P.N, h);
  }

  // thay giấy: mép dưới tờ đã viết cong lên, tờ trượt sang trái ra khỏi bàn, lộ tờ trắng bên dưới
  swap(sec = 2.2) {
    if (this.swapping) return this.swapping.promise;
    const old = this.sheet; const nw = this.sheets[1 - this.cur];
    nw.clear(); this.place(nw, 0, 0, 0, 0, 1); nw.mesh.visible = true;
    let done; const promise = new Promise(r => (done = r));
    this.swapping = { t: 0, T: Math.max(0.6, sec), old, nw, done, promise };
    return promise;
  }
  updateSwap(dt) {
    const s = this.swapping; if (!s) return;
    s.t += dt; const u = Math.min(1, s.t / s.T); const P = this.P;
    const a = Math.min(1, u / 0.22);                       // nhấc mép
    const b = Math.max(0, (u - 0.12) / 0.88), eb = ease(b);  // trượt đi
    s.old.bend(Math.sin(a * Math.PI / 2) * (1 - 0.6 * eb));
    this.place(s.old, 0.002 + 0.012 * Math.sin(Math.min(1, u * 1.4) * Math.PI), -eb * P.W * 2.8, eb * P.H * 0.18, eb * 0.42, 0);
    if (u >= 1) {
      s.old.mesh.visible = false; s.old.bend(0); s.old.clear();
      this.cur = 1 - this.cur;
      this.place(s.nw, 0, 0, 0, 0, 0); this.place(s.old, 0, 0, 0, 0, 1); s.old.mesh.visible = true;
      this.swapping = null; s.done();
    }
  }

  // bút: ngòi tại (u,v,h) trên giấy, nghiêng nhẹ theo hướng chuyển động
  setPen(u, v, h, vu = 0, vv = 0, dt = 0.016, t = 0) {
    if (!this.pivot) return;
    this.paperToWorld(u, v, h, this.pivot.position);
    // nghiêng theo vận tốc (lò xo mượt)
    const k = 1 - Math.exp(-dt * 10);
    const tu = Math.max(-1, Math.min(1, vu * 1.8)), tv = Math.max(-1, Math.min(1, vv * 1.8));
    this.lean.x += (tu - this.lean.x) * k; this.lean.y += (tv - this.lean.y) * k;
    const P = this.P; const amp = 0.09;
    const q1 = new THREE.Quaternion().setFromAxisAngle(P.V, -this.lean.x * amp);
    const q2 = new THREE.Quaternion().setFromAxisAngle(P.U, this.lean.y * amp);
    const wob = new THREE.Quaternion().setFromAxisAngle(P.N, Math.sin(t * 1.3) * 0.02 + Math.sin(t * 3.1) * 0.006);
    this.pivot.quaternion.copy(q1).multiply(q2).multiply(wob);
  }
  update(dt, now) {
    this.updateSwap(dt);
    for (const s of this.sheets || []) s.update(dt, now);
  }
}
