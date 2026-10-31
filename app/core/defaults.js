// Cấu hình mặc định (được gộp với config.json của người dùng)
const builtinFont = (id, name, fam, w, subs = ['latin', 'latin-ext', 'vietnamese']) => ({
  id, name, builtin: true, files: subs.map(s => `${fam}-${s}-${w}-normal.woff`),
});
const NO_VN = ['latin', 'latin-ext'];
const oneFile = (id, name, file) => ({ id, name, builtin: true, files: [file] });

// Mức donate: mỗi mức một cỡ chữ + hoa văn riêng (mức thấp nhất không có hoa văn)
const tier = (id, name, min, sizeCm, ornament, sec, extra = {}) => ({
  id, name, min, enabled: true, sizeCm, ornament, sec,
  fontId: '',               // trống = dùng font chung
  text: '{name}',           // nội dung dòng chính (nhiều dòng = chọn ngẫu nhiên)
  sub: '',                  // dòng nhỏ bên dưới (tuỳ chọn), vd: {gift} x{count}
  subSizePct: 42,
  color: '', ornColor: '',  // trống = màu mực chung
  voiceFiles: [], ttsText: '',
  avatarCm: 3, avatarFrame: 1,   // ảnh đại diện vẽ phía trên tên + cấp khung hoa văn (0–7)
  ...extra,
});

