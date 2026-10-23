var FALLBACK_STACK = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
var SITE_DISABLE_KEY = 'fontChangerDisabled';
var EXCLUDE_ATTRIBUTE = 'data-font-changer-exclude';
var LIGATURE_ICON_ATTRIBUTE = 'data-font-changer-ligature-icon';
var GOOGLE_LOGO_ATTRIBUTE = 'data-font-changer-google-logo';
var INTERACTIVE_EXCLUDE_SELECTOR = 'button, [role="button"], summary, [data-is-muted]';
var FONT_MODE_BASIC = 'basic';
var FONT_MODE_ADVANCED = 'advanced';
var CJK_FONT_FAMILY = 'FontChangerCjk';
var LATIN_FONT_FAMILY = 'FontChangerLatin';
var CJK_UNICODE_RANGE = 'U+3000-303F, U+3100-312F, U+31A0-31BF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FE30-FE4F, U+FF00-FF0F, U+FF1A-FF20, U+FF3B-FF40, U+FF5B-FFEF, U+20000-2A6DF, U+2A700-2B73F, U+2B740-2B81F, U+2B820-2CEAF, U+2CEB0-2EBEF, U+2F800-2FA1F';

var currentFontFamily = '';
var currentFontMode = FONT_MODE_BASIC;
var currentAdvancedFontConfig = createAdvancedFontConfig();
var isFontEnabled = false;

var rootStyles = new WeakMap();
var trackedShadowRoots = new Set();
var trackedPipDocuments = new Set();
var dynamicIconSelectors = [];
var iconSelectorsSet = new Set();

// 排除不需要改字體的圖示類別
var EXCLUDE_CLASSES = [
  '.icon',
  '[class~="icon"]',
  '.iconfont',
  '[class*="iconfont"]',
  '.arrow-icon',
  '[class*="arrow-icon"]',
  '.devsite-nav-toggle',
  '[class*="icon-"]',
  '[class*="-icon"]',
  '[class*="icon_"]',
  '[class*="_icon"]',
  '.material-icons',
  '[class*="material-icons"]',
  '[class*="material-symbols"]',
  '.google-symbols',
  '[class*="google-symbols"]',
  '.google-material-icons',
  '[class*="google-material"]',
  '.material-icons-extended',
  '[class*="material-icons-extended"]',
  '.DPvwYc',
  '.z1asCe',
  '[class*="z1asCe"]',
  '[class*="notranslate"]',
  '[translate="no"]',
  'svg',
  'svg *',
  'g-icon',
  'yt-icon',
  'iron-icon',
  'mwc-icon',
  'mat-icon',
  'md-icon',
  '.fa',
  '.fas',
  '.far',
  '.fab',
  '.glyphicon',
  // 新增更廣泛的相容性排除規則 (Case-insensitive)
  '[class*="icon" i]',
  '[class*="symbol" i]',
  '[class*="lucide" i]',
  '[class*="feather" i]',
  '[class*="octicon" i]',
  '[class*="glyphicon" i]',
  '[class*="fontawesome" i]',
  '[class*="font-awesome" i]',
  '[class*="fa-" i]',
  '[class*="remixicon" i]',
  '[class*="ri-" i]',
  '[class*="boxicons" i]',
  '[class*="bx-" i]',
  '[class*="bootstrap-icons" i]',
  '[class*="bi-" i]',
  '[class*="tabler-icons" i]',
  '[class*="ti-" i]',
  '[class*="line-awesome" i]',
  '[class*="la-" i]',
  '[class*="weather-icons" i]',
  '[class*="wi-" i]',
  '[class*="dashicons" i]',
  '[class*="typcn" i]',
  '[data-font-changer-ligature-icon]',
  '[data-font-changer-google-logo]',
  '[data-icon]',
  '[data-icon-name]',
  '[data-material-icon]',
  '[data-symbol]'
];

function isShadowRootNode(node) {
  return node && (node.nodeType === 11 || typeof node.host !== 'undefined');
}

function isElementNode(node) {
  return node && node.nodeType === 1;
}

function getFontStack() {
  if (shouldUseAdvancedFontMode()) {
    const stack = [];
    if (currentAdvancedFontConfig.cjkFont) {
      pushFontFamily(stack, CJK_FONT_FAMILY);
    }
    if (currentAdvancedFontConfig.latinFont) {
      pushFontFamily(stack, LATIN_FONT_FAMILY);
    }
    stack.push(FALLBACK_STACK);
    return stack.join(', ');
  }
  if (!currentFontFamily) return FALLBACK_STACK;
  return `${JSON.stringify(currentFontFamily)}, ${FALLBACK_STACK}`;
}

function pushFontFamily(stack, fontFamily) {
  if (typeof fontFamily !== 'string' || !fontFamily) {
    return;
  }

  const quotedFontFamily = JSON.stringify(fontFamily);
  if (!stack.includes(quotedFontFamily)) {
    stack.push(quotedFontFamily);
  }
}

function createAdvancedFontConfig(config) {
  return {
    cjkFont: config && typeof config.cjkFont === 'string' ? config.cjkFont : '',
    cjkFontId: config && typeof config.cjkFontId === 'string' ? config.cjkFontId : '',
    latinFont: config && typeof config.latinFont === 'string' ? config.latinFont : '',
    latinFontId: config && typeof config.latinFontId === 'string' ? config.latinFontId : '',
  };
}

function normalizeFontMode(mode) {
  return mode === FONT_MODE_ADVANCED ? FONT_MODE_ADVANCED : FONT_MODE_BASIC;
}

function shouldUseAdvancedFontMode() {
  return currentFontMode === FONT_MODE_ADVANCED && (
    Boolean(currentAdvancedFontConfig.cjkFont) ||
    Boolean(currentAdvancedFontConfig.latinFont)
  );
}

// Keep each selected font inside its character range, even if it is a merged font.
function buildNonCjkUnicodeRange() {
  const ranges = CJK_UNICODE_RANGE.split(',').map((range) => {
    const [start, end] = range.trim().slice(2).split('-').map((value) => parseInt(value, 16));
    return [start, end === undefined ? start : end];
  }).sort((a, b) => a[0] - b[0]);
  const complement = [];
  let next = 0;
  for (const [start, end] of ranges) {
    if (next < start) {
      complement.push(`U+${next.toString(16).toUpperCase()}-${(start - 1).toString(16).toUpperCase()}`);
    }
    next = Math.max(next, end + 1);
  }
  if (next <= 0x10FFFF) {
    complement.push(`U+${next.toString(16).toUpperCase()}-10FFFF`);
  }
  return complement.join(', ');
}

