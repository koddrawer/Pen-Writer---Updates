// Proxy cho mọi kết nối mạng của lõi Node (chủ yếu cho bản Android: Node trong app không tự dùng proxy cài trong Android).
// Áp cho: fetch (cập nhật app, giọng đọc, avatar) qua undici, và http/https (TikTok, Euler, WebSocket) qua https-proxy-agent.
const http = require('http');
const https = require('https');

let orig = null, current = '';
const isLocal = (h) => !h || h === 'localhost' || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || h === '::1';
function normalize(url) {
  url = String(url || '').trim();
  if (!url) return '';
  if (!/^[a-z0-9]+:\/\//i.test(url)) url = 'http://' + url;
  return url;
}
function applyProxy(req, url) {
  url = normalize(url);
  if (url === current) return { ok: true, url };
  if (!orig) orig = { http: http.globalAgent, https: https.globalAgent, disp: null };
  let fetchOk = false, agentOk = false, err = '';
  try {
    const u = req('undici');
    if (!orig.disp) orig.disp = u.getGlobalDispatcher();
    if (url) {
      // địa chỉ trong mạng nội bộ (máy chủ VieNeu trên PC, 127.0.0.1) đi thẳng, còn lại qua proxy
      const direct = new u.Agent(), proxy = new u.ProxyAgent(url);
      class Router extends u.Dispatcher {
        dispatch(o, h) { let host = ''; try { host = new URL(o.origin).hostname; } catch { } return (isLocal(host) ? direct : proxy).dispatch(o, h); }
        close(...a) { return Promise.all([direct.close(), proxy.close()]).then(() => a[0] && a[0]()); }
        destroy(...a) { return Promise.all([direct.destroy(), proxy.destroy()]).then(() => a.find(x => typeof x === 'function') && a.find(x => typeof x === 'function')()); }
      }
      u.setGlobalDispatcher(new Router());
    } else u.setGlobalDispatcher(orig.disp);
    fetchOk = true;
  } catch (e) { err = 'fetch: ' + e.message; }
  try {
    if (url) {
      const m = req('https-proxy-agent'); const A = m.HttpsProxyAgent || m.default || m;
      const agent = new A(url);
      https.globalAgent = agent;
    } else https.globalAgent = orig.https;
    agentOk = true;
  } catch (e) { err += (err ? '; ' : '') + 'http: ' + e.message; }
  current = url;
  return { ok: fetchOk && agentOk, fetchOk, agentOk, url, err };
}
module.exports = { applyProxy, normalize };