module.exports = {
  configVersion: 5,
  tiktok: { username: '', signApiKey: '', autoConnect: false, autoReconnect: true },
  fonts: [
    builtinFont('great-vibes', 'Great Vibes (chữ ký)', 'great-vibes', 400),
    builtinFont('pinyon', 'Pinyon Script (thư pháp)', 'pinyon-script', 400),
    builtinFont('dancing', 'Dancing Script (viết tay)', 'dancing-script', 700),
    builtinFont('playfair', 'Playfair Display (cổ điển)', 'playfair-display', 700),
    builtinFont('rye', 'Rye (miền Tây cổ)', 'rye', 400, NO_VN),
    builtinFont('abril', 'Abril Fatface (tiêu đề)', 'abril-fatface', 400, NO_VN),
    builtinFont('cinzel', 'Cinzel Decorative (khắc)', 'cinzel-decorative', 700, NO_VN),
    oneFile('ma-shan-zheng', 'Ma Shan Zheng (thư pháp Trung)', 'ma-shan-zheng-cjk.woff'),
    oneFile('yuji-syuku', 'Yuji Syuku (bút lông Nhật)', 'yuji-syuku-cjk.woff'),
    oneFile('nanum-brush', 'Nanum Brush Script (bút lông Hàn)', 'nanum-brush-script-ko.woff'),
    oneFile('marhey', 'Marhey (viết tay Ả Rập)', 'marhey-arabic.woff'),
    oneFile('marck-script', 'Marck Script (viết tay Nga)', 'marck-script-cyrillic.woff'),
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
    tier('t1', 'Mức 1 xu', 1, 1.1, 'none', 4, { avatarCm: 2.8, avatarFrame: 1 }),
    tier('t2', 'Mức 2', 5, 1.4, 'underline', 5, { avatarCm: 3.1, avatarFrame: 2 }),
    tier('t3', 'Mức 3', 10, 1.7, 'swash', 6, { avatarCm: 3.4, avatarFrame: 3 }),
    tier('t4', 'Mức 4', 30, 2.0, 'vines', 7, { sub: '{gift} x{count}', avatarCm: 3.7, avatarFrame: 4 }),
    tier('t5', 'Mức 5', 99, 2.4, 'laurel', 8, { sub: '{gift} x{count}', ornColor: '#7a5a1c', avatarCm: 4.1, avatarFrame: 5 }),
    tier('t6', 'Mức 6', 299, 2.8, 'frame', 10, { sub: 'Cảm ơn bạn đã tặng {gift} x{count}', ornColor: '#7a5a1c', avatarCm: 4.5, avatarFrame: 6 }),
    tier('t7', 'Mức 7', 999, 3.3, 'frame', 12, { sub: 'Cảm ơn bạn đã tặng {gift} x{count}', ornColor: '#8a6418', avatarCm: 5, avatarFrame: 7 }),
  ],
  sheet: {
    marginTopCm: 2.4, marginBottomCm: 2.2, marginSideCm: 1.5, lineGapCm: 0.5,
    swapSec: 2.2, tint: '#f4ede0', grain: 1, pxPerM: 4200,
  },
  // ảnh đại diện: bút vẽ lại avatar TikTok kiểu ký hoạ đan nét, tên viết ngay bên dưới
  avatars: { enabled: true, style: 'print', printSec: 0.5, donors: true, viewers: true, viewerCm: 2.3, viewerFrame: 0, detail: 1.15, color: '', donorSec: 5, viewerSec: 3 },
  glow: { enabled: true, sec: 2.4, color: '#ffc94a', strength: 1.2, types: { donor: true, name: false, quote: false } },
  // tên người xem: viết nối tiếp trên cùng một dòng, hết dòng thì xuống dòng
  viewers: {
    enabled: true, sources: { join: true, chat: false, like: false, follow: false, share: false },
    sizeCm: 0.8, fontId: '', color: '', gapCm: 0.7, separator: 'dot', align: 'line',   // dot | dash | none ; line = mỗi người 1 dòng căn giữa | center | left
    display: 'nickname', maxChars: 18, dedupeMin: 30, maxQueue: 40, sec: 3,
  },
  // câu quote khi rảnh (không ai tặng quà / vào phòng)
  quotes: {
    enabled: true, afterSec: 20, afterJobSec: 6, gapSec: 15, random: true,
    // ngôn ngữ được viết (xen kẽ, không lặp lại ngôn ngữ vừa viết)
    langs: { vi: true, en: true, zh: true, ja: true, ko: true, ar: true, ru: true },
    langFonts: { zh: 'ma-shan-zheng', ja: 'yuji-syuku', ko: 'nanum-brush', ar: 'marhey', ru: 'marck-script' },
    showMeaning: true, meaningSizePct: 62,    // viết nghĩa tiếng Việt bên dưới câu tiếng nước ngoài
    fontId: 'dancing', sizeCm: 1.1, authorSizePct: 60, color: '', widthPct: 66, divider: true, sec: 12,
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
    // mỗi dòng: câu gốc || nghĩa tiếng Việt — nguồn
    listZh: [
      '千里之行，始于足下 || Hành trình ngàn dặm bắt đầu từ một bước chân — Lão Tử',
      '有志者事竟成 || Có chí thì nên — Tục ngữ Trung Hoa',
      '滴水穿石 || Nước chảy đá mòn — Thành ngữ Trung Hoa',
      '饮水思源 || Uống nước nhớ nguồn — Thành ngữ Trung Hoa',
      '三人行，必有我师 || Ba người cùng đi, ắt có người là thầy ta — Khổng Tử',
      '己所不欲，勿施于人 || Điều mình không muốn, chớ làm cho người khác — Khổng Tử',
      '学而不思则罔，思而不学则殆 || Học mà không nghĩ thì mờ mịt, nghĩ mà không học thì nguy — Khổng Tử',
      '一寸光阴一寸金 || Một tấc thời gian là một tấc vàng — Tục ngữ Trung Hoa',
      '失败是成功之母 || Thất bại là mẹ thành công — Tục ngữ Trung Hoa',
      '知足常乐 || Biết đủ thì luôn vui — Thành ngữ Trung Hoa',
      '海内存知己，天涯若比邻 || Bốn biển có tri kỷ, chân trời cũng như láng giềng — Vương Bột',
    ],
    listJa: [
      '七転び八起き || Ngã bảy lần, đứng dậy tám lần — Tục ngữ Nhật Bản',
      '継続は力なり || Kiên trì chính là sức mạnh — Tục ngữ Nhật Bản',
      '一期一会 || Mỗi cuộc gặp gỡ chỉ có một lần trong đời — Thành ngữ Nhật Bản',
      '石の上にも三年 || Ngồi trên đá ba năm đá cũng ấm, kiên nhẫn ắt thành — Tục ngữ Nhật Bản',
      '塵も積もれば山となる || Bụi tích lại cũng thành núi — Tục ngữ Nhật Bản',
      '笑う門には福来る || Nhà có tiếng cười, phúc tự tìm đến — Tục ngữ Nhật Bản',
      '雨降って地固まる || Sau cơn mưa, đất càng thêm vững — Tục ngữ Nhật Bản',
      '急がば回れ || Muốn nhanh thì hãy đi đường vòng, chậm mà chắc — Tục ngữ Nhật Bản',
      '猿も木から落ちる || Khỉ cũng có lúc ngã từ trên cây — Tục ngữ Nhật Bản',
    ],
    listKo: [
      '시작이 반이다 || Bắt đầu là đã xong một nửa — Tục ngữ Hàn Quốc',
      '천 리 길도 한 걸음부터 || Đường ngàn dặm cũng bắt đầu từ một bước chân — Tục ngữ Hàn Quốc',
      '티끌 모아 태산 || Gom từng hạt bụi thành núi Thái Sơn — Tục ngữ Hàn Quốc',
      '가는 말이 고와야 오는 말이 곱다 || Lời nói đi có đẹp thì lời nói lại mới hay — Tục ngữ Hàn Quốc',
      '백지장도 맞들면 낫다 || Tờ giấy mỏng cũng nên cùng nhau nâng, đồng lòng thì dễ — Tục ngữ Hàn Quốc',
      '고생 끝에 낙이 온다 || Hết khổ rồi sẽ đến lúc sướng — Tục ngữ Hàn Quốc',
      '웃으면 복이 와요 || Cười lên thì phúc sẽ đến — Tục ngữ Hàn Quốc',
      '낮말은 새가 듣고 밤말은 쥐가 듣는다 || Lời ngày chim nghe, lời đêm chuột nghe – tai vách mạch rừng — Tục ngữ Hàn Quốc',
    ],
    listAr: [
      'الصبر مفتاح الفرج || Kiên nhẫn là chìa khóa của niềm vui — Tục ngữ Ả Rập',
      'من جد وجد || Ai nỗ lực thì sẽ đạt được — Tục ngữ Ả Rập',
      'العلم نور || Tri thức là ánh sáng — Tục ngữ Ả Rập',
      'الصديق وقت الضيق || Bạn thật là người ở bên lúc khó khăn — Tục ngữ Ả Rập',
      'خير الكلام ما قل ودل || Lời hay nhất là lời ngắn gọn mà đủ ý — Tục ngữ Ả Rập',
      'في التأني السلامة وفي العجلة الندامة || Thong thả thì an toàn, vội vàng thì hối hận — Tục ngữ Ả Rập',
    ],
    listRu: [
      'Тише едешь, дальше будешь || Đi chậm thì đi được xa — Tục ngữ Nga',
      'Без труда не выловишь и рыбку из пруда || Không chịu khó thì chẳng bắt nổi con cá dưới ao — Tục ngữ Nga',
      'Не имей сто рублей, а имей сто друзей || Đừng có trăm rúp, hãy có trăm người bạn — Tục ngữ Nga',
      'Терпение и труд всё перетрут || Kiên nhẫn và chăm chỉ thì việc gì cũng xong — Tục ngữ Nga',
      'Век живи, век учись || Sống đến đâu học đến đó — Tục ngữ Nga',
      'Друг познаётся в беде || Hoạn nạn mới biết bạn hiền — Tục ngữ Nga',
      'Утро вечера мудренее || Buổi sáng sáng suốt hơn buổi tối, để mai tính — Tục ngữ Nga',
      'Делу время, потехе час || Làm việc cho ra việc, chơi có giờ có giấc — Tục ngữ Nga',
    ],
  },
  voice: {
    enabled: true,
    mode: 'tts',            // tts = đọc câu cảm ơn | files = phát file ghi âm của mức | both = file rồi đọc tên
    when: 'start',          // start = lúc bắt đầu viết | end = viết xong
    engine: 'edge',         // edge (giọng neural Microsoft, tự nhiên nhất, cần mạng) | google (cần mạng) | system (giọng máy)
    edgeVoice: 'vi-VN-HoaiMyNeural', pitch: 0,
    lang: 'vi', systemVoice: '', rate: 1, volume: 1,
    text: 'Cảm ơn {name} đã tặng {gift}',
    minDiamonds: 1,
    // lời chào người vào phòng live (đọc bằng cùng giọng; nhường cảm ơn donate đọc trước)
    greet: {
      enabled: true,
      texts: 'Chào mừng {name} đã đến với phiên live | Xin chào {name}, chúc bạn xem live vui vẻ | {name} ơi, chào mừng bạn nhé',
      dedupeMin: 30,          // 1 người chỉ được chào lại sau ngần này phút
      gapSec: 4,              // nghỉ giữa 2 lời chào
      maxWait: 3,             // tối đa số người chờ chào (phòng đông thì bỏ bớt, chỉ chào người mới vào gần nhất)
    },
  },
  music: { enabled: true, files: [], shuffle: true, volume: 0.35, crossfadeSec: 3, duck: true, duckPct: 30, duckCats: ['voice'] },
  display: {
    width: 540, height: 960, rotate: 0, frameless: false, alwaysOnTop: false, renderScale: 1,
    shadows: true, bloom: 0.35, exposure: 1.0, sun: 1, ambient: 1, lamp: true, vignette: 0.45,
    gpuBoost: true,         // chạy kèm --ignore-gpu-blocklist --enable-gpu-rasterization (dùng GPU thay CPU)
    mouseCamera: true, followPen: 0, cameras: {}, dragWindow: false,
    penPark: { u: 0.1, v: 0.9, h: 0.04 },
    dust: { enabled: true, count: 320, size: 1, brightness: 1, speed: 1 },
  },
  update: { owner: 'koddrawer', repo: 'Pen-Writer---Updates', branch: 'main', autoCheck: true, intervalMin: 30 },
  windows: {},
};
