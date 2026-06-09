const LOCALES = {
  'zh-Hant': {
    title: '改字體 333',
    heading: '改字體 333',
    fontLabel: '字體',
    toggleLabel: '啟用字體替換',
    siteDisableLabel: '此網站不生效',
    siteBadgeUnavailable: '未偵測',
    statusDisabled: '尚未啟用字體替換。',
    statusEnabled: '已啟用：{font}',
    statusEnabledAdvanced: '已啟用：CJK / 英數分開',
    statusSiteDisabled: '此網站已排除，不會套用字體替換。',
    previewTitle: '即時預覽',
    reset: '重設',
    defaultFontOption: '系統預設字體',
    applyError: '無法套用字體，請重新整理此分頁後再試。',
    restrictedPageError: '這個頁面不允許擴充套件改字體，例如瀏覽器內建頁或受限制頁面。',
    previewAria: '字體預覽文字內容',
    toggleAria: '啟用或停用字體替換',
    siteToggleAria: '切換目前網站是否停用字體替換',
    languageToggle: 'EN',
    languageToggleAria: '切換介面語言到英文',
    modeHintBasic: '目前是單一字體模式。',
    modeHintAdvanced: '目前是 CJK / 英數分開模式。',
    modeBadgeBasic: '單一字體',
    modeBadgeAdvanced: 'CJK / 英數分開',
    advancedPanelDescription: '把 CJK（中日韓）文字與標點交給一套字體，其餘非 CJK 文字交給另一套字體。',
    advancedCjkLabel: 'CJK（中日韓）',
    advancedLatinLabel: '非 CJK（英數與標點）',
    advancedHelpText: '單一字體與 CJK / 英數分開設定會分開保存，目前所在的分頁會控制頁面。',
  },
  en: {
    title: 'Website Font Changer 333',
    heading: 'Website Font Changer 333',
    fontLabel: 'Font',
    toggleLabel: 'Enable font replacement',
    siteDisableLabel: 'Disable on this site',
    siteBadgeUnavailable: 'Unknown site',
    statusDisabled: 'Font replacement is disabled.',
    statusEnabled: 'Enabled: {font}',
    statusEnabledAdvanced: 'Enabled: CJK / Latin split',
    statusSiteDisabled: 'This site is excluded from font replacement.',
    previewTitle: 'Live preview',
    reset: 'Reset',
    defaultFontOption: 'System default font',
    applyError: 'Unable to apply the font. Reload this tab and try again.',
    restrictedPageError: 'This page does not allow extension font changes, such as browser internal or restricted pages.',
    previewAria: 'Font preview text',
    toggleAria: 'Toggle font replacement',
    siteToggleAria: 'Toggle whether font replacement is disabled on this site',
    languageToggle: '中',
    languageToggleAria: 'Switch interface language to Traditional Chinese',
    modeHintBasic: 'Single font mode is active.',
    modeHintAdvanced: 'CJK / Latin split mode is active.',
    modeBadgeBasic: 'Single font',
    modeBadgeAdvanced: 'CJK / Latin split',
    advancedPanelDescription: 'Use one font for CJK (Chinese, Japanese, Korean) text and punctuation, and another font for non-CJK text.',
    advancedCjkLabel: 'CJK (Chinese / Japanese / Korean)',
    advancedLatinLabel: 'Non-CJK (Latin / numbers / punctuation)',
    advancedHelpText: 'Single-font and CJK / Latin split settings are saved separately. The active tab controls the page.',
  },
};

