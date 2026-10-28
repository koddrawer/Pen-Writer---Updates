// Khởi động lõi Node của Pen Writer trên Android.
// Chọn lõi: bản cập nhật nóng (thư mục dữ liệu) nếu mới hơn bản cài, không thì bản đóng gói trong APK.
// Bản cập nhật làm app khởi động hỏng 3 lần liên tiếp sẽ bị gỡ, quay về bản cài.
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { createRequire } = require('module');
const { app, channel } = require('bridge');

const bundledDir = path.join(__dirname, 'core');
const pkg = require('./package.json');
const req = createRequire(path.join(__dirname, 'package.json'));        // thư viện npm luôn lấy từ bản cài
const dataDir = app.datadir();
const updDir = path.join(dataDir, 'updates');
fs.mkdirSync(updDir, { recursive: true });
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, o) => { try { fs.writeFileSync(f, JSON.stringify(o)); } catch { } };
const cmp = (a, b) => {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0), pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
const bundledVersion = (readJson(path.join(bundledDir, 'version.json')) || {}).version || '0.0.0';
const activeFile = path.join(updDir, 'active.json'), bootFile = path.join(updDir, 'boot.json'), badFile = path.join(updDir, 'bad.json');

function dropActive(reason) {
  const a = readJson(activeFile);
  if (a) {
    const bad = readJson(badFile, []); if (!bad.includes(a.version)) bad.push(a.version); writeJson(badFile, bad);
    try { fs.rmSync(path.dirname(a.www), { recursive: true, force: true }); } catch { }
    try { fs.unlinkSync(activeFile); } catch { }
    console.error('Gỡ bản cập nhật v' + a.version + ': ' + reason);
  }
}

function pickActive() {
  const a = readJson(activeFile);
  if (!a || !a.core || !fs.existsSync(path.join(a.core, 'mobile-core.js')) || !fs.existsSync(a.www)) return null;
  if (cmp(a.version, bundledVersion) <= 0) { dropActive('bản cài mới hơn'); return null; }
  const boot = readJson(bootFile, {});
  const tries = boot.version === a.version ? (boot.tries || 0) + 1 : 1;
  if (tries > 3) { dropActive('khởi động lỗi nhiều lần'); writeJson(bootFile, {}); return null; }
  writeJson(bootFile, { version: a.version, tries });
  return a;
}

// ---- kênh trung gian: lõi có thể được thay khi áp dụng cập nhật mà không mất kết nối với WebView
let sub = null, cur = null, pending = [];
const mkSub = () => {
  const e = new EventEmitter();
  return { on: (n, f) => e.on(n, f), removeListener: (n, f) => e.removeListener(n, f), post: (...a) => channel.post(...a), emit: (...a) => e.emit(...a) };
};
const route = (name) => (...args) => {
  if (name === 'send' && args[0] === 'display:ready') writeJson(bootFile, {});      // khởi động thành công
  if (name === 'rpc' && args[1] === 'boot:ping') return channel.post('rpc-res', args[0], true, { ready: !!cur });
  if (sub && cur) sub.emit(name, ...args); else pending.push([name, args]);
};
channel.on('rpc', route('rpc'));
channel.on('send', route('send'));

async function boot(a) {
  const useUpdate = !!a;
  const coreDir = useUpdate ? a.core : bundledDir;
  sub = mkSub();
  const ctx = {
    channel: sub, dataDir, req, coreDir, bundledDir,
    www: useUpdate ? a.www : '',
    appVersion: useUpdate ? a.version : bundledVersion,
    shellVersion: pkg.shellVersion || pkg.version,
    source: useUpdate ? 'update' : 'bundled',
    apply: (na) => setTimeout(() => swap(na), 150),
  };
  const start = require(path.join(coreDir, 'mobile-core.js'));
  cur = await start(ctx);
  const q = pending; pending = []; q.forEach(([n, args]) => sub.emit(n, ...args));
}

async function swap(na) {
  try { if (cur) await cur.dispose(); } catch { }
  cur = null;
  // xoá cache require của lõi cũ để nạp file mới
  Object.keys(require.cache).forEach(k => { if (k.startsWith(updDir) || k.startsWith(bundledDir)) delete require.cache[k]; });
  try { writeJson(bootFile, { version: na.version, tries: 1 }); await boot(na); }
  catch (e) { console.error(e); dropActive('lỗi nạp lõi: ' + e.message); await boot(null); }
}

(async () => {
  const a = pickActive();
  try { await boot(a); }
  catch (e) {
    console.error(e);
    if (!a) throw e;
    dropActive('lỗi nạp lõi: ' + e.message);
    Object.keys(require.cache).forEach(k => { if (k.startsWith(updDir)) delete require.cache[k]; });
    await boot(null);
  }
})();

app.on('pause', (lock) => lock.release());
