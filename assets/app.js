import {
  NOTE_TINTS, escapeHtml, richText, formatDate, parseDate, monthKey, monthRange, hashString,
  sortMoments, momentCover, fetchMoments, storageGet, storageSet, MEDIA_LABELS,
} from './common.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  all: [],
  view: storageGet('fm.view', 'notes'),
  sort: storageGet('fm.sort', 'desc'),
  tag: null,
  q: '',
  year: null,
  visible: [],
  current: -1,
};

/* ---------- 篩選 ---------- */
function filtered() {
  const q = state.q.trim().toLowerCase();
  const list = state.all.filter((m) => {
    if (state.tag && !(m.tags || []).includes(state.tag)) return false;
    if (!q) return true;
    return [m.title, m.content, ...(m.tags || []), m.date].join(' ').toLowerCase().includes(q);
  });
  return sortMoments(list, state.sort);
}

function groupByMonth(list) {
  const groups = new Map();
  for (const m of list) {
    const key = monthKey(m.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  return groups;
}

/* ---------- 渲染：便利貼 / 列表 ---------- */
function noteHtml(m, index) {
  const h = hashString(m.id);
  const tilt = ((h % 7) - 3) * 0.6;
  const tint = NOTE_TINTS[h % NOTE_TINTS.length];
  const { d, weekday } = parseDate(m.date);
  const cover = momentCover(m);
  const count = (m.media || []).length;
  const thumb = cover.url
    ? `<img src="${escapeHtml(cover.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'placeholder',textContent:'🖼'}))">`
    : `<span class="placeholder">${cover.item ? mediaIcon(cover.item.type) + ' ' : ''}${escapeHtml(excerpt(m.content) || m.title || '無標題')}</span>`;
  return `
    <button class="note" type="button" data-index="${index}" data-tint="${tint}" style="--tilt:${tilt}deg">
      <span class="note-date"><strong>${formatDate(m.date)}</strong><span>週${weekday}</span></span>
      <span class="note-thumb">${thumb}${count > 1 ? `<span class="badge">${count} 則媒體</span>` : ''}</span>
      <span class="note-title">${escapeHtml(m.title || `${d} 日的片段`)}</span>
      ${tagsHtml(m.tags)}
    </button>`;
}

function listHtml(m, index) {
  const { y, m: mon, d, weekday } = parseDate(m.date);
  const media = m.media || [];
  const summary = media.length
    ? [...new Set(media.map((x) => mediaIcon(x.type)))].join(' ') + ` ${media.length}`
    : '';
  return `
    <li class="list-item">
      <button type="button" data-index="${index}">
        <span class="list-date"><strong>${d}</strong><span>${y}/${mon}<br>週${weekday}</span></span>
        <span class="list-body">
          <span class="list-title">${escapeHtml(m.title || '無標題')}</span>
          <span class="list-excerpt">${escapeHtml((m.content || '').replace(/\s+/g, ' '))}</span>
          ${tagsHtml(m.tags)}
        </span>
        <span class="list-media">${summary}</span>
      </button>
    </li>`;
}

function excerpt(text = '', max = 42) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function tagsHtml(tags = []) {
  if (!tags.length) return '';
  return `<span class="note-tags">${tags.map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</span>`;
}

function mediaIcon(type) {
  return { image: '📷', video: '🎬', drive: '☁️', youtube: '▶️', x: '𝕏', instagram: '📸', link: '🔗' }[type] || '📎';
}

function render() {
  state.visible = filtered();
  const main = $('#content');
  if (!state.visible.length) {
    main.innerHTML = `<p class="status">${state.all.length ? '找不到符合條件的片段' : '還沒有任何片段，到後台新增第一則吧！'}</p>`;
  } else {
    let index = 0;
    const html = [];
    for (const [key, items] of groupByMonth(state.visible)) {
      const [y, mo] = key.split('-');
      const inner = items.map((m) => (state.view === 'notes' ? noteHtml(m, index++) : listHtml(m, index++))).join('');
      html.push(`
        <section class="month-section" id="sec-${key}">
          <h2 class="month-heading">${y} 年 ${Number(mo)} 月 <small>${items.length} 則</small></h2>
          ${state.view === 'notes' ? `<div class="notes">${inner}</div>` : `<ol class="list">${inner}</ol>`}
        </section>`);
    }
    main.innerHTML = html.join('');
  }
  renderTimeline();
  syncButtons();
}

/* ---------- 標籤篩選 ---------- */
function renderTags() {
  const counts = new Map();
  for (const m of state.all) for (const t of m.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'));
  const box = $('#tag-filter');
  box.hidden = !tags.length;
  box.innerHTML = [`<button type="button" data-tag="" aria-pressed="${!state.tag}">全部<span class="count">${state.all.length}</span></button>`]
    .concat(tags.map(([t, c]) =>
      `<button type="button" data-tag="${escapeHtml(t)}" aria-pressed="${state.tag === t}">#${escapeHtml(t)}<span class="count">${c}</span></button>`))
    .join('');
}

/* ---------- 時間軸導覽（2021.12 至今） ---------- */
function renderTimeline() {
  const counts = new Map();
  for (const m of state.visible) counts.set(monthKey(m.date), (counts.get(monthKey(m.date)) || 0) + 1);
  const months = monthRange();
  const years = [...new Set(months.map((k) => k.slice(0, 4)))];
  if (state.sort === 'desc') years.reverse();
  if (!state.year || !years.includes(state.year)) {
    state.year = years.find((y) => [...counts.keys()].some((k) => k.startsWith(y))) || years[0];
  }
  $('#years').innerHTML = years.map((y) => {
    const n = [...counts.entries()].filter(([k]) => k.startsWith(y)).reduce((s, [, c]) => s + c, 0);
    return `<button type="button" data-year="${y}" aria-pressed="${y === state.year}">${y}${n ? ` <small>(${n})</small>` : ''}</button>`;
  }).join('');
  let ym = months.filter((k) => k.startsWith(state.year));
  if (state.sort === 'desc') ym = ym.reverse();
  $('#months').innerHTML = ym.map((k) => {
    const n = counts.get(k) || 0;
    return `<button type="button" data-month="${k}" class="${n ? 'has' : ''}" ${n ? '' : 'disabled'}>${Number(k.slice(5))}月<small>${n ? `${n} 則` : '—'}</small></button>`;
  }).join('');
  const [first, last] = [months[0], months[months.length - 1]].map((k) => k.replace('-', '.'));
  $('#range-text').textContent = `${first} — ${last}`;
}

function syncButtons() {
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === state.view));
  document.querySelectorAll('[data-sort]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.sort === state.sort));
}

/* ---------- 詳細內容 ---------- */
function mediaHtml(item) {
  const cap = item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : '';
  const src = escapeHtml(item.src || '');
  switch (item.type) {
    case 'image':
      return `<figure><img src="${src}" alt="${escapeHtml(item.caption || '')}" loading="lazy" referrerpolicy="no-referrer">${cap}</figure>`;
    case 'video':
      return `<figure><video src="${src}" controls playsinline preload="metadata"${item.thumb ? ` poster="${escapeHtml(item.thumb)}"` : ''}></video>${cap}</figure>`;
    case 'drive':
      if (item.kind === 'image') {
        return `<figure><img src="https://drive.google.com/thumbnail?id=${item.id}&sz=w2000" alt="${escapeHtml(item.caption || '')}" loading="lazy" referrerpolicy="no-referrer">${cap}</figure>`;
      }
      return `<figure><div class="embed"><iframe src="https://drive.google.com/file/d/${item.id}/preview" allow="autoplay; fullscreen" allowfullscreen loading="lazy" title="Google 雲端硬碟"></iframe></div>${cap}</figure>`;
    case 'youtube':
      return `<figure><div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/${item.id}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy" title="YouTube"></iframe></div>${cap}</figure>`;
    case 'instagram':
      return `<figure><div class="embed tall"><iframe src="https://www.instagram.com/${item.id}/embed" loading="lazy" title="Instagram"></iframe></div>${cap}</figure>`;
    case 'x':
      return `<figure><div class="tweet-box" data-tweet="${item.id}"><a class="link-card" href="${src}" target="_blank" rel="noopener"><span class="ico">𝕏</span>在 X 上查看貼文</a></div>${cap}</figure>`;
    default: {
      let host = item.src;
      try { host = new URL(item.src).hostname; } catch { /* 保留原字串 */ }
      return `<figure><a class="link-card" href="${src}" target="_blank" rel="noopener"><span class="ico">🔗</span><span>${escapeHtml(item.caption || host)}<br><small>${escapeHtml(MEDIA_LABELS.link)} · ${escapeHtml(host)}</small></span></a></figure>`;
    }
  }
}

let twitterLoader;
function loadTweets(container) {
  const boxes = container.querySelectorAll('[data-tweet]');
  if (!boxes.length) return;
  twitterLoader ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://platform.twitter.com/widgets.js';
    s.async = true;
    s.onload = () => resolve(window.twttr);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  twitterLoader.then((twttr) => twttr.ready(() => {
    boxes.forEach((box) => {
      twttr.widgets.createTweet(box.dataset.tweet, box, { lang: 'zh-tw', align: 'center', dnt: true })
        .then((el) => { if (el) box.querySelector('.link-card')?.remove(); });
    });
  })).catch(() => { /* 載入失敗時保留連結卡片 */ });
}

function openDetail(index) {
  const m = state.visible[index];
  if (!m) return;
  state.current = index;
  const { weekday } = parseDate(m.date);
  $('#detail-date').textContent = `${formatDate(m.date)}（週${weekday}）`;
  $('#detail-title').textContent = m.title || '無標題';
  $('#detail-tags').innerHTML = (m.tags || []).map((t) => `<span class="tag">#${escapeHtml(t)}</span>`).join('');
  const mediaBox = $('#detail-media');
  mediaBox.innerHTML = (m.media || []).map(mediaHtml).join('');
  mediaBox.hidden = !(m.media || []).length;
  loadTweets(mediaBox);
  $('#detail-text').innerHTML = richText(m.content || '');
  $('[data-nav="prev"]').disabled = index <= 0;
  $('[data-nav="next"]').disabled = index >= state.visible.length - 1;
  const dlg = $('#detail');
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  history.replaceState(null, '', `#m=${encodeURIComponent(m.id)}`);
}

function closeDetail() {
  const dlg = $('#detail');
  // 停止播放中的影片
  $('#detail-media').innerHTML = '';
  if (dlg.open) dlg.close();
  history.replaceState(null, '', location.pathname + location.search);
}

/* ---------- 事件 ---------- */
function bindEvents() {
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.view) { state.view = t.dataset.view; storageSet('fm.view', state.view); render(); }
    else if (t.dataset.sort) { state.sort = t.dataset.sort; storageSet('fm.sort', state.sort); render(); }
    else if ('tag' in t.dataset) { state.tag = t.dataset.tag || null; renderTags(); render(); }
    else if (t.dataset.year) { state.year = t.dataset.year; renderTimeline(); }
    else if (t.dataset.month) { document.getElementById(`sec-${t.dataset.month}`)?.scrollIntoView(); }
    else if (t.dataset.index && !t.closest('dialog')) { openDetail(Number(t.dataset.index)); }
    else if (t.dataset.nav) { openDetail(state.current + (t.dataset.nav === 'next' ? 1 : -1)); }
    else if ('close' in t.dataset) { closeDetail(); }
  });

  let timer;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = e.target.value; render(); }, 150);
  });

  const dlg = $('#detail');
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeDetail(); });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDetail(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, video')) return;
    if (e.key === 'ArrowRight' && state.current < state.visible.length - 1) openDetail(state.current + 1);
    if (e.key === 'ArrowLeft' && state.current > 0) openDetail(state.current - 1);
  });
}

function openFromHash() {
  const match = location.hash.match(/^#m=(.+)$/);
  if (!match) return;
  const id = decodeURIComponent(match[1]);
  const index = state.visible.findIndex((m) => m.id === id);
  if (index >= 0) openDetail(index);
}

async function init() {
  bindEvents();
  try {
    state.all = await fetchMoments();
  } catch (err) {
    $('#content').innerHTML = `<p class="status">${escapeHtml(err.message)}</p>`;
    return;
  }
  renderTags();
  render();
  openFromHash();
}

init();