const UI_LANGUAGE_KEY = 'uiLanguage';
const FONT_MODE_KEY = 'fontMode';
const ADVANCED_FONT_CONFIG_KEY = 'advancedFontConfig';
const FONT_MODE_BASIC = 'basic';
const FONT_MODE_ADVANCED = 'advanced';
const PREVIEW_CJK_FONT_FAMILY = 'PopupFontChangerCjk';
const CJK_UNICODE_RANGE = 'U+3000-303F, U+3100-312F, U+31A0-31BF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+20000-2A6DF, U+2A700-2B73F, U+2B740-2B81F, U+2B820-2CEAF, U+2CEB0-2EBEF, U+2F800-2FA1F';
const FALLBACK_STACK = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const TAGORE_PREVIEW_SAMPLES = [
  "她的熱切的臉，如夜雨似的，攪擾著我的夢魂。\nHer wishful face haunts my dreams like the rain at night.",
  '如果你因失去了太陽而流淚，那麼你也將失去群星了。\nIf you shed tears when you miss the sun, you also miss the stars.',
  '我不能選擇那最好的。\n是那最好的選擇我。\nI cannot choose the best.\nThe best chooses me.',
  '枯竭的河床，並不感謝它的過去。\nThe dry river-bed finds no thanks for its past.',
  '神從創造中找到他自己。\nGod finds himself by creating.',
  '錯誤經不起失敗，但是真理卻不怕失敗。\nWrong cannot afford defeat but Right can.',
  '我們把世界看錯了，反說它欺騙我們。\nWe read the world wrong and say that it deceives us.',
  '刀鞘保護刀的鋒利，它自己則滿足於它的遲鈍。\nThe scabbard is content to be dull when it protects the keenness of the sword.',
  '麻雀看見孔雀負擔著它的翎尾，替它擔憂。\nThe sparrow is sorry for the peacock at the burden of its tail.',
];

