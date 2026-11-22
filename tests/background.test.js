'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bgMod = require('../extension/background.js');

test('background service worker sets and clears OFF badge on SYNC_TAB_BADGE messages', () => {
  const badgeCalls = [];
  const listeners = [];
  const fakeChrome = {
    runtime: {
      onMessage: {
        addListener(fn) {
          listeners.push(fn);
        },
        removeListener(fn) {
          const idx = listeners.indexOf(fn);
          if (idx !== -1) listeners.splice(idx, 1);
        },
      },
    },
    action: {
      setBadgeText(details) {
        badgeCalls.push({ kind: 'text', ...details });
        return Promise.resolve();
      },
      setBadgeBackgroundColor(details) {
        badgeCalls.push({ kind: 'bg', ...details });
        return Promise.resolve();
      },
      setBadgeTextColor(details) {
        badgeCalls.push({ kind: 'fg', ...details });
        return Promise.resolve();
      },
    },
  };

  const ctrl = bgMod.initBackground(fakeChrome);
  assert.equal(listeners.length, 1);

  let resp = null;
  const ret1 = listeners[0](
    { action: 'syncTabBadge', isSiteDisabled: true },
    { tab: { id: 12 } },
    (r) => { resp = r; }
  );
  assert.equal(ret1, undefined);
  assert.deepEqual(resp, { ok: true });
  assert.deepEqual(badgeCalls[0], { kind: 'text', tabId: 12, text: 'OFF' });
  assert.deepEqual(badgeCalls[1], { kind: 'bg', tabId: 12, color: '#a9471d' });
  assert.deepEqual(badgeCalls[2], { kind: 'fg', tabId: 12, color: '#ffffff' });

  listeners[0]({ action: 'syncTabBadge', isSiteDisabled: false }, { tab: { id: 12 } }, () => {});
  assert.deepEqual(badgeCalls.at(-1), { kind: 'text', tabId: 12, text: '' });

  // Unrelated messages are ignored.
  const prevLen = badgeCalls.length;
  listeners[0]({ action: 'getPageState' }, { tab: { id: 12 } }, () => {});
  assert.equal(badgeCalls.length, prevLen);

  ctrl.destroy();
  assert.equal(listeners.length, 0);
});

test('background service worker stores volatile incognito tab overrides and cleans them on tabs.onRemoved', () => {
  const msgListeners = [];
  const removedListeners = [];
  const fakeChrome = {
    runtime: {
      onMessage: {
        addListener(fn) { msgListeners.push(fn); },
        removeListener(fn) {
          const i = msgListeners.indexOf(fn);
          if (i !== -1) msgListeners.splice(i, 1);
        },
      },
    },
    tabs: {
      onRemoved: {
        addListener(fn) { removedListeners.push(fn); },
        removeListener(fn) {
          const i = removedListeners.indexOf(fn);
          if (i !== -1) removedListeners.splice(i, 1);
        },
      },
    },
    action: {
      setBadgeText() { return Promise.resolve(); },
    },
  };

  const ctrl = bgMod.initBackground(fakeChrome);
  assert.equal(removedListeners.length, 1);

  msgListeners[0](
    {
      action: 'syncTabIncognitoState',
      tabId: 77,
      hasDisabled: true,
      isDisabled: true,
      hasSiteFont: true,
      host: 'example.com',
      rule: { fontMode: 'basic', selectedFont: 'Georgia' },
    },
    {},
    () => {}
  );

  let fetched = null;
  msgListeners[0]({ action: 'getTabIncognitoState' }, { tab: { id: 77 } }, (r) => { fetched = r; });
  assert.equal(fetched.state.disabled, true);
  assert.equal(fetched.state.siteFonts['example.com'].selectedFont, 'Georgia');

  removedListeners[0](77);
  assert.equal(ctrl.getIncognitoTabState(77), null);
  ctrl.destroy();
});