function buildCompositeFontFaceCss() {
  if (!shouldUseAdvancedFontMode()) {
    return '';
  }

  const config = currentAdvancedFontConfig;
  const faces = [];
  if (config.cjkFont) {
    faces.push(buildRestrictedFontFaceCss(CJK_FONT_FAMILY, config.cjkFont, config.cjkFontId, CJK_UNICODE_RANGE));
  }
  if (config.latinFont) {
    faces.push(buildRestrictedFontFaceCss(LATIN_FONT_FAMILY, config.latinFont, config.latinFontId, buildNonCjkUnicodeRange()));
  }
  return faces.join('\n');
}

function buildRestrictedFontFaceCss(family, displayName, fontId, unicodeRange) {
  return `
    @font-face {
      font-family: ${JSON.stringify(family)};
      src: ${buildLocalFontSources(displayName, fontId)};
      unicode-range: ${unicodeRange};
      font-weight: auto;
      font-style: normal;
      font-display: swap;
    }`;
}

function buildLocalFontSources(displayName, fontId) {
  const baseNames = [displayName, fontId]
    .filter((name) => typeof name === 'string' && name.trim())
    .map((name) => name.trim());

  const candidates = [];
  function addCandidate(name) {
    if (typeof name === 'string') {
      const trimmed = name.trim();
      if (trimmed && !candidates.includes(trimmed)) {
        candidates.push(trimmed);
      }
    }
  }

  baseNames.forEach(addCandidate);

  baseNames.forEach((base) => {
    [' Regular', '-Regular', ' Medium', '-Medium', ' Bold', '-Bold', ' Light', '-Light', ' 半糖'].forEach((suffix) => {
      addCandidate(base + suffix);
    });

    const compact = base.replace(/[\s_]+/g, '');
    if (compact) {
      addCandidate(compact);
      ['-Regular', '-Medium', '-Bold', '-Light', 'Regular-Regular', 'Regular-Medium'].forEach((suffix) => {
        addCandidate(compact + suffix);
      });
    }

    const asciiPart = base.replace(/[^\x20-\x7E]+/g, '').trim();
    if (asciiPart) {
      addCandidate(asciiPart);
      [' Regular', '-Regular', ' Medium', '-Medium', ' Bold', '-Bold'].forEach((suffix) => {
        addCandidate(asciiPart + suffix);
      });
      const asciiCompact = asciiPart.replace(/[\s_]+/g, '');
      if (asciiCompact) {
        addCandidate(asciiCompact);
        ['-Regular', '-Medium', '-Bold', 'Regular-Regular', 'Regular-Medium'].forEach((suffix) => {
          addCandidate(asciiCompact + suffix);
        });
      }
    }
  });

  return candidates.map((name) => `local(${JSON.stringify(name)})`).join(', ');
}

function isSiteDisabled() {
  try {
    return localStorage.getItem(SITE_DISABLE_KEY) === '1';
  } catch (_error) {
    return false;
  }
}

function setSiteDisabled(disabled) {
  try {
    if (disabled) {
      localStorage.setItem(SITE_DISABLE_KEY, '1');
    } else {
      localStorage.removeItem(SITE_DISABLE_KEY);
    }
    return true;
  } catch (_error) {
    return false;
  }
}

function shouldApplyCustomFont() {
  return isFontEnabled && !isSiteDisabled();
}

function isGoogleMeetSite() {
  try {
    const host = (typeof location !== 'undefined' && (location.hostname || location.host)) ? (location.hostname || location.host) : '';
    if (host === 'meet.google.com' || host.endsWith('.meet.google.com')) return true;
    if (typeof document !== 'undefined' && document.location) {
      const docHost = document.location.hostname || document.location.host || '';
      if (docHost === 'meet.google.com' || docHost.endsWith('.meet.google.com')) return true;
    }
  } catch (_e) {}
  return false;
}

function isGooglePlaySite() {
  try {
    const host = (typeof location !== 'undefined' && (location.hostname || location.host)) ? (location.hostname || location.host) : '';
    if (host === 'play.google.com' || host.endsWith('.play.google.com')) return true;
    if (typeof document !== 'undefined' && document.location) {
      const docHost = document.location.hostname || document.location.host || '';
      if (docHost === 'play.google.com' || docHost.endsWith('.play.google.com')) return true;
    }
  } catch (_e) {}
  return false;
}

function isGoogleSite() {
  try {
    const host = (typeof location !== 'undefined' && (location.hostname || location.host)) ? (location.hostname || location.host) : '';
    if (/(?:^|\.)(?:google\.[a-z]+(?:\.[a-z]+)?|youtube\.com|gstatic\.com)$/i.test(host)) return true;
    if (typeof document !== 'undefined' && document.location) {
      const docHost = document.location.hostname || document.location.host || '';
      if (/(?:^|\.)(?:google\.[a-z]+(?:\.[a-z]+)?|youtube\.com|gstatic\.com)$/i.test(docHost)) return true;
    }
  } catch (_e) {}
  return false;
}

function buildFontTargetSuffix() {
  let excludeSelectors = EXCLUDE_CLASSES
    .concat(dynamicIconSelectors)
    .concat([
      `[${EXCLUDE_ATTRIBUTE}]`,
      `[${GOOGLE_LOGO_ATTRIBUTE}]`,
      `[${GOOGLE_LOGO_ATTRIBUTE}] *`
    ]);

  if (isGoogleMeetSite()) {
    excludeSelectors = excludeSelectors.concat([
      'button',
      'button *',
      '[role="button"]',
      '[role="button"] *',
      '[jsaction]',
      '[class*="notranslate"]',
      '[translate="no"]',
      '.google-symbols',
      '[class*="google-symbols"]',
      '[class*="google-material"]'
    ]);
  } else if (isGooglePlaySite()) {
    excludeSelectors = excludeSelectors.concat([
      '.google-material-icons',
      '[class*="google-material"]',
      '.google-symbols',
      '[class*="google-symbols"]',
      '.material-icons-extended',
      '[class*="material-icons-extended"]',
      '.DPvwYc',
      `[${GOOGLE_LOGO_ATTRIBUTE}]`,
      `[${GOOGLE_LOGO_ATTRIBUTE}] *`
    ]);
  }

  const excludeSelector = `:not(${excludeSelectors.join('):not(')})`;

  return `${excludeSelector}:not([${EXCLUDE_ATTRIBUTE}] *)`;
}

