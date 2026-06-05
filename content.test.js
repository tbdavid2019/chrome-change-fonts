const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadContentScript() {
  const code = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');

  class FakeMutationObserver {
    observe() {}
  }

  class FakeElement {}
  class FakeShadowRoot {}

  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    MutationObserver: FakeMutationObserver,
    NodeFilter: {
      SHOW_ELEMENT: 1,
      SHOW_TEXT: 4,
      FILTER_ACCEPT: 1,
      FILTER_SKIP: 3,
    },
    Node: {
      ELEMENT_NODE: 1,
      TEXT_NODE: 3,
    },
    Element: FakeElement,
    ShadowRoot: FakeShadowRoot,
    document: {
      head: { appendChild() {} },
      documentElement: {},
      createElement() {
        return {
          className: '',
          textContent: '',
          isConnected: true,
        };
      },
      createTreeWalker() {
        return {
          nextNode() {
            return null;
          },
        };
      },
    },
    localStorage: {
      store: new Map(),
      getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
      },
      setItem(key, value) {
        this.store.set(key, String(value));
      },
      removeItem(key) {
        this.store.delete(key);
      },
    },
    location: {
      href: 'https://example.com/path',
      origin: 'https://example.com',
      host: 'example.com',
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener() {},
        },
      },
      storage: {
        sync: {
          get(_keys, callback) {
            callback({});
          },
        },
        onChanged: {
          addListener() {},
        },
      },
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

test('buildCss covers nested page elements directly', () => {
  const sandbox = loadContentScript();
  sandbox.applyFont('Test Sans');

  const css = sandbox.buildCss(false);

  assert.match(css, /body \*/);
  assert.match(css, /font-family: "Test Sans", system-ui/);
  assert.doesNotMatch(css, /body > \*/);
});

test('buildCss excludes Google Maps Google Symbols icons', () => {
  const sandbox = loadContentScript();
  sandbox.applyFont('Test Sans');

  const css = sandbox.buildCss(false);

  assert.match(css, /\.google-symbols/);
  assert.match(css, /\[class\*="google-symbols"\]/);
});

test('buildCss excludes generic icon font classes used by Telegram Web', () => {
  const sandbox = loadContentScript();
  sandbox.applyFont('Test Sans');

  const css = sandbox.buildCss(false);

  assert.match(css, /\.icon/);
  assert.match(css, /\[class~="icon"\]/);
});

test('buildCss excludes broader icon naming patterns used by sites like 104', () => {
  const sandbox = loadContentScript();
  sandbox.applyFont('Test Sans');

  const css = sandbox.buildCss(false);

  assert.match(css, /\.iconfont/);
  assert.match(css, /\.arrow-icon/);
  assert.match(css, /\.devsite-nav-toggle/);
  assert.match(css, /\[class\*="icon-"\]/);
  assert.match(css, /\[class\*="-icon"\]/);
  assert.match(css, /\[class\*="icon_"\]/);
  assert.match(css, /\[class\*="_icon"\]/);
});

test('buildCss excludes elements marked as ligature icons', () => {
  const sandbox = loadContentScript();
  sandbox.applyFont('Test Sans');

  const css = sandbox.buildCss(false);

  assert.match(css, /\[data-font-changer-exclude\]/);
  assert.match(css, /\[data-font-changer-exclude\] \*/);
});

test('buildCss does not globally exclude descendants of icon containers', () => {
  const sandbox = loadContentScript();
  sandbox.applyFont('Test Sans');

  const css = sandbox.buildCss(false);

  assert.doesNotMatch(css, /\.icon \*/);
  assert.doesNotMatch(css, /\.material-icons \*/);
  assert.doesNotMatch(css, /\[class\*="material-symbols"\] \*/);
});

test('detects material ligature icon text content', () => {
  const sandbox = loadContentScript();

  assert.equal(sandbox.isLikelyLigatureIconText('arrow_drop_down'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('expand_more'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('Documentation'), false);
  assert.equal(sandbox.isLikelyLigatureIconText('search docs'), false);
});

test('marks nearest interactive ancestor for ligature icon text', () => {
  const sandbox = loadContentScript();
  const attributes = new Map();
  const buttonAttributes = new Map();
  const button = {
    setAttribute(name, value) {
      buttonAttributes.set(name, value);
    },
  };
  const element = {
    childElementCount: 0,
    childNodes: [{ nodeType: sandbox.Node.TEXT_NODE, textContent: 'arrow_drop_down' }],
    closest(selector) {
      assert.match(selector, /button/);
      return button;
    },
    hasAttribute(name) {
      return attributes.has(name);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
  };

  sandbox.updateLigatureIconMarker(element);

  assert.equal(attributes.get('data-font-changer-exclude'), '1');
  assert.equal(buttonAttributes.get('data-font-changer-exclude'), '1');
});

test('marks nearest interactive ancestor from nested ligature text node', () => {
  const sandbox = loadContentScript();
  const spanAttributes = new Map();
  const buttonAttributes = new Map();
  const button = {
    setAttribute(name, value) {
      buttonAttributes.set(name, value);
    },
  };
  const span = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    closest(selector) {
      assert.match(selector, /button/);
      return button;
    },
    setAttribute(name, value) {
      spanAttributes.set(name, value);
    },
  };
  const textNode = {
    nodeType: sandbox.Node.TEXT_NODE,
    parentElement: span,
    textContent: 'arrow_drop_down',
  };

  sandbox.updateLigatureIconTextNode(textNode);

  assert.equal(spanAttributes.get('data-font-changer-exclude'), '1');
  assert.equal(buttonAttributes.get('data-font-changer-exclude'), '1');
});

test('scanForLigatureIcons handles ligature text node roots', () => {
  const sandbox = loadContentScript();
  const spanAttributes = new Map();
  const buttonAttributes = new Map();
  const button = {
    setAttribute(name, value) {
      buttonAttributes.set(name, value);
    },
  };
  const span = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    closest() {
      return button;
    },
    setAttribute(name, value) {
      spanAttributes.set(name, value);
    },
  };
  const textNode = {
    nodeType: sandbox.Node.TEXT_NODE,
    parentElement: span,
    textContent: 'arrow_drop_down',
  };

  sandbox.scanForLigatureIcons(textNode);

  assert.equal(spanAttributes.get('data-font-changer-exclude'), '1');
  assert.equal(buttonAttributes.get('data-font-changer-exclude'), '1');
});

test('buildCss covers nested shadow root elements directly', () => {
  const sandbox = loadContentScript();
  sandbox.applyFont('Shadow Sans');

  const css = sandbox.buildCss(true);

  assert.match(css, /:host \*/);
  assert.match(css, /:host input/);
  assert.match(css, /font-family: "Shadow Sans", system-ui/);
});

test('site-level disable overrides enabled font replacement', () => {
  const sandbox = loadContentScript();

  sandbox.applyFont('Test Sans');
  assert.equal(sandbox.shouldApplyCustomFont(), true);

  sandbox.setSiteDisabled(true);
  assert.equal(sandbox.isSiteDisabled(), true);
  assert.equal(sandbox.shouldApplyCustomFont(), false);

  sandbox.setSiteDisabled(false);
  assert.equal(sandbox.isSiteDisabled(), false);
  assert.equal(sandbox.shouldApplyCustomFont(), true);
});
