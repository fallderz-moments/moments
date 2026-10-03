// Fallderz Moments — 前台與後台共用的工具函式

export const START_DATE = '2021-12-01';
export const DATA_PATH = 'data/moments.json';
export const TIME_ZONE = 'Asia/Taipei';
export const NOTE_TINTS = ['mint', 'blush', 'coral', 'sand', 'ivory', 'teal'];

/** 預設分類標籤（依顯示順序） */
export const PRESET_TAGS = ['YouTube', 'Berriz', 'Universe', '花絮', '綜藝', 'Bubble', 'Instagram', 'FanClub', 'LIVE', 'FanSign'];

/** 生日（MM-DD） */
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
