(function (global) {
  'use strict';

  var SHARED = global.FontChangerShared || (typeof require === 'function' ? require('./shared.js') : null);

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

  function initWhatsNew(deps) {
    var d = deps || {};
    var doc = d.document || global.document;
    var win = d.window || global.window || global;
    var chromeApi = d.chrome || global.chrome;
    var shared = d.shared || SHARED;

    var ui = {
      versionBadge: doc.getElementById('versionBadge'),
      openOptionsBtn: doc.getElementById('openOptionsBtn'),
      openWikiBtn: doc.getElementById('openWikiBtn'),
      openFeedbackBtn: doc.getElementById('openFeedbackBtn'),
      langSections: doc.getElementById('langSections'),
      sectionZh: doc.getElementById('section-zh'),
      sectionEn: doc.getElementById('section-en'),
      viewBothBtn: doc.getElementById('viewBothBtn'),
      viewZhBtn: doc.getElementById('viewZhBtn'),
      viewEnBtn: doc.getElementById('viewEnBtn'),
    };

    var currentView = 'both';
    var preferredLocale = getBrowserLocale(win && win.navigator, chromeApi);

    function applyVersionBadge() {
      var version = '2.2.0';
      if (chromeApi && chromeApi.runtime && typeof chromeApi.runtime.getManifest === 'function') {
        try {
          var manifest = chromeApi.runtime.getManifest();
          if (manifest && manifest.version) {
            version = String(manifest.version);
          }
        } catch (_e) {}
      }
      if (ui.versionBadge) {
        ui.versionBadge.textContent = 'v' + version;
      }
    }

    function applyPreferredOrder() {
      if (!ui.langSections || !ui.sectionZh || !ui.sectionEn) return;
      if (preferredLocale === 'en') {
        ui.langSections.appendChild(ui.sectionEn);
        ui.langSections.appendChild(ui.sectionZh);
      } else {
        ui.langSections.appendChild(ui.sectionZh);
        ui.langSections.appendChild(ui.sectionEn);
      }
    }

    function applyViewMode(mode) {
      currentView = mode === 'zh-Hant' || mode === 'en' ? mode : 'both';
      if (ui.sectionZh) {
        ui.sectionZh.hidden = currentView === 'en';
      }
      if (ui.sectionEn) {
        ui.sectionEn.hidden = currentView === 'zh-Hant';
      }
      [ui.viewBothBtn, ui.viewZhBtn, ui.viewEnBtn].forEach(function (btn) {
        if (!btn) return;
        var btnMode = btn.getAttribute('data-lang-view');
        var active = btnMode === currentView;
        if (btn.classList) btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }

    if (ui.openWikiBtn && shared && shared.WIKI_GUIDE_URL) {
      ui.openWikiBtn.setAttribute('href', shared.WIKI_GUIDE_URL);
    }
    if (ui.openFeedbackBtn && shared && shared.FEEDBACK_URL) {
      ui.openFeedbackBtn.setAttribute('href', shared.FEEDBACK_URL);
    }

    if (ui.openOptionsBtn) {
      ui.openOptionsBtn.addEventListener('click', function () {
        if (chromeApi && chromeApi.runtime && typeof chromeApi.runtime.openOptionsPage === 'function') {
          chromeApi.runtime.openOptionsPage();
        } else if (chromeApi && chromeApi.tabs && typeof chromeApi.tabs.create === 'function' &&
                   chromeApi.runtime && typeof chromeApi.runtime.getURL === 'function') {
          chromeApi.tabs.create({ url: chromeApi.runtime.getURL('options.html') });
        }
      });
    }

    [ui.viewBothBtn, ui.viewZhBtn, ui.viewEnBtn].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', function () {
        applyViewMode(btn.getAttribute('data-lang-view'));
      });
    });

    applyVersionBadge();
    applyPreferredOrder();
    applyViewMode('both');

    var ready = new Promise(function (resolve) {
      if (!chromeApi || !chromeApi.storage || !chromeApi.storage.sync ||
          typeof chromeApi.storage.sync.get !== 'function' || !shared) {
        resolve();
        return;
      }
      chromeApi.storage.sync.get([shared.STORAGE_KEYS.UI_LANGUAGE], function (items) {
        var lang = items && items[shared.STORAGE_KEYS.UI_LANGUAGE];
        if (lang === 'zh-Hant' || lang === 'en') {
          preferredLocale = lang;
          applyPreferredOrder();
        }
        resolve();
      });
    });

    return {
      ready: ready,
      getState: function () {
        return {
          preferredLocale: preferredLocale,
          currentView: currentView,
        };
      },
      applyViewMode: applyViewMode,
    };
  }

  global.FontChangerWhatsNew = Object.freeze({
    initWhatsNew: initWhatsNew,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.FontChangerWhatsNew;
  }

  if (typeof document !== 'undefined' && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        initWhatsNew({ document: document, window: window, chrome: chrome });
      });
    } else {
      initWhatsNew({ document: document, window: window, chrome: chrome });
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
