import {
  START_DATE, DATA_PATH, PRESET_TAGS, todayStr, onNewDay, formatDate, escapeHtml, sortMoments, sortTags, momentCover,
  mediaThumb, driveId, driveImage, isVideoPath, isBirthday, storageGet, storageSet, MEDIA_LABELS,
  NOTICES_PATH, sortNotices, richText,
} from './common.js?v=202610041021';

const $ = (sel) => document.querySelector(sel);
const CFG_KEY = 'fm.github';
const DRIVE_TOKEN_KEY = 'fm.driveToken';
// 上傳資料夾不寫在公開的程式碼中：由擁有者私下提供，各自在「連線設定」填寫一次（只存在瀏覽器）
const DEFAULT_FOLDER = '';
// 填入 Google OAuth 用戶端 ID 後，每位上傳者就不必自己輸入（用戶端 ID 不是密碼，可以公開）
const DEFAULT_CLIENT_ID = '';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

const state = {
  cfg: { ...guessConfig(), ...storageGet(CFG_KEY, {}), ...siteRepo() },
  connected: false,
  moments: [],
  sha: null,
  draft: null,     // 編輯中的紀錄副本
  originalId: null,
  search: '',
  busy: false,
};

const drive = {
  token: null,
  expires: 0,
  client: null,
  pending: null,
  folderName: '',
  ...storageGet(DRIVE_TOKEN_KEY, {}, 'sessionStorage'),
};

/** 架在 GitHub Pages 時，從網址自動判斷儲存庫（帳號改名或轉移後也不用改程式） */
function siteRepo() {
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/i);
  if (!m) return {};
  const seg = location.pathname.split('/').filter(Boolean)[0];
  return { owner: m[1], repo: seg && !seg.endsWith('.html') ? seg : location.hostname };
}

