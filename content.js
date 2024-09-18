let originalFontFamily;
let fontChangerStyle;

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'changeFont') {
    if (request.isEnabled) {
      applyFont(request.font);
    } else {
      restoreOriginalFont();
    }
  }
});

function applyFont(font) {
  if (!originalFontFamily) {
    originalFontFamily = document.body.style.fontFamily;
  }
  if (!fontChangerStyle) {
    fontChangerStyle = document.createElement('style');
    document.head.appendChild(fontChangerStyle);
  }
  fontChangerStyle.textContent = `body, body * { font-family: ${font}, sans-serif !important; }`;
}

function restoreOriginalFont() {
  if (fontChangerStyle) {
    fontChangerStyle.textContent = '';
  }
  if (originalFontFamily) {
    document.body.style.fontFamily = originalFontFamily;
  }
}

// 在頁面加載時應用存儲的設置
chrome.storage.sync.get(['selectedFont', 'isEnabled'], function(result) {
  if (result.isEnabled && result.selectedFont) {
    applyFont(result.selectedFont);
  }
});