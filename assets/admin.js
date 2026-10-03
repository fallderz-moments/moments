import {
  START_DATE, DATA_PATH, todayStr, formatDate, escapeHtml, sortMoments, momentCover, mediaThumb,
  parseMediaUrl, isVideoPath, fetchMoments, storageGet, storageSet, MEDIA_LABELS,
} from './common.js';

const $ = (sel) => document.querySelector(sel);
const CFG_KEY = 'fm.github';
const MAX_UPLOAD = 95 * 1024 * 1024; // GitHub 單檔上限 100MB
const WARN_UPLOAD = 40 * 1024 * 1024;

const state = {
  cfg: storageGet(CFG_KEY, null) || guessConfig(),
  connected: false,
  moments: [],
  sha: null,
  draft: null,     // 編輯中的片段副本
  originalId: null,
  search: '',
  busy: false,
};

function guessConfig() {
  const host = location.hostname;
  const m = host.match(/^([\w-]+)\.github\.io$/i);
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return {
    owner: m ? m[1] : 'slam0615',
    repo: m ? (seg && !seg.endsWith('.html') ? seg : host) : 'moments',
    branch: 'main',
    token: '',
  };
}

/* ---------- 小工具 ---------- */
let toastTimer;
function toast(msg, isError = false, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function setBusy(busy, label) {
  state.busy = busy;
  $('#btn-save').disabled = busy;
  $('#btn-delete').disabled = busy;
  if (busy && label) toast(label, false, 0);
}

function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function b64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function blobToB64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const randId = () => Math.random().toString(36).slice(2, 8);
const isRepoMedia = (src = '') => src.startsWith('media/');

/* ---------- GitHub API ---------- */
async function gh(path, { method = 'GET', body, raw = false } = {}) {
  const { owner, repo, token } = state.cfg;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    method,
    headers: {
      Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) {
    const info = await res.json().catch(() => ({}));
    const err = new Error(info.message || res.statusText);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return raw ? res.text() : res.json();
}

const contentsPath = (p) => `/contents/${p.split('/').map(encodeURIComponent).join('/')}`;

async function readData() {
  const ref = `?ref=${encodeURIComponent(state.cfg.branch)}`;
  try {
    const meta = await gh(contentsPath(DATA_PATH) + ref);
    const text = meta.content && meta.encoding === 'base64'
      ? b64ToUtf8(meta.content)
      : await gh(contentsPath(DATA_PATH) + ref, { raw: true }); // 超過 1MB 時改用 raw 讀取
    const data = JSON.parse(text);
    return { moments: Array.isArray(data) ? data : data.moments || [], sha: meta.sha };
  } catch (err) {
    if (err.status === 404) return { moments: [], sha: null };
    throw err;
  }
}

async function writeData(moments, message) {
  const body = {
    message,
    content: utf8ToB64(JSON.stringify({ version: 1, moments: sortMoments(moments, 'asc') }, null, 2) + '\n'),
    branch: state.cfg.branch,
    ...(state.sha ? { sha: state.sha } : {}),
  };
  const res = await gh(contentsPath(DATA_PATH), { method: 'PUT', body });
  state.sha = res.content.sha;
}

/** 以最新資料套用變更後寫回；遇到版本衝突時重新讀取再試一次 */
async function commitChange(apply, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const next = apply(state.moments.slice());
      await writeData(next, message);
      state.moments = next;
      return;
    } catch (err) {
      if (attempt === 0 && (err.status === 409 || err.status === 422)) {
        const latest = await readData();
        state.moments = latest.moments;
        state.sha = latest.sha;
        continue;
      }
      throw err;
    }
  }
}

async function uploadFile(path, blob, message) {
  const content = await blobToB64(blob);
  await gh(contentsPath(path), { method: 'PUT', body: { message, content, branch: state.cfg.branch } });
}

async function deleteFile(path) {
  try {
    const meta = await gh(`${contentsPath(path)}?ref=${encodeURIComponent(state.cfg.branch)}`);
    await gh(contentsPath(path), {
      method: 'DELETE',
      body: { message: `刪除媒體 ${path}`, sha: meta.sha, branch: state.cfg.branch },
    });
  } catch (err) {
    if (err.status !== 404) console.warn('刪除檔案失敗', path, err);
  }
}

