'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const optionsMod = require('../extension/options.js');

function createOptionsHarness(initialSync = {}) {
  const syncStore = Object.assign({}, initialSync);
  const onChangedListeners = [];
  const tabsCreated = [];
  let lastError = null;

  class FakeEl {
    constructor(tag, id = '') {
      this.tagName = String(tag || 'div').toUpperCase();
      this.id = id;
      this.children = [];
      this.options = [];
      this.selectedIndex = -1;
      this.value = '';
      this.hidden = false;
      this.placeholder = '';
      this.className = '';
      this.dataset = {};
      this.attributes = new Map();
      this.listeners = new Map();
      this._textContent = '';
      const cls = new Set();
      this.classList = {
        add: (...names) => names.forEach((n) => cls.add(n)),
        remove: (...names) => names.forEach((n) => cls.delete(n)),
        contains: (n) => cls.has(n),
      };
    }
    get textContent() {
      return this._textContent;
    }
    set textContent(v) {
      this._textContent = String(v === undefined || v === null ? '' : v);
      if (this._textContent === '') {
        this.children = [];
        if (this.tagName === 'SELECT') {
          this.options = [];
          this.selectedIndex = -1;
          this.value = '';
        }
      }
    }
    get selectedOptions() {
      return this.selectedIndex >= 0 && this.options[this.selectedIndex]
        ? [this.options[this.selectedIndex]]
        : [];
    }
    appendChild(child) {
      this.children.push(child);
      if (this.tagName === 'SELECT' && child && child.tagName === 'OPTGROUP' && Array.isArray(child.children)) {
        for (const opt of child.children) {
          this.options.push(opt);
        }
      }
      return child;
    }
    add(opt, before) {
      if (before) {
        const idx = this.options.indexOf(before);
        if (idx !== -1) {
          this.options.splice(idx, 0, opt);
          return;
        }
      }
      this.options.push(opt);
    }
    setAttribute(k, v) {
      this.attributes.set(k, String(v));
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    dispatch(type) {
      const fns = this.listeners.get(type);
      if (fns) for (const fn of fns) fn({ type, target: this });
    }
  }

  const ids = [
    'optionsHeading', 'optionsFeedbackLink', 'optionsLangToggle', 'optionsStatusMsg', 'optionsQuotaText',
    'excludedHeading', 'excludedCountBadge', 'clearAllExcludedBtn', 'addExcludedInput', 'addExcludedBtn',
    'excludedSearchInput', 'excludedEmpty', 'excludedList',
    'siteFontHeading', 'siteFontCountBadge', 'siteFontSearchInput', 'siteFontHostLabel', 'siteFontHostInput',
    'siteFontModeLabel', 'siteFontModeSelect', 'siteBasicFontField', 'siteBasicFontLabel', 'siteBasicFontSelect',
    'siteCjkFontField', 'siteCjkFontLabel', 'siteCjkFontSelect', 'siteLatinFontField', 'siteLatinFontLabel',
    'siteLatinFontSelect', 'cancelEditSiteFontBtn', 'saveSiteFontBtn', 'siteFontEmpty', 'siteFontList',
  ];

  const byId = new Map();
  for (const id of ids) {
    byId.set(id, new FakeEl(id.includes('Select') ? 'select' : 'div', id));
  }
  const modeSel = byId.get('siteFontModeSelect');
  const optBasic = new FakeEl('option');
  optBasic.value = 'basic';
  const optAdv = new FakeEl('option');
  optAdv.value = 'advanced';
  modeSel.add(optBasic);
  modeSel.add(optAdv);
  modeSel.value = 'basic';
  modeSel.selectedIndex = 0;

  const titleEl = new FakeEl('title');
  const doc = {
    documentElement: new FakeEl('html'),
    querySelector: (s) => (s === 'title' ? titleEl : null),
    getElementById: (id) => byId.get(id) || null,
    createElement: (tag) => new FakeEl(tag),
  };

  const chrome = {
    i18n: { getUILanguage: () => 'zh-Hant' },
    runtime: {
      id: 'options-test-id',
      get lastError() {
        return lastError;
      },
    },
    fontSettings: {
      getFontList(cb) {
        cb([
          { displayName: 'Arial', fontId: 'Arial' },
          { displayName: 'PingFang TC', fontId: 'PingFangTC-Regular' },
          { displayName: 'JetBrains Mono', fontId: 'JetBrainsMono-Regular' },
        ]);
      },
    },
    tabs: {
      create(details) {
        tabsCreated.push(details);
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
          for (const k of Array.isArray(keys) ? keys : Object.keys(keys || {})) {
            if (Object.prototype.hasOwnProperty.call(syncStore, k)) out[k] = syncStore[k];
          }
          cb(out);
        },
        set(items, cb) {
          Object.assign(syncStore, items);
          lastError = null;
          if (cb) cb();
        },
        remove(keys, cb) {
          for (const k of Array.isArray(keys) ? keys : [keys]) {
            delete syncStore[k];
          }
          lastError = null;
          if (cb) cb();
        },
      },
      onChanged: {
        addListener(fn) {
          onChangedListeners.push(fn);
        },
      },
    },
  };

  const controller = optionsMod.initOptions({
    document: doc,
    window: { navigator: { language: 'zh-TW' } },
    chrome,
  });

  return { controller, byId, syncStore, tabsCreated };
}

