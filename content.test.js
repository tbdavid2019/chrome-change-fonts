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
      querySelectorAll() {
        return [];
      },
      fonts: new Set(),
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

test('advanced mode limits only the CJK font and applies the non-CJK font directly', () => {
  const sandbox = loadContentScript();
  sandbox.applyFontSettings({
    fontMode: 'advanced',
    advancedFontConfig: {
      cjkFont: '888Roundhand',
      cjkFontId: '888Roundhand-Regular',
      latinFont: 'JetBrains Mono',
      latinFontId: 'JetBrainsMono-Regular',
    },
  });

  const css = sandbox.buildCss(false);

  assert.match(css, /font-family: "FontChangerCjk"/);
  assert.match(css, /src: local\("888Roundhand"\), local\("888Roundhand-Regular"\)/);
  assert.match(css, /font-family: "FontChangerCjk", "JetBrains Mono", "888Roundhand", "888Roundhand-Regular", system-ui/);
  assert.doesNotMatch(css, /src: local\("JetBrains Mono"\)/);
  assert.doesNotMatch(css, /JetBrainsMono-Regular/);
  assert.match(css, /unicode-range: U\+3000-303F/);
  assert.match(css, /font-weight: 100 900/);
  assert.match(css, /font-style: normal/);
  assert.equal((css.match(/unicode-range:/g) || []).length, 1);
});

test('advanced mode keeps a direct CJK fallback after the non-CJK font', () => {
  const sandbox = loadContentScript();
  sandbox.applyFontSettings({
    fontMode: 'advanced',
    advancedFontConfig: {
      cjkFont: 'jf金萱那堤2.0',
      cjkFontId: 'jf金萱那堤2.0',
      latinFont: 'JetBrains Mono',
      latinFontId: 'JetBrainsMono-Regular',
    },
  });

  const css = sandbox.buildCss(false);

  assert.match(css, /font-family: "FontChangerCjk", "JetBrains Mono", "jf金萱那堤2\.0", system-ui/);
});

