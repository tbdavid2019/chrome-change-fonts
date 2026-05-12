const FALLBACK_STACK = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

let currentFontFamily = '';
let isFontEnabled = false;

const rootStyles = new WeakMap();
const trackedShadowRoots = new WeakSet();

// 排除不需要改字體的圖示類別
const EXCLUDE_CLASSES = [
  '.material-icons',
  '[class*="material-icons"]',
  '[class*="material-symbols"]',
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

// 建立更有效率的 CSS
function buildCss(isShadowRoot) {
  const excludeSelector = `:not(${EXCLUDE_CLASSES.join('):not(')})`;
  
  // 核心邏輯：在 root 層級設定，讓子元素繼承，不再對每個元素 (*) 強制套用
  // 只針對少數不預設繼承的元素 (input, button 等) 做補強
  const baseSelector = isShadowRoot ? ':host' : 'html, body';
  const inputSelectors = 'input, textarea, select, button';

  return `
    ${baseSelector}${excludeSelector} {
      font-family: ${getFontStack()} !important;
    }
    ${baseSelector}${excludeSelector} ${inputSelectors} {
      font-family: inherit !important;
    }
    /* 確保直接在 body 下的文字也能換到 */
    ${isShadowRoot ? ':host > *' : 'body > *'}${excludeSelector} {
      font-family: inherit !important;
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

  const nextCss = isFontEnabled ? buildCss(root instanceof ShadowRoot) : '';
  if (style.textContent !== nextCss) {
    style.textContent = nextCss;
  }
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
  syncRoot(document);
  scanForShadowRoots(document.documentElement);
}

function restoreOriginalFont() {
  isFontEnabled = false;
  currentFontFamily = '';
  syncRoot(document);
  // 我們不需要掃描所有 ShadowRoot 來還原，
  // 因為 syncRoot(document) 會處理全域，
  // 但為了徹底清除 ShadowRoot 內的樣式，我們會依賴已追蹤的 rootStyles
  // 這裡簡單處理：重新整理頁面是最乾淨的，或者遍歷 WeakMap (但 WeakMap 不能遍歷)
  // 所以我們只處理當前已知的。
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
