# Fallderz Moments

狗狗鼠鼠觀察日誌，時間軸從 **2021 年 12 月 1 日** 開始，每天自動延伸到今天（台北時間）。

- **前台**（`index.html`）：預設顯示「本月」紀錄，選年份只顯示該年、再選月份只顯示該月。圖書館風格，搭配像素風的黃金獵犬與花栗鼠。可用「便利貼」或「列表（借閱登記卡）」兩種方式瀏覽，依月份分組、可切換新舊排序，並能用分類、關鍵字、年份／月份快速找到紀錄。點開後可看完整內容、多張照片（可放大）與影片，並用 ← → 切換上下則。
- **館員後台**（`admin.html`）：新增、編輯、刪除紀錄；設定日期、標題、資訊來源網址（選填）、內容、分類標籤，並可一次上傳多張照片與多支影片。
- **生日**：日期為 **9/1** 或 **9/24** 的紀錄會自動加上彩帶、蛋糕與戴派對帽的狗狗鼠鼠。

## 儲存方式

| 內容 | 存放位置 |
| --- | --- |
| 文字資料（日期、標題、內容、標籤…） | GitHub 儲存庫的 `data/moments.json` |
| 上傳的照片與影片 | **你的 Google 雲端硬碟資料夾**（原檔上傳，不壓縮） |
| YouTube / X / Instagram | 貼上連結，直接嵌入顯示 |

上傳到雲端硬碟的檔案會自動設成「知道連結的任何人可檢視」，檔名格式為 `日期_標題_序號.副檔名`。
在後台刪除紀錄或移除媒體時，**雲端硬碟上的原檔會保留**，不會被刪除。

## 分類標籤

預設分類：YouTube、Berriz、Universe、花絮、綜藝、Bubble、Instagram、FanClub、LIVE、FanSign。
後台點一下即可選取，也能另外輸入自訂標籤。預設分類可在 `assets/common.js` 的 `PRESET_TAGS` 修改。

## 上線步驟（GitHub Pages）

1. 確認儲存庫有 `main` 分支（沒有的話：儲存庫首頁 → 分支選單 → View all branches → New branch，名稱 `main`，來源選目前的分支）。
2. **Settings → Pages**：Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾 `/ (root)`。
3. 約 1～2 分鐘後網站會出現在 `https://<GitHub 帳號>.github.io/moments/`。

## 設定後台：① GitHub（文字資料）

1. 開啟 <https://github.com/settings/personal-access-tokens/new>（Fine-grained token）。
2. **Repository access** 選 *Only select repositories* → `moments`。
3. **Permissions → Contents** 設為 **Read and write**。
4. 到網站的 `admin.html` →「連線設定」貼上權杖，分支填 GitHub Pages 使用的分支（通常是 `main`）。

## 設定後台：② Google 雲端硬碟上傳（只需做一次）

網站需要一組你自己的 Google「OAuth 用戶端 ID」，才能把檔案上傳到你的雲端硬碟：

1. 開啟 <https://console.cloud.google.com/>，左上角建立一個新專案（名稱例如 `fallderz-moments`）。
2. 搜尋並進入 **Google Drive API** → 按 **啟用**。
3. 進入 **Google Auth Platform**（或「OAuth 同意畫面」）→ 開始設定：
   - 應用程式名稱：`Fallderz Moments`，支援電子郵件選你自己的信箱
   - 目標對象選 **外部（External）**
   - 完成後到 **目標對象 → 測試使用者**，新增你自己的 Gmail
   - 發布狀態維持 **測試中（Testing）** 即可
4. 進入 **用戶端（Clients）→ 建立用戶端**：
   - 應用程式類型：**網頁應用程式**
   - 已授權的 JavaScript 來源：新增 `https://<GitHub 帳號>.github.io`（本機測試可再加 `http://localhost:8000`）
5. 複製產生的 **用戶端 ID**（`….apps.googleusercontent.com`），貼到後台「連線設定」的 OAuth 用戶端 ID。
   上傳資料夾已預設為你提供的資料夾，需要時可改貼其他資料夾網址。
6. 按後台上方「連結 Google 雲端硬碟」，登入擁有該資料夾的 Google 帳號。
   第一次會看到「Google 尚未驗證這個應用程式」，因為這是你自己的私人應用程式，按「繼續」即可。

> 為了把檔案放進你既有的資料夾，網站會要求雲端硬碟的存取權限。授權只存在你目前的瀏覽器分頁，約 1 小時後失效，
> 下次上傳時會自動再跳出授權視窗。其他人沒有你的 Google 帳號與 GitHub 權杖，就無法編修。

## 讓其他人一起上傳

完整圖文教學請見網站上的 **共同編輯者手冊**：`guide.html`（後台右上角「使用手冊」）。以下為摘要。

每位上傳者都需要「GitHub 寫入權限」（儲存文字）與「雲端資料夾的編輯權限」（儲存照片影片）。由你（擁有者）做 3 件事，對方做 2 件事：

**你要做的**
1. **邀請對方加入 GitHub 儲存庫**：儲存庫 **Settings → Collaborators → Add people**，輸入對方的 GitHub 帳號（對方需先註冊 GitHub），對方到信箱接受邀請。
2. **分享雲端資料夾**：在 Google 雲端硬碟對上傳資料夾按「共用」，加入對方的 Gmail，權限選 **編輯者**。
3. **加入 Google 測試使用者**：<https://console.cloud.google.com/auth/audience> → 測試使用者 → Add users，加入對方的 Gmail（最多 100 人）。