/* ---------- 連線 ---------- */
function updateConn() {
  const el = $('#conn');
  const { owner, repo, branch } = state.cfg;
  el.textContent = state.connected ? `已連線 ${owner}/${repo} · ${branch}` : '未連線（唯讀）';
  el.classList.toggle('ok', state.connected);
}

async function connect() {
  const latest = await readData();
  state.moments = latest.moments;
  state.sha = latest.sha;
  state.connected = true;
  updateConn();
  renderList();
}

function openSettings(msg = '') {
  const form = $('#settings-form');
  for (const k of ['owner', 'repo', 'branch', 'token']) form.elements[k].value = state.cfg[k] || '';
  const m = $('#settings-msg');
  m.textContent = msg;
  m.classList.remove('ok');
  $('#settings').showModal();
}

async function onSettingsSubmit(e) {
  if (e.submitter?.value === 'cancel') return;
  e.preventDefault();
  const form = e.target;
  state.cfg = Object.fromEntries(['owner', 'repo', 'branch', 'token'].map((k) => [k, form.elements[k].value.trim()]));
  const msg = $('#settings-msg');
  msg.classList.remove('ok');
  msg.textContent = '連線中…';
  try {
    const info = await gh('');
    if (info.permissions && !info.permissions.push) throw new Error('這個權杖沒有寫入權限（Contents: Read and write）');
    await connect();
    storageSet(CFG_KEY, state.cfg);
    msg.classList.add('ok');
    msg.textContent = `連線成功，共 ${state.moments.length} 則片段`;
    setTimeout(() => $('#settings').close(), 700);
  } catch (err) {
    state.connected = false;
    updateConn();
    msg.textContent = err.status === 401 ? '權杖無效或已過期' : err.status === 404 ? '找不到儲存庫，或權杖沒有存取權' : `連線失敗：${err.message}`;
  }
}

