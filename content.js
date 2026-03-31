let fontChangerStyle;
let currentFontFamily = '';

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
  currentFontFamily = font || '';
  if (!fontChangerStyle) {
    fontChangerStyle = document.createElement('style');
    fontChangerStyle.id = 'font-changer-style';
    (document.head || document.documentElement).appendChild(fontChangerStyle);
  }
  const escapedFont = JSON.stringify(currentFontFamily);
  fontChangerStyle.textContent = `
    html, body, input, textarea, select, button, option, optgroup, body * {
      font-family: ${escapedFont}, sans-serif !important;
    }
  `;
}

function restoreOriginalFont() {
  if (fontChangerStyle) {
    fontChangerStyle.textContent = '';
  }
  currentFontFamily = '';
}

// 在頁面加載時應用存儲的設置
chrome.storage.sync.get(['selectedFont', 'isEnabled'], function(result) {
  if (result.isEnabled && result.selectedFont) {
    applyFont(result.selectedFont);
  }
});

chrome.storage.onChanged.addListener(function(changes, areaName) {
  if (areaName !== 'sync') {
    return;
  }
  const nextFont = changes.selectedFont ? changes.selectedFont.newValue : currentFontFamily;
  const nextEnabled = changes.isEnabled ? changes.isEnabled.newValue : Boolean(currentFontFamily);
  if (nextEnabled && nextFont) {
    applyFont(nextFont);
  } else {
    restoreOriginalFont();
  }
});
