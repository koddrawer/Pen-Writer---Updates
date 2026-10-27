// Một tờ giấy: lưới phẳng đặt trên bìa da + canvas mực + shader trộn mực lên vân giấy + ánh vàng sau khi viết.
import * as THREE from 'three';

export class Sheet {
  // P: { W, H } kích thước tờ giấy (m); tex: { diffuse, normal, rough }
  constructor(P, tex, { pxPerM = 4200, ink = '#16121c', tint = '#f4ede0', grain = 1 } = {}) {
    this.Wm = P.W; this.Hm = P.H; this.ppm = pxPerM;
    this.W = Math.round(P.W * pxPerM); this.H = Math.round(P.H * pxPerM);
    this.cv = document.createElement('canvas'); this.cv.width = this.W; this.cv.height = this.H;
    this.ctx = this.cv.getContext('2d');
    this.ctx.lineCap = 'round'; this.ctx.lineJoin = 'round';
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.dirty = false; this.lastUpload = 0; this.ink = ink;

    const geo = new THREE.PlaneGeometry(P.W, P.H, 1, 12);
    this.base = geo.attributes.position.array.slice();
    const tile = 0.3;
    const rep = (t) => { if (!t) return null; const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(P.W / tile, P.H / tile); c.needsUpdate = true; return c; };
    const mat = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.92, metalness: 0, map: rep(tex.diffuse), normalMap: rep(tex.normal),
      roughnessMap: rep(tex.rough), normalScale: new THREE.Vector2(0.35, 0.35) });
    this.mat = mat;
    const U = this.uniforms = { inkMap: { value: this.tex }, grainAmt: { value: grain }, offs: { value: new THREE.Vector2(Math.random(), Math.random()) },
      glowRect: { value: new THREE.Vector4(0, 0, 0, 0) }, glowT: { value: -1 }, glowCol: { value: new THREE.Color('#ffc94a') }, glowAmt: { value: 1 } };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec2 vInkUv;\nuniform vec2 offs;\n' + sh.vertexShader
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n vInkUv = uv;');
      sh.fragmentShader = 'uniform sampler2D inkMap; varying vec2 vInkUv; uniform float grainAmt;\n' +
        'uniform vec4 glowRect; uniform float glowT; uniform vec3 glowCol; uniform float glowAmt; vec3 vGlowE = vec3(0.0); float inkA = 0.0;\n' + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec4 inkS = texture2D(inkMap, vInkUv);
          float lum = dot(diffuseColor.rgb, vec3(0.333));
          inkA = clamp(inkS.a * 1.6, 0.0, 1.0) * (1.0 - 0.07 * grainAmt * (1.0 - smoothstep(0.15, 0.45, lum)));
          diffuseColor.rgb = mix(diffuseColor.rgb, inkS.rgb, inkA);
          if (glowT >= 0.0) {
            vec2 m2 = smoothstep(glowRect.xy - 0.015, glowRect.xy, vInkUv) * (1.0 - smoothstep(glowRect.zw, glowRect.zw + 0.015, vInkUv));
            float inR = m2.x * m2.y;
            float gt = clamp(glowT, 0.0, 1.0);
            float env = smoothstep(0.0, 0.14, gt) * (1.0 - smoothstep(0.62, 1.0, gt));
            float bx = mix(glowRect.x - 0.08, glowRect.z + 0.08, smoothstep(0.04, 0.8, gt));
            float band = exp(-pow((vInkUv.x - bx) / 0.045, 2.0));
            float halo = texture2D(inkMap, vInkUv, 3.5).a;
            float gk = inR * clamp(inkA, 0.0, 1.0) * glowAmt;
            diffuseColor.rgb = mix(diffuseColor.rgb, glowCol * vec3(0.78, 0.55, 0.16), min(1.0, gk * env * 1.3));
            vGlowE = glowCol * env * glowAmt * inR * (clamp(inkA, 0.0, 1.0) * (0.35 + band * 2.6) + halo * 0.3 * (0.3 + band));
          }`)
        .replace('#include <aomap_fragment>', `float inkK = 1.0 - 0.9 * clamp(inkA, 0.0, 1.0);
          reflectedLight.directSpecular *= inkK; reflectedLight.indirectSpecular *= inkK;
          #include <aomap_fragment>`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vGlowE;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.9, clamp(inkA, 0.0, 1.0));`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor = mix(metalnessFactor, 0.55, clamp(vGlowE.r, 0.0, 1.0));`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.used = 0;          // vị trí dòng tiếp theo (m, tính từ mép trên)
  }
  setInk(c) { this.ink = c; }

  // toạ độ giấy (u từ mép trái, v từ mép trên, mét) -> pixel
  toPx(u, v) { return [u * this.ppm, v * this.ppm]; }
  drawSeg(u0, v0, u1, v1, widthM, color, alpha = 1) {
    const c = this.ctx; c.globalAlpha = alpha;
    const ax = u0 * this.ppm, ay = v0 * this.ppm, bx = u1 * this.ppm, by = v1 * this.ppm;
    c.lineWidth = Math.max(0.9, widthM * this.ppm);
    c.strokeStyle = color || this.ink;
    c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke();
    c.globalAlpha = 1;
    const b = this.bb; if (b) { const r = c.lineWidth / 2 + 1;
      b.x0 = Math.min(b.x0, ax - r, bx - r); b.x1 = Math.max(b.x1, ax + r, bx + r); b.y0 = Math.min(b.y0, ay - r, by - r); b.y1 = Math.max(b.y1, ay + r, by + r); }
    this.dirty = true;
  }
  clear() { this.ctx.clearRect(0, 0, this.W, this.H); this.dirty = true; this.used = 0; this.glowBox = null; this.lastBox = null; this.uniforms.glowT.value = -1; this.tex.needsUpdate = true; }

  // ghi lại vùng mực của một lượt viết (để làm ánh vàng)
  trackStart() { this.bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; }
  trackStop() { const b = this.bb; this.bb = null; const ok = b && b.x1 > b.x0 ? b : null; if (ok) this.lastBox = { ...ok }; return ok; }
  glow(box, { sec = 2.4, color = '#ffc94a', strength = 1 } = {}) {
    if (!box) return;
    this.glowBox = { ...box }; this.glowAge = 0; this.glowSec = Math.max(0.3, sec);
    this.uniforms.glowCol.value.set(color); this.uniforms.glowAmt.value = strength;
  }
  update(dt, now) {
    const U = this.uniforms;
    const g = this.glowBox;
    if (g) {
      this.glowAge += dt; const t = this.glowAge / this.glowSec;
      if (t >= 1) { this.glowBox = null; U.glowT.value = -1; }
      else { U.glowT.value = t; U.glowRect.value.set(g.x0 / this.W, 1 - g.y1 / this.H, g.x1 / this.W, 1 - g.y0 / this.H); }
    }
    if (this.dirty && now - this.lastUpload >= 33) { this.tex.needsUpdate = true; this.dirty = false; this.lastUpload = now; }
  }
  // cong nhẹ tờ giấy khi được nhấc lên (0 = phẳng)
  bend(k) {
    const pos = this.mesh.geometry.attributes.position; const a = pos.array, b = this.base; const H = this.Hm;
    for (let i = 0; i < a.length; i += 3) { const y = b[i + 1]; const t = (y + H / 2) / H; a[i + 2] = b[i + 2] + k * Math.pow(t, 2.2) * 0.05; }
    pos.needsUpdate = true; this.mesh.geometry.computeVertexNormals();
  }
}
