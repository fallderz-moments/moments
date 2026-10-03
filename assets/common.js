// Fallderz moments — 前台與後台共用的工具函式

export const START_DATE = '2021-12-01';
export const DATA_PATH = 'data/moments.json';
export const NOTE_TINTS = ['mint', 'blush', 'coral', 'sand', 'ivory', 'teal'];

const pad = (n) => String(n).padStart(2, '0');
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return { y, m, d, weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()] };
}

export function formatDate(str) {
  const { y, m, d } = parseDate(str);
  return `${y}.${pad(m)}.${pad(d)}`;
}

export function monthKey(str) {
  return str.slice(0, 7);
}

/** 從 2021-12 到本月的所有 YYYY-MM */
export function monthRange() {
  const out = [];
  const [sy, sm] = START_DATE.split('-').map(Number);
  const now = new Date();
  let y = sy, m = sm;
  while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1)) {
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

/** 把使用者貼上的網址辨識成媒體物件 */
export function parseMediaUrl(raw) {
  const url = raw.trim();
  let m;
  if ((m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,})/)) ||
      (m = url.match(/docs\.google\.com\/(?:uc|file\/d)[/?](?:[^#]*id=)?([\w-]{10,})/))) {
    return { type: 'drive', id: m[1], kind: 'image', src: url };
  }
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

/** 媒體的縮圖網址（沒有就回傳 null） */
export function mediaThumb(item) {
  if (!item) return null;
  if (item.thumb) return item.thumb;
  switch (item.type) {
    case 'image': return item.src;
    case 'drive': return `https://drive.google.com/thumbnail?id=${item.id}&sz=w800`;
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

export async function fetchMoments() {
  const res = await fetch(`${DATA_PATH}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`無法讀取資料（${res.status}）`);
  const data = await res.json();
  return Array.isArray(data) ? data : data.moments || [];
}

export function storageGet(key, fallback = null) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 隱私模式等情況下忽略 */ }
}
