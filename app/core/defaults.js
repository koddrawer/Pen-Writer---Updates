// Cấu hình mặc định (được gộp với config.json của người dùng)
const builtinFont = (id, name, fam, w, subs = ['latin', 'latin-ext', 'vietnamese']) => ({
  id, name, builtin: true, files: subs.map(s => `${fam}-${s}-${w}-normal.woff`),
});
const NO_VN = ['latin', 'latin-ext'];

// Mức donate: mỗi mức một cỡ chữ + hoa văn riêng (mức thấp nhất không có hoa văn)
const tier = (id, name, min, sizeCm, ornament, sec, extra = {}) => ({
  id, name, min, enabled: true, sizeCm, ornament, sec,
  fontId: '',               // trống = dùng font chung
  text: '{name}',           // nội dung dòng chính (nhiều dòng = chọn ngẫu nhiên)
  sub: '',                  // dòng nhỏ bên dưới (tuỳ chọn), vd: {gift} x{count}
  subSizePct: 42,
  color: '', ornColor: '',  // trống = màu mực chung
  voiceFiles: [], ttsText: '',
  ...extra,
});

module.exports = {
  configVersion: 2,
  tiktok: { username: '', signApiKey: '', autoConnect: false, autoReconnect: true },
  fonts: [
    builtinFont('great-vibes', 'Great Vibes (chữ ký)', 'great-vibes', 400),
    builtinFont('pinyon', 'Pinyon Script (thư pháp)', 'pinyon-script', 400),
    builtinFont('dancing', 'Dancing Script (viết tay)', 'dancing-script', 700),
    builtinFont('playfair', 'Playfair Display (cổ điển)', 'playfair-display', 700),
    builtinFont('rye', 'Rye (miền Tây cổ)', 'rye', 400, NO_VN),
    builtinFont('abril', 'Abril Fatface (tiêu đề)', 'abril-fatface', 400, NO_VN),
    builtinFont('cinzel', 'Cinzel Decorative (khắc)', 'cinzel-decorative', 700, NO_VN),
  ],
  writer: {
    fontId: 'great-vibes', inkColor: '#16121c', display: 'nickname', maxChars: 24,
    nibMm: 0.85,             // độ dày nét chữ (mm) ở cỡ 1 cm, chữ to thì nét dày theo
    fill: 'hatch',          // hatch = tô kín nét chữ, outline = chỉ viền
    speed: 0.16,            // tốc độ ngòi (m/s) trước khi tự tăng để kịp thời gian
    align: 'center', jitter: true,
    minDiamonds: 1, mergeSec: 5, maxQueue: 60,
    gapAfterSec: 0.6,       // nghỉ giữa 2 người
  },
  tiers: [
    tier('t1', 'Mức 1 xu', 1, 1.1, 'none', 4),
    tier('t2', 'Mức 2', 5, 1.4, 'underline', 5),
    tier('t3', 'Mức 3', 10, 1.7, 'swash', 6),
    tier('t4', 'Mức 4', 30, 2.0, 'vines', 7, { sub: '{gift} x{count}' }),
    tier('t5', 'Mức 5', 99, 2.4, 'laurel', 8, { sub: '{gift} x{count}', ornColor: '#7a5a1c' }),
    tier('t6', 'Mức 6', 299, 2.8, 'frame', 10, { sub: 'Cảm ơn bạn đã tặng {gift} x{count}', ornColor: '#7a5a1c' }),
    tier('t7', 'Mức 7', 999, 3.3, 'royal', 12, { sub: 'Cảm ơn bạn đã tặng {gift} x{count}', ornColor: '#8a6418' }),
  ],
  sheet: {
    marginTopCm: 2.4, marginBottomCm: 2.2, marginSideCm: 1.5, lineGapCm: 0.5,
    swapSec: 2.2, tint: '#f4ede0', grain: 1, pxPerM: 4200,
  },
  glow: { enabled: true, sec: 2.4, color: '#ffc94a', strength: 1.2, types: { donor: true, name: false, quote: false } },
  // tên người xem: viết nối tiếp trên cùng một dòng, hết dòng thì xuống dòng
  viewers: {
    enabled: true, sources: { join: true, chat: false, like: false, follow: false, share: false },
    sizeCm: 0.8, fontId: '', color: '', gapCm: 0.7, separator: 'dot',   // dot | dash | none
    display: 'nickname', maxChars: 18, dedupeMin: 30, maxQueue: 40, sec: 3,
  },
  // câu quote khi rảnh (không ai tặng quà / vào phòng)
  quotes: {
    enabled: true, afterSec: 20, afterJobSec: 6, gapSec: 15, random: true, language: 'both',
    fontId: 'dancing', sizeCm: 1.1, authorSizePct: 60, color: '', widthPct: 74, divider: true, sec: 12,
    list: [
      'Có công mài sắt, có ngày nên kim — Tục ngữ',
      'Đi một ngày đàng, học một sàng khôn — Tục ngữ',
      'Uống nước nhớ nguồn — Tục ngữ',
      'Một cây làm chẳng nên non, ba cây chụm lại nên hòn núi cao — Ca dao',
      'Thất bại là mẹ thành công — Tục ngữ',
      'Lời nói chẳng mất tiền mua, lựa lời mà nói cho vừa lòng nhau — Ca dao',
      'Gần mực thì đen, gần đèn thì sáng — Tục ngữ',
      'Ăn quả nhớ kẻ trồng cây — Tục ngữ',
      'Nước chảy đá mòn — Tục ngữ',
      'Không có việc gì khó, chỉ sợ lòng không bền — Hồ Chí Minh',
      'Mỗi ngày là một trang giấy mới, hãy viết điều tốt đẹp lên đó',
      'Chậm mà chắc còn hơn nhanh mà sai',
      'Hạnh phúc không phải đích đến, mà là hành trình',
      'Nét chữ, nết người — Tục ngữ',
      'Cảm ơn bạn đã ghé thăm, chúc bạn một ngày thật vui',
    ],
    listEn: [
      'Well begun is half done — Aristotle',
      'The journey of a thousand miles begins with a single step — Lao Tzu',
      'The pen is mightier than the sword — Edward Bulwer-Lytton',
      'Simplicity is the ultimate sophistication — Leonardo da Vinci',
      'Fortune favors the bold — Virgil',
      'Do what you can, with what you have, where you are — Theodore Roosevelt',
      'Write it on your heart that every day is the best day in the year — Ralph Waldo Emerson',
      'Where there is a will, there is a way — Proverb',
      'Little by little, one travels far — Proverb',
      'Every cloud has a silver lining — Proverb',
      'Be the reason someone smiles today',
      'Thank you for stopping by. Have a wonderful day!',
    ],
  },
  voice: {
    enabled: true,
    mode: 'tts',            // tts = đọc câu cảm ơn | files = phát file ghi âm của mức | both = file rồi đọc tên
    when: 'start',          // start = lúc bắt đầu viết | end = viết xong
    engine: 'google',       // google (cần mạng) | system (giọng Windows)
    lang: 'vi', systemVoice: '', rate: 1, volume: 1,
    text: 'Cảm ơn {name} đã tặng {gift}',
    minDiamonds: 1,
  },
  music: { enabled: true, files: [], shuffle: true, volume: 0.35, crossfadeSec: 3, duck: true, duckPct: 30, duckCats: ['voice'] },
  display: {
    width: 540, height: 960, rotate: 0, frameless: false, alwaysOnTop: false, renderScale: 1,
    shadows: true, bloom: 0.35, exposure: 1.0, sun: 1, ambient: 1, lamp: true, vignette: 0.45,
    mouseCamera: true, followPen: 0, cameras: {}, dragWindow: false,
    penPark: { u: 0.1, v: 0.9, h: 0.04 },
  },
  update: { owner: 'koddrawer', repo: 'Pen-Writer---Updates', branch: 'main', autoCheck: true, intervalMin: 30 },
  windows: {},
};
