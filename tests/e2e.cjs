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
    const log = []; const files = { 'data/moments.json': { sha: 's0', content: fs.readFileSync(ROOT + 'data/moments.json', 'utf8') } };
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
      if (req.method() === 'GET') { const f = files[path]; return f ? json(r, 200, { sha: f.sha, encoding: 'base64', content: Buffer.from(f.content).toString('base64') }) : json(r, 404, {}); }
      const body = JSON.parse(req.postData()); files[path] = { sha: 's' + log.length, content: Buffer.from(body.content, 'base64').toString() }; return json(r, 201, { content: { sha: files[path].sha } });
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
    return { ctx, log, files, uploads };
  }

  // A. 共同編輯者首次設定 → 新增紀錄（含照片上傳）
  { const { ctx, log, files, uploads } = await setup();
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
    check('系列欄位已儲存（去除多餘空白）', saved && saved.series === '測試 系列', saved && saved.series);
    check('多張照片上傳到雲端資料夾', uploads.length === 2 && uploads.every((u) => u.parents[0] === '1TESTFOLDERxxxxxxxxxxxxxxxx'));
    check('紀錄已寫入（分類、媒體）', saved && saved.tags.includes('LIVE') && saved.tags.includes('X(twitter)') && saved.tags.includes('其他') && saved.media.length === 2 && saved.media.every((m) => m.type === 'drive'));
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
    check('首頁頁尾有支持網站維運', (await p.getAttribute('.support-link', 'href')) === 'https://buymeacoffee.com/shiba48');
    await p.click('.site-nav a[href="about.html"]'); await p.waitForTimeout(400);
    check('關於頁面', (await p.textContent('main')).includes('安俞真') && (await p.textContent('main')).includes('金秋天'));
    await p.click('.site-nav a[href="team.html"]'); await p.waitForTimeout(400);
    const xs = await p.$$eval('.x-link', (as) => as.map((a) => a.href));
    check('協作者 X 連結', JSON.stringify(xs) === JSON.stringify(['https://x.com/idolobservation', 'https://x.com/yizhishuite', 'https://x.com/L07Chip']), xs.join(' '));
    const broken = await p.$$eval('img', (is) => is.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src));
    check('協作者頁圖片正常', broken.length === 0, broken.join(' '));
    check('內頁沒有 JS 錯誤', errs.length === 0, errs.join('; '));
    await ctx.close(); }

  // C. 手冊連結
  { const { ctx } = await setup();
    const p = await ctx.newPage(); await p.goto(SITE + 'guide.html'); await p.waitForTimeout(500);
    const links = await p.$$eval('[data-repo]', (as) => as.map((a) => a.href));
    check('手冊的儲存庫連結依網址產生', links.length === 1 && links.every((h) => h.startsWith('https://github.com/fallderz-moments/moments/')), links.join(' '));
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } }); await p.waitForTimeout(500);
    const imgs = await p.$$eval('img', (is) => is.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
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
