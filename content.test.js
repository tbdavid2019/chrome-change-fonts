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
      FILTER_ACCEPT: 1,
      FILTER_SKIP: 3,
    },
    Node: {
      ELEMENT_NODE: 1,
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
