// Ghép thư mục web (www) và lõi Node cho bản Android từ mã nguồn chung (app/) + phần riêng của mobile (mobile/).
// Dùng ở 2 nơi: build-www.js khi build APK, và bộ cập nhật nóng trên điện thoại.
const fs = require('fs');
const path = require('path');

const CORE_SHARED = ['defaults.js', 'queue.js', 'tiktok.js', 'tts.js', 'shared.js', 'edge-tts.js'];
const CORE_MOBILE = ['mobile-core.js', 'server.js', 'updater-mobile.js', 'build-lib.js'];

function cp(src, dst) { fs.rmSync(dst, { recursive: true, force: true }); fs.cpSync(src, dst, { recursive: true }); }

// appDir = thư mục app/ ; mobileDir = thư mục mobile/ ; out = thư mục www
function assembleWww(appDir, mobileDir, out) {
  fs.mkdirSync(out, { recursive: true });
  cp(path.join(appDir, 'renderer'), path.join(out, 'renderer'));
  cp(path.join(appDir, 'assets'), path.join(out, 'assets'));
  fs.copyFileSync(path.join(appDir, 'version.json'), path.join(out, 'version.json'));
  // phần giao diện riêng của điện thoại (đè lên)
  fs.cpSync(path.join(mobileDir, 'web'), out, { recursive: true });
  // bỏ CSP của bản Electron (giao thức app:/media:) – trên điện thoại file nạp qua http://127.0.0.1
  const noCsp = (h) => h.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>\s*/i, '');
  // bảng điều khiển chạy trong khung (iframe): dùng chung cầu nối api của trang chính + CSS cho màn hình nhỏ
  const ph = path.join(out, 'renderer', 'panel.html');
  let html = noCsp(fs.readFileSync(ph, 'utf8'));
  if (!html.includes('mobile-panel')) {
    html = html.replace('<link rel="stylesheet" href="./panel.css">', '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./panel.css"><link rel="stylesheet" href="./mobile-panel.css">')
      .replace('<script type="module" src="./js/panel.js"></script>', '<script>window.api = parent.api;</script><script type="module" src="./js/panel.js"></script>');
  }
  fs.writeFileSync(ph, html);
  // màn hiển thị trên điện thoại = display.html + cầu nối api (display.js được nạp khi lõi Node sẵn sàng)
  let d = noCsp(fs.readFileSync(path.join(out, 'renderer', 'display.html'), 'utf8'));
  d = d.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><link rel="stylesheet" href="./mobile.css">')
    .replace('<script type="module" src="./js/display.js"></script>', '<script src="./lib/capacitor.js"></script><script src="./js/mobile-api.js"></script>');
  if (!d.includes('mobile-api.js')) throw new Error('display.html: không chèn được mobile-api.js');
  fs.writeFileSync(path.join(out, 'renderer', 'mobile.html'), d);
}

// lõi Node: file dùng chung trong app/core + file riêng mobile/node
function assembleCore(appDir, mobileDir, out) {
  fs.mkdirSync(out, { recursive: true });
  for (const f of CORE_SHARED) fs.copyFileSync(path.join(appDir, 'core', f), path.join(out, f));
  for (const f of CORE_MOBILE) fs.copyFileSync(path.join(mobileDir, 'node', f), path.join(out, f));
  fs.copyFileSync(path.join(appDir, 'version.json'), path.join(out, 'version.json'));
}

module.exports = { assembleWww, assembleCore };