document.addEventListener('DOMContentLoaded', function () {
  const ui = {
    title: document.querySelector('title'),
    languageToggle: document.getElementById('languageToggle'),
    heading: document.getElementById('headingText'),
    fontLabel: document.getElementById('fontLabel'),
    toggleLabelText: document.getElementById('toggleLabelText'),
    siteDisableLabelText: document.getElementById('siteDisableLabelText'),
    siteBadge: document.getElementById('siteBadge'),
    statusText: document.getElementById('statusText'),
    previewTitle: document.getElementById('previewTitle'),
    previewInput: document.getElementById('previewInput'),
    resetButton: document.getElementById('resetButton'),
    modeHintText: document.getElementById('modeHintText'),
    basicModeTab: document.getElementById('basicModeTab'),
    advancedModeTab: document.getElementById('advancedModeTab'),
    basicSettingsPanel: document.getElementById('basicSettingsPanel'),
    advancedSettingsPanel: document.getElementById('advancedSettingsPanel'),
    advancedPanelDescription: document.getElementById('advancedPanelDescription'),
    advancedCjkLabel: document.getElementById('advancedCjkLabel'),
    advancedLatinLabel: document.getElementById('advancedLatinLabel'),
    advancedHelpText: document.getElementById('advancedHelpText'),
  };
  const fontSelect = document.getElementById('fontSelect');
  const advancedCjkSelect = document.getElementById('advancedCjkSelect');
  const advancedLatinSelect = document.getElementById('advancedLatinSelect');
  const enableCheckbox = document.getElementById('enableCheckbox');
  const siteDisableCheckbox = document.getElementById('siteDisableCheckbox');
  const previewStyle = document.createElement('style');
  document.head.appendChild(previewStyle);

  let locale = getBrowserLocale();
  let sortLocale = locale === 'zh-Hant' ? 'zh-Hant' : 'en';
  let messages = LOCALES[locale] || LOCALES.en;
  let currentFontMode = FONT_MODE_BASIC;
  let defaultPreview = getRandomPreviewSample();
  let activeTab = null;

  applyLocale(messages, ui);
  ui.previewInput.value = defaultPreview;

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    activeTab = tabs && tabs.length ? tabs[0] : null;
    ui.siteBadge.textContent = getTabLabel(activeTab && activeTab.url) || messages.siteBadgeUnavailable;

    chrome.storage.sync.get([
      UI_LANGUAGE_KEY,
      'selectedFont',
      'isEnabled',
      FONT_MODE_KEY,
      ADVANCED_FONT_CONFIG_KEY,
    ], function (result) {
      if (LOCALES[result[UI_LANGUAGE_KEY]]) {
        locale = result[UI_LANGUAGE_KEY];
        sortLocale = locale === 'zh-Hant' ? 'zh-Hant' : 'en';
        messages = LOCALES[locale] || LOCALES.en;
        applyLocale(messages, ui);
        ui.siteBadge.textContent = getTabLabel(activeTab && activeTab.url) || messages.siteBadgeUnavailable;
      }

      currentFontMode = normalizeFontMode(result[FONT_MODE_KEY]);

      rebuildFontOptions(function () {
        const advancedConfig = getAdvancedFontConfig(result[ADVANCED_FONT_CONFIG_KEY]);
        setSelectValue(fontSelect, result.selectedFont);
        setSelectValue(advancedCjkSelect, advancedConfig.cjkFont || advancedConfig.cjkFontId);
        setSelectValue(advancedLatinSelect, advancedConfig.latinFont || advancedConfig.latinFontId);
        enableCheckbox.checked = Boolean(result.isEnabled);

        syncModeUi();
        applyPreview();
        updateStatus(siteDisableCheckbox.checked);
        syncPageState();
        updateFont();
      });
    });
  });

  ui.languageToggle.addEventListener('click', function () {
    locale = locale === 'zh-Hant' ? 'en' : 'zh-Hant';
    sortLocale = locale === 'zh-Hant' ? 'zh-Hant' : 'en';
    messages = LOCALES[locale] || LOCALES.en;

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

  advancedCjkSelect.addEventListener('change', function () {
    handleAdvancedConfigChange();
  });

  advancedLatinSelect.addEventListener('change', function () {
    handleAdvancedConfigChange();
  });

  ui.basicModeTab.addEventListener('click', function () {
    currentFontMode = FONT_MODE_BASIC;
    syncModeUi();
    updateFont();
  });

  ui.advancedModeTab.addEventListener('click', function () {
    currentFontMode = FONT_MODE_ADVANCED;
    syncModeUi();
    updateFont();
  });

  ui.previewInput.addEventListener('input', function () {
    applyPreview();
  });

  ui.resetButton.addEventListener('click', function () {
    fontSelect.selectedIndex = 0;
    advancedCjkSelect.selectedIndex = 0;
    advancedLatinSelect.selectedIndex = 0;
    currentFontMode = FONT_MODE_BASIC;
    enableCheckbox.checked = false;
    defaultPreview = getRandomPreviewSample();
    ui.previewInput.value = defaultPreview;
    syncModeUi();
    updateFont();
  });

  function handleAdvancedConfigChange() {
    syncModeUi();
    if (currentFontMode === FONT_MODE_ADVANCED) {
      updateFont();
      return;
    }

    persistSettings(function () {
      applyPreview();
    });
  }

  function updateFont() {
    const payload = getCurrentSettings();

    chrome.storage.sync.set(payload, function () {
      if (!activeTab) {
        return;
      }

      sendMessageToTab(activeTab.id, buildChangeFontPayload(payload), function (result) {
        if (!result.ok) {
          ui.statusText.textContent = result.restricted
            ? messages.restrictedPageError
            : messages.applyError;
        }
      });
    });

    applyPreview();
    updateStatus(siteDisableCheckbox.checked);
  }

  function persistSettings(callback) {
    chrome.storage.sync.set(getCurrentSettings(), function () {
      if (typeof callback === 'function') {
        callback();
      }
    });
  }

  function rerenderLocale() {
    rebuildFontOptions(function () {
      applyLocale(messages, ui);
      syncModeUi();
      applyPreview();
      updateStatus(siteDisableCheckbox.checked);
      if (activeTab && activeTab.url) {
        ui.siteBadge.textContent = getTabLabel(activeTab.url) || messages.siteBadgeUnavailable;
      }
      syncPageState();
    });
  }

  function rebuildFontOptions(callback) {
    const selectedBasic = fontSelect.value;
    const selectedCjk = advancedCjkSelect.value;
    const selectedLatin = advancedLatinSelect.value;

    populateFontSelect(fontSelect, selectedBasic);
    populateFontSelect(advancedCjkSelect, selectedCjk);
    populateFontSelect(advancedLatinSelect, selectedLatin);

    chrome.fontSettings.getFontList(function (fonts) {
      const sortedFonts = (Array.isArray(fonts) ? fonts : [])
        .slice()
        .sort((a, b) => a.displayName.localeCompare(b.displayName, sortLocale));

      addDefaultOption(fontSelect);
      addDefaultOption(advancedCjkSelect);
      addDefaultOption(advancedLatinSelect);

      sortedFonts.forEach(function (font) {
        addFontOption(fontSelect, font);
        addFontOption(advancedCjkSelect, font);
        addFontOption(advancedLatinSelect, font);
      });

      setSelectValue(fontSelect, selectedBasic);
      setSelectValue(advancedCjkSelect, selectedCjk);
      setSelectValue(advancedLatinSelect, selectedLatin);
      callback();
    });
  }

  function populateFontSelect(selectElement) {
    selectElement.textContent = '';
  }

  function addDefaultOption(selectElement) {
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = messages.defaultFontOption;
    selectElement.add(defaultOption);
  }

  function addFontOption(selectElement, font) {
    const option = document.createElement('option');
    option.text = font.displayName;
    option.value = font.displayName;
    option.dataset.fontId = font.fontId;
    selectElement.add(option);
  }

  function setSelectValue(selectElement, value) {
    const matchedOption = Array.from(selectElement.options).find(function (option) {
      return option.value === value || option.dataset.fontId === value;
    });
    selectElement.value = matchedOption ? matchedOption.value : '';
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
        updateStatus(siteDisableCheckbox.checked);
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
      updateStatus(siteDisableCheckbox.checked);
    });
  }

  function syncModeUi() {
    const isAdvancedMode = currentFontMode === FONT_MODE_ADVANCED;

    fontSelect.disabled = false;
    ui.modeHintText.textContent = isAdvancedMode ? messages.modeHintAdvanced : messages.modeHintBasic;
    ui.basicModeTab.textContent = messages.modeBadgeBasic;
    ui.advancedModeTab.textContent = messages.modeBadgeAdvanced;
    ui.basicModeTab.setAttribute('aria-selected', String(!isAdvancedMode));
    ui.advancedModeTab.setAttribute('aria-selected', String(isAdvancedMode));
    ui.basicSettingsPanel.hidden = isAdvancedMode;
    ui.advancedSettingsPanel.hidden = !isAdvancedMode;
  }

  function buildChangeFontPayload(settings) {
    return {
      action: 'changeFont',
      font: settings.selectedFont,
      isEnabled: settings.isEnabled,
      fontMode: settings[FONT_MODE_KEY],
      advancedFontConfig: settings[ADVANCED_FONT_CONFIG_KEY],
    };
  }

  function getCurrentSettings() {
    return {
      selectedFont: fontSelect.value,
      isEnabled: enableCheckbox.checked,
      [FONT_MODE_KEY]: currentFontMode,
      [ADVANCED_FONT_CONFIG_KEY]: getCurrentAdvancedFontConfig(),
    };
  }

  function getCurrentAdvancedFontConfig() {
    return {
      cjkFont: advancedCjkSelect.value,
      cjkFontId: getSelectedFontId(advancedCjkSelect),
      latinFont: advancedLatinSelect.value,
      latinFontId: getSelectedFontId(advancedLatinSelect),
    };
  }

  function applyPreview() {
    const isAdvancedMode = currentFontMode === FONT_MODE_ADVANCED;
    const advancedConfig = getCurrentAdvancedFontConfig();

    if (isAdvancedMode && (advancedConfig.cjkFont || advancedConfig.latinFont)) {
      previewStyle.textContent = buildPreviewCompositeCss(advancedConfig);
      ui.previewInput.style.fontFamily = getAdvancedPreviewFontStack(advancedConfig);
      return;
    }

    previewStyle.textContent = '';
    const stack = fontSelect.value ? `${JSON.stringify(fontSelect.value)}, ${FALLBACK_STACK}` : FALLBACK_STACK;
    ui.previewInput.style.fontFamily = stack;
  }

  function buildPreviewCompositeCss(config) {
    if (!config.cjkFont) {
      return '';
    }

    return `
@font-face {
  font-family: ${JSON.stringify(PREVIEW_CJK_FONT_FAMILY)};
  src: ${buildLocalFontSources(config.cjkFont, config.cjkFontId)};
  unicode-range: ${CJK_UNICODE_RANGE};
  font-weight: 100 900;
  font-style: normal;
}`;
  }

  function getAdvancedPreviewFontStack(config) {
    const stack = [];
    if (config.cjkFont) {
      stack.push(JSON.stringify(PREVIEW_CJK_FONT_FAMILY));
    }
    if (config.latinFont) {
      stack.push(JSON.stringify(config.latinFont));
    }
    stack.push(FALLBACK_STACK);
    return stack.join(', ');
  }

  function updateStatus(isSiteDisabled) {
    if (enableCheckbox.checked && isSiteDisabled) {
      ui.statusText.textContent = messages.statusSiteDisabled;
      return;
    }

    if (enableCheckbox.checked) {
      if (currentFontMode === FONT_MODE_ADVANCED) {
        ui.statusText.textContent = messages.statusEnabledAdvanced;
        return;
      }

      const selectedOption = fontSelect.options[fontSelect.selectedIndex];
      const fallbackLabel = messages.defaultFontOption;
      const fontLabel = selectedOption ? selectedOption.textContent : fallbackLabel;
      ui.statusText.textContent = messages.statusEnabled.replace('{font}', fontLabel);
      return;
    }

    ui.statusText.textContent = messages.statusDisabled;
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

  function getRandomPreviewSample() {
    const index = Math.floor(Math.random() * TAGORE_PREVIEW_SAMPLES.length);
    return TAGORE_PREVIEW_SAMPLES[index] || '';
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

  function getTabLabel(url) {
    if (!url) return '';
    try {
      return new URL(url).host;
    } catch (_error) {
      return '';
    }
  }

  function normalizeFontMode(mode) {
    return mode === FONT_MODE_ADVANCED ? FONT_MODE_ADVANCED : FONT_MODE_BASIC;
  }

  function getAdvancedFontConfig(config) {
    return {
      cjkFont: config && typeof config.cjkFont === 'string' ? config.cjkFont : '',
      cjkFontId: config && typeof config.cjkFontId === 'string' ? config.cjkFontId : '',
      latinFont: config && typeof config.latinFont === 'string' ? config.latinFont : '',
      latinFontId: config && typeof config.latinFontId === 'string' ? config.latinFontId : '',
    };
  }

  function getSelectedFontId(selectElement) {
    const option = selectElement.options[selectElement.selectedIndex];
    return option && option.dataset.fontId ? option.dataset.fontId : '';
  }

  function buildLocalFontSources(displayName, fontId) {
    const names = [displayName, fontId]
      .filter((name) => typeof name === 'string' && name)
      .filter((name, index, array) => array.indexOf(name) === index);

    return names.map((name) => `local(${JSON.stringify(name)})`).join(', ');
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
    elements.fontLabel.textContent = texts.fontLabel;
    elements.toggleLabelText.textContent = texts.toggleLabel;
    elements.siteDisableLabelText.textContent = texts.siteDisableLabel;
    elements.siteBadge.textContent = texts.siteBadgeUnavailable;
    elements.statusText.textContent = texts.statusDisabled;
    elements.previewTitle.textContent = texts.previewTitle;
    elements.resetButton.textContent = texts.reset;
    elements.previewInput.setAttribute('aria-label', texts.previewAria);
    elements.modeHintText.textContent = texts.modeHintBasic;
    elements.basicModeTab.textContent = texts.modeBadgeBasic;
    elements.advancedModeTab.textContent = texts.modeBadgeAdvanced;
    elements.advancedPanelDescription.textContent = texts.advancedPanelDescription;
    elements.advancedCjkLabel.textContent = texts.advancedCjkLabel;
    elements.advancedLatinLabel.textContent = texts.advancedLatinLabel;
    elements.advancedHelpText.textContent = texts.advancedHelpText;
    enableCheckbox.setAttribute('aria-label', texts.toggleAria);
    siteDisableCheckbox.setAttribute('aria-label', texts.siteToggleAria);
  }
});
