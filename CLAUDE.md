# Fallderz Moments — 給接手的 Claude 的工作說明

狗狗鼠鼠觀察日誌：記錄 IVE 安俞真（🐶，9/1 生日）與金秋天（🐿️，9/24 生日）互動片段的靜態網站。
網站擁有者顯示名稱為 **KONOKI**，請一律以繁體中文回覆。

- 網站：https://fallderz-moments.github.io/moments/
- 儲存庫：`fallderz-moments/moments`（GitHub Pages 從 `main` 的根目錄發佈）

## 架構

純靜態網站（無建置步驟、無伺服器），GitHub Pages 發佈：

| 檔案 | 用途 |
| --- | --- |
| `index.html` + `assets/app.js` | 前台（便利貼／列表、分類篩選列（電腦版自動換行、手機左右滑）、工具列「📺 完整直播」專區（`LIVE_TAG`，歷來全部、不受年月限制）、系列（預設收合成「瀏覽系列」按鈕，點開為可搜尋的換行清單，8 個以上才顯示搜尋框）、年份月份篩選、詳細內容、系列串接、貼圖） |
| `admin.html` + `assets/admin.js` | 館員後台：透過 GitHub Contents API 寫 `data/moments.json`；照片影片以 Google Drive API 上傳到擁有者的資料夾 |
| `assets/common.js` | 共用設定：`PRESET_TAGS`、`BIRTHDAYS`、`STICKERS`、日期（台北時間）與媒體工具 |
| `about.html`、`team.html` | 關於、協作者名單（館員頭像放 `assets/avatars/`，192px 正方形 webp，前台裁成圓形） |
| `guide.html` | 公開的「共同編輯者申請手冊」（只到申請為止） |
| 後台「館員說明」對話框（`admin.html` 內） | 第一次設定、新增紀錄、編輯守則、常見問題、前台瀏覽、停止擔任館員（不放在公開手冊） |
| 後台「發布公告」→ `data/notices.json` | `{version, notices:[{id, date, content, createdAt}]}`；前台進站時以浮動視窗顯示沒看過的公告（最多 3 則） |
| `.github/workflows/guard.yml` | 安全警示：非管理員改程式、一次刪 3 則以上、JSON 損壞、強制推送時自動開 issue 通知 |
| `assets/style.css`、`admin.css`、`guide.css` | 樣式（圖書館風、Lazy Days 色票；中文用粉圓體 Huninn） |
| `assets/pixel/`、`assets/stickers/` | 像素圖（頂部 banner 的原始點陣狗鼠、書、愛心、蛋糕、派對帽）與季節貼圖庫。貼圖放 `stickers/<spring|summer|autumn|winter>/dog-N.webp`、`chipmunk-N.webp`、`pair-N.webp`（狗鼠一起，用在頁尾愛心的位置），生日主題放 `stickers/birthday/`；數量設在 `common.js` 的 `SEASONS`／`BIRTHDAY_STICKERS`，數量 0 時畫面不顯示貼圖。目前四季、生日、日常六組都已放入（`spring/`、`summer/`、`autumn/`、`winter/`、`birthday/` 各狗 32、鼠 32、狗鼠一起 16；`daily/` 兩批共狗 64、鼠 64、狗鼠一起 32；合計 560 張）。日常組 `DAILY_STICKERS` 全年和當季圖依張數比例一起隨機（頁尾狗鼠一起也是）。生日紀錄不分季節一律用壽星的生日貼圖，生日當天頁尾用生日版狗鼠一起。整齊排列的貼圖表用 `tools/split_sprite_sheets.py --grid 4x4` 切圖 |
| `tools/` | 產生器與版本號工具 |
| `tests/` | Playwright 端對端測試 |

### `data/moments.json` 每則紀錄

`id`、`date`（YYYY-MM-DD）、`title`、`content`、`tags`、`source`（選填）、`series`（選填，同系列會串接）、
`media`（`{type:'drive', id, kind:'image'|'video', name, src, thumb?, thumbId?, w?, h?}`）、`cover`（封面索引）、`createdAt`、`updatedAt`。

前台雲端影片用原生 `<video>` 直接播放原檔（`common.js` 的 `DRIVE_API_KEY` 有值時走 `googleapis.com/drive/v3/files/…?alt=media&key=`，否則 `drive.usercontent.google.com/download?id=…`；擁有者回報公開下載網址在手機上會失敗，需要 API 金鑰，依影片比例完整顯示）；播放失敗（>100MB 病毒掃描頁、額度用完）時自動改回 `drive.google.com/file/d/…/preview` 內嵌播放器。注意 Playwright 的 Chromium 不支援 H.264，測試要用 WebM。

