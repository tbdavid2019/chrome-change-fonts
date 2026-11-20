'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const shared = require('../extension/shared.js');
const { loadContentEnvironment } = require('./helpers/extension-env.js');

test('Dormant state when disabled registers zero MutationObservers and cleans up active markers on transition', () => {
  const env = loadContentEnvironment({
    syncStorage: {
      selectedFont: 'Noto Sans TC',
      isEnabled: false,
    },
  });

  assert.equal(env.controller().getState().active, false);
  assert.equal(env.dom.getObserverStats().totalObserveCalls, 0);
  assert.equal(env.dom.document.adoptedStyleSheets.length, 0);

  // Enable dynamically -> becomes Active with 1 document observer and 1 adopted sheet.
  env.chrome.storage.sync.set({ isEnabled: true });
  assert.equal(env.controller().getState().active, true);
  assert.equal(env.dom.getObserverStats().activeCount, 1);
  assert.equal(env.dom.document.adoptedStyleSheets.length, 1);

  // Disable dynamically -> transitions back to Dormant, disconnecting observers & stripping sheets.
  env.chrome.storage.sync.set({ isEnabled: false });
  assert.equal(env.controller().getState().active, false);
  assert.equal(env.dom.getObserverStats().activeCount, 0);
  assert.equal(env.dom.document.adoptedStyleSheets.length, 0);
});

test('Re-injecting scripts 3 times leaves exactly 1 active listener set, 1 observer, and zero SyntaxErrors', () => {
  const env = loadContentEnvironment({
    syncStorage: {
      selectedFont: 'Noto Sans TC',
      isEnabled: true,
    },
  });

  env.evalScripts();
  env.evalScripts();
  env.evalScripts();

  const counts = env.chrome.__getListenerCounts();
  assert.equal(counts.onChanged, 1);
  assert.equal(counts.onMessage, 1);
  assert.equal(env.dom.getObserverStats().activeCount, 1);
  assert.equal(env.dom.document.adoptedStyleSheets.length, 1);
  assert.equal(env.dom.pipListenerCount(), 1);
});

test('Context invalidation self-tears down listeners and observers cleanly', () => {
  const env = loadContentEnvironment({
    syncStorage: {
      selectedFont: 'Noto Sans TC',
      isEnabled: true,
    },
  });

  assert.equal(env.dom.getObserverStats().activeCount, 1);
  env.chrome.runtime.id = undefined;

  // Next callback detects invalidated context and tears down without throwing.
  env.chrome.__triggerStorageChange({ isEnabled: { newValue: false } }, 'sync');
  assert.equal(env.dom.getObserverStats().activeCount, 0);
  assert.equal(env.chrome.__getListenerCounts().onChanged, 0);
  assert.equal(env.chrome.__getListenerCounts().onMessage, 0);
});

test('onMessage handler responds synchronously and always returns undefined', () => {
  const env = loadContentEnvironment({
    syncStorage: { selectedFont: 'Arial', isEnabled: true },
  });

  const res = env.chrome.__triggerMessage({ action: shared.MSG_ACTIONS.GET_PAGE_STATE });
  assert.equal(res.returnValue, undefined);
  assert.equal(res.response.hasFontChanger, true);
  assert.equal(res.response.ownHost, 'example.com');
  assert.equal(res.response.isActive, true);
});

test('Boot cleans legacy v1.8.8 DOM attributes and style.font-changer-style nodes', () => {
  const env = loadContentEnvironment({
    syncStorage: { selectedFont: 'Arial', isEnabled: false },
  });
  const doc = env.dom.document;
  const legacyStyle = doc.createElement('style');
  legacyStyle.classList.add('font-changer-style');
  doc.head.appendChild(legacyStyle);

  const p = doc.createElement('p');
  p.setAttribute('data-font-changer-exclude', 'true');
  p.setAttribute('data-font-changer-ligature-icon', 'true');
  p.setAttribute('data-font-changer-google-logo', 'true');
  doc.body.appendChild(p);

  env.evalScripts();

  assert.equal(doc.querySelectorAll('style.font-changer-style').length, 0);
  for (const attr of shared.LEGACY_DOM_ATTRS) {
    assert.equal(p.hasAttribute(attr), false);
  }
});

