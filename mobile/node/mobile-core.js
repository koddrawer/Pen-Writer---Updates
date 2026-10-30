// Lõi Pen Writer trên Android (chạy trong Node.js của điện thoại): cấu hình, TikTok, hàng chờ, giọng đọc, avatar, cập nhật.
// Trao đổi với giao diện (WebView) qua kênh bridge: 'rpc' (gọi hàm) / 'send' (báo trạng thái) <-> 'rpc-res' / 'evt'.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const DEFAULTS = require('./defaults.js');
const { deepMerge, migrateConfig, uid, imgExt } = require('./shared.js');
const { JobQueue } = require('./queue.js');
const { TikTok } = require('./tiktok.js');
const { TTS } = require('./tts.js');
const { startServer } = require('./server.js');
const { MobileUpdater } = require('./updater-mobile.js');

module.exports = async function start(ctx) {
  const { channel, dataDir, req } = ctx;
  const cfgFile = path.join(dataDir, 'config.json');
  const dirs = { fonts: path.join(dataDir, 'fonts'), sounds: path.join(dataDir, 'sounds'), avatars: path.join(dataDir, 'avatars'), uploads: path.join(dataDir, 'uploads') };
  Object.values(dirs).forEach(d => fs.mkdirSync(d, { recursive: true }));

  // ---- máy chủ file nội bộ
  const { srv, port } = await startServer({ roots: [dataDir, ctx.coreDir, ctx.bundledDir], uploadDir: dirs.uploads });
  const mediaUrl = (p) => !p ? '' : /^(https?|data|blob):/.test(p) ? p : `http://127.0.0.1:${port}/f?p=${encodeURIComponent(p)}`;

  // ---- cấu hình (mặc định riêng cho điện thoại: tắt xoay camera bằng tay để chạm nhầm không lệch khung)
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch { }
  if (!saved.display || saved.display.mouseCamera === undefined) saved = deepMerge(saved, { display: { mouseCamera: false } });
  let cfg = migrateConfig(DEFAULTS, saved);
  cfg.platform = 'android';
  let saveT = null;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => fs.writeFile(cfgFile, JSON.stringify(cfg, null, 1), () => { }), 300); };
  const getCfg = () => cfg;
  const emit = (ch, data) => { try { channel.post('evt', ch, data); } catch { } };
  function setCfg(patch, { silent } = {}) {
    cfg = deepMerge(cfg, patch); save();
    if (patch.update) updater.configure(cfg.update);
    if (!silent) emit('config', cfg);
    return cfg;
  }

  // ---- nhật ký
  const log = [];
  const addLog = (kind, text) => { const e = { t: Date.now(), kind, text }; log.push(e); if (log.length > 300) log.shift(); emit('log', e); };
  const onErr = (e) => { try { addLog('err', 'Lỗi: ' + (e && e.message || e)); } catch { } };
  process.on('uncaughtException', onErr); process.on('unhandledRejection', onErr);

  // ---- hàng chờ + TikTok + giọng đọc + cập nhật
  const queue = new JobQueue(getCfg, () => { emit('job:available', {}); emit('queue', queue.snapshot()); });
  const tiktok = new TikTok(req, getCfg, {
    status: (s) => emit('tiktok:status', s), log: addLog,
    join: (u) => { queue.activity(); queue.addName(u, 'join'); },
    chat: (u) => { queue.activity(); queue.addName(u, 'chat'); },
    follow: (u) => { queue.activity(); queue.addName(u, 'follow'); },
    share: (u) => { queue.activity(); queue.addName(u, 'share'); },
    like: (u) => queue.addName(u, 'like'),
    gift: (g) => queue.addDonor(g),
  });
  const tts = new TTS(path.join(dataDir, 'tts'), (u, o) => fetch(u, o), () => { try { return req('ws'); } catch { return null; } });
  const updater = new MobileUpdater({ dataDir, running: { version: ctx.appVersion, dir: ctx.coreDir }, shellVersion: ctx.shellVersion, req });
  updater.configure(cfg.update);
  updater.onStatus((s) => emit('update:status', s));

  const setTiers = (fn) => setCfg({ tiers: fn(cfg.tiers.map(t => ({ ...t }))) });
  const display = (cmd) => emit('display:cmd', cmd);
  let displayStatus = {};

  const RPC = {
    'config:get': () => cfg,
    'config:set': (patch) => setCfg(patch),
    'boot:info': () => ({ port, www: ctx.www || '', appVersion: ctx.appVersion, platform: 'android' }),
    'app:info': () => ({ appVersion: ctx.appVersion, shellVersion: ctx.shellVersion, appSource: ctx.source, userData: dataDir }),
    'job:next': () => queue.next(),
    'queue:get': () => queue.snapshot(),
    'queue:remove': (id) => queue.remove(id),
    'queue:clear': (w) => queue.clear(w),
    'queue:pause': (v) => queue.setPaused(v),
    'test:gift': (o = {}) => {
      const g = { user: { uniqueId: 'test_' + Math.random().toString(36).slice(2, 7), nickname: o.name || 'Người tặng ' + Math.floor(Math.random() * 999), avatar: cfg.testAvatar || '' }, gift: o.gift || 'Rose', count: o.count || 1, diamonds: o.diamonds ?? 1 };
      addLog('gift', `[TEST] ${g.user.nickname} tặng ${g.gift} x${g.count} (${g.diamonds * g.count} xu)`); queue.addDonor(g, true);
    },
    'test:join': (name) => { const u = { uniqueId: 'test_' + Math.random().toString(36).slice(2, 7), nickname: name || 'Khách ' + Math.floor(Math.random() * 999), avatar: cfg.testAvatar || '' }; addLog('join', `[TEST] ${u.nickname} vào phòng`); queue.addName(u, 'join', true); },
    'test:quote': () => queue.forceQuote(),
    'test:setAvatar': (p) => setCfg({ testAvatar: p ? mediaUrl(p) : '' }),
    'tiktok:connect': (u) => tiktok.connect(u),
    'tiktok:disconnect': () => tiktok.disconnect(),
    'tiktok:status': () => tiktok.status,
    'log:get': () => log,
    'display:cmd': (m) => display(m),
    'fonts:addPaths': (items) => { const add = (items || []).map(x => ({ id: uid('font'), name: x.name, file: x.path })); if (add.length) setCfg({ fonts: [...cfg.fonts, ...add] }); return add; },
    'fonts:remove': (id) => { const f = cfg.fonts.find(x => x.id === id); if (!f || f.builtin) return; try { fs.unlinkSync(f.file); } catch { } setCfg({ fonts: cfg.fonts.filter(x => x.id !== id) }); },
    'tier:add': () => setTiers(ts => { const last = ts[ts.length - 1] || DEFAULTS.tiers[0]; ts.push({ ...last, id: uid('t'), name: 'Mức mới', min: (last.min || 1) * 2, voiceFiles: [] }); return ts; }),
    'tier:remove': (id) => setTiers(ts => ts.filter(t => t.id !== id)),
    'tier:set': (id, patch) => setTiers(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t)),
    'tier:reset': () => setCfg({ tiers: DEFAULTS.tiers }),
    'tier:addVoicePaths': (id, items) => setTiers(ts => ts.map(t => t.id === id ? { ...t, voiceFiles: [...(t.voiceFiles || []), ...(items || []).map(x => x.path)] } : t)),
    'tier:removeVoice': (id, file) => setTiers(ts => ts.map(t => t.id === id ? { ...t, voiceFiles: (t.voiceFiles || []).filter(f => f !== file) } : t)),
    'music:addPaths': (items) => setCfg({ music: { files: [...(cfg.music.files || []), ...(items || []).map(x => x.path)] } }),
    'music:remove': (file) => setCfg({ music: { files: (cfg.music.files || []).filter(f => f !== file) } }),
    'music:cmd': (cmd, arg) => emit('music:cmd', { cmd, arg }),
    'voice:test': (o) => emit('voice:test', o || {}),
    'avatar:get': async (url) => {
      if (!url || !/^https?:/.test(url)) return null;
      if (url.startsWith(`http://127.0.0.1:${port}/`)) return url;
      const key = crypto.createHash('sha1').update(url.replace(/[?#].*$/, '')).digest('hex').slice(0, 20);
      try {
        let file = ['.webp', '.jpg', '.png', '.gif'].map(e => path.join(dirs.avatars, key + e)).find(f => fs.existsSync(f));
        if (!file) {
          const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36', Referer: 'https://www.tiktok.com/' } });
          if (!r.ok) throw new Error('HTTP ' + r.status);
          const buf = Buffer.from(await r.arrayBuffer());
          file = path.join(dirs.avatars, key + imgExt(buf)); fs.writeFileSync(file, buf);
          const all = fs.readdirSync(dirs.avatars); if (all.length > 2000) all.slice(0, 500).forEach(f => { try { fs.unlinkSync(path.join(dirs.avatars, f)); } catch { } });
        }
        return mediaUrl(file);
      } catch (e) { addLog('err', 'Không tải được avatar: ' + e.message); return null; }
    },
    'tts:edge': async (text, o) => { try { return { file: mediaUrl(await tts.edge(text, o)) }; } catch (e) { addLog('err', 'Giọng Edge lỗi: ' + e.message + ' – chuyển sang Google'); return { error: e.message }; } },
    'tts:google': async (text, lang) => { try { return { file: mediaUrl(await tts.google(text, lang)) }; } catch (e) { addLog('err', 'Giọng Google lỗi: ' + e.message); return { error: e.message }; } },
    'files:exists': (files) => (files || []).map(f => fs.existsSync(f)),
    'paper:new': () => display({ cmd: 'newSheet' }),
    'paper:clear': () => display({ cmd: 'clearSheet' }),
    'update:check': () => updater.check(true),
    'update:apply': () => { const a = JSON.parse(fs.readFileSync(path.join(dataDir, 'updates', 'active.json'), 'utf8')); ctx.apply && ctx.apply(a); return a; },
    'update:status': () => updater.status,
    'config:reset': (section) => { cfg[section] = undefined; return setCfg({ [section]: DEFAULTS[section] }); },
    'config:exportText': () => JSON.stringify(cfg, null, 1),
    'config:importText': (text) => { const c = JSON.parse(text); cfg = migrateConfig(DEFAULTS, c); cfg.platform = 'android'; save(); emit('config', cfg); return true; },
    // không dùng trên điện thoại
    'win:show': () => { }, 'win:displaySize': () => null, 'win:setRotate': () => { }, 'open:userData': () => { },
  };

  // ---- kênh với WebView
  const onRpc = async (id, name, args) => {
    try {
      const f = RPC[name]; if (!f) throw new Error('RPC không tồn tại: ' + name);
      channel.post('rpc-res', id, true, await f(...(args || [])) ?? null);
    } catch (e) { channel.post('rpc-res', id, false, String(e && e.message || e)); }
  };
  const onSend = (ch, data) => {
    if (ch === 'display:status') { displayStatus = { ...displayStatus, ...data }; emit('display:status', displayStatus); }
    else if (ch === 'display:fps') { displayStatus.fps = data; emit('display:status', displayStatus); }
    else if (ch === 'display:jobDone') queue.done(data);
    else if (ch === 'display:sheet') { queue.sheet(); addLog('sys', 'Đã thay tờ giấy mới'); }
    else if (ch === 'display:log') addLog(data.kind || 'sys', data.text);
    else if (ch === 'display:ready') { queue.requeueCurrent(); addLog('sys', 'Màn hiển thị đã sẵn sàng'); }
    else if (ch === 'display:camera') { const cams = { ...(cfg.display.cameras || {}) }; if (data.cam) cams[data.name] = data.cam; else delete cams[data.name]; setCfg({ display: { cameras: cams } }); addLog('sys', data.cam ? 'Đã lưu góc camera' : 'Đã đặt lại camera'); }
    else if (ch === 'music:status') emit('music:status', data);
  };
  channel.on('rpc', onRpc);
  channel.on('send', onSend);

  addLog('sys', `Khởi động v${ctx.appVersion} trên Android (${ctx.source === 'update' ? 'bản cập nhật' : 'bản cài'})`);
  emit('core:ready', { port });
  if (cfg.tiktok.autoConnect && cfg.tiktok.username) setTimeout(() => tiktok.connect(cfg.tiktok.username), 1500);
  if (cfg.update.autoCheck) setTimeout(() => updater.check(false), 8000);
  const iv = setInterval(() => cfg.update.autoCheck && updater.check(false), Math.max(10, cfg.update.intervalMin || 30) * 60000);

  // dọn dẹp khi chuyển sang bản cập nhật mới (không cần khởi động lại app)
  return {
    port,
    async dispose() {
      clearInterval(iv);
      channel.removeListener && channel.removeListener('rpc', onRpc);
      channel.removeListener && channel.removeListener('send', onSend);
      process.removeListener('uncaughtException', onErr); process.removeListener('unhandledRejection', onErr);
      try { await tiktok.disconnect(); } catch { }
      await new Promise(r => srv.close(() => r()));
    },
  };
};