var SINGLE_WORD_ICON_NAMES = new Set([
  'mic', 'videocam', 'chat', 'forum', 'people', 'group', 'person', 'settings',
  'help', 'info', 'search', 'close', 'menu', 'check', 'add', 'remove',
  'edit', 'delete', 'share', 'star', 'heart', 'send', 'image', 'folder',
  'home', 'play', 'pause', 'stop', 'back', 'forward', 'next', 'prev',
  'upload', 'download', 'cloud', 'lock', 'unlock', 'key', 'email', 'mail',
  'phone', 'bell', 'alert', 'clock', 'time', 'calendar', 'map', 'pin',
  'tag', 'flag', 'bookmark', 'filter', 'sort', 'view', 'hide', 'show',
  'mood', 'hand', 'cast', 'tune', 'done', 'clear', 'more', 'refresh', 'sync',
  'fullscreen', 'warning', 'error', 'cancel', 'schedule', 'language', 'translate',
  'visibility', 'face', 'sensors', 'speed', 'security', 'shield', 'bolt',
  'flash', 'circle', 'square', 'lens', 'copy', 'print', 'save', 'note',
  'draft', 'drafts', 'terminal', 'code', 'laptop', 'desktop', 'headset', 'speaker',
  'volume', 'link', 'launch', 'login', 'logout', 'power', 'thumb', 'broadcast',
  'subtitles', 'caption', 'captions', 'shapes', 'category', 'record', 'recording',
  'pan', 'tool', 'present',
  'devices', 'device', 'tablet', 'apps', 'reviews', 'payment', 'redeem',
  'badge', 'verified', 'expand', 'collapse', 'navigate', 'chevron', 'arrow',
  'install', 'update', 'public',
  // Google Workspace & Apps icons
  'inbox', 'archive', 'snooze', 'undo', 'redo', 'call', 'event', 'today',
  'description', 'article', 'dashboard', 'palette', 'favorite', 'store',
  'label', 'labels', 'contacts', 'groups', 'inventory', 'dns', 'storage',
  'memory', 'policy', 'feedback', 'report', 'stars', 'grade', 'place',
  'layers', 'camera', 'photo', 'video', 'music', 'album', 'audio', 'radio',
  'tv', 'movie', 'history', 'restaurant', 'hotel', 'flight', 'train', 'bus',
  'directions', 'satellite', 'terrain', 'traffic', 'crop', 'brush', 'draw',
  'colorize', 'straighten', 'attachment', 'navigation', 'explore', 'wallet',
  'calculator', 'north', 'south', 'east', 'west'
]);

// In Unicode mode, adjacent surrogate escapes combine into one code point.
// Putting surrogate ranges here accidentally creates a range spanning ordinary
// CJK text and punctuation. Only match the three actual private-use blocks.
var PUA_REGEX = /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u;

function normalizeLigatureText(text) {
  return String(text || '')
    .replace(/[\u200B-\u200D\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
    .trim()
    .toLowerCase();
}

function isIconContext(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;

  const tagName = (element.tagName || '').toLowerCase();
  if (
    tagName === 'i' ||
    tagName === 'mat-icon' ||
    tagName === 'md-icon' ||
    tagName === 'g-icon' ||
    tagName === 'yt-icon' ||
    tagName === 'iron-icon' ||
    tagName === 'mwc-icon' ||
    tagName === 'svg'
  ) {
    return true;
  }

  const rawClass = typeof element.className === 'string'
    ? element.className
    : (element.className && typeof element.className.baseVal === 'string' ? element.className.baseVal : '');
  const className = rawClass.toLowerCase();

  if (
    className.includes('icon') ||
    className.includes('symbol') ||
    className.includes('material') ||
    className.includes('glyph') ||
    className.includes('notranslate') ||
    className.includes('dpvwyc') ||
    className.includes('z1asce') ||
    className.includes('vfppkd')
  ) {
    return true;
  }

  const inlineStyle = String((typeof element.getAttribute === 'function' && element.getAttribute('style')) || (element.style && element.style.fontFamily) || '').toLowerCase();
  if (
    inlineStyle.includes('icon') ||
    inlineStyle.includes('symbol') ||
    inlineStyle.includes('material')
  ) {
    return true;
  }

  if (typeof element.hasAttribute === 'function') {
    if (element.hasAttribute('aria-hidden') && element.getAttribute('aria-hidden') === 'true') {
      return true;
    }
    if (
      element.hasAttribute('data-icon') ||
      element.hasAttribute('data-icon-name') ||
      element.hasAttribute('data-symbol') ||
      element.hasAttribute('data-material-icon')
    ) {
      return true;
    }
    if (element.hasAttribute('translate') && element.getAttribute('translate') === 'no') {
      return true;
    }
    if (element.hasAttribute('jsname') && isGoogleSite()) {
      const jsname = element.getAttribute('jsname') || '';
      if (jsname && (tagName === 'span' || tagName === 'i' || isLeafElement(element))) {
        return true;
      }
    }
  }

  if (element.parentElement && element.parentElement.nodeType === Node.ELEMENT_NODE) {
    const parent = element.parentElement;
    const parentRawClass = typeof parent.className === 'string'
      ? parent.className
      : (parent.className && typeof parent.className.baseVal === 'string' ? parent.className.baseVal : '');
    const parentClass = parentRawClass.toLowerCase();
    const parentStyle = String((typeof parent.getAttribute === 'function' && parent.getAttribute('style')) || (parent.style && parent.style.fontFamily) || '').toLowerCase();
    if (
      parentClass.includes('icon') ||
      parentClass.includes('symbol') ||
      parentClass.includes('material') ||
      parentClass.includes('dpvwyc') ||
      parentClass.includes('notranslate') ||
      parentClass.includes('z1asce') ||
      parentClass.includes('vfppkd') ||
      parentStyle.includes('icon') ||
      parentStyle.includes('symbol') ||
      parentStyle.includes('material')
    ) {
      return true;
    }

    if (typeof parent.hasAttribute === 'function') {
      if (parent.hasAttribute('aria-hidden') && parent.getAttribute('aria-hidden') === 'true') {
        return true;
      }
      if (parent.hasAttribute('translate') && parent.getAttribute('translate') === 'no') {
        return true;
      }
      if (
        parent.hasAttribute('data-icon') ||
        parent.hasAttribute('data-icon-name') ||
        parent.hasAttribute('data-symbol') ||
        parent.hasAttribute('data-material-icon')
      ) {
        return true;
      }
    }
  }

  return false;
}

function isCodeContext(element) {
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const tagName = (current.tagName || '').toLowerCase();
    if (tagName === 'code' || tagName === 'pre') {
      return true;
    }

    const className = String(current.className || '').toLowerCase();
    if (/(?:^|\s)(?:blob-code(?:-inner)?|code-block|code-line|hljs|cm-content|cm-line|monaco-editor|prism-code)(?:\s|$)/.test(className)) {
      return true;
    }

    current = current.parentElement;
  }
  return false;
}

function isLikelyLigatureIconText(text, element) {
  const normalized = normalizeLigatureText(text);
  if (!normalized) return false;
  if (normalized.length > 40) return false;

  if (PUA_REGEX.test(normalized)) {
    return true;
  }
  
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(normalized)) {
    if (element && isCodeContext(element) && !isIconContext(element)) {
      return false;
    }
    return true;
  }
  
  if (SINGLE_WORD_ICON_NAMES.has(normalized)) {
    if (element) {
      return isIconContext(element);
    }
    return true;
  }

  return false;
}