test('uiLanguage changes and identical state signatures do not trigger redundant style rebuilds', () => {
  const env = loadContentEnvironment({
    syncStorage: { selectedFont: 'Arial', isEnabled: true },
  });
  const sheet = env.dom.document.adoptedStyleSheets[0];
  let replaceCount = 0;
  const origReplace = sheet.replaceSync.bind(sheet);
  sheet.replaceSync = (css) => {
    replaceCount += 1;
    origReplace(css);
  };

  env.chrome.__triggerStorageChange({ uiLanguage: { oldValue: 'en', newValue: 'zh-Hant' } }, 'sync');
  assert.equal(replaceCount, 0);

  env.chrome.__triggerStorageChange({ selectedFont: { oldValue: 'Arial', newValue: 'Arial' } }, 'sync');
  assert.equal(replaceCount, 0);
});

test('Three-Signal icon pipeline preserves PUA, Material/Fluent icons, and ::before pseudo icons while letting auto_machine and u_uuuu_uuuu keep user font', () => {
  const env = loadContentEnvironment({
    syncStorage: { selectedFont: 'PingFang TC', isEnabled: true },
    measureText(font, text) {
      if (font.includes('Material Symbols') || font.includes('Google Sans')) {
        if (text === 'tv' || text === 'mic' || text === 'google_logo play') {
          return { width: 24 };
        }
        if (text.includes('\u200C')) {
          return { width: 40 };
        }
      }
      // Normal fonts ("Inter", "JetBrains Mono", etc.) keep ZWNJ ratio ~1.0.
      return { width: text.replace(/\u200C/g, '').length * 10 };
    },
  });

  const doc = env.dom.document;

  const puaIcon = doc.createElement('i');
  puaIcon.rawStyle.fontFamily = '"FabricMDL2Icons", sans-serif';
  puaIcon.textContent = '\uE715';

  const mixedButton = doc.createElement('button');
  mixedButton.rawStyle.fontFamily = 'Inter, sans-serif';
  mixedButton.pseudoStyles['::before'] = {
    content: '"\uE715"',
    fontFamily: '"FluentSystemIcons", sans-serif',
  };
  mixedButton.textContent = 'Inbox';

  const materialLigature = doc.createElement('span');
  materialLigature.rawStyle.fontFamily = '"Material Symbols Outlined", sans-serif';
  materialLigature.textContent = 'tv';

  const brandLigature = doc.createElement('span');
  brandLigature.rawStyle.fontFamily = '"Google Sans", sans-serif';
  brandLigature.textContent = 'google_logo Play';

  const autoMachine = doc.createElement('code');
  autoMachine.rawStyle.fontFamily = '"JetBrains Mono", monospace';
  autoMachine.textContent = 'auto_machine';

  const uuuu = doc.createElement('span');
  uuuu.rawStyle.fontFamily = 'Inter, sans-serif';
  uuuu.textContent = 'u_uuuu_uuuu';

  const bbsSep = doc.createElement('span');
  bbsSep.rawStyle.fontFamily = '"CustomDisp", sans-serif';
  bbsSep.textContent = '--';

  [puaIcon, mixedButton, materialLigature, brandLigature, autoMachine, uuuu, bbsSep].forEach((el) => {
    doc.body.appendChild(el);
  });

  // Trigger a fresh full scan via font change (or direct classify).
  env.chrome.storage.sync.set({ selectedFont: 'Noto Sans TC' });

  // No DOM probe attributes were ever leaked.
  assert.equal(doc.querySelectorAll('[data-fc-probe]').length, 0);

  // PUA host icon pinned.
  assert.ok(puaIcon.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT));

  // Mixed button pins ONLY ::before pseudo element, leaving host button text styled cleanly.
  assert.equal(mixedButton.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT), false);
  assert.ok(mixedButton.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_BEFORE));
  assert.match(env.controller().buildCss(false), /data-fc-icon-before="\d+"\]::before\s*\{\s*font-family:\s*"FluentSystemIcons",\s*sans-serif !important;/);

  // Signal 2 + ASCII ligature adds ligature text-transform: none protection.
  assert.ok(materialLigature.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT));
  assert.equal(materialLigature.getAttribute(shared.ACTIVE_DOM_ATTRS.ICON_LIGATURE), '1');

  // Signal 3 catches google_logo Play on Google Sans.
  assert.ok(brandLigature.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT));
  assert.equal(brandLigature.getAttribute(shared.ACTIVE_DOM_ATTRS.ICON_LIGATURE), '1');

  // Normal underscore words and separators are NOT misclassified as icons.
  assert.equal(autoMachine.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT), false);
  assert.equal(uuuu.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT), false);
  assert.equal(bbsSep.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT), false);
});

