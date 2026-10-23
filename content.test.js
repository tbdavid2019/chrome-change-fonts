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

test('isGooglePlaySite accurately detects Google Play domains', () => {
  const sandbox = loadContentScript();
  assert.equal(sandbox.isGooglePlaySite(), false);

  sandbox.location.hostname = 'play.google.com';
  assert.equal(sandbox.isGooglePlaySite(), true);

  sandbox.location.hostname = 'subdomain.play.google.com';
  assert.equal(sandbox.isGooglePlaySite(), true);

  sandbox.location.hostname = 'google.com';
  assert.equal(sandbox.isGooglePlaySite(), false);
});

test('detects Google Play ligature icons including devices and family_home', () => {
  const sandbox = loadContentScript();

  assert.equal(sandbox.isLikelyLigatureIconText('devices'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('family_home'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('expand_more'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('arrow_forward'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('search'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('help_outline'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('play_apps'), true);
});

test('buildCss on Google Play prioritizes Google Material Icons and prevents uppercase transforms', () => {
  const sandbox = loadContentScript();
  sandbox.location.hostname = 'play.google.com';
  sandbox.applyFont('Test Sans');

  const css = sandbox.buildCss(false);

  // Excludes Google Play icon classes in font target
  assert.match(css, /\.google-material-icons/);
  assert.match(css, /\[class\*="google-material"\]/);
  assert.match(css, /\.material-icons-extended/);

  // Play Store ligature icon stack prioritizes Google Material Icons
  assert.match(css, /\[data-font-changer-ligature-icon\]\s*\{\s*font-family:\s*'Google Material Icons',\s*'Material Icons Extended'/);

  // Enforces text-transform: none !important so button uppercase rules do not break ligatures
  assert.match(css, /text-transform:\s*none\s*!important/);

  // Protects google_logo ligature with Google Sans
  assert.match(css, /\[data-font-changer-google-logo\]/);
  assert.match(css, /font-family:\s*'Google Sans',\s*'Product Sans'/);
});

test('detects google_logo Play and marks element for Google Sans preservation', () => {
  const sandbox = loadContentScript();
  sandbox.location.hostname = 'play.google.com';
  const spanAttributes = new Map();
  const anchorAttributes = new Map();

  const anchor = {
    setAttribute(name, value) {
      anchorAttributes.set(name, value);
    },
    removeAttribute(name) {
      anchorAttributes.delete(name);
    }
  };

  const span = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    childElementCount: 0,
    setAttribute(name, value) {
      spanAttributes.set(name, value);
    },
    removeAttribute(name) {
      spanAttributes.delete(name);
    },
    hasAttribute(name) {
      return spanAttributes.has(name);
    },
    closest(selector) {
      if (selector === 'a') return anchor;
      return null;
    }
  };

  const textNode = {
    nodeType: sandbox.Node.TEXT_NODE,
    textContent: 'google_logo Play',
    parentElement: span,
    parentNode: span
  };

  sandbox.updateLigatureIconTextNode(textNode);

  assert.equal(spanAttributes.get('data-font-changer-google-logo'), '1');
  assert.equal(spanAttributes.get('data-font-changer-exclude'), '1');
  assert.equal(anchorAttributes.get('data-font-changer-google-logo'), '1');
  assert.equal(anchorAttributes.get('data-font-changer-exclude'), '1');

  // When text changes away from google_logo
  textNode.textContent = 'Regular Title';
  sandbox.updateLigatureIconTextNode(textNode);

  assert.equal(spanAttributes.has('data-font-changer-google-logo'), false);
  assert.equal(anchorAttributes.has('data-font-changer-google-logo'), false);

  // Does NOT mark on non-Google Play site
  sandbox.location.hostname = 'example.com';
  textNode.textContent = 'google_logo Play';
  sandbox.updateLigatureIconTextNode(textNode);
  assert.equal(spanAttributes.has('data-font-changer-google-logo'), false);
});

test('does not mark regular buttons like Payment or Update as ligature icons', () => {
  const sandbox = loadContentScript();
  const buttonAttributes = new Map();
  const button = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    tagName: 'BUTTON',
    className: 'btn btn-primary',
    childElementCount: 0,
    childNodes: [{ nodeType: sandbox.Node.TEXT_NODE, textContent: 'Payment' }],
    setAttribute(name, value) {
      buttonAttributes.set(name, value);
    },
    hasAttribute(name) {
      return buttonAttributes.has(name);
    },
    removeAttribute(name) {
      buttonAttributes.delete(name);
    }
  };

  sandbox.updateLigatureIconMarker(button);
  assert.equal(buttonAttributes.has('data-font-changer-ligature-icon'), false);
  assert.equal(buttonAttributes.has('data-font-changer-exclude'), false);

  // Also test Update button
  button.childNodes[0].textContent = 'Update';
  sandbox.updateLigatureIconMarker(button);
  assert.equal(buttonAttributes.has('data-font-changer-ligature-icon'), false);
  assert.equal(buttonAttributes.has('data-font-changer-exclude'), false);

  // But an actual icon element with icon class or tag DOES get marked
  const iconSpanAttributes = new Map();
  const iconSpan = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    tagName: 'I',
    className: 'google-material-icons',
    childElementCount: 0,
    childNodes: [{ nodeType: sandbox.Node.TEXT_NODE, textContent: 'devices' }],
    setAttribute(name, value) {
      iconSpanAttributes.set(name, value);
    },
    hasAttribute(name) {
      return iconSpanAttributes.has(name);
    },
    removeAttribute(name) {
      iconSpanAttributes.delete(name);
    },
    closest() {
      return null;
    }
  };

  sandbox.updateLigatureIconMarker(iconSpan);
  assert.equal(iconSpanAttributes.get('data-font-changer-ligature-icon'), '1');
  assert.equal(iconSpanAttributes.get('data-font-changer-exclude'), '1');
});

test('updateLigatureIconMarker does not mark container or body elements when descendant contains google_logo', () => {
  const sandbox = loadContentScript();
  const bodyAttributes = new Map();
  const body = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    tagName: 'BODY',
    childElementCount: 2,
    textContent: 'google_logo Play and other content',
    setAttribute(name, value) {
      bodyAttributes.set(name, value);
    },
    hasAttribute(name) {
      return bodyAttributes.has(name);
    },
    removeAttribute(name) {
      bodyAttributes.delete(name);
    }
  };

  sandbox.updateLigatureIconMarker(body);

  assert.equal(bodyAttributes.has('data-font-changer-google-logo'), false);
  assert.equal(bodyAttributes.has('data-font-changer-exclude'), false);
});

test('preserves classless single-word ligature icon styled with inline font-family', () => {
  const sandbox = loadContentScript();
  const spanAttributes = new Map();
  const span = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    tagName: 'SPAN',
    className: '',
    childElementCount: 0,
    childNodes: [{ nodeType: sandbox.Node.TEXT_NODE, textContent: 'search' }],
    getAttribute(name) {
      if (name === 'style') return "font-family: 'Material Icons'";
      return null;
    },
    setAttribute(name, value) {
      spanAttributes.set(name, value);
    },
    hasAttribute(name) {
      return spanAttributes.has(name);
    },
    removeAttribute(name) {
      spanAttributes.delete(name);
    },
    closest() {
      return null;
    }
  };

  sandbox.updateLigatureIconMarker(span);
  assert.equal(spanAttributes.get('data-font-changer-ligature-icon'), '1');
  assert.equal(spanAttributes.get('data-font-changer-exclude'), '1');
});

test('handleRemovedNodes clears logo markers on anchor when logo node is removed', () => {
  const sandbox = loadContentScript();
  const anchorAttributes = new Map([
    ['data-font-changer-google-logo', '1'],
    ['data-font-changer-exclude', '1']
  ]);
  const anchor = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    tagName: 'A',
    textContent: 'Categories',
    hasAttribute(name) {
      return anchorAttributes.has(name);
    },
    removeAttribute(name) {
      anchorAttributes.delete(name);
    },
    querySelector() {
      return null;
    }
  };

  sandbox.handleRemovedNodes({
    target: anchor,
    removedNodes: [{ nodeType: sandbox.Node.ELEMENT_NODE }]
  });

  assert.equal(anchorAttributes.has('data-font-changer-google-logo'), false);
  assert.equal(anchorAttributes.has('data-font-changer-exclude'), false);
});

test('handleRemovedNodes clears logo markers on marked ancestor when child wrapper removes logo node', () => {
  const sandbox = loadContentScript();
  const anchorAttributes = new Map([
    ['data-font-changer-google-logo', '1'],
    ['data-font-changer-exclude', '1']
  ]);
  const anchor = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    tagName: 'A',
    textContent: 'Categories',
    hasAttribute(name) {
      return anchorAttributes.has(name);
    },
    removeAttribute(name) {
      anchorAttributes.delete(name);
    },
    querySelector() {
      return null;
    }
  };
  const innerWrapper = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    tagName: 'DIV',
    hasAttribute() { return false; },
    closest(selector) {
      if (selector.includes('data-font-changer-google-logo')) return anchor;
      return null;
    }
  };

  sandbox.handleRemovedNodes({
    target: innerWrapper,
    removedNodes: [{ nodeType: sandbox.Node.ELEMENT_NODE }]
  });

  assert.equal(anchorAttributes.has('data-font-changer-google-logo'), false);
  assert.equal(anchorAttributes.has('data-font-changer-exclude'), false);
});

