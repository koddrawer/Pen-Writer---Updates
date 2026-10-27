#!/usr/bin/env node
// Đẩy bản cập nhật nóng lên repo GitHub.
// Dùng:  node tools/publish-update.js [patch|minor|major|x.y.z] "ghi chú"
// UPDATE_REPO_DIR = thư mục đã clone repo cập nhật (mặc định ../pen-writer-updates)
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const repoDir = path.resolve(process.env.UPDATE_REPO_DIR || path.join(root, '..', 'pen-writer---updates'));
const bump = process.argv[2] || 'patch';
const notes = process.argv[3] || '';
if (!fs.existsSync(path.join(repoDir, '.git'))) {
  console.error(`Không thấy repo git ở ${repoDir}.\nClone trước:  git clone https://github.com/koddrawer/Pen-Writer---Updates.git "${repoDir}"`);
  process.exit(1);
}
const vf = path.join(root, 'app', 'version.json');
const v = JSON.parse(fs.readFileSync(vf, 'utf8'));
let [a, b, c] = v.version.split('.').map(Number);
if (/^\d+\.\d+\.\d+$/.test(bump)) [a, b, c] = bump.split('.').map(Number);
else if (bump === 'major') { a++; b = 0; c = 0; } else if (bump === 'minor') { b++; c = 0; } else if (bump !== 'same') c++;
v.version = `${a}.${b}.${c}`; v.notes = notes || v.notes; v.date = new Date().toISOString().slice(0, 10);
v.minShell = v.minShell || require(path.join(root, 'package.json')).version;
fs.writeFileSync(vf, JSON.stringify(v, null, 2));

const cp = (src, dst) => { fs.rmSync(dst, { recursive: true, force: true }); fs.cpSync(src, dst, { recursive: true }); };
cp(path.join(root, 'app'), path.join(repoDir, 'app'));
fs.writeFileSync(path.join(repoDir, 'version.json'), JSON.stringify(v, null, 2));
// phần mã nguồn còn lại (không cập nhật nóng) để lưu trữ / build lại
const S = path.join(repoDir, '_source');
fs.mkdirSync(S, { recursive: true });
for (const f of ['shell', 'tools', '.github']) if (fs.existsSync(path.join(root, f))) cp(path.join(root, f), path.join(S, f));
for (const f of ['package.json', 'package-lock.json', 'README.md', '.gitignore']) if (fs.existsSync(path.join(root, f))) fs.copyFileSync(path.join(root, f), path.join(S, f));

if (process.env.NO_PUSH) { console.log('Đã chép v' + v.version + ' (không push)'); process.exit(0); }
const run = (cmd) => execSync(cmd, { cwd: repoDir, stdio: 'inherit' });
run('git add -A');
const msg = `v${v.version}${notes ? ': ' + notes : ''}` + (process.env.COMMIT_TRAILER ? '\n\n' + process.env.COMMIT_TRAILER : '');
execSync('git commit -F -', { cwd: repoDir, input: msg, stdio: ['pipe', 'inherit', 'inherit'] });
run('git push');
console.log(`\n✔ Đã đẩy v${v.version}. Các máy đang chạy app sẽ nhận bản mới ở lần kiểm tra kế tiếp.`);
