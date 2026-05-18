const FALLBACK_STACK = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const SITE_DISABLE_KEY = 'fontChangerDisabled';

let currentFontFamily = '';
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
  if (!currentFontFamily) return FALLBACK_STACK;
  return `${JSON.stringify(currentFontFamily)}, ${FALLBACK_STACK}`;
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

// 建立更有效率的 CSS
function buildCss(isShadowRoot) {
  const excludeSelector = `:not(${EXCLUDE_CLASSES.join('):not(')})`;
  const textSelectors = isShadowRoot
    ? [`:host${excludeSelector}`, `:host *${excludeSelector}`]
    : [
        `html${excludeSelector}`,
        `body${excludeSelector}`,
        `body *${excludeSelector}`,
      ];
  const inputSelectors = isShadowRoot
    ? [
        `:host input${excludeSelector}`,
        `:host textarea${excludeSelector}`,
        `:host select${excludeSelector}`,
        `:host button${excludeSelector}`,
      ]
    : [
        `input${excludeSelector}`,
        `textarea${excludeSelector}`,
        `select${excludeSelector}`,
        `button${excludeSelector}`,
      ];

  return `
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
  syncRoot(document);
  trackedShadowRoots.forEach((root) => {
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
        if (node.nodeType === Node.ELEMENT_NODE) {
          scanForShadowRoots(node);
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
        if (node.nodeType === Node.ELEMENT_NODE) {
          scanForShadowRoots(node);
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
      applyFont(request.font);
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
chrome.storage.sync.get(['selectedFont', 'isEnabled'], (result) => {
  if (result.isEnabled) {
    applyFont(result.selectedFont);
  }
});

// 監聽儲存變更
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  
  const nextEnabled = changes.isEnabled ? changes.isEnabled.newValue : isFontEnabled;
  const nextFont = changes.selectedFont ? changes.selectedFont.newValue : currentFontFamily;

  if (nextEnabled) {
    applyFont(nextFont);
  } else {
    restoreOriginalFont();
  }
});
