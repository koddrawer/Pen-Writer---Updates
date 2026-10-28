// Lõi ứng dụng (chạy trong main process, cập nhật nóng được qua GitHub).
const { app, BrowserWindow, ipcMain, dialog, protocol, screen, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const DEFAULTS = require('./defaults.js');
const { JobQueue } = require('./queue.js');
const { TikTok } = require('./tiktok.js');
const { TTS } = require('./tts.js');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.opus': 'audio/ogg' };

function deepMerge(a, b) {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out = Array.isArray(a) || typeof a !== 'object' || a === null ? {} : { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? deepMerge(out[k], v) : v;
  return out;
}

module.exports = async function start(ctx) {
  const userData = app.getPath('userData');
  const cfgFile = path.join(userData, 'config.json');
  const dirs = { fonts: path.join(userData, 'fonts'), sounds: path.join(userData, 'sounds'), avatars: path.join(userData, 'avatars') };
  Object.values(dirs).forEach(d => fs.mkdirSync(d, { recursive: true }));

  // ---------------- cấu hình
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { }
  let cfg = deepMerge(DEFAULTS, saved);
  cfg.fonts = [...DEFAULTS.fonts, ...(cfg.fonts || []).filter(f => !f.builtin)];
  // mỗi mức đủ trường (bản mới thêm trường)
  const tierBase = DEFAULTS.tiers[0];
  cfg.tiers = (cfg.tiers || DEFAULTS.tiers).map(t => ({ ...tierBase, voiceFiles: [], ...t }));
  // repo cập nhật đã đổi tên
  if (!cfg.update.repo || /^pen-writer-updates$/i.test(cfg.update.repo)) cfg.update.repo = DEFAULTS.update.repo;
  // v3 (bản 1.4.3): tên người xem mặc định mỗi người một dòng, căn giữa
  if ((saved.configVersion || 1) < 3 && cfg.viewers) cfg.viewers.align = 'line';
  // v4 (bản 1.5.0): avatar + khung hoa văn tăng dần theo mức (mức thấp -> cấp 1, cao dần tới cấp 7)
  if ((saved.configVersion || 1) < 4) {
    const order = cfg.tiers.slice().sort((a, b) => (a.min || 0) - (b.min || 0));
    // khung avatar cấp 7 đã có vương miện -> khung tên đổi 'royal' thành 'frame' để không lặp
    cfg.tiers.forEach(t => { if (t.ornament === 'royal') t.ornament = 'frame'; });
    order.forEach((t, i) => { if (!saved.tiers || !(saved.tiers.find(x => x.id === t.id) || {}).avatarFrame) { t.avatarFrame = Math.min(7, i + 1); t.avatarCm = +(2.8 + Math.min(6, i) * 0.37).toFixed(1); } });
  }
  cfg.configVersion = DEFAULTS.configVersion;
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => fs.writeFile(cfgFile, JSON.stringify(cfg, null, 1), () => { }), 300); };
  const getCfg = () => cfg;
  function setCfg(patch, { silent } = {}) {
    cfg = deepMerge(cfg, patch); save();
    if (patch.update) ctx.updater.configure(cfg.update);
    if (!silent) broadcast('config', cfg);
    applyWindowCfg();
    return cfg;
  }

  // ---------------- giao thức app:// (giao diện) và media:// (file của người dùng)
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    const p = path.normalize(path.join(ctx.appDir, decodeURIComponent(u.pathname)));
    if (!p.startsWith(path.normalize(ctx.appDir))) return new Response('forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(p);
      return new Response(data, { headers: { 'content-type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' } });
    } catch { return new Response('not found', { status: 404 }); }
  });
  protocol.handle('media', async (req) => {
    const u = new URL(req.url);
    const p = decodeURIComponent(u.pathname.replace(/^\//, ''));
    let st; try { st = await fs.promises.stat(p); } catch { return new Response('not found', { status: 404 }); }
    const type = MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.get('range');
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range); const s = m[1] ? +m[1] : 0; let e = m[2] ? +m[2] : st.size - 1;
      e = Math.min(e, st.size - 1);
      return new Response(Readable.toWeb(fs.createReadStream(p, { start: s, end: e })), { status: 206,
        headers: { 'access-control-allow-origin': '*', 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${s}-${e}/${st.size}`, 'content-length': String(e - s + 1) } });
    }
    return new Response(Readable.toWeb(fs.createReadStream(p)), { headers: { 'access-control-allow-origin': '*', 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(st.size) } });
  });

  // ---------------- cửa sổ
  const preload = path.join(__dirname, 'preload.js');
  const W = {};
  const wcfg = (n) => (cfg.windows && cfg.windows[n]) || {};
  function remember(name, win) {
    const keep = () => { if (win.isDestroyed()) return; setCfg({ windows: { [name]: win.getBounds() } }, { silent: true }); };
    let t; const deb = () => { clearTimeout(t); t = setTimeout(keep, 400); };
    win.on('move', deb); win.on('resize', deb);
  }
  function onScreen(b) {
    if (!b || b.x === undefined) return false;
    return screen.getAllDisplays().some(d => { const a = d.workArea; return b.x + 40 > a.x && b.y + 40 > a.y && b.x < a.x + a.width - 40 && b.y < a.y + a.height - 40; });
  }
  function createDisplay() {
    const d = cfg.display; const b = wcfg('display');
    const rot = [90, -90].includes(+d.rotate);
    const win = new BrowserWindow({
      width: rot ? d.height : d.width, height: rot ? d.width : d.height, useContentSize: true, frame: !d.frameless, resizable: true, title: 'Pen Writer - Display',
      backgroundColor: '#0b0907', alwaysOnTop: !!d.alwaysOnTop, show: false, autoHideMenuBar: true,
      ...(onScreen(b) ? { x: b.x, y: b.y } : {}),
      webPreferences: { preload, contextIsolation: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
    });
    win.setAspectRatio(rot ? 16 / 9 : 9 / 16);
    win.setMenu(null);
    win.loadURL('app://local/renderer/display.html');
    // đảm bảo đúng kích thước nội dung (Windows có thể co cửa sổ khi tạo)
    win.once('ready-to-show', () => { const [cw, ch] = win.getContentSize(); const tw = rot ? d.height : d.width, th = rot ? d.width : d.height; if (cw !== tw || ch !== th) { win.setAspectRatio(0); win.setContentSize(tw, th); win.setAspectRatio(rot ? 16 / 9 : 9 / 16); } });
    win.once('ready-to-show', () => win.show());
    remember('display', win);
    win.on('closed', () => { W.display = null; });
    W.display = win;
  }
  function createPanel() {
    const b = wcfg('panel');
    const win = new BrowserWindow({
      width: 1180, height: 820, minWidth: 900, minHeight: 600, title: 'Pen Writer - Bảng điều khiển', backgroundColor: '#121014', show: false,
      ...(onScreen(b) ? { x: b.x, y: b.y, width: b.width, height: b.height } : {}), autoHideMenuBar: true,
      webPreferences: { preload, contextIsolation: true },
    });
    win.setMenu(null);
    win.loadURL('app://local/renderer/panel.html');
    win.once('ready-to-show', () => win.show());
    remember('panel', win);
    win.on('close', (e) => {
      if (app.__quitting) return;
      const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Thoát app', 'Huỷ'], defaultId: 1, cancelId: 1, title: 'Thoát', message: 'Đóng bảng điều khiển sẽ tắt toàn bộ ứng dụng. Thoát?' });
      if (r !== 0) e.preventDefault();
    });
    win.on('closed', () => { W.panel = null; app.quit(); });
    W.panel = win;
  }
  function applyWindowCfg() {
    if (W.display && !W.display.isDestroyed()) W.display.setAlwaysOnTop(!!cfg.display.alwaysOnTop);
  }
  function broadcast(ch, data) { for (const w of Object.values(W)) if (w && !w.isDestroyed()) w.webContents.send(ch, data); }
  const toPanel = (ch, d) => W.panel && !W.panel.isDestroyed() && W.panel.webContents.send(ch, d);
  const toDisplay = (ch, d) => W.display && !W.display.isDestroyed() && W.display.webContents.send(ch, d);
  app.on('before-quit', () => { app.__quitting = true; });

  // ---------------- nhật ký
  const log = [];
  function addLog(kind, text) { const e = { t: Date.now(), kind, text }; log.push(e); if (log.length > 300) log.shift(); toPanel('log', e); }
  if (!process.__pwGuard) {
    process.__pwGuard = true;
    process.on('uncaughtException', (e) => { console.error(e); try { addLog('err', 'Lỗi: ' + (e && e.message || e)); } catch { } });
    process.on('unhandledRejection', (e) => { console.error(e); try { addLog('err', 'Lỗi: ' + (e && e.message || e)); } catch { } });
  }

  // ---------------- hàng đợi + TikTok
  const queue = new JobQueue(getCfg, () => { toDisplay('job:available', {}); toPanel('queue', queue.snapshot()); },
    () => toDisplay('display:cmd', { cmd: 'hurry' }));
  const tiktok = new TikTok(ctx.require, getCfg, {
    status: (s) => toPanel('tiktok:status', s),
    log: addLog,
    join: (u) => queue.addName(u, 'join'),
    chat: (u) => queue.addName(u, 'chat'),
    follow: (u) => queue.addName(u, 'follow'),
    share: (u) => queue.addName(u, 'share'),
    like: (u, n) => queue.addLikes(u, n),
    gift: (g) => queue.addDonor(g),
  });
  const tts = new TTS(path.join(userData, 'tts'), (u, o) => net.fetch(u, o));

  // ---------------- IPC
  ipcMain.handle('config:get', () => cfg);
  ipcMain.handle('config:set', (_e, patch) => setCfg(patch));
  let displayStatus = {};
  ipcMain.on('display:status', (_e, s) => { displayStatus = { ...displayStatus, ...s }; toPanel('display:status', displayStatus); });
  ipcMain.on('display:fps', (_e, f) => { displayStatus.fps = f; toPanel('display:status', displayStatus); });
  ipcMain.on('display:jobDone', (_e, j) => queue.done(j));
  ipcMain.on('display:sheet', () => { queue.sheet(); addLog('sys', 'Đã thay tờ giấy mới'); });
  ipcMain.on('display:log', (_e, m) => addLog(m.kind || 'sys', m.text));
  ipcMain.on('display:ready', () => { queue.requeueCurrent(); addLog('sys', 'Màn hiển thị đã sẵn sàng'); });
  ipcMain.on('display:camera', (_e, { name, cam }) => {
    const cams = { ...(cfg.display.cameras || {}) }; if (cam) cams[name] = cam; else delete cams[name];
    setCfg({ display: { cameras: cams } }); addLog('sys', cam ? `Đã lưu góc camera "${name}"` : `Đã đặt lại camera "${name}"`);
  });
  ipcMain.on('music:status', (_e, st) => toPanel('music:status', st));

  const copyInto = (src, dir) => {
    const base = path.basename(src).replace(/[^\w.\-]+/g, '_'); let dst = path.join(dir, base); let i = 1;
    while (fs.existsSync(dst)) dst = path.join(dir, `${path.parse(base).name}_${i++}${path.extname(base)}`);
    fs.copyFileSync(src, dst); return dst;
  };
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const pick = async (kind, multi) => {
    const filters = { image: [{ name: 'Ảnh', extensions: ['png', 'jpg', 'jpeg', 'webp'] }], audio: [{ name: 'Âm thanh', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'] }], font: [{ name: 'Font', extensions: ['ttf', 'otf', 'woff'] }] }[kind];
    const r = await dialog.showOpenDialog(W.panel, { properties: ['openFile', ...(multi ? ['multiSelections'] : [])], filters });
    return r.canceled ? [] : r.filePaths;
  };
  const setTiers = (fn) => setCfg({ tiers: fn(cfg.tiers.map(t => ({ ...t }))) });

  const RPC = {
    'app:info': () => ({ appVersion: ctx.appVersion, shellVersion: ctx.shellVersion, appSource: ctx.appSource, userData }),
    'job:next': () => queue.next(),
    'queue:get': () => queue.snapshot(),
    'queue:remove': (id) => queue.remove(id),
    'queue:clear': (which) => queue.clear(which),
    'queue:pause': (v) => queue.setPaused(v),
    'test:gift': (o = {}) => {
      const g = { user: { uniqueId: 'test_' + Math.random().toString(36).slice(2, 7), nickname: o.name || 'Người tặng ' + Math.floor(Math.random() * 999), avatar: cfg.testAvatar || '' }, gift: o.gift || 'Rose', count: o.count || 1, diamonds: o.diamonds ?? 1 };
      addLog('gift', `[TEST] ${g.user.nickname} tặng ${g.gift} x${g.count} (${g.diamonds * g.count} xu)`); queue.addDonor(g, true);
    },
    'test:join': (name) => { const u = { uniqueId: 'test_' + Math.random().toString(36).slice(2, 7), nickname: name || 'Khách ' + Math.floor(Math.random() * 999), avatar: cfg.testAvatar || '' }; addLog('join', `[TEST] ${u.nickname} vào phòng`); queue.addName(u, 'join', true); },
    'test:quote': () => queue.forceQuote(),
    'tiktok:connect': (u) => tiktok.connect(u),
    'tiktok:disconnect': () => tiktok.disconnect(),
    'tiktok:status': () => tiktok.status,
    'log:get': () => log,
    'win:show': () => { if (!W.display) createDisplay(); else { W.display.show(); W.display.focus(); } },
    'win:displaySize': (w, h) => { if (!W.display) return; const rot = [90, -90].includes(+cfg.display.rotate); W.display.setAspectRatio(0); W.display.setContentSize(rot ? h : w, rot ? w : h); W.display.setAspectRatio(rot ? 16 / 9 : 9 / 16); setCfg({ display: { width: w, height: h } }, { silent: true });
      const [cw, ch] = W.display.getContentSize(); return { w: cw, h: ch }; },
    'win:setRotate': (deg) => { setCfg({ display: { rotate: +deg || 0 } }); if (W.display) { W.display.destroy(); W.display = null; } createDisplay(); },
    'win:recreateDisplay': () => { if (W.display) { W.display.destroy(); W.display = null; } createDisplay(); },
    'display:cmd': (m) => toDisplay('display:cmd', m),
    'fonts:add': async () => {
      const files = await pick('font', true); const added = [];
      for (const f of files) { const dst = copyInto(f, dirs.fonts); added.push({ id: uid('font'), name: path.parse(f).name, file: dst }); }
      if (added.length) setCfg({ fonts: [...cfg.fonts, ...added] });
      return added;
    },
    'fonts:remove': (id) => { const f = cfg.fonts.find(x => x.id === id); if (!f || f.builtin) return; try { fs.unlinkSync(f.file); } catch { } setCfg({ fonts: cfg.fonts.filter(x => x.id !== id) }); },
    // mức donate
    'tier:add': () => setTiers(ts => { const last = ts[ts.length - 1] || DEFAULTS.tiers[0]; ts.push({ ...last, id: uid('t'), name: 'Mức mới', min: (last.min || 1) * 2, voiceFiles: [] }); return ts; }),
    'tier:remove': (id) => setTiers(ts => ts.filter(t => t.id !== id)),
    'tier:set': (id, patch) => setTiers(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t)),
    'tier:reset': () => setCfg({ tiers: DEFAULTS.tiers }),
    'tier:addVoice': async (id) => {
      const files = await pick('audio', true); if (!files.length) return [];
      const dst = files.map(f => copyInto(f, dirs.sounds));
      setTiers(ts => ts.map(t => t.id === id ? { ...t, voiceFiles: [...(t.voiceFiles || []), ...dst] } : t)); return dst;
    },
    'tier:removeVoice': (id, file) => setTiers(ts => ts.map(t => t.id === id ? { ...t, voiceFiles: (t.voiceFiles || []).filter(f => f !== file) } : t)),
    // nhạc nền
    'music:add': async () => {
      const files = await pick('audio', true); if (!files.length) return [];
      const list = [...(cfg.music.files || []), ...files.filter(f => !(cfg.music.files || []).includes(f))];
      setCfg({ music: { files: list } }); return files;
    },
    'music:remove': (file) => setCfg({ music: { files: (cfg.music.files || []).filter(f => f !== file) } }),
    'music:cmd': (cmd, arg) => toDisplay('music:cmd', { cmd, arg }),
    'voice:test': (o) => toDisplay('voice:test', o || {}),
    // ảnh đại diện TikTok: tải 1 lần, lưu đệm trong userData/avatars
    'avatar:get': async (url) => {
      if (!url || !/^https?:/.test(url)) return null;
      const key = require('crypto').createHash('sha1').update(url.replace(/[?#].*$/, '')).digest('hex').slice(0, 20);
      try {
        let file = ['.webp', '.jpg', '.png', '.gif'].map(e => path.join(dirs.avatars, key + e)).find(f => fs.existsSync(f));
        if (!file) {
          const r = await net.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36', Referer: 'https://www.tiktok.com/' } });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const buf = Buffer.from(await r.arrayBuffer());
          const ext = buf.slice(8, 12).toString() === 'WEBP' ? '.webp' : buf[0] === 0x89 ? '.png' : buf.slice(0, 3).toString() === 'GIF' ? '.gif' : '.jpg';
          file = path.join(dirs.avatars, key + ext); fs.writeFileSync(file, buf);
          // dọn bớt khi quá 2000 ảnh
          const all = fs.readdirSync(dirs.avatars); if (all.length > 2000) all.slice(0, 500).forEach(f => { try { fs.unlinkSync(path.join(dirs.avatars, f)); } catch { } });
        }
        return 'media://local/' + encodeURIComponent(file);
      } catch (e) { addLog('err', 'Không tải được avatar: ' + e.message); return null; }
    },
    'tts:google': async (text, lang) => { try { return { file: await tts.google(text, lang) }; } catch (e) { addLog('err', 'Giọng Google lỗi: ' + e.message); return { error: e.message }; } },
    'test:pickAvatar': async () => { const f = await pick('image', false); if (f[0]) setCfg({ testAvatar: 'media://local/' + encodeURIComponent(f[0]) }); return f[0] || null; },
    'files:exists': (files) => files.map(f => fs.existsSync(f)),
    'paper:new': () => toDisplay('display:cmd', { cmd: 'newSheet' }),
    'paper:clear': () => toDisplay('display:cmd', { cmd: 'clearSheet' }),
    'update:check': () => ctx.updater.check(true),
    'update:apply': () => ctx.updater.apply(),
    'update:status': () => ctx.updater.status,
    'open:userData': () => shell.openPath(userData),
    'config:reset': (section) => { cfg[section] = undefined; return setCfg({ [section]: DEFAULTS[section] }); },
    'config:export': async () => { const r = await dialog.showSaveDialog(W.panel, { defaultPath: 'pen-writer-config.json' }); if (!r.canceled) fs.writeFileSync(r.filePath, JSON.stringify(cfg, null, 1)); return !r.canceled; },
    'config:import': async () => { const r = await dialog.showOpenDialog(W.panel, { filters: [{ name: 'JSON', extensions: ['json'] }] }); if (r.canceled) return false;
      const c = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); cfg = deepMerge(DEFAULTS, c); save(); broadcast('config', cfg); return true; },
  };
  ipcMain.handle('rpc', async (_e, name, ...args) => {
    const f = RPC[name]; if (!f) throw new Error('RPC không tồn tại: ' + name);
    return f(...args);
  });

  ctx.updater.onStatus((s) => toPanel('update:status', s));
  if (cfg.update) ctx.updater.configure(cfg.update);

  createPanel();
  createDisplay();
  addLog('sys', `Khởi động v${ctx.appVersion} (${ctx.appSource === 'update' ? 'bản cập nhật' : 'bản cài'})`);
  if (cfg.tiktok.autoConnect && cfg.tiktok.username) setTimeout(() => tiktok.connect(cfg.tiktok.username), 1500);
  if (cfg.update.autoCheck) setTimeout(() => ctx.updater.check(false), 6000);
  setInterval(() => cfg.update.autoCheck && ctx.updater.check(false), Math.max(10, cfg.update.intervalMin || 30) * 60000);
};
