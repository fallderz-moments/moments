// Fallderz Moments — 前台與後台共用的工具函式

export const START_DATE = '2021-12-01';
export const DATA_PATH = 'data/moments.json';
export const TIME_ZONE = 'Asia/Taipei';
export const NOTE_TINTS = ['mint', 'blush', 'coral', 'sand', 'ivory', 'teal'];

/** 預設分類標籤（依顯示順序） */
export const PRESET_TAGS = ['YouTube', 'Berriz', 'Universe', '花絮', '綜藝', 'Bubble', 'Instagram', 'X(twitter)', 'FanClub', 'LIVE', 'FanSign', '其他'];

/**
 * 貼圖庫：依季節輪替，圖片放在 assets/stickers/<季節>/
 *   dog-1.webp、dog-2.webp …（狗狗）、chipmunk-1.webp …（鼠鼠）、pair-1.webp …（狗鼠一起，用在頁尾）
 * 數量為 0 代表圖還沒放進來，畫面上對應的位置就不顯示貼圖。
 */
export const SEASONS = [
  { name: 'spring', label: '春', from: '03-01', to: '05-31', dog: 0, chipmunk: 0, pair: 0 },
  { name: 'summer', label: '夏', from: '06-01', to: '08-31', dog: 0, chipmunk: 0, pair: 0 },
  { name: 'autumn', label: '秋', from: '09-01', to: '11-30', dog: 32, chipmunk: 32, pair: 16 },
  { name: 'winter', label: '冬', from: '12-01', to: '02-29', dog: 32, chipmunk: 32, pair: 16 },
];

/**
 * 生日主題（assets/stickers/birthday/）：不分季節，9/1、9/24 的紀錄一律使用壽星的生日貼圖；
 * 生日當天全站貼圖也換成壽星的生日款，頁尾換成生日版「狗鼠一起」。
 */
export const BIRTHDAY_STICKERS = { dog: 32, chipmunk: 32, pair: 16 };

/** 指定日期（預設今天）所屬的季節；跨年的期間（12-01 到 02-29）也能判斷 */
export function seasonOf(date = todayStr()) {
  const md = date.slice(5);
  return SEASONS.find((t) => (t.from <= t.to ? md >= t.from && md <= t.to : md >= t.from || md <= t.to)) || null;
}

/** 每次載入頁面換一個種子：重新整理就會換一批貼圖，同一次瀏覽中則保持不變 */
const PAGE_SEED = Math.floor(Math.random() * 1e9);

function mix(seed, salt) {
  let h = hashString(`${seed}:${salt}`) ^ PAGE_SEED;  // 再打散一次，避免相近的 id 拿到相鄰編號
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 生日對應的動物：9/1 安俞真（狗狗）、9/24 金秋天（鼠鼠），其他日子回傳 null */
export function birthdayKind(date = '') {
  const md = date.slice(5);
  return md === '09-01' ? 'dog' : md === '09-24' ? 'chipmunk' : null;
}

/**
 * 依種子挑一張貼圖網址；圖庫沒有圖時回傳空字串（呼叫端就不顯示）。
 * date 是紀錄日期：生日紀錄（或今天是生日）只用壽星的貼圖，優先用生日主題。
 */
export function sticker(seed, salt = 0, date = '') {
  const h = mix(seed, salt);
  const season = seasonOf();
  const kind = birthdayKind(date) || birthdayKind(todayStr());
  if (kind) {
    if (BIRTHDAY_STICKERS[kind]) return `assets/stickers/birthday/${kind}-${(h % BIRTHDAY_STICKERS[kind]) + 1}.webp`;
    return season?.[kind] ? `assets/stickers/${season.name}/${kind}-${(h % season[kind]) + 1}.webp` : '';
  }
  const total = (season?.dog || 0) + (season?.chipmunk || 0);
  if (!total) return '';
  const n = h % total;
  return n < season.dog
    ? `assets/stickers/${season.name}/dog-${n + 1}.webp`
    : `assets/stickers/${season.name}/chipmunk-${n - season.dog + 1}.webp`;
}

/** 頁尾「狗鼠一起」貼圖（生日當天用生日版）；沒有圖時回傳空字串 */
export function pairSticker() {
  if (birthdayKind(todayStr()) && BIRTHDAY_STICKERS.pair) {
    return `assets/stickers/birthday/pair-${(mix('pair', 0) % BIRTHDAY_STICKERS.pair) + 1}.webp`;
  }
  const season = seasonOf();
  return season?.pair ? `assets/stickers/${season.name}/pair-${(mix('pair', 0) % season.pair) + 1}.webp` : '';
}

/** 頁尾：有「狗鼠一起」圖就顯示它，沒有就保留原本的小愛心 */
export function randomizeStickers(root = document) {
  const pair = pairSticker();
  root.querySelectorAll('[data-pair-sticker]').forEach((img) => {
    if (pair) img.src = pair;
    img.hidden = !pair;
  });
  root.querySelectorAll('[data-pair-fallback]').forEach((el) => { el.hidden = !!pair; });
}

/** 生日（MM-DD）：9/1 安俞真（狗狗）、9/24 金秋天（鼠鼠） */
export const BIRTHDAYS = ['09-01', '09-24'];

const pad = (n) => String(n).padStart(2, '0');
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 今天的日期（台北時間，YYYY-MM-DD），換日後自動變成新的一天 */
export function todayStr() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

/** 距離台北時間下一個午夜還有幾毫秒 */
export function msUntilTomorrow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t) => Number(parts.find((p) => p.type === t).value);
  const elapsed = (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000;
  return 86400000 - elapsed + 1000;
}

