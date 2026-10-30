// Dùng chung cho bản máy tính (Electron) và bản Android (Node trên điện thoại)
function deepMerge(a, b) {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
  const out = Array.isArray(a) || typeof a !== 'object' || a === null ? {} : { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? deepMerge(out[k], v) : v;
  return out;
}

// gộp cấu hình đã lưu với mặc định + nâng cấp cấu hình cũ
function migrateConfig(DEFAULTS, saved) {
  saved = saved || {};
  const cfg = deepMerge(DEFAULTS, saved);
  cfg.fonts = [...DEFAULTS.fonts, ...(cfg.fonts || []).filter(f => !f.builtin)];
  // mỗi mức đủ trường (bản mới thêm trường)
  const tierBase = DEFAULTS.tiers[0];
  cfg.tiers = (cfg.tiers || DEFAULTS.tiers).map(t => ({ ...tierBase, voiceFiles: [], ...t }));
  // repo cập nhật đã đổi tên
  if (!cfg.update.repo || /^pen-writer-updates$/i.test(cfg.update.repo)) cfg.update.repo = DEFAULTS.update.repo;
  // v3 (bản 1.4.3): tên người xem mặc định mỗi người một dòng, căn giữa
  if ((saved.configVersion || 1) < 3 && cfg.viewers) cfg.viewers.align = 'line';
  // v4 (bản 1.5.0): avatar + khung hoa văn tăng dần theo mức (mức thấp -> cấp 1, cao dần tới cấp 7)
  if ((saved.configVersion || 1) < 4) {
    const order = cfg.tiers.slice().sort((a, b) => (a.min || 0) - (b.min || 0));
    // khung avatar cấp 7 đã có vương miện -> khung tên đổi 'royal' thành 'frame' để không lặp
    cfg.tiers.forEach(t => { if (t.ornament === 'royal') t.ornament = 'frame'; });
    order.forEach((t, i) => { if (!saved.tiers || !(saved.tiers.find(x => x.id === t.id) || {}).avatarFrame) { t.avatarFrame = Math.min(7, i + 1); t.avatarCm = +(2.8 + Math.min(6, i) * 0.37).toFixed(1); } });
  }
  // v5 (bản 1.8.0): giọng đọc mặc định chuyển từ Google sang giọng neural Edge (tự nhiên hơn)
  if ((saved.configVersion || 1) < 5 && cfg.voice && cfg.voice.engine === 'google') cfg.voice.engine = 'edge';
  cfg.configVersion = DEFAULTS.configVersion;
  return cfg;
}

const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
// kiểu file ảnh theo vài byte đầu
const imgExt = (buf) => buf.slice(8, 12).toString() === 'WEBP' ? '.webp' : buf[0] === 0x89 ? '.png' : buf.slice(0, 3).toString() === 'GIF' ? '.gif' : '.jpg';

module.exports = { deepMerge, migrateConfig, uid, imgExt };
