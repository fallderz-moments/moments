import {
  NOTE_TINTS, PRESET_TAGS, escapeHtml, richText, formatDate, parseDate, monthKey, monthRange, hashString, hostOf,
  sortMoments, sortTags, momentCover, mediaCounts, isBirthday, driveImage, driveImageFallback, todayStr, onNewDay,
  fetchMoments, storageGet, storageSet,
} from './common.js?v=202610031428';

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

/* ---------- 共用片段 ---------- */
const callNo = (m) => `No. ${m.date.replace(/-/g, '')}`;

function excerpt(text = '', max = 42) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function tagsHtml(tags = []) {
  if (!tags.length) return '';
  return `<span class="note-tags">${sortTags(tags).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</span>`;
}

function mediaSummary(media = []) {
  const { photos, videos, others } = mediaCounts(media);
  return [photos && `📷 ${photos}`, videos && `🎬 ${videos}`, others && `🔗 ${others}`].filter(Boolean).join('　');
}

function mediaIcon(type) {
  return { image: '📷', video: '🎬', drive: '☁️', youtube: '▶️', x: '𝕏', instagram: '📸', link: '🔗' }[type] || '📎';
}

/* ---------- 渲染：便利貼 / 列表 ---------- */
function noteHtml(m, index) {
  const h = hashString(m.id);
  const tilt = ((h % 7) - 3) * 0.6;
  const tint = NOTE_TINTS[h % NOTE_TINTS.length];
  const { weekday } = parseDate(m.date);
  const bday = isBirthday(m.date);
  const cover = momentCover(m);
  const count = (m.media || []).length;
  let thumb;
  if (cover.url) {
    thumb = `<img src="${escapeHtml(cover.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'placeholder',textContent:'🖼'}))">`;
  } else if (cover.item?.type === 'video' && cover.item.src) {
    // 影片沒有縮圖時，直接顯示影片的第一個畫面
    thumb = `<video src="${escapeHtml(cover.item.src)}#t=0.5" muted playsinline preload="metadata" tabindex="-1"></video><span class="badge play">▶</span>`;
  } else {
    thumb = `<span class="placeholder"><span>${cover.item ? mediaIcon(cover.item.type) + ' ' : ''}${escapeHtml(excerpt(m.content) || m.title || '無標題')}</span></span>`;
  }
  return `
    <button class="note${bday ? ' birthday' : ''}" type="button" data-index="${index}" data-tint="${tint}" style="--tilt:${tilt}deg">
      ${bday ? `<span class="bday-ribbon">HAPPY BIRTHDAY</span>
        <img class="sprite bday-sprite" src="assets/pixel/${h % 2 ? 'dog' : 'chipmunk'}-party.svg" alt="">` : ''}
      <span class="note-date"><strong>${formatDate(m.date)}</strong><span>週${weekday}</span></span>
      <span class="note-thumb">${thumb}${count > 1 ? `<span class="badge">${mediaSummary(m.media)}</span>` : ''}</span>
      <span class="note-title">${bday ? '🎂 ' : ''}${escapeHtml(m.title || '無標題')}</span>
      ${tagsHtml(m.tags)}
      <span class="call-number">${callNo(m)}</span>
    </button>`;
}

function ledgerHtml(m, index) {
  const { y, m: mon, d, weekday } = parseDate(m.date);
  const bday = isBirthday(m.date);
  return `
    <li>
      <button class="ledger-row${bday ? ' birthday' : ''}" type="button" data-index="${index}">
        <span class="ledger-date"><strong>${y}.${String(mon).padStart(2, '0')}.${String(d).padStart(2, '0')}</strong><span>週${weekday}</span>
          ${bday ? '<span class="bday-mark"><img class="sprite" src="assets/pixel/cake.svg" alt="">BIRTHDAY</span>' : ''}</span>
        <span class="ledger-title"><b>${escapeHtml(m.title || '無標題')}</b><span>${escapeHtml(excerpt(m.content, 80))}</span></span>
        <span class="ledger-tags">${sortTags(m.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</span>
        <span class="ledger-media">${mediaSummary(m.media)}</span>
      </button>
    </li>`;
}