後台存檔的提交訊息結尾會附上 `[紀錄 id]`，後台據此從 GitHub 提交紀錄顯示「誰在何時編輯」（只在後台顯示，不寫進 `moments.json`）。編輯者名稱可在 `admin.js` 的 `AUTHOR_ALIASES` 對應成暱稱（以 `hashString(帳號小寫)` 為鍵，不把帳號明文寫進程式）。後台左側清單：搜尋＋年份／月份／分類／編輯者篩選，依年→月分組可收合（預設只展開最新月份）。

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

## 影片剪輯／上字幕需求（KONOKI 指定，之後上傳影片時直接照辦）

> 桌面版（本機）剪片請用 `video-kit/` 工作包：它的 `CLAUDE.md` 是完整、可獨立使用的版本，附辨識（`transcribe.py`）與燒字幕（`burn.py`）腳本。以下為雲端工作階段的摘要；兩邊需求有出入時以 `video-kit/CLAUDE.md` 為準。

1. **不更動影片大小與解析度**：維持原始解析度、長寬比、影格率；檔案大小盡量貼近原檔（燒字幕須重新編碼時，用接近原始的位元率與編碼器，音軌直接複製不重編）。
2. **字幕自行翻譯**：理解前後文與語順後翻成繁體中文，人名、團名、節目名等專有名詞用通行譯名（例：IVE、安俞真、金秋天）。
3. **字幕樣式**：黑底白字；未特別說明時一律放在畫面下方置中。
4. **字型統一用粉圓體（Huninn）**：環境沒有內建，從 Google Fonts 下載完整 TTF（`curl -A "Mozilla/5.0" "https://fonts.googleapis.com/css2?family=Huninn"` 取得 ttf 網址）後以 ASS 的 `fontsdir` 指定。
5. **專有名詞固定譯法**：完整的專有名詞表與部分姓名對應規則在 `video-kit/CLAUDE.md`（유진이＝俞真尼、거북이＝海龜…）；新譯名一律補在那裡。確認指代女性的稱謂一律用「妳」「她」。
6. **標題句**：擁有者若給一句標題（例如「OO 看到就會想到 OO」），翻譯後全程放在畫面左上方，大小以不遮到人物為準；其餘對話依影片聲音與節奏自行切分。
7. **全片都要有字幕**：擁有者給的原文只是參考；原文沒涵蓋、但有人在說話的片段，也要自己聽取後翻譯補上，只要前後文合理通順即可。擁有者若另外提供參考譯文（例如 Gemini 的翻譯），以參考譯文的內容為準，再依聲音節奏切句、配上時間。
8. **多支影片合併**：擁有者給多支片段時，依對白前後順序剪成一支；片段交界若有重複的話，在停頓處切掉重複的部分。影格率不同時取較高的（例如 30 與 60 合併成 60，不丟原始畫格）。
9. **發話者 emoji、位置說明**：參考字幕句首的動物 emoji（🐶俞真、🐿️秋天…）要保留；參考字幕順序依聲音調整；指定「畫面最上方置中」等位置的說明文字照辦（細節見 `video-kit/CLAUDE.md` 第 10–12 點）。
- 粉絲用語：「文件夾」＝俞真尼與秋天的 CP 名（Fallderz），照寫不翻。
- 做法（第一支影片已驗證）：
  - 對時間：雲端環境擋 Hugging Face，擁有者已同意用 npm 套件 `sts-whisper-base`（whisper-base ONNX）＋ `@huggingface/transformers` 做韓語辨識、取逐字時間，再對照擁有者給的原文切句。
  - 字幕圖層：用 Playwright（Chromium）把每句渲染成 720×720 透明 PNG（粉圓體＋`Noto Color Emoji`，`𓆉` 等古埃及象形字用 Google Fonts 的 Noto Sans Egyptian Hieroglyphs）；頁面要寫成檔案再 `goto file://`，字型才載得到。再用 ffmpeg `overlay=enable='between(t,a,b)'` 疊上。
  - 編碼：libx264 two-pass、位元率設成原檔影像位元率，`-c:a copy`，解析度與影格率不變。
  - 字級參考（720px 寬）：左上標題 22px、底部字幕 30px，黑底框距底 34px。
- 成品影片與字幕檔交給擁有者，不放進儲存庫。
