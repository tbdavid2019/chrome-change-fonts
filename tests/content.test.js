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

test('High-frequency style and large-container class mutations bound traversal and avoid unnecessary sheet.disabled toggles', async () => {
  const env = loadContentEnvironment({
    syncStorage: { selectedFont: 'PingFang TC', isEnabled: true },
  });
  const doc = env.dom.document;
  const container = doc.createElement('div');
  let childReads = 0;
  for (let i = 0; i < 400; i++) {
    const p = doc.createElement('p');
    p.textContent = 'This is a long ordinary paragraph item number ' + i + ' with well over sixty-four characters in total length.';
    Object.defineProperty(p, 'children', {
      get() {
        childReads += 1;
        return [];
      },
    });
    container.appendChild(p);
  }
  doc.body.appendChild(container);

  const sheet = doc.adoptedStyleSheets[0];
  let disabledWrites = 0;
  let disabledVal = sheet.disabled;
  Object.defineProperty(sheet, 'disabled', {
    get() { return disabledVal; },
    set(v) {
      disabledWrites += 1;
      disabledVal = Boolean(v);
    },
  });

  const obs = env.dom.getObserverStats().activeObservers[0];
  obs.trigger([
    { type: 'attributes', attributeName: 'style', oldValue: 'transform: translateX(0px)', target: doc.body },
    { type: 'attributes', attributeName: 'style', oldValue: 'transform: translateX(0px)', target: container },
    { type: 'attributes', attributeName: 'class', target: doc.body },
    { type: 'attributes', attributeName: 'class', target: container },
  ]);

  await new Promise((r) => setTimeout(r, 90));
  assert.ok(childReads <= 85, `Expected bounded traversal <= 85 child reads, got ${childReads}`);
  assert.equal(disabledWrites, 0);

  // Even after deferred container rescan settles, pure non-icon prose avoids sheet.disabled toggles.
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(disabledWrites, 0);
});

test('hasPendingWebFont skips unrelated unicode-range slices and repeat loadingdone avoids redundant full scans', async () => {
  const cyrillicSlice = {
    family: '"Noto Sans TC"',
    status: 'unloaded',
    unicodeRange: 'U+0400-04FF',
    loadCalls: 0,
    load() {
      this.loadCalls += 1;
      return Promise.resolve(this);
    },
  };
  const latinSlice = {
    family: '"Noto Sans TC"',
    status: 'loaded',
    unicodeRange: 'U+0000-00FF',
    loadCalls: 0,
    load() { return Promise.resolve(this); },
  };

  const env = loadContentEnvironment({
    syncStorage: { selectedFont: 'PingFang TC', isEnabled: true },
    fontFaces: [cyrillicSlice, latinSlice],
  });
  const doc = env.dom.document;
  const btn = doc.createElement('button');
  btn.rawStyle.fontFamily = '"Noto Sans TC", sans-serif';
  btn.textContent = 'OK';
  doc.body.appendChild(btn);

  env.controller().classifyElement(btn, doc, true);
  assert.equal(cyrillicSlice.loadCalls, 0);
  assert.equal(btn.hasAttribute(shared.ACTIVE_DOM_ATTRS.PENDING), false);

  // First loadingdone for a FontFace schedules one debounced rescan; repeated events for the same FontFace skip rescanning.
  let bodyQsaCalls = 0;
  const origBodyQsa = doc.body.querySelectorAll.bind(doc.body);
  doc.body.querySelectorAll = (sel) => {
    bodyQsaCalls += 1;
    return origBodyQsa(sel);
  };

  doc.triggerLoadingDone({ fontfaces: [latinSlice] });
  await new Promise((r) => setTimeout(r, 160));
  assert.equal(bodyQsaCalls, 1);

  doc.triggerLoadingDone({ fontfaces: [latinSlice] });
  doc.triggerLoadingDone({ fontfaces: [latinSlice] });
  await new Promise((r) => setTimeout(r, 160));
  assert.equal(bodyQsaCalls, 1);
});

test('Re-classifying an unchanged icon performs zero redundant setAttribute/removeAttribute mutations', () => {
  const env = loadContentEnvironment({
    syncStorage: { selectedFont: 'Arial', isEnabled: true },
  });
  const doc = env.dom.document;
  const icon = doc.createElement('i');
  icon.rawStyle.fontFamily = '"TestIcons", sans-serif';
  icon.textContent = '\uE715';
  doc.body.appendChild(icon);

  env.controller().classifyElement(icon, doc, true);
  assert.ok(icon.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT));

  let attrMutations = 0;
  const origSet = icon.setAttribute.bind(icon);
  const origRem = icon.removeAttribute.bind(icon);
  icon.setAttribute = (k, v) => { attrMutations += 1; return origSet(k, v); };
  icon.removeAttribute = (k) => { attrMutations += 1; return origRem(k); };

  env.controller().classifyElement(icon, doc, true);
  assert.equal(attrMutations, 0);
});