function guessConfig() {
  return {
    owner: '',
    repo: 'moments',
    branch: 'main',
    token: '',
    clientId: DEFAULT_CLIENT_ID,
    folderId: DEFAULT_FOLDER,
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

const randId = () => Math.random().toString(36).slice(2, 8);
const isRepoMedia = (src = '') => src.startsWith('media/');
const formatSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.ceil(n / 1024)}KB`);

/* ---------- GitHub API（文字資料） ---------- */
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

async function deleteRepoFile(path) {
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

/** 確認分支存在，避免讀到空資料、存檔時才失敗 */
async function checkBranch() {
  try {
    await gh(`/branches/${encodeURIComponent(state.cfg.branch)}`);
  } catch (err) {
    if (err.status !== 404) throw err;
    const branches = await gh('/branches?per_page=100').catch(() => []);
    const names = branches.map((b) => b.name);
    const e = new Error(`找不到分支「${state.cfg.branch}」。` +
      (names.length ? `這個儲存庫目前的分支有：${names.join('、')}` : '這個儲存庫還沒有任何分支'));
    e.branches = names;
    throw e;
  }
}

async function connect() {
  await checkBranch();
  const latest = await readData();
  state.moments = latest.moments;
  state.sha = latest.sha;
  state.connected = true;
  updateConn();
  renderList();
  loadHistory();
}

/* ---------- 公告 ---------- */
async function readNotices() {
  try {
    const meta = await gh(`${contentsPath(NOTICES_PATH)}?ref=${encodeURIComponent(state.cfg.branch)}`);
    const data = JSON.parse(b64ToUtf8(meta.content));
    return { notices: Array.isArray(data) ? data : data.notices || [], sha: meta.sha };
  } catch (err) {
    if (err.status === 404) return { notices: [], sha: null };
    throw err;
  }
}

/** 讀取最新公告 → 套用變更 → 寫回（公告檔很小，每次都重新讀取以免覆蓋別人剛發布的） */
async function changeNotices(apply, message) {
  for (let attempt = 0; ; attempt++) {
    const latest = await readNotices();
    const next = sortNotices(apply(latest.notices));
    try {
      await gh(contentsPath(NOTICES_PATH), {
        method: 'PUT',
        body: {
          message,
          content: utf8ToB64(JSON.stringify({ version: 1, notices: next }, null, 2) + '\n'),
          branch: state.cfg.branch,
          ...(latest.sha ? { sha: latest.sha } : {}),
        },
      });
      return next;
    } catch (err) {
      if (attempt === 0 && (err.status === 409 || err.status === 422)) continue;
      throw err;
    }
  }
}

function renderNotices(list) {
  $('#notice-list').innerHTML = list.map((n) => `
    <li><span class="notice-text"><small>${formatDate(n.date)}</small>${richText(n.content)}</span>
      <button class="btn small danger" type="button" data-del-notice="${escapeHtml(n.id)}">刪除</button></li>`).join('')
    || '<li class="hint">還沒有公告</li>';
}

function bindNotices() {
  const dlg = $('#notices');
  const form = $('#notice-form');
  let list = [];
  $('#btn-notices').addEventListener('click', async () => {
    if (!state.connected) { openSettings('請先連線才能發布公告。'); return; }
    form.elements.date.value = todayStr();
    form.elements.date.max = todayStr();
    $('#notice-list').innerHTML = '<li class="hint">讀取中…</li>';
    dlg.showModal();
    try { list = sortNotices((await readNotices()).notices); renderNotices(list); } catch (err) { toast(`讀取公告失敗：${err.message}`, true); }
  });
  dlg.querySelector('[data-close-notices]').addEventListener('click', () => dlg.close());
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.busy) return;
    const date = form.elements.date.value;
    const content = form.elements.content.value.trim();
    if (!date || !content) return;
    const notice = { id: `n-${date.replace(/-/g, '')}-${randId()}`, date, content, createdAt: new Date().toISOString() };
    setBusy(true, '發布中…');
    try {
      list = await changeNotices((l) => [...l, notice], `發布公告 ${date} [${notice.id}]`);
      renderNotices(list);
      form.elements.content.value = '';
      toast('公告已發布！前台約 1 分鐘後更新');
    } catch (err) {
      toast(`發布失敗：${err.message}`, true, 8000);
    }
    setBusy(false);
  });
  $('#notice-list').addEventListener('click', async (e) => {
    const id = e.target.closest('[data-del-notice]')?.dataset.delNotice;
    if (!id || state.busy || !confirm('確定要刪除這則公告嗎？')) return;
    setBusy(true, '刪除中…');
    try {
      list = await changeNotices((l) => l.filter((n) => n.id !== id), `刪除公告 [${id}]`);
      renderNotices(list);
      toast('公告已刪除');
    } catch (err) {
      toast(`刪除失敗：${err.message}`, true, 8000);
    }
    setBusy(false);
  });
}

/* ---------- 編輯紀錄（只在後台顯示，資料來自 GitHub 的提交紀錄，無法冒名） ---------- */
const HISTORY_RE = /^(新增|更新|刪除)紀錄 (\d{4}-\d{2}-\d{2})\s*(.*?)\s*(?:\[([\w-]+)\])?$/;

async function loadHistory() {
  const commits = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const batch = await gh(`/commits?path=${encodeURIComponent(DATA_PATH)}&sha=${encodeURIComponent(state.cfg.branch)}&per_page=100&page=${page}`);
      commits.push(...batch);
      if (batch.length < 100) break;
    }
  } catch (err) {
    console.warn('讀取編輯紀錄失敗', err);
    return;
  }
  // 舊的提交訊息沒有紀錄 id，改用「日期＋標題」對應
  const byDateTitle = new Map(state.moments.map((m) => [`${m.date} ${m.title || ''}`.trim(), m.id]));
  const history = new Map();
  for (const c of commits) {
    const m = c.commit.message.split('\n')[0].match(HISTORY_RE);
    if (!m) continue;
    const id = m[4] || byDateTitle.get(`${m[2]} ${m[3]}`.trim());
    if (!id) continue;
    if (!history.has(id)) history.set(id, []);
    history.get(id).push({ action: m[1], who: c.commit.author?.name || c.author?.login || '?', at: c.commit.author?.date || '' });
  }
  state.history = history;  // 每則由新到舊
  renderList();
  renderHistory();
}

const shortTime = (iso) => iso ? new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(iso)) : '';

function renderHistory() {
  const box = $('#editor-history');
  if (!box) return;
  const list = (state.originalId && state.history?.get(state.originalId)) || [];
  box.hidden = !list.length;
  if (!list.length) return;
  const first = list[list.length - 1], last = list[0];
  box.innerHTML = `<span>🖋 最後編輯：<b>${escapeHtml(last.who)}</b>（${shortTime(last.at)}）</span>` +
    (list.length > 1 ? `<span>建立：${escapeHtml(first.who)}（${shortTime(first.at)}）</span>` : '') +
    `<details><summary>全部 ${list.length} 次修改</summary><ol>${list.map((h) =>
      `<li>${shortTime(h.at)}　${escapeHtml(h.who)}　${h.action}</li>`).join('')}</ol></details>`;
}

/* ---------- Google 雲端硬碟（照片與影片） ---------- */
let gisLoader;
function loadGis() {
  gisLoader ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { gisLoader = null; reject(new Error('無法載入 Google 登入元件')); };
    document.head.appendChild(s);
  });
  return gisLoader;
}

/** 預先載入 Google 登入元件，讓之後按鈕點擊時可以直接跳出授權視窗 */
async function initDrive() {
  drive.client = null;
  if (!state.cfg.clientId) { updateDriveConn(); return; }
  try {
    await loadGis();
    drive.client = google.accounts.oauth2.initTokenClient({
      client_id: state.cfg.clientId,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        const p = drive.pending;
        drive.pending = null;
        if (resp.error) { p?.reject(new Error(`Google 授權失敗：${resp.error_description || resp.error}`)); return; }
        drive.token = resp.access_token;
        drive.expires = Date.now() + Number(resp.expires_in || 3600) * 1000;
        storageSet(DRIVE_TOKEN_KEY, { token: drive.token, expires: drive.expires }, 'sessionStorage');
        p?.resolve(drive.token);
      },
      error_callback: (err) => {
        const p = drive.pending;
        drive.pending = null;
        p?.reject(new Error(err.type === 'popup_closed' ? '已取消 Google 授權' : `Google 授權失敗：${err.message || err.type}`));
      },
    });
  } catch (err) {
    toast(err.message, true, 6000);
  }
  updateDriveConn();
}

const driveTokenValid = () => drive.token && Date.now() < drive.expires - 60_000;

/** 取得雲端硬碟權杖；必須在使用者點擊的當下呼叫（瀏覽器才會允許跳出授權視窗） */
function ensureDriveToken() {
  if (driveTokenValid()) return Promise.resolve(drive.token);
  if (!state.cfg.clientId) return Promise.reject(new Error('請先在「連線設定」填寫 Google OAuth 用戶端 ID'));
  if (!drive.client) return Promise.reject(new Error('Google 登入元件尚未載入，請稍候再試'));
  return new Promise((resolve, reject) => {
    drive.pending = { resolve, reject };
    drive.client.requestAccessToken({ prompt: drive.token ? '' : 'consent' });
  });
}

/** Google 授權失效或權限不足時清掉授權，下次會重新跳出同意畫面 */
function driveAuthError(status, message) {
  if (status === 401 || (status === 403 && /insufficient/i.test(message || ''))) {
    drive.token = null;
    storageSet(DRIVE_TOKEN_KEY, {}, 'sessionStorage');
    updateDriveConn();
    if (status === 403) return '雲端硬碟權限不足：請按「連結 Google 雲端硬碟」重新授權，並勾選雲端硬碟權限';
  }
  return message;
}

async function gd(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${drive.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const info = await res.json().catch(() => ({}));
    const err = new Error(driveAuthError(res.status, info.error?.message || res.statusText));
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

async function checkFolder() {
  if (!state.cfg.folderId) throw new Error('尚未設定上傳資料夾：請到「連線設定」貼上 KONOKI 提供的資料夾網址');
  try {
    const f = await gd(`https://www.googleapis.com/drive/v3/files/${state.cfg.folderId}?fields=id,name,mimeType,capabilities(canAddChildren)&supportsAllDrives=true`);
    if (f.mimeType !== 'application/vnd.google-apps.folder') throw new Error('設定的 ID 不是資料夾');
    if (f.capabilities && f.capabilities.canAddChildren === false) throw new Error(`沒有權限把檔案放進「${f.name}」`);
    drive.folderName = f.name;
  } catch (err) {
    drive.folderName = '';
    throw err.status === 404 ? new Error('找不到上傳資料夾，請確認資料夾網址，以及登入的是擁有該資料夾的 Google 帳號') : err;
  } finally {
    updateDriveConn();
  }
}

