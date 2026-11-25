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
      statusDisabledWithSiteRule: '尚未啟用字體替換（此站已設定專用字體）。',
      statusEnabled: '已啟用：{font}',
      statusEnabledAdvanced: '已啟用：CJK / 英數分開',
      statusSiteFontEnabled: '此站專用字體：{font}',
      statusSiteFontEnabledAdvanced: '此站專用：CJK / 英數分開',
      statusSiteDisabled: '此網站已排除，不會套用字體替換。',
      statusIncognitoExcluded: '無痕分頁暫停套用此網站（僅限目前分頁有效）。',
      statusRestrictedGlobalSaved: '此頁面不允許修改樣式；全域設定已儲存並套用於其他網站。',
      scopeGlobal: '全域預設',
      scopeSite: '僅此網站',
      scopeSiteActive: '僅此網站 ★',
      clearSiteFont: '恢復全域',
      manageSites: '網站清單',
      whatsNew: '更新說明',
      feedback: '意見反應',
      previewTitle: '即時預覽',
      reset: '重設',
      defaultFontOption: '系統預設字體',
      systemFontsGroup: '本機字體',
      cloudFontsGroup: '雲端字體 (Google Fonts・按需載入)',
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
      advancedCjkLabel: 'CJK（中日韓）',
      advancedLatinLabel: '非 CJK（英數與標點）',
      cloudWeightLabel: '雲端字重',
      cloudWeightCloudOnly: '跟隨網頁（僅雲端字體可用）',
      cloudWeightAuto: '跟隨網頁預設',
      cloudWeight300: '300 細體 (Light)',
      cloudWeight400: '400 標準 (Regular)',
      cloudWeight500: '500 中等 (Medium)',
      cloudWeight600: '600 半粗 (SemiBold)',
      cloudWeight700: '700 粗體 (Bold)',
      cloudWeightUnsupportedSuffix: '（不支援）',
    },
    en: {
      title: 'Website Font Changer 333',
      heading: 'Website Font Changer 333',
      fontLabel: 'Font',
      toggleLabel: 'Enable font replacement',
      siteDisableLabel: 'Disable on this site',
      siteBadgeUnavailable: 'Restricted',
      statusDisabled: 'Font replacement is disabled.',
      statusDisabledWithSiteRule: 'Font replacement is disabled (site font saved).',
      statusEnabled: 'Enabled: {font}',
      statusEnabledAdvanced: 'Enabled: CJK / Latin split',
      statusSiteFontEnabled: 'Site font: {font}',
      statusSiteFontEnabledAdvanced: 'Site font: CJK / Latin split',
      statusSiteDisabled: 'This site is excluded from font replacement.',
      statusIncognitoExcluded: 'Excluded for this incognito tab only (not synced).',
      statusRestrictedGlobalSaved: 'This page cannot be modified; global preferences remain saved for other sites.',
      scopeGlobal: 'Global default',
      scopeSite: 'This site only',
      scopeSiteActive: 'This site ★',
      clearSiteFont: 'Use global',
      manageSites: 'Site list',
      whatsNew: "What's new",
      feedback: 'Feedback',
      previewTitle: 'Live preview',
      reset: 'Reset',
      defaultFontOption: 'System default font',
      systemFontsGroup: 'System Fonts',
      cloudFontsGroup: 'Cloud Fonts (Google Fonts · On-Demand)',
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
      advancedCjkLabel: 'CJK (Chinese / Japanese / Korean)',
      advancedLatinLabel: 'Non-CJK (Latin / numbers / punctuation)',
      cloudWeightLabel: 'Cloud weight',
      cloudWeightCloudOnly: 'Auto (Cloud fonts only)',
      cloudWeightAuto: 'Auto (Page default)',
      cloudWeight300: '300 · Light',
      cloudWeight400: '400 · Regular',
      cloudWeight500: '500 · Medium',
      cloudWeight600: '600 · SemiBold',
      cloudWeight700: '700 · Bold',
      cloudWeightUnsupportedSuffix: ' (Unavailable)',
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
      advancedCjkLabel: doc.getElementById('advancedCjkLabel'),
      advancedLatinLabel: doc.getElementById('advancedLatinLabel'),
      globalScopeTab: doc.getElementById('globalScopeTab'),
      siteScopeTab: doc.getElementById('siteScopeTab'),
      clearSiteFontBtn: doc.getElementById('clearSiteFontBtn'),
      manageSitesBtn: doc.getElementById('manageSitesBtn'),
      whatsNewBtn: doc.getElementById('whatsNewBtn'),
      feedbackBtn: doc.getElementById('feedbackBtn'),
      cloudWeightRow: doc.getElementById('cloudWeightRow'),
      cloudWeightLabel: doc.getElementById('cloudWeightLabel'),
    };
    var fontSelect = doc.getElementById('fontSelect');
    var advancedCjkSelect = doc.getElementById('advancedCjkSelect');
    var advancedLatinSelect = doc.getElementById('advancedLatinSelect');
    var cloudWeightSelect = doc.getElementById('cloudWeightSelect');
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
      editScope: 'global',
      fontMode: shared.FONT_MODE_BASIC,
      selectedFont: '',
      selectedFontId: '',
      cloudFontWeight: shared.CLOUD_FONT_WEIGHT_AUTO,
      advancedFontConfig: shared.createAdvancedFontConfig(),
      siteFontRule: null,
      siteFontDraft: shared.createSiteFontRule(),
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

    function getCloudWeightLabels(msgs) {
      return {
        cloudOnly: msgs.cloudWeightCloudOnly,
        auto: msgs.cloudWeightAuto,
        '300': msgs.cloudWeight300,
        '400': msgs.cloudWeight400,
        '500': msgs.cloudWeight500,
        '600': msgs.cloudWeight600,
        '700': msgs.cloudWeight700,
        unsupportedSuffix: msgs.cloudWeightUnsupportedSuffix,
      };
    }

    function hasActiveSiteFontRule() {
      return Boolean(!state.restricted && state.siteKey && state.siteFontRule && !shared.isSiteFontRuleEmpty(state.siteFontRule));
    }

    function getActiveEditConfig() {
      if (state.editScope === 'site' && !state.restricted && state.siteKey) {
        return shared.createSiteFontRule(state.siteFontDraft);
      }
      return shared.createSiteFontRule({
        fontMode: state.fontMode,
        selectedFont: state.selectedFont,
        selectedFontId: state.selectedFontId,
        cloudFontWeight: state.cloudFontWeight,
        advancedFontConfig: state.advancedFontConfig,
      });
    }

    function syncSiteDraftFromSaved() {
      state.siteFontDraft = state.siteFontRule
        ? shared.createSiteFontRule(state.siteFontRule)
        : shared.createSiteFontRule();
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
      ui.advancedCjkLabel.textContent = msgs.advancedCjkLabel;
      ui.advancedLatinLabel.textContent = msgs.advancedLatinLabel;
      if (ui.cloudWeightLabel) ui.cloudWeightLabel.textContent = msgs.cloudWeightLabel;
      if (ui.globalScopeTab) ui.globalScopeTab.textContent = msgs.scopeGlobal;
      if (ui.siteScopeTab) {
        ui.siteScopeTab.textContent = hasActiveSiteFontRule() ? msgs.scopeSiteActive : msgs.scopeSite;
        ui.siteScopeTab.disabled = Boolean(state.restricted || !state.siteKey);
      }
      if (ui.clearSiteFontBtn) {
        ui.clearSiteFontBtn.textContent = msgs.clearSiteFont;
        ui.clearSiteFontBtn.hidden = !hasActiveSiteFontRule();
      }
      if (ui.manageSitesBtn) ui.manageSitesBtn.textContent = msgs.manageSites;
      if (ui.whatsNewBtn) ui.whatsNewBtn.textContent = msgs.whatsNew;

      if (ui.feedbackBtn) {
        ui.feedbackBtn.textContent = msgs.feedback;
        if (typeof ui.feedbackBtn.setAttribute === 'function') {
          ui.feedbackBtn.setAttribute('href', shared.FEEDBACK_URL);
        }
      }
    }

    function updateModePanelsUi() {
      var msgs = getMsgs();
      var activeCfg = getActiveEditConfig();
      var isAdvanced = activeCfg.fontMode === shared.FONT_MODE_ADVANCED;
      if (ui.globalScopeTab && ui.siteScopeTab) {
        var isSiteScope = state.editScope === 'site' && !state.restricted && Boolean(state.siteKey);
        ui.globalScopeTab.setAttribute('aria-selected', String(!isSiteScope));
        ui.siteScopeTab.setAttribute('aria-selected', String(isSiteScope));
      }
      ui.basicModeTab.setAttribute('aria-selected', String(!isAdvanced));
      ui.advancedModeTab.setAttribute('aria-selected', String(isAdvanced));
      ui.basicSettingsPanel.hidden = isAdvanced;
      ui.advancedSettingsPanel.hidden = !isAdvanced;
      ui.modeHintText.textContent = isAdvanced ? msgs.modeHintAdvanced : msgs.modeHintBasic;
      if (doc.body && doc.body.classList) {
        doc.body.classList.toggle('advanced-mode', isAdvanced);
      }
    }

    function populateSelectWithFonts(selectEl, storedName, storedFontId, includeCloudFonts) {
      var msgs = getMsgs();
      shared.populateFontSelect({
        doc: doc,
        selectEl: selectEl,
        systemFonts: state.systemFonts,
        locale: state.locale,
        defaultLabel: msgs.defaultFontOption,
        systemGroupLabel: msgs.systemFontsGroup,
        cloudGroupLabel: msgs.cloudFontsGroup,
        unavailableLabel: msgs.unavailableFontLabel,
        storedName: storedName,
        storedFontId: storedFontId,
        includeCloudFonts: Boolean(includeCloudFonts),
      });
    }

    function renderFontSelectors() {
      var activeCfg = getActiveEditConfig();
      populateSelectWithFonts(fontSelect, activeCfg.selectedFont, activeCfg.selectedFontId, true);
      populateSelectWithFonts(
        advancedCjkSelect,
        activeCfg.advancedFontConfig.cjkFont || activeCfg.advancedFontConfig.cjkFontId,
        activeCfg.advancedFontConfig.cjkFontId,
        false
      );
      populateSelectWithFonts(
        advancedLatinSelect,
        activeCfg.advancedFontConfig.latinFont || activeCfg.advancedFontConfig.latinFontId,
        activeCfg.advancedFontConfig.latinFontId,
        true
      );
      var activeCloudFont = shared.resolveActiveCloudFontFromConfig(activeCfg);
      if (cloudWeightSelect) {
        shared.populateCloudWeightSelect({
          doc: doc,
          selectEl: cloudWeightSelect,
          cloudFont: activeCloudFont,
          selectedWeight: activeCfg.cloudFontWeight,
          labels: getCloudWeightLabels(getMsgs()),
        });
      }
      if (ui.cloudWeightRow && ui.cloudWeightRow.classList) {
        ui.cloudWeightRow.classList.toggle('is-disabled', !activeCloudFont);
      }
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
        setStatus(
          hasActiveSiteFontRule() ? msgs.statusDisabledWithSiteRule : msgs.statusDisabled,
          ''
        );
        return;
      }
      if (state.restricted) {
        setStatus(msgs.statusRestrictedGlobalSaved, '');
        return;
      }
      if (hasActiveSiteFontRule()) {
        var siteRule = state.siteFontRule;
        if (siteRule.fontMode === shared.FONT_MODE_ADVANCED) {
          setStatus(msgs.statusSiteFontEnabledAdvanced, 'status-active');
        } else {
          setStatus(
            msgs.statusSiteFontEnabled.replace('{font}', siteRule.selectedFont || msgs.defaultFontOption),
            'status-active'
          );
        }
        return;
      }
      if (state.fontMode === shared.FONT_MODE_ADVANCED) {
        setStatus(msgs.statusEnabledAdvanced, 'status-active');
        return;
      }
      var activeName = state.selectedFont || msgs.defaultFontOption;
      setStatus(msgs.statusEnabled.replace('{font}', activeName), 'status-active');
    }

    function syncPopupCloudFontLink(previewCfg) {
      if (!doc || !doc.head) return;
      var cloudFont = previewCfg.fontMode === shared.FONT_MODE_ADVANCED
        ? shared.resolveCloudGoogleFont(
            previewCfg.advancedFontConfig.latinFont,
            previewCfg.advancedFontConfig.latinFontId
          )
        : shared.resolveCloudGoogleFont(previewCfg.selectedFont, previewCfg.selectedFontId);
      var neededId = cloudFont ? cloudFont.id : '';
      var alreadyPresent = false;
      if (typeof doc.head.querySelectorAll === 'function') {
        var existing = doc.head.querySelectorAll('[' + shared.CLOUD_GOOGLE_FONT_ATTR + ']');
        for (var i = 0; i < existing.length; i++) {
          var node = existing[i];
          var attrVal = typeof node.getAttribute === 'function' ? node.getAttribute(shared.CLOUD_GOOGLE_FONT_ATTR) : '';
          if (neededId && attrVal === neededId && !alreadyPresent) {
            alreadyPresent = true;
          } else if (node && node.parentNode) {
            node.parentNode.removeChild(node);
          }
        }
      } else if (Array.isArray(doc.head.children)) {
        for (var j = doc.head.children.length - 1; j >= 0; j--) {
          var child = doc.head.children[j];
          var childAttr = child && typeof child.getAttribute === 'function'
            ? child.getAttribute(shared.CLOUD_GOOGLE_FONT_ATTR)
            : '';
          if (!childAttr) continue;
          if (neededId && childAttr === neededId && !alreadyPresent) {
            alreadyPresent = true;
          } else {
            doc.head.children.splice(j, 1);
          }
        }
      }
      if (!cloudFont || alreadyPresent || typeof doc.createElement !== 'function') return;
      var link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = cloudFont.googleFontsUrl;
      if (typeof link.setAttribute === 'function') {
        link.setAttribute(shared.CLOUD_GOOGLE_FONT_ATTR, cloudFont.id);
        link.setAttribute('referrerpolicy', 'no-referrer');
      }
      doc.head.appendChild(link);
    }

    function renderPreviewStyles() {
      var previewCfg = getActiveEditConfig();
      syncPopupCloudFontLink(previewCfg);
      var stack = shared.getFontStack(
        previewCfg.fontMode,
        previewCfg.selectedFont,
        previewCfg.advancedFontConfig,
        shared.PREVIEW_CJK_FONT_FAMILY,
        shared.PREVIEW_LATIN_FONT_FAMILY
      );

      var faceCss = '';
      if (previewCfg.fontMode === shared.FONT_MODE_ADVANCED) {
        var cfg = previewCfg.advancedFontConfig;
        var isCloudLatin = Boolean(shared.resolveCloudGoogleFont(cfg.latinFont, cfg.latinFontId));
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
        if (!isCloudLatin && (cfg.latinFont || cfg.latinFontId)) {
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
        if (!isCloudLatin && (cfg.latinFont || cfg.latinFontId)) {
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
        var previewCloudFont = shared.resolveActiveCloudFontFromConfig(previewCfg);
        var previewWeight = shared.resolveEffectiveCloudFontWeight(previewCloudFont, previewCfg.cloudFontWeight);
        ui.previewInput.style.fontWeight = previewWeight !== shared.CLOUD_FONT_WEIGHT_AUTO ? previewWeight : '';
      }
    }

    function updatePreviewStyleNodeOnly() {
      var previewCfg = getActiveEditConfig();
      if (previewCfg.fontMode !== shared.FONT_MODE_ADVANCED) return;
      var cfg = previewCfg.advancedFontConfig;
      var isCloudLatin = Boolean(shared.resolveCloudGoogleFont(cfg.latinFont, cfg.latinFontId));
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
      if (!isCloudLatin && (cfg.latinFont || cfg.latinFontId)) {
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

    function syncPopupActionBadge(isDisabled) {
      if (!chromeApi || !chromeApi.action || typeof chromeApi.action.setBadgeText !== 'function' ||
          typeof state.tabId !== 'number') {
        return;
      }
      try {
        var p = chromeApi.action.setBadgeText({ tabId: state.tabId, text: isDisabled ? 'OFF' : '' });
        if (p && typeof p.catch === 'function') p.catch(function () {});
        if (isDisabled) {
          if (typeof chromeApi.action.setBadgeBackgroundColor === 'function') {
            var bg = chromeApi.action.setBadgeBackgroundColor({ tabId: state.tabId, color: '#a9471d' });
            if (bg && typeof bg.catch === 'function') bg.catch(function () {});
          }
          if (typeof chromeApi.action.setBadgeTextColor === 'function') {
            var fg = chromeApi.action.setBadgeTextColor({ tabId: state.tabId, color: '#ffffff' });
            if (fg && typeof fg.catch === 'function') fg.catch(function () {});
          }
        }
      } catch (_e) {
        // Ignore badge update errors in non-supporting environments.
      }
    }

    function syncIncognitoBackgroundState(payload) {
      if (!state.incognito || !chromeApi || !chromeApi.runtime ||
          typeof chromeApi.runtime.sendMessage !== 'function' || typeof state.tabId !== 'number') {
        return;
      }
      try {
        var req = Object.assign({ action: shared.MSG_ACTIONS.SYNC_TAB_INCOGNITO_STATE, tabId: state.tabId }, payload);
        var p = chromeApi.runtime.sendMessage(req, function () {
          if (chromeApi.runtime) void chromeApi.runtime.lastError;
        });
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } catch (_e) {
        // Ignore if background is absent in tests.
      }
    }

    function takeStateSnapshot() {
      return {
        editScope: state.editScope,
        fontMode: state.fontMode,
        selectedFont: state.selectedFont,
        selectedFontId: state.selectedFontId,
        cloudFontWeight: state.cloudFontWeight,
        advancedFontConfig: shared.createAdvancedFontConfig(state.advancedFontConfig),
        siteFontRule: state.siteFontRule ? shared.createSiteFontRule(state.siteFontRule) : null,
        siteFontDraft: shared.createSiteFontRule(state.siteFontDraft),
        isEnabled: state.isEnabled,
        siteDisabled: state.siteDisabled,
      };
    }

    function restoreStateSnapshot(snap) {
      state.editScope = snap.editScope;
      state.fontMode = snap.fontMode;
      state.selectedFont = snap.selectedFont;
      state.selectedFontId = snap.selectedFontId || '';
      state.cloudFontWeight = shared.normalizeCloudFontWeight(snap.cloudFontWeight);
      state.advancedFontConfig = snap.advancedFontConfig;
      state.siteFontRule = snap.siteFontRule;
      state.siteFontDraft = snap.siteFontDraft;
      state.isEnabled = snap.isEnabled;
      state.siteDisabled = snap.siteDisabled;
    }

    function readSelectsIntoConfig(targetMode, fallbackWeight) {
      var basicOpt = fontSelect.selectedOptions && fontSelect.selectedOptions[0];
      var cjkOpt = advancedCjkSelect.selectedOptions && advancedCjkSelect.selectedOptions[0];
      var latinOpt = advancedLatinSelect.selectedOptions && advancedLatinSelect.selectedOptions[0];
      var baseRule = {
        fontMode: targetMode,
        selectedFont: fontSelect.value || '',
        selectedFontId: basicOpt && basicOpt.dataset ? (basicOpt.dataset.fontId || '') : '',
        advancedFontConfig: {
          cjkFont: advancedCjkSelect.value || '',
          cjkFontId: cjkOpt && cjkOpt.dataset ? (cjkOpt.dataset.fontId || '') : '',
          latinFont: advancedLatinSelect.value || '',
          latinFontId: latinOpt && latinOpt.dataset ? (latinOpt.dataset.fontId || '') : '',
        },
      };
      var activeCloud = shared.resolveActiveCloudFontFromConfig(baseRule);
      var rawWeight = fallbackWeight !== undefined ? fallbackWeight : shared.CLOUD_FONT_WEIGHT_AUTO;
      if (cloudWeightSelect && !cloudWeightSelect.disabled && activeCloud) {
        rawWeight = cloudWeightSelect.value;
      }
      baseRule.cloudFontWeight = activeCloud
        ? shared.resolveEffectiveCloudFontWeight(activeCloud, rawWeight)
        : shared.normalizeCloudFontWeight(rawWeight);
      return shared.createSiteFontRule(baseRule);
    }

    function readSelectionsIntoState(fromWeightSelect) {
      state.isEnabled = Boolean(enableCheckbox.checked);
      if (state.editScope === 'site' && !state.restricted && state.siteKey) {
        var curMode = state.siteFontDraft ? state.siteFontDraft.fontMode : shared.FONT_MODE_BASIC;
        var prevSiteWeight = fromWeightSelect && cloudWeightSelect
          ? cloudWeightSelect.value
          : (state.siteFontDraft ? state.siteFontDraft.cloudFontWeight : shared.CLOUD_FONT_WEIGHT_AUTO);
        state.siteFontDraft = readSelectsIntoConfig(curMode, prevSiteWeight);
        state.siteFontRule = shared.isSiteFontRuleEmpty(state.siteFontDraft)
          ? null
          : shared.createSiteFontRule(state.siteFontDraft);
        return;
      }
      var prevGlobalWeight = fromWeightSelect && cloudWeightSelect
        ? cloudWeightSelect.value
        : state.cloudFontWeight;
      var globalParsed = readSelectsIntoConfig(state.fontMode, prevGlobalWeight);
      state.selectedFont = globalParsed.selectedFont;
      state.selectedFontId = globalParsed.selectedFontId;
      state.cloudFontWeight = globalParsed.cloudFontWeight;
      state.advancedFontConfig = globalParsed.advancedFontConfig;
    }

    function commitSiteFontChange(prevSnap, clearToInherit) {
      var msgs = getMsgs();
      state.lastErrorMsg = '';
      if (state.restricted || !state.siteKey) {
        restoreStateSnapshot(prevSnap);
        renderAllUi();
        return;
      }

      var ruleToSave = clearToInherit ? null : state.siteFontRule;
      var isEmpty = !ruleToSave || shared.isSiteFontRuleEmpty(ruleToSave);

      if (state.incognito) {
        if (!state.tabId) {
          restoreStateSnapshot(prevSnap);
          renderAllUi();
          return;
        }
        if (isEmpty) {
          state.siteFontRule = null;
          state.siteFontDraft = shared.createSiteFontRule();
        }
        renderAllUi();
        var msgPayload = {
          action: shared.MSG_ACTIONS.SET_TAB_SITE_FONT,
          host: state.siteKey,
          rule: isEmpty ? null : ruleToSave,
          clearToInherit: Boolean(clearToInherit),
        };
        syncIncognitoBackgroundState({
          hasSiteFont: true,
          host: state.siteKey,
          rule: isEmpty ? null : ruleToSave,
          clearToInherit: Boolean(clearToInherit),
        });
        chromeApi.tabs.sendMessage(state.tabId, msgPayload, function () {
          if (chromeApi.runtime.lastError) {
            ensureContentScript(state.tabId, function (ensureRes) {
              if (!ensureRes || !ensureRes.ok) {
                restoreStateSnapshot(prevSnap);
                state.lastErrorMsg = ensureRes && ensureRes.restricted ? msgs.restrictedPageError : msgs.applyError;
                renderAllUi();
                return;
              }
              chromeApi.tabs.sendMessage(state.tabId, msgPayload, function () {
                if (chromeApi.runtime.lastError) {
                  restoreStateSnapshot(prevSnap);
                  state.lastErrorMsg = msgs.applyError;
                  renderAllUi();
                }
              });
            });
          }
        });
        return;
      }

      var syncKey = shared.siteFontKey(state.siteKey);
      if (isEmpty) {
        chromeApi.storage.sync.remove(syncKey, function () {
          if (chromeApi.runtime.lastError) {
            restoreStateSnapshot(prevSnap);
            state.lastErrorMsg = msgs.storageWriteError;
          } else {
            state.siteFontRule = null;
          }
          renderAllUi();
        });
        return;
      }

      chromeApi.storage.sync.get(null, function (allItems) {
        if (chromeApi.runtime.lastError) {
          restoreStateSnapshot(prevSnap);
          state.lastErrorMsg = msgs.storageWriteError;
          renderAllUi();
          return;
        }
        var keys = Object.keys(allItems || {});
        var alreadyStored = Boolean(allItems && allItems[syncKey]);
        if (!alreadyStored && keys.length >= shared.MAX_SYNC_ITEMS - shared.CORE_SYNC_RESERVE) {
          restoreStateSnapshot(prevSnap);
          state.lastErrorMsg = msgs.syncQuotaExceededError;
          renderAllUi();
          return;
        }
        var payload = {};
        payload[syncKey] = shared.createSiteFontRule(ruleToSave);
        chromeApi.storage.sync.set(payload, function () {
          if (chromeApi.runtime.lastError) {
            var errMsg = chromeApi.runtime.lastError.message || '';
            restoreStateSnapshot(prevSnap);
            state.lastErrorMsg = isQuotaError(errMsg) ? msgs.syncQuotaExceededError : msgs.storageWriteError;
            renderAllUi();
            return;
          }
          renderAllUi();
          if (state.isEnabled && state.tabId) {
            ensureContentScript(state.tabId, function (res) {
              if (res && !res.ok) {
                state.lastErrorMsg = res.restricted ? msgs.restrictedPageError : msgs.applyError;
                updateStatusUi();
              }
            });
          }
        });
      });
    }

    function commitGlobalSettingsChange(prevSnap) {
      state.lastErrorMsg = '';
      var msgs = getMsgs();
      var payload = {};
      payload[shared.STORAGE_KEYS.SELECTED_FONT] = state.selectedFont;
      payload[shared.STORAGE_KEYS.SELECTED_FONT_ID] = state.selectedFontId;
      payload[shared.STORAGE_KEYS.CLOUD_FONT_WEIGHT] = state.cloudFontWeight;
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
        syncPopupActionBadge(nextDisabled);
        syncIncognitoBackgroundState({ hasDisabled: true, isDisabled: nextDisabled });
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
              syncPopupActionBadge(true);
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
          syncPopupActionBadge(false);
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

      function bindTabArrowNav(tabA, tabB) {
        if (!tabA || !tabB) return;
        [tabA, tabB].forEach(function (tab, idx) {
          tab.addEventListener('keydown', function (ev) {
            if (!ev || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
            var next = idx === 0 ? tabB : tabA;
            if (next.disabled) return;
            if (typeof ev.preventDefault === 'function') ev.preventDefault();
            if (typeof next.focus === 'function') next.focus();
            if (typeof next.click === 'function') next.click();
          });
        });
      }

      bindTabArrowNav(ui.globalScopeTab, ui.siteScopeTab);
      bindTabArrowNav(ui.basicModeTab, ui.advancedModeTab);

      if (ui.globalScopeTab) {
        ui.globalScopeTab.addEventListener('click', function () {
          if (state.editScope === 'global') return;
          state.editScope = 'global';
          renderAllUi();
        });
      }

      if (ui.siteScopeTab) {
        ui.siteScopeTab.addEventListener('click', function () {
          if (state.restricted || !state.siteKey || state.editScope === 'site') return;
          state.editScope = 'site';
          syncSiteDraftFromSaved();
          renderAllUi();
        });
      }

      if (ui.clearSiteFontBtn) {
        ui.clearSiteFontBtn.addEventListener('click', function () {
          if (!hasActiveSiteFontRule()) return;
          var prev = takeStateSnapshot();
          state.siteFontRule = null;
          state.siteFontDraft = shared.createSiteFontRule();
          state.editScope = 'global';
          // clearToInherit=false ensures Incognito overrides any synced site rule to use global.
          commitSiteFontChange(prev, false);
        });
      }

      ui.basicModeTab.addEventListener('click', function () {
        if (state.editScope === 'site' && !state.restricted && state.siteKey) {
          if (state.siteFontDraft.fontMode === shared.FONT_MODE_BASIC) return;
          state.siteFontDraft = Object.assign({}, state.siteFontDraft, { fontMode: shared.FONT_MODE_BASIC });
          if (state.siteFontRule && state.siteFontRule.fontMode === shared.FONT_MODE_BASIC &&
              !shared.isSiteFontRuleEmpty(state.siteFontRule)) {
            syncSiteDraftFromSaved();
          }
          renderAllUi();
          return;
        }
        if (state.fontMode === shared.FONT_MODE_BASIC) return;
        var prev = takeStateSnapshot();
        state.fontMode = shared.FONT_MODE_BASIC;
        commitGlobalSettingsChange(prev);
      });

      ui.advancedModeTab.addEventListener('click', function () {
        if (state.editScope === 'site' && !state.restricted && state.siteKey) {
          if (state.siteFontDraft.fontMode === shared.FONT_MODE_ADVANCED) return;
          state.siteFontDraft = Object.assign({}, state.siteFontDraft, { fontMode: shared.FONT_MODE_ADVANCED });
          if (state.siteFontRule && state.siteFontRule.fontMode === shared.FONT_MODE_ADVANCED &&
              !shared.isSiteFontRuleEmpty(state.siteFontRule)) {
            syncSiteDraftFromSaved();
          }
          renderAllUi();
          return;
        }
        if (state.fontMode === shared.FONT_MODE_ADVANCED) return;
        var prev = takeStateSnapshot();
        state.fontMode = shared.FONT_MODE_ADVANCED;
        commitGlobalSettingsChange(prev);
      });

      [fontSelect, advancedCjkSelect, advancedLatinSelect].forEach(function (el) {
        el.addEventListener('change', function () {
          var prev = takeStateSnapshot();
          readSelectionsIntoState(false);
          if (state.editScope === 'site' && !state.restricted && state.siteKey) {
            commitSiteFontChange(prev, false);
          } else {
            commitGlobalSettingsChange(prev);
          }
        });
      });

      if (cloudWeightSelect) {
        cloudWeightSelect.addEventListener('change', function () {
          if (cloudWeightSelect.disabled) return;
          var prev = takeStateSnapshot();
          readSelectionsIntoState(true);
          if (state.editScope === 'site' && !state.restricted && state.siteKey) {
            commitSiteFontChange(prev, false);
          } else {
            commitGlobalSettingsChange(prev);
          }
        });
      }

      enableCheckbox.addEventListener('change', function () {
        var prev = takeStateSnapshot();
        state.isEnabled = Boolean(enableCheckbox.checked);
        commitGlobalSettingsChange(prev);
      });

      siteDisableCheckbox.addEventListener('change', handleSiteToggleChange);

      ui.resetButton.addEventListener('click', function () {
        var prev = takeStateSnapshot();
        state.editScope = 'global';
        state.selectedFont = '';
        state.selectedFontId = '';
        state.cloudFontWeight = shared.CLOUD_FONT_WEIGHT_AUTO;
        state.fontMode = shared.FONT_MODE_BASIC;
        state.advancedFontConfig = shared.createAdvancedFontConfig();
        state.isEnabled = false;
        ui.previewInput.value = getRandomPreviewSample();
        commitGlobalSettingsChange(prev);
      });

      if (ui.manageSitesBtn) {
        ui.manageSitesBtn.addEventListener('click', function () {
          if (chromeApi && chromeApi.runtime && typeof chromeApi.runtime.openOptionsPage === 'function') {
            chromeApi.runtime.openOptionsPage();
          } else if (chromeApi && chromeApi.tabs && typeof chromeApi.tabs.create === 'function' &&
              chromeApi.runtime && typeof chromeApi.runtime.getURL === 'function') {
            chromeApi.tabs.create({ url: chromeApi.runtime.getURL('options.html') });
          }
        });
      }

      if (ui.whatsNewBtn) {
        ui.whatsNewBtn.addEventListener('click', function () {
          openWhatsNewPage(true);
        });
      }

      if (ui.feedbackBtn) {
        ui.feedbackBtn.addEventListener('click', function (ev) {
          if (chromeApi && chromeApi.tabs && typeof chromeApi.tabs.create === 'function') {
            if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
            chromeApi.tabs.create({ url: shared.FEEDBACK_URL });
          }
        });
      }
    }

    function openWhatsNewPage(active) {
      if (!chromeApi || !chromeApi.tabs || typeof chromeApi.tabs.create !== 'function' ||
          !chromeApi.runtime || typeof chromeApi.runtime.getURL !== 'function') {
        return;
      }
      var pageName = (shared && shared.WHATS_NEW_PAGE) || 'whats-new.html';
      chromeApi.tabs.create({
        url: chromeApi.runtime.getURL(pageName),
        active: Boolean(active),
      });
    }

    function maybeOpenWhatsNewInBackground() {
      if (state.incognito) return;
      if (!chromeApi || !chromeApi.storage || !chromeApi.storage.local ||
          typeof chromeApi.storage.local.get !== 'function' || !shared) {
        return;
      }
      var currentVersion = '';
      if (chromeApi.runtime && typeof chromeApi.runtime.getManifest === 'function') {
        try {
          var manifest = chromeApi.runtime.getManifest();
          currentVersion = manifest && manifest.version ? String(manifest.version) : '';
        } catch (_e) {}
      }
      var pendingKey = shared.WHATS_NEW_PENDING_KEY || 'whatsNewPendingVersion';
      var seenKey = shared.WHATS_NEW_SEEN_KEY || 'whatsNewSeenVersion';
      chromeApi.storage.local.get([pendingKey, seenKey], function (localItems) {
        if (chromeApi.runtime && chromeApi.runtime.lastError) return;
        var pendingVer = localItems && typeof localItems[pendingKey] === 'string' ? localItems[pendingKey] : '';
        var seenVer = localItems && typeof localItems[seenKey] === 'string' ? localItems[seenKey] : '';
        var targetVer = pendingVer || currentVersion;
        if (!targetVer) return;
        var shouldOpen = (pendingVer && pendingVer !== seenVer) || (currentVersion && seenVer !== currentVersion);
        if (!shouldOpen) return;
        if (pendingVer && typeof chromeApi.storage.local.remove === 'function') {
          chromeApi.storage.local.remove(pendingKey, function () {
            if (chromeApi.runtime) void chromeApi.runtime.lastError;
          });
        }
        if (typeof chromeApi.storage.local.set === 'function') {
          var seenPayload = {};
          seenPayload[seenKey] = targetVer;
          chromeApi.storage.local.set(seenPayload, function () {
            if (chromeApi.runtime) void chromeApi.runtime.lastError;
          });
        }
        openWhatsNewPage(false);
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
          shared.STORAGE_KEYS.SELECTED_FONT_ID,
          shared.STORAGE_KEYS.CLOUD_FONT_WEIGHT,
          shared.STORAGE_KEYS.IS_ENABLED,
          shared.STORAGE_KEYS.FONT_MODE,
          shared.STORAGE_KEYS.ADVANCED_FONT_CONFIG,
        ];
        if (state.siteKey) {
          keys.push(shared.siteDisabledKey(state.siteKey));
          keys.push(shared.siteFontKey(state.siteKey));
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
            state.selectedFontId = typeof data[shared.STORAGE_KEYS.SELECTED_FONT_ID] === 'string'
              ? data[shared.STORAGE_KEYS.SELECTED_FONT_ID]
              : '';
            state.cloudFontWeight = shared.normalizeCloudFontWeight(
              data[shared.STORAGE_KEYS.CLOUD_FONT_WEIGHT]
            );
            state.isEnabled = Boolean(data[shared.STORAGE_KEYS.IS_ENABLED]);
            state.fontMode = shared.normalizeFontMode(data[shared.STORAGE_KEYS.FONT_MODE]);
            state.advancedFontConfig = shared.createAdvancedFontConfig(
              data[shared.STORAGE_KEYS.ADVANCED_FONT_CONFIG]
            );
            state.siteDisabled = Boolean(
              state.siteKey && data[shared.siteDisabledKey(state.siteKey)]
            );
            var rawSiteRule = state.siteKey ? data[shared.siteFontKey(state.siteKey)] : null;
            state.siteFontRule = rawSiteRule && !shared.isSiteFontRuleEmpty(rawSiteRule)
              ? shared.createSiteFontRule(rawSiteRule)
              : null;
            syncSiteDraftFromSaved();
            state.editScope = hasActiveSiteFontRule() && !state.siteDisabled ? 'site' : 'global';

            renderAllUi();
            maybeOpenWhatsNewInBackground();

            if (!state.restricted && state.tabId && (state.incognito || state.isEnabled)) {
              chromeApi.tabs.sendMessage(
                state.tabId,
                { action: shared.MSG_ACTIONS.GET_PAGE_STATE },
                { frameId: 0 },
                function (resp) {
                  if (!chromeApi.runtime.lastError && resp && resp.hasFontChanger) {
                    var changed = false;
                    if (state.incognito && typeof resp.tabIncognitoOverride === 'boolean') {
                      state.siteDisabled = resp.tabIncognitoOverride;
                      syncPopupActionBadge(state.siteDisabled);
                      changed = true;
                    }
                    if (state.incognito && resp.hasTabIncognitoSiteFontOverride) {
                      state.siteFontRule = resp.tabIncognitoSiteFontOverride
                        ? shared.createSiteFontRule(resp.tabIncognitoSiteFontOverride)
                        : null;
                      syncSiteDraftFromSaved();
                      state.editScope = hasActiveSiteFontRule() && !state.siteDisabled ? 'site' : 'global';
                      changed = true;
                    }
                    if (changed) {
                      renderAllUi();
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
