# 獲獎名單填報與文件自動產出系統（GitHub Pages Ready）

這個專案提供一個前端頁面，連接你的 Google Apps Script Web App：
- 新增獲獎名單（寫入試算表）
- 勾選多筆 → 生成「司儀稿」（前端 PDF）
- 勾選多筆 → 生成「敘獎公告」（後端複製範本 → 回傳 doc/pdf 連結）

## 一、部署（GitHub Pages）
1. 建立一個新的 GitHub Repository（公開即可）。
2. 將本資料夾的所有檔案上傳（index.html、app.js、config.js、README.md）。
3. 到 `Settings → Pages → Build and deployment`：
   - Source 選 `Deploy from a branch`
   - Branch 選 `main`，資料夾 `/(root)`
4. 等待幾十秒，完成後會得到你的網址，例如：  
   `https://your-username.github.io/reward-system/`

## 二、設定後端網址
打開 `config.js`，把 `WEB_APP_URL` 換成你的 Apps Script Web App `/exec` 連結。

> Apps Script Web App 需設定為：
> - 執行身分：你自己
> - 存取權：Anyone with the link（匿名可存取）

## 三、關於 CORS / 預檢
- 一般新增資料使用 `application/x-www-form-urlencoded`，**不會觸發預檢**。
- 生成「敘獎公告」預設會先嘗試 `application/json`（好閱讀）；若失敗，會自動 fallback 成 `URLSearchParams`，並將 `ids` 以 JSON 字串傳遞。
- 建議在你的 `doPost` 加入以下修補，支援 `ids` 是字串時自動 parse：
  ```js
  if (payload && typeof payload.ids === 'string') {
    try { payload.ids = JSON.parse(payload.ids); } catch (e) { payload.ids = []; }
  }
  ```

## 四、常見問題
- 看不到清單：確認 Web App 已部署最新版本，並且試算表工作表名稱與權限正確。
- 生成 PDF 403：到雲端硬碟把新複製的檔案權限改為「知道連結的任何人可檢視」，或在程式中呼叫 `setSharing(...)`。
- 要用 Google Sites 嵌入嗎？建議直接用 GitHub Pages，Sites 常因 iframe sandbox 導致 CORS 問題。

## 五、自訂
- 美術風格、欄位、排序、額外篩選（例如日期區間）都可以在 `index.html`/`app.js` 直接調整。
