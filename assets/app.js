import {
  NOTE_TINTS, PRESET_TAGS, escapeHtml, richText, formatDate, parseDate, monthKey, monthRange, hashString, hostOf, sticker, STICKERS,
  sortMoments, sortTags, momentCover, mediaCounts, isBirthday, driveImage, driveImageFallback, todayStr, onNewDay,
  fetchMoments, storageGet, storageSet,
} from './common.js?v=202610031806';

const $ = (sel) => document.querySelector(sel);

const state = {
  all: [],
  view: storageGet('fm.view', 'notes'),
  sort: storageGet('fm.sort', 'desc'),
  tag: null,
  q: '',
  // 目前瀏覽的期間：預設為「本月」；year 為 'all' 時顯示全部
  year: todayStr().slice(0, 4),
  month: monthKey(todayStr()),
  periodPicked: false,
  visible: [],
  current: -1,
};

/* ---------- 篩選 ---------- */
function byTag(list) {
  return state.tag ? list.filter((m) => (m.tags || []).includes(state.tag)) : list;
}

function inPeriod(m) {
  if (state.year === 'all') return true;
  if (state.month) return monthKey(m.date) === state.month;
  return m.date.startsWith(state.year);
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  const list = byTag(state.all).filter((m) => {
    // 有輸入搜尋時搜尋全部時間；否則只顯示選擇的年份／月份
    if (!q) return inPeriod(m);
    return [m.title, m.content, m.series, ...(m.tags || []), m.date].join(' ').toLowerCase().includes(q);
  });
  return sortMoments(list, state.sort);
}

function periodLabel() {
  if (state.year === 'all') return '全部時間';
  if (state.month) return `${state.month.slice(0, 4)} 年 ${Number(state.month.slice(5))} 月`;
  return `${state.year} 年`;
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
  const coverIsVideo = cover.item && (cover.item.type === 'video' || (cover.item.type === 'drive' && cover.item.kind === 'video'));
  if (cover.url) {
    thumb = `<img src="${escapeHtml(cover.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'placeholder',textContent:'${coverIsVideo ? '🎬' : '🖼'}'}))">${coverIsVideo ? '<span class="badge play">▶</span>' : ''}`;
  } else if (cover.item?.type === 'video' && cover.item.src) {
    // 影片沒有縮圖時，直接顯示影片的第一個畫面
    thumb = `<video src="${escapeHtml(cover.item.src)}#t=0.5" muted playsinline preload="metadata" tabindex="-1"></video><span class="badge play">▶</span>`;
  } else {
    thumb = `<span class="placeholder"><span>${cover.item ? mediaIcon(cover.item.type) + ' ' : ''}${escapeHtml(excerpt(m.content) || m.title || '無標題')}</span></span>`;
  }
  return `
    <button class="note${bday ? ' birthday' : ''}" type="button" data-index="${index}" data-tint="${tint}" style="--tilt:${tilt}deg">
      ${bday ? `<span class="bday-ribbon">HAPPY BIRTHDAY</span>
        <img class="sprite bday-sprite" src="assets/pixel/${m.date.endsWith('09-01') ? 'dog' : 'chipmunk'}-party.svg" alt="">` : ''}
      <span class="note-date"><strong>${formatDate(m.date)}</strong><span>週${weekday}</span></span>
      <span class="note-thumb">${thumb}${count > 1 ? `<span class="badge">${mediaSummary(m.media)}</span>` : ''}</span>
      <span class="note-title">${bday ? '🎂 ' : ''}${escapeHtml(m.title || '無標題')}</span>
      ${m.series ? `<span class="series-chip">📚 ${escapeHtml(m.series)}</span>` : ''}
      ${tagsHtml(m.tags)}
      <span class="call-number">${callNo(m)}</span>
      ${bday ? '' : `<img class="sticker note-sticker ${h % 3 === 0 ? 'left' : ''}" src="${sticker(m.id)}" alt="" loading="lazy">`}
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
        <span class="ledger-title"><b>${escapeHtml(m.title || '無標題')}</b>${m.series ? `<span class="series-chip">📚 ${escapeHtml(m.series)}</span>` : ''}<span>${escapeHtml(excerpt(m.content, 80))}</span></span>
        <span class="ledger-tags">${sortTags(m.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</span>
        <span class="ledger-media">${mediaSummary(m.media)}<img class="sticker ledger-sticker" src="${sticker(m.id)}" alt="" loading="lazy"></span>
      </button>
    </li>`;
}