async function connectDrive() {
  try {
    await ensureDriveToken();
    await checkFolder();
    toast(`已連結雲端資料夾「${drive.folderName}」`);
  } catch (err) {
    toast(err.message, true, 7000);
  }
}

/** 以 resumable 方式上傳（支援大型影片），回傳 Drive 檔案資訊 */
async function driveUpload(file, name, onProgress) {
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${drive.token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': file.type || 'application/octet-stream',
      'X-Upload-Content-Length': String(file.size),
    },
    body: JSON.stringify({ name, parents: [state.cfg.folderId] }),
  });
  if (!init.ok) {
    const info = await init.json().catch(() => ({}));
    throw new Error(driveAuthError(init.status, info.error?.message || `無法建立上傳（${init.status}）`));
  }
  const uploadUrl = init.headers.get('Location');
  if (!uploadUrl) throw new Error('無法取得上傳網址');
  const result = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error(`上傳失敗（${xhr.status}）`));
    };
    xhr.onerror = () => reject(new Error('網路中斷，上傳失敗'));
    xhr.send(file);
  });
  // 讓「知道連結的任何人」都能檢視，網站才能顯示
  await gd(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions?supportsAllDrives=true`, {
    method: 'POST',
    body: { role: 'reader', type: 'anyone' },
  });
  return result;
}

/* ---------- 連線狀態與設定 ---------- */
function updateConn() {
  const el = $('#conn');
  el.textContent = state.connected ? 'GitHub ✓ 已連線' : 'GitHub 未連線';
  el.classList.toggle('ok', state.connected);
  document.body.classList.toggle('locked', !state.connected);  // 沒連線就看不到任何紀錄與編輯功能
}

function updateDriveConn() {
  const el = $('#drive-conn');
  const ok = driveTokenValid();
  el.textContent = ok ? `雲端硬碟 ✓ ${drive.folderName || '已授權'}` : state.cfg.clientId ? '雲端硬碟未連結' : '雲端硬碟未設定';
  el.classList.toggle('ok', !!ok);
  $('#btn-drive').hidden = !!(ok && drive.folderName);
}

function openSettings(msg = '') {
  const form = $('#settings-form');
  for (const k of ['owner', 'repo', 'branch', 'token', 'clientId']) form.elements[k].value = state.cfg[k] || '';
  // 網址已能判斷儲存庫時不需要手動填寫；否則（例如本機測試）展開進階設定
  const auto = !!siteRepo().owner;
  form.elements.owner.readOnly = form.elements.repo.readOnly = auto;
  $('#advanced').open = !auto || !state.cfg.owner;
  form.elements.folder.value = state.cfg.folderId || '';
  const m = $('#settings-msg');
  m.textContent = msg;
  m.classList.remove('ok');
  if (!$('#settings').open) $('#settings').showModal();
}

async function onSettingsSubmit(e) {
  if (e.submitter?.value === 'cancel') return;
  e.preventDefault();
  const form = e.target;
  const prevClient = state.cfg.clientId;
  const folderRaw = form.elements.folder.value.trim();
  state.cfg = {
    ...Object.fromEntries(['owner', 'repo', 'branch', 'token', 'clientId'].map((k) => [k, form.elements[k].value.trim()])),
    folderId: driveId(folderRaw) || folderRaw || DEFAULT_FOLDER,
    ...siteRepo(),
  };
  storageSet(CFG_KEY, state.cfg);
  if (state.cfg.clientId !== prevClient) { drive.token = null; initDrive(); }
  const msg = $('#settings-msg');
  msg.classList.remove('ok');
  msg.textContent = '連線中…';
  try {
    const info = await gh('');
    if (info.permissions && !info.permissions.push) throw new Error('這個權杖沒有寫入權限：請確認已接受協作邀請，且權杖已勾選 public_repo（擁有者的 Fine-grained token 需將 Contents 設為 Read and write）');
    await connect();
    msg.classList.add('ok');
    msg.textContent = `GitHub 連線成功，共 ${state.moments.length} 則紀錄`;
    setTimeout(() => $('#settings').close(), 900);
  } catch (err) {
    state.connected = false;
    updateConn();
    if (err.branches?.length === 1) form.elements.branch.value = err.branches[0];
    msg.textContent = err.branches ? err.message
      : err.status === 401 ? '權杖無效或已過期'
      : err.status === 404 ? '找不到儲存庫，或權杖沒有存取權'
      : `連線失敗：${err.message}`;
  }
}

/* ---------- 左側清單 ---------- */
const editorOf = (id) => {
  const who = state.history?.get(id)?.[0]?.who;
  return who ? `<span class="by"> · ✎ ${escapeHtml(who)}</span>` : '';
};

function renderList() {
  const q = state.search.trim().toLowerCase();
  const list = sortMoments(state.moments, 'desc')
    .filter((m) => !q || [m.title, m.content, m.date, m.series, ...(m.tags || [])].join(' ').toLowerCase().includes(q));
  let year = '';
  const html = [];
  for (const m of list) {
    const y = m.date.slice(0, 4);
    if (y !== year) { year = y; html.push(`<li class="year">${y}</li>`); }
    const cover = momentCover(m);
    html.push(`
      <li><button type="button" data-id="${escapeHtml(m.id)}" aria-current="${state.originalId === m.id}">
        <span class="thumb">${cover.url ? `<img src="${escapeHtml(cover.url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '✎'}</span>
        <span class="meta"><small>${formatDate(m.date)}${isBirthday(m.date) ? ' 🎂' : ''}${editorOf(m.id)}</small><div>${escapeHtml(m.title || '無標題')}</div></span>
      </button></li>`);
  }
  $('#admin-list').innerHTML = html.join('') || '<li class="year">沒有紀錄</li>';
  // 既有系列（附則數），方便選到完全相同的名稱
  const seriesCount = new Map();
  for (const m of state.moments) if (m.series) seriesCount.set(m.series, (seriesCount.get(m.series) || 0) + 1);
  $('#series-suggest').innerHTML = [...seriesCount.entries()].sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'))
    .map(([name, n]) => `<option value="${escapeHtml(name)}" label="${n} 則">`).join('');
  $('#tag-suggest').innerHTML = sortTags([...new Set(state.moments.flatMap((m) => m.tags || []))])
    .filter((t) => !PRESET_TAGS.includes(t))
    .map((t) => `<option value="${escapeHtml(t)}">`).join('');
}

