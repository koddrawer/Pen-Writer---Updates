// Cầu nối window.api cho bản Android: thay ipc của Electron bằng plugin Node.js của Capacitor.
// Giao diện (display.js, panel.js) dùng y hệt bản máy tính.
(() => {
  const C = window.Capacitor || {};
  const P = C.Plugins || {};
  const N = P.Nodejs || (C.registerPlugin && C.registerPlugin('Nodejs'));
  if (!P.WebView && C.registerPlugin) C.registerPlugin('WebView');
  const listeners = {};
  const pend = new Map();
  let seq = 0, linked = false, port = 37651;
  const outbox = [];
  let resolveReady; const ready = new Promise(r => (resolveReady = r));

  const raw = (eventName, args) => {
    if (!linked) { outbox.push([eventName, args]); return; }
    N.send({ eventName, args }).catch(e => console.warn('Nodejs.send', e));
  };
  const emitLocal = (ch, data) => (listeners[ch] || []).slice().forEach(f => { try { f(data); } catch (e) { console.error(e); } });

  function call(name, ...args) {
    return new Promise((res, rej) => {
      const id = ++seq; pend.set(id, { res, rej });
      raw('rpc', [id, name, args]);
    });
  }

  // ---- chọn file từ điện thoại rồi đưa vào thư mục dữ liệu của app qua máy chủ nội bộ
  function pick(accept, multiple) {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept; inp.multiple = !!multiple;
      inp.style.cssText = 'position:fixed;left:-99px;top:-99px;opacity:0';
      document.body.appendChild(inp);
      let done = false;
      const fin = (files) => { if (done) return; done = true; inp.remove(); resolve(files); };
      inp.onchange = () => fin([...(inp.files || [])]);
      inp.addEventListener('cancel', () => fin([]));
      inp.click();
    });
  }
  async function upload(kind, files) {
    const out = [];
    for (const f of files) {
      const r = await fetch(`http://127.0.0.1:${port}/upload?kind=${kind}&name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
      if (r.ok) out.push(await r.json());
    }
    return out;
  }
  const AUDIO = 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus';
  const FONT = '.ttf,.otf,.woff,.woff2,font/*,application/octet-stream';
  const LOCAL = {
    'fonts:add': async () => { const fs = await pick(FONT, true); return fs.length ? call('fonts:addPaths', await upload('fonts', fs)) : []; },
    'story:add': async () => { const fs = await pick(AUDIO, true); return fs.length ? call('story:addPaths', await upload('story', fs)) : []; },
    'music:add': async () => { const fs = await pick(AUDIO, true); return fs.length ? call('music:addPaths', await upload('music', fs)) : []; },
    'tier:addVoice': async (id) => { const fs = await pick(AUDIO, true); return fs.length ? call('tier:addVoicePaths', id, await upload('voice', fs)) : []; },
    'test:pickAvatar': async () => { const fs = await pick('image/*', false); if (!fs.length) return null; const [u] = await upload('avatar', fs); if (!u) return null; await call('test:setAvatar', u.path); return u.path; },
    'config:export': async () => {
      const text = await call('config:exportText');
      try { await navigator.clipboard.writeText(text); toast('Đã chép cấu hình vào bộ nhớ tạm – dán vào Zalo/Ghi chú để lưu'); return true; }
      catch { toast('Không chép được vào bộ nhớ tạm'); return false; }
    },
    'config:import': async () => { const fs = await pick('.json,application/json,text/plain', false); if (!fs.length) return false; return call('config:importText', await fs[0].text()); },
    'win:show': () => { panel.close(); return true; },
    'win:recreateDisplay': () => { location.reload(); },
    'open:userData': () => { toast('Trên điện thoại, dữ liệu nằm trong bộ nhớ riêng của app'); },
  };

  window.api = {
    role: 'display',
    platform: 'android',
    ready,
    getConfig: () => call('config:get'),
    setConfig: (patch) => call('config:set', patch),
    invoke: (name, ...args) => LOCAL[name] ? Promise.resolve(LOCAL[name](...args)) : call(name, ...args),
    send: (ch, data) => raw('send', [ch, data]),
    on: (ch, cb) => { (listeners[ch] = listeners[ch] || []).push(cb); return () => { listeners[ch] = (listeners[ch] || []).filter(f => f !== cb); }; },
    mediaUrl: (p) => !p ? '' : /^(https?|data|blob):/.test(p) ? p
      : /^media:\/\/local\//.test(p) ? `http://127.0.0.1:${port}/f?p=${p.slice(14)}`
      : `http://127.0.0.1:${port}/f?p=${encodeURIComponent(p)}`,
  };

  // ---- thông báo nhỏ
  let toastT;
  function toast(t) {
    let el = document.getElementById('mtoast');
    if (!el) { el = document.createElement('div'); el.id = 'mtoast'; document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3500);
  }

  // ---- bảng điều khiển: chạm 2 lần vào góc trên bên phải để mở (khung iframe dùng chung window.api)
  const panel = {
    el: null,
    open() {
      if (!this.el) {
        this.el = document.createElement('div'); this.el.id = 'mpanel';
        this.el.innerHTML = '<div class="mbar"><b>Bảng điều khiển</b><span>Đóng lại trước khi lên live – TikTok quay cả màn hình</span><button id="mclose">✕ Đóng</button></div><iframe src="./panel.html"></iframe>';
        document.body.appendChild(this.el);
        this.el.querySelector('#mclose').onclick = () => this.close();
      }
      this.el.classList.add('on');
    },
    close() { if (this.el) this.el.classList.remove('on'); },
  };
  window.__mpanel = panel;
  function setupHotspot() {
    // cách 1: chạm/nhấp 2 lần vào góc trên bên phải
    const hs = document.createElement('div'); hs.id = 'mhot'; document.body.appendChild(hs);
    let last = 0;
    hs.addEventListener('pointerdown', (e) => { e.preventDefault(); const t = Date.now(); if (t - last < 500) { last = 0; panel.open(); } else last = t; });
    // cách 2: giữ ngón tay / giữ chuột ở bất kỳ đâu 1,5 giây (không di chuyển)
    let lp = null, sx = 0, sy = 0, t0 = 0;
    const cancel = () => { clearTimeout(lp); lp = null; };
    document.addEventListener('pointerdown', (e) => { if (panel.el && panel.el.classList.contains('on')) return; sx = e.clientX; sy = e.clientY; t0 = Date.now(); cancel(); lp = setTimeout(() => { lp = null; panel.open(); }, 1500); }, true);
    document.addEventListener('pointermove', (e) => { if (lp && Math.hypot(e.clientX - sx, e.clientY - sy) > 12) cancel(); }, true);
    document.addEventListener('pointerup', () => { const hold = lp && Date.now() - t0 >= 1400; cancel(); if (hold) panel.open(); }, true); document.addEventListener('pointercancel', cancel, true);
    // cách 3: bàn phím (giả lập LDPlayer/BlueStacks, bàn phím Bluetooth): phím P hoặc F1 mở/đóng, Esc đóng
    document.addEventListener('keydown', (e) => {
      const k = (e.key || '').toLowerCase();
      if (k === 'p' || k === 'f1') { e.preventDefault(); panel.el && panel.el.classList.contains('on') ? panel.close() : panel.open(); }
      else if (k === 'escape') panel.close();
    });
    const hint = document.createElement('div'); hint.id = 'mhint';
    hint.textContent = 'Mở bảng điều khiển: giữ 1,5 giây trên màn hình, hoặc chạm 2 lần góc trên phải, hoặc phím P';
    document.body.appendChild(hint); setTimeout(() => hint.classList.add('off'), 8000);
  }
  document.addEventListener('backbutton', () => panel.close());

  // ---- chuyển sang bản giao diện mới (cập nhật nóng) nếu lõi báo có
  async function switchWww(www) {
    const W = P.WebView; if (!W) return false;
    let cur = ''; try { cur = (await W.getServerBasePath()).path || ''; } catch { }
    if (www && cur !== www) { await W.setServerBasePath({ path: www }); await W.persistServerBasePath(); return true; }
    if (!www && cur && cur.startsWith('/')) { await W.setServerAssetPath({ path: 'public' }); await W.persistServerBasePath(); return true; }
    return false;
  }

  let applying = false;
  async function onCoreReady() {
    const info = await call('boot:info');
    port = info.port || port;
    if (await switchWww(info.www)) return;       // trang sẽ tự tải lại
    resolveReady(info);
  }

  async function link() {
    if (!N) { document.getElementById('err').textContent = 'Không tìm thấy plugin Node.js – app cần chạy trên Android.'; return; }
    await N.addListener('message', (ev) => {
      const name = ev.eventName, args = ev.args || [];
      if (name === 'rpc-res') {
        const [id, ok, res] = args; const p = pend.get(id); if (!p) return;
        pend.delete(id); ok ? p.res(res) : p.rej(new Error(res));
      } else if (name === 'evt') {
        const [ch, data] = args;
        if (ch === 'core:ready' && applying) { applying = false; onCoreReady(); return; }
        emitLocal(ch, data);
      }
    });
    const go = () => { if (linked) return; linked = true; outbox.splice(0).forEach(([e, a]) => raw(e, a)); onCoreReady().catch(e => (document.getElementById('err').textContent = 'Lõi Node lỗi: ' + e.message)); };
    await N.addListener('ready', go);
    try { if ((await N.isReady()).ready) go(); } catch { }
  }
  // sau khi áp dụng cập nhật, lõi mới báo core:ready -> chuyển giao diện
  const origInvoke = window.api.invoke;
  window.api.invoke = (name, ...args) => { if (name === 'update:apply') applying = true; return origInvoke(name, ...args); };

  window.addEventListener('DOMContentLoaded', setupHotspot);
  link();
  // màn hiển thị chỉ chạy khi lõi đã sẵn sàng (cần cổng máy chủ nội bộ để nạp font/nhạc/avatar)
  ready.then(() => import('./display.js')).catch(e => { const el = document.getElementById('err'); if (el) el.textContent = String(e && e.stack || e); });
})();
