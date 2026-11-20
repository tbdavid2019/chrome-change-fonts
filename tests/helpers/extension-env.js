'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT_DIR = path.resolve(__dirname, '../..');
const EXTENSION_DIR = path.join(ROOT_DIR, 'extension');

function readExtensionFile(relPath) {
  return fs.readFileSync(path.join(EXTENSION_DIR, relPath), 'utf8');
}

function getManifestContentScripts() {
  const manifest = JSON.parse(readExtensionFile('manifest.json'));
  return manifest.content_scripts[0].js.slice();
}

function createFakeDom(options = {}) {
  const href = options.href || 'https://example.com/page';
  const parsedUrl = new URL(href);
  const listenersByTarget = new WeakMap();

  function addListener(target, type, fn) {
    let map = listenersByTarget.get(target);
    if (!map) {
      map = new Map();
      listenersByTarget.set(target, map);
    }
    let set = map.get(type);
    if (!set) {
      set = new Set();
      map.set(type, set);
    }
    set.add(fn);
  }

  function removeListener(target, type, fn) {
    const map = listenersByTarget.get(target);
    const set = map && map.get(type);
    if (set) set.delete(fn);
  }

  function dispatchEvent(target, type, eventObj = {}) {
    const map = listenersByTarget.get(target);
    const set = map && map.get(type);
    if (!set) return;
    for (const fn of Array.from(set)) {
      fn.call(target, { type, target, ...eventObj });
    }
  }

  class FakeCSSStyleSheet {
    constructor() {
      this.cssText = '';
      this.disabled = false;
      this.cssRules = [];
    }
    replaceSync(css) {
      this.cssText = String(css || '');
    }
  }

  class FakeNode {
    constructor(nodeType, ownerDocument) {
      this.nodeType = nodeType;
      this.ownerDocument = ownerDocument;
      this.parentNode = null;
      this.childNodes = [];
    }
    get parentElement() {
      return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null;
    }
    get isConnected() {
      let cur = this;
      while (cur) {
        if (cur === this.ownerDocument) return true;
        if (cur.host && cur.ownerDocument === this.ownerDocument) {
          cur = cur.host;
          continue;
        }
        cur = cur.parentNode;
      }
      return false;
    }
    appendChild(child) {
      if (child.parentNode) {
        const idx = child.parentNode.childNodes.indexOf(child);
        if (idx !== -1) child.parentNode.childNodes.splice(idx, 1);
      }
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument;
      this.childNodes.push(child);
      return child;
    }
    removeChild(child) {
      const idx = this.childNodes.indexOf(child);
      if (idx !== -1) {
        this.childNodes.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    }
  }

  class FakeText extends FakeNode {
    constructor(value, ownerDocument) {
      super(3, ownerDocument);
      this.nodeValue = String(value || '');
    }
    get textContent() {
      return this.nodeValue;
    }
    set textContent(v) {
      this.nodeValue = String(v || '');
    }
  }

  function collectDescendants(root, predicate, out = []) {
    const children = root.childNodes || [];
    for (const child of children) {
      if (child.nodeType === 1) {
        if (!predicate || predicate(child)) out.push(child);
        collectDescendants(child, predicate, out);
      }
    }
    return out;
  }

  function matchesSimpleSelector(el, selector) {
    const s = selector.trim();
    if (s === '*') return true;
    const attrOnly = /^\[([^\]=]+)(?:="([^"]*)")?\]$/.exec(s);
    if (attrOnly) {
      if (!el.hasAttribute(attrOnly[1])) return false;
      return attrOnly[2] === undefined ? true : el.getAttribute(attrOnly[1]) === attrOnly[2];
    }
    if (s === 'style.font-changer-style') {
      return el.tagName === 'STYLE' && el.classList.contains('font-changer-style');
    }
    if (s === 'style[data-fc-style="1"]') {
      return el.tagName === 'STYLE' && el.getAttribute('data-fc-style') === '1';
    }
    if (s === 'link[rel~="stylesheet"]') {
      return el.tagName === 'LINK' && /\bstylesheet\b/.test(el.rel || '');
    }
    return el.tagName.toLowerCase() === s.toLowerCase();
  }

  class FakeElement extends FakeNode {
    constructor(tagName, ownerDocument) {
      super(1, ownerDocument);
      this.tagName = String(tagName || 'div').toUpperCase();
      this.attributes = new Map();
      this.rawStyle = { fontFamily: 'Arial, sans-serif' };
      this.pseudoStyles = {};
      this.shadowRoot = null;
      this.rel = '';
      this.href = '';
      this.crossOrigin = '';
    }
    get children() {
      return this.childNodes.filter((n) => n.nodeType === 1);
    }
    get textContent() {
      return this.childNodes.map((n) => n.textContent || '').join('');
    }
    set textContent(v) {
      this.childNodes = [];
      if (v !== '' && v !== null && v !== undefined) {
        this.appendChild(new FakeText(String(v), this.ownerDocument));
      }
    }
    get className() {
      return this.attributes.get('class') || '';
    }
    set className(val) {
      this.setAttribute('class', val);
    }
    get classList() {
      const self = this;
      return {
        contains(token) {
          return self.className.split(/\s+/).includes(token);
        },
        add(...tokens) {
          const set = new Set(self.className.split(/\s+/).filter(Boolean));
          tokens.forEach((t) => set.add(t));
          self.className = Array.from(set).join(' ');
        },
        remove(...tokens) {
          const set = new Set(self.className.split(/\s+/).filter(Boolean));
          tokens.forEach((t) => set.delete(t));
          self.className = Array.from(set).join(' ');
        },
      };
    }
    setAttribute(name, val) {
      this.attributes.set(String(name), String(val));
      if (name === 'rel') this.rel = String(val);
      if (name === 'href') this.href = String(val);
    }
    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    hasAttribute(name) {
      return this.attributes.has(name);
    }
    removeAttribute(name) {
      this.attributes.delete(name);
    }
    attachShadow() {
      this.shadowRoot = new FakeShadowRoot(this, this.ownerDocument);
      return this.shadowRoot;
    }
    closest(selector) {
      let cur = this;
      while (cur && cur.nodeType === 1) {
        if (matchesSimpleSelector(cur, selector)) return cur;
        cur = cur.parentElement;
      }
      return null;
    }
    querySelectorAll(selector) {
      return collectDescendants(this, (el) => matchesSimpleSelector(el, selector));
    }
    addEventListener(type, fn) {
      addListener(this, type, fn);
    }
    removeEventListener(type, fn) {
      removeListener(this, type, fn);
    }
    dispatchEvent(type, ev) {
      dispatchEvent(this, type, ev);
    }
  }

  class FakeShadowRoot extends FakeNode {
    constructor(host, ownerDocument) {
      super(11, ownerDocument);
      this.host = host;
      this.adoptedStyleSheets = [];
    }
    querySelectorAll(selector) {
      return collectDescendants(this, (el) => matchesSimpleSelector(el, selector));
    }
    createElement(tag) {
      return this.ownerDocument.createElement(tag);
    }
  }

  const fontFaceSetListeners = { loadingdone: new Set() };
  const activeObservers = new Set();
  let totalObserveCalls = 0;
  let totalDisconnectCalls = 0;

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.target = null;
      this.options = null;
      this.connected = false;
    }
    observe(target, opts) {
      this.target = target;
      this.options = opts;
      this.connected = true;
      totalObserveCalls += 1;
      activeObservers.add(this);
    }
    disconnect() {
      if (this.connected) {
        totalDisconnectCalls += 1;
      }
      this.connected = false;
      activeObservers.delete(this);
    }
    trigger(mutations) {
      if (this.connected) {
        this.callback(mutations, this);
      }
    }
  }

  class FakeDocument extends FakeNode {
    constructor(win) {
      super(9, null);
      this.ownerDocument = this;
      this.defaultView = win;
      this.readyState = options.readyState || 'complete';
      this.referrer = options.referrer || '';
      this.adoptedStyleSheets = [];
      this.styleSheets = [];
      this.fontFaces = options.fontFaces || [];
      this.fonts = {
        forEach(cb) {
          for (const f of docFontListRef()) cb(f);
        },
        addEventListener(type, fn) {
          if (type === 'loadingdone') fontFaceSetListeners.loadingdone.add(fn);
        },
        removeEventListener(type, fn) {
          if (type === 'loadingdone') fontFaceSetListeners.loadingdone.delete(fn);
        },
      };
      this.documentElement = new FakeElement('html', this);
      this.head = new FakeElement('head', this);
      this.body = new FakeElement('body', this);
      this.appendChild(this.documentElement);
      this.documentElement.appendChild(this.head);
      this.documentElement.appendChild(this.body);

      const docFontListRef = () => this.fontFaces;
    }
    createElement(tag) {
      if (String(tag).toLowerCase() === 'canvas') {
        const measureTextFn = options.measureText || ((font, text) => ({
          width: text.replace(/\u200C/g, '').length * 10,
        }));
        return {
          tagName: 'CANVAS',
          getContext(kind) {
            if (kind !== '2d') return null;
            const ctx = {
              font: '10px sans-serif',
              measureText(str) {
                return measureTextFn(ctx.font, String(str || ''));
              },
            };
            return ctx;
          },
        };
      }
      return new FakeElement(tag, this);
    }
    createTextNode(val) {
      return new FakeText(val, this);
    }
    querySelectorAll(selector) {
      return collectDescendants(this.documentElement, (el) => matchesSimpleSelector(el, selector));
    }
    addEventListener(type, fn) {
      addListener(this, type, fn);
    }
    removeEventListener(type, fn) {
      removeListener(this, type, fn);
    }
    dispatchEvent(type, ev) {
      dispatchEvent(this, type, ev);
    }
    triggerLoadingDone() {
      for (const fn of Array.from(fontFaceSetListeners.loadingdone)) {
        fn({ type: 'loadingdone' });
      }
    }
  }

  function hasActiveSheetOverride(doc) {
    if (!doc || !Array.isArray(doc.adoptedStyleSheets)) return false;
    return doc.adoptedStyleSheets.some((sheet) => sheet && !sheet.disabled && sheet.cssText.includes('font-family:'));
  }

  function getComputedStyleFn(el, pseudo) {
    const ownerDoc = el.ownerDocument;
    const overridden = hasActiveSheetOverride(ownerDoc) &&
      !el.hasAttribute('data-fc-icon-font') &&
      !el.hasAttribute('data-fc-pending') &&
      !el.closest('svg');

    if (pseudo) {
      const pStyle = (el.pseudoStyles && el.pseudoStyles[pseudo]) || { content: 'none', fontFamily: el.rawStyle.fontFamily };
      const pinAttr = pseudo === '::before' ? 'data-fc-icon-before' : 'data-fc-icon-after';
      const font = el.hasAttribute(pinAttr) || !overridden
        ? (pStyle.fontFamily || el.rawStyle.fontFamily)
        : 'FontChangerOverride, sans-serif';
      return {
        content: pStyle.content || 'none',
        fontFamily: font,
      };
    }

    return {
      fontFamily: overridden ? 'FontChangerOverride, sans-serif' : (el.rawStyle.fontFamily || 'Arial, sans-serif'),
    };
  }

  const localStorageStore = new Map(Object.entries(options.localStorage || {}));
  const pipListeners = new Set();

  const win = {
    location: {
      href: parsedUrl.href,
      origin: parsedUrl.origin,
      host: parsedUrl.host,
      hostname: parsedUrl.hostname,
      protocol: parsedUrl.protocol,
      pathname: parsedUrl.pathname,
      ancestorOrigins: options.ancestorOrigins || [],
    },
    localStorage: {
      getItem(k) {
        return localStorageStore.has(k) ? localStorageStore.get(k) : null;
      },
      setItem(k, v) {
        localStorageStore.set(String(k), String(v));
      },
      removeItem(k) {
        localStorageStore.delete(String(k));
      },
    },
    CSSStyleSheet: options.disableCSSStyleSheet ? undefined : FakeCSSStyleSheet,
    MutationObserver: FakeMutationObserver,
    getComputedStyle: getComputedStyleFn,
    addEventListener(type, fn) {
      addListener(win, type, fn);
    },
    removeEventListener(type, fn) {
      removeListener(win, type, fn);
    },
    dispatchEvent(type, ev) {
      dispatchEvent(win, type, ev);
    },
    documentPictureInPicture: {
      addEventListener(type, fn) {
        if (type === 'enter') pipListeners.add(fn);
      },
      removeEventListener(type, fn) {
        if (type === 'enter') pipListeners.delete(fn);
      },
      triggerEnter(pipWin) {
        for (const fn of Array.from(pipListeners)) {
          fn({ window: pipWin });
        }
      },
    },
  };

  if (options.isTopFrame === false) {
    win.top = options.topWindow || {
      get location() {
        throw new Error('SecurityError');
      },
    };
  } else {
    win.top = win;
  }

  const doc = new FakeDocument(win);
  win.document = doc;

  function createPipWindow() {
    const pipWin = {
      CSSStyleSheet: FakeCSSStyleSheet,
      MutationObserver: FakeMutationObserver,
      getComputedStyle: getComputedStyleFn,
      addEventListener(type, fn) {
        addListener(pipWin, type, fn);
      },
      removeEventListener(type, fn) {
        removeListener(pipWin, type, fn);
      },
      dispatchHide() {
        dispatchEvent(pipWin, 'pagehide', {});
      },
    };
    const pipDoc = new FakeDocument(pipWin);
    pipWin.document = pipDoc;
    return pipWin;
  }

  return {
    window: win,
    document: doc,
    localStorageStore,
    FakeCSSStyleSheet,
    getObserverStats() {
      return {
        activeCount: activeObservers.size,
        activeObservers: Array.from(activeObservers),
        totalObserveCalls,
        totalDisconnectCalls,
      };
    },
    createPipWindow,
    pipListenerCount() {
      return pipListeners.size;
    },
  };
}

