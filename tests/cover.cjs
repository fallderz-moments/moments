// 端對端測試（以 Playwright 模擬 GitHub 與 Google API，不會碰到真實帳號）
// 執行：在專案根目錄先啟動 `python3 -m http.server 8765`，再執行 `node tests/cover.cjs`
const path = require('path');
const ROOT = path.resolve(__dirname, '..') + '/';
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const fs = require('fs');
let ok = 0, fail = 0;
const check = (n, c, x = '') => { c ? ok++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  → ' + x : '')); };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  const data = JSON.parse(fs.readFileSync(ROOT + 'data/moments.json', 'utf8'));
  data.moments.push({ id: 'm-old-video', date: '2026-09-30', title: '舊影片', content: '', tags: [], media: [{ type: 'drive', id: 'OLDVID', kind: 'video', name: '20260930_舊影片_01.webm', src: 'x' }], cover: 0 });
  const files = { 'data/moments.json': { sha: 's0', content: JSON.stringify(data) } };
  let webm = null; const uploads = [];
  const json = (r, s, body, h = {}) => r.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'Location', ...h }, body: JSON.stringify(body) });
  await ctx.route('https://api.github.com/**', (r) => {
    const req = r.request(); const path = decodeURIComponent(new URL(req.url()).pathname.replace(/^\/repos\/[^/]+\/[^/]+/, '').replace('/contents/', ''));
    if (path === '') return json(r, 200, { permissions: { push: true } });
    if (path.startsWith('/branches/')) return json(r, 200, {});
    if (req.method() === 'GET') { const f = files[path]; return f ? json(r, 200, { sha: f.sha, encoding: 'base64', content: Buffer.from(f.content).toString('base64') }) : json(r, 404, {}); }
    const body = JSON.parse(req.postData()); files[path] = { sha: 's' + Math.random(), content: Buffer.from(body.content, 'base64').toString() }; return json(r, 201, { content: { sha: files[path].sha } });
  });
  await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: `window.google={accounts:{oauth2:{initTokenClient:(c)=>({requestAccessToken:()=>setTimeout(()=>c.callback({access_token:'t',expires_in:3599}),20)}),revoke:()=>{}}}};` }));
  await ctx.route('https://www.googleapis.com/**', async (r) => {
    const req = r.request(); const u = new URL(req.url());
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'Location' } });
    if (u.pathname === '/drive/v3/files/OLDVID' && u.searchParams.get('alt') === 'media') return r.fulfill({ status: 200, contentType: 'video/webm', headers: { 'access-control-allow-origin': '*' }, body: webm });
    if (u.pathname === '/upload/drive/v3/files') { uploads.push(JSON.parse(req.postData())); return json(r, 200, {}, { Location: 'https://www.googleapis.com/upload/s/' + uploads.length }); }
    if (u.pathname.startsWith('/upload/s/')) { const n = Number(u.pathname.split('/').pop()); const up = uploads[n - 1]; up.size = (req.postDataBuffer() || []).length; up.type = req.headers()['content-type']; return json(r, 200, { id: 'D' + n, name: up.name, mimeType: up.name.endsWith('.jpg') ? 'image/jpeg' : 'video/webm' }); }
    if (u.pathname.startsWith('/drive/v3/files/') && !u.pathname.endsWith('/permissions')) return json(r, 200, { id: 'F', name: '素材', mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } });
    return json(r, 200, {});
  });
  await ctx.route(/drive\.google\.com|lh3\.googleusercontent|fonts\./, (r) => r.fulfill({ status: 404 }));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('http://localhost:8765/admin.html?' + Date.now()); await p.waitForTimeout(600);
  check('「加入連結」欄位已移除', await p.locator('#link-entry, #btn-add-link').count() === 0);
  await p.fill('[name=owner]', 'o'); await p.fill('[name=repo]', 'moments');
  await p.fill('[name=token]', 'ghp_x'); await p.fill('[name=clientId]', 'cid'); await p.fill('[name=folder]', '1FOLDERxxxxxxxxxxxx');
  await p.click('#btn-connect'); await p.waitForSelector('#conn.ok'); await p.waitForTimeout(900);
  // 在瀏覽器裡錄一支 2 秒的 webm 影片
  const b64 = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d');
    const rec = new MediaRecorder(c.captureStream(25), { mimeType: 'video/webm' }); const chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start(); const t0 = performance.now();
    await new Promise((res) => { (function draw() { const t = performance.now() - t0; g.fillStyle = `hsl(${t / 10},70%,60%)`; g.fillRect(0, 0, 320, 240); g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText((t / 1000).toFixed(1), 100, 130); t < 2000 ? requestAnimationFrame(draw) : res(); })(); });
    rec.stop(); await new Promise((r) => (rec.onstop = r));
    const buf = await new Blob(chunks, { type: 'video/webm' }).arrayBuffer();
    let s = ''; new Uint8Array(buf).forEach((x) => (s += String.fromCharCode(x))); return btoa(s);
  });
  webm = Buffer.from(b64, 'base64');
  await p.click('#btn-new'); await p.fill('[name=title]', '影片測試');
  await p.setInputFiles('#file-media', { name: 'clip.webm', mimeType: 'video/webm', buffer: webm });
  await p.click('#btn-save');
  await p.waitForFunction(() => document.getElementById('toast').textContent.includes('已儲存'), null, { timeout: 30000 });
  let saved = JSON.parse(files['data/moments.json'].content).moments.find((m) => m.title === '影片測試');
  const cover = uploads.find((u) => u.name.endsWith('_cover.jpg'));
  check('上傳影片時自動擷取封面', !!cover && cover.size > 1000, cover && `${cover.name} ${cover.size} bytes`);
  check('封面設為影片縮圖', saved.media[0].thumbId === 'D2' && saved.media[0].thumb.includes('id=D2'), JSON.stringify(saved.media[0]));
  // 已存在的雲端影片
  await p.click('[data-id="m-old-video"]'); await p.waitForTimeout(300);
  check('舊影片有「擷取封面」按鈕', await p.locator('[data-frame="0"]').count() === 1);
  await p.click('[data-frame="0"]');
  await p.waitForFunction(() => document.getElementById('toast').textContent.includes('封面已擷取') || document.getElementById('toast').textContent.includes('失敗'), null, { timeout: 30000 });
  check('舊影片擷取封面', (await p.textContent('#toast')).includes('封面已擷取'), await p.textContent('#toast'));
  await p.click('#btn-save'); await p.waitForTimeout(1500);
  saved = JSON.parse(files['data/moments.json'].content).moments.find((m) => m.id === 'm-old-video');
  check('舊影片存檔後有縮圖', !!saved.media[0].thumb, JSON.stringify(saved.media[0]));
  check('沒有 JS 錯誤', errs.length === 0, errs.join('; '));
  // 前台顯示 ▶
  console.log(`\n${ok} passed, ${fail} failed`);
  await b.close();
})();
