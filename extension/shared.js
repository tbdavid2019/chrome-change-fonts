(function (global) {
  'use strict';

  var FALLBACK_STACK = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  var FONT_MODE_BASIC = 'basic';
  var FONT_MODE_ADVANCED = 'advanced';

  var STORAGE_KEYS = Object.freeze({
    SELECTED_FONT: 'selectedFont',
    IS_ENABLED: 'isEnabled',
    FONT_MODE: 'fontMode',
    ADVANCED_FONT_CONFIG: 'advancedFontConfig',
    UI_LANGUAGE: 'uiLanguage',
  });

  var LEGACY_SITE_DISABLE_KEY = 'fontChangerDisabled';
  var SITE_DISABLED_PREFIX = 'siteDisabled:';
  var MAX_SYNC_ITEMS = 512;
  var CORE_SYNC_RESERVE = 10;

  var CJK_FONT_FAMILY = 'FontChangerCjk';
  var LATIN_FONT_FAMILY = 'FontChangerLatin';
  var PREVIEW_CJK_FONT_FAMILY = 'PopupFontChangerCjk';
  var PREVIEW_LATIN_FONT_FAMILY = 'PopupFontChangerLatin';

  var LEGACY_DOM_ATTRS = Object.freeze([
    'data-font-changer-exclude',
    'data-font-changer-ligature-icon',
    'data-font-changer-google-logo',
  ]);
  var LEGACY_STYLE_SELECTOR = 'style.font-changer-style';

  var ACTIVE_DOM_ATTRS = Object.freeze({
    ICON_FONT: 'data-fc-icon-font',
    ICON_BEFORE: 'data-fc-icon-before',
    ICON_AFTER: 'data-fc-icon-after',
    ICON_LIGATURE: 'data-fc-icon-ligature',
    ICON_BEFORE_LIG: 'data-fc-icon-before-lig',
    ICON_AFTER_LIG: 'data-fc-icon-after-lig',
    PENDING: 'data-fc-pending',
  });

  var MSG_ACTIONS = Object.freeze({
    GET_PAGE_STATE: 'getPageState',
    SET_TAB_SITE_DISABLED: 'setTabSiteDisabled',
    CLEAR_LEGACY_SITE_DISABLE: 'clearLegacySiteDisable',
  });

  // Only match the three Unicode Private Use Area blocks.
  var PUA_REGEX = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u;

  // Covers CJK punctuation, Hangul (Jamo, Compat, Syllables), Kana, Bopomofo,
  // CJK unified Han + extensions, compatibility forms, and fullwidth punctuation.
  // Keeps ASCII and fullwidth Latin letters/digits (FF10-FF19, FF21-FF3A, FF41-FF5A) non-CJK.
  var CJK_UNICODE_RANGE =
    'U+1100-11FF, U+3000-303F, U+3040-309F, U+30A0-30FF, U+3100-312F, ' +
    'U+3130-318F, U+31A0-31BF, U+31F0-31FF, U+3400-4DBF, U+4E00-9FFF, ' +
    'U+AC00-D7AF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FF0F, U+FF1A-FF20, ' +
    'U+FF3B-FF40, U+FF5B-FFEF, U+20000-2A6DF, U+2A700-2B73F, ' +
    'U+2B740-2B81F, U+2B820-2CEAF, U+2CEB0-2EBEF, U+2F800-2FA1F';

  var ICON_FONT_NAME_REGEX =
    /icon|symbol|glyph|awesome|mdl2|fabric|fluent|codicon|icomoon|dingbat|wingding|webding|fontello|themify|slick|videojs|devsite|dpvwyc|octicon|entypo|lucide|feather|tabler|remixicon|boxicon|ionicon|typicon|dashicon/i;

  var GENERIC_FONT_FAMILIES = new Set([
    'serif',
    'sans-serif',
    'monospace',
    'cursive',
    'fantasy',
    'system-ui',
    'ui-serif',
    'ui-sans-serif',
    'ui-monospace',
    'ui-rounded',
    'emoji',
    'math',
    'fangsong',
  ]);

  function normalizeFontMode(mode) {
    return mode === FONT_MODE_ADVANCED ? FONT_MODE_ADVANCED : FONT_MODE_BASIC;
  }

  function createAdvancedFontConfig(config) {
    return {
      cjkFont: config && typeof config.cjkFont === 'string' ? config.cjkFont : '',
      cjkFontId: config && typeof config.cjkFontId === 'string' ? config.cjkFontId : '',
      latinFont: config && typeof config.latinFont === 'string' ? config.latinFont : '',
      latinFontId: config && typeof config.latinFontId === 'string' ? config.latinFontId : '',
    };
  }

  function siteDisabledKey(siteKey) {
    return SITE_DISABLED_PREFIX + siteKey;
  }

  function parseUnicodeRangeString(rangeStr) {
    if (!rangeStr || typeof rangeStr !== 'string') return [];
    var parsed = [];
    var parts = rangeStr.split(',');
    for (var i = 0; i < parts.length; i++) {
      var token = parts[i].trim();
      if (!token) continue;
      if (/^u\+/i.test(token)) {
        token = token.slice(2);
      }
      if (token.indexOf('?') !== -1) {
        var low = parseInt(token.replace(/\?/g, '0'), 16);
        var high = parseInt(token.replace(/\?/g, 'F'), 16);
        if (!Number.isNaN(low) && !Number.isNaN(high) && low <= high) {
          parsed.push([low, high]);
        }
        continue;
      }
      var bounds = token.split('-');
      var start = parseInt(bounds[0], 16);
      var end = bounds.length > 1 ? parseInt(bounds[1], 16) : start;
      if (!Number.isNaN(start) && !Number.isNaN(end) && start <= end) {
        parsed.push([start, end]);
      }
    }
    return parsed;
  }

  function mergeUnicodeIntervals(intervals) {
    if (!intervals.length) return [];
    var sorted = intervals.slice().sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1];
    });
    var merged = [sorted[0].slice()];
    for (var i = 1; i < sorted.length; i++) {
      var prev = merged[merged.length - 1];
      var curr = sorted[i];
      if (curr[0] <= prev[1] + 1) {
        if (curr[1] > prev[1]) prev[1] = curr[1];
      } else {
        merged.push(curr.slice());
      }
    }
    return merged;
  }

  function buildNonCjkUnicodeRange(cjkRange) {
    var source = typeof cjkRange === 'string' ? cjkRange : CJK_UNICODE_RANGE;
    var merged = mergeUnicodeIntervals(parseUnicodeRangeString(source));
    var complement = [];
    var next = 0;
    for (var i = 0; i < merged.length; i++) {
      var start = merged[i][0];
      var end = merged[i][1];
      if (next < start) {
        complement.push('U+' + next.toString(16).toUpperCase() + '-' + (start - 1).toString(16).toUpperCase());
      }
      if (end + 1 > next) {
        next = end + 1;
      }
    }
    if (next <= 0x10FFFF) {
      complement.push('U+' + next.toString(16).toUpperCase() + '-10FFFF');
    }
    return complement.join(', ');
  }

  function isPurePuaUnicodeRange(unicodeRange) {
    var ranges = parseUnicodeRangeString(unicodeRange);
    if (!ranges.length) return false;
    for (var i = 0; i < ranges.length; i++) {
      var start = ranges[i][0];
      var end = ranges[i][1];
      var inBmpPua = start >= 0xE000 && end <= 0xF8FF;
      var inPlane15 = start >= 0xF0000 && end <= 0xFFFFD;
      var inPlane16 = start >= 0x100000 && end <= 0x10FFFD;
      if (!inBmpPua && !inPlane15 && !inPlane16) {
        return false;
      }
    }
    return true;
  }

  function isRestrictedUrl(url) {
    if (!url || typeof url !== 'string') return true;
    var parsed;
    try {
      parsed = new URL(url);
    } catch (_e) {
      return true;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return true;
    }
    var hostname = parsed.hostname.toLowerCase();
    if (hostname === 'chromewebstore.google.com') {
      return true;
    }
    if (hostname === 'chrome.google.com' && /^\/webstore(?:\/|$)/i.test(parsed.pathname)) {
      return true;
    }
    return false;
  }

  function normalizeSiteKey(urlOrOrigin) {
    if (!urlOrOrigin || typeof urlOrOrigin !== 'string') return null;
    var trimmed = urlOrOrigin.trim();
    if (!trimmed || trimmed === 'null') return null;
    if (isRestrictedUrl(trimmed)) return null;
    try {
      var parsed = new URL(trimmed);
      var host = parsed.host.toLowerCase();
      return host || null;
    } catch (_e) {
      return null;
    }
  }

  function resolveFrameSiteKeys(locationObj, ancestorOriginsList, referrerStr, topLocationSafeHost) {
    var keys = [];
    var seen = new Set();

    function addKey(candidate) {
      var normalized = normalizeSiteKey(candidate);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        keys.push(normalized);
      }
      return normalized;
    }

    var ownCandidate = '';
    if (locationObj && typeof locationObj === 'object') {
      var href = typeof locationObj.href === 'string' ? locationObj.href : '';
      var isSpecialBlank = /^about:(?:blank|srcdoc)(?:$|[?#])/i.test(href);
      ownCandidate = isSpecialBlank
        ? (typeof locationObj.origin === 'string' ? locationObj.origin : '')
        : (href || (typeof locationObj.origin === 'string' ? locationObj.origin : ''));
    }
    var ownHost = addKey(ownCandidate);

    var topHost = null;
    if (topLocationSafeHost) {
      var candidateUrl = /^https?:\/\//i.test(topLocationSafeHost)
        ? topLocationSafeHost
        : 'https://' + topLocationSafeHost;
      topHost = addKey(candidateUrl);
    }

    var ancestors = [];
    if (ancestorOriginsList && typeof ancestorOriginsList.length === 'number') {
      for (var i = 0; i < ancestorOriginsList.length; i++) {
        var norm = addKey(ancestorOriginsList[i]);
        if (norm) ancestors.push(norm);
      }
    }

    if (!topHost && ancestors.length > 0) {
      topHost = ancestors[ancestors.length - 1];
    }

    if (ancestors.length === 0 && !topHost && referrerStr) {
      topHost = addKey(referrerStr);
    }

    if (!topHost) {
      topHost = ownHost;
    }

    return {
      ownHost: ownHost,
      topHost: topHost,
      keys: keys,
    };
  }

  function buildLocalFontCandidates(displayName, fontId) {
    var baseNames = [];
    [displayName, fontId].forEach(function (name) {
      if (typeof name === 'string') {
        var trimmed = name.trim();
        if (trimmed && baseNames.indexOf(trimmed) === -1) {
          baseNames.push(trimmed);
        }
      }
    });

    var regular = [];
    var bold = [];
    var italic = [];
    var boldItalic = [];

    function pushUnique(arr, value) {
      if (typeof value === 'string') {
        var trimmed = value.trim();
        if (trimmed && arr.indexOf(trimmed) === -1) {
          arr.push(trimmed);
        }
      }
    }

    function appendFamilyVariants(prefix) {
      pushUnique(regular, prefix);
      [' Regular', '-Regular', ' Medium', '-Medium', ' Light', '-Light'].forEach(function (s) {
        pushUnique(regular, prefix + s);
      });
      var compact = prefix.replace(/[\s_]+/g, '');
      if (compact) {
        pushUnique(regular, compact);
        ['-Regular', '-Medium', '-Light', 'Regular-Regular', 'Regular-Medium'].forEach(function (s) {
          pushUnique(regular, compact + s);
        });
      }

      [
        ' Bold', '-Bold', '-BoldMT',
        ' SemiBold', '-SemiBold', '-Semibold',
        ' DemiBold', '-DemiBold',
      ].forEach(function (s) {
        pushUnique(bold, prefix + s);
      });
      if (compact) {
        ['-Bold', '-BoldMT', '-SemiBold', '-Semibold', '-DemiBold'].forEach(function (s) {
          pushUnique(bold, compact + s);
        });
      }

      [' Italic', '-Italic', '-ItalicMT', ' Oblique', '-Oblique'].forEach(function (s) {
        pushUnique(italic, prefix + s);
      });
      if (compact) {
        ['-Italic', '-ItalicMT', '-Oblique'].forEach(function (s) {
          pushUnique(italic, compact + s);
        });
      }

      [
        ' Bold Italic', '-BoldItalic', '-BoldItalicMT',
        ' Bold Oblique', '-BoldOblique',
      ].forEach(function (s) {
        pushUnique(boldItalic, prefix + s);
      });
      if (compact) {
        ['-BoldItalic', '-BoldItalicMT', '-BoldOblique'].forEach(function (s) {
          pushUnique(boldItalic, compact + s);
        });
      }
    }

    baseNames.forEach(function (base) {
      appendFamilyVariants(base);
      // Extract leading ASCII prefix only when the font name begins with >=3 ASCII chars
      // (preserves mixed CJK PostScript names like "777jf金萱" -> "777jf-Medium" without mangling "思源黑體 TW").
      var leadingMatch = /^([A-Za-z0-9][A-Za-z0-9._-]{2,})/.exec(base);
      if (leadingMatch && leadingMatch[1] !== base) {
        appendFamilyVariants(leadingMatch[1]);
      }
    });

    return {
      regular: regular,
      bold: bold,
      italic: italic,
      boldItalic: boldItalic,
    };
  }

  function formatLocalSrcList(candidates) {
    return candidates
      .map(function (name) {
        return 'local(' + JSON.stringify(name) + ')';
      })
      .join(', ');
  }

  function probeSlotFontFace(candidates, descriptors) {
    if (!candidates.length || typeof FontFace !== 'function') {
      return Promise.resolve(false);
    }
    try {
      var face = new FontFace('__fc_probe', formatLocalSrcList(candidates), descriptors);
      return Promise.resolve(face.load())
        .then(function () {
          return true;
        })
        .catch(function () {
          return false;
        });
    } catch (_e) {
      return Promise.resolve(false);
    }
  }

  function probeLocalFontSlots(displayName, fontId, cacheMap) {
    var key = String(displayName || '') + '\0' + String(fontId || '');
    if (cacheMap && cacheMap.has(key)) {
      return Promise.resolve(cacheMap.get(key));
    }
    if (typeof FontFace !== 'function' || (!displayName && !fontId)) {
      var empty = { bold: false, italic: false, boldItalic: false };
      if (cacheMap && (displayName || fontId)) cacheMap.set(key, empty);
      return Promise.resolve(empty);
    }

    var candidates = buildLocalFontCandidates(displayName, fontId);
    return Promise.all([
      probeSlotFontFace(candidates.bold, { weight: '700', style: 'normal' }),
      probeSlotFontFace(candidates.italic, { weight: 'normal', style: 'italic' }),
      probeSlotFontFace(candidates.boldItalic, { weight: '700', style: 'italic' }),
    ]).then(function (results) {
      var slots = {
        bold: Boolean(results[0]),
        italic: Boolean(results[1]),
        boldItalic: Boolean(results[2]),
      };
      if (cacheMap) {
        cacheMap.set(key, slots);
      }
      return slots;
    });
  }

  function buildRestrictedFontFaceSetCss(familyName, displayName, fontId, unicodeRange, resolvedSlots) {
    var candidates = buildLocalFontCandidates(displayName, fontId);
    if (!candidates.regular.length) return '';

    var rules = [
      '\n    @font-face {\n' +
      '      font-family: ' + JSON.stringify(familyName) + ';\n' +
      '      src: ' + formatLocalSrcList(candidates.regular) + ';\n' +
      '      unicode-range: ' + unicodeRange + ';\n' +
      '      font-weight: auto;\n' +
      '      font-style: auto;\n' +
      '      font-display: swap;\n' +
      '    }',
    ];

    if (resolvedSlots && resolvedSlots.bold && candidates.bold.length) {
      rules.push(
        '\n    @font-face {\n' +
        '      font-family: ' + JSON.stringify(familyName) + ';\n' +
        '      src: ' + formatLocalSrcList(candidates.bold) + ';\n' +
        '      unicode-range: ' + unicodeRange + ';\n' +
        '      font-weight: 700;\n' +
        '      font-style: normal;\n' +
        '      font-display: swap;\n' +
        '    }'
      );
    }

    if (resolvedSlots && resolvedSlots.italic && candidates.italic.length) {
      rules.push(
        '\n    @font-face {\n' +
        '      font-family: ' + JSON.stringify(familyName) + ';\n' +
        '      src: ' + formatLocalSrcList(candidates.italic) + ';\n' +
        '      unicode-range: ' + unicodeRange + ';\n' +
        '      font-weight: auto;\n' +
        '      font-style: italic;\n' +
        '      font-display: swap;\n' +
        '    }'
      );
    }

    if (resolvedSlots && resolvedSlots.boldItalic && candidates.boldItalic.length) {
      rules.push(
        '\n    @font-face {\n' +
        '      font-family: ' + JSON.stringify(familyName) + ';\n' +
        '      src: ' + formatLocalSrcList(candidates.boldItalic) + ';\n' +
        '      unicode-range: ' + unicodeRange + ';\n' +
        '      font-weight: 700;\n' +
        '      font-style: italic;\n' +
        '      font-display: swap;\n' +
        '    }'
      );
    }

    return rules.join('');
  }

  function pushFontFamily(stack, fontFamily) {
    if (typeof fontFamily !== 'string' || !fontFamily) return;
    var quoted = JSON.stringify(fontFamily);
    if (stack.indexOf(quoted) === -1) {
      stack.push(quoted);
    }
  }

  function getFontStack(mode, basicFont, advancedConfig, cjkFamily, latinFamily) {
    var normalizedMode = normalizeFontMode(mode);
    if (normalizedMode === FONT_MODE_ADVANCED) {
      var cfg = createAdvancedFontConfig(advancedConfig);
      var stack = [];
      if (cfg.cjkFont || cfg.cjkFontId) {
        pushFontFamily(stack, cjkFamily || CJK_FONT_FAMILY);
      }
      if (cfg.latinFont || cfg.latinFontId) {
        pushFontFamily(stack, latinFamily || LATIN_FONT_FAMILY);
      }
      stack.push(FALLBACK_STACK);
      return stack.join(', ');
    }
    if (!basicFont) return FALLBACK_STACK;
    return JSON.stringify(basicFont) + ', ' + FALLBACK_STACK;
  }

  function parseFontFamilyList(fontFamilyCss) {
    if (!fontFamilyCss || typeof fontFamilyCss !== 'string') return [];
    var tokens = [];
    var current = '';
    var quote = null;
    for (var i = 0; i < fontFamilyCss.length; i++) {
      var ch = fontFamilyCss[i];
      if (quote) {
        if (ch === '\\' && i + 1 < fontFamilyCss.length) {
          current += fontFamilyCss[++i];
          continue;
        }
        if (ch === quote) {
          quote = null;
        } else {
          current += ch;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === ',') {
        var trimmed = current.trim();
        if (trimmed) tokens.push(trimmed);
        current = '';
        continue;
      }
      current += ch;
    }
    var last = current.trim();
    if (last) tokens.push(last);
    return tokens;
  }

  function serializeFontFamilyList(fontFamilyCss) {
    var families = parseFontFamilyList(fontFamilyCss);
    if (!families.length) return FALLBACK_STACK;
    return families
      .map(function (name) {
        return GENERIC_FONT_FAMILIES.has(name.toLowerCase()) ? name.toLowerCase() : JSON.stringify(name);
      })
      .join(', ');
  }

  function normalizeLigatureText(text) {
    return String(text || '')
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
      .trim()
      .toLowerCase();
  }

  var api = Object.freeze({
    FALLBACK_STACK: FALLBACK_STACK,
    FONT_MODE_BASIC: FONT_MODE_BASIC,
    FONT_MODE_ADVANCED: FONT_MODE_ADVANCED,
    STORAGE_KEYS: STORAGE_KEYS,
    LEGACY_SITE_DISABLE_KEY: LEGACY_SITE_DISABLE_KEY,
    SITE_DISABLED_PREFIX: SITE_DISABLED_PREFIX,
    MAX_SYNC_ITEMS: MAX_SYNC_ITEMS,
    CORE_SYNC_RESERVE: CORE_SYNC_RESERVE,
    CJK_FONT_FAMILY: CJK_FONT_FAMILY,
    LATIN_FONT_FAMILY: LATIN_FONT_FAMILY,
    PREVIEW_CJK_FONT_FAMILY: PREVIEW_CJK_FONT_FAMILY,
    PREVIEW_LATIN_FONT_FAMILY: PREVIEW_LATIN_FONT_FAMILY,
    LEGACY_DOM_ATTRS: LEGACY_DOM_ATTRS,
    LEGACY_STYLE_SELECTOR: LEGACY_STYLE_SELECTOR,
    ACTIVE_DOM_ATTRS: ACTIVE_DOM_ATTRS,
    MSG_ACTIONS: MSG_ACTIONS,
    PUA_REGEX: PUA_REGEX,
    CJK_UNICODE_RANGE: CJK_UNICODE_RANGE,
    ICON_FONT_NAME_REGEX: ICON_FONT_NAME_REGEX,
    normalizeFontMode: normalizeFontMode,
    createAdvancedFontConfig: createAdvancedFontConfig,
    siteDisabledKey: siteDisabledKey,
    parseUnicodeRangeString: parseUnicodeRangeString,
    buildNonCjkUnicodeRange: buildNonCjkUnicodeRange,
    isPurePuaUnicodeRange: isPurePuaUnicodeRange,
    isRestrictedUrl: isRestrictedUrl,
    normalizeSiteKey: normalizeSiteKey,
    resolveFrameSiteKeys: resolveFrameSiteKeys,
    buildLocalFontCandidates: buildLocalFontCandidates,
    probeLocalFontSlots: probeLocalFontSlots,
    buildRestrictedFontFaceSetCss: buildRestrictedFontFaceSetCss,
    getFontStack: getFontStack,
    parseFontFamilyList: parseFontFamilyList,
    serializeFontFamilyList: serializeFontFamilyList,
    normalizeLigatureText: normalizeLigatureText,
  });

  global.FontChangerShared = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
