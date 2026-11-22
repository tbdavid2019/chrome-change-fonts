(function (global) {
  'use strict';

  var SHARED = global.FontChangerShared || (typeof require === 'function' ? require('./shared.js') : null);

  var LOCALES = {
    'zh-Hant': {
      title: '網站規則管理 - 改字體 333',
      heading: '網站規則管理',
      feedback: '意見反應',
      langToggle: 'EN',
      excludedHeading: '已排除的網站（套用 OFF）',
      clearAllExcluded: '全部移除',
      addExcludedPlaceholder: '輸入網域或網址，例如 example.com',
      addExcludedBtn: '加入排除',
      excludedSearchPlaceholder: '搜尋已排除網站',
      excludedEmpty: '目前沒有已排除的網站（或無符合搜尋結果）。',
      removeBtn: '移除',
      siteFontHeading: '特定網站專用字體',
      siteFontSearchPlaceholder: '搜尋網站字體規則',
      siteFontHostLabel: '網站網域或網址',
      siteFontHostPlaceholder: '例如 github.com',
      siteFontModeLabel: '模式',
      modeBasic: '單一字體',
      modeAdvanced: 'CJK / 英數分開',
      siteBasicFontLabel: '字體',
      siteCjkFontLabel: 'CJK（中日韓）',
      siteLatinFontLabel: '非 CJK（英數與標點）',
      defaultFontOption: '系統預設字體',
      unavailableFontLabel: '{font}（本機未安裝）',
      saveSiteFontBtn: '儲存網站字體',
      cancelEditBtn: '取消編輯',
      editBtn: '編輯',
      deleteBtn: '刪除',
      siteFontEmpty: '目前沒有特定網站專用字體規則（或無符合搜尋結果）。',
      statusReady: '已載入同步規則。',
      statusSaved: '已儲存：{host}',
      statusRemoved: '已移除：{host}',
      statusClearedAll: '已清除所有排除網站。',
      errInvalidHost: '請輸入有效的 http(s) 網址或網域名稱。',
      errEmptyFont: '請至少選擇一個字體。',
      errQuota: '雲端同步項目數量已達上限，請先刪除部分規則。',
      errStorage: '同步儲存操作失敗，請稍後再試。',
      quotaLabel: '同步鍵用量：{used} / {limit}',
    },
    en: {
      title: 'Site Rules Manager - Website Font Changer 333',
      heading: 'Site Rules Manager',
      feedback: 'Feedback',
      langToggle: '中',
      excludedHeading: 'Excluded Sites (OFF Badge)',
      clearAllExcluded: 'Clear all',
      addExcludedPlaceholder: 'Enter domain or URL, e.g. example.com',
      addExcludedBtn: 'Exclude site',
      excludedSearchPlaceholder: 'Search excluded sites',
      excludedEmpty: 'No excluded sites yet (or no matching search results).',
      removeBtn: 'Remove',
      siteFontHeading: 'Per-Site Custom Fonts',
      siteFontSearchPlaceholder: 'Search per-site font rules',
      siteFontHostLabel: 'Site domain or URL',
      siteFontHostPlaceholder: 'e.g. github.com',
      siteFontModeLabel: 'Mode',
      modeBasic: 'Single font',
      modeAdvanced: 'CJK / Latin split',
      siteBasicFontLabel: 'Font',
      siteCjkFontLabel: 'CJK (Chinese / Japanese / Korean)',
      siteLatinFontLabel: 'Non-CJK (Latin / numbers / punctuation)',
      defaultFontOption: 'System default font',
      unavailableFontLabel: '{font} (Not installed on this device)',
      saveSiteFontBtn: 'Save site font',
      cancelEditBtn: 'Cancel',
      editBtn: 'Edit',
      deleteBtn: 'Delete',
      siteFontEmpty: 'No per-site custom font rules yet (or no matching search results).',
      statusReady: 'Synced rules loaded.',
      statusSaved: 'Saved: {host}',
      statusRemoved: 'Removed: {host}',
      statusClearedAll: 'Cleared all excluded sites.',
      errInvalidHost: 'Please enter a valid http(s) URL or domain name.',
      errEmptyFont: 'Please choose at least one font.',
      errQuota: 'Sync item quota reached. Remove some rules before adding more.',
      errStorage: 'Storage operation failed. Please try again.',
      quotaLabel: 'Sync items used: {used} / {limit}',
    },
  };

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

  function parseHostInput(shared, rawValue) {
    var trimmed = String(rawValue || '').trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed)) {
      return shared.normalizeSiteKey(trimmed);
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:(?:\/\/|[^\d]|$)/.test(trimmed)) {
      return null;
    }
    var candidate = 'https://' + trimmed;
    var host = shared.normalizeSiteKey(candidate);
    if (!host) return null;
    var hostnameOnly = host.charAt(0) === '['
      ? host.slice(0, host.indexOf(']') + 1)
      : host.split(':')[0];
    if (hostnameOnly !== 'localhost' && hostnameOnly.indexOf('.') === -1 && hostnameOnly.charAt(0) !== '[') {
      return null;
    }
    return host;
  }

  function initOptions(deps) {
    var d = deps || {};
    var doc = d.document || global.document;
    var win = d.window || global.window || global;
    var chromeApi = d.chrome || global.chrome;
    var shared = d.shared || SHARED;

    var ui = {
      title: doc.querySelector('title'),
      heading: doc.getElementById('optionsHeading'),
      feedbackLink: doc.getElementById('optionsFeedbackLink'),
      langToggle: doc.getElementById('optionsLangToggle'),
      statusMsg: doc.getElementById('optionsStatusMsg'),
      quotaText: doc.getElementById('optionsQuotaText'),
      excludedHeading: doc.getElementById('excludedHeading'),
      excludedCountBadge: doc.getElementById('excludedCountBadge'),
      clearAllExcludedBtn: doc.getElementById('clearAllExcludedBtn'),
      addExcludedInput: doc.getElementById('addExcludedInput'),
      addExcludedBtn: doc.getElementById('addExcludedBtn'),
      excludedSearchInput: doc.getElementById('excludedSearchInput'),
      excludedEmpty: doc.getElementById('excludedEmpty'),
      excludedList: doc.getElementById('excludedList'),
      siteFontHeading: doc.getElementById('siteFontHeading'),
      siteFontCountBadge: doc.getElementById('siteFontCountBadge'),
      siteFontSearchInput: doc.getElementById('siteFontSearchInput'),
      siteFontHostLabel: doc.getElementById('siteFontHostLabel'),
      siteFontHostInput: doc.getElementById('siteFontHostInput'),
      siteFontModeLabel: doc.getElementById('siteFontModeLabel'),
      siteFontModeSelect: doc.getElementById('siteFontModeSelect'),
      siteBasicFontField: doc.getElementById('siteBasicFontField'),
      siteBasicFontLabel: doc.getElementById('siteBasicFontLabel'),
      siteBasicFontSelect: doc.getElementById('siteBasicFontSelect'),
      siteCjkFontField: doc.getElementById('siteCjkFontField'),
      siteCjkFontLabel: doc.getElementById('siteCjkFontLabel'),
      siteCjkFontSelect: doc.getElementById('siteCjkFontSelect'),
      siteLatinFontField: doc.getElementById('siteLatinFontField'),
      siteLatinFontLabel: doc.getElementById('siteLatinFontLabel'),
      siteLatinFontSelect: doc.getElementById('siteLatinFontSelect'),
      cancelEditSiteFontBtn: doc.getElementById('cancelEditSiteFontBtn'),
      saveSiteFontBtn: doc.getElementById('saveSiteFontBtn'),
      siteFontEmpty: doc.getElementById('siteFontEmpty'),
      siteFontList: doc.getElementById('siteFontList'),
    };

    var state = {
      locale: getBrowserLocale(win && win.navigator, chromeApi),
      systemFonts: [],
      excludedHosts: [],
      siteFontEntries: [],
      totalSyncKeys: 0,
      editingHost: null,
      statusText: '',
      statusKind: '',
    };

    function getMsgs() {
      return LOCALES[state.locale] || LOCALES.en;
    }

    function setStatus(text, kind) {
      state.statusText = text;
      state.statusKind = kind || '';
      if (ui.statusMsg) {
        ui.statusMsg.textContent = text;
        if (ui.statusMsg.classList) {
          ui.statusMsg.classList.remove('is-ok', 'is-error');
          if (kind === 'ok') ui.statusMsg.classList.add('is-ok');
          if (kind === 'error') ui.statusMsg.classList.add('is-error');
        }
      }
    }

    function populateSelectWithFonts(selectEl, storedName, storedFontId) {
      if (!selectEl) return;
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

      var labelName = storedName || storedFontId;
      var missingOpt = doc.createElement('option');
      missingOpt.value = labelName;
      missingOpt.dataset.fontId = storedFontId || labelName;
      missingOpt.textContent = msgs.unavailableFontLabel.replace('{font}', labelName);
      selectEl.add(missingOpt, selectEl.options.length > 1 ? selectEl.options[1] : null);
      selectEl.selectedIndex = 1;
      selectEl.value = labelName;
    }

    function updateSiteFontFormVisibility() {
      var isAdvanced = ui.siteFontModeSelect && ui.siteFontModeSelect.value === shared.FONT_MODE_ADVANCED;
      if (ui.siteBasicFontField) ui.siteBasicFontField.hidden = isAdvanced;
      if (ui.siteCjkFontField) ui.siteCjkFontField.hidden = !isAdvanced;
      if (ui.siteLatinFontField) ui.siteLatinFontField.hidden = !isAdvanced;
      if (ui.cancelEditSiteFontBtn) ui.cancelEditSiteFontBtn.hidden = !state.editingHost;
    }

    function applyLocaleLabels() {
      var msgs = getMsgs();
      if (doc.documentElement) doc.documentElement.lang = state.locale;
      if (ui.title) ui.title.textContent = msgs.title;
      if (ui.heading) ui.heading.textContent = msgs.heading;
      if (ui.feedbackLink) {
        ui.feedbackLink.textContent = msgs.feedback;
        if (typeof ui.feedbackLink.setAttribute === 'function') {
          ui.feedbackLink.setAttribute('href', shared.FEEDBACK_URL);
        }
      }
      if (ui.langToggle) ui.langToggle.textContent = msgs.langToggle;
      if (ui.excludedHeading) ui.excludedHeading.textContent = msgs.excludedHeading;
      if (ui.clearAllExcludedBtn) ui.clearAllExcludedBtn.textContent = msgs.clearAllExcluded;
      if (ui.addExcludedInput) ui.addExcludedInput.placeholder = msgs.addExcludedPlaceholder;
      if (ui.addExcludedBtn) ui.addExcludedBtn.textContent = msgs.addExcludedBtn;
      if (ui.excludedSearchInput) ui.excludedSearchInput.placeholder = msgs.excludedSearchPlaceholder;
      if (ui.excludedEmpty) ui.excludedEmpty.textContent = msgs.excludedEmpty;
      if (ui.siteFontHeading) ui.siteFontHeading.textContent = msgs.siteFontHeading;
      if (ui.siteFontSearchInput) ui.siteFontSearchInput.placeholder = msgs.siteFontSearchPlaceholder;
      if (ui.siteFontHostLabel) ui.siteFontHostLabel.textContent = msgs.siteFontHostLabel;
      if (ui.siteFontHostInput) ui.siteFontHostInput.placeholder = msgs.siteFontHostPlaceholder;
      if (ui.siteFontModeLabel) ui.siteFontModeLabel.textContent = msgs.siteFontModeLabel;
      if (ui.siteFontModeSelect && ui.siteFontModeSelect.options && ui.siteFontModeSelect.options.length >= 2) {
        ui.siteFontModeSelect.options[0].textContent = msgs.modeBasic;
        ui.siteFontModeSelect.options[1].textContent = msgs.modeAdvanced;
      }
      if (ui.siteBasicFontLabel) ui.siteBasicFontLabel.textContent = msgs.siteBasicFontLabel;
      if (ui.siteCjkFontLabel) ui.siteCjkFontLabel.textContent = msgs.siteCjkFontLabel;
      if (ui.siteLatinFontLabel) ui.siteLatinFontLabel.textContent = msgs.siteLatinFontLabel;
      if (ui.saveSiteFontBtn) ui.saveSiteFontBtn.textContent = msgs.saveSiteFontBtn;
      if (ui.cancelEditSiteFontBtn) ui.cancelEditSiteFontBtn.textContent = msgs.cancelEditBtn;
      if (ui.siteFontEmpty) ui.siteFontEmpty.textContent = msgs.siteFontEmpty;
      if (ui.quotaText) {
        ui.quotaText.textContent = msgs.quotaLabel
          .replace('{used}', String(state.totalSyncKeys))
          .replace('{limit}', String(shared.MAX_SYNC_ITEMS - shared.CORE_SYNC_RESERVE));
      }
    }

    function describeRule(rule) {
      var msgs = getMsgs();
      if (rule.fontMode === shared.FONT_MODE_ADVANCED) {
        var cfg = rule.advancedFontConfig;
        var cjk = cfg.cjkFont || cfg.cjkFontId || msgs.defaultFontOption;
        var lat = cfg.latinFont || cfg.latinFontId || msgs.defaultFontOption;
        return msgs.modeAdvanced + ' — CJK: ' + cjk + ' | Non-CJK: ' + lat;
      }
      return msgs.modeBasic + ' — ' + (rule.selectedFont || msgs.defaultFontOption);
    }

    function renderExcludedList() {
      var msgs = getMsgs();
      var q = ui.excludedSearchInput ? String(ui.excludedSearchInput.value || '').trim().toLowerCase() : '';
      var filtered = state.excludedHosts.filter(function (host) {
        return !q || host.toLowerCase().indexOf(q) !== -1;
      });

      if (ui.excludedCountBadge) ui.excludedCountBadge.textContent = String(state.excludedHosts.length);
      if (ui.clearAllExcludedBtn) ui.clearAllExcludedBtn.hidden = state.excludedHosts.length === 0;
      if (ui.excludedEmpty) ui.excludedEmpty.hidden = filtered.length > 0;
      if (!ui.excludedList) return;

      ui.excludedList.textContent = '';
      for (var i = 0; i < filtered.length; i++) {
        (function (host) {
          var li = doc.createElement('li');
          li.className = 'site-item';

          var meta = doc.createElement('div');
          meta.className = 'site-meta';
          var hostEl = doc.createElement('span');
          hostEl.className = 'site-host';
          hostEl.textContent = host;
          meta.appendChild(hostEl);

          var actions = doc.createElement('div');
          actions.className = 'site-item-actions';
          var removeBtn = doc.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'btn btn-danger btn-sm';
          removeBtn.textContent = msgs.removeBtn;
          removeBtn.addEventListener('click', function () {
            removeExcludedHost(host);
          });
          actions.appendChild(removeBtn);

          li.appendChild(meta);
          li.appendChild(actions);
          ui.excludedList.appendChild(li);
        })(filtered[i]);
      }
    }

    function renderSiteFontList() {
      var msgs = getMsgs();
      var q = ui.siteFontSearchInput ? String(ui.siteFontSearchInput.value || '').trim().toLowerCase() : '';
      var filtered = state.siteFontEntries.filter(function (entry) {
        return !q || entry.host.toLowerCase().indexOf(q) !== -1;
      });

      if (ui.siteFontCountBadge) ui.siteFontCountBadge.textContent = String(state.siteFontEntries.length);
      if (ui.siteFontEmpty) ui.siteFontEmpty.hidden = filtered.length > 0;
      if (!ui.siteFontList) return;

      ui.siteFontList.textContent = '';
      for (var i = 0; i < filtered.length; i++) {
        (function (entry) {
          var li = doc.createElement('li');
          li.className = 'site-item';

          var meta = doc.createElement('div');
          meta.className = 'site-meta';
          var hostEl = doc.createElement('span');
          hostEl.className = 'site-host';
          hostEl.textContent = entry.host;
          var detailEl = doc.createElement('span');
          detailEl.className = 'site-detail';
          detailEl.textContent = describeRule(entry.rule);
          meta.appendChild(hostEl);
          meta.appendChild(detailEl);

          var actions = doc.createElement('div');
          actions.className = 'site-item-actions';
          var editBtn = doc.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'btn btn-sm';
          editBtn.textContent = msgs.editBtn;
          editBtn.addEventListener('click', function () {
            loadRuleIntoForm(entry.host, entry.rule);
          });

          var delBtn = doc.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'btn btn-danger btn-sm';
          delBtn.textContent = msgs.deleteBtn;
          delBtn.addEventListener('click', function () {
            removeSiteFontHost(entry.host);
          });

          actions.appendChild(editBtn);
          actions.appendChild(delBtn);

          li.appendChild(meta);
          li.appendChild(actions);
          ui.siteFontList.appendChild(li);
        })(filtered[i]);
      }
    }

    function renderAll() {
      applyLocaleLabels();
      updateSiteFontFormVisibility();
      renderExcludedList();
      renderSiteFontList();
    }

    function loadRuleIntoForm(host, rule) {
      state.editingHost = host;
      if (ui.siteFontHostInput) ui.siteFontHostInput.value = host;
      if (ui.siteFontModeSelect) ui.siteFontModeSelect.value = rule.fontMode;
      populateSelectWithFonts(ui.siteBasicFontSelect, rule.selectedFont, rule.selectedFont);
      populateSelectWithFonts(
        ui.siteCjkFontSelect,
        rule.advancedFontConfig.cjkFont || rule.advancedFontConfig.cjkFontId,
        rule.advancedFontConfig.cjkFontId
      );
      populateSelectWithFonts(
        ui.siteLatinFontSelect,
        rule.advancedFontConfig.latinFont || rule.advancedFontConfig.latinFontId,
        rule.advancedFontConfig.latinFontId
      );
      updateSiteFontFormVisibility();
    }

    function resetSiteFontForm() {
      state.editingHost = null;
      if (ui.siteFontHostInput) ui.siteFontHostInput.value = '';
      if (ui.siteFontModeSelect) ui.siteFontModeSelect.value = shared.FONT_MODE_BASIC;
      populateSelectWithFonts(ui.siteBasicFontSelect, '', '');
      populateSelectWithFonts(ui.siteCjkFontSelect, '', '');
      populateSelectWithFonts(ui.siteLatinFontSelect, '', '');
      updateSiteFontFormVisibility();
    }

    function applySyncSnapshot(items) {
      var data = items || {};
      if (data[shared.STORAGE_KEYS.UI_LANGUAGE] === 'zh-Hant' ||
          data[shared.STORAGE_KEYS.UI_LANGUAGE] === 'en') {
        state.locale = data[shared.STORAGE_KEYS.UI_LANGUAGE];
      }
      var keys = Object.keys(data);
      state.totalSyncKeys = keys.length;

      var excluded = [];
      var siteFonts = [];
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (k.indexOf(shared.SITE_DISABLED_PREFIX) === 0 && data[k]) {
          excluded.push(k.slice(shared.SITE_DISABLED_PREFIX.length));
        } else if (k.indexOf(shared.SITE_FONT_PREFIX) === 0 && data[k] && !shared.isSiteFontRuleEmpty(data[k])) {
          siteFonts.push({
            host: k.slice(shared.SITE_FONT_PREFIX.length),
            rule: shared.createSiteFontRule(data[k]),
          });
        }
      }
      excluded.sort();
      siteFonts.sort(function (a, b) {
        return a.host.localeCompare(b.host);
      });
      state.excludedHosts = excluded;
      state.siteFontEntries = siteFonts;
    }

    function reloadSyncData(statusText, statusKind) {
      return new Promise(function (resolve) {
        chromeApi.storage.sync.get(null, function (items) {
          applySyncSnapshot(items);
          renderAll();
          if (statusText) {
            setStatus(statusText, statusKind);
          } else if (!state.statusText) {
            setStatus(getMsgs().statusReady, '');
          }
          resolve();
        });
      });
    }

    function removeExcludedHost(host) {
      var msgs = getMsgs();
      chromeApi.storage.sync.remove(shared.siteDisabledKey(host), function () {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          setStatus(msgs.errStorage, 'error');
          return;
        }
        reloadSyncData(msgs.statusRemoved.replace('{host}', host), 'ok');
      });
    }

    function clearAllExcludedHosts() {
      var msgs = getMsgs();
      if (!state.excludedHosts.length) return;
      var keys = state.excludedHosts.map(function (h) {
        return shared.siteDisabledKey(h);
      });
      chromeApi.storage.sync.remove(keys, function () {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          setStatus(msgs.errStorage, 'error');
          return;
        }
        reloadSyncData(msgs.statusClearedAll, 'ok');
      });
    }

    function addExcludedHost() {
      var msgs = getMsgs();
      var host = parseHostInput(shared, ui.addExcludedInput ? ui.addExcludedInput.value : '');
      if (!host) {
        setStatus(msgs.errInvalidHost, 'error');
        return;
      }
      var syncKey = shared.siteDisabledKey(host);
      chromeApi.storage.sync.get(null, function (allItems) {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          setStatus(msgs.errStorage, 'error');
          return;
        }
        var keys = Object.keys(allItems || {});
        if (!allItems[syncKey] && keys.length >= shared.MAX_SYNC_ITEMS - shared.CORE_SYNC_RESERVE) {
          setStatus(msgs.errQuota, 'error');
          return;
        }
        var payload = {};
        payload[syncKey] = 1;
        chromeApi.storage.sync.set(payload, function () {
          if (chromeApi.runtime && chromeApi.runtime.lastError) {
            setStatus(msgs.errStorage, 'error');
            return;
          }
          if (ui.addExcludedInput) ui.addExcludedInput.value = '';
          reloadSyncData(msgs.statusSaved.replace('{host}', host), 'ok');
        });
      });
    }

    function removeSiteFontHost(host) {
      var msgs = getMsgs();
      chromeApi.storage.sync.remove(shared.siteFontKey(host), function () {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          setStatus(msgs.errStorage, 'error');
          return;
        }
        if (state.editingHost === host) {
          resetSiteFontForm();
        }
        reloadSyncData(msgs.statusRemoved.replace('{host}', host), 'ok');
      });
    }

    function saveSiteFontRule() {
      var msgs = getMsgs();
      var host = parseHostInput(shared, ui.siteFontHostInput ? ui.siteFontHostInput.value : '');
      if (!host) {
        setStatus(msgs.errInvalidHost, 'error');
        return;
      }
      var mode = ui.siteFontModeSelect ? shared.normalizeFontMode(ui.siteFontModeSelect.value) : shared.FONT_MODE_BASIC;
      var cjkOpt = ui.siteCjkFontSelect && ui.siteCjkFontSelect.selectedOptions && ui.siteCjkFontSelect.selectedOptions[0];
      var latinOpt = ui.siteLatinFontSelect && ui.siteLatinFontSelect.selectedOptions && ui.siteLatinFontSelect.selectedOptions[0];
      var rule = shared.createSiteFontRule({
        fontMode: mode,
        selectedFont: ui.siteBasicFontSelect ? (ui.siteBasicFontSelect.value || '') : '',
        advancedFontConfig: {
          cjkFont: ui.siteCjkFontSelect ? (ui.siteCjkFontSelect.value || '') : '',
          cjkFontId: cjkOpt && cjkOpt.dataset ? (cjkOpt.dataset.fontId || '') : '',
          latinFont: ui.siteLatinFontSelect ? (ui.siteLatinFontSelect.value || '') : '',
          latinFontId: latinOpt && latinOpt.dataset ? (latinOpt.dataset.fontId || '') : '',
        },
      });
      if (shared.isSiteFontRuleEmpty(rule)) {
        setStatus(msgs.errEmptyFont, 'error');
        return;
      }

      var oldHost = state.editingHost;
      var syncKey = shared.siteFontKey(host);
      chromeApi.storage.sync.get(null, function (allItems) {
        if (chromeApi.runtime && chromeApi.runtime.lastError) {
          setStatus(msgs.errStorage, 'error');
          return;
        }
        var keys = Object.keys(allItems || {});
        if (!allItems[syncKey] && keys.length >= shared.MAX_SYNC_ITEMS - shared.CORE_SYNC_RESERVE) {
          setStatus(msgs.errQuota, 'error');
          return;
        }
        var payload = {};
        payload[syncKey] = rule;
        chromeApi.storage.sync.set(payload, function () {
          if (chromeApi.runtime && chromeApi.runtime.lastError) {
            setStatus(msgs.errStorage, 'error');
            return;
          }
          if (state.editingHost === oldHost) {
            resetSiteFontForm();
          }
          if (oldHost && oldHost !== host) {
            chromeApi.storage.sync.remove(shared.siteFontKey(oldHost), function () {
              if (chromeApi.runtime && chromeApi.runtime.lastError) {
                reloadSyncData(msgs.errStorage, 'error');
                return;
              }
              reloadSyncData(msgs.statusSaved.replace('{host}', host), 'ok');
            });
          } else {
            reloadSyncData(msgs.statusSaved.replace('{host}', host), 'ok');
          }
        });
      });
    }

    function getSelectedFontPair(selectEl) {
      if (!selectEl) return { name: '', fontId: '' };
      var opt = selectEl.selectedOptions && selectEl.selectedOptions[0];
      var name = selectEl.value || '';
      var fontId = opt && opt.dataset && opt.dataset.fontId ? opt.dataset.fontId : name;
      return { name: name, fontId: fontId };
    }

    function bindEvents() {
      if (ui.langToggle) {
        ui.langToggle.addEventListener('click', function () {
          state.locale = state.locale === 'zh-Hant' ? 'en' : 'zh-Hant';
          var basicSel = getSelectedFontPair(ui.siteBasicFontSelect);
          var cjkSel = getSelectedFontPair(ui.siteCjkFontSelect);
          var latSel = getSelectedFontPair(ui.siteLatinFontSelect);
          populateSelectWithFonts(ui.siteBasicFontSelect, basicSel.name, basicSel.fontId);
          populateSelectWithFonts(ui.siteCjkFontSelect, cjkSel.name, cjkSel.fontId);
          populateSelectWithFonts(ui.siteLatinFontSelect, latSel.name, latSel.fontId);
          renderAll();
          var payload = {};
          payload[shared.STORAGE_KEYS.UI_LANGUAGE] = state.locale;
          chromeApi.storage.sync.set(payload, function () {
            if (chromeApi.runtime) void chromeApi.runtime.lastError;
          });
        });
      }

      if (ui.addExcludedBtn) ui.addExcludedBtn.addEventListener('click', addExcludedHost);
      if (ui.clearAllExcludedBtn) ui.clearAllExcludedBtn.addEventListener('click', clearAllExcludedHosts);
      if (ui.excludedSearchInput) ui.excludedSearchInput.addEventListener('input', renderExcludedList);
      if (ui.siteFontSearchInput) ui.siteFontSearchInput.addEventListener('input', renderSiteFontList);
      if (ui.siteFontModeSelect) ui.siteFontModeSelect.addEventListener('change', updateSiteFontFormVisibility);
      if (ui.saveSiteFontBtn) ui.saveSiteFontBtn.addEventListener('click', saveSiteFontRule);
      if (ui.cancelEditSiteFontBtn) ui.cancelEditSiteFontBtn.addEventListener('click', resetSiteFontForm);

      if (ui.feedbackLink) {
        ui.feedbackLink.addEventListener('click', function (ev) {
          if (chromeApi && chromeApi.tabs && typeof chromeApi.tabs.create === 'function') {
            if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
            chromeApi.tabs.create({ url: shared.FEEDBACK_URL });
          }
        });
      }

      if (chromeApi && chromeApi.storage && chromeApi.storage.onChanged &&
          typeof chromeApi.storage.onChanged.addListener === 'function') {
        chromeApi.storage.onChanged.addListener(function (_changes, areaName) {
          if (areaName === 'sync') {
            reloadSyncData(state.statusText, state.statusKind);
          }
        });
      }
    }

    function hydrate() {
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

      return fontListPromise.then(function (fonts) {
        state.systemFonts = fonts;
        populateSelectWithFonts(ui.siteBasicFontSelect, '', '');
        populateSelectWithFonts(ui.siteCjkFontSelect, '', '');
        populateSelectWithFonts(ui.siteLatinFontSelect, '', '');
        return reloadSyncData();
      });
    }

    bindEvents();
    var ready = hydrate();

    return {
      ready: ready,
      getState: function () {
        return {
          locale: state.locale,
          excludedHosts: state.excludedHosts.slice(),
          siteFontEntries: state.siteFontEntries.slice(),
          totalSyncKeys: state.totalSyncKeys,
        };
      },
    };
  }

  global.FontChangerOptions = Object.freeze({
    initOptions: initOptions,
    parseHostInput: parseHostInput,
    LOCALES: LOCALES,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.FontChangerOptions;
  }

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        initOptions({ document: document, window: window, chrome: chrome });
      });
    } else {
      initOptions({ document: document, window: window, chrome: chrome });
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
