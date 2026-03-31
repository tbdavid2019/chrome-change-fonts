const LOCALES = {
  'zh-Hant': {
    title: '改字體 - Font Changer',
    heading: '改字體 - Font Changer',
    description: '選擇系統字體、預覽效果後再套用到目前分頁。',
    fontLabel: '字體',
    toggleLabel: '啟用字體替換',
    statusDisabled: '尚未啟用字體替換。',
    statusEnabled: '已啟用：{font}',
    previewTitle: '即時預覽',
    reset: '重設',
    hint: '提示：預覽區使用與實際網頁相同的字體設定，方便確認呈現效果。',
    previewSample: '快速的棕色狐狸跳過了懶狗 Aa Bb 123',
    defaultFontOption: '系統預設字體',
    applyError: '無法套用字體，請重新整理此分頁後再試。',
    previewAria: '字體預覽文字內容',
    toggleAria: '啟用或停用字體替換',
  },
  en: {
    title: 'Font Changer',
    heading: 'Font Changer',
    description: 'Choose a system font, preview the result, then apply it to the current tab.',
    fontLabel: 'Font',
    toggleLabel: 'Enable font replacement',
    statusDisabled: 'Font replacement is disabled.',
    statusEnabled: 'Enabled: {font}',
    previewTitle: 'Live preview',
    reset: 'Reset',
    hint: 'Tip: the preview uses the same font stack applied to websites for accurate results.',
    previewSample: 'The quick brown fox jumps over the lazy dog Aa Bb 123',
    defaultFontOption: 'System default font',
    applyError: 'Unable to apply the font. Reload this tab and try again.',
    previewAria: 'Font preview text',
    toggleAria: 'Toggle font replacement',
  },
};

document.addEventListener('DOMContentLoaded', function () {
  const ui = {
    title: document.querySelector('title'),
    heading: document.getElementById('headingText'),
    description: document.getElementById('descriptionText'),
    fontLabel: document.getElementById('fontLabel'),
    toggleLabelText: document.getElementById('toggleLabelText'),
    statusText: document.getElementById('statusText'),
    previewTitle: document.getElementById('previewTitle'),
    hintText: document.getElementById('hintText'),
    previewInput: document.getElementById('previewInput'),
    resetButton: document.getElementById('resetButton'),
  };
  const fontSelect = document.getElementById('fontSelect');
  const enableCheckbox = document.getElementById('enableCheckbox');

  const locale = resolveLocale();
  const sortLocale = locale === 'zh-Hant' ? 'zh-Hant' : 'en';
  const messages = LOCALES[locale] || LOCALES.en;
  applyLocale(messages, ui);

  let defaultPreview = messages.previewSample;
  ui.previewInput.value = defaultPreview;

  // 使用 chrome.fontSettings.getFontList 獲取系統字體
  chrome.fontSettings.getFontList(function (fonts) {
    // 先加入系統預設選項
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = messages.defaultFontOption;
    fontSelect.add(defaultOption);

    (Array.isArray(fonts) ? fonts : [])
      .sort((a, b) => a.displayName.localeCompare(b.displayName, sortLocale))
      .forEach(function (font) {
        const option = document.createElement('option');
        option.text = font.displayName;
        option.value = font.displayName;
        option.dataset.fontId = font.fontId;
        fontSelect.add(option);
      });

    // 從存儲中加載設置
    chrome.storage.sync.get(['selectedFont', 'isEnabled'], function (result) {
      if (result.selectedFont) {
        const matchedOption = Array.from(fontSelect.options).find(function (option) {
          return option.value === result.selectedFont || option.dataset.fontId === result.selectedFont;
        });
        fontSelect.value = matchedOption ? matchedOption.value : '';
      }
      if (result.isEnabled !== undefined) {
        enableCheckbox.checked = result.isEnabled;
      }
      updateFont(); // 立即應用已保存的設置
    });
  });

  // 監聽字體選擇變化
  fontSelect.addEventListener('change', function () {
    updateFont();
  });

  // 監聽啟用/禁用複選框變化
  enableCheckbox.addEventListener('change', function () {
    updateFont();
  });

  // 監聽預覽文字內容，確保字體變更即時生效
  ui.previewInput.addEventListener('input', function () {
    applyPreview(fontSelect.value);
  });

  // 重設為預設字體與文字
  ui.resetButton.addEventListener('click', function () {
    fontSelect.selectedIndex = 0;
    enableCheckbox.checked = false;
    ui.previewInput.value = defaultPreview;
    updateFont();
  });

  function updateFont() {
    const selectedFont = fontSelect.value;
    const isEnabled = enableCheckbox.checked;
    chrome.storage.sync.set({ selectedFont: selectedFont, isEnabled: isEnabled }, function () {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (!tabs || !tabs.length) {
          return;
        }
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            action: 'changeFont',
            font: selectedFont,
            isEnabled: isEnabled,
          },
          function () {
            if (chrome.runtime.lastError) {
              ui.statusText.textContent = messages.applyError;
            }
          }
        );
      });
    });
    applyPreview(selectedFont);
    updateStatus(selectedFont, isEnabled);
  }

  function applyPreview(fontId) {
    const fallbackStack = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const stack = fontId ? `'${fontId}', ${fallbackStack}` : fallbackStack;
    ui.previewInput.style.fontFamily = stack;
  }

  function updateStatus(fontId, isEnabled) {
    const selectedOption = fontSelect.options[fontSelect.selectedIndex];
    const fallbackLabel = messages.defaultFontOption;
    const fontLabel = selectedOption ? selectedOption.textContent : fallbackLabel;
    if (isEnabled) {
      ui.statusText.textContent = messages.statusEnabled.replace('{font}', fontLabel);
    } else {
      ui.statusText.textContent = messages.statusDisabled;
    }
  }

  function resolveLocale() {
    const candidates = [
      typeof chrome !== 'undefined' &&
      chrome.i18n &&
      typeof chrome.i18n.getUILanguage === 'function'
        ? chrome.i18n.getUILanguage()
        : null,
      navigator.language,
    ];
    for (const lang of candidates) {
      if (!lang) continue;
      const normalized = lang.toLowerCase();
      if (normalized.startsWith('zh')) {
        return 'zh-Hant';
      }
      return 'en';
    }
    return 'en';
  }

  function applyLocale(texts, elements) {
    document.title = texts.title;
    elements.title.textContent = texts.title;
    elements.heading.textContent = texts.heading;
    elements.description.textContent = texts.description;
    elements.fontLabel.textContent = texts.fontLabel;
    elements.toggleLabelText.textContent = texts.toggleLabel;
    elements.statusText.textContent = texts.statusDisabled;
    elements.previewTitle.textContent = texts.previewTitle;
    elements.hintText.textContent = texts.hint;
    elements.resetButton.textContent = texts.reset;
    elements.previewInput.setAttribute('aria-label', texts.previewAria);
    enableCheckbox.setAttribute('aria-label', texts.toggleAria);
  }
});