function isLeafElement(element) {
  return Boolean(element && element.nodeType === Node.ELEMENT_NODE && (!element.childElementCount || element.childElementCount === 0));
}

function isLigatureIconElement(element) {
  if (!element || !element.childNodes || element.childElementCount > 0) return false;

  let textContent = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      textContent += node.textContent || '';
      continue;
    }
    return false;
  }

  return isLikelyLigatureIconText(textContent, element);
}

function markExcludedElement(element) {
  if (!element || typeof element.setAttribute !== 'function') {
    return;
  }

  element.setAttribute(EXCLUDE_ATTRIBUTE, '1');
}

function shouldExcludeInteractiveAncestor(ancestor, iconElement) {
  if (!ancestor) return false;
  const ancestorText = normalizeLigatureText(ancestor.textContent);
  const iconText = normalizeLigatureText(iconElement ? iconElement.textContent : '');
  if (!ancestorText || ancestorText === iconText) {
    return true;
  }
  return false;
}

function markLigatureIconElement(element) {
  markExcludedElement(element);
  if (element && typeof element.setAttribute === 'function') {
    element.setAttribute(LIGATURE_ICON_ATTRIBUTE, '1');
  }

  if (typeof element.closest === 'function') {
    const ancestor = element.closest(INTERACTIVE_EXCLUDE_SELECTOR);
    if (ancestor && ancestor !== element && shouldExcludeInteractiveAncestor(ancestor, element)) {
      markExcludedElement(ancestor);
    }
  }
}

function markGoogleLogoElement(element) {
  if (!element || typeof element.setAttribute !== 'function') return;
  element.setAttribute(EXCLUDE_ATTRIBUTE, '1');
  element.setAttribute(GOOGLE_LOGO_ATTRIBUTE, '1');
  if (typeof element.closest === 'function') {
    const anchor = element.closest('a');
    if (anchor && anchor !== element && typeof anchor.setAttribute === 'function') {
      const anchorText = normalizeLigatureText(anchor.textContent);
      const elementText = normalizeLigatureText(element.textContent);
      const isLogoAnchor = anchorText === elementText || /^(google_logo\s*play|play\s*google_logo|google_logo)$/i.test(anchorText);
      if (isLogoAnchor) {
        anchor.setAttribute(EXCLUDE_ATTRIBUTE, '1');
        anchor.setAttribute(GOOGLE_LOGO_ATTRIBUTE, '1');
      }
    }
  }
}

function unmarkGoogleLogoElement(element) {
  if (!element || typeof element.removeAttribute !== 'function') return;
  element.removeAttribute(GOOGLE_LOGO_ATTRIBUTE);
  if (typeof element.querySelector !== 'function' || !element.querySelector(`[${EXCLUDE_ATTRIBUTE}]`)) {
    element.removeAttribute(EXCLUDE_ATTRIBUTE);
  }
  if (typeof element.closest === 'function') {
    const anchor = element.closest('a');
    if (anchor && anchor !== element && typeof anchor.removeAttribute === 'function') {
      const hasOtherLogo = typeof anchor.querySelector === 'function' && Boolean(anchor.querySelector(`[${GOOGLE_LOGO_ATTRIBUTE}]`));
      if (!hasOtherLogo) {
        anchor.removeAttribute(GOOGLE_LOGO_ATTRIBUTE);
        const hasOtherExclude = typeof anchor.querySelector === 'function' && Boolean(anchor.querySelector(`[${EXCLUDE_ATTRIBUTE}]`));
        if (!hasOtherExclude) {
          anchor.removeAttribute(EXCLUDE_ATTRIBUTE);
        }
      }
    }
  }
}

function updateLigatureIconTextNode(textNode) {
  if (!textNode) return;

  const parent = textNode.parentElement || textNode.parentNode;
  if (!parent || parent.nodeType !== Node.ELEMENT_NODE) return;

  const text = textNode.textContent || '';
  if (isGooglePlaySite() && normalizeLigatureText(text).includes('google_logo')) {
    if (isLeafElement(parent)) {
      markGoogleLogoElement(parent);
      return;
    }
  } else if (parent.hasAttribute && parent.hasAttribute(GOOGLE_LOGO_ATTRIBUTE)) {
    unmarkGoogleLogoElement(parent);
  }

  // A short text node (e.g. a BBS separator or icon) can belong to an entire
  // article. Never exclude that container and all of its descendants.
  const parentText = typeof parent.textContent === 'string' ? parent.textContent : text;
  if (isLeafElement(parent) && isLikelyLigatureIconText(parentText, parent)) {
    markLigatureIconElement(parent);
  } else if (parent.hasAttribute(LIGATURE_ICON_ATTRIBUTE)) {
    parent.removeAttribute(LIGATURE_ICON_ATTRIBUTE);
    if (typeof parent.querySelector !== 'function' || !parent.querySelector(`[${EXCLUDE_ATTRIBUTE}]`)) {
      parent.removeAttribute(EXCLUDE_ATTRIBUTE);
    }
    if (typeof parent.closest === 'function') {
      const ancestor = parent.closest(INTERACTIVE_EXCLUDE_SELECTOR);
      if (ancestor && ancestor !== parent && typeof ancestor.querySelector === 'function') {
        if (!ancestor.querySelector(`[${EXCLUDE_ATTRIBUTE}]`)) {
          ancestor.removeAttribute(EXCLUDE_ATTRIBUTE);
        }
      }
    }
  }
}

