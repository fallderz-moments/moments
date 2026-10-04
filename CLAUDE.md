# Fallderz Moments — 給接手的 Claude 的工作說明

狗狗鼠鼠觀察日誌：記錄 IVE 安俞真（🐶，9/1 生日）與金秋天（🐿️，9/24 生日）互動片段的靜態網站。
網站擁有者顯示名稱為 **KONOKI**，請一律以繁體中文回覆。

- 網站：https://fallderz-moments.github.io/moments/
- 儲存庫：`fallderz-moments/moments`（GitHub Pages 從 `main` 的根目錄發佈）

## 架構

純靜態網站（無建置步驟、無伺服器），GitHub Pages 發佈：

| 檔案 | 用途 |
| --- | --- |
| `index.html` + `assets/app.js` | 前台（便利貼／列表、分類與系列篩選列、年份月份篩選、詳細內容、系列串接、貼圖） |
| `admin.html` + `assets/admin.js` | 館員後台：透過 GitHub Contents API 寫 `data/moments.json`；照片影片以 Google Drive API 上傳到擁有者的資料夾 |
| `assets/common.js` | 共用設定：`PRESET_TAGS`、`BIRTHDAYS`、`STICKERS`、日期（台北時間）與媒體工具 |
| `about.html`、`team.html` | 關於、協作者名單 |
| `guide.html` | 公開的「共同編輯者申請與使用手冊」（申請、設定、前台瀏覽、退出） |
| 後台「館員說明」對話框（`admin.html` 內） | 新增紀錄、編輯守則、常見問題（不放在公開手冊） |
| `assets/style.css`、`admin.css`、`guide.css` | 樣式（圖書館風、Lazy Days 色票；中文用粉圓體 Huninn） |
| `assets/pixel/`、`assets/stickers/` | 像素圖與狗狗鼠鼠貼圖：一般 `dog-NN.webp` 105 張、`chipmunk-NN.webp` 116 張；季節／節慶主題放 `stickers/<主題>/`（目前 `autumn/` 狗 46、鼠 48），期間與數量設在 `common.js` 的 `SEASONS`。每次重整隨機挑；9/1 生日紀錄只用狗、9/24 只用鼠。頁面上的 `data-random-sticker` 圖片由 `randomizeStickers()` 隨機換圖（網站頂部 banner 的兩張像素原圖不動） |
| `tools/` | 產生器與版本號工具 |
| `tests/` | Playwright 端對端測試 |

### `data/moments.json` 每則紀錄

`id`、`date`（YYYY-MM-DD）、`title`、`content`、`tags`、`source`（選填）、`series`（選填，同系列會串接）、
`media`（`{type:'drive', id, kind:'image'|'video', name, src, thumb?, thumbId?, w?, h?}`）、`cover`（封面索引）、`createdAt`、`updatedAt`。

後台存檔的提交訊息結尾會附上 `[紀錄 id]`，後台據此從 GitHub 提交紀錄顯示「誰在何時編輯」（只在後台顯示，不寫進 `moments.json`）。

**館員會隨時透過後台直接改 `main` 上的 `data/moments.json`。** 推送前一定要先 `git fetch` 並合併 `origin/main`，絕不覆蓋他們的資料。

## 工作流程

1. 在 `claude/` 開頭的工作分支修改。
2. 修改 `assets/` 的 CSS/JS 後執行 `python3 tools/bump_version.py`（更新快取版本號，避免新舊檔混用造成跑版）。
3. 測試：在根目錄 `python3 -m http.server 8765 &`，再執行
   `node tests/e2e.cjs`、`node tests/series.cjs`、`node tests/cover.cjs`（全部需通過）。
   視覺改動請用 Playwright 截圖檢查電腦版（1280px）與手機版（375–390px），手機不得出現橫向捲動。
4. 合併 `origin/main` → 推送工作分支 → 以 fast-forward 推送到 `main`（擁有者已同意直接更新 `main`）。
5. 前台改版時，**手機版修正不得改動電腦版**（手機專用樣式放在 `@media (max-width: 640px)`）。

## 隱私規則（重要）

- 不得把以下資訊寫進儲存庫：GitHub 權杖、Google OAuth 用戶端 ID、**雲端資料夾 ID**、任何 email。
  用戶端 ID 與資料夾網址由擁有者私下提供，各自存在瀏覽器（`localStorage`）。
- 網站畫面與手冊中不顯示擁有者的 GitHub 帳號名稱；儲存庫位置由網址自動判斷（`siteRepo()`）。
- 手冊截圖需打碼（`assets/guide/`；用假的資料夾網址並模糊用戶端 ID／資料夾欄位）。

## 權限模型

- 只有儲存庫有寫入權限的人能存檔；共同編輯者以 Collaborator（Write）加入，**不要**設為組織 Owner。
- 上傳需要：雲端資料夾「編輯者」＋ Google Cloud OAuth「測試使用者」名單。
- 新增協作者、分享資料夾、Google Cloud 設定都必須由擁有者本人操作。

## 備註

- 匿名留言：「關於」頁底部以 iframe 內嵌擁有者的 Google 表單（`viewform?embedded=true`；短網址 `forms.gle` 會被 Google 拒絕嵌入）。
