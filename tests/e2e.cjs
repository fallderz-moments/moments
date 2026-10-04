// 端對端測試（以 Playwright 模擬 GitHub 與 Google API，不會碰到真實帳號）
// 執行：在專案根目錄先啟動 `python3 -m http.server 8765`，再執行 `node tests/e2e.cjs`
const path = require('path');
const ROOT = path.resolve(__dirname, '..') + '/';
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
const SITE = 'https://fallderz-moments.github.io/moments/';
let ok = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? ok++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  → ' + extra : '')); };
(async () => {
  const b = await chromium.launch();
  async function setup({ push = true, scopeOk = true } = {}) {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
    const log = []; const commits = []; const files = { 'data/moments.json': { sha: 's0', content: fs.readFileSync(ROOT + 'data/moments.json', 'utf8') } };
    const json = (r, s, body, h = {}) => r.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Location', ...h }, body: JSON.stringify(body) });
    await ctx.route(SITE + '**', (r) => {
      const rel = new URL(r.request().url()).pathname.replace('/moments/', '') || 'index.html';
      const file = ROOT + decodeURIComponent(rel);
      if (!fs.existsSync(file)) return r.fulfill({ status: 404 });
      const t = { html: 'text/html', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', json: 'application/json', png: 'image/png', mp4: 'video/mp4' };
      r.fulfill({ status: 200, contentType: t[file.split('.').pop()], body: fs.readFileSync(file) });
    });
    await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await ctx.route('https://api.github.com/**', (r) => {
      const req = r.request(); const u = new URL(req.url()).pathname; log.push(req.method() + ' ' + u);
      const m = u.match(/^\/repos\/([^/]+)\/([^/]+)(.*)$/); const path = decodeURIComponent(m[3].replace('/contents/', ''));
      if (path === '') return json(r, 200, { permissions: { push } });
      if (path.startsWith('/branches/')) return json(r, 200, {});
      if (path === '/commits') return json(r, 200, commits);
      if (req.method() === 'GET') { const f = files[path]; return f ? json(r, 200, { sha: f.sha, encoding: 'base64', content: Buffer.from(f.content).toString('base64') }) : json(r, 404, {}); }
      const body = JSON.parse(req.postData()); commits.unshift({ commit: { message: body.message, author: { name: '一支水特', date: new Date().toISOString() } } }); files[path] = { sha: 's' + log.length, content: Buffer.from(body.content, 'base64').toString() }; return json(r, 201, { content: { sha: files[path].sha } });
    });
    await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: `window.google={accounts:{oauth2:{initTokenClient:(c)=>({requestAccessToken:()=>setTimeout(()=>c.callback({access_token:'t',expires_in:3599}),30)}),revoke:()=>{}}}};` }));
    const uploads = [];
    await ctx.route('https://www.googleapis.com/**', (r) => {
      const req = r.request(); const u = new URL(req.url());
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'Location' } });
      if (!scopeOk) return json(r, 403, { error: { message: 'Request had insufficient authentication scopes.' } });
      if (u.pathname.startsWith('/drive/v3/files/') && !u.pathname.endsWith('/permissions')) return json(r, 200, { id: 'F', name: '素材', mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } });
      if (u.pathname === '/upload/drive/v3/files') { uploads.push(JSON.parse(req.postData())); return json(r, 200, {}, { Location: 'https://www.googleapis.com/upload/s/' + uploads.length }); }
      if (u.pathname.startsWith('/upload/s/')) return json(r, 200, { id: 'D' + u.pathname.split('/').pop(), name: 'x', mimeType: 'image/png' });
      return json(r, 200, {});
    });
    await ctx.route('https://drive.google.com/**', (r) => r.fulfill({ status: 404 }));
    await ctx.route('https://i.ytimg.com/**', (r) => r.fulfill({ status: 404 }));
    // 舊格式的提交訊息（沒有 id）也要能對應到紀錄
    const first = JSON.parse(files['data/moments.json'].content).moments[0];
    commits.push({ commit: { message: `新增紀錄 ${first.date} ${first.title}`.trim(), author: { name: '果凍Zero', date: '2026-01-01T00:00:00Z' } } });
    return { ctx, log, commits, files, uploads };
  }

  // A. 共同編輯者首次設定 → 新增紀錄（含照片上傳）
  { const { ctx, log, commits, files, uploads } = await setup();
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
    await p.goto(SITE + 'admin.html'); await p.waitForTimeout(800);
    check('設定視窗自動開啟', await p.isVisible('#settings'));
    check('儲存庫自動帶入（唯讀、收合）', (await p.inputValue('[name=owner]')) === 'fallderz-moments' && !(await p.evaluate(() => document.getElementById('advanced').open)));
    check('程式碼沒有預設資料夾', (await p.inputValue('[name=folder]')) === '');
    await p.fill('[name=token]', 'ghp_test'); await p.fill('[name=clientId]', 'cid.apps.googleusercontent.com');
    await p.fill('[name=folder]', 'https://drive.google.com/drive/folders/1TESTFOLDERxxxxxxxxxxxxxxxx');
    await p.click('#btn-connect'); await p.waitForSelector('#conn.ok', { timeout: 5000 });
    check('API 使用網址判斷的儲存庫', log.some((l) => l.includes('/repos/fallderz-moments/moments')), log[0]);
    check('狀態列不顯示帳號名稱', !(await p.textContent('.admin-bar')).includes('fallderz-moments'));
    await p.waitForTimeout(900);
    await p.click('#btn-new');
    check('後台有 12 個預設分類', (await p.locator('[data-preset]').count()) === 12);
    await p.fill('[name=title]', '測試紀錄'); await p.fill('[name=series]', '  測試   系列 '); await p.click('[data-preset="LIVE"]'); await p.click('[data-preset="X(twitter)"]'); await p.click('[data-preset="其他"]');
    await p.setInputFiles('#file-media', [{ name: 'a.png', mimeType: 'image/png', buffer: Buffer.alloc(100) }, { name: 'b.png', mimeType: 'image/png', buffer: Buffer.alloc(100) }]);
    await p.click('#btn-save');
    await p.waitForFunction(() => document.getElementById('toast').textContent.includes('已儲存'), null, { timeout: 8000 });
    const saved = JSON.parse(files['data/moments.json'].content).moments.find((m) => m.title === '測試紀錄');
    check('提交訊息附上紀錄 id', commits[0].commit.message.endsWith(`[${saved && saved.id}]`), commits[0].commit.message);
    await p.waitForFunction(() => !document.getElementById('editor-history').hidden, null, { timeout: 5000 }).catch(() => {});
    check('後台顯示這則的編輯者', (await p.textContent('#editor-history')).includes('一支水特'), await p.textContent('#editor-history'));
    check('舊提交也能對應到編輯者', (await p.textContent('#admin-list')).includes('✎ 果凍Zero'));
    check('系列欄位已儲存（去除多餘空白）', saved && saved.series === '測試 系列', saved && saved.series);
    check('多張照片上傳到雲端資料夾', uploads.length === 2 && uploads.every((u) => u.parents[0] === '1TESTFOLDERxxxxxxxxxxxxxxxx'));
    check('紀錄已寫入（分類、媒體）', saved && saved.tags.includes('LIVE') && saved.tags.includes('X(twitter)') && saved.tags.includes('其他') && saved.media.length === 2 && saved.media.every((m) => m.type === 'drive'));
    await p.click('#btn-notices'); await p.waitForTimeout(400);
    await p.fill('#notice-form [name=content]', '更新 IVE ON 花絮相關'); await p.click('#btn-notice-save');
    await p.waitForFunction(() => document.getElementById('toast').textContent.includes('公告已發布'), null, { timeout: 5000 }).catch(() => {});
    const notices = files['data/notices.json'] && JSON.parse(files['data/notices.json'].content).notices;
    check('後台發布公告（更新日期＋內容）', notices && notices.length === 1 && notices[0].content === '更新 IVE ON 花絮相關' && notices[0].date === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()), JSON.stringify(notices));
    check('公告列表顯示已發布', (await p.textContent('#notice-list')).includes('IVE ON'));
    await p.click('[data-close-notices]');
    const front = await ctx.newPage();
    await front.route(SITE + 'data/notices.json*', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: files['data/notices.json'].content }));
    await front.goto(SITE); await front.waitForSelector('.notice-pop', { timeout: 5000 }).catch(() => {});
    check('前台進站顯示公告', (await front.textContent('.notice-pop').catch(() => '')).includes('更新 IVE ON 花絮相關'));
    await front.click('.notice-pop > .btn'); await front.reload(); await front.waitForTimeout(1200);
    check('看過的公告不再跳出', (await front.locator('.notice-pop').count()) === 0);
    await front.close();
    check('重新整理後仍保持連線', await (async () => { await p.reload(); await p.waitForTimeout(1200); return p.isVisible('#conn.ok'); })());
    check('後台沒有 JS 錯誤', errs.length === 0, errs.join('; '));
    await ctx.close(); }

  // B. 沒有寫入權限的權杖
  { const { ctx } = await setup({ push: false });
    const p = await ctx.newPage(); await p.goto(SITE + 'admin.html'); await p.waitForTimeout(600);
    await p.fill('[name=token]', 'ghp_x'); await p.click('#btn-connect'); await p.waitForTimeout(800);
    check('無寫入權限時顯示提示', (await p.textContent('#settings-msg')).includes('沒有寫入權限'), await p.textContent('#settings-msg'));
    await ctx.close(); }

  // E. Google 權限沒勾選
  { const { ctx } = await setup({ scopeOk: false });
    const p = await ctx.newPage(); await p.goto(SITE + 'admin.html'); await p.waitForTimeout(600);
    await p.fill('[name=token]', 'ghp_x'); await p.fill('[name=clientId]', 'cid'); await p.fill('[name=folder]', '1TESTFOLDERxxxxxxxxxxxxxxxx'); await p.click('#btn-connect'); await p.waitForSelector('#conn.ok'); await p.waitForTimeout(900);
    await p.click('#btn-drive'); await p.waitForTimeout(800);
    const t = await p.textContent('#toast');
    check('權限不足時提示重新授權', t.includes('權限不足') && !(await p.isVisible('#drive-conn.ok')), t);
    await ctx.close(); }

  // F. 新頁面與導覽
  { const { ctx } = await setup();
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(SITE); await p.waitForTimeout(500);
    check('首頁有 關於／協作者名單 連結', await p.locator('.site-nav a[href="about.html"]').count() === 1 && await p.locator('.site-nav a[href="team.html"]').count() === 1);
    const lib = await p.evaluate(async () => {
      const c = await import('./assets/common.js');
      const names = ['2026-10-04', '2026-09-01', '2026-11-30', '2026-12-01', '2027-02-28', '2027-04-01', '2027-07-01'].map((d) => c.seasonOf(d)?.name || '-');
      const urls = Array.from({ length: 50 }, (_, i) => c.sticker('t' + i, 0, i % 2 ? '2025-09-01' : '2025-05-05'));
      const files = [...c.SEASONS, { name: 'birthday', ...c.BIRTHDAY_STICKERS }, { name: 'daily', ...c.DAILY_STICKERS }].flatMap((t) => ['dog', 'chipmunk', 'pair'].flatMap((k) => Array.from({ length: t[k] }, (_, i) => `assets/stickers/${t.name}/${k}-${i + 1}.webp`)));
      const many = Array.from({ length: 400 }, (_, i) => c.sticker('m' + i, 0, '2025-05-05'));
      const mix = { daily: many.filter((u) => u.includes('/daily/')).length, season: many.filter((u) => u.includes('/autumn/')).length };
      return { names, urls, files, mix, pair: c.pairSticker(), imgs: document.querySelectorAll('img.sticker:not([hidden])').length };
    });
    check('季節：秋 9/1–11/30、冬 12/1–2/28、春、夏', lib.names.join() === 'autumn,autumn,autumn,winter,winter,spring,summer', lib.names.join());
    check('秋季貼圖都指向存在的檔案', [...lib.urls, lib.pair].every((u) => u && fs.existsSync(ROOT + u)), JSON.stringify(lib.urls.find((u) => !u || !fs.existsSync(ROOT + u))));
    check('各季設定的貼圖數量與檔案一致', lib.files.length >= 560 && lib.files.every((f) => fs.existsSync(ROOT + f)), lib.files.find((f) => !fs.existsSync(ROOT + f)));
    check('9/1 生日紀錄只用生日主題的狗狗貼圖', lib.urls.filter((_, i) => i % 2).every((u) => /\/birthday\/dog-\d+\.webp$/.test(u)));
    check('日常組與當季圖一起隨機出現', lib.mix.daily > 100 && lib.mix.season > 100 && lib.mix.daily + lib.mix.season === 400, JSON.stringify(lib.mix));
    check('一般紀錄不會用到生日貼圖', lib.urls.filter((_, i) => !(i % 2)).every((u) => !u.includes('/birthday/')));
    check('頁尾顯示狗鼠一起', /\/pair-\d+\.webp$/.test(lib.pair) && lib.imgs >= 1);
    check('首頁頁尾有支持網站維運', (await p.getAttribute('.support-link', 'href')) === 'https://buymeacoffee.com/shiba48');
    await p.click('.site-nav a[href="about.html"]'); await p.waitForTimeout(400);
    check('關於頁面', (await p.textContent('main')).includes('安俞真') && (await p.textContent('main')).includes('金秋天'));
    await p.click('.site-nav a[href="team.html"]'); await p.waitForTimeout(400);
    const xs = await p.$$eval('.x-link', (as) => as.map((a) => a.href));
    check('協作者 X 連結', JSON.stringify(xs) === JSON.stringify(['https://x.com/idolobservation', 'https://x.com/yizhishuite', 'https://x.com/L07Chip']), xs.join(' '));
    const broken = await p.$$eval('img', (is) => is.filter((i) => i.getAttribute('src') && i.complete && i.naturalWidth === 0).map((i) => i.src));
    check('協作者頁圖片正常', broken.length === 0, broken.join(' '));
    check('內頁沒有 JS 錯誤', errs.length === 0, errs.join('; '));
    await ctx.close(); }

  // C. 手冊連結
  { const { ctx } = await setup();
    const p = await ctx.newPage();
    await p.goto(SITE + 'admin.html'); await p.waitForTimeout(500);
    const links = await p.$$eval('[data-repo]', (as) => as.map((a) => a.href));
    check('館員說明的儲存庫連結依網址產生', links.length === 1 && links.every((h) => h.startsWith('https://github.com/fallderz-moments/moments/')), links.join(' '));
    check('後台未連線時上鎖、不載入紀錄', await p.isVisible('#locked-note') && !(await p.isVisible('.admin-layout')) && (await p.locator('#admin-list li').count()) === 0);
    check('館員說明含第一次設定與停止擔任', (await p.locator('#help-setup').count()) === 1 && (await p.locator('#help-leave').count()) === 1);
    for (const pg of ['', 'about.html', 'team.html', 'guide.html']) {
      await p.goto(SITE + pg); await p.waitForTimeout(300);
      check(`前台 ${pg || '首頁'} 沒有後台連結`, (await p.locator('a[href*="admin"]').count()) === 0);
    }
    check('公開手冊只到申請', (await p.locator('#setup, #browse, #leave').count()) === 0 && (await p.locator('#apply').count()) === 1);
    await p.waitForTimeout(200);
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } }); await p.waitForTimeout(500);
    const imgs = await p.$$eval('img', (is) => is.filter((i) => i.getAttribute('src') && (!i.complete || i.naturalWidth === 0)).map((i) => i.src));
    check('手冊圖片都能載入', imgs.length === 0, imgs.join(' '));
    const anchors = await p.$$eval('.toc a', (as) => as.every((a) => document.querySelector(a.getAttribute('href'))));
    check('目錄錨點都存在', anchors);
    check('手冊沒有 slam0615', !(await p.content()).includes('slam0615'));
    await ctx.close(); }

  // D. 前台
  { const { ctx } = await setup();
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(SITE); await p.waitForTimeout(800);
    check('前台預設顯示本月', (await p.textContent('#content')).includes('2026 年 10 月'));
    await p.goto(SITE + 'admin.html'); await p.waitForTimeout(500); await p.click('#settings button[value=cancel]');
    await p.click('#btn-help'); await p.waitForTimeout(300);
    check('後台館員說明含新守則', (await p.textContent('#help')).includes('我們得知的時間點') && (await p.textContent('#help')).includes('雙人直播'));
    await p.goto(SITE + 'guide.html'); await p.waitForTimeout(300);
    check('公開手冊已移除新增/守則章節', !(await p.content()).includes('id="create"') && !(await p.content()).includes('id="faq"'));
    await p.goto(SITE);  await p.waitForTimeout(800);
    check('前台分類列有 X(twitter) 與 其他', await p.locator('[data-tag="X(twitter)"]').count() === 1 && await p.locator('[data-tag="其他"]').count() === 1);
    await p.click('[data-year="2026"]');
    check('選年份只顯示該年', (await p.textContent('.period-caption')).startsWith('2026 年 ·'));
    check('前台沒有 JS 錯誤', errs.length === 0, errs.join('; '));
    await ctx.close(); }
  console.log(`\n${ok} passed, ${fail} failed`);
  await b.close();
})();