function updateLigatureIconMarker(element) {
  if (!element || typeof element.setAttribute !== 'function' || typeof element.removeAttribute !== 'function') {
    return;
  }

  if (isLeafElement(element)) {
    const text = element.textContent || '';
    if (isGooglePlaySite() && normalizeLigatureText(text).includes('google_logo')) {
      markGoogleLogoElement(element);
      return;
    } else if (element.hasAttribute(GOOGLE_LOGO_ATTRIBUTE)) {
      unmarkGoogleLogoElement(element);
    }
  }

  if (isLigatureIconElement(element)) {
    markLigatureIconElement(element);
  } else if (element.hasAttribute(EXCLUDE_ATTRIBUTE)) {
    if (typeof element.querySelector !== 'function' || !element.querySelector(`[${EXCLUDE_ATTRIBUTE}]`)) {
      element.removeAttribute(EXCLUDE_ATTRIBUTE);
      element.removeAttribute(LIGATURE_ICON_ATTRIBUTE);
    }
  }
}

function scanForLigatureIcons(rootNode) {
  if (!rootNode) return;

  if (rootNode.nodeType === Node.TEXT_NODE) {
    updateLigatureIconTextNode(rootNode);
    return;
  }

  if (rootNode.nodeType === Node.ELEMENT_NODE) {
    updateLigatureIconMarker(rootNode);
  }

  const doc = rootNode.nodeType === 9 ? rootNode : (rootNode.ownerDocument || document);
  const walker = doc.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let curr;
  while (curr = walker.nextNode()) {
    if (curr.nodeType === Node.TEXT_NODE) {
      updateLigatureIconTextNode(curr);
    } else {
      updateLigatureIconMarker(curr);
    }
  }
}

function getLigatureIconFontStack() {
  if (isGooglePlaySite()) {
    return "'Google Material Icons', 'Material Icons Extended', 'Material Icons', 'Google Symbols', 'Material Symbols Outlined'";
  }
  return "'Google Symbols', 'Material Symbols Outlined', 'Google Material Icons', 'Material Icons'";
}

// 建立更有效率的 CSS
function buildCss(isShadowRoot) {
  const targetSuffix = buildFontTargetSuffix();
  const textSelectors = isShadowRoot
    ? [`:host${targetSuffix}`, `:host *${targetSuffix}`]
    : [
        `html${targetSuffix}`,
        `body${targetSuffix}`,
        `body *${targetSuffix}`,
      ];
  const inputSelectors = isShadowRoot
    ? [
        `:host input${targetSuffix}`,
        `:host textarea${targetSuffix}`,
        `:host select${targetSuffix}`,
        `:host button${targetSuffix}`,
      ]
    : [
        `input${targetSuffix}`,
        `textarea${targetSuffix}`,
        `select${targetSuffix}`,
        `button${targetSuffix}`,
      ];
  const fontFaceCss = buildCompositeFontFaceCss();

  return `
    ${fontFaceCss}
    ${textSelectors.join(',\n    ')} {
      font-family: ${getFontStack()} !important;
    }
    ${inputSelectors.join(',\n    ')} {
      font-family: ${getFontStack()} !important;
    }
    [class*="google-material"],
    [class*="material-icons-extended"],
    .material-icons-extended,
    .DPvwYc {
      font-family: 'Google Material Icons', 'Material Icons Extended', 'Material Icons', 'Google Symbols', 'Material Symbols Outlined' !important;
      text-transform: none !important;
    }
    .material-icons,
    [class*="material-icons"]:not([class*="google-material"]):not([class*="material-icons-extended"]) {
      font-family: 'Material Icons', 'Google Material Icons', 'Material Icons Extended', 'Google Symbols', 'Material Symbols Outlined' !important;
      text-transform: none !important;
    }
    .google-symbols,
    [class*="google-symbols"] {
      font-family: 'Google Symbols', 'Material Symbols Outlined', 'Google Material Icons', 'Material Icons' !important;
      text-transform: none !important;
    }
    .material-symbols,
    [class*="material-symbols"] {
      font-family: 'Material Symbols Outlined', 'Material Symbols Rounded', 'Material Symbols Sharp', 'Google Symbols', 'Google Material Icons', 'Material Icons' !important;
      text-transform: none !important;
    }
    [${LIGATURE_ICON_ATTRIBUTE}] {
      font-family: ${getLigatureIconFontStack()} !important;
      text-transform: none !important;
    }
    [${GOOGLE_LOGO_ATTRIBUTE}],
    [${GOOGLE_LOGO_ATTRIBUTE}] * {
      font-family: 'Google Sans', 'Product Sans', Roboto, Arial, sans-serif !important;
      text-transform: none !important;
    }
  `;
}

function isIconFontName(name) {
  const normalized = name.toLowerCase();
  return (
    normalized.includes('icon') ||
    normalized.includes('symbol') ||
    normalized.includes('awesome') ||
    normalized.includes('glyp') ||
    normalized.includes('brand') ||
    normalized.includes('lucide') ||
    normalized.includes('feather') ||
    normalized.includes('octicon') ||
    normalized.includes('entypo') ||
    normalized.includes('logo') ||
    normalized.includes('social') ||
    normalized.includes('payment')
  );
}

