// Kết nối TikTok LIVE (tiktok-live-connector) + chuẩn hoá sự kiện, tự kết nối lại.
// tiktok-live-connector 2.x là ES Module: Electron 33 không require() được -> nạp bằng import() động
let libP = null;
function loadLib(req) {
  if (!libP) libP = (async () => {
    // Android (Node 18 của nodejs-mobile): nạp ES Module bằng import() làm văng app -> dùng bản đóng gói CommonJS (vendor/, tạo bằng esbuild)
    if (process.platform === 'android') {
      const p = require('path').join(__dirname, 'vendor', 'tiktok-live-connector.cjs');
      if (require('fs').existsSync(p)) return require(p);
    }
    try { return req('tiktok-live-connector'); } catch (e) { if (e.code !== 'ERR_REQUIRE_ESM' && !/ES Module/i.test(e.message)) throw e; }
    const { pathToFileURL } = require('url');
    const m = await import(pathToFileURL(req.resolve('tiktok-live-connector')).href);
    return m.TikTokLiveConnection ? m : (m.default || m);
  })().catch(e => { libP = null; throw e; });
  return libP;
}
// proxy cho kết nối TikTok (http://user:pass@ip:port). Lõi Node trên điện thoại không tự dùng proxy cài trong Android.
function proxyAgent(req, url) {
  url = String(url || '').trim(); if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
  const m = req('https-proxy-agent'); const A = m.HttpsProxyAgent || m.default || m;
  return new A(url);
}
class TikTok {
  constructor(req, getCfg, on) {
    this.req = req; this.cfg = getCfg; this.on = on;
    this.conn = null; this.manual = false; this.retry = 0; this.timer = null;
    this.status = { state: 'disconnected', message: 'Chưa kết nối', username: '', viewers: 0 };
  }
  set(s) { this.status = { ...this.status, ...s }; this.on.status(this.status); }
  user(d) {
    const u = d.user || d;
    // ảnh đại diện: schema v3 (avatarMedium/Thumb.urlList), bỏ định dạng .heic (Chromium không đọc được)
    const urls = [u.avatarMedium, u.avatarLarge, u.avatarThumb, u.profilePicture].flatMap(m => (m && (m.urlList || m.urls || (m.url ? [].concat(m.url) : []))) || []);
    const avatar = urls.find(x => x && !/\.heic/i.test(x)) || urls[0] || u.profilePictureUrl || '';
    return { uniqueId: u.uniqueId || u.displayId || '', nickname: u.nickname || u.nickName || '', avatar };
  }
  async connect(username) {
    username = String(username || this.cfg().tiktok.username || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@/, '').replace(/\/live.*$/, '');
    if (!username) { this.set({ state: 'error', message: 'Chưa nhập username TikTok' }); return false; }
    await this.disconnect(true);
    this.manual = false; this.username = username;
    let lib;
    this.on.log('sys', 'Đang nạp thư viện TikTok…');
    try { lib = await loadLib(this.req); } catch (e) { this.set({ state: 'error', message: 'Thiếu thư viện tiktok-live-connector: ' + e.message }); return false; }
    const { TikTokLiveConnection, WebcastEvent, ControlEvent } = lib;
    const key = this.cfg().tiktok.signApiKey;
    let agent = null;
    try { agent = proxyAgent(this.req, this.cfg().tiktok.proxy); } catch (e) { this.set({ state: 'error', message: 'Proxy không hợp lệ: ' + e.message }); return false; }
    // máy chủ ký Euler: thêm thời gian chờ (mặc định không có -> treo mãi "Đang kết nối") + proxy
    if (lib.SignConfig) {
      lib.SignConfig.baseOptions = { ...(lib.SignConfig.baseOptions || {}), timeout: 15000, ...(agent ? { httpsAgent: agent, proxy: false } : { httpsAgent: undefined }) };
      lib.SignConfig.cachedInstance = undefined;
    }
    const conn = new TikTokLiveConnection(username, { ...(key ? { signApiKey: key } : {}), enableExtendedGiftInfo: false, processInitialData: false,
      ...(agent ? { webClientOptions: { agent: { http: agent, https: agent } }, wsClientOptions: { agent } } : {}) });
    this.conn = conn;
    this.set({ state: 'connecting', message: `Đang kết nối @${username}…`, username });
    this.on.log('sys', `Bắt đầu kết nối @${username}${agent ? ' qua proxy' : ''}${key ? ' (có Euler key)' : ''}`);
    const E = WebcastEvent || {}; const C = ControlEvent || {};
    conn.on(E.MEMBER || 'member', d => { const u = this.user(d); this.on.log('join', `${u.nickname || u.uniqueId} vào phòng`); this.on.join(u); });
    conn.on(E.CHAT || 'chat', d => { const u = this.user(d); const t = d.content ?? d.comment ?? ''; this.on.log('chat', `${u.nickname || u.uniqueId}: ${t}`); this.on.chat(u, t); });
    conn.on(E.FOLLOW || 'follow', d => { const u = this.user(d); this.on.log('follow', `${u.nickname || u.uniqueId} theo dõi`); this.on.follow(u); });
    conn.on(E.SHARE || 'share', d => { const u = this.user(d); this.on.share(u); });
    conn.on(E.LIKE || 'like', d => { const u = this.user(d); this.on.like(u, d.count || d.likeCount || 1); });
    conn.on(E.ROOM_USER || 'roomUser', d => { const v = d.total ?? d.viewerCount; if (v != null) this.set({ viewers: +v || 0 }); });
    conn.on(E.GIFT || 'gift', d => this.onGift(d));
    conn.on(E.STREAM_END || 'streamEnd', () => { this.on.log('sys', 'Phiên live đã kết thúc'); this.set({ state: 'disconnected', message: 'Live đã kết thúc' }); this.schedule(30000); });
    conn.on(C.DISCONNECTED || 'disconnected', (info) => {
      if (this.conn !== conn) return;
      this.set({ state: 'disconnected', message: 'Mất kết nối' + (info && info.reason ? ': ' + info.reason : '') });
      if (!this.manual) this.schedule();
    });
    conn.on(C.ERROR || 'error', (e) => { this.on.log('err', 'TikTok: ' + (e && (e.message || e.info || JSON.stringify(e)).slice(0, 200))); });
    try {
      let to;
      const st = await Promise.race([conn.connect(), new Promise((_, rej) => { to = setTimeout(() => rej(new Error('TIMEOUT')), 35000); })]).finally(() => clearTimeout(to));
      this.on.log('sys', 'TikTok: đã vào phòng, đang nhận sự kiện');
      this.retry = 0;
      this.set({ state: 'connected', message: `Đã kết nối @${username}` + (st && st.roomId ? ` (room ${st.roomId})` : ''), roomId: st && st.roomId });
      this.on.log('sys', `Đã kết nối TikTok LIVE @${username}`);
      return true;
    } catch (e) {
      const msg = (e && e.message) || String(e);
      const why = msg === 'TIMEOUT' || /ETIMEDOUT|timeout of|Timeout awaiting|ECONNRESET|ECONNREFUSED|ENOTFOUND|socket hang up|EAI_AGAIN/i.test(msg)
          ? `Không vào được TikTok/máy chủ ký Euler (mạng hoặc proxy chặn/quá chậm${/ENOTFOUND|EAI_AGAIN/.test(msg) ? ', lỗi DNS' : ''}). Bấm "Kiểm tra mạng"; nếu điện thoại dùng proxy, nhập proxy vào ô Proxy.`
        : /offline|not.*live|UserOffline/i.test(msg) ? `@${username} đang không live`
        : /Business plan|PremiumFeature|requires a .* plan/i.test(msg) ? 'Máy chủ ký Euler từ chối (tính năng trả phí). Thử lại sau ít phút hoặc nhập Euler API key.'
        : /rate.?limit|429/i.test(msg) ? 'Máy chủ ký Euler đang giới hạn lượt (gói miễn phí). Chờ chút rồi thử lại hoặc nhập Euler API key.'
        : /Room ID/i.test(msg) ? `Không lấy được phòng live của @${username} – kiểm tra tài khoản đang LIVE và đúng username`
        : 'Lỗi: ' + msg.slice(0, 160);
      this.set({ state: 'error', message: why });
      this.on.log('err', 'Kết nối thất bại: ' + msg.slice(0, 200));
      try { conn.disconnect(); } catch { }
      if (!this.manual) this.schedule();
      return false;
    }
  }
  // Quà: thư viện 2.x (schema v3) để thông tin quà ở d.gift { name, diamondCount, type, combo }; bản cũ ở d.giftDetails
  onGift(d) {
    const gi = d.gift || {}, det = d.giftDetails || {}, ext = d.extendedGiftInfo || {};
    const name = gi.name || det.giftName || ext.name || d.giftName || ('Gift#' + (d.giftId || gi.id || ''));
    const diamonds = +(gi.diamondCount ?? det.diamondCount ?? ext.diamond_count ?? d.diamondCount ?? 0) || 0;
    const streak = gi.type === 1 || gi.combo === true || det.giftType === 1 || d.giftType === 1;
    const u = this.user(d);
    const count = +(d.repeatCount || d.comboCount || 1) || 1;
    const emit = (cnt) => {
      const g = { user: u, gift: name, count: cnt, diamonds };
      this.on.log('gift', `${u.nickname || u.uniqueId} tặng ${name} x${cnt} (${diamonds * cnt} xu)`);
      this.on.gift(g);
    };
    if (!streak) return emit(count);
    // quà combo (hoa hồng…): chờ kết thúc chuỗi rồi mới tính 1 lần; TikTok không gửi tín hiệu kết thúc thì tự chốt sau 3 giây
    this.streaks = this.streaks || new Map();
    const key = (u.uniqueId || u.nickname) + '|' + (d.giftId || gi.id || name) + '|' + (d.groupId || '');
    const cur = this.streaks.get(key) || { count: 0 };
    clearTimeout(cur.t);
    cur.count = Math.max(cur.count, count);
    if (d.repeatEnd) { this.streaks.delete(key); return emit(cur.count); }
    cur.t = setTimeout(() => { this.streaks.delete(key); emit(cur.count); }, 3000);
    this.streaks.set(key, cur);
  }
  schedule(ms) {
    if (!this.cfg().tiktok.autoReconnect || this.manual) return;
    clearTimeout(this.timer);
    const wait = ms || Math.min(60000, 5000 * Math.pow(1.6, this.retry++));
    this.set({ message: this.status.message + ` – thử lại sau ${Math.round(wait / 1000)}s` });
    this.timer = setTimeout(() => this.connect(this.username), wait);
  }
  async disconnect(internal) {
    if (!internal) { this.manual = true; clearTimeout(this.timer); }
    const c = this.conn; this.conn = null;
    if (c) { try { await c.disconnect(); } catch { } }
    if (!internal) this.set({ state: 'disconnected', message: 'Đã ngắt kết nối' });
  }
}
// kiểm tra mạng từ lõi Node (đúng đường đi của kết nối TikTok, có proxy nếu đã nhập)
async function netTest(req, proxy) {
  const https = require('https');
  let agent = null; try { agent = proxyAgent(req, proxy); } catch (e) { return [{ name: 'Proxy', ok: false, info: 'không hợp lệ: ' + e.message }]; }
  const get = (url) => new Promise((res) => {
    const t0 = Date.now();
    const r = https.get(url, { agent: agent || undefined, timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 13) Chrome/124 Mobile Safari/537.36' } }, (rs) => {
      let body = ''; rs.on('data', d => { if (body.length < 300) body += d; }); rs.on('end', () => res({ ok: rs.statusCode < 500 && rs.statusCode !== 407, ms: Date.now() - t0, status: rs.statusCode, body }));
    });
    r.on('timeout', () => { r.destroy(new Error('quá 10 giây không phản hồi')); });
    r.on('error', (e) => res({ ok: false, ms: Date.now() - t0, info: e.code || e.message }));
  });
  const tests = [['IP đang dùng', 'https://api.ipify.org/'], ['TikTok', 'https://www.tiktok.com/'], ['TikTok LIVE (webcast)', 'https://webcast.tiktok.com/webcast/setting/'], ['Máy chủ ký Euler', 'https://api.eulerstream.com/']];
  const out = [];
  for (const [name, url] of tests) {
    const r = await get(url);
    out.push({ name, ok: r.ok, ms: r.ms, info: r.info || (r.status === 407 ? 'proxy sai user/mật khẩu (HTTP 407)' : name === 'IP đang dùng' && r.ok ? String(r.body).trim().slice(0, 45) : 'HTTP ' + r.status) });
  }
  return out;
}
module.exports = { TikTok, netTest };