test('Long >40-char ligatures, Wingdings runs, and input button values are protected as icons', () => {
  const env = loadContentEnvironment({
    syncStorage: { selectedFont: 'PingFang TC', isEnabled: true },
    measureText(font, text) {
      if (font.includes('Material Symbols') && text === 'signal_cellular_connected_no_internet_4_bar') {
        return { width: 24 };
      }
      if (font.includes('Material Symbols') && text.includes('\u200C')) {
        return { width: 400 };
      }
      return { width: text.replace(/\u200C/g, '').length * 10 };
    },
  });
  const doc = env.dom.document;

  const longLig = doc.createElement('span');
  longLig.rawStyle.fontFamily = '"Material Symbols Outlined", sans-serif';
  longLig.textContent = 'signal_cellular_connected_no_internet_4_bar';

  const wingdings = doc.createElement('span');
  wingdings.rawStyle.fontFamily = '"Wingdings", sans-serif';
  wingdings.textContent = 'abcdefghijklmnopqrstuvwxyz abcdefghijklmnopqrstuvwxyz abcdefghijklmnopqrstuvwxyz';

  const inputBtn = doc.createElement('input');
  inputBtn.setAttribute('type', 'button');
  inputBtn.setAttribute('value', 'home');
  inputBtn.rawStyle.fontFamily = '"Material Icons", sans-serif';

  [longLig, wingdings, inputBtn].forEach((el) => doc.body.appendChild(el));
  env.chrome.storage.sync.set({ selectedFont: 'Noto Sans TC' });

  assert.ok(longLig.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT));
  assert.equal(longLig.getAttribute(shared.ACTIVE_DOM_ATTRS.ICON_LIGATURE), '1');
  assert.ok(wingdings.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT));
  assert.ok(inputBtn.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT));
  assert.equal(inputBtn.getAttribute(shared.ACTIVE_DOM_ATTRS.ICON_LIGATURE), '1');
});

test('Ancestor font-affecting style and large-container/body class toggles reclassify descendant icons', async () => {
  const env = loadContentEnvironment({
    syncStorage: { selectedFont: 'PingFang TC', isEnabled: true },
  });
  const doc = env.dom.document;
  const wrapper = doc.createElement('div');
  const childIcon = doc.createElement('span');
  childIcon.rawStyle.fontFamily = 'Arial, sans-serif';
  childIcon.textContent = 'home';
  wrapper.appendChild(childIcon);
  for (let i = 0; i < 90; i++) {
    const p = doc.createElement('p');
    p.textContent = 'Normal paragraph line ' + i + ' exceeding sixty-four characters to simulate prose content.';
    wrapper.appendChild(p);
  }
  doc.body.appendChild(wrapper);

  const obs = env.dom.getObserverStats().activeObservers[0];

  // Font-affecting inline style on large container triggers deferred descendant rescan.
  wrapper.setAttribute('style', 'font-family: "Material Icons"');
  childIcon.rawStyle.fontFamily = '"Material Icons", sans-serif';
  obs.trigger([{ type: 'attributes', attributeName: 'style', oldValue: '', target: wrapper }]);
  await new Promise((r) => setTimeout(r, 420));
  assert.ok(childIcon.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT));

  // Body class toggle clears stale icon pinning when descendant reverts to ordinary text font.
  childIcon.rawStyle.fontFamily = 'Arial, sans-serif';
  obs.trigger([{ type: 'attributes', attributeName: 'class', target: doc.body }]);
  await new Promise((r) => setTimeout(r, 420));
  assert.equal(childIcon.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT), false);
});

