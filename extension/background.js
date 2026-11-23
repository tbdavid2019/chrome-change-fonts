(function (global) {
  'use strict';

  var BADGE_OFF_TEXT = 'OFF';
  var BADGE_OFF_BG = '#a9471d';
  var BADGE_OFF_FG = '#ffffff';
  var SYNC_BADGE_ACTION = 'syncTabBadge';
  var GET_TAB_INCOGNITO_STATE_ACTION = 'getTabIncognitoState';
  var SYNC_TAB_INCOGNITO_STATE_ACTION = 'syncTabIncognitoState';
  var GET_CACHED_FONT_SLOTS_ACTION = 'getCachedFontSlots';
  var SET_CACHED_FONT_SLOTS_ACTION = 'setCachedFontSlots';
  var MAX_FONT_SLOTS_CACHE = 128;

  function updateTabOffBadge(actionApi, tabId, isSiteDisabled) {
    if (!actionApi || typeof actionApi.setBadgeText !== 'function' || typeof tabId !== 'number') {
      return;
    }
    var text = isSiteDisabled ? BADGE_OFF_TEXT : '';
    try {
      var p = actionApi.setBadgeText({ tabId: tabId, text: text });
      if (p && typeof p.catch === 'function') p.catch(function () {});
      if (isSiteDisabled) {
        if (typeof actionApi.setBadgeBackgroundColor === 'function') {
          var bgP = actionApi.setBadgeBackgroundColor({ tabId: tabId, color: BADGE_OFF_BG });
          if (bgP && typeof bgP.catch === 'function') bgP.catch(function () {});
        }
        if (typeof actionApi.setBadgeTextColor === 'function') {
          var fgP = actionApi.setBadgeTextColor({ tabId: tabId, color: BADGE_OFF_FG });
          if (fgP && typeof fgP.catch === 'function') fgP.catch(function () {});
        }
      }
    } catch (_e) {
      // Ignore badge update errors for closed or restricted tabs.
    }
  }

  function initBackground(chromeApi) {
    if (!chromeApi || !chromeApi.runtime || !chromeApi.runtime.onMessage) {
      return null;
    }

    // Strictly volatile in-memory store for Incognito tab overrides; never persisted to disk.
    var incognitoTabState = new Map();
    // Strictly volatile session cache of local OS font weight/style slot availability.
    var fontSlotsCache = new Map();

    function getOrCreateIncognitoEntry(tabId) {
      var entry = incognitoTabState.get(tabId);
      if (!entry) {
        entry = { disabled: null, siteFonts: Object.create(null) };
        incognitoTabState.set(tabId, entry);
      }
      return entry;
    }

    function onMessage(request, sender, sendResponse) {
      if (!request || typeof request.action !== 'string') {
        return undefined;
      }

      var senderTabId = sender && sender.tab && typeof sender.tab.id === 'number' ? sender.tab.id : null;
      var targetTabId = typeof request.tabId === 'number' ? request.tabId : senderTabId;

      if (request.action === SYNC_BADGE_ACTION) {
        if (senderTabId !== null) {
          updateTabOffBadge(chromeApi.action, senderTabId, Boolean(request.isSiteDisabled));
        }
        if (typeof sendResponse === 'function') sendResponse({ ok: true });
        return undefined;
      }

      if (request.action === GET_TAB_INCOGNITO_STATE_ACTION) {
        var existing = targetTabId !== null ? (incognitoTabState.get(targetTabId) || null) : null;
        if (typeof sendResponse === 'function') {
          sendResponse({ ok: true, state: existing });
        }
        return undefined;
      }

      if (request.action === SYNC_TAB_INCOGNITO_STATE_ACTION) {
        if (targetTabId !== null) {
          var entry = getOrCreateIncognitoEntry(targetTabId);
          if (request.hasDisabled) {
            entry.disabled = typeof request.isDisabled === 'boolean' ? request.isDisabled : null;
          }
          if (request.hasSiteFont && typeof request.host === 'string' && request.host) {
            if (request.clearToInherit) {
              delete entry.siteFonts[request.host];
            } else {
              entry.siteFonts[request.host] = request.rule || null;
            }
          }
        }
        if (typeof sendResponse === 'function') sendResponse({ ok: true });
        return undefined;
      }

      var isSenderIncognito = Boolean(sender && sender.tab && sender.tab.incognito);

      if (request.action === GET_CACHED_FONT_SLOTS_ACTION) {
        var cachedSlots = null;
        if (!isSenderIncognito && typeof request.key === 'string' && request.key && request.key.length <= 1024) {
          var foundSlots = fontSlotsCache.get(request.key);
          if (foundSlots) {
            // Refresh LRU order on read.
            fontSlotsCache.delete(request.key);
            fontSlotsCache.set(request.key, foundSlots);
            cachedSlots = {
              bold: foundSlots.bold,
              italic: foundSlots.italic,
              boldItalic: foundSlots.boldItalic,
            };
          }
        }
        if (typeof sendResponse === 'function') {
          sendResponse({ ok: true, slots: cachedSlots });
        }
        return undefined;
      }

      if (request.action === SET_CACHED_FONT_SLOTS_ACTION) {
        if (!isSenderIncognito &&
            typeof request.key === 'string' && request.key && request.key.length <= 1024 &&
            request.slots && typeof request.slots === 'object') {
          var sanitizedSlots = Object.freeze({
            bold: Boolean(request.slots.bold),
            italic: Boolean(request.slots.italic),
            boldItalic: Boolean(request.slots.boldItalic),
          });
          if (fontSlotsCache.has(request.key)) {
            fontSlotsCache.delete(request.key);
          } else if (fontSlotsCache.size >= MAX_FONT_SLOTS_CACHE) {
            var oldestKey = fontSlotsCache.keys().next().value;
            fontSlotsCache.delete(oldestKey);
          }
          fontSlotsCache.set(request.key, sanitizedSlots);
        }
        if (typeof sendResponse === 'function') {
          sendResponse({ ok: true });
        }
        return undefined;
      }

      return undefined;
    }

    function onTabRemoved(tabId) {
      incognitoTabState.delete(tabId);
    }

    chromeApi.runtime.onMessage.addListener(onMessage);
    if (chromeApi.tabs && chromeApi.tabs.onRemoved &&
        typeof chromeApi.tabs.onRemoved.addListener === 'function') {
      chromeApi.tabs.onRemoved.addListener(onTabRemoved);
    }

    return {
      updateTabOffBadge: function (tabId, isSiteDisabled) {
        updateTabOffBadge(chromeApi.action, tabId, isSiteDisabled);
      },
      getIncognitoTabState: function (tabId) {
        return incognitoTabState.get(tabId) || null;
      },
      getCachedFontSlots: function (key) {
        return fontSlotsCache.get(key) || null;
      },
      getFontSlotsCacheSize: function () {
        return fontSlotsCache.size;
      },
      destroy: function () {
        if (chromeApi.runtime && chromeApi.runtime.onMessage &&
            typeof chromeApi.runtime.onMessage.removeListener === 'function') {
          chromeApi.runtime.onMessage.removeListener(onMessage);
        }
        if (chromeApi.tabs && chromeApi.tabs.onRemoved &&
            typeof chromeApi.tabs.onRemoved.removeListener === 'function') {
          chromeApi.tabs.onRemoved.removeListener(onTabRemoved);
        }
        incognitoTabState.clear();
        fontSlotsCache.clear();
      },
    };
  }

  global.FontChangerBackground = Object.freeze({
    BADGE_OFF_TEXT: BADGE_OFF_TEXT,
    BADGE_OFF_BG: BADGE_OFF_BG,
    BADGE_OFF_FG: BADGE_OFF_FG,
    MAX_FONT_SLOTS_CACHE: MAX_FONT_SLOTS_CACHE,
    updateTabOffBadge: updateTabOffBadge,
    initBackground: initBackground,
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.FontChangerBackground;
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id &&
      typeof window === 'undefined') {
    initBackground(chrome);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
