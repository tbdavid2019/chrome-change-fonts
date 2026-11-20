(function (global) {
  'use strict';

  var SHARED = global.FontChangerShared || (typeof require === 'function' ? require('./shared.js') : null);

  var LOCALES = {
    'zh-Hant': {
      title: '改字體 333',
      heading: '改字體 333',
      fontLabel: '字體',
      toggleLabel: '啟用字體替換',
      siteDisableLabel: '此網站不生效',
      siteBadgeUnavailable: '受限頁面',
      statusDisabled: '尚未啟用字體替換。',
      statusEnabled: '已啟用：{font}',
      statusEnabledAdvanced: '已啟用：CJK / 英數分開',
      statusSiteDisabled: '此網站已排除，不會套用字體替換。',
      statusIncognitoExcluded: '無痕分頁暫停套用此網站（僅限目前分頁有效）。',
      statusRestrictedGlobalSaved: '此頁面不允許修改樣式；全域設定已儲存並套用於其他網站。',
      previewTitle: '即時預覽',
      reset: '重設',
      defaultFontOption: '系統預設字體',
      unavailableFontLabel: '{font}（本機未安裝）',
      applyError: '無法套用字體，請重新整理此分頁後再試。',
      restrictedPageError: '這個頁面不允許擴充套件改字體，例如瀏覽器內建頁或受限制頁面。',
      storageWriteError: '儲存設定失敗，請稍後再試。',
      syncQuotaExceededError: '雲端同步排除網站數量已達上限，請先取消部分站點排除後再試。',
      previewAria: '字體預覽文字內容',
      toggleAria: '啟用或停用字體替換',
      siteToggleAria: '切換目前網站是否停用字體替換',
      languageToggle: 'EN',
      languageToggleAria: '切換介面語言到英文',
      modeHintBasic: '目前是單一字體模式。',
      modeHintAdvanced: '目前是 CJK / 英數分開模式。',
      modeBadgeBasic: '單一字體',
      modeBadgeAdvanced: 'CJK / 英數分開',
      advancedPanelDescription: 'CJK（中日韓）用一套字體，其餘文字用另一套。',
      advancedCjkLabel: 'CJK（中日韓）',
      advancedLatinLabel: '非 CJK（英數與標點）',
      advancedHelpText: '單一字體與 CJK / 英數分開設定皆套用至全域，僅單站排除依網站個別生效。',
    },
    en: {
      title: 'Website Font Changer 333',
      heading: 'Website Font Changer 333',
      fontLabel: 'Font',
      toggleLabel: 'Enable font replacement',
      siteDisableLabel: 'Disable on this site',
      siteBadgeUnavailable: 'Restricted',
      statusDisabled: 'Font replacement is disabled.',
      statusEnabled: 'Enabled: {font}',
      statusEnabledAdvanced: 'Enabled: CJK / Latin split',
      statusSiteDisabled: 'This site is excluded from font replacement.',
      statusIncognitoExcluded: 'Excluded for this incognito tab only (not synced).',
      statusRestrictedGlobalSaved: 'This page cannot be modified; global preferences remain saved for other sites.',
      previewTitle: 'Live preview',
      reset: 'Reset',
      defaultFontOption: 'System default font',
      unavailableFontLabel: '{font} (Not installed on this device)',
      applyError: 'Unable to apply the font. Reload this tab and try again.',
      restrictedPageError: 'This page does not allow extension font changes, such as browser internal or restricted pages.',
      storageWriteError: 'Failed to save preferences. Please try again.',
      syncQuotaExceededError: 'Sync exclusion quota reached. Remove some excluded sites before adding more.',
      previewAria: 'Font preview text',
      toggleAria: 'Toggle font replacement',
      siteToggleAria: 'Toggle whether font replacement is disabled on this site',
      languageToggle: '中',
      languageToggleAria: 'Switch interface language to Traditional Chinese',
      modeHintBasic: 'Single font mode is active.',
      modeHintAdvanced: 'CJK / Latin split mode is active.',
      modeBadgeBasic: 'Single font',
      modeBadgeAdvanced: 'CJK / Latin split',
      advancedPanelDescription: 'Use one font for CJK text, and another for everything else.',
      advancedCjkLabel: 'CJK (Chinese / Japanese / Korean)',
      advancedLatinLabel: 'Non-CJK (Latin / numbers / punctuation)',
      advancedHelpText: 'Single-font and CJK / Latin split preferences apply globally; only site exclusions apply per site.',
    },
  };

  var TAGORE_PREVIEW_SAMPLES = [
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

  function getBrowserLocale(navObj, chromeObj) {
    var lang = '';
    if (chromeObj && chromeObj.i18n && typeof chromeObj.i18n.getUILanguage === 'function') {
      lang = chromeObj.i18n.getUILanguage() || '';
    }
    if (!lang && navObj) {
      lang = navObj.language || (navObj.languages && navObj.languages[0]) || '';
    }
    return /^zh(?:[-_](?:hant|tw|hk|mo))?\b/i.test(lang) ? 'zh-Hant' : 'en';
  }

  function isQuotaError(message) {
    return typeof message === 'string' && /quota|MAX_ITEMS|QUOTA_BYTES/i.test(message);
  }

  function isRestrictedPageError(message) {
    return [
      'Cannot access a chrome:// URL',
      'The extensions gallery cannot be scripted',
      'Cannot access contents of url',
      'Missing host permission',
    ].some(function (snippet) {
      return typeof message === 'string' && message.indexOf(snippet) !== -1;
    });
  }

  function initPopup(deps) {
    var d = deps || {};
    var doc = d.document || global.document;
    var win = d.window || global.window || global;
    var chromeApi = d.chrome || global.chrome;
    var shared = d.shared || SHARED;

    var ui = {
      title: doc.querySelector('title'),
      languageToggle: doc.getElementById('languageToggle'),
      heading: doc.getElementById('headingText'),
      fontLabel: doc.getElementById('fontLabel'),
      toggleLabelText: doc.getElementById('toggleLabelText'),
      siteDisableLabelText: doc.getElementById('siteDisableLabelText'),
      siteBadge: doc.getElementById('siteBadge'),
      statusText: doc.getElementById('statusText'),
      previewTitle: doc.getElementById('previewTitle'),
      previewInput: doc.getElementById('previewInput'),
      resetButton: doc.getElementById('resetButton'),
      modeHintText: doc.getElementById('modeHintText'),
      basicModeTab: doc.getElementById('basicModeTab'),
      advancedModeTab: doc.getElementById('advancedModeTab'),
      basicSettingsPanel: doc.getElementById('basicSettingsPanel'),
      advancedSettingsPanel: doc.getElementById('advancedSettingsPanel'),
      advancedPanelDescription: doc.getElementById('advancedPanelDescription'),
      advancedCjkLabel: doc.getElementById('advancedCjkLabel'),
      advancedLatinLabel: doc.getElementById('advancedLatinLabel'),
      advancedHelpText: doc.getElementById('advancedHelpText'),
    };
    var fontSelect = doc.getElementById('fontSelect');
    var advancedCjkSelect = doc.getElementById('advancedCjkSelect');
    var advancedLatinSelect = doc.getElementById('advancedLatinSelect');
    var enableCheckbox = doc.getElementById('enableCheckbox');
    var siteDisableCheckbox = doc.getElementById('siteDisableCheckbox');

    var previewStyle = doc.createElement('style');
    if (doc.head) {
      doc.head.appendChild(previewStyle);
    }

    var previewSlotCache = new Map();
    var previewProbeSeq = 0;
    var ensureInFlightCallbacks = Object.create(null);

    var state = {
      locale: getBrowserLocale(win && win.navigator, chromeApi),
      fontMode: shared.FONT_MODE_BASIC,
      selectedFont: '',
      advancedFontConfig: shared.createAdvancedFontConfig(),
      isEnabled: false,
      systemFonts: [],
      tabId: null,
      tabUrl: '',
      siteKey: null,
      restricted: true,
      incognito: false,
      siteDisabled: false,
      lastErrorMsg: '',
    };

    function getMsgs() {
      return LOCALES[state.locale] || LOCALES.en;
    }

    function getRandomPreviewSample() {
      var index = Math.floor(Math.random() * TAGORE_PREVIEW_SAMPLES.length);
      return TAGORE_PREVIEW_SAMPLES[index] || '';
    }

    function applyLocaleLabels() {
      var msgs = getMsgs();
      if (doc.documentElement) {
        doc.documentElement.lang = state.locale;
      }
      if (ui.title) ui.title.textContent = msgs.title;
      ui.heading.textContent = msgs.heading;
      ui.fontLabel.textContent = msgs.fontLabel;
      ui.toggleLabelText.textContent = msgs.toggleLabel;
      ui.siteDisableLabelText.textContent = msgs.siteDisableLabel;
      ui.previewTitle.textContent = msgs.previewTitle;
      ui.resetButton.textContent = msgs.reset;
      ui.languageToggle.textContent = msgs.languageToggle;
      ui.languageToggle.setAttribute('aria-label', msgs.languageToggleAria);
      ui.previewInput.setAttribute('aria-label', msgs.previewAria);
      enableCheckbox.setAttribute('aria-label', msgs.toggleAria);
      siteDisableCheckbox.setAttribute('aria-label', msgs.siteToggleAria);
      ui.basicModeTab.textContent = msgs.modeBadgeBasic;
      ui.advancedModeTab.textContent = msgs.modeBadgeAdvanced;
      ui.advancedPanelDescription.textContent = msgs.advancedPanelDescription;
      ui.advancedCjkLabel.textContent = msgs.advancedCjkLabel;
      ui.advancedLatinLabel.textContent = msgs.advancedLatinLabel;
      ui.advancedHelpText.textContent = msgs.advancedHelpText;
    }

    function updateModePanelsUi() {
      var msgs = getMsgs();
      var isAdvanced = state.fontMode === shared.FONT_MODE_ADVANCED;
      ui.basicModeTab.setAttribute('aria-selected', String(!isAdvanced));
      ui.advancedModeTab.setAttribute('aria-selected', String(isAdvanced));
      ui.basicSettingsPanel.hidden = isAdvanced;
      ui.advancedSettingsPanel.hidden = !isAdvanced;
      ui.modeHintText.textContent = isAdvanced ? msgs.modeHintAdvanced : msgs.modeHintBasic;
      if (doc.body && doc.body.classList) {
        doc.body.classList.toggle('advanced-mode', isAdvanced);
      }
    }

    function populateSelectWithFonts(selectEl, storedName, storedFontId) {
      var msgs = getMsgs();
      var sortLoc = state.locale === 'zh-Hant' ? 'zh-Hant' : 'en';
      selectEl.textContent = '';

      var defaultOpt = doc.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = msgs.defaultFontOption;
      selectEl.add(defaultOpt);

      var sorted = state.systemFonts.slice().sort(function (a, b) {
        return String(a.displayName || '').localeCompare(String(b.displayName || ''), sortLoc);
      });

      for (var i = 0; i < sorted.length; i++) {
        var font = sorted[i];
        var opt = doc.createElement('option');
        opt.value = font.displayName;
        opt.textContent = font.displayName;
        opt.dataset.fontId = font.fontId;
        selectEl.add(opt);
      }

      if (!storedName && !storedFontId) {
        selectEl.selectedIndex = 0;
        selectEl.value = '';
        return;
      }

      var options = Array.from(selectEl.options);
      var matchIdx = options.findIndex(function (o) {
        return o.value === storedName || (storedFontId && o.dataset.fontId === storedFontId);
      });

      if (matchIdx !== -1) {
        selectEl.selectedIndex = matchIdx;
        selectEl.value = options[matchIdx].value;
        return;
      }

      // Preserve synced font from another OS without overwriting chrome.storage.sync.
      var labelName = storedName || storedFontId;
      var missingOpt = doc.createElement('option');
      missingOpt.value = labelName;
      missingOpt.dataset.fontId = storedFontId || labelName;
      missingOpt.dataset.unavailable = '1';
      missingOpt.textContent = msgs.unavailableFontLabel.replace('{font}', labelName);
      selectEl.add(missingOpt, selectEl.options.length > 1 ? selectEl.options[1] : null);
      selectEl.selectedIndex = 1;
      selectEl.value = labelName;
    }

    function renderFontSelectors() {
      populateSelectWithFonts(fontSelect, state.selectedFont, state.selectedFont);
      populateSelectWithFonts(
        advancedCjkSelect,
        state.advancedFontConfig.cjkFont || state.advancedFontConfig.cjkFontId,
        state.advancedFontConfig.cjkFontId
      );
      populateSelectWithFonts(
        advancedLatinSelect,
        state.advancedFontConfig.latinFont || state.advancedFontConfig.latinFontId,
        state.advancedFontConfig.latinFontId
      );
    }

    function updateSiteBadgeUi() {
      var msgs = getMsgs();
      if (state.restricted || !state.siteKey) {
        siteDisableCheckbox.checked = false;
        siteDisableCheckbox.disabled = true;
        ui.siteBadge.textContent = msgs.siteBadgeUnavailable;
        ui.siteBadge.title = msgs.siteBadgeUnavailable;
      } else {
        siteDisableCheckbox.disabled = false;
        siteDisableCheckbox.checked = Boolean(state.siteDisabled);
        ui.siteBadge.textContent = state.siteKey;
        ui.siteBadge.title = state.siteKey;
      }
    }

    function setStatus(text, statusClass) {
      if (ui.statusText.classList) {
        ui.statusText.classList.remove('status-active', 'status-excluded', 'status-error');
        if (statusClass) {
          ui.statusText.classList.add(statusClass);
        }
      }
      ui.statusText.textContent = text;
    }

    function updateStatusUi() {
      var msgs = getMsgs();
      if (state.lastErrorMsg) {
        setStatus(state.lastErrorMsg, 'status-error');
        return;
      }
      if (!state.restricted && state.siteDisabled) {
        setStatus(
          state.incognito ? msgs.statusIncognitoExcluded : msgs.statusSiteDisabled,
          'status-excluded'
        );
        return;
      }
      if (!state.isEnabled) {
        setStatus(msgs.statusDisabled, '');
        return;
      }
      if (state.restricted) {
        setStatus(msgs.statusRestrictedGlobalSaved, '');
        return;
      }
      if (state.fontMode === shared.FONT_MODE_ADVANCED) {
        setStatus(msgs.statusEnabledAdvanced, 'status-active');
        return;
      }
      var activeName = state.selectedFont || msgs.defaultFontOption;
      setStatus(msgs.statusEnabled.replace('{font}', activeName), 'status-active');
    }

    function renderPreviewStyles() {
      var stack = shared.getFontStack(
        state.fontMode,
        state.selectedFont,
        state.advancedFontConfig,
        shared.PREVIEW_CJK_FONT_FAMILY,
        shared.PREVIEW_LATIN_FONT_FAMILY
      );

      var faceCss = '';
      if (state.fontMode === shared.FONT_MODE_ADVANCED) {
        var cfg = state.advancedFontConfig;
        if (cfg.cjkFont || cfg.cjkFontId) {
          var cjkSlots = previewSlotCache.get(String(cfg.cjkFont || '') + '\0' + String(cfg.cjkFontId || ''));
          faceCss += shared.buildRestrictedFontFaceSetCss(
            shared.PREVIEW_CJK_FONT_FAMILY,
            cfg.cjkFont,
            cfg.cjkFontId,
            shared.CJK_UNICODE_RANGE,
            cjkSlots
          );
        }
        if (cfg.latinFont || cfg.latinFontId) {
          var latinSlots = previewSlotCache.get(String(cfg.latinFont || '') + '\0' + String(cfg.latinFontId || ''));
          faceCss += shared.buildRestrictedFontFaceSetCss(
            shared.PREVIEW_LATIN_FONT_FAMILY,
            cfg.latinFont,
            cfg.latinFontId,
            shared.buildNonCjkUnicodeRange(shared.CJK_UNICODE_RANGE),
            latinSlots
          );
        }

        var seq = ++previewProbeSeq;
        var probes = [];
        if (cfg.cjkFont || cfg.cjkFontId) {
          probes.push(shared.probeLocalFontSlots(cfg.cjkFont, cfg.cjkFontId, previewSlotCache));
        }
        if (cfg.latinFont || cfg.latinFontId) {
          probes.push(shared.probeLocalFontSlots(cfg.latinFont, cfg.latinFontId, previewSlotCache));
        }
        if (probes.length) {
          Promise.all(probes).then(function () {
            if (seq === previewProbeSeq) {
              updatePreviewStyleNodeOnly();
            }
          });
        }
      }

      previewStyle.textContent = faceCss;
      if (ui.previewInput && ui.previewInput.style) {
        ui.previewInput.style.fontFamily = stack;
      }
    }

    function updatePreviewStyleNodeOnly() {
      if (state.fontMode !== shared.FONT_MODE_ADVANCED) return;
      var cfg = state.advancedFontConfig;
      var faceCss = '';
      if (cfg.cjkFont || cfg.cjkFontId) {
        var cjkSlots = previewSlotCache.get(String(cfg.cjkFont || '') + '\0' + String(cfg.cjkFontId || ''));
        faceCss += shared.buildRestrictedFontFaceSetCss(
          shared.PREVIEW_CJK_FONT_FAMILY,
          cfg.cjkFont,
          cfg.cjkFontId,
          shared.CJK_UNICODE_RANGE,
          cjkSlots
        );
      }
      if (cfg.latinFont || cfg.latinFontId) {
        var latinSlots = previewSlotCache.get(String(cfg.latinFont || '') + '\0' + String(cfg.latinFontId || ''));
        faceCss += shared.buildRestrictedFontFaceSetCss(
          shared.PREVIEW_LATIN_FONT_FAMILY,
          cfg.latinFont,
          cfg.latinFontId,
          shared.buildNonCjkUnicodeRange(shared.CJK_UNICODE_RANGE),
          latinSlots
        );
      }
      previewStyle.textContent = faceCss;
    }

    function renderAllUi() {
      applyLocaleLabels();
      updateModePanelsUi();
      renderFontSelectors();
      enableCheckbox.checked = Boolean(state.isEnabled);
      updateSiteBadgeUi();
      updateStatusUi();
      renderPreviewStyles();
    }

    function getContentScriptFiles() {
      if (chromeApi && chromeApi.runtime && typeof chromeApi.runtime.getManifest === 'function') {
        var manifest = chromeApi.runtime.getManifest();
        if (manifest && Array.isArray(manifest.content_scripts) && manifest.content_scripts[0] &&
            Array.isArray(manifest.content_scripts[0].js) && manifest.content_scripts[0].js.length) {
          return manifest.content_scripts[0].js.slice();
        }
      }
      return ['shared.js', 'content.js'];
    }

    function ensureContentScript(tabId, callback) {
      if (!tabId) {
        if (callback) callback({ ok: false, restricted: true });
        return;
      }
      if (!ensureInFlightCallbacks[tabId]) {
        ensureInFlightCallbacks[tabId] = [];
      }
      if (callback) {
        ensureInFlightCallbacks[tabId].push(callback);
      }
      if (ensureInFlightCallbacks[tabId].length > 1) {
        return;
      }

      function finishEnsure(result) {
        var waiters = ensureInFlightCallbacks[tabId] || [];
        delete ensureInFlightCallbacks[tabId];
        for (var i = 0; i < waiters.length; i++) {
          waiters[i](result);
        }
      }

      chromeApi.tabs.sendMessage(
        tabId,
        { action: shared.MSG_ACTIONS.GET_PAGE_STATE },
        { frameId: 0 },
        function (response) {
          if (!chromeApi.runtime.lastError && response && response.hasFontChanger) {
            finishEnsure({ ok: true, restricted: false, pageState: response });
            return;
          }
          if (!chromeApi.scripting || typeof chromeApi.scripting.executeScript !== 'function') {
            finishEnsure({ ok: false, restricted: false });
            return;
          }
          var scriptFiles = getContentScriptFiles();
          chromeApi.scripting.executeScript(
            {
              target: { tabId: tabId, allFrames: true },
              files: scriptFiles,
            },
            function () {
              if (!chromeApi.runtime.lastError) {
                finishEnsure({ ok: true, restricted: false });
                return;
              }
              chromeApi.scripting.executeScript(
                {
                  target: { tabId: tabId },
                  files: scriptFiles,
                },
                function () {
                  if (chromeApi.runtime.lastError) {
                    finishEnsure({
                      ok: false,
                      restricted: isRestrictedPageError(chromeApi.runtime.lastError.message),
                    });
                    return;
                  }
                  finishEnsure({ ok: true, restricted: false });
                }
              );
            }
          );
        }
      );
    }

    function takeStateSnapshot() {
      return {
        fontMode: state.fontMode,
        selectedFont: state.selectedFont,
        advancedFontConfig: shared.createAdvancedFontConfig(state.advancedFontConfig),
        isEnabled: state.isEnabled,
        siteDisabled: state.siteDisabled,
      };
    }

    function restoreStateSnapshot(snap) {
      state.fontMode = snap.fontMode;
      state.selectedFont = snap.selectedFont;
      state.advancedFontConfig = snap.advancedFontConfig;
      state.isEnabled = snap.isEnabled;
      state.siteDisabled = snap.siteDisabled;
    }

    function readSelectionsIntoState() {
      state.selectedFont = fontSelect.value || '';
      var cjkOpt = advancedCjkSelect.selectedOptions && advancedCjkSelect.selectedOptions[0];
      var latinOpt = advancedLatinSelect.selectedOptions && advancedLatinSelect.selectedOptions[0];
      state.advancedFontConfig = shared.createAdvancedFontConfig({
        cjkFont: advancedCjkSelect.value || '',
        cjkFontId: cjkOpt && cjkOpt.dataset ? (cjkOpt.dataset.fontId || '') : '',
        latinFont: advancedLatinSelect.value || '',
        latinFontId: latinOpt && latinOpt.dataset ? (latinOpt.dataset.fontId || '') : '',
      });
      state.isEnabled = Boolean(enableCheckbox.checked);
    }

    function commitGlobalSettingsChange(prevSnap) {
      state.lastErrorMsg = '';
      var msgs = getMsgs();
      var payload = {};
      payload[shared.STORAGE_KEYS.SELECTED_FONT] = state.selectedFont;
      payload[shared.STORAGE_KEYS.IS_ENABLED] = state.isEnabled;
      payload[shared.STORAGE_KEYS.FONT_MODE] = state.fontMode;
      payload[shared.STORAGE_KEYS.ADVANCED_FONT_CONFIG] = state.advancedFontConfig;

      chromeApi.storage.sync.set(payload, function () {
        if (chromeApi.runtime.lastError) {
          var errMsg = chromeApi.runtime.lastError.message || '';
          restoreStateSnapshot(prevSnap);
          state.lastErrorMsg = isQuotaError(errMsg) ? msgs.syncQuotaExceededError : msgs.storageWriteError;
          renderAllUi();
          return;
        }
        renderAllUi();
        if (state.isEnabled && !state.restricted && state.tabId) {
          ensureContentScript(state.tabId, function (res) {
            if (res && !res.ok) {
              state.lastErrorMsg = res.restricted ? msgs.restrictedPageError : msgs.applyError;
              updateStatusUi();
            }
          });
        }
      });
    }

    function handleSiteToggleChange() {
      var msgs = getMsgs();
      state.lastErrorMsg = '';
      var prevDisabled = state.siteDisabled;
      var nextDisabled = Boolean(siteDisableCheckbox.checked);

      if (state.restricted || !state.siteKey) {
        siteDisableCheckbox.checked = false;
        return;
      }

      if (state.incognito) {
        if (!state.tabId) {
          siteDisableCheckbox.checked = prevDisabled;
          return;
        }
        state.siteDisabled = nextDisabled;
        updateStatusUi();
        chromeApi.tabs.sendMessage(
          state.tabId,
          { action: shared.MSG_ACTIONS.SET_TAB_SITE_DISABLED, isDisabled: nextDisabled },
          function () {
            if (chromeApi.runtime.lastError) {
              ensureContentScript(state.tabId, function (ensureRes) {
                if (!ensureRes || !ensureRes.ok) {
                  state.siteDisabled = prevDisabled;
                  siteDisableCheckbox.checked = prevDisabled;
                  state.lastErrorMsg = ensureRes && ensureRes.restricted ? msgs.restrictedPageError : msgs.applyError;
                  updateStatusUi();
                  return;
                }
                chromeApi.tabs.sendMessage(
                  state.tabId,
                  { action: shared.MSG_ACTIONS.SET_TAB_SITE_DISABLED, isDisabled: nextDisabled },
                  function () {
                    if (chromeApi.runtime.lastError) {
                      state.siteDisabled = prevDisabled;
                      siteDisableCheckbox.checked = prevDisabled;
                      state.lastErrorMsg = msgs.applyError;
                    }
                    updateStatusUi();
                  }
                );
              });
            }
          }
        );
        return;
      }

      var syncKey = shared.siteDisabledKey(state.siteKey);
      if (nextDisabled) {
        chromeApi.storage.sync.get(null, function (allItems) {
          if (chromeApi.runtime.lastError) {
            siteDisableCheckbox.checked = prevDisabled;
            state.lastErrorMsg = msgs.storageWriteError;
            updateStatusUi();
            return;
          }
          var keys = Object.keys(allItems || {});
          var alreadyStored = Boolean(allItems && allItems[syncKey]);
          if (!alreadyStored && keys.length >= shared.MAX_SYNC_ITEMS - shared.CORE_SYNC_RESERVE) {
            state.siteDisabled = prevDisabled;
            siteDisableCheckbox.checked = prevDisabled;
            state.lastErrorMsg = msgs.syncQuotaExceededError;
            updateStatusUi();
            return;
          }
          var payload = {};
          payload[syncKey] = 1;
          chromeApi.storage.sync.set(payload, function () {
            if (chromeApi.runtime.lastError) {
              var msg = chromeApi.runtime.lastError.message || '';
              state.siteDisabled = prevDisabled;
              siteDisableCheckbox.checked = prevDisabled;
              state.lastErrorMsg = isQuotaError(msg) ? msgs.syncQuotaExceededError : msgs.storageWriteError;
            } else {
              state.siteDisabled = true;
            }
            updateStatusUi();
          });
        });
      } else {
        chromeApi.storage.sync.remove(syncKey, function () {
          if (chromeApi.runtime.lastError) {
            state.siteDisabled = prevDisabled;
            siteDisableCheckbox.checked = prevDisabled;
            state.lastErrorMsg = msgs.storageWriteError;
            updateStatusUi();
            return;
          }
          state.siteDisabled = false;
          updateStatusUi();
          if (state.tabId) {
            chromeApi.tabs.sendMessage(
              state.tabId,
              { action: shared.MSG_ACTIONS.CLEAR_LEGACY_SITE_DISABLE },
              { frameId: 0 },
              function () {
                // Consume optional lastError safely without masking status UI.
                void chromeApi.runtime.lastError;
              }
            );
          }
        });
      }
    }

    function bindEvents() {
      ui.languageToggle.addEventListener('click', function () {
        state.locale = state.locale === 'zh-Hant' ? 'en' : 'zh-Hant';
        renderAllUi();
        var langPayload = {};
        langPayload[shared.STORAGE_KEYS.UI_LANGUAGE] = state.locale;
        chromeApi.storage.sync.set(langPayload, function () {
          void chromeApi.runtime.lastError;
        });
      });

      ui.basicModeTab.addEventListener('click', function () {
        if (state.fontMode === shared.FONT_MODE_BASIC) return;
        var prev = takeStateSnapshot();
        state.fontMode = shared.FONT_MODE_BASIC;
        commitGlobalSettingsChange(prev);
      });

      ui.advancedModeTab.addEventListener('click', function () {
        if (state.fontMode === shared.FONT_MODE_ADVANCED) return;
        var prev = takeStateSnapshot();
        state.fontMode = shared.FONT_MODE_ADVANCED;
        commitGlobalSettingsChange(prev);
      });

      [fontSelect, advancedCjkSelect, advancedLatinSelect, enableCheckbox].forEach(function (el) {
        el.addEventListener('change', function () {
          var prev = takeStateSnapshot();
          readSelectionsIntoState();
          commitGlobalSettingsChange(prev);
        });
      });

      siteDisableCheckbox.addEventListener('change', handleSiteToggleChange);

      ui.resetButton.addEventListener('click', function () {
        var prev = takeStateSnapshot();
        state.selectedFont = '';
        state.fontMode = shared.FONT_MODE_BASIC;
        state.advancedFontConfig = shared.createAdvancedFontConfig();
        state.isEnabled = false;
        ui.previewInput.value = getRandomPreviewSample();
        commitGlobalSettingsChange(prev);
      });
    }

    function hydrateUi() {
      if (ui.previewInput && !ui.previewInput.value) {
        ui.previewInput.value = getRandomPreviewSample();
      }

      var tabPromise = new Promise(function (resolve) {
        if (!chromeApi.tabs || typeof chromeApi.tabs.query !== 'function') {
          resolve(null);
          return;
        }
        chromeApi.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          resolve((tabs && tabs[0]) || null);
        });
      });

      var fontListPromise = new Promise(function (resolve) {
        if (!chromeApi.fontSettings || typeof chromeApi.fontSettings.getFontList !== 'function') {
          resolve([]);
          return;
        }
        chromeApi.fontSettings.getFontList(function (fonts) {
          var seen = new Set();
          var deduped = [];
          (Array.isArray(fonts) ? fonts : []).forEach(function (f) {
            if (!f || (!f.displayName && !f.fontId)) return;
            var dn = f.displayName || f.fontId;
            var fid = f.fontId || f.displayName;
            if (!seen.has(dn)) {
              seen.add(dn);
              deduped.push({ displayName: dn, fontId: fid });
            }
          });
          resolve(deduped);
        });
      });

      return Promise.all([tabPromise, fontListPromise]).then(function (pair) {
        var activeTab = pair[0];
        state.systemFonts = pair[1];
        if (activeTab) {
          state.tabId = activeTab.id || null;
          state.tabUrl = activeTab.url || '';
          state.incognito = Boolean(activeTab.incognito);
          state.siteKey = !shared.isRestrictedUrl(state.tabUrl)
            ? shared.normalizeSiteKey(state.tabUrl)
            : null;
          state.restricted = !state.siteKey;
        } else {
          state.restricted = true;
          state.siteKey = null;
        }

        var keys = [
          shared.STORAGE_KEYS.UI_LANGUAGE,
          shared.STORAGE_KEYS.SELECTED_FONT,
          shared.STORAGE_KEYS.IS_ENABLED,
          shared.STORAGE_KEYS.FONT_MODE,
          shared.STORAGE_KEYS.ADVANCED_FONT_CONFIG,
        ];
        if (state.siteKey) {
          keys.push(shared.siteDisabledKey(state.siteKey));
        }

        return new Promise(function (resolve) {
          chromeApi.storage.sync.get(keys, function (items) {
            var data = items || {};
            if (data[shared.STORAGE_KEYS.UI_LANGUAGE] === 'zh-Hant' ||
                data[shared.STORAGE_KEYS.UI_LANGUAGE] === 'en') {
              state.locale = data[shared.STORAGE_KEYS.UI_LANGUAGE];
            }
            state.selectedFont = typeof data[shared.STORAGE_KEYS.SELECTED_FONT] === 'string'
              ? data[shared.STORAGE_KEYS.SELECTED_FONT]
              : '';
            state.isEnabled = Boolean(data[shared.STORAGE_KEYS.IS_ENABLED]);
            state.fontMode = shared.normalizeFontMode(data[shared.STORAGE_KEYS.FONT_MODE]);
            state.advancedFontConfig = shared.createAdvancedFontConfig(
              data[shared.STORAGE_KEYS.ADVANCED_FONT_CONFIG]
            );
            state.siteDisabled = Boolean(
              state.siteKey && data[shared.siteDisabledKey(state.siteKey)]
            );

            renderAllUi();

            if (!state.restricted && state.tabId && (state.incognito || state.isEnabled)) {
              chromeApi.tabs.sendMessage(
                state.tabId,
                { action: shared.MSG_ACTIONS.GET_PAGE_STATE },
                { frameId: 0 },
                function (resp) {
                  if (!chromeApi.runtime.lastError && resp && resp.hasFontChanger) {
                    if (state.incognito && typeof resp.tabIncognitoOverride === 'boolean') {
                      state.siteDisabled = resp.tabIncognitoOverride;
                      updateSiteBadgeUi();
                      updateStatusUi();
                    }
                    resolve();
                    return;
                  }
                  if (state.isEnabled) {
                    ensureContentScript(state.tabId, function () {
                      resolve();
                    });
                  } else {
                    resolve();
                  }
                }
              );
              return;
            }
            resolve();
          });
        });
      });
    }

    bindEvents();
    var ready = hydrateUi();

    return {
      ready: ready,
      getState: function () {
        return Object.assign({}, state, {
          advancedFontConfig: shared.createAdvancedFontConfig(state.advancedFontConfig),
        });
      },
      ensureContentScript: ensureContentScript,
    };
  }

  global.FontChangerPopup = Object.freeze({
    initPopup: initPopup,
    LOCALES: LOCALES,
    TAGORE_PREVIEW_SAMPLES: TAGORE_PREVIEW_SAMPLES,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.FontChangerPopup;
  }

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        initPopup({ document: document, window: window, chrome: chrome });
      });
    } else {
      initPopup({ document: document, window: window, chrome: chrome });
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