test('basic mode remains effective after advanced config exists', () => {
  const sandbox = loadContentScript();
  sandbox.applyFontSettings({
    font: 'Basic Sans',
    fontMode: 'basic',
    advancedFontConfig: {
      cjkFont: '888Roundhand',
      latinFont: 'JetBrains Mono',
    },
  });

  const css = sandbox.buildCss(false);

  assert.match(css, /font-family: "Basic Sans", system-ui/);
  assert.doesNotMatch(css, /FontChangerCjk/);
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

test('detects single-word material ligature icon text content', () => {
  const sandbox = loadContentScript();

  assert.equal(sandbox.isLikelyLigatureIconText('mic'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('search'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('home'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('settings'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('hello'), false);
  assert.equal(sandbox.isLikelyLigatureIconText('world'), false);
});

test('excludes dynamically scanned stylesheet selectors', () => {
  const sandbox = loadContentScript();
  
  // Mock document.styleSheets
  sandbox.document.styleSheets = [
    {
      cssRules: [
        {
          type: 5, // FONT_FACE_RULE
          style: {
            getPropertyValue(prop) {
              if (prop === 'font-family') return '"MyCustomIconFont"';
              return '';
            }
          }
        },
        {
          type: 1, // STYLE_RULE
          selectorText: '.my-custom-icon-class-name, div > .another-dynamic-icon',
          style: {
            fontFamily: 'MyCustomIconFont'
          }
        }
      ]
    }
  ];

  sandbox.applyFont('Test Sans');
  sandbox.scanStylesheets();

  const css = sandbox.buildCss(false);

  // Verifying both classes extracted from selectorText are added to the css exclusion list
  assert.match(css, /\.my-custom-icon-class-name/);
  assert.match(css, /\.another-dynamic-icon/);
});

test('detects Google Meet ligature icon names and ignores bidi / zero-width characters', () => {
  const sandbox = loadContentScript();

  // Standard Meet icon names
  assert.equal(sandbox.isLikelyLigatureIconText('mic'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('videocam'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('center_focus_weak'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('more_vert'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('call_end'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('chat'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('domain_disabled'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('mood'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('hand'), true);

  // Meet icon names wrapped with bidi isolates or zero-width spaces
  assert.equal(sandbox.isLikelyLigatureIconText('\u200Bmic\u200C'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('\u2068call_end\u2069'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('\u200Evideocam\u200F'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('\uFEFFcenter_focus_weak'), true);
});

test('buildCss includes explicit font-family for ligature icon attribute without invalid keywords', () => {
  const sandbox = loadContentScript();
  sandbox.applyFont('Test Sans');

  const css = sandbox.buildCss(false);

  assert.match(css, /\[data-font-changer-ligature-icon\]/);
  assert.match(css, /font-family: 'Google Symbols', 'Material Symbols Outlined', 'Google Material Icons', 'Material Icons' !important;/);
  // inherit / initial / unset must never appear in comma-separated font-family lists
  assert.doesNotMatch(css, /font-family:\s*[^;]*,\s*inherit/i);
  assert.doesNotMatch(css, /font-family:\s*[^;]*inherit\s*,/i);
});

test('updateLigatureIconMarker keeps exclusion on button if button has excluded child', () => {
  const sandbox = loadContentScript();
  const attributes = new Map();
  const button = {
    hasAttribute(name) {
      return attributes.has(name);
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    querySelector(sel) {
      if (sel.includes('data-font-changer-exclude')) {
        return {}; // Child icon still exists
      }
      return null;
    }
  };

  button.setAttribute('data-font-changer-exclude', '1');
  sandbox.updateLigatureIconMarker(button);

  // Button should retain exclusion attribute because it has an excluded child
  assert.equal(attributes.get('data-font-changer-exclude'), '1');
});

test('copyFontResourcesToPip copies font-face rules and font links to pipDoc', () => {
  const sandbox = loadContentScript();

  sandbox.document.styleSheets = [
    {
      cssRules: [
        {
          type: 5, // FONT_FACE_RULE
          cssText: '@font-face { font-family: "Google Symbols"; src: url("symbols.woff2"); }',
        }
      ]
    }
  ];

  const appendedElements = [];
  const pipHead = {
    appendChild(el) {
      appendedElements.push(el);
      return el;
    }
  };

  const pipDoc = {
    head: pipHead,
    querySelector(_sel) {
      return null;
    },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        rel: '',
        href: '',
      };
    }
  };

  sandbox.copyFontResourcesToPip(pipDoc);

  assert.equal(appendedElements.length, 1);
  assert.match(appendedElements[0].textContent, /Google Symbols/);
  assert.equal(appendedElements[0].className, 'font-changer-pip-font-faces');
});

test('isGoogleMeetSite accurately detects Meet domains', () => {
  const sandbox = loadContentScript();
  assert.equal(sandbox.isGoogleMeetSite(), false);

  sandbox.location.hostname = 'meet.google.com';
  assert.equal(sandbox.isGoogleMeetSite(), true);

  sandbox.location.hostname = 'subdomain.meet.google.com';
  assert.equal(sandbox.isGoogleMeetSite(), true);

  sandbox.location.hostname = 'google.com';
  assert.equal(sandbox.isGoogleMeetSite(), false);
});

test('buildCss on Google Meet excludes buttons from custom font replacement without breaking button text', () => {
  const sandbox = loadContentScript();
  sandbox.location.hostname = 'meet.google.com';
  sandbox.applyFont('Test Sans');

  const css = sandbox.buildCss(false);

  // Buttons are excluded in the font target suffix so they don't receive Test Sans
  assert.match(css, /:not\(button\):not\(button \*\)/);
  assert.match(css, /:not\(\[role="button"\]\):not\(\[role="button"\] \*\)/);
  // Buttons are NOT globally forced into Google Symbols
  assert.doesNotMatch(css, /button,\s*button \*\s*\{\s*font-family:\s*['"]Google Symbols/);
  // Icon selector keeps valid syntax
  assert.match(css, /font-family: 'Google Symbols', 'Material Symbols Outlined', 'Google Material Icons', 'Material Icons' !important;/);
});

test('detects additional Meet single-word icons', () => {
  const sandbox = loadContentScript();

  assert.equal(sandbox.isLikelyLigatureIconText('subtitles'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('caption'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('shapes'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('category'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('record'), true);
});

test('collectFontRules extracts @font-face from inline style elements', () => {
  const sandbox = loadContentScript();
  sandbox.document.styleSheets = [];

  sandbox.document.querySelectorAll = (sel) => {
    if (sel.includes('style')) {
      return [
        {
          className: '',
          textContent: '@font-face { font-family: "InlineSymbols"; src: url("symbols.woff2"); }',
        }
      ];
    }
    return [];
  };

  const fontCss = sandbox.collectFontRules();
  assert.match(fontCss, /@font-face/);
  assert.match(fontCss, /InlineSymbols/);
});

test('updateLigatureIconTextNode cleans up markers when icon text changes to regular text', () => {
  const sandbox = loadContentScript();
  const parentAttributes = new Map([
    ['data-font-changer-exclude', '1'],
    ['data-font-changer-ligature-icon', '1']
  ]);
  const buttonAttributes = new Map([
    ['data-font-changer-exclude', '1']
  ]);

  const button = {
    hasAttribute(name) { return buttonAttributes.has(name); },
    removeAttribute(name) { buttonAttributes.delete(name); },
    querySelector(_sel) { return null; }
  };

  const parent = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    hasAttribute(name) { return parentAttributes.has(name); },
    removeAttribute(name) { parentAttributes.delete(name); },
    querySelector(_sel) { return null; },
    closest(_sel) { return button; }
  };

  const textNode = {
    nodeType: sandbox.Node.TEXT_NODE,
    textContent: 'Regular meeting title',
    parentElement: parent,
    parentNode: parent
  };

  sandbox.updateLigatureIconTextNode(textNode);

  assert.equal(parentAttributes.has('data-font-changer-ligature-icon'), false);
  assert.equal(parentAttributes.has('data-font-changer-exclude'), false);
  assert.equal(buttonAttributes.has('data-font-changer-exclude'), false);
});

test('registerDocumentPictureInPicture does not copy fonts when font replacement is disabled', () => {
  const sandbox = loadContentScript();
  let copied = false;
  sandbox.copyFontResourcesToPip = () => {
    copied = true;
  };

  // Font is not enabled
  const pipWindow = {
    document: {
      head: { appendChild() {} },
      querySelector() { return null; },
      createElement() { return {}; }
    },
    addEventListener() {}
  };

  sandbox.registerDocumentPictureInPicture(pipWindow);
  assert.equal(copied, false);
});
