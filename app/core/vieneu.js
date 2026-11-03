// Giọng VieNeu-TTS (https://github.com/pnnbao97/VieNeu-TTS): TTS tiếng Việt mã nguồn mở chạy ngay trên máy, nhân bản giọng từ 3–8 giây ghi âm.
// App nói chuyện với máy chủ OpenAI-compatible của VieNeu (python -m apps.openai_speech):
//   POST /v1/audio/speech {input, voice, response_format:'pcm', sample_rate} -> PCM 16-bit mono
//   GET  /v1/voices  ·  POST /v1/voices (multipart name + file) -> nhân bản giọng  ·  GET /health
// Trên PC app tự cài (uv + Python + gói vieneu) vào thư mục dữ liệu và tự bật máy chủ.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');

const RATE = 24000;
const trimUrl = (u) => String(u || 'http://127.0.0.1:8000').trim().replace(/\/+$/, '');

function wavFromPcm(pcm, rate = RATE) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function call(url, p, opt = {}, ms = 60000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(trimUrl(url) + p, { ...opt, signal: ac.signal });
    if (!r.ok) { let m = ''; try { m = await r.text(); } catch { } const e = new Error(`VieNeu HTTP ${r.status}${m ? ': ' + m.slice(0, 200) : ''}`); e.status = r.status; e.body = m; throw e; }
    return r;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('VieNeu quá thời gian');
    if (!e.status && /fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/i.test(String(e.message) + String(e.cause && e.cause.code))) throw new Error('chưa kết nối được máy chủ VieNeu (' + trimUrl(url) + ')');
    throw e;
  } finally { clearTimeout(t); }
}

async function health(url) { return (await call(url, '/health', {}, 4000)).json(); }
async function voices(url) { const j = await (await call(url, '/v1/voices', {}, 8000)).json(); return (j.data || []).map(v => v.id || v.name); }
async function addVoice(url, name, file) {
  const fd = new FormData();
  fd.append('name', name);
  fd.append('denoise', 'true');
  fd.append('file', new Blob([fs.readFileSync(file)]), 'ref' + (path.extname(file) || '.wav'));
  return (await call(url, '/v1/voices', { method: 'POST', body: fd }, 120000)).json();
}
// đọc text bằng giọng `voice`; giọng nhân bản (clones) bị máy chủ quên sau khi khởi động lại -> tự nạp lại rồi thử lần nữa
async function synth(url, text, voice, clones = []) {
  const body = JSON.stringify({ model: 'vieneu-v3-turbo', input: text, voice: voice || undefined, response_format: 'pcm', sample_rate: RATE });
  const go = async () => Buffer.from(await (await call(url, '/v1/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json' }, body }, 90000)).arrayBuffer());
  let pcm;
  try { pcm = await go(); }
  catch (e) {
    const cl = clones.find(c => c.name === voice);
    if (e.status === 400 && /unknown voice/i.test(e.body || '') && cl && fs.existsSync(cl.file)) { await addVoice(url, cl.name, cl.file); pcm = await go(); }
    else throw e;
  }
  if (pcm.length < 2000) throw new Error('VieNeu trả về âm thanh rỗng');
  return wavFromPcm(pcm);
}

