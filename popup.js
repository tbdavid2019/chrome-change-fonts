const LOCALES = {
  'zh-Hant': {
    title: '改字體 - Font Changer',
    heading: '改字體 - Font Changer',
    description: '選擇系統字體、預覽效果後再套用到目前分頁。',
    fontLabel: '字體',
    toggleLabel: '啟用字體替換',
    siteDisableLabel: '此網站不生效',
    siteBadgeUnavailable: '未偵測',
    statusDisabled: '尚未啟用字體替換。',
    statusEnabled: '已啟用：{font}',
    statusSiteDisabled: '此網站已排除，不會套用字體替換。',
    previewTitle: '即時預覽',
    reset: '重設',
    hint: '提示：預覽區使用與實際網頁相同的字體設定，方便確認呈現效果。',
    previewSample: '快速的棕色狐狸跳過了懶狗 Aa Bb 123',
    defaultFontOption: '系統預設字體',
    applyError: '無法套用字體，請重新整理此分頁後再試。',
    restrictedPageError: '這個頁面不允許擴充套件改字體，例如瀏覽器內建頁或受限制頁面。',
    previewAria: '字體預覽文字內容',
    toggleAria: '啟用或停用字體替換',
    siteToggleAria: '切換目前網站是否停用字體替換',
    languageToggle: 'EN',
    languageToggleAria: '切換介面語言到英文',
  },
  en: {
    title: 'Font Changer',
    heading: 'Font Changer',
    description: 'Choose a system font, preview the result, then apply it to the current tab.',
    fontLabel: 'Font',
    toggleLabel: 'Enable font replacement',
    siteDisableLabel: 'Disable on this site',
    siteBadgeUnavailable: 'Unknown site',
    statusDisabled: 'Font replacement is disabled.',
    statusEnabled: 'Enabled: {font}',
    statusSiteDisabled: 'This site is excluded from font replacement.',
    previewTitle: 'Live preview',
    reset: 'Reset',
    hint: 'Tip: the preview uses the same font stack applied to websites for accurate results.',
    previewSample: 'The quick brown fox jumps over the lazy dog Aa Bb 123',
    defaultFontOption: 'System default font',
    applyError: 'Unable to apply the font. Reload this tab and try again.',
    restrictedPageError: 'This page does not allow extension font changes, such as browser internal or restricted pages.',
    previewAria: 'Font preview text',
    toggleAria: 'Toggle font replacement',
    siteToggleAria: 'Toggle whether font replacement is disabled on this site',
    languageToggle: '中',
    languageToggleAria: 'Switch interface language to Traditional Chinese',
  },
};

const UI_LANGUAGE_KEY = 'uiLanguage';