test('Second face of same family after timeout triggers rescan and PiP pending elements check own document fonts', async () => {
  const faceA = { family: '"BrandLig"', status: 'loaded', unicodeRange: 'U+0030-0039', loadCalls: 0, load() { return Promise.resolve(this); } };
  const faceB = { family: '"BrandLig"', status: 'unloaded', unicodeRange: 'U+0061-007A', loadCalls: 0, load() { this.loadCalls += 1; return Promise.resolve(this); } };

  const env = loadContentEnvironment({
    syncStorage: { selectedFont: 'Arial', isEnabled: true },
    fontFaces: [faceA, faceB],
    measureText(font, text) {
      if (font.includes('BrandLig') && faceB.status === 'loaded') {
        if (text === 'badge') return { width: 20 };
        if (text.includes('\u200C')) return { width: 50 };
      }
      return { width: text.replace(/\u200C/g, '').length * 10 };
    },
  });
  const doc = env.dom.document;
  doc.triggerLoadingDone({ fontfaces: [faceA] });

  const ligEl = doc.createElement('span');
  ligEl.rawStyle.fontFamily = '"BrandLig", sans-serif';
  ligEl.textContent = 'badge';
  doc.body.appendChild(ligEl);

  env.controller().classifyElement(ligEl, doc, true);
  assert.equal(ligEl.getAttribute(shared.ACTIVE_DOM_ATTRS.PENDING), '1');

  // Wait past 500ms pending timeout before faceB finishes loading.
  await new Promise((r) => setTimeout(r, 540));
  assert.equal(ligEl.hasAttribute(shared.ACTIVE_DOM_ATTRS.PENDING), false);
  assert.equal(ligEl.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT), false);

  // Now faceB finishes loading -> per-face dedup allows rescan and protects ligEl.
  faceB.status = 'loaded';
  doc.triggerLoadingDone({ fontfaces: [faceB] });
  await new Promise((r) => setTimeout(r, 160));
  assert.ok(ligEl.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT));

  // PiP pending element must be evaluated against pipDoc.fonts, not main document.fonts.
  const pipWin = env.dom.createPipWindow();
  const pipFace = { family: '"PipIcons"', status: 'unloaded', unicodeRange: 'U+0-10FFFF', loadCalls: 0, load() { this.loadCalls += 1; return Promise.resolve(this); } };
  pipWin.document.fontFaces.push(pipFace);
  const pipIcon = pipWin.document.createElement('span');
  pipIcon.rawStyle.fontFamily = '"PipIcons", sans-serif';
  pipIcon.textContent = 'home';
  pipWin.document.body.appendChild(pipIcon);
  env.window.documentPictureInPicture.triggerEnter(pipWin);

  assert.equal(pipIcon.getAttribute(shared.ACTIVE_DOM_ATTRS.PENDING), '1');
  // Unrelated main document loadingdone must NOT strip PiP pending state while pipFace is still unloaded.
  doc.triggerLoadingDone({ fontfaces: [faceA] });
  assert.equal(pipIcon.getAttribute(shared.ACTIVE_DOM_ATTRS.PENDING), '1');
});

test('Per-site custom font rule overrides global font, respects exclusion priority, and syncs OFF badge on top frame', () => {
  const env = loadContentEnvironment({
    href: 'https://github.com/tbdavid2019',
    syncStorage: {
      isEnabled: true,
      selectedFont: 'Arial',
      'siteFont:github.com': {
        fontMode: 'advanced',
        selectedFont: '',
        advancedFontConfig: {
          cjkFont: 'PingFang TC',
          cjkFontId: 'PingFang TC',
          latinFont: 'JetBrains Mono',
          latinFontId: 'JetBrains Mono',
        },
      },
    },
  });

  assert.equal(env.controller().getState().active, true);
  assert.equal(env.controller().getState().fontMode, 'advanced');
  assert.match(env.controller().buildCss(false), /JetBrains Mono/);
  assert.match(env.controller().buildCss(false), /PingFang TC/);

  // Initial top-frame boot reports isSiteDisabled: false.
  const badgeMsgs = () => env.chrome.__getSentRuntimeMessages().filter((m) => m.action === shared.MSG_ACTIONS.SYNC_TAB_BADGE);
  assert.equal(badgeMsgs().at(-1).isSiteDisabled, false);

  // Excluding the site overrides the custom site font and emits isSiteDisabled: true for the OFF badge.
  env.chrome.storage.sync.set({ 'siteDisabled:github.com': 1 });
  assert.equal(env.controller().getState().active, false);
  assert.equal(badgeMsgs().at(-1).isSiteDisabled, true);

  // Removing site exclusion restores custom site font and clears OFF badge; removing site font falls back to global Arial.
  env.chrome.storage.sync.remove('siteDisabled:github.com');
  assert.equal(env.controller().getState().active, true);
  assert.equal(badgeMsgs().at(-1).isSiteDisabled, false);

  env.chrome.storage.sync.remove('siteFont:github.com');
  assert.equal(env.controller().getState().fontMode, 'basic');
  assert.equal(env.controller().getState().selectedFont, 'Arial');
  assert.match(env.controller().buildCss(false), /"Arial"/);
});

