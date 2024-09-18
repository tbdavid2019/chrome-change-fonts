document.addEventListener('DOMContentLoaded', function() {
  const fontSelect = document.getElementById('fontSelect');
  const enableCheckbox = document.getElementById('enableCheckbox');

  // 使用 chrome.fontSettings.getFontList 獲取系統字體
  chrome.fontSettings.getFontList(function(fonts) {
    fonts.forEach(function(font) {
      const option = document.createElement('option');
      option.text = font.displayName;
      option.value = font.fontId;
      fontSelect.add(option);
    });

    // 從存儲中加載設置
    chrome.storage.sync.get(['selectedFont', 'isEnabled'], function(result) {
      if (result.selectedFont) {
        fontSelect.value = result.selectedFont;
      }
      if (result.isEnabled !== undefined) {
        enableCheckbox.checked = result.isEnabled;
      }
      updateFont(); // 立即應用已保存的設置
    });
  });

  // 監聽字體選擇變化
  fontSelect.addEventListener('change', updateFont);

  // 監聽啟用/禁用複選框變化
  enableCheckbox.addEventListener('change', updateFont);

  function updateFont() {
    const selectedFont = fontSelect.value;
    const isEnabled = enableCheckbox.checked;
    chrome.storage.sync.set({selectedFont: selectedFont, isEnabled: isEnabled}, function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'changeFont',
          font: selectedFont,
          isEnabled: isEnabled
        });
      });
    });
  }
});