function scanStylesheets(root) {
  const doc = root || document;
  const sheets = doc.styleSheets;
  if (!sheets) return;

  const detectedClasses = new Set();
  const iconFontFamilies = new Set();

  function processRules(rules) {
    if (!rules) return;
    for (const rule of rules) {
      if (rule.type === 5) { // CSSRule.FONT_FACE_RULE
        const fontFamily = rule.style && rule.style.getPropertyValue('font-family');
        if (fontFamily) {
          const cleanName = fontFamily.replace(/['"]/g, '').trim();
          if (isIconFontName(cleanName)) {
            iconFontFamilies.add(cleanName);
          }
        }
      } else if (rule.type === 1) { // CSSRule.STYLE_RULE
        const fontFamily = rule.style && rule.style.fontFamily;
        if (fontFamily) {
          const families = fontFamily.split(',').map(f => f.replace(/['"]/g, '').trim());
          const hasIconFont = families.some(f => isIconFontName(f) || iconFontFamilies.has(f));
          if (hasIconFont && rule.selectorText) {
            let selector = rule.selectorText;
            while (selector.includes(':not(')) {
              const next = selector.replace(/:not\((?:[^)(]+|\([^)(]*\))*\)/g, '');
              if (next === selector) break;
              selector = next;
            }
            const parts = selector.split(',');
            for (const part of parts) {
              const cleanPart = part.replace(/\[[^\]]*\]/g, '').trim();
              const tokens = cleanPart.split(/[\s>+~]+/).filter(Boolean);
              const terminal = tokens.length > 0 ? tokens[tokens.length - 1] : '';
              if (!terminal) continue;
              const regex = /\.([a-zA-Z0-9_-]+)/g;
              let match;
              while ((match = regex.exec(terminal)) !== null) {
                detectedClasses.add('.' + match[1]);
              }
            }
          }
        }
      } else if (rule.cssRules) {
        // Traverse nested grouping rules (@media, @supports, @layer)
        try {
          processRules(rule.cssRules);
        } catch (_e) {}
      }
    }
  }

  for (const sheet of sheets) {
    try {
      const ownerNode = sheet.ownerNode;
      if (
        ownerNode &&
        ownerNode.classList &&
        (ownerNode.classList.contains('font-changer-style') ||
          ownerNode.classList.contains('font-changer-pip-font-faces'))
      ) {
        continue;
      }
      const rules = sheet.cssRules || sheet.rules;
      if (rules) {
        processRules(rules);
      }
    } catch (_e) {
      // Ignore cross-origin stylesheet access error
    }
  }

  let changed = false;
  for (const className of detectedClasses) {
    if (!iconSelectorsSet.has(className)) {
      iconSelectorsSet.add(className);
      dynamicIconSelectors.push(className);
      changed = true;
    }
  }

  if (changed) {
    updateFontApplication();
  }
}

var stylesheetScanTimeout;
function triggerStylesheetScan(root) {
  if (stylesheetScanTimeout) clearTimeout(stylesheetScanTimeout);
  stylesheetScanTimeout = setTimeout(() => {
    scanStylesheets(root);
  }, 100);
}

function syncRoot(root) {
  if (!root) return;
  
  let style = rootStyles.get(root);
  if (!style || !style.isConnected) {
    const doc = root.nodeType === 9 ? root : (root.ownerDocument || document);
    const container = root === document
      ? (doc.head || doc.documentElement)
      : (root.nodeType === 9 ? (root.head || root.documentElement) : root);

    if (!container) return;

    try {
      if (typeof container.querySelectorAll === 'function') {
        const existingStyles = container.querySelectorAll('style.font-changer-style');
        if (existingStyles && existingStyles.length > 0) {
          style = existingStyles[0];
          for (let i = 1; i < existingStyles.length; i++) {
            if (typeof existingStyles[i].remove === 'function') {
              existingStyles[i].remove();
            }
          }
        }
      }
      if (!style) {
        style = doc.createElement('style');
        style.className = 'font-changer-style';
        container.appendChild(style);
      }
      rootStyles.set(root, style);
    } catch (e) {
      return; // 某些 ShadowRoot 可能不允許 append
    }
  }

  const nextCss = shouldApplyCustomFont() ? buildCss(isShadowRootNode(root)) : '';
  if (style.textContent !== nextCss) {
    style.textContent = nextCss;
  }
}

function syncAllRoots() {
  scanStylesheets(document);
  scanForLigatureIcons(document.documentElement);
  syncRoot(document);
  trackedShadowRoots.forEach((root) => {
    if (root.nodeType === 9 && trackedPipDocuments.has(root)) {
      if (shouldApplyCustomFont()) {
        copyFontResourcesToPip(root);
      }
    }
    scanStylesheets(root);
    scanForLigatureIcons(root);
    syncRoot(root);
  });
}

// 使用 TreeWalker 遍歷 Shadow DOM，效能遠好於 querySelectorAll('*')
function scanForShadowRoots(rootNode) {
  if (!rootNode) return;
  const doc = rootNode.nodeType === 9 ? rootNode : (rootNode.ownerDocument || document);
  const walker = doc.createTreeWalker(
    rootNode,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        return node.shadowRoot ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    }
  );

  const shadowRoots = [];
  if (isElementNode(rootNode) && rootNode.shadowRoot) {
    shadowRoots.push(rootNode.shadowRoot);
  }

  let curr;
  while (curr = walker.nextNode()) {
    if (curr.shadowRoot) shadowRoots.push(curr.shadowRoot);
  }

  shadowRoots.forEach(registerShadowRoot);
}

function registerShadowRoot(root) {
  if (!root || trackedShadowRoots.has(root)) {
    if (root && isFontEnabled) syncRoot(root);
    return;
  }

  trackedShadowRoots.add(root);
  syncRoot(root);
  
  // 監聽 ShadowRoot 內部的變動
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      handleRemovedNodes(mutation);
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
          scanForLigatureIcons(node);
          if (node.nodeType === Node.ELEMENT_NODE) {
            scanForShadowRoots(node);
            const tagName = node.tagName.toLowerCase();
            if (tagName === 'style' || tagName === 'link') {
              triggerStylesheetScan(root);
            }
          }
        }
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  // 初始掃描內層
  scanForShadowRoots(root);
  scanStylesheets(root);
  scanForLigatureIcons(root);
}

// 主動掃描與初始化
function applyFont(font) {
  currentFontFamily = font || '';
  currentFontMode = FONT_MODE_BASIC;
  currentAdvancedFontConfig = createAdvancedFontConfig();
  isFontEnabled = true;
  syncAllRoots();
  if (shouldApplyCustomFont()) {
    scanForShadowRoots(document.documentElement);
  }
}

function applyFontSettings(settings) {
  currentFontFamily = typeof settings.font === 'string' ? settings.font : '';
  currentFontMode = normalizeFontMode(settings.fontMode);
  currentAdvancedFontConfig = createAdvancedFontConfig(settings.advancedFontConfig);
  isFontEnabled = true;
  syncAllRoots();
  if (shouldApplyCustomFont()) {
    scanForShadowRoots(document.documentElement);
  }
}

function restoreOriginalFont() {
  isFontEnabled = false;
  currentFontFamily = '';
  syncAllRoots();
}

function updateFontApplication() {
  syncAllRoots();
  if (shouldApplyCustomFont()) {
    scanForShadowRoots(document.documentElement);
  }
}

function handleRemovedNodes(mutation) {
  if (!mutation || !mutation.removedNodes || mutation.removedNodes.length === 0) return;
  const target = mutation.target;
  if (!target || target.nodeType !== Node.ELEMENT_NODE) return;

  const candidate = (target.hasAttribute && target.hasAttribute(GOOGLE_LOGO_ATTRIBUTE))
    ? target
    : (typeof target.closest === 'function' ? target.closest(`[${GOOGLE_LOGO_ATTRIBUTE}]`) : null);

  if (candidate) {
    const hasRemainingLogo = typeof candidate.querySelector === 'function' &&
      Boolean(candidate.querySelector(`[${GOOGLE_LOGO_ATTRIBUTE}]`));
    const text = candidate.textContent || '';
    if (!hasRemainingLogo && !normalizeLigatureText(text).includes('google_logo')) {
      unmarkGoogleLogoElement(candidate);
    }
  }
}

// 監聽 DOM 變動 (Debounced with mutation accumulation & max-wait throttle)
var pendingMutations = [];
var scanTimeout = null;
var scanMaxWaitTimeout = null;
var OBSERVER_DEBOUNCE_MS = 60;
var OBSERVER_MAX_WAIT_MS = 250;

function processPendingMutations() {
  if (scanTimeout) {
    clearTimeout(scanTimeout);
    scanTimeout = null;
  }
  if (scanMaxWaitTimeout) {
    clearTimeout(scanMaxWaitTimeout);
    scanMaxWaitTimeout = null;
  }

  if (pendingMutations.length === 0) return;
  const mutationsToProcess = pendingMutations.splice(0);

  for (const mutation of mutationsToProcess) {
    if (mutation.type === 'characterData') {
      updateLigatureIconTextNode(mutation.target);
      continue;
    }
    handleRemovedNodes(mutation);
    if (mutation.addedNodes) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
          scanForLigatureIcons(node);
          if (node.nodeType === Node.ELEMENT_NODE) {
            scanForShadowRoots(node);
            const tagName = (node.tagName || '').toLowerCase();
            if (tagName === 'style' || tagName === 'link' || (typeof node.querySelector === 'function' && node.querySelector('style, link'))) {
              triggerStylesheetScan(document);
            }
          }
        }
      }
    }
  }
}