document.addEventListener('DOMContentLoaded', function () {
  const ui = {
    title: document.querySelector('title'),
    languageToggle: document.getElementById('languageToggle'),
    heading: document.getElementById('headingText'),
    description: document.getElementById('descriptionText'),
    fontLabel: document.getElementById('fontLabel'),
    toggleLabelText: document.getElementById('toggleLabelText'),
    siteDisableLabelText: document.getElementById('siteDisableLabelText'),
    siteBadge: document.getElementById('siteBadge'),
    statusText: document.getElementById('statusText'),
    previewTitle: document.getElementById('previewTitle'),
    hintText: document.getElementById('hintText'),
    previewInput: document.getElementById('previewInput'),
    resetButton: document.getElementById('resetButton'),
  };
  const fontSelect = document.getElementById('fontSelect');
  const enableCheckbox = document.getElementById('enableCheckbox');
  const siteDisableCheckbox = document.getElementById('siteDisableCheckbox');

  let locale = getBrowserLocale();
  let sortLocale = locale === 'zh-Hant' ? 'zh-Hant' : 'en';
  let messages = LOCALES[locale] || LOCALES.en;
  applyLocale(messages, ui);

  let defaultPreview = messages.previewSample;
  let activeTab = null;

  ui.previewInput.value = defaultPreview;

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    activeTab = tabs && tabs.length ? tabs[0] : null;
    ui.siteBadge.textContent = getTabLabel(activeTab && activeTab.url) || messages.siteBadgeUnavailable;

    chrome.storage.sync.get([UI_LANGUAGE_KEY, 'selectedFont', 'isEnabled'], function (result) {
      if (LOCALES[result[UI_LANGUAGE_KEY]]) {
        locale = result[UI_LANGUAGE_KEY];
        sortLocale = locale === 'zh-Hant' ? 'zh-Hant' : 'en';
        messages = LOCALES[locale] || LOCALES.en;
        defaultPreview = messages.previewSample;
        applyLocale(messages, ui);
        ui.previewInput.value = defaultPreview;
        ui.siteBadge.textContent = getTabLabel(activeTab && activeTab.url) || messages.siteBadgeUnavailable;
      }

      rebuildFontOptions(function () {
        if (result.selectedFont) {
          const matchedOption = Array.from(fontSelect.options).find(function (option) {
            return option.value === result.selectedFont || option.dataset.fontId === result.selectedFont;
          });
          fontSelect.value = matchedOption ? matchedOption.value : '';
        }
        if (result.isEnabled !== undefined) {
          enableCheckbox.checked = result.isEnabled;
        }

        applyPreview(fontSelect.value);
        updateStatus(fontSelect.value, enableCheckbox.checked, siteDisableCheckbox.checked);
        syncPageState();
        updateFont();
      });
    });
  });

  ui.languageToggle.addEventListener('click', function () {
    locale = locale === 'zh-Hant' ? 'en' : 'zh-Hant';
    sortLocale = locale === 'zh-Hant' ? 'zh-Hant' : 'en';
    messages = LOCALES[locale] || LOCALES.en;
    defaultPreview = messages.previewSample;

    chrome.storage.sync.set({ [UI_LANGUAGE_KEY]: locale });
    rerenderLocale();
  });

  fontSelect.addEventListener('change', function () {
    updateFont();
  });

  enableCheckbox.addEventListener('change', function () {
    updateFont();
  });

  siteDisableCheckbox.addEventListener('change', function () {
    updateSiteDisable();
  });

  ui.previewInput.addEventListener('input', function () {
    applyPreview(fontSelect.value);
  });

  ui.resetButton.addEventListener('click', function () {
    fontSelect.selectedIndex = 0;
    enableCheckbox.checked = false;
    ui.previewInput.value = defaultPreview;
    updateFont();
  });

  function updateFont() {
    const selectedFont = fontSelect.value;
    const isEnabled = enableCheckbox.checked;
    const payload = {
      action: 'changeFont',
      font: selectedFont,
      isEnabled: isEnabled,
    };

    chrome.storage.sync.set({ selectedFont: selectedFont, isEnabled: isEnabled }, function () {
      if (!activeTab) {
        return;
      }

      sendMessageToTab(activeTab.id, payload, function (result) {
        if (!result.ok) {
          ui.statusText.textContent = result.restricted
            ? messages.restrictedPageError
            : messages.applyError;
        }
      });
    });

    applyPreview(selectedFont);
    updateStatus(selectedFont, isEnabled, siteDisableCheckbox.checked);
  }

  function rerenderLocale() {
    const previousPreview = ui.previewInput.value;
    const shouldResetPreview = previousPreview === LOCALES.en.previewSample || previousPreview === LOCALES['zh-Hant'].previewSample;

    rebuildFontOptions(function () {
      applyLocale(messages, ui);
      if (shouldResetPreview) {
        ui.previewInput.value = defaultPreview;
      }
      applyPreview(fontSelect.value);
      updateStatus(fontSelect.value, enableCheckbox.checked, siteDisableCheckbox.checked);
      if (activeTab && activeTab.url) {
        ui.siteBadge.textContent = getTabLabel(activeTab.url) || messages.siteBadgeUnavailable;
      }
      syncPageState();
    });
  }

  function rebuildFontOptions(callback) {
    const selectedFont = fontSelect.value;
    fontSelect.textContent = '';

    chrome.fontSettings.getFontList(function (fonts) {
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

      const matchedOption = Array.from(fontSelect.options).find(function (option) {
        return option.value === selectedFont || option.dataset.fontId === selectedFont;
      });
      fontSelect.value = matchedOption ? matchedOption.value : '';
      callback();
    });
  }

  function updateSiteDisable() {
    if (!activeTab) {
      return;
    }

    sendMessageToTab(
      activeTab.id,
      { action: 'setSiteDisabled', isDisabled: siteDisableCheckbox.checked },
      function (result) {
        if (!result.ok) {
          ui.statusText.textContent = result.restricted
            ? messages.restrictedPageError
            : messages.applyError;
          return;
        }

        siteDisableCheckbox.checked = Boolean(result.response && result.response.isSiteDisabled);
        updateStatus(fontSelect.value, enableCheckbox.checked, siteDisableCheckbox.checked);
      }
    );
  }

  function syncPageState() {
    if (!activeTab) {
      siteDisableCheckbox.disabled = true;
      return;
    }

    sendMessageToTab(activeTab.id, { action: 'getPageState' }, function (result) {
      if (!result.ok || !result.response) {
        siteDisableCheckbox.disabled = true;
        return;
      }

      siteDisableCheckbox.disabled = false;
      siteDisableCheckbox.checked = Boolean(result.response.isSiteDisabled);
      ui.siteBadge.textContent = result.response.host || ui.siteBadge.textContent;
      updateStatus(fontSelect.value, enableCheckbox.checked, siteDisableCheckbox.checked);
    });
  }

  function sendMessageToTab(tabId, payload, callback) {
    ensureContentScript(tabId, function (result) {
      if (!result.ok) {
        callback(result);
        return;
      }

      chrome.tabs.sendMessage(tabId, payload, function (response) {
        callback({
          ok: !chrome.runtime.lastError,
          restricted: chrome.runtime.lastError
            ? isRestrictedPageError(chrome.runtime.lastError.message)
            : false,
          response: response,
        });
      });
    });
  }

  function ensureContentScript(tabId, callback) {
    chrome.tabs.sendMessage(tabId, { action: 'getPageState' }, function () {
      if (!chrome.runtime.lastError) {
        callback({ ok: true, restricted: false });
        return;
      }

      chrome.scripting.executeScript(
        {
          target: { tabId: tabId, allFrames: true },
          files: ['content.js'],
        },
        function () {
          if (chrome.runtime.lastError) {
            callback({
              ok: false,
              restricted: isRestrictedPageError(chrome.runtime.lastError.message),
            });
            return;
          }

          callback({ ok: true, restricted: false });
        }
      );
    });
  }

  function applyPreview(fontId) {
    const fallbackStack = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const stack = fontId ? `'${fontId}', ${fallbackStack}` : fallbackStack;
    ui.previewInput.style.fontFamily = stack;
  }

  function isRestrictedPageError(message) {
    return [
      'Cannot access a chrome:// URL',
      'The extensions gallery cannot be scripted',
      'Cannot access contents of url',
      'Missing host permission',
    ].some(function (snippet) {
      return typeof message === 'string' && message.includes(snippet);
    });
  }

  function updateStatus(fontId, isEnabled, isSiteDisabled) {
    const selectedOption = fontSelect.options[fontSelect.selectedIndex];
    const fallbackLabel = messages.defaultFontOption;
    const fontLabel = selectedOption ? selectedOption.textContent : fallbackLabel;

    if (isEnabled && isSiteDisabled) {
      ui.statusText.textContent = messages.statusSiteDisabled;
      return;
    }

    if (isEnabled) {
      ui.statusText.textContent = messages.statusEnabled.replace('{font}', fontLabel);
      return;
    }

    ui.statusText.textContent = messages.statusDisabled;
  }

  function getTabLabel(url) {
    if (!url) return '';
    try {
      return new URL(url).host;
    } catch (_error) {
      return '';
    }
  }

  function getBrowserLocale() {
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
    elements.languageToggle.textContent = texts.languageToggle;
    elements.languageToggle.setAttribute('aria-label', texts.languageToggleAria);
    elements.heading.textContent = texts.heading;
    elements.description.textContent = texts.description;
    elements.fontLabel.textContent = texts.fontLabel;
    elements.toggleLabelText.textContent = texts.toggleLabel;
    elements.siteDisableLabelText.textContent = texts.siteDisableLabel;
    elements.siteBadge.textContent = texts.siteBadgeUnavailable;
    elements.statusText.textContent = texts.statusDisabled;
    elements.previewTitle.textContent = texts.previewTitle;
    elements.hintText.textContent = texts.hint;
    elements.resetButton.textContent = texts.reset;
    elements.previewInput.setAttribute('aria-label', texts.previewAria);
    enableCheckbox.setAttribute('aria-label', texts.toggleAria);
    siteDisableCheckbox.setAttribute('aria-label', texts.siteToggleAria);
  }
});
