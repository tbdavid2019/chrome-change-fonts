const FALLBACK_STACK = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

let currentFontFamily = '';
let isFontEnabled = false;

const rootStyles = new WeakMap();
const rootObservers = new WeakMap();
const trackedShadowRoots = new WeakSet();

chrome.runtime.onMessage.addListener(function(request) {
  if (request.action !== 'changeFont') {
    return;
  }

  if (request.isEnabled) {
    applyFont(request.font);
  } else {
    restoreOriginalFont();
  }
});

function applyFont(font) {
  currentFontFamily = font || '';
  isFontEnabled = true;
  syncDocumentRoot();
  scanDocumentForShadowRoots();
}

function restoreOriginalFont() {
  currentFontFamily = '';
  isFontEnabled = false;
  syncAllKnownRoots();
}

function getFontStack() {
  if (!currentFontFamily) {
    return FALLBACK_STACK;
  }

  return `${JSON.stringify(currentFontFamily)}, ${FALLBACK_STACK}`;
}

function buildCss(isShadowRoot) {
  const excludeClasses = [
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
  
  const exclude = `:not(${excludeClasses.join('):not(')})`;

  const shadowSelectors = [
    `:host${exclude}`,
    `:host *${exclude}`,
    `input${exclude}`,
    `textarea${exclude}`,
    `select${exclude}`,
    `button${exclude}`,
    `option${exclude}`,
    `optgroup${exclude}`,
    `slot${exclude}`,
    `slot *${exclude}`
  ];

  const lightSelectors = [
    `html${exclude}`,
    `body${exclude}`,
    `input${exclude}`,
    `textarea${exclude}`,
    `select${exclude}`,
    `button${exclude}`,
    `option${exclude}`,
    `optgroup${exclude}`,
    `body *${exclude}`
  ];

  const selector = isShadowRoot ? shadowSelectors.join(',\n    ') : lightSelectors.join(',\n    ');

  return `
    ${selector} {
      font-family: ${getFontStack()} !important;
    }
  `;
}

function ensureStyleForRoot(root) {
  let style = rootStyles.get(root);
  if (style && style.isConnected) {
    return style;
  }

  style = document.createElement('style');
  style.className = 'font-changer-style';

  if (root === document) {
    const container = document.head || document.documentElement;
    if (!container) {
      return null;
    }
    container.appendChild(style);
  } else {
    root.appendChild(style);
  }

  rootStyles.set(root, style);
  return style;
}

function syncRoot(root) {
  const style = ensureStyleForRoot(root);
  if (!style) {
    return;
  }

  style.textContent = isFontEnabled
    ? buildCss(root instanceof ShadowRoot)
    : '';
}

function syncDocumentRoot() {
  syncRoot(document);
}

function syncAllKnownRoots() {
  syncDocumentRoot();
  scanDocumentForShadowRoots();
}

function observeRoot(root) {
  if (rootObservers.has(root)) {
    return;
  }

  const observer = new MutationObserver(function(mutations) {
    if (isFontEnabled) {
      syncRoot(root);
    }

    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(scanNodeForShadowRoots);
    });
  });

  observer.observe(root, { childList: true, subtree: true });
  rootObservers.set(root, observer);
}

function registerShadowRoot(root) {
  if (!root || trackedShadowRoots.has(root)) {
    if (root && isFontEnabled) {
      syncRoot(root);
    }
    return;
  }

  trackedShadowRoots.add(root);
  observeRoot(root);
  syncRoot(root);

  Array.from(root.children).forEach(scanNodeForShadowRoots);
}

function scanNodeForShadowRoots(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node;

  if (element.shadowRoot) {
    registerShadowRoot(element.shadowRoot);
  }

  element.querySelectorAll('*').forEach(function(descendant) {
    if (descendant.shadowRoot) {
      registerShadowRoot(descendant.shadowRoot);
    }
  });
}

function scanDocumentForShadowRoots() {
  if (document.documentElement) {
    scanNodeForShadowRoots(document.documentElement);
  }
}

const documentObserver = new MutationObserver(function(mutations) {
  if (isFontEnabled) {
    syncDocumentRoot();
  }

  mutations.forEach(function(mutation) {
    mutation.addedNodes.forEach(scanNodeForShadowRoots);
  });
});

documentObserver.observe(document, { childList: true, subtree: true });

document.addEventListener(
  'readystatechange',
  function() {
    if (isFontEnabled) {
      syncDocumentRoot();
      scanDocumentForShadowRoots();
    }
  },
  { passive: true }
);

chrome.storage.sync.get(['selectedFont', 'isEnabled'], function(result) {
  if (result.isEnabled) {
    applyFont(result.selectedFont);
  } else {
    restoreOriginalFont();
  }
});

chrome.storage.onChanged.addListener(function(changes, areaName) {
  if (areaName !== 'sync') {
    return;
  }

  const nextFont = changes.selectedFont
    ? changes.selectedFont.newValue || ''
    : currentFontFamily;
  const nextEnabled = changes.isEnabled
    ? changes.isEnabled.newValue
    : isFontEnabled;

  if (nextEnabled) {
    applyFont(nextFont);
  } else {
    restoreOriginalFont();
  }
});