**對方要做的**
1. **建立自己的 GitHub 權杖**：因為儲存庫屬於你的個人帳號，協作者要用 classic token：
   <https://github.com/settings/tokens/new> → Note 填 `Fallderz Moments`、Expiration 建議選 90 天 → 勾選 **public_repo** → Generate token。
2. 打開網站 `admin.html` →「連線設定」貼上自己的權杖（儲存庫位置會依網址自動帶入）；
   OAuth 用戶端 ID 填擁有者提供的同一組（若已寫進 `assets/admin.js` 的 `DEFAULT_CLIENT_ID` 就會自動帶入），再按「連結 Google 雲端硬碟」用自己的 Gmail 登入。

> - 不要把你自己的權杖給別人：每個人用自己的權杖，GitHub 會記錄是誰新增或修改了哪一則，也能隨時單獨停用。
> - 停止某人的權限：在 Collaborators 移除對方、取消雲端資料夾共用即可。
> - 對方上傳到資料夾的檔案，擁有者是對方，佔用的是**對方**的雲端硬碟空間。
> - 多人同時存檔時，後台會自動重新讀取最新資料再合併，不會互相覆蓋。

## 更改網站網址

網址 `https://<帳號>.github.io/moments/` 中的帳號名稱來自擁有儲存庫的 GitHub 帳號或組織。程式會依網址自動判斷儲存庫，改網址不需要修改程式。

| 方式 | 新網址 | 說明 |
| --- | --- | --- |
| 建立 GitHub 組織並轉移儲存庫（建議） | `https://<組織名稱>.github.io/moments/` | 免費。組織名稱不可與現有帳號重複（例如 `konoki` 已被使用），可用 `konoki-moments` 等。共同編輯者也能改用權限更小的 Fine-grained token。 |
| 更改自己的 GitHub 帳號名稱 | `https://<新帳號>.github.io/moments/` | 會影響整個帳號；舊網址不會自動轉址。 |
| 自訂網域 | 例如 `https://moments.example.com` | 需購買網域（約每年 NT$300～1,000），在 Settings → Pages → Custom domain 設定。 |

改完網址後務必：
1. Google Cloud → 用戶端 → 「已授權的 JavaScript 來源」加入新網址（例如 `https://konoki-moments.github.io`）。
2. 每位編輯者重新開啟新網址的 `admin.html`，貼上權杖（瀏覽器設定是依網址分開儲存的）。
3. 轉移到組織時：儲存庫 Settings → General → Danger Zone → **Transfer ownership**，轉移後到新儲存庫確認 Settings → Pages 仍為 `main` / `(root)`，並確認儲存庫的 Collaborators 名單中仍有每位編輯者（不在名單中的請重新邀請）。

## 常見問題

**存檔時出現「Branch main not found」／連線時顯示「找不到分支」**
儲存庫沒有那個分支。請依「上線步驟」建立 `main`，或在「連線設定」改成 GitHub Pages 實際使用的分支。

**授權時出現 `redirect_uri_mismatch` 或 `origin_mismatch`**
OAuth 用戶端的「已授權的 JavaScript 來源」沒有加上網站網址（只填 `https://<GitHub 帳號>.github.io`，不要加路徑或結尾斜線）。

**授權時出現「存取遭拒／access_denied」**
登入的帳號不在「測試使用者」名單內，請到 Google Auth Platform → 目標對象新增。

**照片在前台顯示不出來**
確認檔案共用設定為「知道連結的任何人」。新上傳的影片需要幾分鐘讓 Google 處理後才能播放與產生縮圖。

## 本機預覽

```bash
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

## 檔案結構

```
index.html             前台
admin.html             館員後台
assets/
  style.css            共用樣式（配色：#97B3AE #D2E0D3 #F0DDD6 #F2C3B9 #D6CBBF #F0EEEA）
  admin.css            後台樣式
  common.js            共用設定與工具（預設分類、生日日期、日期換算、媒體連結辨識）
  app.js               前台程式
  admin.js             後台程式（GitHub 與 Google 雲端硬碟串接）
  pixel/               像素風圖案（狗狗、鼠鼠、生日版、蛋糕、書本…）
data/moments.json      所有紀錄資料
media/samples/         範例紀錄用的插圖
guide.html             共同編輯者手冊（含後台截圖 assets/guide/）
tools/pixel_sprites.py       小型像素圖案產生器（蛋糕、書本、愛心…）
tools/sprites_from_image.py  把狗狗、花栗鼠原圖轉成像素 SVG（含戴派對帽的生日版）
tools/bookshelf_bg.py        手繪書櫃背景產生器
tools/bump_version.py        更新 CSS/JS 版本號（修改 assets 後執行，避免瀏覽器快取舊檔）
```

字體：英文標題使用 Libre Baskerville、內文英數使用 Nunito、像素標籤使用 Pixelify Sans，**中文使用粉圓體（Huninn）**。

`data/moments.json` 內附三則「範例」紀錄，可以直接在後台刪除。