test('isGoogleSite accurately detects Google and YouTube domains', () => {
  const sandbox = loadContentScript();
  assert.equal(sandbox.isGoogleSite(), false);

  sandbox.location.hostname = 'google.com';
  assert.equal(sandbox.isGoogleSite(), true);

  sandbox.location.hostname = 'www.google.com';
  assert.equal(sandbox.isGoogleSite(), true);

  sandbox.location.hostname = 'google.com.tw';
  assert.equal(sandbox.isGoogleSite(), true);

  sandbox.location.hostname = 'mail.google.com';
  assert.equal(sandbox.isGoogleSite(), true);

  sandbox.location.hostname = 'youtube.com';
  assert.equal(sandbox.isGoogleSite(), true);

  sandbox.location.hostname = 'www.youtube.com';
  assert.equal(sandbox.isGoogleSite(), true);

  sandbox.location.hostname = 'example.com';
  assert.equal(sandbox.isGoogleSite(), false);
});

test('buildCss excludes Google Search z1asCe, notranslate, translate="no", and SVG elements', () => {
  const sandbox = loadContentScript();
  sandbox.applyFont('Test Sans');

  const css = sandbox.buildCss(false);

  assert.match(css, /\.z1asCe/);
  assert.match(css, /\[class\*="z1asCe"\]/);
  assert.match(css, /\[class\*="notranslate"\]/);
  assert.match(css, /\[translate="no"\]/);
  assert.match(css, /:not\(svg\)/);
  assert.match(css, /:not\(svg \*\)/);
  assert.match(css, /:not\(g-icon\)/);
  assert.match(css, /:not\(yt-icon\)/);
});