/** 每到午夜執行 fn（並在分頁重新顯示時檢查是否已換日） */
export function onNewDay(fn) {
  let last = todayStr();
  const check = () => {
    const now = todayStr();
    if (now !== last) { last = now; fn(now); }
  };
  const schedule = () => setTimeout(() => { check(); schedule(); }, msUntilTomorrow());
  schedule();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return { y, m, d, weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()] };
}

export function formatDate(str) {
  const { y, m, d } = parseDate(str);
  return `${y}.${pad(m)}.${pad(d)}`;
}

export const isBirthday = (date = '') => BIRTHDAYS.includes(date.slice(5));

export function monthKey(str) {
  return str.slice(0, 7);
}

/** 從 2021-12 到本月的所有 YYYY-MM */
export function monthRange() {
  const out = [];
  const [sy, sm] = START_DATE.split('-').map(Number);
  const [ny, nm] = todayStr().split('-').map(Number);
  let y = sy, m = sm;
  while (y < ny || (y === ny && m <= nm)) {
    out.push(`${y}-${pad(m)}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 跳脫後把網址變成連結、換行變成 <br> */
export function richText(text = '') {
  return escapeHtml(text)
    .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`)
    .replace(/\n/g, '<br>');
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function sortMoments(list, dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) =>
    sign * (a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '')));
}

/** 預設標籤排前面，其餘依名稱排序 */
export function sortTags(tags) {
  return [...tags].sort((a, b) => {
    const ia = PRESET_TAGS.indexOf(a), ib = PRESET_TAGS.indexOf(b);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.localeCompare(b, 'zh-Hant');
  });
}

export const MEDIA_LABELS = {
  image: '照片',
  video: '影片',
  drive: 'Google 雲端硬碟',
  youtube: 'YouTube',
  x: 'X',
  instagram: 'Instagram',
  link: '連結',
};

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv)(\?.*)?$/i;

export function driveId(url) {
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|drive\/(?:u\/\d+\/)?folders\/|open\?(?:[^#]*&)?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,})/) ||
            url.match(/docs\.google\.com\/(?:uc|file\/d)[/?](?:[^#]*id=)?([\w-]{10,})/);
  return m ? m[1] : null;
}

/** 把使用者貼上的網址辨識成媒體物件 */
export function parseMediaUrl(raw) {
  const url = raw.trim();
  let m;
  const id = driveId(url);
  if (id) return { type: 'drive', id, kind: 'image', src: url };
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/))) {
    return { type: 'youtube', id: m[1], src: url };
  }
  if ((m = url.match(/(?:twitter|x)\.com\/[^/]+\/status(?:es)?\/(\d+)/))) {
    return { type: 'x', id: m[1], src: url };
  }
  if ((m = url.match(/instagram\.com\/(?:[^/]+\/)?(p|reel|tv)\/([\w-]+)/))) {
    return { type: 'instagram', id: `${m[1]}/${m[2]}`, src: url };
  }
  if (IMAGE_EXT.test(url)) return { type: 'image', src: url };
  if (VIDEO_EXT.test(url)) return { type: 'video', src: url };
  return { type: 'link', src: url };
}

export function isVideoPath(path) {
  return VIDEO_EXT.test(path);
}

export const driveImage = (id, width = 2000) => `https://drive.google.com/thumbnail?id=${id}&sz=w${width}`;
export const driveImageFallback = (id, width = 2000) => `https://lh3.googleusercontent.com/d/${id}=w${width}`;

/** 媒體的縮圖網址（沒有就回傳 null） */
export function mediaThumb(item) {
  if (!item) return null;
  if (item.thumb) return item.thumb;
  switch (item.type) {
    case 'image': return item.src;
    case 'drive': return driveImage(item.id, 800);
    case 'youtube': return `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;
    default: return null;
  }
}

/** 片段的代表縮圖：優先使用指定封面，其次第一個有縮圖的媒體 */
export function momentCover(moment) {
  const media = moment.media || [];
  const preferred = media[moment.cover || 0];
  const thumb = mediaThumb(preferred);
  if (thumb) return { url: thumb, item: preferred };
  for (const item of media) {
    const t = mediaThumb(item);
    if (t) return { url: t, item };
  }
  return { url: null, item: media[0] || null };
}

/** 計算照片與影片數量 */
export function mediaCounts(media = []) {
  let photos = 0, videos = 0, others = 0;
  for (const m of media) {
    if (m.type === 'image' || (m.type === 'drive' && m.kind !== 'video')) photos++;
    else if (m.type === 'video' || m.type === 'youtube' || (m.type === 'drive' && m.kind === 'video')) videos++;
    else others++;
  }
  return { photos, videos, others };
}

export async function fetchMoments() {
  const res = await fetch(`${DATA_PATH}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`無法讀取資料（${res.status}）`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.moments || [];
}

/** 公告（後台「發布公告」寫入；前台進站時以浮動視窗顯示沒看過的公告） */
export const NOTICES_PATH = 'data/notices.json';

export const sortNotices = (list) => [...list]
  .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

export async function fetchNotices() {
  try {
    const res = await fetch(`${NOTICES_PATH}?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return sortNotices(Array.isArray(data) ? data : data.notices || []);
  } catch {
    return [];
  }
}

export function storageGet(key, fallback = null, store = 'localStorage') {
  try {
    const v = window[store].getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function storageSet(key, value, store = 'localStorage') {
  try { window[store].setItem(key, JSON.stringify(value)); } catch { /* 隱私模式等情況下忽略 */ }
}
