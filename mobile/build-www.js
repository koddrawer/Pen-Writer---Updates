// Dựng thư mục www cho Capacitor: giao diện (từ app/renderer + mobile/web) và dự án Node (www/nodejs).
// Dùng: node build-www.js [đường dẫn app/]   (mặc định ../app)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { assembleWww, assembleCore } = require('./node/build-lib.js');

const mobileDir = __dirname;
const appDir = path.resolve(process.argv[2] || path.join(mobileDir, '..', 'app'));
const www = path.join(mobileDir, 'www');
const nodeOut = path.join(www, 'nodejs');

fs.rmSync(www, { recursive: true, force: true });
assembleWww(appDir, mobileDir, www);
assembleCore(appDir, mobileDir, path.join(nodeOut, 'core'));
fs.copyFileSync(path.join(mobileDir, 'node', 'main.js'), path.join(nodeOut, 'main.js'));
const pkg = JSON.parse(fs.readFileSync(path.join(mobileDir, 'node', 'package.json'), 'utf8'));
pkg.shellVersion = process.env.VERSION_NAME || pkg.shellVersion;
fs.writeFileSync(path.join(nodeOut, 'package.json'), JSON.stringify(pkg, null, 2));

if (!process.argv.includes('--no-install')) {
  execSync('npm install --omit=dev --no-audit --no-fund --no-package-lock', { cwd: nodeOut, stdio: 'inherit' });
  // gọn APK: bỏ tài liệu, bản đồ nguồn, kiểu TS
  const junk = /(\.md|\.map|\.d\.ts|\.d\.mts|\.d\.cts|LICENSE.*|CHANGELOG.*|\.ts)$/i;
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (/^(test|tests|docs?|example|examples|\.github)$/i.test(e.name)) fs.rmSync(p, { recursive: true, force: true }); else walk(p); } else if (junk.test(e.name)) fs.rmSync(p, { force: true }); } };
  walk(path.join(nodeOut, 'node_modules'));
}
const ver = JSON.parse(fs.readFileSync(path.join(appDir, 'version.json'), 'utf8')).version;
console.log(`www đã sẵn sàng: giao diện + lõi v${ver}`);