test('detects single-word Google Workspace icons', () => {
  const sandbox = loadContentScript();

  assert.equal(sandbox.isLikelyLigatureIconText('history'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('inbox'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('archive'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('undo'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('redo'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('event'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('today'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('dashboard'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('description'), true);
  assert.equal(sandbox.isLikelyLigatureIconText('palette'), true);
});

test('detects Unicode Private Use Area (PUA) icon characters', () => {
  const sandbox = loadContentScript();

  // Material Icons & FontAwesome PUA codepoints (U+E000 to U+F8FF)
  assert.equal(sandbox.isLikelyLigatureIconText('\uE8B6'), true); // search in Material Icons
  assert.equal(sandbox.isLikelyLigatureIconText('\uF007'), true); // user in FontAwesome
  assert.equal(sandbox.isLikelyLigatureIconText('\uE88A'), true); // home
});

test('isIconContext recognizes obfuscated Google icon classes and SVG elements', () => {
  const sandbox = loadContentScript();

  // SVG AnimatedString class name support
  const svgEl = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    tagName: 'svg',
    className: { baseVal: 'gb_d' },
  };
  assert.equal(sandbox.isIconContext(svgEl), true);

  // Google Search icon class z1asCe
  const z1asCeEl = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    tagName: 'SPAN',
    className: 'z1asCe MZy1Rb',
  };
  assert.equal(sandbox.isIconContext(z1asCeEl), true);

  // Google Material 3 VfPpkd class
  const m3El = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    tagName: 'SPAN',
    className: 'VfPpkd-k8QpJ',
  };
  assert.equal(sandbox.isIconContext(m3El), true);

  // Element with jsname on Google
  sandbox.location.hostname = 'google.com';
  const jsnameEl = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    tagName: 'SPAN',
    className: '',
    hasAttribute(attr) { return attr === 'jsname'; },
    getAttribute(attr) { return attr === 'jsname' ? 'V67aGc' : null; }
  };
  assert.equal(sandbox.isIconContext(jsnameEl), true);
});

test('shouldExcludeInteractiveAncestor preserves button font when button contains text label', () => {
  const sandbox = loadContentScript();

  // Button with text label "搜尋" and icon "search"
  const buttonWithText = {
    textContent: 'search 搜尋',
  };
  const iconSpan = {
    textContent: 'search',
  };
  assert.equal(sandbox.shouldExcludeInteractiveAncestor(buttonWithText, iconSpan), false);

  // Button with only icon
  const iconOnlyButton = {
    textContent: 'search',
  };
  assert.equal(sandbox.shouldExcludeInteractiveAncestor(iconOnlyButton, iconSpan), true);

  // Mock button without textContent
  const mockButton = {};
  assert.equal(sandbox.shouldExcludeInteractiveAncestor(mockButton, iconSpan), true);
});

test('scanStylesheets detects icon font classes inside nested @media rules', () => {
  const sandbox = loadContentScript();

  sandbox.document.styleSheets = [
    {
      cssRules: [
        {
          type: 4, // CSSMediaRule (@media)
          cssRules: [
            {
              type: 5, // FONT_FACE_RULE
              style: {
                getPropertyValue(prop) {
                  return prop === 'font-family' ? 'CustomOcticons' : '';
                }
              }
            },
            {
              type: 1, // STYLE_RULE
              selectorText: '.octicon-repo',
              style: {
                fontFamily: 'CustomOcticons'
              }
            }
          ]
        }
      ]
    }
  ];

  sandbox.scanStylesheets(sandbox.document);

  const css = sandbox.buildCss(false);
  assert.match(css, /\.octicon-repo/);
});

test('standard UI text labels on Google sites retain font replacement and are not mistaken for icons', () => {
  const sandbox = loadContentScript();
  sandbox.location.hostname = 'mail.google.com';

  // Standard navigation item label "Inbox" or "History" on Google without icon attributes
  const navLabelEl = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    tagName: 'SPAN',
    className: 'nav-item-title',
    childElementCount: 0,
    childNodes: [{ nodeType: sandbox.Node.TEXT_NODE, textContent: 'Inbox' }],
    hasAttribute() { return false; },
    getAttribute() { return null; }
  };

  assert.equal(sandbox.isIconContext(navLabelEl), false);
  assert.equal(sandbox.isLikelyLigatureIconText('Inbox', navLabelEl), false);

  // But an actual icon element with notranslate or aria-hidden or VfPpkd DOES get recognized
  const iconEl = {
    nodeType: sandbox.Node.ELEMENT_NODE,
    tagName: 'SPAN',
    className: 'notranslate',
    childElementCount: 0,
    childNodes: [{ nodeType: sandbox.Node.TEXT_NODE, textContent: 'inbox' }],
    hasAttribute(attr) { return attr === 'aria-hidden'; },
    getAttribute(attr) { return attr === 'aria-hidden' ? 'true' : null; }
  };

  assert.equal(sandbox.isIconContext(iconEl), true);
  assert.equal(sandbox.isLikelyLigatureIconText('inbox', iconEl), true);
});

test('isGoogleSite strictly enforces domain boundaries against spoofed domains', () => {
  const sandbox = loadContentScript();

  sandbox.location.hostname = 'google.com.example.com';
  assert.equal(sandbox.isGoogleSite(), false);

  sandbox.location.hostname = 'evilgoogle.com';
  assert.equal(sandbox.isGoogleSite(), false);

  sandbox.location.hostname = 'youtube.com.attacker.com';
  assert.equal(sandbox.isGoogleSite(), false);

  sandbox.location.hostname = 'mail.google.com';
  assert.equal(sandbox.isGoogleSite(), true);

  sandbox.location.hostname = 'google.co.jp';
  assert.equal(sandbox.isGoogleSite(), true);
});

test('advanced mode generates PostScript and Full Font Name candidates for CJK local() matching', () => {
  const sandbox = loadContentScript();
  sandbox.applyFontSettings({
    fontMode: 'advanced',
    advancedFontConfig: {
      cjkFont: '777jf金萱',
      cjkFontId: '777jf金萱',
      latinFont: '777monolisa Regular 繁中',
      latinFontId: '777monolisa Regular',
    },
  });

  const css = sandbox.buildCss(false);
  assert.match(css, /local\("777jf金萱"\)/);
  assert.match(css, /local\("777jf-Medium"\)/);
  assert.match(css, /local\("777jf金萱 半糖"\)/);
  assert.match(css, /U\+FF00-FFEF/);
});

test('content.js can be re-injected into the same context without SyntaxError and responds to changeFont via sendResponse', () => {
  const code = fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8');
  let registeredListener = null;
  const sandbox = loadContentScript();
  sandbox.chrome.runtime.onMessage.addListener = (fn) => {
    registeredListener = fn;
  };

  // Re-evaluate content.js in the same VM context (simulating chrome.scripting.executeScript re-injection)
  assert.doesNotThrow(() => {
    vm.runInContext(code, sandbox);
  });

  assert.equal(typeof registeredListener, 'function');
  let callbackResponse = null;
  registeredListener(
    {
      action: 'changeFont',
      isEnabled: true,
      fontMode: 'advanced',
      advancedFontConfig: {
        cjkFont: '777jf金萱',
        cjkFontId: '777jf金萱',
        latinFont: '777monolisa Regular 繁中',
        latinFontId: '777monolisa Regular',
      },
    },
    {},
    (res) => {
      callbackResponse = res;
    }
  );
  assert.equal(Boolean(callbackResponse && callbackResponse.ok), true);
});

