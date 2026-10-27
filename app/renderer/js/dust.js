// Hạt bụi lơ lửng trong không khí: trôi chậm, xoáy nhẹ, lấp lánh khi bắt nắng. Toàn bộ chuyển động tính trên GPU.
import * as THREE from 'three';

export class Dust {
  // center: tâm vùng bụi (trên tờ giấy), up: pháp tuyến bàn, sunDir: hướng nắng (đi tới)
  constructor(scene, { center, sunDir, max = 1500 }) {
    this.max = max; this.center = center.clone();
    const g = new THREE.BufferGeometry();
    const seed = new Float32Array(max * 4), base = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) {
      base[i * 3] = Math.random() - 0.5; base[i * 3 + 1] = Math.random(); base[i * 3 + 2] = Math.random() - 0.5;
      seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = Math.random();
    }
    g.setAttribute('position', new THREE.BufferAttribute(base, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    this.U = {
      uTime: { value: 0 }, uCenter: { value: center.clone() }, uBox: { value: new THREE.Vector3(0.7, 0.75, 0.8) },
      uSize: { value: 1 }, uBright: { value: 1 }, uSpeed: { value: 1 }, uSun: { value: sunDir.clone().normalize() },
      uColor: { value: new THREE.Color(1.0, 0.82, 0.58) }, uPx: { value: 1000 },
      uTanH: { value: 0.17 }, uAspect: { value: 0.5625 }, uNear: { value: 0.25 }, uFar: { value: 1 },
      uCamPos: { value: new THREE.Vector3() }, uFwd: { value: new THREE.Vector3() }, uRight: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec4 seed;
        uniform float uTime, uSize, uSpeed, uPx, uTanH, uAspect, uNear, uFar; uniform vec3 uSun, uCamPos, uFwd, uRight, uUp;
        varying float vA; varying float vTw;
        void main() {
          float t = uTime * uSpeed;
          vec3 p = position;            // x, z: vị trí trên khung hình; y: độ sâu (gần -> xa)
          p.y = fract(p.y + t * (0.004 + seed.x * 0.006) * (seed.y > 0.5 ? 1.0 : -0.7));
          p.x += sin(t * (0.11 + seed.y * 0.13) + seed.z * 6.28) * 0.03 + t * 0.004 * (seed.w - 0.5);
          p.z += cos(t * (0.09 + seed.w * 0.12) + seed.x * 6.28) * 0.03 + t * 0.003;
          p.x = fract(p.x + 0.5) - 0.5; p.z = fract(p.z + 0.5) - 0.5;
          float d = mix(uNear, uFar, p.y * p.y * 0.75 + p.y * 0.25);
          float hh = d * uTanH, hw = hh * uAspect;
          vec3 w = uCamPos + uFwd * d + uRight * (p.x * 2.3 * hw) + uUp * (p.z * 2.3 * hh);
          vec4 mv = modelViewMatrix * vec4(w, 1.0);
          float edge = smoothstep(0.0, 0.1, p.y) * smoothstep(1.0, 0.85, p.y);
          vec3 vd = normalize(w - cameraPosition);
          float fwd = pow(max(0.0, dot(vd, -uSun) * 0.5 + 0.5), 3.0);
          vTw = 0.5 + 0.5 * sin(uTime * (0.6 + seed.z * 1.6) + seed.w * 40.0);
          vA = edge * (0.6 + 1.2 * fwd) * (0.28 + pow(seed.z, 3.0) * 0.9);   // đa số hạt mờ, vài hạt bắt nắng sáng rõ
          float sz = (0.0007 + pow(seed.x, 3.0) * 0.0026) * uSize;
          gl_PointSize = clamp(sz * uPx / d, 1.0, 16.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uBright; varying float vA; varying float vTw;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float r = length(c);
          float a = smoothstep(0.5, 0.05, r); a = a * a * (1.0 + 0.6 * smoothstep(0.18, 0.0, r));
          gl_FragColor = vec4(uColor * a * vA * vTw * uBright * 1.5, 1.0);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false; this.points.renderOrder = 10;
    scene.add(this.points);
  }
  set({ enabled = true, count = 400, size = 1, brightness = 1, speed = 1 } = {}) {
    this.points.visible = !!enabled;
    this.points.geometry.setDrawRange(0, Math.max(0, Math.min(this.max, Math.round(count))));
    this.U.uSize.value = size; this.U.uBright.value = brightness; this.U.uSpeed.value = speed;
  }
  // pxScale = chiều cao canvas (px) / (2·tan(fov/2)) để cỡ hạt tính theo mét
  update(dt, camera, canvasH) {
    this.U.uTime.value += dt;
    const U = this.U; const th = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    U.uPx.value = canvasH / (2 * th); U.uTanH.value = th; U.uAspect.value = camera.aspect;
    camera.updateMatrixWorld();
    U.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    camera.getWorldDirection(U.uFwd.value);
    U.uRight.value.setFromMatrixColumn(camera.matrixWorld, 0).normalize(); U.uUp.value.setFromMatrixColumn(camera.matrixWorld, 1).normalize();
    // từ cách camera 25 cm tới sát mặt giấy
    const toDesk = U.uCamPos.value.distanceTo(this.center) * Math.max(0.2, -U.uFwd.value.y || 1) / Math.max(0.2, -U.uFwd.value.y || 1);
    U.uNear.value = Math.min(0.25, toDesk * 0.25); U.uFar.value = toDesk - 0.01;
  }
}