test('Pending WebFont triggers face.load() + data-fc-pending and releases cleanly on loadingdone', async () => {
  const delayedFace = {
    family: '"Material Icons"',
    status: 'unloaded',
    unicodeRange: 'U+0-10FFFF',
    loadCalls: 0,
    load() {
      this.loadCalls += 1;
      return Promise.resolve(this);
    },
  };

  const env = loadContentEnvironment({
    syncStorage: { selectedFont: 'Arial', isEnabled: true },
    fontFaces: [delayedFace],
  });

  const iconEl = env.dom.document.createElement('span');
  iconEl.rawStyle.fontFamily = '"Material Icons", sans-serif';
  iconEl.textContent = 'home';
  env.dom.document.body.appendChild(iconEl);

  env.controller().classifyElement(iconEl, env.dom.document, true);
  assert.equal(delayedFace.loadCalls, 1);
  assert.equal(iconEl.getAttribute(shared.ACTIVE_DOM_ATTRS.PENDING), '1');

  // When loading finishes, loadingdone re-evaluates and replaces PENDING with ICON_FONT + LIGATURE.
  delayedFace.status = 'loaded';
  env.dom.document.triggerLoadingDone();

  assert.equal(iconEl.hasAttribute(shared.ACTIVE_DOM_ATTRS.PENDING), false);
  assert.ok(iconEl.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT));
  assert.equal(iconEl.getAttribute(shared.ACTIVE_DOM_ATTRS.ICON_LIGATURE), '1');
});

test('Top-frame lazy legacy migration writes sync key and deletes localStorage only when no lastError occurs', () => {
  const blockedEnv = loadContentEnvironment({
    href: 'https://mail.example.com/inbox',
    syncStorage: { selectedFont: 'Arial', isEnabled: true },
    localStorage: { fontChangerDisabled: '1' },
    nextSetError: 'MAX_WRITE_OPERATIONS_PER_MINUTE exceeded',
  });
  // Write failed due to rate limit -> stays protected via migratingDisabledHost AND keeps legacy key.
  assert.equal(blockedEnv.controller().getState().active, false);
  assert.equal(blockedEnv.dom.localStorageStore.get('fontChangerDisabled'), '1');

  const okEnv = loadContentEnvironment({
    href: 'https://mail.example.com/inbox',
    syncStorage: { selectedFont: 'Arial', isEnabled: true },
    localStorage: { fontChangerDisabled: '1' },
  });
  assert.equal(okEnv.controller().getState().active, false);
  assert.equal(okEnv.chrome.__syncStore['siteDisabled:mail.example.com'], 1);
  assert.equal(okEnv.dom.localStorageStore.has('fontChangerDisabled'), false);
});

test('Incognito context performs zero storage writes and toggles tab override across frames via SET_TAB_SITE_DISABLED', () => {
  const env = loadContentEnvironment({
    href: 'https://example.org/app',
    incognito: true,
    syncStorage: {
      selectedFont: 'Arial',
      isEnabled: true,
    },
    localStorage: { fontChangerDisabled: '1' },
  });

  // Does NOT migrate legacy localStorage in incognito!
  assert.equal(env.chrome.__syncStore['siteDisabled:example.org'], undefined);
  assert.equal(env.dom.localStorageStore.get('fontChangerDisabled'), '1');
  assert.equal(env.controller().getState().active, true);

  // Toggle tab-scoped memory override via runtime message.
  const disableRes = env.chrome.__triggerMessage({
    action: shared.MSG_ACTIONS.SET_TAB_SITE_DISABLED,
    isDisabled: true,
  });
  assert.equal(disableRes.returnValue, undefined);
  assert.equal(disableRes.response.isSiteDisabled, true);
  assert.equal(env.controller().getState().active, false);
  assert.equal(env.chrome.__syncStore['siteDisabled:example.org'], undefined);

  // Override can also be turned off cleanly.
  env.chrome.__triggerMessage({
    action: shared.MSG_ACTIONS.SET_TAB_SITE_DISABLED,
    isDisabled: false,
  });
  assert.equal(env.controller().getState().active, true);
});