if (typeof documentObserver !== 'undefined' && documentObserver && typeof documentObserver.disconnect === 'function') {
  try {
    documentObserver.disconnect();
  } catch (_e) {}
}

var documentObserver = new MutationObserver((mutations) => {
  for (let i = 0; i < mutations.length; i++) {
    pendingMutations.push(mutations[i]);
  }
  if (scanTimeout) clearTimeout(scanTimeout);
  scanTimeout = setTimeout(processPendingMutations, OBSERVER_DEBOUNCE_MS);
  if (!scanMaxWaitTimeout) {
    scanMaxWaitTimeout = setTimeout(processPendingMutations, OBSERVER_MAX_WAIT_MS);
  }
  if (pendingMutations.length > 500) {
    processPendingMutations();
  }
});

documentObserver.observe(document, { childList: true, subtree: true, characterData: true });

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (shouldApplyCustomFont()) {
        scanForLigatureIcons(document.documentElement);
        scanStylesheets(document);
      }
    }, { once: true });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('load', () => {
      if (shouldApplyCustomFont()) {
        scanForLigatureIcons(document.documentElement);
        scanStylesheets(document);
      }
    }, { once: true });
  }
}

function collectFontRules() {
  const fontRules = [];
  const sheets = document.styleSheets;
  if (sheets) {
    for (const sheet of sheets) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (const rule of rules) {
          if (rule.type === 5 || (rule.cssText && rule.cssText.startsWith('@font-face'))) {
            fontRules.push(rule.cssText);
          }
        }
      } catch (_e) {
        // Cross-origin stylesheet access error
      }
    }
  }

  // Also extract from inline <style> tags in case cssRules failed or wasn't accessible
  try {
    const styleElements = document.querySelectorAll('style:not(.font-changer-style):not(.font-changer-pip-font-faces)');
    for (const styleEl of styleElements) {
      const text = styleEl.textContent || '';
      if (text.includes('@font-face')) {
        const matches = text.match(/@font-face\s*\{[^}]+\}/g);
        if (matches) {
          for (const match of matches) {
            if (!fontRules.includes(match)) {
              fontRules.push(match);
            }
          }
        }
      }
    }
  } catch (_e) {}

  return fontRules.join('\n');
}

function copyFontResourcesToPip(pipDoc) {
  if (!pipDoc) return;

  // 1. Share FontFace objects via CSS Font Loading API
  if (document.fonts && pipDoc.fonts) {
    try {
      document.fonts.forEach((fontFace) => {
        try {
          pipDoc.fonts.add(fontFace);
        } catch (_e) {}
      });
    } catch (_e) {}
  }

  // 2. Copy font-related <link> tags (e.g. Google Fonts / gstatic)
  try {
    const links = document.querySelectorAll('link[rel="stylesheet"], link[rel="preload"][as="font"], link[rel="preload"][as="style"]');
    for (const link of links) {
      const href = link.href || '';
      if (
        href.includes('fonts.googleapis.com') ||
        href.includes('gstatic.com') ||
        href.includes('font') ||
        href.includes('icon') ||
        href.includes('symbol')
      ) {
        if (!pipDoc.querySelector(`link[href="${href}"]`)) {
          const cloned = pipDoc.createElement('link');
          cloned.rel = link.rel;
          cloned.href = href;
          if (link.as) cloned.as = link.as;
          if (link.crossOrigin) cloned.crossOrigin = link.crossOrigin;
          (pipDoc.head || pipDoc.documentElement).appendChild(cloned);
        }
      }
    }
  } catch (_e) {}

  // 3. Copy @font-face rules from main document stylesheets
  try {
    const fontCSS = collectFontRules();
    if (fontCSS) {
      let fontStyle = pipDoc.querySelector('style.font-changer-pip-font-faces');
      if (!fontStyle) {
        fontStyle = pipDoc.createElement('style');
        fontStyle.className = 'font-changer-pip-font-faces';
        (pipDoc.head || pipDoc.documentElement).appendChild(fontStyle);
      }
      if (fontStyle.textContent !== fontCSS) {
        fontStyle.textContent = fontCSS;
      }
    }
  } catch (_e) {}
}