/* ---------- 編輯器 ---------- */
function refreshDateLimit() {
  const input = $('#editor').elements.date;
  input.min = START_DATE;
  input.max = todayStr();
  const hint = $('#date-hint');
  hint.textContent = isBirthday(input.value) ? '🎂 生日紀錄，前台會特別裝飾' : `可選 ${formatDate(START_DATE)} ～ ${formatDate(todayStr())}`;
  hint.classList.toggle('bday-note', isBirthday(input.value));
}

function openEditor(moment) {
  releasePreviews();
  const isNew = !moment;
  state.originalId = moment?.id || null;
  state.draft = moment
    ? { source: '', ...structuredClone(moment) }
    : { id: null, date: todayStr(), title: '', content: '', source: '', tags: [], media: [], cover: 0 };
  const form = $('#editor');
  form.hidden = false;
  $('#empty-editor').hidden = true;
  $('#editor-heading').textContent = isNew ? '新增紀錄' : `編輯：${formatDate(moment.date)}`;
  form.elements.date.value = state.draft.date;
  form.elements.title.value = state.draft.title || '';
  form.elements.source.value = state.draft.source || '';
  form.elements.series.value = state.draft.series || '';
  form.elements.content.value = state.draft.content || '';
  $('#btn-delete').hidden = isNew;
  refreshDateLimit();
  renderTagsUi();
  renderMedia();
  renderList();
  renderHistory();
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

function renderTagsUi() {
  const tags = state.draft.tags;
  $('#preset-tags').innerHTML = PRESET_TAGS
    .map((t) => `<button type="button" data-preset="${escapeHtml(t)}" aria-pressed="${tags.includes(t)}">${escapeHtml(t)}</button>`)
    .join('');
  $('#tag-chips').innerHTML = tags
    .map((t, i) => (PRESET_TAGS.includes(t) ? '' :
      `<span class="chip">${escapeHtml(t)}<button type="button" data-remove-tag="${i}" aria-label="移除 ${escapeHtml(t)}">✕</button></span>`))
    .join('');
}

function addTags(text) {
  const tags = text.split(/[,，、#\n]+/).map((t) => t.trim()).filter(Boolean);
  for (const t of tags) {
    const preset = PRESET_TAGS.find((p) => p.toLowerCase() === t.toLowerCase());
    const tag = preset || t;
    if (!state.draft.tags.includes(tag)) state.draft.tags.push(tag);
  }
  renderTagsUi();
}

function mediaPreview(item) {
  if (item._file) {
    return item._isVideo
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
    const label = item._file ? (item._isVideo ? '影片' : '照片') : item.type === 'drive'
      ? `雲端${item.kind === 'video' ? '影片' : '照片'}` : MEDIA_LABELS[item.type] || item.type;
    const source = item._file ? `${item._file.name}（${formatSize(item._file.size)}）` : item.name || item.src;
    const isCover = i === (state.draft.cover || 0);
    return `
      <li class="media-item ${isCover ? 'is-cover' : ''}">
        <div class="preview">${mediaPreview(item)}</div>
        <div class="info">
          <span class="kind">${escapeHtml(label)}${item._file ? '<span class="pending-badge">儲存時上傳</span>' : ''} · ${escapeHtml(source)}</span>
          ${item._file ? `<div class="progress"><i data-progress="${i}"></i></div>` : ''}
          ${item.type === 'drive' && !item._file ? `
            <select class="field" data-kind="${i}" aria-label="雲端檔案類型">
              <option value="image" ${item.kind !== 'video' ? 'selected' : ''}>雲端照片</option>
              <option value="video" ${item.kind === 'video' ? 'selected' : ''}>雲端影片</option>
            </select>` : ''}
          <input class="field" data-caption="${i}" value="${escapeHtml(item.caption || '')}" placeholder="說明文字（選填）">
        </div>
        <div class="tools">
          <button type="button" data-cover="${i}" aria-pressed="${isCover}" title="設為便利貼縮圖">★</button>
          ${item.type === 'drive' && item.kind === 'video' && !item._file ? `<button type="button" data-frame="${i}" title="${item.thumb ? '重新擷取影片封面' : '擷取影片封面'}">🎞</button>` : ''}
          <button type="button" data-move="${i}:-1" title="往前" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-move="${i}:1" title="往後" ${i === media.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" data-remove-media="${i}" title="移除">✕</button>
        </div>
      </li>`;
  }).join('');
}

function addFiles(files) {
  let added = 0;
  for (const file of files) {
    const isVideo = file.type.startsWith('video/') || isVideoPath(file.name);
    if (!isVideo && !file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
      toast(`不支援的檔案：${file.name}`, true);
      continue;
    }
    state.draft.media.push({ type: 'drive', caption: '', _file: file, _isVideo: isVideo, _preview: URL.createObjectURL(file) });
    added++;
  }
  renderMedia();
  if (added && (!state.cfg.clientId || !state.cfg.folderId)) toast('提醒：尚未設定 Google 雲端硬碟或上傳資料夾，儲存前請先到「連線設定」填寫', true, 6000);
}

/** 從影片擷取一個畫面當封面（約影片 10% 處，至少 0.5 秒），回傳 { blob, w, h }；無法解碼時回傳 null */
function captureFrame(src, maxWidth = 1280) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    let done = false;
    const finish = (blob) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      v.removeAttribute('src');
      v.load();
      resolve(blob);
    };
    const timer = setTimeout(() => finish(null), 30000);
    v.onerror = () => finish(null);
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : 0;
      v.currentTime = d ? Math.min(Math.max(d * 0.1, 0.5), Math.max(d - 0.1, 0)) : 0.5;
    };
    v.onseeked = () => {
      if (!v.videoWidth) { finish(null); return; }
      const scale = Math.min(1, maxWidth / v.videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      try {
        canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((b) => finish(b && { blob: b, w: v.videoWidth, h: v.videoHeight }), 'image/jpeg', 0.85);
      } catch {
        finish(null);
      }
    };
    v.src = src;
  });
}

