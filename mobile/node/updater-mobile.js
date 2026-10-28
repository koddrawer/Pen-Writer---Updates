// Cập nhật nóng bản Android: tải repo GitHub (zip), ghép www + lõi Node mới vào thư mục dữ liệu, áp dụng không cần cài lại APK.
const fs = require('fs');
const path = require('path');

const cmp = (a, b) => {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0), pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

class MobileUpdater {
  // dataDir: thư mục dữ liệu; running: { version, source }; shellVersion: phiên bản APK
  constructor({ dataDir, running, shellVersion, req }) {
    Object.assign(this, { dataDir, running, shellVersion, req });
    this.dir = path.join(dataDir, 'updates'); fs.mkdirSync(this.dir, { recursive: true });
    this.repo = { owner: 'koddrawer', repo: 'Pen-Writer---Updates', branch: 'main' };
    this.status = { state: 'idle', message: '' }; this.listeners = []; this.busy = false;
  }
  onStatus(f) { this.listeners.push(f); }
  set(s) { this.status = { ...s, running: this.running.version, at: Date.now() }; this.listeners.forEach(f => f(this.status)); }
  configure(r) { this.repo = { ...this.repo, ...r }; }
  async get(url) {
    const r = await fetch(url, { headers: { 'User-Agent': 'pen-writer-android', 'Cache-Control': 'no-cache' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r;
  }
  async remoteVersion() {
    const { owner, repo, branch } = this.repo;
    try { return await (await this.get(`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/version.json?t=${Date.now()}`)).json(); }
    catch { const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/version.json?ref=${branch}`, { headers: { Accept: 'application/vnd.github.raw+json', 'User-Agent': 'pen-writer-android' } }); return r.json(); }
  }
  async check(manual) {
    if (this.busy) return this.status;
    if (this.status.state === 'ready' && !manual) return this.status;
    this.busy = true;
    try {
      this.set({ state: 'checking', message: 'Đang kiểm tra cập nhật…' });
      const rv = await this.remoteVersion();
      if (!rv || !rv.version) throw new Error((rv && rv.message) || 'không đọc được version.json');
      if (cmp(rv.version, this.running.version) <= 0) { this.set({ state: 'uptodate', message: `Đang dùng bản mới nhất (v${this.running.version})` }); return this.status; }
      if (readJson(path.join(this.dir, 'bad.json'), []).includes(rv.version)) { this.set({ state: 'error', message: `Bản v${rv.version} đã bị gỡ vì khởi động lỗi – chờ bản sau.` }); return this.status; }
      if (rv.minAndroid && cmp(this.shellVersion, rv.minAndroid) < 0) { this.set({ state: 'error', message: `Bản v${rv.version} cần cài APK mới (≥ ${rv.minAndroid}). Tải ở mục Releases của repo.` }); return this.status; }
      const act = readJson(path.join(this.dir, 'active.json'));
      if (act && act.version === rv.version && fs.existsSync(act.www)) { this.set({ state: 'ready', version: rv.version, notes: rv.notes || '', message: `Đã tải v${rv.version} – bấm áp dụng` }); return this.status; }
      await this.download(rv);
    } catch (e) { this.set({ state: 'error', message: 'Không kiểm tra được cập nhật: ' + (e.message || e) }); }
    finally { this.busy = false; }
    return this.status;
  }
  async download(rv) {
    const AdmZip = this.req('adm-zip');
    const { owner, repo, branch } = this.repo;
    this.set({ state: 'downloading', message: `Đang tải v${rv.version}…`, version: rv.version });
    const buf = Buffer.from(await (await this.get(`https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${encodeURIComponent(branch)}`)).arrayBuffer());
    const zip = new AdmZip(buf); const entries = zip.getEntries();
    const top = entries[0].entryName.split('/')[0];
    const base = path.join(this.dir, rv.version); const src = path.join(base, 'src');
    fs.rmSync(base, { recursive: true, force: true }); fs.mkdirSync(src, { recursive: true });
    for (const e of entries) {
      if (e.isDirectory) continue;
      const rel = e.entryName.slice(top.length + 1);
      if (!/^(app|mobile)\//.test(rel) || /^mobile\/android\//.test(rel)) continue;     // chỉ cần app/ và phần web/node của mobile
      const dst = path.join(src, rel); if (!path.normalize(dst).startsWith(path.normalize(src))) continue;
      fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, e.getData());
    }
    const lib = require(path.join(src, 'mobile', 'node', 'build-lib.js'));
    const www = path.join(base, 'www'), core = path.join(base, 'core');
    lib.assembleWww(path.join(src, 'app'), path.join(src, 'mobile'), www);
    lib.assembleCore(path.join(src, 'app'), path.join(src, 'mobile'), core);
    fs.rmSync(src, { recursive: true, force: true });
    fs.writeFileSync(path.join(this.dir, 'active.json'), JSON.stringify({ version: rv.version, www, core, at: Date.now() }));
    // dọn bản cũ
    for (const d of fs.readdirSync(this.dir)) { const full = path.join(this.dir, d); if (fs.statSync(full).isDirectory() && full !== base && !(this.running.dir || '').startsWith(full)) fs.rmSync(full, { recursive: true, force: true }); }
    this.set({ state: 'ready', version: rv.version, notes: rv.notes || '', message: `Đã tải v${rv.version} – bấm áp dụng` });
  }
}
module.exports = { MobileUpdater, cmp, readJson };
