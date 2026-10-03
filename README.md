# Fallderz moments

紀錄生活片段的個人網站，時間軸從 **2021 年 12 月 1 日** 開始直到現在。

- **前台**（`index.html`）：以「便利貼」或「列表」兩種方式瀏覽，依月份分組、可切換新舊排序，並能用標籤、關鍵字篩選，也可透過年份／月份導覽快速跳轉。點開片段可看完整內容、照片與影片，並用 ← → 切換上下則。
- **後台**（`admin.html`）：新增、編輯、刪除片段，可設定日期、標題、文字內容、標籤，上傳照片／影片，或貼上外部連結。

整個網站都是靜態檔案，不需要伺服器或資料庫，可以免費架在 GitHub Pages 上。

## 媒體來源

| 來源 | 用法 | 前台顯示 |
| --- | --- | --- |
| 直接上傳照片 | 後台拖曳或點選檔案 | 自動壓縮（最長邊 2000px）後存到 `media/年份/` |
| 直接上傳影片 | 同上（單檔上限約 95MB） | 內建播放器 |
| Google 雲端硬碟 | 貼上分享連結，選擇「雲端照片」或「雲端影片」 | 照片顯示大圖、影片內嵌播放 |
| YouTube | 貼上影片或 Shorts 連結 | 內嵌播放，自動抓縮圖 |
| X（Twitter） | 貼上貼文連結 | 內嵌貼文 |
| Instagram | 貼上貼文／Reels 連結 | 內嵌貼文 |
| 其他網址 | 圖片網址會直接顯示，其他顯示為連結卡片 | — |

> Google 雲端硬碟的檔案需要把共用設定改成「**知道連結的任何人**皆可檢視」，網站才能顯示。
> 長影片建議放雲端硬碟或 YouTube，以免儲存庫變得太大。

每則片段可以按 ★ 指定哪一個媒體當作便利貼縮圖；沒有圖片的片段會顯示文字內容。

## 上線步驟（GitHub Pages）

1. 把這個分支合併到 `main`。
2. 到儲存庫的 **Settings → Pages**，Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾選 `/ (root)`，按 Save。
3. 約 1～2 分鐘後網站就會出現在 `https://slam0615.github.io/moments/`。

> 免費帳號的 GitHub Pages 需要儲存庫是公開的（Public）。

## 啟用後台編修

後台透過 GitHub API 把資料寫回儲存庫，需要一組只能存取這個儲存庫的權杖：

1. 開啟 <https://github.com/settings/personal-access-tokens/new>（Fine-grained token）。
2. **Repository access** 選 *Only select repositories* → `moments`。
3. **Permissions → Repository permissions → Contents** 設為 **Read and write**。
4. 建立後複製權杖，打開網站的 `admin.html`，在「連線設定」貼上即可。

權杖只會存在你自己裝置的瀏覽器裡，別人打開後台頁面也只能看、不能改。在公用電腦上用完請按「清除權杖」。

每次儲存都會產生一筆 commit，GitHub Pages 約 1 分鐘後更新前台。後台也提供「匯出備份／匯入備份」（JSON 檔）。

## 本機預覽

```bash
python3 -m http.server 8000
# 開啟 http://localhost:8000
```

## 檔案結構

```
index.html          前台
admin.html          後台
assets/
  style.css         共用樣式（配色：#97B3AE #D2E0D3 #F0DDD6 #F2C3B9 #D6CBBF #F0EEEA）
  admin.css         後台樣式
  common.js         共用工具（日期、媒體連結辨識等）
  app.js            前台程式
  admin.js          後台程式
data/moments.json   所有片段資料
media/              上傳的照片與影片
```

字體使用 Google Fonts 的 **粉圓體（Huninn）**，繁體中文圓體；缺字時會依序改用 Zen Maru Gothic、蘋方、思源黑體、微軟正黑體。

`data/moments.json` 內附的三則「範例」片段可以直接在後台刪除。