function registerDocumentPictureInPicture(pipWindow) {
  if (!pipWindow || !pipWindow.document) return;
  const pipDoc = pipWindow.document;

  if (trackedPipDocuments.has(pipDoc)) {
    if (shouldApplyCustomFont()) {
      copyFontResourcesToPip(pipDoc);
      scanStylesheets(pipDoc);
      scanForLigatureIcons(pipDoc);
      syncRoot(pipDoc);
    }
    return;
  }

  trackedPipDocuments.add(pipDoc);
  trackedShadowRoots.add(pipDoc);

  if (shouldApplyCustomFont()) {
    copyFontResourcesToPip(pipDoc);
    scanStylesheets(pipDoc);
    scanForLigatureIcons(pipDoc);
    syncRoot(pipDoc);
    scanForShadowRoots(pipDoc);

    if (document.fonts && typeof document.fonts.ready?.then === 'function') {
      document.fonts.ready.then(() => {
        if (shouldApplyCustomFont() && trackedPipDocuments.has(pipDoc)) {
          copyFontResourcesToPip(pipDoc);
        }
      }).catch(() => {});
    }
  }

  let pendingPipMutations = [];
  let pipScanTimeout = null;
  let pipScanMaxWaitTimeout = null;

  function processPendingPipMutations() {
    if (pipScanTimeout) {
      clearTimeout(pipScanTimeout);
      pipScanTimeout = null;
    }
    if (pipScanMaxWaitTimeout) {
      clearTimeout(pipScanMaxWaitTimeout);
      pipScanMaxWaitTimeout = null;
    }

    if (pendingPipMutations.length === 0) return;
    const batch = pendingPipMutations.splice(0);
    let hasStyleOrLinkAdded = false;

    for (const mutation of batch) {
      if (mutation.type === 'characterData') {
        updateLigatureIconTextNode(mutation.target);
        continue;
      }
      handleRemovedNodes(mutation);
      if (mutation.addedNodes) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            scanForLigatureIcons(node);
            if (node.nodeType === Node.ELEMENT_NODE) {
              scanForShadowRoots(node);
              const tagName = (node.tagName || '').toLowerCase();
              if (tagName === 'style' || tagName === 'link' || (typeof node.querySelector === 'function' && node.querySelector('style, link'))) {
                hasStyleOrLinkAdded = true;
              }
            }
          }
        }
      }
    }

    if (hasStyleOrLinkAdded) {
      copyFontResourcesToPip(pipDoc);
      triggerStylesheetScan(pipDoc);
    }
  }

  const observer = new MutationObserver((mutations) => {
    if (!shouldApplyCustomFont()) return;

    for (let i = 0; i < mutations.length; i++) {
      pendingPipMutations.push(mutations[i]);
    }
    if (pipScanTimeout) clearTimeout(pipScanTimeout);
    pipScanTimeout = setTimeout(processPendingPipMutations, OBSERVER_DEBOUNCE_MS);
    if (!pipScanMaxWaitTimeout) {
      pipScanMaxWaitTimeout = setTimeout(processPendingPipMutations, OBSERVER_MAX_WAIT_MS);
    }
    if (pendingPipMutations.length > 500) {
      processPendingPipMutations();
    }
  });

  try {
    observer.observe(pipDoc, { childList: true, subtree: true, characterData: true });
  } catch (_e) {}

  const cleanup = () => {
    observer.disconnect();
    trackedPipDocuments.delete(pipDoc);
    trackedShadowRoots.delete(pipDoc);
  };

  pipWindow.addEventListener('pagehide', cleanup, { once: true });
  pipWindow.addEventListener('unload', cleanup, { once: true });
}

// 監聽 Document Picture-in-Picture 視窗
if (typeof documentPictureInPicture !== 'undefined' && documentPictureInPicture) {
  if (documentPictureInPicture.window) {
    registerDocumentPictureInPicture(documentPictureInPicture.window);
  }
  documentPictureInPicture.addEventListener('enter', (event) => {
    registerDocumentPictureInPicture(event.window || documentPictureInPicture.window);
  });
}

// 監聽訊息
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (!request || typeof request !== 'object') return;

  if (request.action === 'changeFont') {
    if (request.isEnabled) {
      applyFontSettings(request);
    } else {
      restoreOriginalFont();
    }
    const response = { ok: true };
    if (typeof sendResponse === 'function') {
      sendResponse(response);
    }
    return Promise.resolve(response);
  }

  if (request.action === 'setSiteDisabled') {
    const ok = setSiteDisabled(Boolean(request.isDisabled));
    updateFontApplication();
    const response = {
      ok,
      isSiteDisabled: isSiteDisabled(),
    };
    if (typeof sendResponse === 'function') {
      sendResponse(response);
    }
    return Promise.resolve(response);
  }

  if (request.action === 'getPageState') {
    const response = {
      ok: true,
      isSiteDisabled: isSiteDisabled(),
      href: location.href,
      origin: location.origin,
      host: location.host,
    };
    if (typeof sendResponse === 'function') {
      sendResponse(response);
    }
    return Promise.resolve(response);
  }
});

// 初始化
chrome.storage.sync.get(['selectedFont', 'isEnabled', 'fontMode', 'advancedFontConfig'], (result) => {
  if (result.isEnabled) {
    applyFontSettings({
      font: result.selectedFont,
      fontMode: result.fontMode,
      advancedFontConfig: result.advancedFontConfig,
    });
  }
});

// 監聽儲存變更
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  
  const nextEnabled = changes.isEnabled ? changes.isEnabled.newValue : isFontEnabled;
  const nextFont = changes.selectedFont ? changes.selectedFont.newValue : currentFontFamily;
  const nextMode = changes.fontMode ? changes.fontMode.newValue : currentFontMode;
  const nextAdvancedFontConfig = changes.advancedFontConfig
    ? changes.advancedFontConfig.newValue
    : currentAdvancedFontConfig;

  if (nextEnabled) {
    applyFontSettings({
      font: nextFont,
      fontMode: nextMode,
      advancedFontConfig: nextAdvancedFontConfig,
    });
  } else {
    restoreOriginalFont();
  }
});