function render() {
  state.visible = filtered();
  const main = $('#content');
  const searching = state.q.trim();
  if (!state.visible.length) {
    const latest = sortMoments(byTag(state.all), 'desc')[0];
    const hint = searching
      ? '找不到符合的館藏'
      : state.all.length ? `${periodLabel()}還沒有紀錄` : '還沒有任何紀錄，到館員後台新增第一則吧！';
    main.innerHTML = `<p class="status"><img class="sticker status-sticker" src="${sticker(periodLabel())}" alt="">
      ${escapeHtml(hint)}
      ${!searching && latest ? `<button class="btn small" type="button" data-goto="${monthKey(latest.date)}">看最近一則紀錄（${formatDate(latest.date)}）</button>` : ''}</p>`;
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
          <h2 class="month-heading"><span class="drawer-label"><b>${y}</b><span>${Number(mo)} 月</span></span><small>${items.length} 則</small><img class="sticker heading-sticker" src="${sticker(key, 'month')}" alt="" loading="lazy"></h2>
          ${body}
        </section>`);
    }
    const caption = searching
      ? `<p class="period-caption">「${escapeHtml(searching)}」的搜尋結果（全部時間）· ${state.visible.length} 則</p>`
      : `<p class="period-caption">${periodLabel()} · ${state.visible.length} 則</p>`;
    main.innerHTML = caption + html.join('');
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
  for (const m of byTag(state.all)) {
    const k = monthKey(m.date);
    counts.set(k, (counts.get(k) || 0) + 1);
    if (isBirthday(m.date)) bdays.add(k);
  }
  const months = monthRange();
  const years = [...new Set(months.map((k) => k.slice(0, 4)))];
  if (state.sort === 'desc') years.reverse();
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const yearOnly = state.year !== 'all' && !state.month;
  $('#years').innerHTML = `<button type="button" data-year="all" aria-pressed="${state.year === 'all'}">全部 <small>(${total})</small></button>` +
    years.map((y) => {
      const n = [...counts.entries()].filter(([k]) => k.startsWith(y)).reduce((sum, [, c]) => sum + c, 0);
      const pressed = state.year === y;
      return `<button type="button" data-year="${y}" aria-pressed="${pressed}" class="${pressed && yearOnly ? 'whole' : ''}">${y}${n ? ` <small>(${n})</small>` : ''}</button>`;
    }).join('');
  const monthsBox = $('#months');
  monthsBox.hidden = state.year === 'all';
  let ym = months.filter((k) => k.startsWith(state.year));
  if (state.sort === 'desc') ym = ym.reverse();
  monthsBox.innerHTML = ym.map((k) => {
    const n = counts.get(k) || 0;
    const cls = [n && 'has', bdays.has(k) && 'bday'].filter(Boolean).join(' ');
    return `<button type="button" data-month="${k}" class="${cls}" aria-pressed="${state.month === k}">${bdays.has(k) ? '🎂' : ''}${Number(k.slice(5))}月<small>${n ? `${n} 則` : '—'}</small></button>`;
  }).join('');
  $('#today').textContent = formatDate(todayStr());
}

function setPeriod(year, month = null) {
  state.year = year;
  state.month = month;
  state.periodPicked = true;
  render();
  document.querySelector('.toolbar')?.scrollIntoView({ block: 'start' });
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
  const ds = $('#detail-sticker');
  ds.hidden = bday;
  ds.src = sticker(m.id, 'detail');
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
  renderSeries(m);
  $('[data-nav="prev"]').disabled = index <= 0;
  $('[data-nav="next"]').disabled = index >= state.visible.length - 1;
  if (!dlg.open) dlg.showModal();
  dlg.scrollTop = 0;
  history.replaceState(null, '', `#m=${encodeURIComponent(m.id)}`);
}

/** 詳細內容底部：同系列的所有紀錄（依日期排序）與上一則／下一則 */
function renderSeries(m) {
  const box = $('#detail-series');
  const items = m.series ? sortMoments(state.all.filter((x) => x.series === m.series), 'asc') : [];
  box.hidden = items.length === 0;
  if (!items.length) { box.innerHTML = ''; return; }
  const i = items.indexOf(m);
  const prev = items[i - 1], next = items[i + 1];
  const navBtn = (x, label, cls) => (x
    ? `<button type="button" class="series-nav ${cls}" data-goto-id="${escapeHtml(x.id)}"><small>${label}</small><span>${formatDate(x.date)}　${escapeHtml(x.title || '無標題')}</span></button>`
    : `<span class="series-nav ${cls} empty"><small>${label}</small><span>${cls === 'prev' ? '這是系列的第一則' : '這是系列的最新一則'}</span></span>`);
  box.innerHTML = `
    <h3>📚 本系列：${escapeHtml(m.series)} <small>共 ${items.length} 則 · 第 ${i + 1} 則</small></h3>
    <div class="series-pager">${navBtn(prev, '‹ 上一則', 'prev')}${navBtn(next, '下一則 ›', 'next')}</div>
    <ol class="series-list">${items.map((x) => `
      <li${x === m ? ' aria-current="true"' : ''}>${x === m
        ? `<span class="series-item"><span class="d">${formatDate(x.date)}</span><span class="t">${escapeHtml(x.title || '無標題')}</span><span class="here">閱讀中</span></span>`
        : `<button type="button" class="series-item" data-goto-id="${escapeHtml(x.id)}"><span class="d">${formatDate(x.date)}</span><span class="t">${escapeHtml(x.title || '無標題')}</span></button>`}</li>`).join('')}
    </ol>`;
}

/** 依 id 打開紀錄；不在目前期間時切換到該紀錄所在的月份 */
function openById(id) {
  const target = state.all.find((m) => m.id === id);
  if (!target) return;
  if (!state.visible.includes(target)) {
    state.tag = null;
    state.q = '';
    $('#search').value = '';
    state.year = target.date.slice(0, 4);
    state.month = monthKey(target.date);
    state.periodPicked = true;
    renderTags();
    render();
  }
  const index = state.visible.indexOf(target);
  if (index >= 0) openDetail(index);
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
    else if (t.dataset.year) { setPeriod(t.dataset.year); }
    else if (t.dataset.month) {
      // 再按一次已選的月份 → 回到整年
      setPeriod(state.year, state.month === t.dataset.month ? null : t.dataset.month);
    }
    else if (t.dataset.goto) { setPeriod(t.dataset.goto.slice(0, 4), t.dataset.goto); }
    else if (t.dataset.gotoId) { openById(t.dataset.gotoId); }
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
  if (match) openById(decodeURIComponent(match[1]));
}

async function init() {
  bindEvents();
  // 頁尾每次造訪隨機換一組狗狗鼠鼠
  const pick = (kind, n) => `assets/stickers/${kind}-${String(1 + Math.floor(Math.random() * n)).padStart(2, '0')}.webp`;
  $('#footer-dog').src = pick('dog', STICKERS.dog);
  $('#footer-chipmunk').src = pick('chipmunk', STICKERS.chipmunk);
  $('#today').textContent = formatDate(todayStr());
  onNewDay((today) => {
    // 沒有手動選過期間時，換月自動切到新的「本月」
    if (!state.periodPicked) { state.year = today.slice(0, 4); state.month = monthKey(today); render(); }
    else renderTimeline();
  });
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
