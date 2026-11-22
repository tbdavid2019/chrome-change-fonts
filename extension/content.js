(function (global) {
  'use strict';

  var CONTROLLER_KEY = Symbol.for('fontChanger333.controller');
  var SHARED = global.FontChangerShared;

  // Tear down any previous controller instance before deciding whether this
  // context is still valid so re-injection never leaves orphaned observers.
  var prevController = global[CONTROLLER_KEY];
  if (prevController && typeof prevController.destroy === 'function') {
    try {
      prevController.destroy();
    } catch (_e) {
      // Ignore cleanup errors from an invalidated previous world.
    }
  }

  if (!SHARED || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
    return;
  }

  var ICON_KEYWORD_REGEX = /icon|symbol|glyph|awesome|mdl2|fabric|fluent|codicon|icomoon|dingbat|wingding|webding|fontello|themify|slick|videojs|devsite|dpvwyc|octicon|entypo|lucide|feather|tabler|remixicon|boxicon|ionicon|typicon|dashicon/i;
  var GENERIC_FALLBACKS = new Set([
    'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy',
    'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace', 'ui-rounded',
    '-apple-system', 'blinkmacsystemfont',
  ]);
  var DEFAULT_UI_FONTS = new Set([
    'sans-serif', 'serif', 'monospace', 'system-ui',
    '-apple-system', 'blinkmacsystemfont', 'arial', 'helvetica', 'times new roman',
  ]);
  var SKIP_TAGS = new Set([
    'SVG', 'PATH', 'CIRCLE', 'RECT', 'LINE', 'POLYGON', 'POLYLINE', 'G', 'DEFS', 'USE',
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'TITLE', 'BASE',
    'BR', 'HR', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'SOURCE', 'TRACK', 'IFRAME',
    'OBJECT', 'EMBED', 'PARAM', 'MAP', 'AREA',
  ]);
  var ASCII_LIGATURE_REGEX = /^(?=.*[a-zA-Z0-9])[a-zA-Z0-9_-]{2,64}$/;
  var BRAND_LIGATURE_REGEX = /^google_logo(?:\s+play)?$/i;
  var STYLE_FONT_OR_VAR_REGEX = /(?:font|--|\ball\s*:)/i;
  var PROSE_BLOCK_TAGS = new Set(['P', 'BLOCKQUOTE', 'ARTICLE', 'PRE', 'LI', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  var INITIAL_HOLD_CAP_MS = 120;
  var PENDING_FONT_TIMEOUT_MS = 500;
  var OBSERVER_DEBOUNCE_MS = 60;
  var OBSERVER_MAX_WAIT_MS = 250;
  var OBSERVER_BATCH_CAP = 500;
  var MAX_ATTR_SUBTREE_ELEMENTS = 80;
  var MAX_UNICODE_RANGE_CACHE = 256;
  var FONT_RESCAN_DEBOUNCE_MS = 120;
  var DEFERRED_CONTAINER_DEBOUNCE_MS = 350;
  var DEFERRED_CONTAINER_MAX_WAIT_MS = 1000;

  var IS_INCOGNITO = Boolean(chrome.extension && chrome.extension.inIncognitoContext);
  var IS_TOP_FRAME = (function () {
    try {
      return window.top === window;
    } catch (_e) {
      return false;
    }
  })();

  function getSafeTopHost() {
    if (IS_TOP_FRAME) {
      return SHARED.normalizeSiteKey(window.location && window.location.href);
    }
    try {
      if (window.top && window.top.location && window.top.location.href) {
        return SHARED.normalizeSiteKey(window.top.location.href);
      }
    } catch (_e) {
      // Cross-origin access to window.top.location throws SecurityError.
    }
    return null;
  }

  function getAncestorOrigins() {
    try {
      if (window.location && window.location.ancestorOrigins) {
        return Array.prototype.slice.call(window.location.ancestorOrigins);
      }
    } catch (_e) {
      // Ignore restricted location reads.
    }
    return [];
  }

  var frameSiteInfo = SHARED.resolveFrameSiteKeys(
    typeof window !== 'undefined' ? window.location : null,
    getAncestorOrigins(),
    typeof document !== 'undefined' ? document.referrer : '',
    getSafeTopHost()
  );

  var state = {
    disposed: false,
    active: false,
    storageReady: false,
    selectedFont: '',
    isEnabled: false,
    fontMode: SHARED.FONT_MODE_BASIC,
    advancedFontConfig: SHARED.createAdvancedFontConfig(),
    syncDisabledMap: Object.create(null),
    siteFontMap: Object.create(null),
    migratingDisabledHost: false,
    tabIncognitoOverride: null,
    tabIncognitoSiteFonts: Object.create(null),
    lastSyncedBadgeDisabled: null,
    appliedSignature: '',
  };

  var localFontSlotsCache = new Map();
  var fontFamilyIndexMap = new Map();
  var indexedFontsList = [];
  var puaOnlyFontFamilies = new Set();
  var seenLoadedFaces = new WeakSet();
  var parsedUnicodeRangeCache = new Map();
  var ligatureRatioCache = new Map();
  var loadedTriggeredFaces = new WeakSet();
  var trackedShadowRoots = new Set();
  var shadowRootMeta = new WeakMap();
  var trackedPipDocuments = new Set();
  var pipDocMeta = new WeakMap();
  var rootSheetMap = new WeakMap();
  var pendingElements = new Set();
  var pendingDeferredRoots = new Set();
  var knownStylesheetLinks = new WeakSet();

  var mainDocObserver = null;
  var initialReadyTimer = null;
  var pendingTimeoutTimer = null;
  var fontRescanTimer = null;
  var deferredRescanTimer = null;
  var deferredRescanMaxWaitTimer = null;
  var pendingFontDeadline = 0;
  var probeSeq = 0;
  var measureCtx = null;
  var cachedBodyPrimary = null;
  var pipEnterBound = false;
  var pageShowBound = false;
  var activeListenersAttached = false;
  var domContentLoadedHandler = null;

  function isAlive() {
    if (state.disposed) return false;
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
      destroy();
      return false;
    }
    return true;
  }

  function resolveActiveSiteFontRule() {
    for (var i = 0; i < frameSiteInfo.keys.length; i++) {
      var host = frameSiteInfo.keys[i];
      if (IS_INCOGNITO && Object.prototype.hasOwnProperty.call(state.tabIncognitoSiteFonts, host)) {
        var incRule = state.tabIncognitoSiteFonts[host];
        if (incRule && !SHARED.isSiteFontRuleEmpty(incRule)) {
          return incRule;
        }
        continue;
      }
      var rule = state.siteFontMap[SHARED.siteFontKey(host)];
      if (rule && !SHARED.isSiteFontRuleEmpty(rule)) {
        return rule;
      }
    }
    return null;
  }

  function getEffectiveFontSettings() {
    return SHARED.resolveEffectiveFontSettings(
      {
        fontMode: state.fontMode,
        selectedFont: state.selectedFont,
        advancedFontConfig: state.advancedFontConfig,
      },
      resolveActiveSiteFontRule()
    );
  }

  function isPrimaryFontSetEmpty() {
    var effective = getEffectiveFontSettings();
    if (effective.fontMode === SHARED.FONT_MODE_ADVANCED) {
      var cfg = effective.advancedFontConfig;
      return !(cfg.cjkFont || cfg.cjkFontId || cfg.latinFont || cfg.latinFontId);
    }
    return !effective.selectedFont;
  }

  function computeEffectiveSiteDisabled() {
    if (IS_INCOGNITO && state.tabIncognitoOverride !== null) {
      return state.tabIncognitoOverride;
    }
    if (state.migratingDisabledHost) {
      return true;
    }
    for (var i = 0; i < frameSiteInfo.keys.length; i++) {
      if (state.syncDisabledMap[SHARED.siteDisabledKey(frameSiteInfo.keys[i])]) {
        return true;
      }
    }
    return false;
  }

  function isEffectivelyEnabled() {
    return Boolean(state.storageReady && state.isEnabled && !computeEffectiveSiteDisabled() && !isPrimaryFontSetEmpty());
  }

  function getSlotSnapshot(name, fontId) {
    var key = String(name || '') + '\0' + String(fontId || '');
    return localFontSlotsCache.get(key) || { bold: false, italic: false, boldItalic: false };
  }

  function computeStateSignature() {
    if (!isEffectivelyEnabled()) {
      return 'dormant';
    }
    var effective = getEffectiveFontSettings();
    var cfg = effective.advancedFontConfig;
    var cjkSlots = cfg.cjkFont || cfg.cjkFontId ? getSlotSnapshot(cfg.cjkFont, cfg.cjkFontId) : null;
    var latinSlots = cfg.latinFont || cfg.latinFontId ? getSlotSnapshot(cfg.latinFont, cfg.latinFontId) : null;
    return JSON.stringify({
      mode: effective.fontMode,
      selectedFont: effective.selectedFont,
      cjkFont: cfg.cjkFont,
      cjkFontId: cfg.cjkFontId,
      latinFont: cfg.latinFont,
      latinFontId: cfg.latinFontId,
      cjkSlots: cjkSlots,
      latinSlots: latinSlots,
    });
  }

  function buildRulesCss(isShadowRoot) {
    if (!isEffectivelyEnabled()) {
      return '';
    }

    var effective = getEffectiveFontSettings();
    var parts = [];
    if (effective.fontMode === SHARED.FONT_MODE_ADVANCED) {
      var cfg = effective.advancedFontConfig;
      if (cfg.cjkFont || cfg.cjkFontId) {
        parts.push(
          SHARED.buildRestrictedFontFaceSetCss(
            SHARED.CJK_FONT_FAMILY,
            cfg.cjkFont,
            cfg.cjkFontId,
            SHARED.CJK_UNICODE_RANGE,
            getSlotSnapshot(cfg.cjkFont, cfg.cjkFontId)
          )
        );
      }
      if (cfg.latinFont || cfg.latinFontId) {
        parts.push(
          SHARED.buildRestrictedFontFaceSetCss(
            SHARED.LATIN_FONT_FAMILY,
            cfg.latinFont,
            cfg.latinFontId,
            SHARED.buildNonCjkUnicodeRange(SHARED.CJK_UNICODE_RANGE),
            getSlotSnapshot(cfg.latinFont, cfg.latinFontId)
          )
        );
      }
    }

    var fontStack = SHARED.getFontStack(
      effective.fontMode,
      effective.selectedFont,
      effective.advancedFontConfig,
      SHARED.CJK_FONT_FAMILY,
      SHARED.LATIN_FONT_FAMILY
    );

    var excludeSuffix =
      ':not(svg):not(svg *)' +
      ':not([' + SHARED.ACTIVE_DOM_ATTRS.ICON_FONT + '])' +
      ':not([' + SHARED.ACTIVE_DOM_ATTRS.PENDING + '])';

    var targetSelectors = isShadowRoot
      ? [
          ':host' + excludeSuffix,
          ':host *' + excludeSuffix,
          ':host input' + excludeSuffix,
          ':host textarea' + excludeSuffix,
          ':host select' + excludeSuffix,
          ':host button' + excludeSuffix,
        ]
      : [
          'html' + excludeSuffix,
          'body' + excludeSuffix,
          'body *' + excludeSuffix,
          'input' + excludeSuffix,
          'textarea' + excludeSuffix,
          'select' + excludeSuffix,
          'button' + excludeSuffix,
        ];

    parts.push(
      '\n    ' + targetSelectors.join(', ') + ' {\n' +
      '      font-family: ' + fontStack + ' !important;\n' +
      '    }'
    );

    for (var i = 0; i < indexedFontsList.length; i++) {
      var escapedFamily = indexedFontsList[i];
      parts.push(
        '\n    [' + SHARED.ACTIVE_DOM_ATTRS.ICON_FONT + '="' + i + '"] {\n' +
        '      font-family: ' + escapedFamily + ' !important;\n' +
        '    }\n' +
        '    [' + SHARED.ACTIVE_DOM_ATTRS.ICON_BEFORE + '="' + i + '"]::before {\n' +
        '      font-family: ' + escapedFamily + ' !important;\n' +
        '    }\n' +
        '    [' + SHARED.ACTIVE_DOM_ATTRS.ICON_AFTER + '="' + i + '"]::after {\n' +
        '      font-family: ' + escapedFamily + ' !important;\n' +
        '    }'
      );
    }

    parts.push(
      '\n    [' + SHARED.ACTIVE_DOM_ATTRS.ICON_LIGATURE + '="1"] {\n' +
      '      text-transform: none !important;\n' +
      '    }\n' +
      '    [' + SHARED.ACTIVE_DOM_ATTRS.ICON_BEFORE_LIG + '="1"]::before {\n' +
      '      text-transform: none !important;\n' +
      '    }\n' +
      '    [' + SHARED.ACTIVE_DOM_ATTRS.ICON_AFTER_LIG + '="1"]::after {\n' +
      '      text-transform: none !important;\n' +
      '    }'
    );

    return parts.join('');
  }

  function isShadowRootRoot(root) {
    return Boolean(root && typeof root === 'object' && root.host && root.ownerDocument);
  }

  function getOwningWindow(root) {
    if (!root) return global;
    if (root.defaultView) return root.defaultView;
    if (root.ownerDocument && root.ownerDocument.defaultView) return root.ownerDocument.defaultView;
    return global;
  }

  function supportsAdoptedSheets(root, win) {
    return Boolean(
      root &&
      'adoptedStyleSheets' in root &&
      Array.isArray(root.adoptedStyleSheets) &&
      win &&
      typeof win.CSSStyleSheet === 'function'
    );
  }

  function getOrCreateRootSheet(root) {
    var existing = rootSheetMap.get(root);
    var win = getOwningWindow(root);
    if (supportsAdoptedSheets(root, win)) {
      if (!existing || existing.isFallbackElement) {
        var sheet = new win.CSSStyleSheet();
        existing = { sheet: sheet, isFallbackElement: false };
        rootSheetMap.set(root, existing);
      }
      return existing;
    }
    if (!existing || !existing.isFallbackElement) {
      var doc = root.ownerDocument || (root.createElement ? root : document);
      var styleEl = doc.createElement('style');
      styleEl.setAttribute('data-fc-style', '1');
      existing = { element: styleEl, isFallbackElement: true };
      rootSheetMap.set(root, existing);
    }
    return existing;
  }

  function attachSheetToRoot(root, cssText) {
    if (!root) return;
    var entry = getOrCreateRootSheet(root);
    if (!entry.isFallbackElement) {
      if (typeof entry.sheet.replaceSync === 'function') {
        entry.sheet.replaceSync(cssText);
      } else {
        entry.sheet.cssText = cssText;
      }
      if (root.adoptedStyleSheets.indexOf(entry.sheet) === -1) {
        root.adoptedStyleSheets = root.adoptedStyleSheets.concat([entry.sheet]);
      }
      return;
    }
    var styleEl = entry.element;
    if (styleEl.textContent !== cssText) {
      styleEl.textContent = cssText;
    }
    var target = isShadowRootRoot(root) ? root : (root.head || root.documentElement);
    if (target && !styleEl.parentNode) {
      target.appendChild(styleEl);
    }
  }

  function detachSheetFromRoot(root) {
    if (!root) return;
    var entry = rootSheetMap.get(root);
    if (entry) {
      if (!entry.isFallbackElement) {
        if (Array.isArray(root.adoptedStyleSheets)) {
          var idx = root.adoptedStyleSheets.indexOf(entry.sheet);
          if (idx !== -1) {
            root.adoptedStyleSheets = root.adoptedStyleSheets.filter(function (s) {
              return s !== entry.sheet;
            });
          }
        }
      } else if (entry.element && entry.element.parentNode) {
        entry.element.parentNode.removeChild(entry.element);
      }
      rootSheetMap.delete(root);
    }
    removeLegacyStylesFromRoot(root);
  }

  function removeLegacyStylesFromRoot(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    var selectors = [SHARED.LEGACY_STYLE_SELECTOR, 'style[data-fc-style="1"]'];
    for (var s = 0; s < selectors.length; s++) {
      try {
        var nodes = root.querySelectorAll(selectors[s]);
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i] && nodes[i].parentNode) {
            nodes[i].parentNode.removeChild(nodes[i]);
          }
        }
      } catch (_e) {
        // Ignore querySelectorAll limitations on lightweight test doubles.
      }
    }
  }

  function stripFontChangerAttrsFromRoot(root) {
    if (!root) return;
    var attrs = SHARED.LEGACY_DOM_ATTRS.concat([
      SHARED.ACTIVE_DOM_ATTRS.ICON_FONT,
      SHARED.ACTIVE_DOM_ATTRS.ICON_BEFORE,
      SHARED.ACTIVE_DOM_ATTRS.ICON_AFTER,
      SHARED.ACTIVE_DOM_ATTRS.ICON_LIGATURE,
      SHARED.ACTIVE_DOM_ATTRS.ICON_BEFORE_LIG,
      SHARED.ACTIVE_DOM_ATTRS.ICON_AFTER_LIG,
      SHARED.ACTIVE_DOM_ATTRS.PENDING,
    ]);
    if (root.nodeType === 1 && typeof root.removeAttribute === 'function') {
      for (var k = 0; k < attrs.length; k++) {
        root.removeAttribute(attrs[k]);
      }
    }
    if (typeof root.querySelectorAll === 'function') {
      for (var i = 0; i < attrs.length; i++) {
        try {
          var matched = root.querySelectorAll('[' + attrs[i] + ']');
          for (var j = 0; j < matched.length; j++) {
            matched[j].removeAttribute(attrs[i]);
          }
        } catch (_e) {
          // Ignore stub limitations.
        }
      }
    }
  }

  function cleanRootCompletely(root) {
    if (!root) return;
    detachSheetFromRoot(root);
    stripFontChangerAttrsFromRoot(root);
  }

  function getAllActiveRoots() {
    var roots = [];
    if (typeof document !== 'undefined' && document) {
      roots.push(document);
    }
    trackedPipDocuments.forEach(function (pipDoc) {
      if (pipDoc && pipDoc.documentElement) {
        roots.push(pipDoc);
      }
    });
    pruneTrackedShadowRoots();
    trackedShadowRoots.forEach(function (ref) {
      var sr = ref.deref();
      if (sr) roots.push(sr);
    });
    return roots;
  }

  function syncActiveStyleSheets() {
    if (!isEffectivelyEnabled()) return;
    var docCss = buildRulesCss(false);
    var shadowCss = buildRulesCss(true);

    if (typeof document !== 'undefined' && document) {
      attachSheetToRoot(document, docCss);
    }
    trackedPipDocuments.forEach(function (pipDoc) {
      if (pipDoc) {
        attachSheetToRoot(pipDoc, docCss);
      }
    });
    pruneTrackedShadowRoots();
    trackedShadowRoots.forEach(function (ref) {
      var sr = ref.deref();
      if (sr) {
        attachSheetToRoot(sr, shadowCss);
      }
    });
  }

  function setActiveSheetsDisabled(disabled) {
    var roots = getAllActiveRoots();
    for (var i = 0; i < roots.length; i++) {
      var entry = rootSheetMap.get(roots[i]);
      if (!entry) continue;
      if (!entry.isFallbackElement) {
        entry.sheet.disabled = Boolean(disabled);
      } else {
        entry.element.disabled = Boolean(disabled);
      }
    }
  }

  function ensureFontIndex(rawFontFamily) {
    var serialized = SHARED.serializeFontFamilyList(rawFontFamily);
    var existing = fontFamilyIndexMap.get(serialized);
    if (existing !== undefined) {
      return { index: existing, added: false };
    }
    var nextIndex = String(indexedFontsList.length);
    indexedFontsList.push(serialized);
    fontFamilyIndexMap.set(serialized, nextIndex);
    return { index: nextIndex, added: true };
  }

  function buildDocFontIndex(targetDoc) {
    var doc = targetDoc || (typeof document !== 'undefined' ? document : null);
    var facesByFamily = new Map();
    var loadedFamilies = new Set();
    var puaOnly = new Set();
    var cjkName = SHARED.CJK_FONT_FAMILY.toLowerCase();
    var latinName = SHARED.LATIN_FONT_FAMILY.toLowerCase();
    if (doc && doc.fonts && typeof doc.fonts.forEach === 'function') {
      try {
        doc.fonts.forEach(function (face) {
          if (!face || !face.family) return;
          var clean = face.family.replace(/^["']|["']$/g, '').trim().toLowerCase();
          if (!clean) return;
          var list = facesByFamily.get(clean);
          if (!list) {
            list = [];
            facesByFamily.set(clean, list);
          }
          list.push(face);
          if (clean !== cjkName && clean !== latinName) {
            loadedFamilies.add(clean);
          }
          if (SHARED.isPurePuaUnicodeRange(face.unicodeRange)) {
            puaOnly.add(clean);
          }
        });
      } catch (_e) {
        // Ignore FontFaceSet iteration issues in synthetic environments.
      }
    }
    return {
      facesByFamily: facesByFamily,
      loadedFamilies: loadedFamilies,
      puaOnly: puaOnly,
    };
  }

  function getParsedUnicodeRange(rangeStr) {
    if (!rangeStr || typeof rangeStr !== 'string') return null;
    if (parsedUnicodeRangeCache.has(rangeStr)) {
      return parsedUnicodeRangeCache.get(rangeStr);
    }
    var parsed = SHARED.parseUnicodeRangeString(rangeStr);
    if (parsedUnicodeRangeCache.size >= MAX_UNICODE_RANGE_CACHE) {
      parsedUnicodeRangeCache.clear();
    }
    parsedUnicodeRangeCache.set(rangeStr, parsed);
    return parsed;
  }

  function faceRangeMatchesText(face, text) {
    if (!face || !face.unicodeRange || !text) return true;
    var ranges = getParsedUnicodeRange(face.unicodeRange);
    if (!ranges || !ranges.length) return true;
    if (ranges.length === 1 && ranges[0][0] === 0 && ranges[0][1] >= 0x10FFFF) {
      return true;
    }
    for (var i = 0; i < text.length;) {
      var cp = text.codePointAt(i);
      i += cp > 0xFFFF ? 2 : 1;
      if (cp <= 0x20) continue;
      for (var r = 0; r < ranges.length; r++) {
        if (cp >= ranges[r][0] && cp <= ranges[r][1]) {
          return true;
        }
      }
    }
    return false;
  }

  function getFontFacesForFamily(familyName, targetDoc, fontIndex) {
    if (!familyName) return [];
    var targetLower = familyName.toLowerCase();
    if (fontIndex) {
      return fontIndex.facesByFamily.get(targetLower) || [];
    }
    var doc = targetDoc || (typeof document !== 'undefined' ? document : null);
    var faces = [];
    if (!doc || !doc.fonts || typeof doc.fonts.forEach !== 'function') {
      return faces;
    }
    try {
      doc.fonts.forEach(function (face) {
        if (!face || !face.family) return;
        var clean = face.family.replace(/^["']|["']$/g, '').trim().toLowerCase();
        if (clean === targetLower) {
          faces.push(face);
        }
      });
    } catch (_e) {
      // Ignore synthetic FontFaceSet issues.
    }
    return faces;
  }

  function hasPendingWebFont(familyName, targetDoc, fontIndex, sampleText) {
    var faces = getFontFacesForFamily(familyName, targetDoc, fontIndex);
    var hasPending = false;
    for (var i = 0; i < faces.length; i++) {
      var face = faces[i];
      if (face.status === 'unloaded' || face.status === 'loading') {
        if (sampleText && !faceRangeMatchesText(face, sampleText)) {
          continue;
        }
        hasPending = true;
        if (!loadedTriggeredFaces.has(face) && typeof face.load === 'function') {
          loadedTriggeredFaces.add(face);
          try {
            Promise.resolve(face.load()).catch(function () {});
          } catch (_e) {
            // Ignore synchronous FontFace.load errors.
          }
        }
      }
    }
    return hasPending;
  }

  function getLoadedWebFontFamilies(targetDoc, fontIndex) {
    if (fontIndex) return fontIndex.loadedFamilies;
    var doc = targetDoc || (typeof document !== 'undefined' ? document : null);
    var set = new Set();
    if (!doc || !doc.fonts || typeof doc.fonts.forEach !== 'function') return set;
    try {
      doc.fonts.forEach(function (face) {
        if (!face || !face.family) return;
        var clean = face.family.replace(/^["']|["']$/g, '').trim().toLowerCase();
        if (clean && clean !== SHARED.CJK_FONT_FAMILY.toLowerCase() && clean !== SHARED.LATIN_FONT_FAMILY.toLowerCase()) {
          set.add(clean);
        }
      });
    } catch (_e) {
      // Ignore.
    }
    return set;
  }

  function getMeasureContext() {
    if (measureCtx) return measureCtx;
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    try {
      var canvas = document.createElement('canvas');
      if (canvas && typeof canvas.getContext === 'function') {
        measureCtx = canvas.getContext('2d');
      }
    } catch (_e) {
      measureCtx = null;
    }
    return measureCtx;
  }

  function buildCanvasProbeFont(rawFontFamily) {
    var parsed = SHARED.parseFontFamilyList(rawFontFamily);
    var nonGeneric = [];
    for (var i = 0; i < parsed.length; i++) {
      var name = parsed[i];
      if (!GENERIC_FALLBACKS.has(name.toLowerCase())) {
        nonGeneric.push(JSON.stringify(name));
      }
    }
    nonGeneric.push('monospace');
    return '24px ' + nonGeneric.join(', ');
  }

  function getComputedStyleSafe(el, pseudo) {
    var doc = el && el.ownerDocument ? el.ownerDocument : (typeof document !== 'undefined' ? document : null);
    var win = doc && doc.defaultView ? doc.defaultView : global;
    var fn = (win && typeof win.getComputedStyle === 'function' ? win.getComputedStyle : null) ||
      (typeof getComputedStyle === 'function' ? getComputedStyle : null);
    if (!fn) return null;
    try {
      return pseudo ? fn(el, pseudo) : fn(el);
    } catch (_e) {
      return null;
    }
  }

  function getUnpollutedBodyPrimary(targetDoc) {
    if (cachedBodyPrimary !== null) return cachedBodyPrimary;
    var doc = targetDoc || (typeof document !== 'undefined' ? document : null);
    var body = doc && doc.body;
    if (!body) return '';
    var cs = getComputedStyleSafe(body);
    var families = SHARED.parseFontFamilyList(cs && cs.fontFamily ? cs.fontFamily : '');
    cachedBodyPrimary = families.length ? families[0].toLowerCase() : '';
    return cachedBodyPrimary;
  }

  function parsePseudoContent(rawContent) {
    if (!rawContent || typeof rawContent !== 'string') return '';
    var trimmed = rawContent.trim();
    if (!trimmed || trimmed === 'none' || trimmed === 'normal' || trimmed === 'open-quote' || trimmed === 'close-quote') {
      return '';
    }
    var first = trimmed[0];
    var last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1).replace(/\\(.)/g, '$1');
    }
    return '';
  }

  function isSkippedTag(el) {
    if (!el || el.nodeType !== 1) return true;
    var tag = el.tagName ? String(el.tagName).toUpperCase() : '';
    if (SKIP_TAGS.has(tag)) return true;
    if (typeof el.closest === 'function') {
      try {
        if (el.closest('svg')) return true;
      } catch (_e) {
        // Ignore stub closest failures.
      }
    }
    return false;
  }

  function hasSignal2IconFont(primaryFamily) {
    if (!primaryFamily) return false;
    var lower = primaryFamily.toLowerCase();
    if (lower === SHARED.CJK_FONT_FAMILY.toLowerCase() || lower === SHARED.LATIN_FONT_FAMILY.toLowerCase()) {
      return false;
    }
    if (ICON_KEYWORD_REGEX.test(primaryFamily)) return true;
    if (puaOnlyFontFamilies.has(lower)) return true;
    return false;
  }

  function isAsciiLigatureCandidateText(text) {
    var norm = SHARED.normalizeLigatureText(text);
    if (!norm) return '';
    if (ASCII_LIGATURE_REGEX.test(norm) || BRAND_LIGATURE_REGEX.test(norm)) {
      return norm;
    }
    return '';
  }

  function isSignal3Ligature(normText, rawFontFamily, targetDoc, fontIndex) {
    if (!normText || !rawFontFamily) return false;
    var families = SHARED.parseFontFamilyList(rawFontFamily);
    var primary = families.length ? families[0].toLowerCase() : '';
    if (!primary || DEFAULT_UI_FONTS.has(primary)) return false;

    var webFonts = getLoadedWebFontFamilies(targetDoc, fontIndex);
    var bodyPrimary = getUnpollutedBodyPrimary(targetDoc);
    if (bodyPrimary && primary === bodyPrimary && !webFonts.has(primary)) {
      return false;
    }

    var faces = getFontFacesForFamily(families[0], targetDoc, fontIndex);
    var allLoaded = true;
    for (var i = 0; i < faces.length; i++) {
      if (faces[i].status !== 'loaded') {
        allLoaded = false;
        break;
      }
    }

    var cacheKey = rawFontFamily + '\0' + normText;
    if (ligatureRatioCache.has(cacheKey)) {
      return ligatureRatioCache.get(cacheKey);
    }

    var ctx = getMeasureContext();
    if (!ctx || typeof ctx.measureText !== 'function') {
      return false;
    }

    ctx.font = buildCanvasProbeFont(rawFontFamily);
    var rawWidth = ctx.measureText(normText).width;
    var zwnjText = normText.split('').join('\u200C');
    var zwnjWidth = ctx.measureText(zwnjText).width;
    var isLigature = zwnjWidth > 0 && rawWidth > 0 && rawWidth / zwnjWidth < 0.85;

    if (allLoaded) {
      ligatureRatioCache.set(cacheKey, isLigature);
    }
    return isLigature;
  }

  function hasNonWhitespaceText(str) {
    if (!str) return false;
    return str.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\s]/g, '').length > 0;
  }

  function getDirectTextContent(el) {
    if (!el || !el.childNodes) return '';
    var text = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      var child = el.childNodes[i];
      if (child && child.nodeType === 3) {
        text += child.nodeValue || '';
      }
    }
    return text;
  }

  var ALL_FC_ATTRS = [
    SHARED.ACTIVE_DOM_ATTRS.ICON_FONT,
    SHARED.ACTIVE_DOM_ATTRS.ICON_BEFORE,
    SHARED.ACTIVE_DOM_ATTRS.ICON_AFTER,
    SHARED.ACTIVE_DOM_ATTRS.ICON_LIGATURE,
    SHARED.ACTIVE_DOM_ATTRS.ICON_BEFORE_LIG,
    SHARED.ACTIVE_DOM_ATTRS.ICON_AFTER_LIG,
    SHARED.ACTIVE_DOM_ATTRS.PENDING,
  ];

  function hasAnyFcAttr(el) {
    if (!el || typeof el.hasAttribute !== 'function') return false;
    for (var i = 0; i < ALL_FC_ATTRS.length; i++) {
      if (el.hasAttribute(ALL_FC_ATTRS[i])) return true;
    }
    return false;
  }

  function clearElementFcAttrs(el) {
    if (!el || typeof el.removeAttribute !== 'function') return;
    if (!hasAnyFcAttr(el)) return;
    for (var i = 0; i < ALL_FC_ATTRS.length; i++) {
      if (typeof el.hasAttribute !== 'function' || el.hasAttribute(ALL_FC_ATTRS[i])) {
        el.removeAttribute(ALL_FC_ATTRS[i]);
      }
    }
  }

  function applyElementFcAttrsDiff(el, nextAttrs) {
    if (!el) return;
    for (var i = 0; i < ALL_FC_ATTRS.length; i++) {
      var attr = ALL_FC_ATTRS[i];
      var nextVal = nextAttrs && nextAttrs[attr] !== undefined ? nextAttrs[attr] : null;
      var curVal = typeof el.getAttribute === 'function' ? el.getAttribute(attr) : null;
      if (nextVal === null) {
        if (curVal !== null && typeof el.removeAttribute === 'function') {
          el.removeAttribute(attr);
        }
      } else if (curVal !== nextVal && typeof el.setAttribute === 'function') {
        el.setAttribute(attr, nextVal);
      }
    }
  }

  function evaluatePseudo(el, pseudoName, targetDoc, fontIndex, preReadContent) {
    var cs = getComputedStyleSafe(el, pseudoName);
    if (!cs) return null;
    var contentText = preReadContent !== undefined ? preReadContent : parsePseudoContent(cs.content);
    if (!hasNonWhitespaceText(contentText)) return null;

    var fontFamily = cs.fontFamily || '';
    var families = SHARED.parseFontFamilyList(fontFamily);
    var primary = families.length ? families[0] : '';
    var puaHit = SHARED.PUA_REGEX.test(contentText);

    if (!puaHit && primary && hasPendingWebFont(primary, targetDoc, fontIndex, contentText)) {
      return { pending: true };
    }

    if (puaHit) {
      return { pending: false, iconFont: fontFamily, ligature: false };
    }

    var normText = isAsciiLigatureCandidateText(contentText);
    if (hasSignal2IconFont(primary)) {
      return { pending: false, iconFont: fontFamily, ligature: Boolean(normText) };
    }
    if (normText && isSignal3Ligature(normText, fontFamily, targetDoc, fontIndex)) {
      return { pending: false, iconFont: fontFamily, ligature: true };
    }
    return null;
  }

  function computeElementClassification(item, targetDoc, allowPendingHold, fontIndex) {
    var el = item.el;
    var cs = getComputedStyleSafe(el);
    if (!cs) return null;

    var doc = targetDoc || el.ownerDocument || document;
    var fontFamily = cs.fontFamily || '';
    var families = SHARED.parseFontFamilyList(fontFamily);
    var primary = families.length ? families[0] : '';

    var isLeaf = item.isLeaf;
    var hostText = item.hostText;
    var hasHostText = item.hasHostText;
    var hostVisibleContent = item.hostVisibleContent;

    var beforeRes = item.hasBeforeContent
      ? evaluatePseudo(el, '::before', doc, fontIndex, item.beforeContent)
      : null;
    var afterRes = item.hasAfterContent
      ? evaluatePseudo(el, '::after', doc, fontIndex, item.afterContent)
      : null;

    var hostPending = false;
    var hostIcon = null;

    if (hasHostText) {
      var hostPua = SHARED.PUA_REGEX.test(hostText);
      if (hostPua) {
        hostIcon = { font: fontFamily, ligature: false };
      } else {
        var normHost = isAsciiLigatureCandidateText(hostText);
        if (primary && (normHost || ICON_KEYWORD_REGEX.test(primary)) &&
            hasPendingWebFont(primary, doc, fontIndex, hostText)) {
          hostPending = true;
        } else if (hasSignal2IconFont(primary)) {
          hostIcon = { font: fontFamily, ligature: Boolean(normHost) };
        } else if (normHost && isSignal3Ligature(normHost, fontFamily, doc, fontIndex)) {
          hostIcon = { font: fontFamily, ligature: true };
        }
      }
    }

    var anyPending = hostPending || Boolean(beforeRes && beforeRes.pending) || Boolean(afterRes && afterRes.pending);
    if (anyPending && allowPendingHold && (!pendingFontDeadline || Date.now() < pendingFontDeadline)) {
      var pendingAttrs = Object.create(null);
      pendingAttrs[SHARED.ACTIVE_DOM_ATTRS.PENDING] = '1';
      return { el: el, isPending: true, addedFontRule: false, nextAttrs: pendingAttrs };
    }

    var nextAttrs = Object.create(null);
    var addedFontRule = false;
    var hostPinned = false;

    if (hostIcon && (isLeaf || hasHostText)) {
      var hostIdx = ensureFontIndex(hostIcon.font);
      addedFontRule = addedFontRule || hostIdx.added;
      nextAttrs[SHARED.ACTIVE_DOM_ATTRS.ICON_FONT] = hostIdx.index;
      if (hostIcon.ligature) {
        nextAttrs[SHARED.ACTIVE_DOM_ATTRS.ICON_LIGATURE] = '1';
      }
      hostPinned = true;
    }

    if (!hostPinned && beforeRes && !beforeRes.pending) {
      if (!hostVisibleContent) {
        var bWholeIdx = ensureFontIndex(beforeRes.iconFont);
        addedFontRule = addedFontRule || bWholeIdx.added;
        nextAttrs[SHARED.ACTIVE_DOM_ATTRS.ICON_FONT] = bWholeIdx.index;
        if (beforeRes.ligature) {
          nextAttrs[SHARED.ACTIVE_DOM_ATTRS.ICON_LIGATURE] = '1';
        }
        hostPinned = true;
      } else {
        var bPseudoIdx = ensureFontIndex(beforeRes.iconFont);
        addedFontRule = addedFontRule || bPseudoIdx.added;
        nextAttrs[SHARED.ACTIVE_DOM_ATTRS.ICON_BEFORE] = bPseudoIdx.index;
        if (beforeRes.ligature) {
          nextAttrs[SHARED.ACTIVE_DOM_ATTRS.ICON_BEFORE_LIG] = '1';
        }
      }
    }

    if (!hostPinned && afterRes && !afterRes.pending) {
      if (!hostVisibleContent) {
        var aWholeIdx = ensureFontIndex(afterRes.iconFont);
        addedFontRule = addedFontRule || aWholeIdx.added;
        nextAttrs[SHARED.ACTIVE_DOM_ATTRS.ICON_FONT] = aWholeIdx.index;
        if (afterRes.ligature) {
          nextAttrs[SHARED.ACTIVE_DOM_ATTRS.ICON_LIGATURE] = '1';
        }
        hostPinned = true;
      } else {
        var aPseudoIdx = ensureFontIndex(afterRes.iconFont);
        addedFontRule = addedFontRule || aPseudoIdx.added;
        nextAttrs[SHARED.ACTIVE_DOM_ATTRS.ICON_AFTER] = aPseudoIdx.index;
        if (afterRes.ligature) {
          nextAttrs[SHARED.ACTIVE_DOM_ATTRS.ICON_AFTER_LIG] = '1';
        }
      }
    }

    return { el: el, isPending: false, addedFontRule: addedFontRule, nextAttrs: nextAttrs };
  }

  function getInputControlText(el) {
    if (!el || !el.tagName || String(el.tagName).toUpperCase() !== 'INPUT') return '';
    var inputType = String(el.type || (typeof el.getAttribute === 'function' ? el.getAttribute('type') : '') || '').toLowerCase();
    if (inputType !== 'button' && inputType !== 'submit' && inputType !== 'reset') {
      return '';
    }
    var val = typeof el.value === 'string' && el.value
      ? el.value
      : (typeof el.getAttribute === 'function' ? (el.getAttribute('value') || '') : '');
    return String(val || '');
  }

  function hasInlineOrClassIconHint(el) {
    if (!el) return false;
    var cls = typeof el.className === 'string' ? el.className : '';
    if (cls && ICON_KEYWORD_REGEX.test(cls)) return true;
    if (el.style && typeof el.style.fontFamily === 'string' && ICON_KEYWORD_REGEX.test(el.style.fontFamily)) {
      return true;
    }
    var inlineStyle = typeof el.getAttribute === 'function' ? el.getAttribute('style') : '';
    return Boolean(inlineStyle && ICON_KEYWORD_REGEX.test(inlineStyle));
  }

  function shouldCheckLongHostText(el, hostText) {
    if (hostText.trim().length <= 64) return true;
    if (SHARED.PUA_REGEX.test(hostText) || Boolean(isAsciiLigatureCandidateText(hostText))) {
      return true;
    }
    if (hasInlineOrClassIconHint(el)) return true;
    var tag = el && el.tagName ? String(el.tagName).toUpperCase() : '';
    if (!PROSE_BLOCK_TAGS.has(tag)) return true;
    return false;
  }

  function classifyElementsGroupedByDoc(elements, allowPendingHold) {
    if (!elements || !elements.length) return;
    var fallbackDoc = typeof document !== 'undefined' ? document : null;
    var byDoc = new Map();
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!el) continue;
      var ownerDoc = el.ownerDocument || fallbackDoc;
      var bucket = byDoc.get(ownerDoc);
      if (!bucket) {
        bucket = [];
        byDoc.set(ownerDoc, bucket);
      }
      bucket.push(el);
    }
    byDoc.forEach(function (group, doc) {
      classifyElementsBatch(group, doc, allowPendingHold);
    });
  }

  function schedulePendingFallbackTimer() {
    if (pendingTimeoutTimer) return;
    if (!pendingFontDeadline) {
      pendingFontDeadline = Date.now() + PENDING_FONT_TIMEOUT_MS;
    }
    var remaining = Math.max(0, pendingFontDeadline - Date.now());
    pendingTimeoutTimer = setTimeout(function () {
      pendingTimeoutTimer = null;
      if (!isAlive() || !state.active) return;
      if (pendingElements.size > 0) {
        var batch = Array.from(pendingElements);
        pendingElements.clear();
        classifyElementsGroupedByDoc(batch, false);
      }
    }, remaining);
  }

  function classifyElementsBatch(elements, targetDoc, allowPendingHold) {
    if (!isEffectivelyEnabled() || !elements || !elements.length) return;
    var doc = targetDoc || (typeof document !== 'undefined' ? document : null);

    // Phase 0: Pre-filter elements before disabling active stylesheets so batches
    // containing only ordinary non-icon text incur zero full-document style invalidation.
    var probeList = [];
    var skipClearList = [];
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!el || el.nodeType !== 1 || !el.isConnected) continue;
      if (isSkippedTag(el)) {
        if (hasAnyFcAttr(el)) skipClearList.push(el);
        pendingElements.delete(el);
        continue;
      }

      var hadFc = hasAnyFcAttr(el);
      var childElementCount = el.children ? el.children.length : 0;
      var isLeaf = childElementCount === 0;
      var hostText = isLeaf ? (el.textContent || '') : getDirectTextContent(el);
      if (!hasNonWhitespaceText(hostText) && isLeaf) {
        var inputVal = getInputControlText(el);
        if (inputVal) hostText = inputVal;
      }
      var hasHostText = hasNonWhitespaceText(hostText);
      var hostVisibleContent = hasHostText || childElementCount > 0 ||
        (!isLeaf && hasNonWhitespaceText(el.textContent || ''));

      var beforeCs = getComputedStyleSafe(el, '::before');
      var afterCs = getComputedStyleSafe(el, '::after');
      var beforeContent = beforeCs ? parsePseudoContent(beforeCs.content) : '';
      var afterContent = afterCs ? parsePseudoContent(afterCs.content) : '';
      var hasBeforeContent = hasNonWhitespaceText(beforeContent);
      var hasAfterContent = hasNonWhitespaceText(afterContent);

      var needsHostCheck = hasHostText && shouldCheckLongHostText(el, hostText);

      if (!hadFc && !hasBeforeContent && !hasAfterContent && !needsHostCheck) {
        continue;
      }

      probeList.push({
        el: el,
        isLeaf: isLeaf,
        hostText: hostText,
        hasHostText: hasHostText,
        hostVisibleContent: hostVisibleContent,
        hasBeforeContent: hasBeforeContent,
        beforeContent: beforeContent,
        hasAfterContent: hasAfterContent,
        afterContent: afterContent,
      });
    }

    for (var s = 0; s < skipClearList.length; s++) {
      clearElementFcAttrs(skipClearList[s]);
    }

    if (!probeList.length) return;

    var fontIndex = buildDocFontIndex(doc);
    puaOnlyFontFamilies = fontIndex.puaOnly;
    cachedBodyPrimary = null;

    setActiveSheetsDisabled(true);
    var needsSheetUpdate = false;
    var computedResults = [];
    try {
      // Phase 1: Pure read pass against unpolluted styles.
      for (var p = 0; p < probeList.length; p++) {
        var res = computeElementClassification(probeList[p], doc, allowPendingHold, fontIndex);
        if (res) {
          if (res.addedFontRule) needsSheetUpdate = true;
          computedResults.push(res);
        }
      }

      // Phase 2: Write only changed attributes after all getComputedStyle reads finish.
      var scheduledPending = false;
      for (var w = 0; w < computedResults.length; w++) {
        var itemRes = computedResults[w];
        if (itemRes.isPending) {
          pendingElements.add(itemRes.el);
          scheduledPending = true;
        } else {
          pendingElements.delete(itemRes.el);
        }
        applyElementFcAttrsDiff(itemRes.el, itemRes.nextAttrs);
      }
      if (scheduledPending) {
        schedulePendingFallbackTimer();
      }
    } finally {
      if (needsSheetUpdate) {
        syncActiveStyleSheets();
      }
      setActiveSheetsDisabled(false);
    }
  }

  function collectElementsAndShadowRoots(root, outElements, newShadowRoots) {
    if (!root) return;
    if (root.nodeType === 1) {
      if (isSkippedTag(root)) return;
      outElements.push(root);
      if (root.shadowRoot) {
        newShadowRoots.push(root.shadowRoot);
      }
    }
    if (typeof root.querySelectorAll === 'function') {
      try {
        var descendants = root.querySelectorAll('*');
        for (var i = 0; i < descendants.length; i++) {
          var node = descendants[i];
          if (!isSkippedTag(node)) {
            outElements.push(node);
            if (node.shadowRoot) {
              newShadowRoots.push(node.shadowRoot);
            }
          }
        }
        return;
      } catch (_e) {
        // Fall back to child traversal on simple mocks.
      }
    }
    var children = root.children || [];
    for (var j = 0; j < children.length; j++) {
      collectElementsAndShadowRoots(children[j], outElements, newShadowRoots);
    }
  }

  function scanRootTree(root, allowPendingHold) {
    if (!root || !isEffectivelyEnabled()) return;
    var doc = root.nodeType === 9 ? root : (root.ownerDocument || (typeof document !== 'undefined' ? document : null));
    var rootStart = root.nodeType === 9 ? (root.body || root.documentElement) : root;
    var elements = [];
    var discoveredShadows = [];
    collectElementsAndShadowRoots(rootStart, elements, discoveredShadows);

    for (var s = 0; s < discoveredShadows.length; s++) {
      registerShadowRoot(discoveredShadows[s]);
    }

    if (elements.length > 0) {
      classifyElementsBatch(elements, doc, allowPendingHold);
    }
    watchStylesheetLinks(doc);
  }

  function watchStylesheetLinks(targetDoc) {
    var doc = targetDoc || (typeof document !== 'undefined' ? document : null);
    if (!doc || typeof doc.querySelectorAll !== 'function') return;
    try {
      var links = doc.querySelectorAll('link[rel~="stylesheet"]');
      for (var i = 0; i < links.length; i++) {
        var link = links[i];
        if (!knownStylesheetLinks.has(link) && typeof link.addEventListener === 'function') {
          knownStylesheetLinks.add(link);
          link.addEventListener('load', handleStylesheetOrFontLoaded);
        }
      }
    } catch (_e) {
      // Ignore querySelectorAll stub limitations.
    }
  }

  function collectBoundedSubtreeElements(rootEl, maxCount, newShadowRoots) {
    var collected = [];
    function walk(cur) {
      if (!cur || cur.nodeType !== 1 || isSkippedTag(cur)) return true;
      collected.push(cur);
      if (collected.length > maxCount) return false;
      if (cur.shadowRoot && newShadowRoots) {
        newShadowRoots.push(cur.shadowRoot);
      }
      var children = cur.children;
      if (children && children.length) {
        for (var i = 0; i < children.length; i++) {
          if (!walk(children[i])) return false;
        }
      }
      return true;
    }
    return walk(rootEl) ? collected : null;
  }

  function shouldInspectSubtreeElement(el) {
    var hasChildren = el.children && el.children.length > 0;
    if (!hasChildren || el.hasAttribute('class') || hasAnyFcAttr(el)) {
      return true;
    }
    var elText = el.textContent || '';
    return SHARED.PUA_REGEX.test(elText) ||
      Boolean(isAsciiLigatureCandidateText(elText)) ||
      !hasNonWhitespaceText(elText);
  }

  function getStyleAttrValue(el) {
    if (!el) return '';
    if (typeof el.getAttribute === 'function') {
      var attrVal = el.getAttribute('style');
      if (typeof attrVal === 'string' && attrVal) return attrVal;
    }
    if (el.style && typeof el.style.cssText === 'string') {
      return el.style.cssText;
    }
    return '';
  }

  function prefilterMutationCandidates(mutations) {
    var candidates = new Set();
    var touchedShadows = [];
    var deferredRoots = [];
    var styleAttrTargets = new Map();
    var classAttrTargets = new Set();
    var visitedAddedElements = new Set();

    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (!m) continue;

      if (m.type === 'characterData') {
        var parent = m.target && m.target.parentElement;
        if (parent && !isSkippedTag(parent)) {
          var newVal = m.target.nodeValue || '';
          var hadFcAttr = parent.hasAttribute(SHARED.ACTIVE_DOM_ATTRS.ICON_FONT) ||
            parent.hasAttribute(SHARED.ACTIVE_DOM_ATTRS.ICON_LIGATURE) ||
            parent.hasAttribute(SHARED.ACTIVE_DOM_ATTRS.PENDING);
          if (hadFcAttr || SHARED.PUA_REGEX.test(newVal) || isAsciiLigatureCandidateText(newVal)) {
            candidates.add(parent);
          }
        }
        continue;
      }

      if (m.type === 'attributes') {
        if (m.attributeName && m.attributeName.indexOf('data-fc-') === 0) {
          continue;
        }
        var attrTarget = m.target;
        if (attrTarget && attrTarget.nodeType === 1 && !isSkippedTag(attrTarget)) {
          if (m.attributeName === 'style') {
            var oldMatches = typeof m.oldValue === 'string' && STYLE_FONT_OR_VAR_REGEX.test(m.oldValue);
            var prevFlag = styleAttrTargets.get(attrTarget) || false;
            styleAttrTargets.set(attrTarget, prevFlag || oldMatches);
          } else {
            classAttrTargets.add(attrTarget);
          }
        }
        continue;
      }

      if (m.type === 'childList' && m.addedNodes) {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var added = m.addedNodes[j];
          if (!added) continue;
          if (added.nodeType === 3) {
            var p = m.target && m.target.nodeType === 1 ? m.target : added.parentElement;
            if (p && !isSkippedTag(p)) {
              var txt = added.nodeValue || '';
              if (p.hasAttribute(SHARED.ACTIVE_DOM_ATTRS.ICON_FONT) ||
                  SHARED.PUA_REGEX.test(txt) ||
                  isAsciiLigatureCandidateText(txt)) {
                candidates.add(p);
              }
            }
          } else if (added.nodeType === 1 && !isSkippedTag(added)) {
            if (visitedAddedElements.has(added)) continue;
            if (added.tagName && String(added.tagName).toUpperCase() === 'LINK') {
              watchStylesheetLinks(added.ownerDocument);
            }
            var subElements = [];
            collectElementsAndShadowRoots(added, subElements, touchedShadows);
            for (var k = 0; k < subElements.length; k++) {
              var el = subElements[k];
              visitedAddedElements.add(el);
              if (shouldInspectSubtreeElement(el)) {
                candidates.add(el);
              }
            }
          }
        }
      }
    }

    styleAttrTargets.forEach(function (oldMatchedFontOrVar, el) {
      if (visitedAddedElements.has(el)) return;
      var tag = el.tagName ? String(el.tagName).toUpperCase() : '';
      var curStyle = getStyleAttrValue(el);
      var affectsFontOrVar = oldMatchedFontOrVar || STYLE_FONT_OR_VAR_REGEX.test(curStyle);

      if (tag === 'HTML' || tag === 'BODY') {
        if (hasAnyFcAttr(el)) candidates.add(el);
        if (affectsFontOrVar) deferredRoots.push(el);
        return;
      }

      if (!affectsFontOrVar) {
        var hasChildren = el.children && el.children.length > 0;
        if (!hasChildren || hasAnyFcAttr(el) || hasNonWhitespaceText(getDirectTextContent(el))) {
          candidates.add(el);
        }
        return;
      }

      var boundedStyle = collectBoundedSubtreeElements(el, MAX_ATTR_SUBTREE_ELEMENTS, touchedShadows);
      if (!boundedStyle) {
        deferredRoots.push(el);
        return;
      }
      for (var s = 0; s < boundedStyle.length; s++) {
        if (shouldInspectSubtreeElement(boundedStyle[s])) {
          candidates.add(boundedStyle[s]);
        }
      }
    });

    classAttrTargets.forEach(function (el) {
      if (visitedAddedElements.has(el)) return;
      var tag = el.tagName ? String(el.tagName).toUpperCase() : '';
      if (tag === 'HTML' || tag === 'BODY') {
        if (hasAnyFcAttr(el)) candidates.add(el);
        deferredRoots.push(el);
        return;
      }
      var bounded = collectBoundedSubtreeElements(el, MAX_ATTR_SUBTREE_ELEMENTS, touchedShadows);
      if (!bounded) {
        deferredRoots.push(el);
        return;
      }
      for (var i = 0; i < bounded.length; i++) {
        if (shouldInspectSubtreeElement(bounded[i])) {
          candidates.add(bounded[i]);
        }
      }
    });

    return {
      candidates: Array.from(candidates),
      touchedShadows: touchedShadows,
      deferredRoots: deferredRoots,
    };
  }

  function createDebouncedMutationObserver(root, rootRef, onBatch) {
    var ObserverCtor = (getOwningWindow(root).MutationObserver) ||
      (typeof MutationObserver === 'function' ? MutationObserver : null);
    if (!ObserverCtor || !root) return null;

    var queued = [];
    var debounceTimer = null;
    var maxWaitTimer = null;

    function flush() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (maxWaitTimer) {
        clearTimeout(maxWaitTimer);
        maxWaitTimer = null;
      }
      if (!isAlive() || !state.active) {
        queued = [];
        return;
      }
      var target = rootRef ? rootRef.deref() : root;
      if (!target) {
        queued = [];
        return;
      }
      if (!queued.length) return;
      var batch = queued.splice(0, OBSERVER_BATCH_CAP);
      var hasMore = queued.length > 0;
      onBatch(target, batch);
      if (hasMore && isAlive() && state.active) {
        debounceTimer = setTimeout(flush, 0);
      }
    }

    var observer = new ObserverCtor(function (mutations) {
      if (!isAlive() || !state.active || !mutations || !mutations.length) return;
      for (var i = 0; i < mutations.length; i++) {
        queued.push(mutations[i]);
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, OBSERVER_DEBOUNCE_MS);
      if (!maxWaitTimer) {
        maxWaitTimer = setTimeout(flush, OBSERVER_MAX_WAIT_MS);
      }
    });

    var observeTarget = root.nodeType === 9 ? (root.documentElement || root) : root;
    try {
      observer.observe(observeTarget, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['class', 'style'],
      });
    } catch (_e) {
      return null;
    }

    return {
      disconnect: function () {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        if (maxWaitTimer) {
          clearTimeout(maxWaitTimer);
          maxWaitTimer = null;
        }
        queued = [];
        observer.disconnect();
      },
    };
  }

  function flushDeferredContainerRescans() {
    if (deferredRescanTimer) {
      clearTimeout(deferredRescanTimer);
      deferredRescanTimer = null;
    }
    if (deferredRescanMaxWaitTimer) {
      clearTimeout(deferredRescanMaxWaitTimer);
      deferredRescanMaxWaitTimer = null;
    }
    if (!isAlive() || !state.active || pendingDeferredRoots.size === 0) {
      pendingDeferredRoots.clear();
      return;
    }
    var roots = Array.from(pendingDeferredRoots);
    pendingDeferredRoots.clear();

    var wholeDocs = new Set();
    var containerRoots = [];
    for (var i = 0; i < roots.length; i++) {
      var r = roots[i];
      if (!r || !r.isConnected) continue;
      var tag = r.tagName ? String(r.tagName).toUpperCase() : '';
      if (tag === 'HTML' || tag === 'BODY') {
        wholeDocs.add(r.ownerDocument || document);
      } else {
        containerRoots.push(r);
      }
    }

    wholeDocs.forEach(function (doc) {
      if (doc) scanRootTree(doc, true);
    });

    // Drop deferred containers already covered by an ancestor container in this batch.
    var coalesced = [];
    for (var j = 0; j < containerRoots.length; j++) {
      var cRoot = containerRoots[j];
      var cDoc = cRoot.ownerDocument || document;
      if (wholeDocs.has(cDoc)) continue;
      var coveredByAncestor = false;
      for (var k = 0; k < containerRoots.length; k++) {
        if (k === j) continue;
        var other = containerRoots[k];
        if (other && typeof other.contains === 'function' && other.contains(cRoot)) {
          coveredByAncestor = true;
          break;
        }
      }
      if (!coveredByAncestor) {
        coalesced.push(cRoot);
      }
    }

    for (var c = 0; c < coalesced.length; c++) {
      scanRootTree(coalesced[c], true);
    }
  }

  function scheduleDeferredContainerRescan(roots) {
    if (!roots || !roots.length) return;
    for (var i = 0; i < roots.length; i++) {
      if (roots[i]) pendingDeferredRoots.add(roots[i]);
    }
    if (deferredRescanTimer) clearTimeout(deferredRescanTimer);
    deferredRescanTimer = setTimeout(flushDeferredContainerRescans, DEFERRED_CONTAINER_DEBOUNCE_MS);
    if (!deferredRescanMaxWaitTimer) {
      deferredRescanMaxWaitTimer = setTimeout(flushDeferredContainerRescans, DEFERRED_CONTAINER_MAX_WAIT_MS);
    }
  }

  function handleMutationBatch(targetRoot, mutations) {
    if (!isAlive() || !state.active) return;
    pruneTrackedShadowRoots();
    var result = prefilterMutationCandidates(mutations);
    for (var i = 0; i < result.touchedShadows.length; i++) {
      registerShadowRoot(result.touchedShadows[i]);
    }
    if (result.candidates.length > 0) {
      var doc = targetRoot.nodeType === 9 ? targetRoot : (targetRoot.ownerDocument || document);
      classifyElementsBatch(result.candidates, doc, true);
    }
    if (result.deferredRoots && result.deferredRoots.length > 0) {
      scheduleDeferredContainerRescan(result.deferredRoots);
    }
  }

  function registerShadowRoot(shadowRoot) {
    if (!shadowRoot || shadowRootMeta.has(shadowRoot)) return;
    if (!shadowRoot.host || !shadowRoot.host.isConnected) return;
    var ref = new WeakRef(shadowRoot);
    trackedShadowRoots.add(ref);
    var obs = state.active ? createDebouncedMutationObserver(shadowRoot, ref, handleMutationBatch) : null;
    shadowRootMeta.set(shadowRoot, { ref: ref, observer: obs });
    if (state.active) {
      attachSheetToRoot(shadowRoot, buildRulesCss(true));
      scanRootTree(shadowRoot, true);
    }
  }

  function pruneTrackedShadowRoots() {
    trackedShadowRoots.forEach(function (ref) {
      var sr = ref.deref();
      var ownerDoc = sr ? sr.ownerDocument : null;
      var deadHost = !sr || !sr.host || !sr.host.isConnected;
      var closedPipOwner = Boolean(ownerDoc && ownerDoc !== document && !trackedPipDocuments.has(ownerDoc));
      if (deadHost || closedPipOwner) {
        if (sr) {
          var meta = shadowRootMeta.get(sr);
          if (meta && meta.observer) {
            meta.observer.disconnect();
          }
          detachSheetFromRoot(sr);
          shadowRootMeta.delete(sr);
        }
        trackedShadowRoots.delete(ref);
      }
    });
  }

  function collectFontFaceCssFromRules(cssRules, outList) {
    if (!cssRules) return;
    for (var i = 0; i < cssRules.length; i++) {
      var rule = cssRules[i];
      if (!rule) continue;
      // CSSRule.FONT_FACE_RULE === 5
      if (rule.type === 5 || (rule.constructor && rule.constructor.name === 'CSSFontFaceRule')) {
        if (rule.cssText) outList.push(rule.cssText);
      } else if (rule.cssRules) {
        // Recurse into @media, @supports, @layer, CSSGroupingRule.
        collectFontFaceCssFromRules(rule.cssRules, outList);
      }
    }
  }

  function copyFontResourcesToPip(sourceDoc, pipDoc) {
    if (!sourceDoc || !pipDoc || !pipDoc.head) return;

    var existingHrefs = new Set();
    try {
      var existingLinks = pipDoc.querySelectorAll('link[rel~="stylesheet"]');
      for (var i = 0; i < existingLinks.length; i++) {
        if (existingLinks[i].href) existingHrefs.add(existingLinks[i].href);
      }
    } catch (_e) {
      // Ignore.
    }

    try {
      var sourceLinks = sourceDoc.querySelectorAll('link[rel~="stylesheet"]');
      for (var j = 0; j < sourceLinks.length; j++) {
        var link = sourceLinks[j];
        if (!link.href || existingHrefs.has(link.href)) continue;
        var cloned = pipDoc.createElement('link');
        cloned.rel = 'stylesheet';
        cloned.href = link.href;
        if (link.crossOrigin) cloned.crossOrigin = link.crossOrigin;
        pipDoc.head.appendChild(cloned);
        existingHrefs.add(link.href);
      }
    } catch (_e) {
      // Ignore query errors on stubs.
    }

    var collectedFontFaces = [];
    if (sourceDoc.styleSheets) {
      for (var k = 0; k < sourceDoc.styleSheets.length; k++) {
        var sheet = sourceDoc.styleSheets[k];
        if (!sheet) continue;
        try {
          if (sheet.cssRules) {
            collectFontFaceCssFromRules(sheet.cssRules, collectedFontFaces);
          }
        } catch (_e) {
          // Cross-origin CSSStyleSheet raises SecurityError on .cssRules; link tag handles it.
        }
      }
    }

    if (collectedFontFaces.length > 0) {
      var pipWin = getOwningWindow(pipDoc);
      var fontFaceCss = collectedFontFaces.join('\n');
      if (supportsAdoptedSheets(pipDoc, pipWin)) {
        var meta = pipDocMeta.get(pipDoc) || {};
        if (!meta.fontCopySheet) {
          meta.fontCopySheet = new pipWin.CSSStyleSheet();
          pipDocMeta.set(pipDoc, meta);
        }
        if (typeof meta.fontCopySheet.replaceSync === 'function') {
          meta.fontCopySheet.replaceSync(fontFaceCss);
        } else {
          meta.fontCopySheet.cssText = fontFaceCss;
        }
        if (pipDoc.adoptedStyleSheets.indexOf(meta.fontCopySheet) === -1) {
          pipDoc.adoptedStyleSheets = pipDoc.adoptedStyleSheets.concat([meta.fontCopySheet]);
        }
      } else {
        var styleEl = pipDoc.createElement('style');
        styleEl.setAttribute('data-fc-pip-fonts', '1');
        styleEl.textContent = fontFaceCss;
        pipDoc.head.appendChild(styleEl);
      }
    }
  }

  function cleanupPipDocument(pipDoc) {
    if (!pipDoc) return;
    var meta = pipDocMeta.get(pipDoc);
    if (meta) {
      if (meta.observer) {
        meta.observer.disconnect();
      }
      if (meta.win && meta.onHide && typeof meta.win.removeEventListener === 'function') {
        meta.win.removeEventListener('pagehide', meta.onHide);
        meta.win.removeEventListener('unload', meta.onHide);
      }
      if (meta.fontCopySheet && Array.isArray(pipDoc.adoptedStyleSheets)) {
        pipDoc.adoptedStyleSheets = pipDoc.adoptedStyleSheets.filter(function (s) {
          return s !== meta.fontCopySheet;
        });
      }
      pipDocMeta.delete(pipDoc);
    }
    cleanRootCompletely(pipDoc);
    trackedPipDocuments.delete(pipDoc);
    pruneTrackedShadowRoots();
  }

  function activatePipDocument(pipDoc, pipWin) {
    if (!pipDoc || !isEffectivelyEnabled()) return;
    copyFontResourcesToPip(document, pipDoc);
    attachSheetToRoot(pipDoc, buildRulesCss(false));
    scanRootTree(pipDoc, true);
    var meta = pipDocMeta.get(pipDoc) || {};
    meta.win = pipWin || meta.win || pipDoc.defaultView;
    if (!meta.observer) {
      meta.observer = createDebouncedMutationObserver(pipDoc, null, handleMutationBatch);
    }
    pipDocMeta.set(pipDoc, meta);
  }

  function handlePipEnter(event) {
    if (!isAlive()) return;
    var pipWin = event && event.window;
    var pipDoc = pipWin && pipWin.document;
    if (!pipDoc || trackedPipDocuments.has(pipDoc)) return;
    trackedPipDocuments.add(pipDoc);

    var onHide = function () {
      cleanupPipDocument(pipDoc);
    };
    pipDocMeta.set(pipDoc, { win: pipWin, observer: null, fontCopySheet: null, onHide: onHide });
    if (pipWin && typeof pipWin.addEventListener === 'function') {
      pipWin.addEventListener('pagehide', onHide, { once: true });
      pipWin.addEventListener('unload', onHide, { once: true });
    }
    if (state.active) {
      activatePipDocument(pipDoc, pipWin);
    }
  }

  function registerPipEnterListener() {
    if (pipEnterBound) return;
    if (typeof window !== 'undefined' && window.documentPictureInPicture &&
        typeof window.documentPictureInPicture.addEventListener === 'function') {
      window.documentPictureInPicture.addEventListener('enter', handlePipEnter);
      pipEnterBound = true;
    }
  }

  function unregisterPipEnterListener() {
    if (!pipEnterBound) return;
    if (typeof window !== 'undefined' && window.documentPictureInPicture &&
        typeof window.documentPictureInPicture.removeEventListener === 'function') {
      window.documentPictureInPicture.removeEventListener('enter', handlePipEnter);
    }
    pipEnterBound = false;
  }

  function scheduleDebouncedFullRescan() {
    if (fontRescanTimer) {
      clearTimeout(fontRescanTimer);
    }
    fontRescanTimer = setTimeout(function () {
      fontRescanTimer = null;
      if (!isAlive() || !state.active) return;
      pendingFontDeadline = Date.now() + PENDING_FONT_TIMEOUT_MS;
      scanRootTree(document, true);
      trackedPipDocuments.forEach(function (pipDoc) {
        scanRootTree(pipDoc, true);
      });
    }, FONT_RESCAN_DEBOUNCE_MS);
  }

  function handleStylesheetOrFontLoaded(event) {
    if (!isAlive() || !state.active) return;
    ligatureRatioCache.clear();
    cachedBodyPrimary = null;
    if (pendingTimeoutTimer) {
      clearTimeout(pendingTimeoutTimer);
      pendingTimeoutTimer = null;
    }

    var isLoadingDone = Boolean(event && event.type === 'loadingdone');
    var loadedFaces = isLoadingDone && Array.isArray(event.fontfaces) ? event.fontfaces : null;

    if (pendingElements.size > 0) {
      var pendingBatch = Array.from(pendingElements);
      pendingElements.clear();
      pendingFontDeadline = Date.now() + PENDING_FONT_TIMEOUT_MS;
      classifyElementsGroupedByDoc(pendingBatch, true);
    }

    if (isLoadingDone && loadedFaces) {
      var cjkName = SHARED.CJK_FONT_FAMILY.toLowerCase();
      var latinName = SHARED.LATIN_FONT_FAMILY.toLowerCase();
      var hasNewFace = false;
      for (var i = 0; i < loadedFaces.length; i++) {
        var face = loadedFaces[i];
        if (!face || !face.family) continue;
        var clean = face.family.replace(/^["']|["']$/g, '').trim().toLowerCase();
        if (!clean || clean === '__fc_probe' || clean === cjkName || clean === latinName) {
          continue;
        }
        if (!seenLoadedFaces.has(face)) {
          seenLoadedFaces.add(face);
          hasNewFace = true;
        }
      }
      if (hasNewFace) {
        scheduleDebouncedFullRescan();
      }
      return;
    }

    pendingFontDeadline = Date.now() + PENDING_FONT_TIMEOUT_MS;
    scanRootTree(document, true);
    trackedPipDocuments.forEach(function (pipDoc) {
      scanRootTree(pipDoc, true);
    });
  }

  function attachActiveEnvironmentListeners() {
    if (activeListenersAttached) return;
    activeListenersAttached = true;
    if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.addEventListener === 'function') {
      document.fonts.addEventListener('loadingdone', handleStylesheetOrFontLoaded);
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('load', handleStylesheetOrFontLoaded);
    }
  }

  function detachActiveEnvironmentListeners() {
    if (!activeListenersAttached) return;
    activeListenersAttached = false;
    if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.removeEventListener === 'function') {
      document.fonts.removeEventListener('loadingdone', handleStylesheetOrFontLoaded);
    }
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('load', handleStylesheetOrFontLoaded);
    }
    if (domContentLoadedHandler && typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('DOMContentLoaded', domContentLoadedHandler);
      domContentLoadedHandler = null;
    }
  }

  function triggerLocalSlotProbesIfNeeded() {
    if (!isEffectivelyEnabled()) {
      return;
    }
    var effective = getEffectiveFontSettings();
    if (effective.fontMode !== SHARED.FONT_MODE_ADVANCED) {
      return;
    }
    var cfg = effective.advancedFontConfig;
    var tasks = [];
    if (cfg.cjkFont || cfg.cjkFontId) {
      tasks.push(SHARED.probeLocalFontSlots(cfg.cjkFont, cfg.cjkFontId, localFontSlotsCache));
    }
    if (cfg.latinFont || cfg.latinFontId) {
      tasks.push(SHARED.probeLocalFontSlots(cfg.latinFont, cfg.latinFontId, localFontSlotsCache));
    }
    if (!tasks.length) return;
    var seq = ++probeSeq;
    Promise.all(tasks).then(function () {
      if (!isAlive() || !state.active || seq !== probeSeq) return;
      var sig = computeStateSignature();
      if (sig !== state.appliedSignature) {
        state.appliedSignature = sig;
        syncActiveStyleSheets();
      }
    });
  }

  function performActivePass() {
    if (!isAlive() || !state.active) return;
    syncActiveStyleSheets();
    scanRootTree(document, true);
    if (!mainDocObserver && typeof document !== 'undefined') {
      mainDocObserver = createDebouncedMutationObserver(document, null, handleMutationBatch);
    }
    trackedPipDocuments.forEach(function (pipDoc) {
      activatePipDocument(pipDoc);
    });
    triggerLocalSlotProbesIfNeeded();
  }

  function deactivate() {
    state.active = false;
    state.appliedSignature = 'dormant';

    if (initialReadyTimer) {
      clearTimeout(initialReadyTimer);
      initialReadyTimer = null;
    }
    if (pendingTimeoutTimer) {
      clearTimeout(pendingTimeoutTimer);
      pendingTimeoutTimer = null;
    }
    if (fontRescanTimer) {
      clearTimeout(fontRescanTimer);
      fontRescanTimer = null;
    }
    if (deferredRescanTimer) {
      clearTimeout(deferredRescanTimer);
      deferredRescanTimer = null;
    }
    if (deferredRescanMaxWaitTimer) {
      clearTimeout(deferredRescanMaxWaitTimer);
      deferredRescanMaxWaitTimer = null;
    }
    pendingElements.clear();
    pendingDeferredRoots.clear();
    pendingFontDeadline = 0;
    seenLoadedFaces = new WeakSet();
    parsedUnicodeRangeCache.clear();

    detachActiveEnvironmentListeners();

    if (mainDocObserver) {
      mainDocObserver.disconnect();
      mainDocObserver = null;
    }

    trackedShadowRoots.forEach(function (ref) {
      var sr = ref.deref();
      if (!sr) return;
      var meta = shadowRootMeta.get(sr);
      if (meta && meta.observer) {
        meta.observer.disconnect();
        meta.observer = null;
      }
      cleanRootCompletely(sr);
    });

    trackedPipDocuments.forEach(function (pipDoc) {
      var meta = pipDocMeta.get(pipDoc);
      if (meta && meta.observer) {
        meta.observer.disconnect();
        meta.observer = null;
      }
      cleanRootCompletely(pipDoc);
    });

    if (typeof document !== 'undefined' && document) {
      cleanRootCompletely(document);
    }

    fontFamilyIndexMap.clear();
    indexedFontsList.length = 0;
    puaOnlyFontFamilies.clear();
    ligatureRatioCache.clear();
    cachedBodyPrimary = null;
  }

  function activate() {
    var nextSig = computeStateSignature();
    if (state.active && nextSig === state.appliedSignature) {
      return;
    }

    var wasActive = state.active;
    state.active = true;
    state.appliedSignature = nextSig;
    pendingFontDeadline = Date.now() + PENDING_FONT_TIMEOUT_MS;
    attachActiveEnvironmentListeners();

    if (!wasActive && typeof document !== 'undefined' && document.readyState === 'loading') {
      if (!initialReadyTimer) {
        var settled = false;
        var runOnce = function (fromDcl) {
          if (!isAlive() || !state.active) return;
          if (initialReadyTimer) {
            clearTimeout(initialReadyTimer);
            initialReadyTimer = null;
          }
          if (!settled) {
            settled = true;
            performActivePass();
          } else if (fromDcl) {
            scanRootTree(document, true);
          }
        };
        domContentLoadedHandler = function () {
          if (domContentLoadedHandler && typeof document.removeEventListener === 'function') {
            document.removeEventListener('DOMContentLoaded', domContentLoadedHandler);
            domContentLoadedHandler = null;
          }
          runOnce(true);
        };
        if (typeof document.addEventListener === 'function') {
          document.addEventListener('DOMContentLoaded', domContentLoadedHandler);
        }
        initialReadyTimer = setTimeout(function () {
          runOnce(false);
        }, INITIAL_HOLD_CAP_MS);
      }
      triggerLocalSlotProbesIfNeeded();
      return;
    }

    performActivePass();
  }

  function syncTopFrameOffBadge() {
    if (!IS_TOP_FRAME || !state.storageReady) return;
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id ||
        typeof chrome.runtime.sendMessage !== 'function') {
      return;
    }
    var disabled = computeEffectiveSiteDisabled();
    if (state.lastSyncedBadgeDisabled === disabled) return;
    state.lastSyncedBadgeDisabled = disabled;
    try {
      var res = chrome.runtime.sendMessage(
        { action: SHARED.MSG_ACTIONS.SYNC_TAB_BADGE, isSiteDisabled: disabled },
        function () {
          if (chrome.runtime) {
            void chrome.runtime.lastError;
          }
        }
      );
      if (res && typeof res.catch === 'function') {
        res.catch(function () {});
      }
    } catch (_e) {
      // Ignore runtime messaging failures when no background listener is active.
    }
  }

  function handlePageShow(event) {
    if (!isAlive() || !IS_TOP_FRAME) return;
    if (event && event.persisted) {
      state.lastSyncedBadgeDisabled = null;
      syncTopFrameOffBadge();
    }
  }

  function registerPageShowListener() {
    if (pageShowBound || !IS_TOP_FRAME) return;
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pageshow', handlePageShow);
      pageShowBound = true;
    }
  }

  function unregisterPageShowListener() {
    if (!pageShowBound) return;
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('pageshow', handlePageShow);
    }
    pageShowBound = false;
  }

  function syncStateMachine() {
    if (!isAlive()) return;
    if (isEffectivelyEnabled()) {
      activate();
    } else {
      deactivate();
    }
    syncTopFrameOffBadge();
  }

  function runTopFrameLegacyMigration() {
    if (IS_INCOGNITO || !IS_TOP_FRAME || !frameSiteInfo.ownHost) {
      return;
    }
    var legacyVal = null;
    try {
      legacyVal = window.localStorage && window.localStorage.getItem(SHARED.LEGACY_SITE_DISABLE_KEY);
    } catch (_e) {
      return;
    }
    if (legacyVal !== '1') {
      return;
    }

    var syncKey = SHARED.siteDisabledKey(frameSiteInfo.ownHost);
    if (state.syncDisabledMap[syncKey]) {
      try {
        window.localStorage.removeItem(SHARED.LEGACY_SITE_DISABLE_KEY);
      } catch (_e) {}
      return;
    }

    state.migratingDisabledHost = true;
    var payload = {};
    payload[syncKey] = 1;
    chrome.storage.sync.set(payload, function () {
      if (!isAlive()) return;
      if (!chrome.runtime.lastError) {
        state.syncDisabledMap[syncKey] = 1;
        state.migratingDisabledHost = false;
        try {
          window.localStorage.removeItem(SHARED.LEGACY_SITE_DISABLE_KEY);
        } catch (_e) {}
      }
      syncStateMachine();
    });
  }

  function buildRelevantSyncKeys() {
    var keys = [
      SHARED.STORAGE_KEYS.SELECTED_FONT,
      SHARED.STORAGE_KEYS.IS_ENABLED,
      SHARED.STORAGE_KEYS.FONT_MODE,
      SHARED.STORAGE_KEYS.ADVANCED_FONT_CONFIG,
    ];
    for (var i = 0; i < frameSiteInfo.keys.length; i++) {
      keys.push(SHARED.siteDisabledKey(frameSiteInfo.keys[i]));
      keys.push(SHARED.siteFontKey(frameSiteInfo.keys[i]));
    }
    return keys;
  }

  function applyStorageSnapshot(items) {
    var src = items || {};
    state.selectedFont = typeof src[SHARED.STORAGE_KEYS.SELECTED_FONT] === 'string'
      ? src[SHARED.STORAGE_KEYS.SELECTED_FONT]
      : '';
    state.isEnabled = Boolean(src[SHARED.STORAGE_KEYS.IS_ENABLED]);
    state.fontMode = SHARED.normalizeFontMode(src[SHARED.STORAGE_KEYS.FONT_MODE]);
    state.advancedFontConfig = SHARED.createAdvancedFontConfig(src[SHARED.STORAGE_KEYS.ADVANCED_FONT_CONFIG]);
    state.syncDisabledMap = Object.create(null);
    state.siteFontMap = Object.create(null);
    for (var i = 0; i < frameSiteInfo.keys.length; i++) {
      var host = frameSiteInfo.keys[i];
      var k = SHARED.siteDisabledKey(host);
      if (src[k]) {
        state.syncDisabledMap[k] = 1;
      }
      var fk = SHARED.siteFontKey(host);
      if (src[fk] && !SHARED.isSiteFontRuleEmpty(src[fk])) {
        state.siteFontMap[fk] = SHARED.createSiteFontRule(src[fk]);
      }
    }
  }

  function handleStorageChanged(changes, areaName) {
    if (!isAlive() || areaName !== 'sync' || !changes) return;

    var relevant = false;
    var globalKeys = [
      SHARED.STORAGE_KEYS.SELECTED_FONT,
      SHARED.STORAGE_KEYS.IS_ENABLED,
      SHARED.STORAGE_KEYS.FONT_MODE,
      SHARED.STORAGE_KEYS.ADVANCED_FONT_CONFIG,
    ];
    for (var i = 0; i < globalKeys.length; i++) {
      if (Object.prototype.hasOwnProperty.call(changes, globalKeys[i])) {
        relevant = true;
        break;
      }
    }

    var siteKeySet = new Set();
    var siteFontKeySet = new Set();
    for (var j = 0; j < frameSiteInfo.keys.length; j++) {
      var host = frameSiteInfo.keys[j];
      var sk = SHARED.siteDisabledKey(host);
      siteKeySet.add(sk);
      if (Object.prototype.hasOwnProperty.call(changes, sk)) {
        relevant = true;
      }
      var fk = SHARED.siteFontKey(host);
      siteFontKeySet.add(fk);
      if (Object.prototype.hasOwnProperty.call(changes, fk)) {
        relevant = true;
      }
    }

    if (!relevant) return;

    if (changes[SHARED.STORAGE_KEYS.SELECTED_FONT]) {
      var nextFont = changes[SHARED.STORAGE_KEYS.SELECTED_FONT].newValue;
      state.selectedFont = typeof nextFont === 'string' ? nextFont : '';
    }
    if (changes[SHARED.STORAGE_KEYS.IS_ENABLED]) {
      state.isEnabled = Boolean(changes[SHARED.STORAGE_KEYS.IS_ENABLED].newValue);
    }
    if (changes[SHARED.STORAGE_KEYS.FONT_MODE]) {
      state.fontMode = SHARED.normalizeFontMode(changes[SHARED.STORAGE_KEYS.FONT_MODE].newValue);
    }
    if (changes[SHARED.STORAGE_KEYS.ADVANCED_FONT_CONFIG]) {
      state.advancedFontConfig = SHARED.createAdvancedFontConfig(
        changes[SHARED.STORAGE_KEYS.ADVANCED_FONT_CONFIG].newValue
      );
    }

    siteKeySet.forEach(function (skKey) {
      if (changes[skKey]) {
        if (changes[skKey].newValue) {
          state.syncDisabledMap[skKey] = 1;
          state.migratingDisabledHost = false;
        } else {
          delete state.syncDisabledMap[skKey];
        }
      }
    });

    siteFontKeySet.forEach(function (fkKey) {
      if (changes[fkKey]) {
        var nextRule = changes[fkKey].newValue;
        if (nextRule && !SHARED.isSiteFontRuleEmpty(nextRule)) {
          state.siteFontMap[fkKey] = SHARED.createSiteFontRule(nextRule);
        } else {
          delete state.siteFontMap[fkKey];
        }
      }
    });

    syncStateMachine();
  }

  function handleRuntimeMessage(request, _sender, sendResponse) {
    if (!isAlive() || !request || typeof request.action !== 'string') {
      return undefined;
    }

    if (request.action === SHARED.MSG_ACTIONS.GET_PAGE_STATE) {
      var topKey = frameSiteInfo.topHost || frameSiteInfo.ownHost;
      var hasTopOverride = Boolean(topKey && Object.prototype.hasOwnProperty.call(state.tabIncognitoSiteFonts, topKey));
      sendResponse({
        ok: true,
        hasFontChanger: true,
        ownHost: frameSiteInfo.ownHost,
        topHost: frameSiteInfo.topHost,
        frameHosts: frameSiteInfo.keys.slice(),
        tabIncognitoOverride: state.tabIncognitoOverride,
        tabIncognitoSiteFontOverride: hasTopOverride ? state.tabIncognitoSiteFonts[topKey] : null,
        hasTabIncognitoSiteFontOverride: hasTopOverride,
        activeSiteFontRule: resolveActiveSiteFontRule(),
        isSiteDisabled: computeEffectiveSiteDisabled(),
        isIncognito: IS_INCOGNITO,
        isActive: state.active,
      });
      return undefined;
    }

    if (request.action === SHARED.MSG_ACTIONS.SET_TAB_SITE_DISABLED) {
      var rawFlag = request.isDisabled !== undefined ? request.isDisabled : request.disabled;
      state.tabIncognitoOverride = typeof rawFlag === 'boolean' ? rawFlag : null;
      syncStateMachine();
      sendResponse({
        ok: true,
        isSiteDisabled: computeEffectiveSiteDisabled(),
      });
      return undefined;
    }

    if (request.action === SHARED.MSG_ACTIONS.SET_TAB_SITE_FONT) {
      var targetHost = typeof request.host === 'string' && request.host
        ? request.host
        : (frameSiteInfo.topHost || frameSiteInfo.ownHost);
      if (targetHost) {
        if (request.clearToInherit) {
          delete state.tabIncognitoSiteFonts[targetHost];
        } else if (request.rule === null || (request.rule && SHARED.isSiteFontRuleEmpty(request.rule))) {
          state.tabIncognitoSiteFonts[targetHost] = null;
        } else if (request.rule && typeof request.rule === 'object') {
          state.tabIncognitoSiteFonts[targetHost] = SHARED.createSiteFontRule(request.rule);
        } else {
          delete state.tabIncognitoSiteFonts[targetHost];
        }
      }
      syncStateMachine();
      sendResponse({
        ok: true,
        activeSiteFontRule: resolveActiveSiteFontRule(),
      });
      return undefined;
    }

    if (request.action === SHARED.MSG_ACTIONS.CLEAR_LEGACY_SITE_DISABLE) {
      if (!IS_INCOGNITO) {
        state.migratingDisabledHost = false;
        try {
          if (window.localStorage) {
            window.localStorage.removeItem(SHARED.LEGACY_SITE_DISABLE_KEY);
          }
        } catch (_e) {
          // Ignore opaque origin localStorage errors.
        }
        syncStateMachine();
      }
      sendResponse({ ok: true });
      return undefined;
    }

    return undefined;
  }

  function cleanupLegacyOnBoot() {
    if (typeof document !== 'undefined' && document) {
      removeLegacyStylesFromRoot(document);
      stripFontChangerAttrsFromRoot(document);
    }
  }

  function destroy() {
    if (state.disposed) return;
    state.disposed = true;
    deactivate();
    unregisterPipEnterListener();
    unregisterPageShowListener();

    trackedPipDocuments.forEach(function (pipDoc) {
      cleanupPipDocument(pipDoc);
    });
    trackedPipDocuments.clear();
    trackedShadowRoots.clear();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged &&
        typeof chrome.storage.onChanged.removeListener === 'function') {
      chrome.storage.onChanged.removeListener(handleStorageChanged);
    }
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage &&
        typeof chrome.runtime.onMessage.removeListener === 'function') {
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage);
    }

    if (global[CONTROLLER_KEY] === controllerApi) {
      delete global[CONTROLLER_KEY];
    }
  }

  var controllerApi = {
    destroy: destroy,
    applyFont: function () {
      if (isAlive()) activate();
    },
    applyFontSettings: function (settings) {
      if (!isAlive()) return;
      applyStorageSnapshot(settings);
      state.storageReady = true;
      syncStateMachine();
    },
    restoreOriginalFont: function () {
      if (isAlive()) deactivate();
    },
    buildCss: function (isShadow) {
      return buildRulesCss(Boolean(isShadow));
    },
    classifyElement: function (el, targetDoc, allowPending) {
      return classifyElementsBatch([el], targetDoc || document, allowPending !== false);
    },
    getState: function () {
      var effective = getEffectiveFontSettings();
      return {
        disposed: state.disposed,
        active: state.active,
        storageReady: state.storageReady,
        isEnabled: state.isEnabled,
        fontMode: effective.fontMode,
        selectedFont: effective.selectedFont,
        advancedFontConfig: SHARED.createAdvancedFontConfig(effective.advancedFontConfig),
        activeSiteFontRule: resolveActiveSiteFontRule(),
        isSiteDisabled: computeEffectiveSiteDisabled(),
        tabIncognitoOverride: state.tabIncognitoOverride,
        frameKeys: frameSiteInfo.keys.slice(),
        indexedFontsCount: indexedFontsList.length,
        trackedShadowCount: trackedShadowRoots.size,
        trackedPipCount: trackedPipDocuments.size,
      };
    },
  };

  global[CONTROLLER_KEY] = controllerApi;

  cleanupLegacyOnBoot();
  registerPipEnterListener();
  registerPageShowListener();

  if (chrome.storage && chrome.storage.onChanged &&
      typeof chrome.storage.onChanged.addListener === 'function') {
    chrome.storage.onChanged.addListener(handleStorageChanged);
  }
  if (chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  }

  function applyIncognitoTabStateSnapshot(incState) {
    if (!incState || typeof incState !== 'object') return;
    if (typeof incState.disabled === 'boolean' || incState.disabled === null) {
      if (incState.disabled !== null) {
        state.tabIncognitoOverride = incState.disabled;
      }
    }
    if (incState.siteFonts && typeof incState.siteFonts === 'object') {
      var hosts = Object.keys(incState.siteFonts);
      for (var i = 0; i < hosts.length; i++) {
        var h = hosts[i];
        var val = incState.siteFonts[h];
        state.tabIncognitoSiteFonts[h] = val && !SHARED.isSiteFontRuleEmpty(val)
          ? SHARED.createSiteFontRule(val)
          : null;
      }
    }
  }

  if (chrome.storage && chrome.storage.sync && typeof chrome.storage.sync.get === 'function') {
    chrome.storage.sync.get(buildRelevantSyncKeys(), function (items) {
      if (!isAlive()) return;
      applyStorageSnapshot(items);
      runTopFrameLegacyMigration();
      state.storageReady = true;
      syncStateMachine();

      if (IS_INCOGNITO && typeof chrome.runtime.sendMessage === 'function') {
        try {
          var incRes = chrome.runtime.sendMessage(
            { action: SHARED.MSG_ACTIONS.GET_TAB_INCOGNITO_STATE },
            function (resp) {
              if (!isAlive()) return;
              if (chrome.runtime && chrome.runtime.lastError) return;
              if (resp && resp.state) {
                applyIncognitoTabStateSnapshot(resp.state);
                syncStateMachine();
              }
            }
          );
          if (incRes && typeof incRes.catch === 'function') incRes.catch(function () {});
        } catch (_e) {
          // Ignore messaging errors when background is absent in tests.
        }
      }
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