/* ---------- 左側清單 ---------- */
function renderList() {
  const q = state.search.trim().toLowerCase();
  const list = sortMoments(state.moments, 'desc')
    .filter((m) => !q || [m.title, m.content, m.date, ...(m.tags || [])].join(' ').toLowerCase().includes(q));
  let year = '';
  const html = [];
  for (const m of list) {
    const y = m.date.slice(0, 4);
    if (y !== year) { year = y; html.push(`<li class="year">${y}</li>`); }
    const cover = momentCover(m);
    html.push(`
      <li><button type="button" data-id="${escapeHtml(m.id)}" aria-current="${state.originalId === m.id}">
        <span class="thumb">${cover.url ? `<img src="${escapeHtml(cover.url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '✎'}</span>
        <span class="meta"><small>${formatDate(m.date)}</small><div>${escapeHtml(m.title || '無標題')}</div></span>
      </button></li>`);
  }
  $('#admin-list').innerHTML = html.join('') || '<li class="year">沒有片段</li>';
  $('#tag-suggest').innerHTML = [...new Set(state.moments.flatMap((m) => m.tags || []))]
    .map((t) => `<option value="${escapeHtml(t)}">`).join('');
}

/* ---------- 編輯器 ---------- */
function openEditor(moment) {
  releasePreviews();
  const isNew = !moment;
  state.originalId = moment?.id || null;
  state.draft = moment
    ? structuredClone(moment)
    : { id: null, date: todayStr(), title: '', content: '', tags: [], media: [], cover: 0 };
  const form = $('#editor');
  form.hidden = false;
  $('#empty-editor').hidden = true;
  $('#editor-heading').textContent = isNew ? '新增生活片段' : `編輯：${formatDate(moment.date)}`;
  form.elements.date.min = START_DATE;
  form.elements.date.max = todayStr();
  form.elements.date.value = state.draft.date;
  form.elements.title.value = state.draft.title || '';
  form.elements.content.value = state.draft.content || '';
  $('#btn-delete').hidden = isNew;
  renderChips();
  renderMedia();
  renderList();
  form.scrollIntoView({ block: 'start' });
}

function closeEditor() {
  releasePreviews();
  state.draft = null;
  state.originalId = null;
  $('#editor').hidden = true;
  $('#empty-editor').hidden = false;
  renderList();
}

function releasePreviews() {
  for (const item of state.draft?.media || []) if (item._preview) URL.revokeObjectURL(item._preview);
}

function renderChips() {
  $('#tag-chips').innerHTML = state.draft.tags
    .map((t, i) => `<span class="chip">#${escapeHtml(t)}<button type="button" data-remove-tag="${i}" aria-label="移除 ${escapeHtml(t)}">✕</button></span>`)
    .join('');
}

function addTags(text) {
  const tags = text.split(/[,，、#\s]+/).map((t) => t.trim()).filter(Boolean);
  for (const t of tags) if (!state.draft.tags.includes(t)) state.draft.tags.push(t);
  renderChips();
}

function mediaPreview(item) {
  if (item._file) {
    return item.type === 'video'
      ? `<video src="${item._preview}" muted preload="metadata"></video>`
      : `<img src="${item._preview}" alt="">`;
  }
  const thumb = mediaThumb(item);
  if (thumb) return `<img src="${escapeHtml(thumb)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith('🖼')">`;
  if (item.type === 'video' && isRepoMedia(item.src)) return `<video src="${escapeHtml(item.src)}" muted preload="metadata"></video>`;
  return { x: '𝕏', instagram: '📸', video: '🎬', link: '🔗' }[item.type] || '📎';
}

function renderMedia() {
  const media = state.draft.media;
  if (state.draft.cover >= media.length) state.draft.cover = 0;
  $('#media-list').innerHTML = media.map((item, i) => {
    const label = MEDIA_LABELS[item.type] || item.type;
    const source = item._file ? item._file.name : item.src;
    const isCover = i === (state.draft.cover || 0);
    return `
      <li class="media-item ${isCover ? 'is-cover' : ''}">
        <div class="preview">${mediaPreview(item)}</div>
        <div class="info">
          <span class="kind">${escapeHtml(label)}${item._file ? '<span class="pending-badge">儲存時上傳</span>' : ''} · ${escapeHtml(source)}</span>
          ${item.type === 'drive' ? `
            <select class="field" data-kind="${i}" aria-label="雲端檔案類型">
              <option value="image" ${item.kind === 'image' ? 'selected' : ''}>雲端照片</option>
              <option value="video" ${item.kind === 'video' ? 'selected' : ''}>雲端影片</option>
            </select>` : ''}
          <input class="field" data-caption="${i}" value="${escapeHtml(item.caption || '')}" placeholder="說明文字（選填）">
        </div>
        <div class="tools">
          <button type="button" data-cover="${i}" aria-pressed="${isCover}" title="設為便利貼縮圖">★</button>
          <button type="button" data-move="${i}:-1" title="往前" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-move="${i}:1" title="往後" ${i === media.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" data-remove-media="${i}" title="移除">✕</button>
        </div>
      </li>`;
  }).join('');
}

function addFiles(files) {
  for (const file of files) {
    const isVideo = file.type.startsWith('video/');
    if (!isVideo && !file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
      toast(`不支援的檔案：${file.name}`, true);
      continue;
    }
    if (file.size > MAX_UPLOAD) {
      toast(`${file.name} 超過 95MB，請改放 Google 雲端硬碟或 YouTube 後貼連結`, true, 6000);
      continue;
    }
    if (isVideo && file.size > WARN_UPLOAD) toast(`${file.name} 檔案較大，上傳可能需要一些時間`, false, 5000);
    state.draft.media.push({ type: isVideo ? 'video' : 'image', src: '', caption: '', _file: file, _preview: URL.createObjectURL(file) });
  }
  renderMedia();
}

function addLink() {
  const input = $('#link-entry');
  const url = input.value.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) { toast('請輸入以 http(s):// 開頭的網址', true); return; }
  const item = { ...parseMediaUrl(url), caption: '' };
  state.draft.media.push(item);
  input.value = '';
  renderMedia();
  toast(`已加入：${MEDIA_LABELS[item.type]}`);
}

/** 照片壓縮：最長邊 2000px、JPEG 品質 0.86；GIF/SVG 或無法解碼的格式維持原檔 */
async function prepareImage(file) {
  if (/image\/(gif|svg)/.test(file.type)) return file;
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return file; }
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 900 * 1024 && /jpe?g|png|webp/.test(file.type)) return file;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
  return blob && blob.size < file.size ? blob : file;
}

function extFor(blob, name = '') {
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg',
    'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
  return map[blob.type] || (name.split('.').pop() || 'bin').toLowerCase();
}

async function onSave(e) {
  e.preventDefault();
  if (state.busy) return;
  if (!state.connected) { openSettings('請先連線才能儲存。'); return; }
  const form = $('#editor');
  const date = form.elements.date.value;
  if (!date || date < START_DATE || date > todayStr()) {
    toast(`日期需介於 ${formatDate(START_DATE)} 到今天之間`, true);
    return;
  }
  addTags($('#tag-entry').value);
  $('#tag-entry').value = '';

  const draft = state.draft;
  draft.date = date;
  draft.title = form.elements.title.value.trim();
  draft.content = form.elements.content.value.replace(/\s+$/, '');
  const now = new Date().toISOString();
  draft.id ||= `m-${date.replace(/-/g, '')}-${randId()}`;
  draft.createdAt ||= now;
  draft.updatedAt = now;

  try {
    // 1. 上傳新檔案
    const pending = draft.media.filter((m) => m._file);
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      setBusy(true, `上傳媒體中（${i + 1}/${pending.length}）…`);
      const blob = item.type === 'image' ? await prepareImage(item._file) : item._file;
      const path = `media/${date.slice(0, 4)}/${date.replace(/-/g, '')}-${randId()}.${extFor(blob, item._file.name)}`;
      await uploadFile(path, blob, `上傳媒體 ${path}`);
      URL.revokeObjectURL(item._preview);
      delete item._file;
      delete item._preview;
      item.src = path;
    }

    // 2. 寫入資料
    setBusy(true, '儲存中…');
    const saved = structuredClone(draft);
    const before = state.moments.find((m) => m.id === state.originalId);
    await commitChange((list) => {
      const idx = list.findIndex((m) => m.id === saved.id);
      if (idx >= 0) list[idx] = saved; else list.push(saved);
      return list;
    }, `${before ? '更新' : '新增'}片段 ${saved.date} ${saved.title}`.trim());

    // 3. 刪除被移除的上傳檔案
    const keep = new Set(saved.media.map((m) => m.src));
    for (const m of before?.media || []) if (isRepoMedia(m.src) && !keep.has(m.src)) await deleteFile(m.src);

    state.originalId = saved.id;
    setBusy(false);
    toast('已儲存！前台約 1 分鐘後更新');
    openEditor(saved);
  } catch (err) {
    setBusy(false);
    renderMedia();
    toast(`儲存失敗：${err.message}`, true, 8000);
  }
}

