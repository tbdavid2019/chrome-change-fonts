const FALLBACK_STACK = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const SITE_DISABLE_KEY = 'fontChangerDisabled';
const EXCLUDE_ATTRIBUTE = 'data-font-changer-exclude';
const INTERACTIVE_EXCLUDE_SELECTOR = 'button, [role="button"], summary, [aria-haspopup], [aria-expanded]';
const FONT_MODE_BASIC = 'basic';
const FONT_MODE_ADVANCED = 'advanced';
const CJK_FONT_FAMILY = 'FontChangerCjk';
const CJK_UNICODE_RANGE = 'U+3000-303F, U+3100-312F, U+31A0-31BF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+20000-2A6DF, U+2A700-2B73F, U+2B740-2B81F, U+2B820-2CEAF, U+2CEB0-2EBEF, U+2F800-2FA1F';

let currentFontFamily = '';
let currentFontMode = FONT_MODE_BASIC;
let currentAdvancedFontConfig = createAdvancedFontConfig();
let isFontEnabled = false;

const rootStyles = new WeakMap();
const trackedShadowRoots = new Set();

// 排除不需要改字體的圖示類別
const EXCLUDE_CLASSES = [
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
  '[class*="google-material"]',
  'mat-icon',
  'md-icon',
  '.fa',
  '.fas',
  '.far',
  '.fab',
  '.glyphicon'
];

function getFontStack() {
  if (shouldUseAdvancedFontMode()) {
    const stack = [];
    if (currentAdvancedFontConfig.cjkFont) {
      stack.push(JSON.stringify(CJK_FONT_FAMILY));
    }
    if (currentAdvancedFontConfig.latinFont) {
      stack.push(JSON.stringify(currentAdvancedFontConfig.latinFont));
    }
    stack.push(FALLBACK_STACK);
    return stack.join(', ');
  }
  if (!currentFontFamily) return FALLBACK_STACK;
  return `${JSON.stringify(currentFontFamily)}, ${FALLBACK_STACK}`;
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

function buildCompositeFontFaceCss() {
  if (!shouldUseAdvancedFontMode() || !currentAdvancedFontConfig.cjkFont) {
    return '';
  }

  return `
    @font-face {
      font-family: ${JSON.stringify(CJK_FONT_FAMILY)};
      src: ${buildLocalFontSources(
        currentAdvancedFontConfig.cjkFont,
        currentAdvancedFontConfig.cjkFontId
      )};
      unicode-range: ${CJK_UNICODE_RANGE};
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }`;
}

function buildLocalFontSources(displayName, fontId) {
  const names = [displayName, fontId]
    .filter((name) => typeof name === 'string' && name)
    .filter((name, index, array) => array.indexOf(name) === index);

  return names.map((name) => `local(${JSON.stringify(name)})`).join(', ');
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

function buildFontTargetSuffix() {
  const excludeSelectors = EXCLUDE_CLASSES.concat([`[${EXCLUDE_ATTRIBUTE}]`]);
  const excludeSelector = `:not(${excludeSelectors.join('):not(')})`;

  return `${excludeSelector}:not([${EXCLUDE_ATTRIBUTE}] *)`;
}

function isLikelyLigatureIconText(text) {
  const normalized = String(text || '').trim();
  if (!normalized) return false;
  if (normalized.length > 40) return false;
  return /^[a-z0-9_]+$/.test(normalized) && normalized.includes('_');
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

  return isLikelyLigatureIconText(textContent);
}

function markExcludedElement(element) {
  if (!element || typeof element.setAttribute !== 'function') {
    return;
  }

  element.setAttribute(EXCLUDE_ATTRIBUTE, '1');
}

function markLigatureIconElement(element) {
  markExcludedElement(element);

  if (typeof element.closest === 'function') {
    markExcludedElement(element.closest(INTERACTIVE_EXCLUDE_SELECTOR));
  }
}

function updateLigatureIconTextNode(textNode) {
  if (!textNode || !isLikelyLigatureIconText(textNode.textContent)) {
    return;
  }

  const parent = textNode.parentElement || textNode.parentNode;
  if (parent && parent.nodeType === Node.ELEMENT_NODE) {
    markLigatureIconElement(parent);
  }
}

function updateLigatureIconMarker(element) {
  if (!element || typeof element.setAttribute !== 'function' || typeof element.removeAttribute !== 'function') {
    return;
  }

  if (isLigatureIconElement(element)) {
    markLigatureIconElement(element);
  } else if (element.hasAttribute(EXCLUDE_ATTRIBUTE)) {
    element.removeAttribute(EXCLUDE_ATTRIBUTE);
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

  const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let curr;
  while (curr = walker.nextNode()) {
    if (curr.nodeType === Node.TEXT_NODE) {
      updateLigatureIconTextNode(curr);
    } else {
      updateLigatureIconMarker(curr);
    }
  }
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
  `;
}

function syncRoot(root) {
  if (!root) return;
  
  let style = rootStyles.get(root);
  if (!style || !style.isConnected) {
    style = document.createElement('style');
    style.className = 'font-changer-style';
    
    try {
      if (root === document) {
        (document.head || document.documentElement).appendChild(style);
      } else {
        root.appendChild(style);
      }
      rootStyles.set(root, style);
    } catch (e) {
      return; // 某些 ShadowRoot 可能不允許 append
    }
  }

  const nextCss = shouldApplyCustomFont() ? buildCss(root instanceof ShadowRoot) : '';
  if (style.textContent !== nextCss) {
    style.textContent = nextCss;
  }
}

function syncAllRoots() {
  scanForLigatureIcons(document.documentElement);
  syncRoot(document);
  trackedShadowRoots.forEach((root) => {
    scanForLigatureIcons(root);
    syncRoot(root);
  });
}

// 使用 TreeWalker 遍歷 Shadow DOM，效能遠好於 querySelectorAll('*')
function scanForShadowRoots(rootNode) {
  const walker = document.createTreeWalker(
    rootNode,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        return node.shadowRoot ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    }
  );

  const shadowRoots = [];
  if (rootNode instanceof Element && rootNode.shadowRoot) {
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
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
          scanForLigatureIcons(node);
          if (node.nodeType === Node.ELEMENT_NODE) {
            scanForShadowRoots(node);
          }
        }
      }
    }
  });
  observer.observe(root, { childList: true, subtree: true });

  // 初始掃描內層
  scanForShadowRoots(root);
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

// 監聽 DOM 變動 (Debounced)
let scanTimeout;
const documentObserver = new MutationObserver((mutations) => {
  if (scanTimeout) clearTimeout(scanTimeout);
  
  scanTimeout = setTimeout(() => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
          scanForLigatureIcons(node);
          if (node.nodeType === Node.ELEMENT_NODE) {
            scanForShadowRoots(node);
          }
        }
      }
    }
  }, 100);
});

documentObserver.observe(document, { childList: true, subtree: true });

// 監聽訊息
chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'changeFont') {
    if (request.isEnabled) {
      applyFontSettings(request);
    } else {
      restoreOriginalFont();
    }
    return;
  }

  if (request.action === 'setSiteDisabled') {
    const ok = setSiteDisabled(Boolean(request.isDisabled));
    updateFontApplication();
    return Promise.resolve({
      ok,
      isSiteDisabled: isSiteDisabled(),
    });
  }

  if (request.action === 'getPageState') {
    return Promise.resolve({
      ok: true,
      isSiteDisabled: isSiteDisabled(),
      href: location.href,
      origin: location.origin,
      host: location.host,
    });
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
