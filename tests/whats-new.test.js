'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shared = require('../extension/shared.js');
const whatsNewMod = require('../extension/whats-new.js');

function createWhatsNewHarness(options = {}) {
  const calls = {
    openOptionsPage: 0,
    tabsCreate: [],
  };

  class FakeEl {
    constructor(tag, id = '') {
      this.tagName = String(tag || 'div').toUpperCase();
      this.id = id;
      this.children = [];
      this.hidden = false;
      this.textContent = '';
      this.attributes = new Map();
      this.listeners = new Map();
      const cls = new Set();
      this.classList = {
        add: (...names) => names.forEach((n) => cls.add(n)),
        remove: (...names) => names.forEach((n) => cls.delete(n)),
        contains: (n) => cls.has(n),
        toggle: (n, force) => {
          if (force === undefined) {
            if (cls.has(n)) cls.delete(n);
            else cls.add(n);
          } else if (force) {
            cls.add(n);
          } else {
            cls.delete(n);
          }
        },
      };
    }
    appendChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) this.children.splice(idx, 1);
      this.children.push(child);
      return child;
    }
    setAttribute(k, v) {
      this.attributes.set(k, String(v));
    }
    getAttribute(k) {
      return this.attributes.get(k) || null;
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

  const byId = new Map([
    ['versionBadge', new FakeEl('span', 'versionBadge')],
    ['openOptionsBtn', new FakeEl('button', 'openOptionsBtn')],
    ['openWikiBtn', new FakeEl('a', 'openWikiBtn')],
    ['openFeedbackBtn', new FakeEl('a', 'openFeedbackBtn')],
    ['langSections', new FakeEl('main', 'langSections')],
    ['section-zh', new FakeEl('section', 'section-zh')],
    ['section-en', new FakeEl('section', 'section-en')],
    ['viewBothBtn', new FakeEl('button', 'viewBothBtn')],
    ['viewZhBtn', new FakeEl('button', 'viewZhBtn')],
    ['viewEnBtn', new FakeEl('button', 'viewEnBtn')],
  ]);

  byId.get('viewBothBtn').setAttribute('data-lang-view', 'both');
  byId.get('viewZhBtn').setAttribute('data-lang-view', 'zh-Hant');
  byId.get('viewEnBtn').setAttribute('data-lang-view', 'en');
  byId.get('langSections').appendChild(byId.get('section-zh'));
  byId.get('langSections').appendChild(byId.get('section-en'));

  const doc = {
    getElementById: (id) => byId.get(id) || null,
  };

  const chrome = {
    i18n: { getUILanguage: () => options.uiLanguage || 'zh-TW' },
    runtime: {
      getManifest: () => ({ version: '2.2.0' }),
      openOptionsPage: () => { calls.openOptionsPage += 1; },
      getURL: (rel) => 'chrome-extension://test-id/' + rel,
    },
    tabs: {
      create: (details) => calls.tabsCreate.push(details),
    },
    storage: {
      sync: {
        get(_keys, cb) {
          cb(options.syncStorage || {});
        },
      },
    },
  };

  const controller = whatsNewMod.initWhatsNew({
    document: doc,
    window: { navigator: { language: options.navLanguage || 'zh-TW' } },
    chrome,
    shared,
  });

  return { controller, byId, calls };
}

test("whats-new.html includes bilingual Chinese/English release notes and usage guides on one page", () => {
  const html = fs.readFileSync(path.join(__dirname, '../extension/whats-new.html'), 'utf8');
  assert.match(html, /id="section-zh"/);
  assert.match(html, /id="section-en"/);
  assert.match(html, /href="#section-zh"/);
  assert.match(html, /href="#section-en"/);
  assert.match(html, /4 步驟快速上手指引/);
  assert.match(html, /4-Step Quick Start Guide/);
  assert.doesNotMatch(html, /<script>[\s\S]*<\/script>/i);
});

test("whats-new.js supports bilingual view switching, preferred locale ordering, and options/wiki/feedback links", async () => {
  const h = createWhatsNewHarness({
    syncStorage: { uiLanguage: 'en' },
  });
  await h.controller.ready;

  assert.equal(h.byId.get('versionBadge').textContent, 'v2.2.0');
  assert.equal(h.byId.get('openWikiBtn').getAttribute('href'), shared.WIKI_GUIDE_URL);
  assert.equal(h.byId.get('openFeedbackBtn').getAttribute('href'), shared.FEEDBACK_URL);

  // English preferred puts English section first while keeping both visible by default.
  assert.equal(h.byId.get('langSections').children[0].id, 'section-en');
  assert.equal(h.byId.get('langSections').children[1].id, 'section-zh');
  assert.equal(h.byId.get('section-zh').hidden, false);
  assert.equal(h.byId.get('section-en').hidden, false);

  h.byId.get('viewZhBtn').dispatch('click');
  assert.equal(h.byId.get('section-zh').hidden, false);
  assert.equal(h.byId.get('section-en').hidden, true);

  h.byId.get('viewEnBtn').dispatch('click');
  assert.equal(h.byId.get('section-zh').hidden, true);
  assert.equal(h.byId.get('section-en').hidden, false);

  h.byId.get('viewBothBtn').dispatch('click');
  assert.equal(h.byId.get('section-zh').hidden, false);
  assert.equal(h.byId.get('section-en').hidden, false);

  h.byId.get('openOptionsBtn').dispatch('click');
  assert.equal(h.calls.openOptionsPage, 1);
});