async function onDelete() {
  if (!state.originalId || state.busy) return;
  if (!state.connected) { openSettings('請先連線才能刪除。'); return; }
  const target = state.moments.find((m) => m.id === state.originalId);
  if (!target || !confirm(`確定要刪除「${target.title || formatDate(target.date)}」嗎？上傳的照片與影片也會一併刪除。`)) return;
  try {
    setBusy(true, '刪除中…');
    await commitChange((list) => list.filter((m) => m.id !== target.id), `刪除片段 ${target.date} ${target.title}`.trim());
    for (const m of target.media || []) if (isRepoMedia(m.src)) await deleteFile(m.src);
    setBusy(false);
    toast('已刪除');
    closeEditor();
  } catch (err) {
    setBusy(false);
    toast(`刪除失敗：${err.message}`, true, 8000);
  }
}

/* ---------- 匯出 / 匯入 ---------- */
function onExport() {
  const blob = new Blob([JSON.stringify({ version: 1, moments: sortMoments(state.moments, 'asc') }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fallderz-moments-${todayStr()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function onImport(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!state.connected) { openSettings('請先連線才能匯入。'); return; }
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.moments;
    if (!Array.isArray(list) || list.some((m) => !m.id || !/^\d{4}-\d{2}-\d{2}$/.test(m.date || ''))) {
      throw new Error('檔案格式不正確');
    }
    if (!confirm(`匯入後會以檔案中的 ${list.length} 則片段取代目前的 ${state.moments.length} 則，確定嗎？`)) return;
    setBusy(true, '匯入中…');
    await commitChange(() => list, `匯入備份（${list.length} 則）`);
    setBusy(false);
    toast('匯入完成');
    closeEditor();
  } catch (err) {
    setBusy(false);
    toast(`匯入失敗：${err.message}`, true, 8000);
  }
}

/* ---------- 事件 ---------- */
function bindEvents() {
  $('#btn-settings').addEventListener('click', () => openSettings());
  $('#settings-form').addEventListener('submit', onSettingsSubmit);
  $('#btn-logout').addEventListener('click', () => {
    state.cfg.token = '';
    storageSet(CFG_KEY, { ...state.cfg });
    state.connected = false;
    updateConn();
    $('#settings-form').elements.token.value = '';
    $('#settings-msg').textContent = '已清除這台裝置上的權杖';
  });

  $('#btn-new').addEventListener('click', () => openEditor(null));
  $('#btn-cancel').addEventListener('click', closeEditor);
  $('#btn-delete').addEventListener('click', onDelete);
  $('#editor').addEventListener('submit', onSave);
  $('#btn-export').addEventListener('click', onExport);
  $('#file-import').addEventListener('change', onImport);

  $('#admin-search').addEventListener('input', (e) => { state.search = e.target.value; renderList(); });
  $('#admin-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (btn) openEditor(state.moments.find((m) => m.id === btn.dataset.id));
  });

  const tagEntry = $('#tag-entry');
  tagEntry.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === '，') && !e.isComposing) {
      e.preventDefault();
      addTags(tagEntry.value);
      tagEntry.value = '';
    } else if (e.key === 'Backspace' && !tagEntry.value && state.draft.tags.length) {
      state.draft.tags.pop();
      renderChips();
    }
  });
  tagEntry.addEventListener('change', () => { // 從建議清單點選時
    if (state.draft && state.moments.some((m) => (m.tags || []).includes(tagEntry.value))) {
      addTags(tagEntry.value);
      tagEntry.value = '';
    }
  });
  $('#tag-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-remove-tag]');
    if (!b) return;
    state.draft.tags.splice(Number(b.dataset.removeTag), 1);
    renderChips();
  });

  $('#file-media').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
  const dz = $('#dropzone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); addFiles([...e.dataTransfer.files]); });

  $('#btn-add-link').addEventListener('click', addLink);
  $('#link-entry').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } });

  const mediaList = $('#media-list');
  mediaList.addEventListener('input', (e) => {
    if (e.target.dataset.caption) state.draft.media[Number(e.target.dataset.caption)].caption = e.target.value;
  });
  mediaList.addEventListener('change', (e) => {
    if (e.target.dataset.kind) { state.draft.media[Number(e.target.dataset.kind)].kind = e.target.value; renderMedia(); }
  });
  mediaList.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const media = state.draft.media;
    if (b.dataset.cover) {
      state.draft.cover = Number(b.dataset.cover);
    } else if (b.dataset.move) {
      const [i, d] = b.dataset.move.split(':').map(Number);
      [media[i], media[i + d]] = [media[i + d], media[i]];
      const c = state.draft.cover || 0;
      if (c === i) state.draft.cover = i + d; else if (c === i + d) state.draft.cover = i;
    } else if (b.dataset.removeMedia) {
      const i = Number(b.dataset.removeMedia);
      const [removed] = media.splice(i, 1);
      if (removed._preview) URL.revokeObjectURL(removed._preview);
      const c = state.draft.cover || 0;
      if (c > i || c >= media.length) state.draft.cover = Math.max(0, c - 1);
    }
    renderMedia();
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.busy || state.draft?.media.some((m) => m._file)) e.preventDefault();
  });
}

async function init() {
  bindEvents();
  updateConn();
  if (state.cfg.token) {
    try {
      await connect();
      return;
    } catch (err) {
      toast(`自動連線失敗：${err.message}`, true, 6000);
    }
  }
  try { state.moments = await fetchMoments(); } catch { state.moments = []; }
  renderList();
  openSettings('目前為唯讀模式，請輸入 GitHub 權杖以啟用編修功能。');
}

init();