function render() {
  state.visible = filtered();
  const main = $('#content');
  if (!state.visible.length) {
    main.innerHTML = `<p class="status"><img class="sprite" src="assets/pixel/${state.all.length ? 'chipmunk' : 'dog'}.svg" alt="">
      ${state.all.length ? '找不到符合條件的館藏' : '還沒有任何紀錄，到館員後台新增第一則吧！'}</p>`;
  } else {
    let index = 0;
    const html = [];
    for (const [key, items] of groupByMonth(state.visible)) {
      const [y, mo] = key.split('-');
      const inner = items.map((m) => (state.view === 'notes' ? noteHtml(m, index++) : ledgerHtml(m, index++))).join('');
      const body = state.view === 'notes'
        ? `<div class="notes">${inner}</div>`
        : `<div class="ledger"><div class="ledger-head" aria-hidden="true"><span>DATE</span><span>TITLE</span><span>CATEGORY</span><span style="text-align:right">MEDIA</span></div><ol>${inner}</ol></div>`;
      html.push(`
        <section class="month-section" id="sec-${key}">
          <h2 class="month-heading"><span class="drawer-label"><b>${y}</b><span>${Number(mo)} 月</span></span><small>${items.length} 則</small></h2>
          ${body}
        </section>`);
    }
    main.innerHTML = html.join('');
  }
  renderTimeline();
  syncButtons();
}

/* ---------- 分類篩選（預設分類永遠顯示） ---------- */
function renderTags() {
  const counts = new Map(PRESET_TAGS.map((t) => [t, 0]));
  for (const m of state.all) for (const t of m.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  const tags = sortTags([...counts.keys()]);
  $('#tag-filter').innerHTML = [`<button type="button" data-tag="" aria-pressed="${!state.tag}">全部<span class="count">${state.all.length}</span></button>`]
    .concat(tags.map((t) => {
      const c = counts.get(t);
      return `<button type="button" data-tag="${escapeHtml(t)}" class="${c ? '' : 'empty'}" aria-pressed="${state.tag === t}">${escapeHtml(t)}<span class="count">${c}</span></button>`;
    }))
    .join('');
}

/* ---------- 時間軸導覽（2021.12 至今天，換日自動更新） ---------- */
function renderTimeline() {
  const counts = new Map();
  const bdays = new Set();
  for (const m of state.visible) {
    const k = monthKey(m.date);
    counts.set(k, (counts.get(k) || 0) + 1);
    if (isBirthday(m.date)) bdays.add(k);
  }
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
    const cls = [n && 'has', bdays.has(k) && 'bday'].filter(Boolean).join(' ');
    return `<button type="button" data-month="${k}" class="${cls}" ${n ? '' : 'disabled'}>${bdays.has(k) ? '🎂' : ''}${Number(k.slice(5))}月<small>${n ? `${n} 則` : '—'}</small></button>`;
  }).join('');
  $('#today').textContent = formatDate(todayStr());
}

function syncButtons() {
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === state.view));
  document.querySelectorAll('[data-sort]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.sort === state.sort));
}

/* ---------- 詳細內容 ---------- */
function photoHtml(src, fallback, full, link, alt, cls) {
  return `<figure class="${cls}"><button class="photo" type="button" data-full="${escapeHtml(full)}" data-link="${escapeHtml(link || '')}">
    <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" referrerpolicy="no-referrer"${fallback ? ` onerror="this.onerror=null;this.src='${escapeHtml(fallback)}'"` : ''}>
  </button>${alt ? `<figcaption>${escapeHtml(alt)}</figcaption>` : ''}</figure>`;
}

