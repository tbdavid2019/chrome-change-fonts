chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'changeFont') {
    document.body.style.fontFamily = request.font;
  }
});

// 在頁面加載時應用存儲的設置
chrome.storage.sync.get('selectedFont', function(result) {
  if (result.selectedFont) {
    document.body.style.fontFamily = result.selectedFont;
  }
});