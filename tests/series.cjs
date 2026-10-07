// 端對端測試（以 Playwright 模擬 GitHub 與 Google API，不會碰到真實帳號）
// 執行：在專案根目錄先啟動 `python3 -m http.server 8765`，再執行 `node tests/series.cjs`
const path = require('path');
const ROOT = path.resolve(__dirname, '..') + '/';
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
let ok = 0, fail = 0;
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  → ' + x : '')); };
const mk = (id, date, title, series) => ({ id, date, title, content: '', tags: ['花絮'], media: [], cover: 0, ...(series ? { series } : {}) });
const data = { version: 1, moments: [
  mk('a', '2026-09-22', '得知去約會', '東京燒鳥約會'),
  mk('b', '2026-09-24', '照片發出來了', '東京燒鳥約會'),
  mk('c', '2026-10-02', '後續花絮', '東京燒鳥約會'),
  mk('d', '2026-10-01', '別的系列', '其他系列'),
  mk('e', '2026-10-03', '沒有系列'),
  ...Array.from({ length: 12 }, (_, i) => mk('x' + i, '2025-0' + ((i % 9) + 1) + '-15', '測試' + i, '很長的系列名稱第' + i + '號')),
] };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  let saved = JSON.stringify(data);
  await ctx.route('**/data/moments.json*', (r) => r.fulfill({ contentType: 'application/json', body: saved }));
  await ctx.route(/fonts\.|drive\.google|googleusercontent/, (r) => r.fulfill({ status: 404 }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8765/?' + Date.now()); await p.waitForTimeout(800);
  check('本月便利貼有系列標記', (await p.locator('.note .series-chip').count()) === 2, String(await p.locator('.note .series-chip').count()));
  await p.click('.note:has-text("後續花絮")'); await p.waitForTimeout(300);
  const items = await p.$$eval('#detail-series .series-list li', (ls) => ls.map((l) => l.textContent.replace(/\s+/g, ' ').trim()));
  check('系列清單 3 則、依日期排序', items.length === 3 && items[0].includes('2026.09.22') && items[2].includes('閱讀中'), items.join(' | '));
  check('最新一則沒有下一則', (await p.textContent('#detail-series .series-nav.next')).includes('最新一則'));
  check('不同系列不混入', !(await p.textContent('#detail-series')).includes('別的系列'));
  await p.click('#detail-series .series-nav.prev'); await p.waitForTimeout(300);
  check('上一則跨月份打開 9/24', (await p.textContent('#detail-title')) === '照片發出來了' && (await p.textContent('.period-caption')).startsWith('2026 年 9 月'), await p.textContent('#detail-title'));
  await p.click('#detail-series button.series-item:has-text("得知去約會")'); await p.waitForTimeout(300);
  check('點清單打開 9/22', (await p.textContent('#detail-title')) === '得知去約會');
  check('第一則沒有上一則', (await p.textContent('#detail-series .series-nav.prev')).includes('第一則'));
  await p.keyboard.press('Escape');
  await p.click('.note:has-text("沒有系列")').catch(() => {});
  await p.goto('http://localhost:8765/#m=e'); await p.waitForTimeout(800);
  check('沒有系列時不顯示', await p.isHidden('#detail-series'));
  await p.keyboard.press('Escape');
  await p.fill('#search', '燒鳥'); await p.waitForTimeout(400);
  check('搜尋可找到系列名稱', (await p.locator('.note').count()) === 3);
  // 系列篩選列
  await p.fill('#search', ''); await p.waitForTimeout(300);
  await p.goto('http://localhost:8765/?' + Date.now()); await p.waitForTimeout(800);
  check('系列列預設收合', await p.isVisible('#series-toggle') && !(await p.isVisible('#series-panel')) && (await p.textContent('#series-toggle')).includes('14'));
  await p.click('#series-toggle'); await p.waitForTimeout(200);
  check('點開後列出全部系列', await p.isVisible('#series-panel') && (await p.locator('#series-filter [data-series]').count()) === 15);
  check('系列多時有搜尋框', await p.isVisible('#series-search'));
  await p.fill('#series-search', '燒鳥'); await p.waitForTimeout(200);
  check('搜尋系列名稱', (await p.locator('#series-filter [data-series]').count()) === 2);
  await p.click('#series-filter [data-series="東京燒鳥約會"]'); await p.waitForTimeout(400);
  check('選好系列後收合並顯示目前系列', !(await p.isVisible('#series-panel')) && (await p.textContent('#series-current')).includes('東京燒鳥約會'));
  check('選系列顯示整個系列（跨月份）', (await p.locator('.note').count()) === 3 && (await p.textContent('.period-caption')).includes('系列「東京燒鳥約會」'), await p.textContent('.period-caption'));
  check('系列檢視時年月不顯示選取', (await p.locator('#years [aria-pressed="true"], #months [aria-pressed="true"]').count()) === 0);
  await p.click('#months [data-month="2026-10"]'); await p.waitForTimeout(300);
  check('選月份會離開系列檢視', (await p.textContent('.period-caption')).startsWith('2026 年 10 月') && (await p.getAttribute('#series-filter [data-series=""]', 'aria-pressed')) === 'true');
  const m = await b.newPage({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
  await m.route('**/data/moments.json*', (r) => r.fulfill({ contentType: 'application/json', body: saved }));
  await m.goto('http://localhost:8765/?' + Date.now()); await m.waitForTimeout(800);
  await m.click('#series-toggle'); await m.waitForTimeout(300);
  const mh = await m.evaluate(() => [document.getElementById('series-panel').getBoundingClientRect().height, document.documentElement.scrollWidth]);
  check('手機展開系列不超出畫面寬度、高度有上限', mh[1] === 375 && mh[0] <= 260, mh.join('/'));
  check('前台沒有 JS 錯誤', errs.length === 0, errs.join('; '));
  console.log(`\n${ok} passed, ${fail} failed`);
  await b.close();
})();