function mediaHtml(item, single) {
  const cap = item.caption ? `<figcaption>${escapeHtml(item.caption)}</figcaption>` : '';
  const src = escapeHtml(item.src || '');
  const photoCls = single ? 'single' : '';
  switch (item.type) {
    case 'image':
      return photoHtml(item.src, null, item.src, null, item.caption || '', photoCls);
    case 'video':
      return `<figure class="wide"><video src="${src}" controls playsinline preload="metadata"></video>${cap}</figure>`;
    case 'drive':
      if (item.kind !== 'video') {
        return photoHtml(driveImage(item.id, single ? 2000 : 1000), driveImageFallback(item.id, 1000),
          driveImage(item.id, 2400), `https://drive.google.com/file/d/${item.id}/view`, item.caption || '', photoCls);
      }
      return `<figure class="wide"><div class="embed"><iframe src="https://drive.google.com/file/d/${item.id}/preview" allow="autoplay; fullscreen" allowfullscreen loading="lazy" title="Google 雲端硬碟影片"></iframe></div>${cap}</figure>`;
    case 'youtube':
      return `<figure class="wide"><div class="embed"><iframe src="https://www.youtube-nocookie.com/embed/${item.id}" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen loading="lazy" title="YouTube"></iframe></div>${cap}</figure>`;
    case 'instagram':
      return `<figure class="wide"><div class="embed tall"><iframe src="https://www.instagram.com/${item.id}/embed" loading="lazy" title="Instagram"></iframe></div>${cap}</figure>`;
    case 'x':
      return `<figure class="wide"><div class="tweet-box" data-tweet="${item.id}"><a class="link-card" href="${src}" target="_blank" rel="noopener"><span class="ico">𝕏</span>在 X 上查看貼文</a></div>${cap}</figure>`;
    default:
      return `<figure class="wide"><a class="link-card" href="${src}" target="_blank" rel="noopener"><span class="ico">🔗</span><span>${escapeHtml(item.caption || hostOf(item.src))}<br><small>${escapeHtml(hostOf(item.src))}</small></span></a></figure>`;
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
  const bday = isBirthday(m.date);
  const dlg = $('#detail');
  dlg.classList.toggle('birthday', bday);
  $('#detail-birthday').hidden = !bday;
  $('#detail-date').textContent = `${formatDate(m.date)}（週${weekday}）`;
  $('#detail-callno').textContent = callNo(m);
  $('#detail-title').textContent = m.title || '無標題';
  $('#detail-tags').innerHTML = sortTags(m.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const media = m.media || [];
  const mediaBox = $('#detail-media');
  mediaBox.innerHTML = media.map((item) => mediaHtml(item, media.length === 1)).join('');
  mediaBox.hidden = !media.length;
  loadTweets(mediaBox);
  $('#detail-text').innerHTML = richText(m.content || '');
  const source = $('#detail-source');
  source.hidden = !m.source;
  if (m.source) {
    source.innerHTML = `📎 資訊來源：<a href="${escapeHtml(m.source)}" target="_blank" rel="noopener">${escapeHtml(hostOf(m.source))}</a>`;
  }
  $('[data-nav="prev"]').disabled = index <= 0;
  $('[data-nav="next"]').disabled = index >= state.visible.length - 1;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  history.replaceState(null, '', `#m=${encodeURIComponent(m.id)}`);
}

function closeDetail() {
  $('#detail-media').innerHTML = ''; // 停止播放中的影片
  if ($('#detail').open) $('#detail').close();
  history.replaceState(null, '', location.pathname + location.search);
}

function openLightbox(full, link) {
  $('#lightbox-img').src = full;
  const a = $('#lightbox-link');
  a.hidden = !link;
  if (link) a.href = link;
  $('#lightbox').showModal();
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
    else if (t.dataset.full) { openLightbox(t.dataset.full, t.dataset.link); }
    else if (t.dataset.index && !t.closest('dialog')) { openDetail(Number(t.dataset.index)); }
    else if (t.dataset.nav) { openDetail(state.current + (t.dataset.nav === 'next' ? 1 : -1)); }
    else if ('close' in t.dataset) { closeDetail(); }
    else if ('closeLightbox' in t.dataset) { $('#lightbox').close(); }
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
  const lb = $('#lightbox');
  lb.addEventListener('click', (e) => { if (e.target === lb) lb.close(); });
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
  $('#today').textContent = formatDate(todayStr());
  onNewDay(() => renderTimeline());
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