test('Incognito SET_TAB_SITE_FONT applies per-tab custom font without writing sync storage and non-top frames skip badge sync', () => {
  const incEnv = loadContentEnvironment({
    href: 'https://docs.example.com/guide',
    incognito: true,
    syncStorage: { isEnabled: true, selectedFont: 'Arial' },
  });

  const res = incEnv.chrome.__triggerMessage({
    action: shared.MSG_ACTIONS.SET_TAB_SITE_FONT,
    rule: { fontMode: 'basic', selectedFont: 'Georgia' },
  });
  assert.equal(res.returnValue, undefined);
  assert.equal(incEnv.controller().getState().selectedFont, 'Georgia');
  assert.equal(incEnv.chrome.__syncStore['siteFont:docs.example.com'], undefined);

  incEnv.chrome.__triggerMessage({
    action: shared.MSG_ACTIONS.SET_TAB_SITE_FONT,
    rule: null,
    clearToInherit: true,
  });
  assert.equal(incEnv.controller().getState().selectedFont, 'Arial');

  // Sub-frame must NOT emit SYNC_TAB_BADGE.
  const subEnv = loadContentEnvironment({
    href: 'https://embed.example.com/frame',
    isTopFrame: false,
    ancestorOrigins: ['https://parent.example.com'],
    syncStorage: { isEnabled: true, selectedFont: 'Arial', 'siteDisabled:parent.example.com': 1 },
  });
  assert.equal(
    subEnv.chrome.__getSentRuntimeMessages().filter((m) => m.action === shared.MSG_ACTIONS.SYNC_TAB_BADGE).length,
    0
  );
});

test('Incognito Use global suppresses synced site rule, preserves iframe host precedence, and restores badge on bfcache pageshow', async () => {
  // 1. Top frame in incognito with an existing synced site font rule: clearing to global must override the synced rule.
  const incTop = loadContentEnvironment({
    href: 'https://github.com/repo',
    incognito: true,
    syncStorage: {
      isEnabled: true,
      selectedFont: 'Arial',
      'siteFont:github.com': { fontMode: 'basic', selectedFont: 'Georgia' },
    },
  });
  assert.equal(incTop.controller().getState().selectedFont, 'Georgia');

  incTop.chrome.__triggerMessage({
    action: shared.MSG_ACTIONS.SET_TAB_SITE_FONT,
    host: 'github.com',
    rule: null,
    clearToInherit: false,
  });
  assert.equal(incTop.controller().getState().selectedFont, 'Arial');
  assert.equal(incTop.chrome.__syncStore['siteFont:github.com'].selectedFont, 'Georgia');

  // 2. Child iframe with its own saved siteFont keeps precedence over top frame's incognito override.
  const incChild = loadContentEnvironment({
    href: 'https://widget.example.org/embed',
    isTopFrame: false,
    ancestorOrigins: ['https://github.com'],
    incognito: true,
    syncStorage: {
      isEnabled: true,
      selectedFont: 'Arial',
      'siteFont:widget.example.org': { fontMode: 'basic', selectedFont: 'Verdana' },
    },
  });
  incChild.chrome.__triggerMessage({
    action: shared.MSG_ACTIONS.SET_TAB_SITE_FONT,
    host: 'github.com',
    rule: { fontMode: 'basic', selectedFont: 'Courier New' },
  });
  assert.equal(incChild.controller().getState().selectedFont, 'Verdana');

  // 3. Inline "all: unset" triggers deferred descendant rescan; persisted pageshow re-syncs OFF badge.
  const excludedEnv = loadContentEnvironment({
    href: 'https://excluded.example.com/',
    syncStorage: { isEnabled: true, selectedFont: 'Arial', 'siteDisabled:excluded.example.com': 1 },
  });
  const initialBadges = excludedEnv.chrome.__getSentRuntimeMessages().filter((m) => m.action === shared.MSG_ACTIONS.SYNC_TAB_BADGE);
  assert.equal(initialBadges.length, 1);
  excludedEnv.window.dispatchEvent('pageshow', { persisted: true });
  const afterBfcache = excludedEnv.chrome.__getSentRuntimeMessages().filter((m) => m.action === shared.MSG_ACTIONS.SYNC_TAB_BADGE);
  assert.equal(afterBfcache.length, 2);
  assert.equal(afterBfcache[1].isSiteDisabled, true);

  // 4. Container gaining inline "all: unset" reclassifies descendant icon.
  const allEnv = loadContentEnvironment({
    syncStorage: { selectedFont: 'Arial', isEnabled: true },
  });
  const doc = allEnv.dom.document;
  const box = doc.createElement('div');
  const ico = doc.createElement('span');
  ico.rawStyle.fontFamily = 'Arial, sans-serif';
  ico.textContent = 'home';
  box.appendChild(ico);
  doc.body.appendChild(box);
  box.setAttribute('style', 'all: unset');
  ico.rawStyle.fontFamily = '"Material Icons", sans-serif';
  allEnv.dom.getObserverStats().activeObservers[0].trigger([
    { type: 'attributes', attributeName: 'style', oldValue: '', target: box },
  ]);
  await new Promise((r) => setTimeout(r, 90));
  assert.ok(ico.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT));
});
