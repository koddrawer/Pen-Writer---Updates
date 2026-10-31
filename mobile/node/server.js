// Máy chủ file nội bộ (127.0.0.1): WebView đọc nhạc, voice, font, avatar, giọng đọc qua đây; tải file người dùng chọn lên.
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.opus': 'audio/ogg',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.json': 'application/json' };

function startServer({ roots, uploadDir, port = 37651 }) {
  const allowed = (p) => roots.some(r => path.resolve(p).startsWith(path.resolve(r)));
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-expose-headers': 'content-range,content-length,accept-ranges' };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (u.pathname === '/f') {
      const p = u.searchParams.get('p') || '';
      if (!allowed(p)) { res.writeHead(403, cors); return res.end(); }
      let st; try { st = fs.statSync(p); } catch { res.writeHead(404, cors); return res.end(); }
      const type = MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range); const s = m[1] ? +m[1] : 0; const e = Math.min(m[2] ? +m[2] : st.size - 1, st.size - 1);
        res.writeHead(206, { ...cors, 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${s}-${e}/${st.size}`, 'content-length': e - s + 1 });
        return fs.createReadStream(p, { start: s, end: e }).pipe(res);
      }
      res.writeHead(200, { ...cors, 'content-type': type, 'accept-ranges': 'bytes', 'content-length': st.size });
      return fs.createReadStream(p).pipe(res);
    }
    if (u.pathname === '/upload' && req.method === 'POST') {
      // lưu file người dùng chọn (nhạc, voice, font, ảnh) vào thư mục dữ liệu của app
      const kind = (u.searchParams.get('kind') || 'files').replace(/[^\w-]/g, '');
      const name = (u.searchParams.get('name') || 'file').replace(/[^\p{L}\p{N}._\- ]+/gu, '_').slice(-120);
      const dir = path.join(uploadDir, kind); fs.mkdirSync(dir, { recursive: true });
      let dst = path.join(dir, name); let i = 1;
      while (fs.existsSync(dst)) dst = path.join(dir, `${path.parse(name).name}_${i++}${path.extname(name)}`);
      const ws = fs.createWriteStream(dst);
      req.pipe(ws);
      ws.on('finish', () => { res.writeHead(200, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify({ path: dst, name: path.parse(name).name })); });
      ws.on('error', (e) => { res.writeHead(500, cors); res.end(String(e)); });
      return;
    }
    res.writeHead(404, cors); res.end();
  });
  return new Promise((resolve) => {
    const tryListen = (p, n) => {
      srv.once('error', () => { if (n > 0) tryListen(p + 1, n - 1); });
      srv.listen(p, '127.0.0.1', () => resolve({ srv, port: p }));
    };
    tryListen(port, 20);
  });
}
module.exports = { startServer };