test('Options page lists, searches, adds, removes excluded sites and per-site font rules, and links to david888.com/contact', async () => {
  const h = createOptionsHarness({
    uiLanguage: 'zh-Hant',
    'siteDisabled:ads.example.com': 1,
    'siteDisabled:news.example.org': 1,
    'siteFont:github.com': { fontMode: 'basic', selectedFont: 'JetBrains Mono' },
  });
  await h.controller.ready;

  assert.deepEqual(h.controller.getState().excludedHosts, ['ads.example.com', 'news.example.org']);
  assert.equal(h.byId.get('excludedList').children.length, 2);
  assert.equal(h.byId.get('siteFontList').children.length, 1);
  assert.equal(h.byId.get('optionsFeedbackLink').attributes.get('href'), 'https://david888.com/contact');

  // Filter excluded sites.
  h.byId.get('excludedSearchInput').value = 'news';
  h.byId.get('excludedSearchInput').dispatch('input');
  assert.equal(h.byId.get('excludedList').children.length, 1);

  // Add a new excluded host from full URL.
  h.byId.get('excludedSearchInput').value = '';
  h.byId.get('addExcludedInput').value = 'https://video.example.net/watch';
  h.byId.get('addExcludedBtn').dispatch('click');
  assert.equal(h.syncStore['siteDisabled:video.example.net'], 1);

  // Remove one excluded site via row button, then clear remaining.
  const firstRowRemoveBtn = h.byId.get('excludedList').children[0].children[1].children[0];
  firstRowRemoveBtn.dispatch('click');
  assert.equal(h.syncStore['siteDisabled:ads.example.com'], undefined);

  h.byId.get('clearAllExcludedBtn').dispatch('click');
  assert.equal(h.controller.getState().excludedHosts.length, 0);

  // Add a new CJK/Latin split site font rule.
  h.byId.get('siteFontHostInput').value = 'ptt.cc';
  h.byId.get('siteFontModeSelect').value = 'advanced';
  h.byId.get('siteFontModeSelect').dispatch('change');
  const cjkSel = h.byId.get('siteCjkFontSelect');
  cjkSel.selectedIndex = cjkSel.options.findIndex((o) => o.value === 'PingFang TC');
  cjkSel.value = 'PingFang TC';
  const latSel = h.byId.get('siteLatinFontSelect');
  latSel.selectedIndex = latSel.options.findIndex((o) => o.value === 'JetBrains Mono');
  latSel.value = 'JetBrains Mono';
  h.byId.get('saveSiteFontBtn').dispatch('click');

  assert.equal(h.syncStore['siteFont:ptt.cc'].fontMode, 'advanced');
  assert.equal(h.syncStore['siteFont:ptt.cc'].advancedFontConfig.cjkFont, 'PingFang TC');
  assert.equal(h.syncStore['siteFont:ptt.cc'].advancedFontConfig.latinFont, 'JetBrains Mono');

  // Reject invalid host input.
  h.byId.get('addExcludedInput').value = 'chrome://settings';
  h.byId.get('addExcludedBtn').dispatch('click');
  assert.equal(h.byId.get('optionsStatusMsg').classList.contains('is-error'), true);

  // Feedback click navigates to david888.com/contact.
  h.byId.get('optionsFeedbackLink').dispatch('click');
  assert.deepEqual(h.tabsCreated.at(-1), { url: 'https://david888.com/contact' });

  // Host:port and IPv6:port inputs are accepted (matching stored keys when editing).
  assert.equal(optionsMod.parseHostInput(require('../extension/shared.js'), 'localhost:3000'), 'localhost:3000');
  assert.equal(optionsMod.parseHostInput(require('../extension/shared.js'), 'example.com:8443'), 'example.com:8443');
  assert.equal(optionsMod.parseHostInput(require('../extension/shared.js'), '[::1]:8080'), '[::1]:8080');
  assert.equal(optionsMod.parseHostInput(require('../extension/shared.js'), 'javascript:alert(1)'), null);

  h.byId.get('siteFontHostInput').value = 'localhost:3000';
  h.byId.get('siteFontModeSelect').value = 'basic';
  h.byId.get('siteFontModeSelect').dispatch('change');
  const basicSel = h.byId.get('siteBasicFontSelect');
  basicSel.selectedIndex = basicSel.options.findIndex((o) => o.value === 'Arial');
  basicSel.value = 'Arial';
  h.byId.get('saveSiteFontBtn').dispatch('click');
  assert.equal(h.syncStore['siteFont:localhost:3000'].selectedFont, 'Arial');

  // Cloud Google Fonts appear in basic & Non-CJK selects (not CJK) and persist gf:* fontId.
  const cjkSelect = h.byId.get('siteCjkFontSelect');
  assert.equal(cjkSelect.options.some((o) => o.dataset && o.dataset.cloudFont === '1'), false);
  const cloudOpt = basicSel.options.find((o) => o.dataset && o.dataset.fontId === 'gf:fira-code');
  assert.ok(cloudOpt);
  h.byId.get('siteFontHostInput').value = 'docs.example.org';
  basicSel.selectedIndex = basicSel.options.indexOf(cloudOpt);
  basicSel.value = 'Fira Code';
  h.byId.get('saveSiteFontBtn').dispatch('click');
  assert.equal(h.syncStore['siteFont:docs.example.org'].selectedFont, 'Fira Code');
  assert.equal(h.syncStore['siteFont:docs.example.org'].selectedFontId, 'gf:fira-code');
});
