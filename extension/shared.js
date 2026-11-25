(function (global) {
  'use strict';

  var FALLBACK_STACK = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  var FONT_MODE_BASIC = 'basic';
  var FONT_MODE_ADVANCED = 'advanced';

  var STORAGE_KEYS = Object.freeze({
    SELECTED_FONT: 'selectedFont',
    SELECTED_FONT_ID: 'selectedFontId',
    CLOUD_FONT_WEIGHT: 'cloudFontWeight',
    IS_ENABLED: 'isEnabled',
    FONT_MODE: 'fontMode',
    ADVANCED_FONT_CONFIG: 'advancedFontConfig',
    UI_LANGUAGE: 'uiLanguage',
  });

  var CLOUD_GOOGLE_FONT_PREFIX = 'gf:';
  var CLOUD_GOOGLE_FONT_ATTR = 'data-fc-cdn-font';
  var CLOUD_FONT_WEIGHT_AUTO = 'auto';
  var CLOUD_FONT_WEIGHT_VALUES = Object.freeze(['300', '400', '500', '600', '700']);
  var FULL_CLOUD_WEIGHTS = Object.freeze(['300', '400', '500', '600', '700']);
  var BASIC_CLOUD_WEIGHTS = Object.freeze(['400', '700']);

  var CLOUD_GOOGLE_FONTS = Object.freeze([
    Object.freeze({
      id: 'gf:jetbrains-mono',
      family: 'JetBrains Mono',
      weights: FULL_CLOUD_WEIGHTS,
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600;700&display=swap',
    }),
    Object.freeze({
      id: 'gf:fira-code',
      family: 'Fira Code',
      weights: FULL_CLOUD_WEIGHTS,
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@300;400;500;600;700&display=swap',
    }),
    Object.freeze({
      id: 'gf:google-sans-code',
      family: 'Google Sans Code',
      weights: FULL_CLOUD_WEIGHTS,
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Google+Sans+Code:wght@300;400;500;600;700&display=swap',
    }),
    Object.freeze({
      id: 'gf:geist-mono',
      family: 'Geist Mono',
      weights: FULL_CLOUD_WEIGHTS,
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@300;400;500;600;700&display=swap',
    }),
    Object.freeze({
      id: 'gf:source-code-pro',
      family: 'Source Code Pro',
      weights: FULL_CLOUD_WEIGHTS,
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@300;400;500;600;700&display=swap',
    }),
    Object.freeze({
      id: 'gf:intel-one-mono',
      family: 'Intel One Mono',
      weights: FULL_CLOUD_WEIGHTS,
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Intel+One+Mono:wght@300;400;500;600;700&display=swap',
    }),
    Object.freeze({
      id: 'gf:lilex',
      family: 'Lilex',
      weights: FULL_CLOUD_WEIGHTS,
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Lilex:wght@300;400;500;600;700&display=swap',
    }),
    Object.freeze({
      id: 'gf:atkinson-hyperlegible-mono',
      family: 'Atkinson Hyperlegible Mono',
      weights: FULL_CLOUD_WEIGHTS,
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Mono:wght@300;400;500;600;700&display=swap',
    }),
    Object.freeze({
      id: 'gf:atkinson-hyperlegible',
      family: 'Atkinson Hyperlegible',
      weights: BASIC_CLOUD_WEIGHTS,
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap',
    }),
    Object.freeze({
      id: 'gf:anonymous-pro',
      family: 'Anonymous Pro',
      weights: BASIC_CLOUD_WEIGHTS,
      googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Anonymous+Pro:wght@400;700&display=swap',
    }),
  ]);

  var CLOUD_GOOGLE_FONT_BY_ID = Object.create(null);
  var CLOUD_GOOGLE_FONT_BY_FAMILY = Object.create(null);
  CLOUD_GOOGLE_FONTS.forEach(function (font) {
    CLOUD_GOOGLE_FONT_BY_ID[font.id.toLowerCase()] = font;
    CLOUD_GOOGLE_FONT_BY_FAMILY[font.family.toLowerCase()] = font;
  });

  function getCloudGoogleFont(nameOrId) {
    if (typeof nameOrId !== 'string') return null;
    var trimmed = nameOrId.trim().toLowerCase();
    if (!trimmed) return null;
    return CLOUD_GOOGLE_FONT_BY_ID[trimmed] || CLOUD_GOOGLE_FONT_BY_FAMILY[trimmed] || null;
  }

  function isCloudGoogleFont(nameOrId) {
    return Boolean(getCloudGoogleFont(nameOrId));
  }

  function resolveCloudGoogleFont(fontName, fontId) {
    var trimmedId = typeof fontId === 'string' ? fontId.trim() : '';
    if (trimmedId) {
      if (trimmedId.toLowerCase().indexOf(CLOUD_GOOGLE_FONT_PREFIX) === 0) {
        return getCloudGoogleFont(trimmedId);
      }
      return null;
    }
    return getCloudGoogleFont(fontName);
  }

  var LEGACY_SITE_DISABLE_KEY = 'fontChangerDisabled';
  var SITE_DISABLED_PREFIX = 'siteDisabled:';
  var SITE_FONT_PREFIX = 'siteFont:';
  var FEEDBACK_URL = 'https://david888.com/contact';
  var WIKI_GUIDE_URL = 'https://wiki.david888.com/share/0aNzs6Zdl416TdIl18rKGw';
  var WHATS_NEW_PAGE = 'whats-new.html';
  var WHATS_NEW_PENDING_KEY = 'whatsNewPendingVersion';
  var WHATS_NEW_SEEN_KEY = 'whatsNewSeenVersion';
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
    SET_TAB_SITE_FONT: 'setTabSiteFont',
    CLEAR_LEGACY_SITE_DISABLE: 'clearLegacySiteDisable',
    SYNC_TAB_BADGE: 'syncTabBadge',
    GET_TAB_INCOGNITO_STATE: 'getTabIncognitoState',
    SYNC_TAB_INCOGNITO_STATE: 'syncTabIncognitoState',
    GET_CACHED_FONT_SLOTS: 'getCachedFontSlots',
    SET_CACHED_FONT_SLOTS: 'setCachedFontSlots',
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

  function normalizeCloudFontWeight(weight) {
    if (typeof weight === 'number' && Number.isFinite(weight)) {
      weight = String(weight);
    }
    if (typeof weight !== 'string') return CLOUD_FONT_WEIGHT_AUTO;
    var trimmed = weight.trim();
    return CLOUD_FONT_WEIGHT_VALUES.indexOf(trimmed) !== -1 ? trimmed : CLOUD_FONT_WEIGHT_AUTO;
  }

  function resolveEffectiveCloudFontWeight(cloudFont, weight) {
    if (!cloudFont) return CLOUD_FONT_WEIGHT_AUTO;
    var normalized = normalizeCloudFontWeight(weight);
    if (normalized === CLOUD_FONT_WEIGHT_AUTO) return CLOUD_FONT_WEIGHT_AUTO;
    var supported = Array.isArray(cloudFont.weights) && cloudFont.weights.length
      ? cloudFont.weights
      : BASIC_CLOUD_WEIGHTS;
    if (supported.indexOf(normalized) !== -1) {
      return normalized;
    }
    var target = Number(normalized);
    var best = supported[0];
    var bestDiff = Math.abs(Number(best) - target);
    for (var i = 1; i < supported.length; i++) {
      var candidate = supported[i];
      var diff = Math.abs(Number(candidate) - target);
      if (diff < bestDiff) {
        best = candidate;
        bestDiff = diff;
      }
    }
    return best;
  }

  function resolveActiveCloudFontFromConfig(config) {
    var src = config && typeof config === 'object' ? config : {};
    if (normalizeFontMode(src.fontMode) === FONT_MODE_ADVANCED) {
      var cfg = createAdvancedFontConfig(src.advancedFontConfig);
      return resolveCloudGoogleFont(cfg.latinFont, cfg.latinFontId);
    }
    return resolveCloudGoogleFont(src.selectedFont, src.selectedFontId);
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

  function siteFontKey(siteKey) {
    return SITE_FONT_PREFIX + siteKey;
  }

  function createSiteFontRule(rule) {
    var src = rule && typeof rule === 'object' ? rule : {};
    return {
      fontMode: normalizeFontMode(src.fontMode),
      selectedFont: typeof src.selectedFont === 'string' ? src.selectedFont : '',
      selectedFontId: typeof src.selectedFontId === 'string' ? src.selectedFontId : '',
      cloudFontWeight: normalizeCloudFontWeight(src.cloudFontWeight),
      advancedFontConfig: createAdvancedFontConfig(src.advancedFontConfig),
    };
  }

  function isSiteFontRuleEmpty(rule) {
    if (!rule || typeof rule !== 'object') return true;
    var normalized = createSiteFontRule(rule);
    if (normalized.fontMode === FONT_MODE_ADVANCED) {
      var cfg = normalized.advancedFontConfig;
      return !(cfg.cjkFont || cfg.cjkFontId || cfg.latinFont || cfg.latinFontId);
    }
    return !normalized.selectedFont;
  }

  function resolveEffectiveFontSettings(globalSettings, siteFontRule) {
    if (siteFontRule && !isSiteFontRuleEmpty(siteFontRule)) {
      return createSiteFontRule(siteFontRule);
    }
    return createSiteFontRule(globalSettings);
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

  var MAX_NON_CJK_RANGE_CACHE = 16;
  var defaultNonCjkUnicodeRange = null;
  var customNonCjkRangeCache = new Map();

  function computeNonCjkUnicodeRange(source) {
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

  function buildNonCjkUnicodeRange(cjkRange) {
    var source = typeof cjkRange === 'string' ? cjkRange : CJK_UNICODE_RANGE;
    if (source === CJK_UNICODE_RANGE) {
      if (defaultNonCjkUnicodeRange === null) {
        defaultNonCjkUnicodeRange = computeNonCjkUnicodeRange(CJK_UNICODE_RANGE);
      }
      return defaultNonCjkUnicodeRange;
    }
    if (customNonCjkRangeCache.has(source)) {
      return customNonCjkRangeCache.get(source);
    }
    var result = computeNonCjkUnicodeRange(source);
    if (customNonCjkRangeCache.size >= MAX_NON_CJK_RANGE_CACHE) {
      var oldestKey = customNonCjkRangeCache.keys().next().value;
      customNonCjkRangeCache.delete(oldestKey);
    }
    customNonCjkRangeCache.set(source, result);
    return result;
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

  var MAX_LOCAL_FONT_CANDIDATES_CACHE = 128;
  var MAX_CALLER_SLOT_CACHE = 128;
  var localFontCandidatesCache = new Map();
  var formattedLocalSrcCache = new WeakMap();
  var inFlightProbesByCache = new WeakMap();
  var defaultInFlightProbes = new Map();

  function normalizeFontPairKey(displayName, fontId) {
    var d = typeof displayName === 'string' ? displayName.trim() : '';
    var f = typeof fontId === 'string' ? fontId.trim() : '';
    return d + '\0' + f;
  }

  function setBoundedSlotCache(cacheMap, key, value) {
    if (!cacheMap || typeof cacheMap.set !== 'function') return;
    if (typeof cacheMap.has === 'function' && typeof cacheMap.delete === 'function') {
      if (cacheMap.has(key)) {
        cacheMap.delete(key);
      } else if (typeof cacheMap.size === 'number' &&
                 cacheMap.size >= MAX_CALLER_SLOT_CACHE &&
                 typeof cacheMap.keys === 'function') {
        var oldest = cacheMap.keys().next().value;
        if (oldest !== undefined) cacheMap.delete(oldest);
      }
    }
    cacheMap.set(key, value);
  }

  function buildLocalFontCandidates(displayName, fontId) {
    var d = typeof displayName === 'string' ? displayName.trim() : '';
    var f = typeof fontId === 'string' ? fontId.trim() : '';
    var first = d || f;
    var second = d && f && f !== d ? f : '';
    var cacheKey = first + '\0' + second;

    if (localFontCandidatesCache.has(cacheKey)) {
      return localFontCandidatesCache.get(cacheKey);
    }

    var baseNames = [];
    if (first) baseNames.push(first);
    if (second) baseNames.push(second);

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

    var result = Object.freeze({
      regular: Object.freeze(regular),
      bold: Object.freeze(bold),
      italic: Object.freeze(italic),
      boldItalic: Object.freeze(boldItalic),
    });

    if (localFontCandidatesCache.size >= MAX_LOCAL_FONT_CANDIDATES_CACHE) {
      var oldestKey = localFontCandidatesCache.keys().next().value;
      localFontCandidatesCache.delete(oldestKey);
    }
    localFontCandidatesCache.set(cacheKey, result);
    return result;
  }

  function formatLocalSrcList(candidates) {
    if (candidates && typeof candidates === 'object' && Object.isFrozen(candidates)) {
      var cached = formattedLocalSrcCache.get(candidates);
      if (cached !== undefined) return cached;
      var formatted = candidates
        .map(function (name) {
          return 'local(' + JSON.stringify(name) + ')';
        })
        .join(', ');
      formattedLocalSrcCache.set(candidates, formatted);
      return formatted;
    }
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

  function getInFlightProbesMap(cacheMap) {
    if (cacheMap && typeof cacheMap === 'object') {
      var map = inFlightProbesByCache.get(cacheMap);
      if (!map) {
        map = new Map();
        inFlightProbesByCache.set(cacheMap, map);
      }
      return map;
    }
    return defaultInFlightProbes;
  }

  function normalizeSlotResult(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.bold !== 'boolean' && typeof raw.italic !== 'boolean' && typeof raw.boldItalic !== 'boolean') {
      return null;
    }
    return {
      bold: Boolean(raw.bold),
      italic: Boolean(raw.italic),
      boldItalic: Boolean(raw.boldItalic),
    };
  }

  function resolveProbeRuntimeApi(optionsOrRuntime) {
    if (optionsOrRuntime === false) {
      return null;
    }
    if (optionsOrRuntime && typeof optionsOrRuntime === 'object') {
      if (optionsOrRuntime.useRuntimeCache === false) {
        return null;
      }
      if (optionsOrRuntime.runtime && typeof optionsOrRuntime.runtime.sendMessage === 'function') {
        return optionsOrRuntime.runtime;
      }
      if (typeof optionsOrRuntime.sendMessage === 'function') {
        return optionsOrRuntime;
      }
      if (optionsOrRuntime.useRuntimeCache === true) {
        return typeof chrome !== 'undefined' && chrome && chrome.runtime &&
          chrome.runtime.id && typeof chrome.runtime.sendMessage === 'function'
          ? chrome.runtime
          : null;
      }
    }
    if (typeof chrome !== 'undefined' && chrome && chrome.runtime &&
        chrome.runtime.id && typeof chrome.runtime.sendMessage === 'function') {
      return chrome.runtime;
    }
    return null;
  }

  function queryRuntimeSlotCache(runtimeApi, key) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = typeof setTimeout === 'function'
        ? setTimeout(function () {
            finish(null);
          }, 150)
        : null;
      function finish(slots) {
        if (settled) return;
        settled = true;
        if (timer !== null && typeof clearTimeout === 'function') {
          clearTimeout(timer);
        }
        resolve(slots);
      }
      try {
        var maybePromise = runtimeApi.sendMessage(
          { action: MSG_ACTIONS.GET_CACHED_FONT_SLOTS, key: key },
          function (resp) {
            try {
              void runtimeApi.lastError;
            } catch (_e) {}
            finish(normalizeSlotResult(resp && resp.slots));
          }
        );
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(
            function (resp) {
              finish(normalizeSlotResult(resp && resp.slots));
            },
            function () {
              finish(null);
            }
          );
        }
      } catch (_e) {
        finish(null);
      }
    });
  }

  function storeRuntimeSlotCache(runtimeApi, key, slots) {
    if (!runtimeApi || typeof runtimeApi.sendMessage !== 'function') return;
    try {
      var maybePromise = runtimeApi.sendMessage(
        {
          action: MSG_ACTIONS.SET_CACHED_FONT_SLOTS,
          key: key,
          slots: slots,
        },
        function () {
          try {
            void runtimeApi.lastError;
          } catch (_e) {}
        }
      );
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(function () {});
      }
    } catch (_e) {
      // Ignore messaging failures when background context is unavailable.
    }
  }

  function probeLocalFontSlots(displayName, fontId, cacheMap, optionsOrRuntime) {
    var rawKey = String(displayName || '') + '\0' + String(fontId || '');
    var normKey = normalizeFontPairKey(displayName, fontId);
    if (cacheMap && (cacheMap.has(rawKey) || cacheMap.has(normKey))) {
      return Promise.resolve(cacheMap.get(rawKey) || cacheMap.get(normKey));
    }
    if (typeof FontFace !== 'function' || (!displayName && !fontId) || normKey === '\0') {
      var empty = { bold: false, italic: false, boldItalic: false };
      if (cacheMap && (displayName || fontId)) {
        setBoundedSlotCache(cacheMap, rawKey, empty);
      }
      return Promise.resolve(empty);
    }

    var inFlightMap = getInFlightProbesMap(cacheMap);
    if (inFlightMap.has(normKey)) {
      return inFlightMap.get(normKey);
    }

    var runtimeApi = resolveProbeRuntimeApi(optionsOrRuntime);

    function saveSlotToCallerCache(slots) {
      if (!cacheMap) return;
      setBoundedSlotCache(cacheMap, rawKey, slots);
      if (normKey !== rawKey) {
        setBoundedSlotCache(cacheMap, normKey, slots);
      }
    }

    function runLocalProbe() {
      if (cacheMap && (cacheMap.has(rawKey) || cacheMap.has(normKey))) {
        return Promise.resolve(cacheMap.get(rawKey) || cacheMap.get(normKey));
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
        saveSlotToCallerCache(slots);
        if (runtimeApi) {
          storeRuntimeSlotCache(runtimeApi, normKey, slots);
        }
        return slots;
      });
    }

    var probePromise = (runtimeApi
      ? queryRuntimeSlotCache(runtimeApi, normKey).then(function (cachedSlots) {
          if (cachedSlots) {
            saveSlotToCallerCache(cachedSlots);
            return cachedSlots;
          }
          return runLocalProbe();
        })
      : runLocalProbe()
    ).then(
      function (slots) {
        inFlightMap.delete(normKey);
        return slots;
      },
      function (err) {
        inFlightMap.delete(normKey);
        throw err;
      }
    );

    inFlightMap.set(normKey, probePromise);
    return probePromise;
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
        var cloudLatin = resolveCloudGoogleFont(cfg.latinFont, cfg.latinFontId);
        pushFontFamily(stack, cloudLatin ? cloudLatin.family : (latinFamily || LATIN_FONT_FAMILY));
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

  function populateFontSelect(opts) {
    var o = opts || {};
    var doc = o.doc;
    var selectEl = o.selectEl;
    if (!doc || !selectEl) return;

    var systemFonts = Array.isArray(o.systemFonts) ? o.systemFonts : [];
    var sortLoc = o.locale === 'zh-Hant' ? 'zh-Hant' : 'en';
    var storedName = typeof o.storedName === 'string' ? o.storedName : '';
    var storedFontId = typeof o.storedFontId === 'string' ? o.storedFontId : '';
    var includeCloudFonts = Boolean(o.includeCloudFonts);

    selectEl.textContent = '';

    var defaultOpt = doc.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = o.defaultLabel || 'System default font';
    selectEl.add(defaultOpt);

    function appendOptionGroup(groupLabel, optionNodes) {
      if (!optionNodes.length) return;
      if (typeof selectEl.appendChild === 'function') {
        var groupEl = doc.createElement('optgroup');
        if (groupEl) {
          groupEl.label = groupLabel;
          for (var g = 0; g < optionNodes.length; g++) {
            groupEl.appendChild(optionNodes[g]);
          }
          selectEl.appendChild(groupEl);
          return;
        }
      }
      for (var k = 0; k < optionNodes.length; k++) {
        selectEl.add(optionNodes[k]);
      }
    }

    var sorted = systemFonts.slice().sort(function (a, b) {
      return String(a.displayName || '').localeCompare(String(b.displayName || ''), sortLoc);
    });
    var sysOptionNodes = [];
    for (var i = 0; i < sorted.length; i++) {
      var font = sorted[i];
      var opt = doc.createElement('option');
      opt.value = font.displayName;
      opt.textContent = font.displayName;
      opt.dataset.fontId = font.fontId;
      sysOptionNodes.push(opt);
    }
    if (includeCloudFonts) {
      var cloudOptionNodes = [];
      for (var c = 0; c < CLOUD_GOOGLE_FONTS.length; c++) {
        var cf = CLOUD_GOOGLE_FONTS[c];
        var cOpt = doc.createElement('option');
        cOpt.value = cf.family;
        cOpt.textContent = cf.family;
        cOpt.dataset.fontId = cf.id;
        cOpt.dataset.cloudFont = '1';
        cloudOptionNodes.push(cOpt);
      }
      appendOptionGroup(o.cloudGroupLabel || 'Cloud Fonts (Google Fonts)', cloudOptionNodes);
      appendOptionGroup(o.systemGroupLabel || 'System Fonts', sysOptionNodes);
    } else {
      for (var s = 0; s < sysOptionNodes.length; s++) {
        selectEl.add(sysOptionNodes[s]);
      }
    }

    if (!storedName && !storedFontId) {
      selectEl.selectedIndex = 0;
      selectEl.value = '';
      return;
    }

    var options = Array.from(selectEl.options || []);
    var isExplicitCloud = storedFontId.toLowerCase().indexOf(CLOUD_GOOGLE_FONT_PREFIX) === 0;
    var matchIdx = -1;
    if (isExplicitCloud) {
      matchIdx = options.findIndex(function (optNode) {
        return optNode.dataset && optNode.dataset.fontId === storedFontId;
      });
    } else if (storedFontId) {
      matchIdx = options.findIndex(function (optNode) {
        if (optNode.dataset && optNode.dataset.cloudFont === '1') return false;
        return optNode.value === storedName || (optNode.dataset && optNode.dataset.fontId === storedFontId);
      });
    } else {
      matchIdx = options.findIndex(function (optNode) {
        return optNode.dataset && optNode.dataset.cloudFont !== '1' && optNode.value === storedName;
      });
      if (matchIdx === -1) {
        matchIdx = options.findIndex(function (optNode) {
          return optNode.value === storedName;
        });
      }
    }

    if (matchIdx !== -1) {
      selectEl.selectedIndex = matchIdx;
      selectEl.value = options[matchIdx].value;
      return;
    }

    var labelName = storedName || storedFontId;
    var missingOpt = doc.createElement('option');
    missingOpt.value = labelName;
    missingOpt.dataset.fontId = storedFontId || labelName;
    missingOpt.dataset.unavailable = '1';
    missingOpt.textContent = (o.unavailableLabel || '{font} (Not installed on this device)').replace('{font}', labelName);
    selectEl.add(missingOpt, selectEl.options.length > 1 ? selectEl.options[1] : null);
    selectEl.selectedIndex = 1;
    selectEl.value = labelName;
  }

  function populateCloudWeightSelect(opts) {
    var o = opts || {};
    var doc = o.doc;
    var selectEl = o.selectEl;
    if (!doc || !selectEl) return CLOUD_FONT_WEIGHT_AUTO;

    var cloudFont = o.cloudFont || null;
    var labels = o.labels || {};
    selectEl.textContent = '';

    if (!cloudFont) {
      var disabledOpt = doc.createElement('option');
      disabledOpt.value = CLOUD_FONT_WEIGHT_AUTO;
      disabledOpt.textContent = labels.cloudOnly || 'Auto (Cloud fonts only)';
      selectEl.add(disabledOpt);
      selectEl.disabled = true;
      selectEl.selectedIndex = 0;
      selectEl.value = CLOUD_FONT_WEIGHT_AUTO;
      return CLOUD_FONT_WEIGHT_AUTO;
    }

    selectEl.disabled = false;
    var effectiveWeight = resolveEffectiveCloudFontWeight(cloudFont, o.selectedWeight);
    var supported = Array.isArray(cloudFont.weights) && cloudFont.weights.length
      ? cloudFont.weights
      : BASIC_CLOUD_WEIGHTS;

    var autoOpt = doc.createElement('option');
    autoOpt.value = CLOUD_FONT_WEIGHT_AUTO;
    autoOpt.textContent = labels.auto || 'Auto (Page default)';
    selectEl.add(autoOpt);

    var matchIdx = 0;
    for (var i = 0; i < CLOUD_FONT_WEIGHT_VALUES.length; i++) {
      var w = CLOUD_FONT_WEIGHT_VALUES[i];
      var isSupported = supported.indexOf(w) !== -1;
      var wOpt = doc.createElement('option');
      wOpt.value = w;
      wOpt.disabled = !isSupported;
      wOpt.textContent = (labels[w] || w) + (isSupported ? '' : (labels.unsupportedSuffix || ' (Unavailable)'));
      selectEl.add(wOpt);
      if (w === effectiveWeight && isSupported) {
        matchIdx = i + 1;
      }
    }

    selectEl.selectedIndex = matchIdx;
    selectEl.value = matchIdx === 0 ? CLOUD_FONT_WEIGHT_AUTO : effectiveWeight;
    return selectEl.value;
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
    CLOUD_GOOGLE_FONT_PREFIX: CLOUD_GOOGLE_FONT_PREFIX,
    CLOUD_GOOGLE_FONT_ATTR: CLOUD_GOOGLE_FONT_ATTR,
    CLOUD_FONT_WEIGHT_AUTO: CLOUD_FONT_WEIGHT_AUTO,
    CLOUD_FONT_WEIGHT_VALUES: CLOUD_FONT_WEIGHT_VALUES,
    CLOUD_GOOGLE_FONTS: CLOUD_GOOGLE_FONTS,
    LEGACY_SITE_DISABLE_KEY: LEGACY_SITE_DISABLE_KEY,
    SITE_DISABLED_PREFIX: SITE_DISABLED_PREFIX,
    SITE_FONT_PREFIX: SITE_FONT_PREFIX,
    FEEDBACK_URL: FEEDBACK_URL,
    WIKI_GUIDE_URL: WIKI_GUIDE_URL,
    WHATS_NEW_PAGE: WHATS_NEW_PAGE,
    WHATS_NEW_PENDING_KEY: WHATS_NEW_PENDING_KEY,
    WHATS_NEW_SEEN_KEY: WHATS_NEW_SEEN_KEY,
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
    normalizeCloudFontWeight: normalizeCloudFontWeight,
    resolveEffectiveCloudFontWeight: resolveEffectiveCloudFontWeight,
    resolveActiveCloudFontFromConfig: resolveActiveCloudFontFromConfig,
    createAdvancedFontConfig: createAdvancedFontConfig,
    createSiteFontRule: createSiteFontRule,
    isSiteFontRuleEmpty: isSiteFontRuleEmpty,
    resolveEffectiveFontSettings: resolveEffectiveFontSettings,
    getCloudGoogleFont: getCloudGoogleFont,
    isCloudGoogleFont: isCloudGoogleFont,
    resolveCloudGoogleFont: resolveCloudGoogleFont,
    siteDisabledKey: siteDisabledKey,
    siteFontKey: siteFontKey,
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
    populateFontSelect: populateFontSelect,
    populateCloudWeightSelect: populateCloudWeightSelect,
    normalizeLigatureText: normalizeLigatureText,
  });

  global.FontChangerShared = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
