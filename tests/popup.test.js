'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const shared = require('../extension/shared.js');
const popupMod = require('../extension/popup.js');

function createPopupHarness(options = {}) {
  const syncStore = Object.assign({}, options.syncStorage || {});
  const calls = {
    syncSet: [],
    syncRemove: [],
    sendMessage: [],
    executeScript: [],
  };
  let lastError = null;

  class FakeElement {
    constructor(tagName, id) {
      this.tagName = String(tagName || 'div').toUpperCase();
      this.id = id || '';
      this.children = [];
      this.options = [];
      this.selectedIndex = -1;
      this.value = '';
      this.checked = false;
      this.disabled = false;
      this.hidden = false;
      this.title = '';
      this._textContent = '';
      this.dataset = {};
      this.style = {};
      this.attributes = new Map();
      this.listeners = new Map();
      const clsSet = new Set();
      this.classList = {
        add: (...names) => names.forEach((n) => clsSet.add(n)),
        remove: (...names) => names.forEach((n) => clsSet.delete(n)),
        contains: (n) => clsSet.has(n),
        toggle: (n, force) => {
          if (force === undefined) {
            if (clsSet.has(n)) clsSet.delete(n);
            else clsSet.add(n);
          } else if (force) {
            clsSet.add(n);
          } else {
            clsSet.delete(n);
          }
        },
      };
    }
    get textContent() {
      return this._textContent;
    }
    set textContent(v) {
      this._textContent = String(v === undefined || v === null ? '' : v);
      if (this.tagName === 'SELECT' && this._textContent === '') {
        this.options = [];
        this.selectedIndex = -1;
        this.value = '';
      }
    }
    get selectedOptions() {
      if (this.selectedIndex >= 0 && this.options[this.selectedIndex]) {
        return [this.options[this.selectedIndex]];
      }
      return [];
    }
    setAttribute(k, v) {
      this.attributes.set(k, String(v));
    }
    getAttribute(k) {
      return this.attributes.get(k) || null;
    }
    appendChild(child) {
      this.children.push(child);
      return child;
    }
    add(option, before) {
      if (before) {
        const idx = this.options.indexOf(before);
        if (idx !== -1) {
          this.options.splice(idx, 0, option);
          return;
        }
      }
      this.options.push(option);
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    dispatch(type) {
      const fns = this.listeners.get(type);
      if (!fns) return;
      for (const fn of fns) fn({ type, target: this });
    }
  }

  const elementIds = [
    'languageToggle', 'headingText', 'fontLabel', 'fontSelect', 'toggleLabelText',
    'siteDisableLabelText', 'siteBadge', 'statusText', 'previewTitle', 'previewInput',
    'resetButton', 'modeHintText', 'basicModeTab', 'advancedModeTab', 'basicSettingsPanel',
    'advancedSettingsPanel', 'advancedPanelDescription', 'advancedCjkLabel', 'advancedLatinLabel',
    'advancedHelpText', 'advancedCjkSelect', 'advancedLatinSelect', 'enableCheckbox', 'siteDisableCheckbox',
  ];

  const byId = new Map();
  for (const id of elementIds) {
    const tag = id.includes('Select') ? 'select' : 'div';
    byId.set(id, new FakeElement(tag, id));
  }
  const titleEl = new FakeElement('title');
  const headEl = new FakeElement('head');
  const bodyEl = new FakeElement('body');
  const doc = {
    documentElement: new FakeElement('html'),
    head: headEl,
    body: bodyEl,
    querySelector(sel) {
      return sel === 'title' ? titleEl : null;
    },
    getElementById(id) {
      return byId.get(id) || null;
    },
    createElement(tag) {
      return new FakeElement(tag);
    },
  };

  const win = {
    navigator: { language: options.navLanguage || 'en-US' },
  };

  const chrome = {
    i18n: {
      getUILanguage() {
        return options.uiLanguage || 'en-US';
      },
    },
    runtime: {
      id: 'popup-test-id',
      get lastError() {
        return lastError;
      },
      getManifest() {
        return {
          content_scripts: [{ js: ['shared.js', 'content.js'] }],
        };
      },
    },
    tabs: {
      query(_q, cb) {
        cb([
          options.activeTab || {
            id: 42,
            url: 'https://example.com/article',
            incognito: false,
          },
        ]);
      },
      sendMessage(tabId, msg, optsOrCb, maybeCb) {
        const opts = typeof optsOrCb === 'function' ? undefined : optsOrCb;
        const cb = typeof optsOrCb === 'function' ? optsOrCb : maybeCb;
        calls.sendMessage.push({ tabId, msg, opts });
        if (options.sendMessageHandler) {
          const out = options.sendMessageHandler(tabId, msg, opts, (errMsg) => {
            lastError = errMsg ? { message: errMsg } : null;
          });
          if (cb) cb(out);
          lastError = null;
          return;
        }
        lastError = null;
        if (cb) cb({ ok: true, hasFontChanger: true });
      },
    },
    fontSettings: {
      getFontList(cb) {
        cb(
          options.fontList || [
            { displayName: 'Arial', fontId: 'Arial' },
            { displayName: 'Noto Sans TC', fontId: 'NotoSansCJKtc-Regular' },
          ]
        );
      },
    },
    scripting: {
      executeScript(details, cb) {
        calls.executeScript.push(details);
        if (options.executeScriptHandler) {
          const errMsg = options.executeScriptHandler(details);
          lastError = errMsg ? { message: errMsg } : null;
        } else {
          lastError = null;
        }
        if (cb) cb();
        lastError = null;
      },
    },
    storage: {
      sync: {
        get(keys, cb) {
          if (keys === null) {
            cb(Object.assign({}, syncStore));
            return;
          }
          const out = {};
          const list = Array.isArray(keys) ? keys : Object.keys(keys || {});
          for (const k of list) {
            if (Object.prototype.hasOwnProperty.call(syncStore, k)) {
              out[k] = syncStore[k];
            }
          }
          cb(out);
        },
        set(items, cb) {
          calls.syncSet.push(items);
          if (options.nextSetError) {
            lastError = { message: options.nextSetError };
            if (cb) cb();
            lastError = null;
            return;
          }
          Object.assign(syncStore, items);
          lastError = null;
          if (cb) cb();
        },
        remove(keys, cb) {
          calls.syncRemove.push(keys);
          if (options.nextRemoveError) {
            lastError = { message: options.nextRemoveError };
            if (cb) cb();
            lastError = null;
            return;
          }
          for (const k of Array.isArray(keys) ? keys : [keys]) {
            delete syncStore[k];
          }
          lastError = null;
          if (cb) cb();
        },
      },
    },
  };

  const controller = popupMod.initPopup({ document: doc, window: win, chrome });
  return { controller, byId, calls, syncStore, setNextError(msg) { options.nextSetError = msg; } };
}

test('hydrateUi performs zero storage.sync.set writes and skips GET_PAGE_STATE when globally disabled', async () => {
  const h = createPopupHarness({
    syncStorage: {
      selectedFont: 'Arial',
      isEnabled: false,
      uiLanguage: 'en',
    },
  });
  await h.controller.ready;

  assert.equal(h.calls.syncSet.length, 0);
  assert.equal(h.calls.sendMessage.length, 0);
  assert.equal(h.byId.get('siteBadge').textContent, 'example.com');
  assert.equal(h.byId.get('siteBadge').title, 'example.com');
});

test('Unavailable synced font from another OS is preserved across locale switches without mutating storage', async () => {
  const h = createPopupHarness({
    syncStorage: {
      selectedFont: 'PingFang TC',
      isEnabled: true,
      uiLanguage: 'en',
    },
    fontList: [{ displayName: 'Segoe UI', fontId: 'Segoe UI' }],
  });
  await h.controller.ready;

  const fontSelect = h.byId.get('fontSelect');
  assert.equal(fontSelect.value, 'PingFang TC');
  assert.equal(fontSelect.selectedOptions[0].dataset.unavailable, '1');
  assert.match(fontSelect.selectedOptions[0].textContent, /Not installed on this device/);
  assert.equal(h.calls.syncSet.length, 0);

  // Switch locale to zh-Hant -> unavailable option label updates and selection stays intact.
  h.byId.get('languageToggle').dispatch('click');
  assert.equal(fontSelect.value, 'PingFang TC');
  assert.equal(fontSelect.selectedOptions[0].dataset.unavailable, '1');
  assert.match(fontSelect.selectedOptions[0].textContent, /本機未安裝/);
});

test('Restricted URL disables site checkbox and localhost displays its real host instead of web preview', async () => {
  const cws = createPopupHarness({
    activeTab: { id: 1, url: 'https://chromewebstore.google.com/detail/abc', incognito: false },
    syncStorage: { isEnabled: true, selectedFont: 'Arial', uiLanguage: 'en' },
  });
  await cws.controller.ready;
  assert.equal(cws.byId.get('siteDisableCheckbox').disabled, true);
  assert.equal(cws.byId.get('siteBadge').textContent, 'Restricted');
  assert.match(cws.byId.get('statusText').textContent, /cannot be modified/);

  const local = createPopupHarness({
    activeTab: { id: 2, url: 'http://localhost:3000/app', incognito: false },
    syncStorage: { isEnabled: true, selectedFont: 'Arial', uiLanguage: 'en' },
  });
  await local.controller.ready;
  assert.equal(local.byId.get('siteDisableCheckbox').disabled, false);
  assert.equal(local.byId.get('siteBadge').textContent, 'localhost:3000');
  assert.equal(local.byId.get('siteBadge').title, 'localhost:3000');
  assert.equal(local.byId.get('statusText').classList.contains('status-active'), true);
});

test('Reset clears font preferences while preserving uiLanguage and all siteDisabled:* exclusions', async () => {
  const h = createPopupHarness({
    syncStorage: {
      uiLanguage: 'zh-Hant',
      selectedFont: 'Arial',
      fontMode: 'advanced',
      advancedFontConfig: { cjkFont: 'Noto Sans TC', cjkFontId: 'Noto', latinFont: 'Arial', latinFontId: 'Arial' },
      isEnabled: true,
      'siteDisabled:other.example.com': 1,
      'siteDisabled:example.com': 1,
    },
  });
  await h.controller.ready;

  h.byId.get('resetButton').dispatch('click');

  assert.equal(h.syncStore.selectedFont, '');
  assert.equal(h.syncStore.fontMode, 'basic');
  assert.equal(h.syncStore.isEnabled, false);
  assert.deepEqual(h.syncStore.advancedFontConfig, {
    cjkFont: '',
    cjkFontId: '',
    latinFont: '',
    latinFontId: '',
  });
  assert.equal(h.syncStore.uiLanguage, 'zh-Hant');
  assert.equal(h.syncStore['siteDisabled:other.example.com'], 1);
  assert.equal(h.syncStore['siteDisabled:example.com'], 1);
});

test('Site exclusion quota overflow and lastError revert checkbox and report status-error', async () => {
  const fullSync = { uiLanguage: 'en' };
  for (let i = 0; i < shared.MAX_SYNC_ITEMS - shared.CORE_SYNC_RESERVE; i++) {
    fullSync['siteDisabled:site' + i + '.com'] = 1;
  }
  const quotaHarness = createPopupHarness({ syncStorage: fullSync });
  await quotaHarness.controller.ready;

  const siteCb = quotaHarness.byId.get('siteDisableCheckbox');
  siteCb.checked = true;
  siteCb.dispatch('change');

  assert.equal(siteCb.checked, false);
  assert.equal(quotaHarness.syncStore['siteDisabled:example.com'], undefined);
  assert.equal(quotaHarness.byId.get('statusText').classList.contains('status-error'), true);
  assert.match(quotaHarness.byId.get('statusText').textContent, /quota/i);

  const errHarness = createPopupHarness({ syncStorage: { uiLanguage: 'en', selectedFont: 'Arial' } });
  await errHarness.controller.ready;
  errHarness.setNextError('Write failed');
  const enCb = errHarness.byId.get('enableCheckbox');
  enCb.checked = true;
  enCb.dispatch('change');
  assert.equal(enCb.checked, false);
  assert.equal(errHarness.byId.get('statusText').classList.contains('status-error'), true);
});

test('Incognito site exclusion broadcasts SET_TAB_SITE_DISABLED without frameId and writes zero sync storage', async () => {
  const h = createPopupHarness({
    activeTab: { id: 99, url: 'https://news.example.com', incognito: true },
    syncStorage: { uiLanguage: 'en', isEnabled: true, selectedFont: 'Arial' },
    sendMessageHandler(_tabId, msg) {
      if (msg.action === shared.MSG_ACTIONS.GET_PAGE_STATE) {
        return { ok: true, hasFontChanger: true, tabIncognitoOverride: null };
      }
      return { ok: true };
    },
  });
  await h.controller.ready;

  const siteCb = h.byId.get('siteDisableCheckbox');
  siteCb.checked = true;
  siteCb.dispatch('change');

  assert.equal(h.calls.syncSet.length, 0);
  const broadcast = h.calls.sendMessage.find((c) => c.msg.action === shared.MSG_ACTIONS.SET_TAB_SITE_DISABLED);
  assert.ok(broadcast);
  assert.equal(broadcast.opts, undefined);
  assert.equal(broadcast.msg.isDisabled, true);
  assert.equal(h.byId.get('statusText').classList.contains('status-excluded'), true);
});

test('ensureContentScript reads manifest content_scripts[0].js for both allFrames and main-frame fallback', async () => {
  const h = createPopupHarness({
    activeTab: { id: 7, url: 'https://spa.example.com', incognito: false },
    syncStorage: { uiLanguage: 'en', isEnabled: false, selectedFont: 'Arial' },
    sendMessageHandler(_tabId, msg, _opts, setErr) {
      if (msg.action === shared.MSG_ACTIONS.GET_PAGE_STATE) {
        setErr('Could not establish connection');
      }
      return undefined;
    },
    executeScriptHandler(details) {
      if (details.target && details.target.allFrames) {
        return 'Cannot access cross-origin frame';
      }
      return null;
    },
  });
  await h.controller.ready;

  const enCb = h.byId.get('enableCheckbox');
  enCb.checked = true;
  enCb.dispatch('change');

  assert.equal(h.calls.executeScript.length, 2);
  assert.deepEqual(h.calls.executeScript[0].files, ['shared.js', 'content.js']);
  assert.equal(h.calls.executeScript[0].target.allFrames, true);
  assert.deepEqual(h.calls.executeScript[1].files, ['shared.js', 'content.js']);
  assert.equal(h.calls.executeScript[1].target.allFrames, undefined);
});