// ---------------- tự cài + chạy máy chủ VieNeu trên PC ----------------
class VieNeuServer {
  constructor(dir, onStatus, onLog) {
    this.dir = dir; this.onStatus = onStatus; this.onLog = onLog;
    this.venv = path.join(dir, 'venv');
    this.py = process.platform === 'win32' ? path.join(this.venv, 'Scripts', 'python.exe') : path.join(this.venv, 'bin', 'python');
    this.proc = null; this.status = { state: this.installed() ? 'stopped' : 'notInstalled', message: '' };
  }
  installed() { return fs.existsSync(this.py) && fs.existsSync(path.join(this.dir, 'installed.json')); }
  set(state, message) { this.status = { state, message, at: Date.now() }; this.onStatus(this.status); }
  log(t) { const l = String(t).split(/\r?\n/).map(x => x.trim()).filter(x => x.length > 12 && /[a-zA-Z]{3}/.test(x)); if (l.length) this.onLog(l.slice(-2).join(' · ').slice(0, 300)); }
  run(cmd, args, opts = {}) {
    return new Promise((res, rej) => {
      const p = spawn(cmd, args, { windowsHide: true, ...opts, env: { ...process.env, PYTHONIOENCODING: 'utf-8', ...(opts.env || {}) } });
      let tail = '';
      const on = (d) => { const s = d.toString(); tail = (tail + s).slice(-2000); if (/\n/.test(s)) this.log(s); };
      p.stdout && p.stdout.on('data', on); p.stderr && p.stderr.on('data', on);
      p.on('error', rej);
      p.on('close', (code) => code === 0 ? res(tail) : rej(new Error(`${path.basename(cmd)} lỗi (mã ${code}): ${tail.split(/\r?\n/).filter(Boolean).slice(-2).join(' ')}`)));
    });
  }
  uvPath() {
    const exe = process.platform === 'win32' ? 'uv.exe' : 'uv';
    const cands = [path.join(this.dir, 'uv', exe), path.join(os.homedir(), '.local', 'bin', exe), path.join(os.homedir(), '.cargo', 'bin', exe)];
    return cands.find(f => fs.existsSync(f)) || null;
  }
  async ensureUv() {
    let uv = this.uvPath(); if (uv) return uv;
    this.set('installing', 'Đang tải công cụ uv…');
    const inst = path.join(this.dir, 'uv');
    fs.mkdirSync(inst, { recursive: true });
    const env = { UV_INSTALL_DIR: inst, UV_NO_MODIFY_PATH: '1', INSTALLER_NO_MODIFY_PATH: '1' };
    if (process.platform === 'win32') await this.run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://astral.sh/uv/install.ps1 | iex'], { env });
    else await this.run('sh', ['-c', 'curl -LsSf https://astral.sh/uv/install.sh | sh'], { env });
    uv = this.uvPath(); if (!uv) throw new Error('không cài được uv');
    return uv;
  }
  // gpu: cài thêm PyTorch CUDA (card NVIDIA, ~3 GB) để đọc nhanh hơn
  async install({ gpu } = {}) {
    if (this.busy) return this.status; this.busy = true;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const uv = await this.ensureUv();
      this.set('installing', 'Đang cài Python 3.12…');
      if (!fs.existsSync(this.py)) await this.run(uv, ['venv', this.venv, '--python', '3.12', '--seed']);
      this.set('installing', 'Đang cài VieNeu-TTS (vài trăm MB, lần đầu hơi lâu)…');
      await this.run(uv, ['pip', 'install', '--python', this.py, '--upgrade', 'vieneu', 'fastapi', 'uvicorn', 'python-multipart']);
      if (gpu) {
        this.set('installing', 'Đang cài PyTorch cho card NVIDIA (~3 GB)…');
        await this.run(uv, ['pip', 'install', '--python', this.py, 'torch==2.8.0', 'torchaudio==2.8.0', '--index-url', 'https://download.pytorch.org/whl/cu128']);
        await this.run(uv, ['pip', 'install', '--python', this.py, 'transformers==4.57.6']);
      }
      fs.writeFileSync(path.join(this.dir, 'installed.json'), JSON.stringify({ at: Date.now(), gpu: !!gpu }));
      this.set('stopped', 'Đã cài xong VieNeu-TTS');
    } catch (e) { this.set('error', 'Cài VieNeu lỗi: ' + e.message); }
    finally { this.busy = false; }
    return this.status;
  }
  async start({ port = 8000, lan = false, precision = 'fp32', gpu = 'auto' } = {}) {
    if (this.proc) return this.status;
    const url = `http://127.0.0.1:${port}`;
    try { const h = await health(url); if (this.status.state !== 'ready') this.set('ready', `VieNeu sẵn sàng (${h.backend || 'cpu'})`); return this.status; } catch { }
    if (!this.installed()) { this.set('notInstalled', 'Chưa cài VieNeu-TTS – bấm "Cài VieNeu"'); return this.status; }
    this.set('starting', 'Đang bật VieNeu (lần đầu tải model ~1 GB, có thể mất vài phút)…');
    const env = { ...process.env, PYTHONIOENCODING: 'utf-8', HOST: lan ? '0.0.0.0' : '127.0.0.1', PORT: String(port), VIENEU_PRECISION: precision,
      VIENEU_DEVICE: gpu === 'cpu' ? 'cpu' : 'auto', VIENEU_BACKEND: gpu === 'cpu' ? 'onnx' : 'auto' };
    const p = this.proc = spawn(this.py, ['-m', 'apps.openai_speech'], { cwd: this.dir, env, windowsHide: true });
    let tail = '';
    const on = (d) => { const s = d.toString(); tail = (tail + s).slice(-3000); if (/✅ ready|error|Error|Downloading|⏳/i.test(s)) this.log(s); };
    p.stdout.on('data', on); p.stderr.on('data', on);
    p.on('error', (e) => { this.proc = null; this.set('error', 'Không chạy được VieNeu: ' + e.message); });
    p.on('exit', (code) => { if (this.proc === p) { this.proc = null; if (this.status.state !== 'stopped') this.set('error', `Máy chủ VieNeu đã tắt (mã ${code}). ${tail.split(/\r?\n/).filter(Boolean).slice(-2).join(' ')}`.slice(0, 400)); } });
    // chờ tải model + khởi động (tối đa 20 phút cho lần đầu)
    const t0 = Date.now();
    while (this.proc === p && Date.now() - t0 < 20 * 60000) {
      await new Promise(r => setTimeout(r, 2000));
      try { const h = await health(url); this.set('ready', `VieNeu sẵn sàng (${h.backend || 'cpu'})`); return this.status; } catch { }
    }
    return this.status;
  }
  stop() {
    if (!this.proc) return;
    const p = this.proc; this.proc = null; this.set('stopped', 'Đã tắt máy chủ VieNeu');
    try { if (process.platform === 'win32') execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], () => { }); else p.kill(); } catch { }
  }
}

module.exports = { synth, voices, addVoice, health, wavFromPcm, VieNeuServer, trimUrl };