function createFakeChrome(options = {}) {
  const syncStore = Object.assign({}, options.syncStorage || {});
  const onChangedListeners = new Set();
  const onMessageListeners = new Set();
  let lastError = null;

  const chrome = {
    extension: {
      inIncognitoContext: Boolean(options.incognito),
    },
    runtime: {
      id: options.runtimeId !== undefined ? options.runtimeId : 'test-extension-id',
      get lastError() {
        return lastError;
      },
      onMessage: {
        addListener(fn) {
          onMessageListeners.add(fn);
        },
        removeListener(fn) {
          onMessageListeners.delete(fn);
        },
      },
    },
    storage: {
      sync: {
        get(keys, cb) {
          const out = {};
          const list = Array.isArray(keys) ? keys : Object.keys(keys || {});
          for (const k of list) {
            if (Object.prototype.hasOwnProperty.call(syncStore, k)) {
              out[k] = syncStore[k];
            }
          }
          if (cb) {
            if (options.deferSyncGet) {
              setImmediate(() => cb(out));
            } else {
              cb(out);
            }
          }
          return Promise.resolve(out);
        },
        set(items, cb) {
          if (options.nextSetError) {
            lastError = { message: options.nextSetError };
            if (cb) cb();
            lastError = null;
            return;
          }
          lastError = null;
          const changes = {};
          for (const [k, v] of Object.entries(items)) {
            changes[k] = { oldValue: syncStore[k], newValue: v };
            syncStore[k] = v;
          }
          if (cb) cb();
          for (const fn of Array.from(onChangedListeners)) {
            fn(changes, 'sync');
          }
        },
        remove(keys, cb) {
          lastError = null;
          const arr = Array.isArray(keys) ? keys : [keys];
          const changes = {};
          for (const k of arr) {
            if (Object.prototype.hasOwnProperty.call(syncStore, k)) {
              changes[k] = { oldValue: syncStore[k], newValue: undefined };
              delete syncStore[k];
            }
          }
          if (cb) cb();
          if (Object.keys(changes).length) {
            for (const fn of Array.from(onChangedListeners)) {
              fn(changes, 'sync');
            }
          }
        },
      },
      onChanged: {
        addListener(fn) {
          onChangedListeners.add(fn);
        },
        removeListener(fn) {
          onChangedListeners.delete(fn);
        },
      },
    },
    __syncStore: syncStore,
    __getListenerCounts() {
      return {
        onChanged: onChangedListeners.size,
        onMessage: onMessageListeners.size,
      };
    },
    __triggerMessage(req, sender = {}) {
      let sent = undefined;
      let lastReturn = undefined;
      for (const fn of Array.from(onMessageListeners)) {
        lastReturn = fn(req, sender, (res) => {
          sent = res;
        });
      }
      return { response: sent, returnValue: lastReturn };
    },
    __triggerStorageChange(changes, area = 'sync') {
      for (const fn of Array.from(onChangedListeners)) {
        fn(changes, area);
      }
    },
  };

  return chrome;
}

