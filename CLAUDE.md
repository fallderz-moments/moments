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
| `guide.html` | 公開的「共同編輯者申請手冊」（只到申請為止） |
| 後台「館員說明」對話框（`admin.html` 內） | 第一次設定、新增紀錄、編輯守則、常見問題、前台瀏覽、停止擔任館員（不放在公開手冊） |
| 後台「發布公告」→ `data/notices.json` | `{version, notices:[{id, date, content, createdAt}]}`；前台進站時以浮動視窗顯示沒看過的公告（最多 3 則） |
| `.github/workflows/guard.yml` | 安全警示：非管理員改程式、一次刪 3 則以上、JSON 損壞、強制推送時自動開 issue 通知 |
| `assets/style.css`、`admin.css`、`guide.css` | 樣式（圖書館風、Lazy Days 色票；中文用粉圓體 Huninn） |
| `assets/pixel/`、`assets/stickers/` | 像素圖（頂部 banner 的原始點陣狗鼠、書、愛心、蛋糕、派對帽）與季節貼圖庫。貼圖放 `stickers/<spring|summer|autumn|winter>/dog-N.webp`、`chipmunk-N.webp`、`pair-N.webp`（狗鼠一起，用在頁尾愛心的位置），生日主題放 `stickers/birthday/`；數量設在 `common.js` 的 `SEASONS`／`BIRTHDAY_STICKERS`，數量 0 時畫面不顯示貼圖。目前已放入秋季、冬季、生日（`autumn/`、`winter/`、`birthday/` 各狗 32、鼠 32、狗鼠一起 16）；春、夏等擁有者提供。生日紀錄不分季節一律用壽星的生日貼圖，生日當天頁尾用生日版狗鼠一起。整齊排列的貼圖表用 `tools/split_sprite_sheets.py --grid 4x4` 切圖 |
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
- **前台（index／about／team／guide）不得出現館員後台 `admin.html` 的連結**；後台網址由擁有者私下提供。後台未連線時只顯示上鎖畫面，不載入任何資料。
- 手冊截圖需打碼（`assets/guide/`；用假的資料夾網址並模糊用戶端 ID／資料夾欄位）。

## 權限模型

- 只有儲存庫有寫入權限的人能存檔；共同編輯者以 Collaborator（Write）加入，**不要**設為組織 Owner。
- 上傳需要：雲端資料夾「編輯者」＋ Google Cloud OAuth「測試使用者」名單。
- 新增協作者、分享資料夾、Google Cloud 設定都必須由擁有者本人操作。

## 備註

- 匿名留言：「關於」頁底部以 iframe 內嵌擁有者的 Google 表單（`viewform?embedded=true`；短網址 `forms.gle` 會被 Google 拒絕嵌入）。