/** 把擷取的封面上傳到雲端資料夾，並設為該影片的縮圖 */
async function uploadCover(item, frame, baseName) {
  const coverName = baseName.replace(/\.[^.]+$/, '') + '_cover.jpg';
  const cover = await driveUpload(frame.blob, coverName, () => {});
  item.thumb = driveImage(cover.id, 800);
  item.thumbId = cover.id;
  // 記錄影片長寬，手機版會依直式／橫式調整播放器比例
  item.w = frame.w;
  item.h = frame.h;
}

/** 已上傳到雲端的影片：下載後擷取封面（必須在點擊當下呼叫，才能跳出授權視窗） */
async function makeCoverForExisting(i) {
  const item = state.draft.media[i];
  const tokenReady = ensureDriveToken();
  try {
    setBusy(true, '下載影片以擷取封面…');
    await tokenReady;
    if (!drive.folderName) await checkFolder();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${item.id}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${drive.token}` },
    });
    if (!res.ok) throw new Error(driveAuthError(res.status, `無法下載影片（${res.status}）`));
    const url = URL.createObjectURL(await res.blob());
    const frame = await captureFrame(url);
    URL.revokeObjectURL(url);
    if (!frame) throw new Error('這支影片的格式無法在瀏覽器中擷取畫面');
    setBusy(true, '上傳封面中…');
    await uploadCover(item, frame, item.name || `${state.draft.date.replace(/-/g, '')}_video.mp4`);
    setBusy(false);
    renderMedia();
    toast('封面已擷取，按「儲存並發佈」後生效');
  } catch (err) {
    setBusy(false);
    toast(`擷取封面失敗：${err.message}`, true, 7000);
  }
}

function uploadName(date, title, file, n) {
  const safeTitle = (title || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30);
  const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
  return `${date.replace(/-/g, '')}${safeTitle ? `_${safeTitle}` : ''}_${String(n).padStart(2, '0')}${ext ? `.${ext}` : ''}`;
}

async function onSave(e) {
  e.preventDefault();
  if (state.busy) return;
  if (!state.connected) { openSettings('請先連線 GitHub 才能儲存。'); return; }
  const form = $('#editor');
  const date = form.elements.date.value;
  if (!date || date < START_DATE || date > todayStr()) {
    toast(`日期需介於 ${formatDate(START_DATE)} 到今天（${formatDate(todayStr())}）之間`, true);
    return;
  }
  const source = form.elements.source.value.trim();
  if (source && !/^https?:\/\//i.test(source)) { toast('資訊來源網址需以 http(s):// 開頭', true); return; }

  const draft = state.draft;
  const pending = draft.media.filter((m) => m._file);
  // 必須在點擊的當下要求授權，瀏覽器才不會擋下 Google 授權視窗
  const tokenReady = pending.length ? ensureDriveToken() : Promise.resolve();
  tokenReady.catch(() => {}); // 錯誤會在下方 await 時處理

  addTags($('#tag-entry').value);
  $('#tag-entry').value = '';
  draft.date = date;
  draft.title = form.elements.title.value.trim();
  draft.source = source;
  draft.series = form.elements.series.value.trim().replace(/\s+/g, ' ');
  draft.content = form.elements.content.value.replace(/\s+$/, '');
  const now = new Date().toISOString();
  draft.id ||= `m-${date.replace(/-/g, '')}-${randId()}`;
  draft.createdAt ||= now;
  draft.updatedAt = now;

  try {
    // 1. 上傳照片與影片到 Google 雲端硬碟
    if (pending.length) {
      setBusy(true, '等待 Google 授權…');
      await tokenReady;
      if (!drive.folderName) await checkFolder();
      for (let i = 0; i < pending.length; i++) {
        const item = pending[i];
        const idx = draft.media.indexOf(item);
        const bar = () => document.querySelector(`[data-progress="${idx}"]`);
        const name = uploadName(date, draft.title, item._file, idx + 1);
        const result = await driveUpload(item._file, name, (p) => {
          toast(`上傳中 ${i + 1}/${pending.length}：${item._file.name}　${Math.round(p * 100)}%`, false, 0);
          const b = bar();
          if (b) b.style.width = `${p * 100}%`;
        });
        const isVideo = item._isVideo || (result.mimeType || '').startsWith('video/');
        let coverBlob = null;
        if (isVideo) {
          toast(`擷取影片封面 ${i + 1}/${pending.length}…`, false, 0);
          coverBlob = await captureFrame(item._preview);
        }
        URL.revokeObjectURL(item._preview);
        for (const k of ['_file', '_preview', '_isVideo']) delete item[k];
        Object.assign(item, {
          type: 'drive', id: result.id, kind: isVideo ? 'video' : 'image', name: result.name,
          src: `https://drive.google.com/file/d/${result.id}/view`,
        });
        if (coverBlob) {
          try { await uploadCover(item, coverBlob, result.name); } catch (err) { console.warn('封面上傳失敗', err); }
        }
        renderMedia();
      }
    }

    // 2. 寫入資料
    setBusy(true, '儲存中…');
    const saved = structuredClone(draft);
    if (!saved.source) delete saved.source;
    if (!saved.series) delete saved.series;
    const before = state.moments.find((m) => m.id === state.originalId);
    await commitChange((list) => {
      const idx = list.findIndex((m) => m.id === saved.id);
      if (idx >= 0) list[idx] = saved; else list.push(saved);
      return list;
    }, `${before ? '更新' : '新增'}紀錄 ${saved.date} ${saved.title}`.trim() + ` [${saved.id}]`);

    // 3. 刪除被移除、存放在儲存庫內的舊檔案（雲端硬碟上的檔案一律保留）
    const keep = new Set(saved.media.map((m) => m.src));
    for (const m of before?.media || []) if (isRepoMedia(m.src) && !keep.has(m.src)) await deleteRepoFile(m.src);

    state.originalId = saved.id;
    loadHistory();
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
  if (!target || !confirm(`確定要刪除「${target.title || formatDate(target.date)}」嗎？\n（Google 雲端硬碟裡的原始檔案會保留，不會被刪除）`)) return;
  try {
    setBusy(true, '刪除中…');
    await commitChange((list) => list.filter((m) => m.id !== target.id), `刪除紀錄 ${target.date} ${target.title}`.trim() + ` [${target.id}]`);
    for (const m of target.media || []) if (isRepoMedia(m.src)) await deleteRepoFile(m.src);
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
    if (!confirm(`匯入後會以檔案中的 ${list.length} 則紀錄取代目前的 ${state.moments.length} 則，確定嗎？`)) return;
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
  const help = $('#help');
  const openHelp = () => { if (!help.open) help.showModal(); help.scrollTop = 0; };
  $('#btn-help').addEventListener('click', openHelp);
  document.querySelector('[data-open-help]')?.addEventListener('click', openHelp);
  help.querySelector('[data-close-help]').addEventListener('click', () => help.close());
  help.addEventListener('click', (e) => { if (e.target === help) help.close(); });
  $('#btn-drive').addEventListener('click', () => {
    if (!state.cfg.clientId) { openSettings('請先填寫 Google OAuth 用戶端 ID。'); return; }
    connectDrive();
  });
  $('#settings-form').addEventListener('submit', onSettingsSubmit);
  $('#btn-logout').addEventListener('click', () => {
    state.cfg.token = '';
    storageSet(CFG_KEY, { ...state.cfg });
    state.connected = false;
    if (drive.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(drive.token, () => {});
    drive.token = null;
    storageSet(DRIVE_TOKEN_KEY, {}, 'sessionStorage');
    updateConn();
    updateDriveConn();
    $('#settings-form').elements.token.value = '';
    state.moments = [];
    state.history = null;
    closeEditor();
    $('#settings-msg').textContent = '已清除這台裝置上的 GitHub 權杖與 Google 授權';
  });

  $('#btn-unlock').addEventListener('click', () => openSettings());
  // 館員說明裡的儲存庫連結依網站網址產生（網址改變時不用修改說明）
  const { owner, repo } = siteRepo();
  document.querySelectorAll('[data-repo]').forEach((a) => {
    if (owner) a.href = `https://github.com/${owner}/${repo}/${a.dataset.repo}`;
    else a.removeAttribute('href');
  });
  bindNotices();

  $('#btn-new').addEventListener('click', () => openEditor(null));
  $('#btn-cancel').addEventListener('click', closeEditor);
  $('#btn-delete').addEventListener('click', onDelete);
  $('#editor').addEventListener('submit', onSave);
  $('#btn-export').addEventListener('click', onExport);
  $('#file-import').addEventListener('change', onImport);

  const dateInput = $('#editor').elements.date;
  dateInput.addEventListener('focus', refreshDateLimit);
  dateInput.addEventListener('input', refreshDateLimit);
  onNewDay(() => { if (state.draft) refreshDateLimit(); });

  $('#admin-search').addEventListener('input', (e) => { state.search = e.target.value; renderList(); });
  $('#admin-list').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (btn) openEditor(state.moments.find((m) => m.id === btn.dataset.id));
  });

  $('#preset-tags').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    const tags = state.draft.tags;
    const i = tags.indexOf(b.dataset.preset);
    if (i >= 0) tags.splice(i, 1); else tags.push(b.dataset.preset);
    renderTagsUi();
  });
  const tagEntry = $('#tag-entry');
  tagEntry.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ',' || e.key === '，') && !e.isComposing) {
      e.preventDefault();
      addTags(tagEntry.value);
      tagEntry.value = '';
    } else if (e.key === 'Backspace' && !tagEntry.value) {
      const tags = state.draft.tags;
      for (let i = tags.length - 1; i >= 0; i--) {
        if (!PRESET_TAGS.includes(tags[i])) { tags.splice(i, 1); renderTagsUi(); break; }
      }
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
    renderTagsUi();
  });

  $('#file-media').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
  const dz = $('#dropzone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('drag'); addFiles([...e.dataTransfer.files]); });


  const mediaList = $('#media-list');
  mediaList.addEventListener('input', (e) => {
    if (e.target.dataset.caption) state.draft.media[Number(e.target.dataset.caption)].caption = e.target.value;
  });
  mediaList.addEventListener('change', (e) => {
    if (e.target.dataset.kind) { state.draft.media[Number(e.target.dataset.kind)].kind = e.target.value; renderMedia(); }
  });
  mediaList.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || state.busy) return;
    const media = state.draft.media;
    if (b.dataset.frame) {
      makeCoverForExisting(Number(b.dataset.frame));
      return;
    }
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
  initDrive();
  if (state.cfg.token) {
    try {
      await connect();
      return;
    } catch (err) {
      toast(`自動連線失敗：${err.message}`, true, 6000);
    }
  }
  openSettings('館員專用：請貼上你的 GitHub 權杖。');
}

init();