function loadContentEnvironment(options = {}) {
  const dom = createFakeDom(options);
  const chrome = createFakeChrome(options);

  class FakeFontFace {
    constructor(family, source, descriptors = {}) {
      this.family = family;
      this.source = source;
      this.status = descriptors.status || 'loaded';
      this.unicodeRange = descriptors.unicodeRange || 'U+0-10FFFF';
      this.loadCalls = 0;
    }
    load() {
      this.loadCalls += 1;
      if (options.fontFaceProbeFn) {
        return Promise.resolve().then(() => options.fontFaceProbeFn(this));
      }
      this.status = 'loaded';
      return Promise.resolve(this);
    }
  }

  const sandbox = {
    window: dom.window,
    document: dom.document,
    chrome,
    CSSStyleSheet: dom.window.CSSStyleSheet,
    MutationObserver: dom.window.MutationObserver,
    getComputedStyle: dom.window.getComputedStyle,
    FontFace: options.FontFace || FakeFontFace,
    URL,
    WeakRef,
    WeakMap,
    WeakSet,
    Set,
    Map,
    Promise,
    setTimeout,
    clearTimeout,
    Date,
    console,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;

  const context = vm.createContext(sandbox);
  const scripts = getManifestContentScripts();

  function evalScripts() {
    for (const rel of scripts) {
      vm.runInContext(readExtensionFile(rel), context, { filename: rel });
    }
  }

  evalScripts();

  return {
    sandbox,
    dom,
    window: dom.window,
    chrome,
    evalScripts,
    controller: () => vm.runInContext('globalThis[Symbol.for("fontChanger333.controller")]', context),
  };
}

module.exports = {
  ROOT_DIR,
  EXTENSION_DIR,
  readExtensionFile,
  getManifestContentScripts,
  createFakeDom,
  createFakeChrome,
  loadContentEnvironment,
};