test('Cross-origin multi-hop iframe honors union disable from either own host or any ancestorOrigin', () => {
  const ancestorDisabled = loadContentEnvironment({
    href: 'https://widget.thirdparty.com/embed',
    isTopFrame: false,
    ancestorOrigins: ['https://player.mid.com', 'https://excluded-parent.com:8443'],
    syncStorage: {
      selectedFont: 'Arial',
      isEnabled: true,
      'siteDisabled:excluded-parent.com:8443': 1,
    },
  });
  assert.equal(ancestorDisabled.controller().getState().isSiteDisabled, true);
  assert.equal(ancestorDisabled.controller().getState().active, false);

  // Unblocking parent re-activates child frame via onChanged.
  ancestorDisabled.chrome.storage.sync.remove('siteDisabled:excluded-parent.com:8443');
  assert.equal(ancestorDisabled.controller().getState().active, true);
});

test('ShadowRoot pruning and Document PiP cleanup disconnect observers and copy @font-face rules safely', () => {
  const env = loadContentEnvironment({
    syncStorage: { selectedFont: 'Arial', isEnabled: true },
  });
  const doc = env.dom.document;

  // Host + open ShadowRoot inside main doc.
  const host = doc.createElement('div');
  const sr = host.attachShadow();
  doc.body.appendChild(host);
  env.chrome.storage.sync.set({ selectedFont: 'Helvetica' });
  assert.equal(env.controller().getState().trackedShadowCount, 1);

  // Detach host -> pruning disconnects its ShadowRoot observer.
  doc.body.removeChild(host);
  env.chrome.storage.sync.set({ selectedFont: 'Georgia' });
  assert.equal(env.controller().getState().trackedShadowCount, 0);

  // Document PiP copies @font-face rules recursively (e.g. inside @media) & cleans up on pagehide.
  doc.styleSheets.push({
    cssRules: [
      {
        type: 4, // CSSMediaRule
        cssRules: [{ type: 5, cssText: '@font-face { font-family: "MeetIcon"; src: url(x.woff2); }' }],
      },
    ],
  });
  const pipWin = env.dom.createPipWindow();
  env.window.documentPictureInPicture.triggerEnter(pipWin);

  assert.equal(env.controller().getState().trackedPipCount, 1);
  assert.ok(pipWin.document.adoptedStyleSheets.length >= 2);
  assert.ok(pipWin.document.adoptedStyleSheets.some((s) => s.cssText.includes('MeetIcon')));

  pipWin.dispatchHide();
  assert.equal(env.controller().getState().trackedPipCount, 0);
  assert.equal(pipWin.document.adoptedStyleSheets.length, 0);
});

test('Unicode PUA sanity check across all valid code points matches BMP + Planes 15/16 only', () => {
  let count = 0;
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    const isBmpPua = cp >= 0xe000 && cp <= 0xf8ff;
    const isPlane15 = cp >= 0xf0000 && cp <= 0xffffd;
    const isPlane16 = cp >= 0x100000 && cp <= 0x10fffd;
    const expected = isBmpPua || isPlane15 || isPlane16;
    const ch = String.fromCodePoint(cp);
    const actual = shared.PUA_REGEX.test(ch);
    if (actual !== expected) {
      assert.fail(`PUA mismatch at U+${cp.toString(16)}: expected=${expected}, actual=${actual}`);
    }
    if (actual) count += 1;
  }
  assert.equal(count, 6400 + 65534 + 65534);
});
