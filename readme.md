# Font Changer Chrome Extension

Oli Font Changer 是一個簡單而強大的 Chrome 擴展，允許用戶輕鬆更改任何網站的字體。

## 功能

- 從系統可用的所有字體中選擇
- 啟用/禁用字體更改
- 即時預覽字體更改
- 設置會自動保存

## 安裝

1. 下載或克隆此倉庫到您的本地機器。
2. 打開 Chrome 瀏覽器，進入 `chrome://extensions/`。
3. 在右上角啟用「開發者模式」。
4. 點擊「載入未封裝項目」。
5. 選擇包含擴展文件的文件夾。

## 使用方法

1. 點擊 Chrome 工具欄中的 Font Changer 圖標。
2. 從下拉菜單中選擇您想要的字體。
3. 使用複選框啟用或禁用字體更改。
4. 您選擇的字體將立即應用到當前頁面。

## 技術細節

- 使用 Chrome Extension Manifest V3
- 利用 chrome.fontSettings API 獲取系統字體
- 使用 content script 動態修改網頁樣式

## 文件結構

- `manifest.json`: 擴展配置文件
- `popup.html`: 彈出窗口的 HTML
- `popup.js`: 彈出窗口的 JavaScript
- `content.js`: 內容腳本，用於修改網頁字體
- `images/`: 包含擴展圖標的文件夾

## 貢獻

歡迎提出問題或提交 Pull Requests 來改進這個項目。

## 許可證

本項目採用 MIT 許可證。詳情請見 [LICENSE](LICENSE) 文件。

## 作者

[您的名字]

## 致謝

感謝所有為這個項目提供幫助和靈感的人。
