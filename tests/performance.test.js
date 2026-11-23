'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const shared = require('../extension/shared.js');
const { loadContentEnvironment } = require('./helpers/extension-env.js');

/**
 * Installs a deterministic virtual clock onto an extension VM sandbox so
 * debounce/maxWait timers and `Date.now()` advance without real wall-clock waits.
 */
function installFakeClock(env, startTime = 1000) {
  let now = startTime;
  let seq = 0;
  const timers = new Map();
  const RealDate = env.sandbox.Date;

  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) {
        super(now);
      } else {
        super(...args);
      }
    }
    static now() {
      return now;
    }
  }

  env.sandbox.Date = FakeDate;
  env.sandbox.setTimeout = (fn, delay, ...args) => {
    const id = ++seq;
    const ms = Math.max(0, Number(delay) || 0);
    timers.set(id, { time: now + ms, seq: id, fn: () => fn(...args) });
    return id;
  };
  env.sandbox.clearTimeout = (id) => {
    timers.delete(id);
  };

  function popEarliest(maxTime) {
    let earliestId = null;
    let earliest = null;
    for (const [id, entry] of timers.entries()) {
      if (
        !earliest ||
        entry.time < earliest.time ||
        (entry.time === earliest.time && entry.seq < earliest.seq)
      ) {
        earliest = entry;
        earliestId = id;
      }
    }
    if (!earliest || (maxTime !== undefined && earliest.time > maxTime)) {
      return null;
    }
    timers.delete(earliestId);
    return earliest;
  }

  function advanceBy(ms) {
    const targetTime = now + Math.max(0, Number(ms) || 0);
    for (;;) {
      const next = popEarliest(targetTime);
      if (!next) break;
      now = next.time;
      next.fn();
    }
    now = targetTime;
  }

  function drainAll(maxSteps = 2000) {
    let steps = 0;
    for (;;) {
      const next = popEarliest(undefined);
      if (!next) break;
      if (++steps > maxSteps) {
        throw new Error(`FakeClock exceeded ${maxSteps} timer executions`);
      }
      now = next.time;
      next.fn();
    }
  }

  return {
    get now() {
      return now;
    },
    advanceBy,
    drainAll,
    pendingCount() {
      return timers.size;
    },
  };
}

/**
 * Wraps `sheet.disabled` on a FakeCSSStyleSheet to count setter writes while
 * keeping `sheet.disabled` reads accurate for `getComputedStyle`.
 */
function trackSheetDisabledWrites(sheet) {
  let writes = 0;
  let disabledVal = Boolean(sheet.disabled);
  Object.defineProperty(sheet, 'disabled', {
    configurable: true,
    get() {
      return disabledVal;
    },
    set(v) {
      writes += 1;
      disabledVal = Boolean(v);
    },
  });
  return {
    get count() {
      return writes;
    },
    reset() {
      writes = 0;
    },
  };
}

/**
 * Wraps `node.querySelectorAll` to count subtree/full-DOM scans.
 */
function trackQsaCalls(node) {
  let calls = 0;
  const orig = node.querySelectorAll.bind(node);
  node.querySelectorAll = (selector) => {
    calls += 1;
    return orig(selector);
  };
  return {
    get count() {
      return calls;
    },
    reset() {
      calls = 0;
    },
  };
}

test('1. AI streaming & CJK/English prose mutations incur zero sheet.disabled toggles and zero measureText calls', () => {
  let measureTextCalls = 0;
  const env = loadContentEnvironment({
    syncStorage: { isEnabled: true, selectedFont: 'PingFang TC' },
    fontFaces: [
      {
        family: '"Inter"',
        status: 'loaded',
        unicodeRange: 'U+0-10FFFF',
        load() {
          return Promise.resolve(this);
        },
      },
    ],
    measureText(_font, text) {
      measureTextCalls += 1;
      return { width: text.replace(/\u200C/g, '').length * 10 };
    },
  });

  const clock = installFakeClock(env);
  const doc = env.dom.document;
  assert.equal(doc.adoptedStyleSheets.length, 1);
  const sheetHook = trackSheetDisabledWrites(doc.adoptedStyleSheets[0]);

  const streamRoot = doc.createElement('div');
  streamRoot.className = 'ai-stream-root';
  doc.body.appendChild(streamRoot);

  const liveCjkSpan = doc.createElement('span');
  liveCjkSpan.rawStyle.fontFamily = '"Inter", sans-serif';
  const liveCjkText = doc.createTextNode('你好世界');
  liveCjkSpan.appendChild(liveCjkText);
  streamRoot.appendChild(liveCjkSpan);

  const liveEnglishP = doc.createElement('p');
  liveEnglishP.rawStyle.fontFamily = '"Inter", sans-serif';
  const liveEnglishText = doc.createTextNode('Initial streaming sentence.');
  liveEnglishP.appendChild(liveEnglishText);
  streamRoot.appendChild(liveEnglishP);

  const obs = env.dom.getObserverStats().activeObservers[0];
  let mutationCount = 0;

  // 50 streaming rounds x 6 mutations = 300 mutations across childList & characterData.
  for (let i = 0; i < 50; i += 1) {
    const batch = [];

    const cjkP = doc.createElement('p');
    cjkP.textContent = `第 ${i} 段串流文字：人工智慧正在逐字輸出完整的中文回覆內容。`;
    streamRoot.appendChild(cjkP);
    batch.push({ type: 'childList', target: streamRoot, addedNodes: [cjkP], removedNodes: [] });

    const wrapperDiv = doc.createElement('div');
    const innerSpan = doc.createElement('span');
    innerSpan.rawStyle.fontFamily = '"Inter", sans-serif';
    innerSpan.textContent = '你好世界，這是一段串流回覆文字';
    wrapperDiv.appendChild(innerSpan);
    streamRoot.appendChild(wrapperDiv);
    batch.push({ type: 'childList', target: streamRoot, addedNodes: [wrapperDiv], removedNodes: [] });

    const li = doc.createElement('li');
    li.textContent = `Streaming list item ${i} with normal prose text.`;
    streamRoot.appendChild(li);
    batch.push({ type: 'childList', target: streamRoot, addedNodes: [li], removedNodes: [] });

    const enP = doc.createElement('p');
    enP.rawStyle.fontFamily = '"Inter", sans-serif';
    enP.textContent = 'Here is a normal multi-word English paragraph streamed by an AI assistant.';
    streamRoot.appendChild(enP);
    batch.push({ type: 'childList', target: streamRoot, addedNodes: [enP], removedNodes: [] });

    const codeEl = doc.createElement('code');
    codeEl.textContent = 'const result = compute_value(123);';
    streamRoot.appendChild(codeEl);
    batch.push({ type: 'childList', target: streamRoot, addedNodes: [codeEl], removedNodes: [] });

    if (i % 2 === 0) {
      const oldValue = liveCjkText.nodeValue;
      liveCjkText.nodeValue = `你好世界，這是一段串流回覆文字（第 ${i} 次更新）`;
      batch.push({ type: 'characterData', target: liveCjkText, oldValue });
    } else {
      const oldValue = liveEnglishText.nodeValue;
      liveEnglishText.nodeValue = `Here is streaming update number ${i} with multiple normal words.`;
      batch.push({ type: 'characterData', target: liveEnglishText, oldValue });
    }

    mutationCount += batch.length;
    obs.trigger(batch);
    clock.advanceBy(16);
  }

  assert.equal(mutationCount, 300);
  clock.advanceBy(1000);
  clock.drainAll();

  assert.equal(sheetHook.count, 0);
  assert.equal(measureTextCalls, 0);
});

test('2. 60fps JS style animations & --scroll-y / --tw-* CSS variable updates incur zero thrash and zero full-DOM rescans', () => {
  const env = loadContentEnvironment({
    syncStorage: { isEnabled: true, selectedFont: 'PingFang TC' },
  });
  const clock = installFakeClock(env);
  const doc = env.dom.document;

  const leafSpans = [];
  for (let i = 0; i < 4; i += 1) {
    const span = doc.createElement('span');
    span.textContent = 'Moving label';
    doc.body.appendChild(span);
    leafSpans.push(span);
  }

  const card = doc.createElement('div');
  card.className = 'card';
  const cardTitle = doc.createElement('p');
  cardTitle.textContent = 'Interactive card heading text';
  const cardSub = doc.createElement('span');
  cardSub.textContent = 'Card subtitle prose';
  card.appendChild(cardTitle);
  card.appendChild(cardSub);
  doc.body.appendChild(card);

  const main = doc.createElement('main');
  for (let i = 0; i < 150; i += 1) {
    const item = doc.createElement('p');
    item.textContent = `Main container prose paragraph number ${i} with more than sixty-four characters in total.`;
    main.appendChild(item);
  }
  doc.body.appendChild(main);

  const sheetHook = trackSheetDisabledWrites(doc.adoptedStyleSheets[0]);
  const bodyQsa = trackQsaCalls(doc.body);
  const mainQsa = trackQsaCalls(main);

  const targets = [doc.documentElement, doc.body, main, leafSpans[0], leafSpans[1]];
  const lastStyles = new WeakMap();
  const obs = env.dom.getObserverStats().activeObservers[0];

  // 50 animation frames x 20 style mutations = 1,000 mutations at 60fps (~16ms/frame).
  let totalMutations = 0;
  for (let frame = 0; frame < 50; frame += 1) {
    const batch = [];
    for (let j = 0; j < 20; j += 1) {
      const idx = totalMutations++;
      const target = targets[idx % targets.length];
      const nextStyle = [
        `transform: translate3d(${idx}px, ${idx % 30}px, 0)`,
        `opacity: ${(0.2 + (idx % 8) * 0.1).toFixed(1)}`,
        `width: ${25 + (idx % 60)}%`,
        `--scroll-y: ${idx * 2}px`,
        `--tw-translate-x: ${idx % 48}px`,
        `--radix-popper-available-height: ${240 + (idx % 120)}px`,
      ].join('; ');
      const oldValue = lastStyles.get(target) || '';
      target.setAttribute('style', nextStyle);
      lastStyles.set(target, nextStyle);
      batch.push({ type: 'attributes', attributeName: 'style', oldValue, target });
    }
    obs.trigger(batch);
    clock.advanceBy(16);
  }

  assert.equal(totalMutations, 1000);

  // Wait well past both observer debounce and deferred container rescan windows (>450ms and >1000ms maxWait).
  clock.advanceBy(1500);
  clock.drainAll();

  assert.equal(sheetHook.count, 0);
  assert.equal(bodyQsa.count, 0);
  assert.equal(mainQsa.count, 0);
});

test('3. Burst of 2,500 MutationRecords coalesces into at most one pass (<= 2 sheet.disabled writes)', () => {
  const env = loadContentEnvironment({
    syncStorage: { isEnabled: true, selectedFont: 'PingFang TC' },
  });
  const clock = installFakeClock(env);
  const doc = env.dom.document;

  const connectedEls = [];
  const iconEls = [];
  for (let i = 0; i < 40; i += 1) {
    const el = doc.createElement('span');
    if (i % 10 === 0) {
      el.rawStyle.fontFamily = '"Material Icons", sans-serif';
      el.textContent = 'home';
      iconEls.push(el);
    } else {
      el.textContent = `Ordinary label item ${i}`;
    }
    doc.body.appendChild(el);
    connectedEls.push(el);
  }

  const detachedRemovedNodes = [];
  for (let i = 0; i < 10; i += 1) {
    const detached = doc.createElement('span');
    detached.textContent = 'home';
    detachedRemovedNodes.push(detached);
  }

  const sheetHook = trackSheetDisabledWrites(doc.adoptedStyleSheets[0]);
  const obs = env.dom.getObserverStats().activeObservers[0];

  // Trigger 5 rapid batches x 500 records = 2,500 MutationRecords in one tick.
  let generated = 0;
  for (let b = 0; b < 5; b += 1) {
    const records = [];
    for (let i = 0; i < 500; i += 1) {
      const seq = generated++;
      const mod = seq % 3;
      if (mod === 0) {
        const target = connectedEls[seq % connectedEls.length];
        const prevClass = target.className;
        target.className = `state-${seq % 7}`;
        records.push({
          type: 'attributes',
          attributeName: 'class',
          oldValue: prevClass,
          target,
        });
      } else if (mod === 1) {
        const removed = detachedRemovedNodes[seq % detachedRemovedNodes.length];
        records.push({
          type: 'childList',
          target: doc.body,
          addedNodes: [],
          removedNodes: [removed],
        });
      } else {
        const reused = connectedEls[seq % connectedEls.length];
        records.push({
          type: 'childList',
          target: doc.body,
          addedNodes: [reused],
          removedNodes: [],
        });
      }
    }
    obs.trigger(records);
  }

  assert.equal(generated, 2500);
  clock.advanceBy(1500);
  clock.drainAll();

  assert.ok(
    sheetHook.count <= 2,
    `Expected <= 2 sheet.disabled toggles for coalesced 2,500-mutation burst, got ${sheetHook.count}`
  );
  assert.equal(iconEls[0].hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT), true);
  assert.equal(clock.pendingCount(), 0);
});

test('4. 500 open ShadowRoots share 1 single CSSStyleSheet and scale sheet.disabled toggling in O(1)', () => {
  const env = loadContentEnvironment({
    syncStorage: { isEnabled: true, selectedFont: 'Arial' },
  });
  const doc = env.dom.document;

  const shadowRoots = [];
  for (let i = 0; i < 500; i += 1) {
    const host = doc.createElement('div');
    const sr = host.attachShadow();
    doc.body.appendChild(host);
    shadowRoots.push(sr);
  }

  // Trigger ShadowRoot discovery & sheet attachment.
  env.chrome.storage.sync.set({ selectedFont: 'Helvetica' });

  assert.equal(env.controller().getState().trackedShadowCount, 500);
  for (let i = 0; i < shadowRoots.length; i += 1) {
    assert.equal(shadowRoots[i].adoptedStyleSheets.length, 1);
  }

  const uniqueShadowSheets = new Set(shadowRoots.map((sr) => sr.adoptedStyleSheets[0]));
  assert.equal(uniqueShadowSheets.size, 1);

  const sharedShadowSheet = shadowRoots[0].adoptedStyleSheets[0];
  assert.equal(doc.adoptedStyleSheets.length, 1);
  const docSheetHook = trackSheetDisabledWrites(doc.adoptedStyleSheets[0]);
  const shadowSheetHook = trackSheetDisabledWrites(sharedShadowSheet);

  const iconEl = doc.createElement('span');
  iconEl.rawStyle.fontFamily = '"Material Icons", sans-serif';
  iconEl.textContent = 'home';
  doc.body.appendChild(iconEl);

  env.controller().classifyElement(iconEl, doc, true);

  assert.equal(iconEl.hasAttribute(shared.ACTIVE_DOM_ATTRS.ICON_FONT), true);
  assert.equal(shadowRoots[499].adoptedStyleSheets[0], sharedShadowSheet);

  const totalDisabledWrites = docSheetHook.count + shadowSheetHook.count;
  assert.ok(
    totalDisabledWrites <= 4,
    `Expected <= 4 total sheet.disabled writes across doc + shared shadow sheet, got ${totalDisabledWrites}`
  );
});

test('5. 100 CJK unicode-range loadingdone events trigger 0 rescans and 8 sync <link> loads coalesce into 1 debounced rescan', () => {
  const env = loadContentEnvironment({
    syncStorage: { isEnabled: true, selectedFont: 'PingFang TC' },
  });
  const clock = installFakeClock(env);
  const doc = env.dom.document;

  const paragraph = doc.createElement('p');
  paragraph.textContent = '中文測試段落內容與排版驗證';
  doc.body.appendChild(paragraph);

  const bodyQsa = trackQsaCalls(doc.body);

  // Part A: 100 CJK unicode-range FontFace slices firing loadingdone.
  for (let i = 0; i < 100; i += 1) {
    const start = 0x4E00 + i * 0x40;
    const end = start + 0x3F;
    const slice = {
      family: '"Noto Sans TC"',
      status: 'loaded',
      unicodeRange: `U+${start.toString(16).toUpperCase()}-${end.toString(16).toUpperCase()}`,
      loadCalls: 0,
      load() {
        return Promise.resolve(this);
      },
    };
    doc.fontFaces.push(slice);
    doc.triggerLoadingDone({ fontfaces: [slice] });
  }

  clock.advanceBy(500);
  clock.drainAll();
  assert.equal(bodyQsa.count, 0);

  // Part B: Append 8 stylesheet <link> elements, register listeners, then fire 8 synchronous loads.
  const links = [];
  for (let i = 0; i < 8; i += 1) {
    const link = doc.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', `chunk-${i}.css`);
    doc.head.appendChild(link);
    links.push(link);
  }

  // Ensure watchStylesheetLinks attaches load listeners to all 8 links, then reset counter.
  env.chrome.storage.sync.set({ selectedFont: 'Helvetica' });
  bodyQsa.reset();

  for (let i = 0; i < links.length; i += 1) {
    links[i].dispatchEvent('load');
  }
  assert.equal(bodyQsa.count, 0);

  clock.advanceBy(180);
  clock.drainAll();
  assert.equal(bodyQsa.count, 1);
});

test('6. <pre><code> token storm and pure digits avoid measureText while ligatureRatioCache evicts past 512 LRU cap', () => {
  let measureTextCalls = 0;
  const env = loadContentEnvironment({
    syncStorage: { isEnabled: true, selectedFont: 'PingFang TC' },
    fontFaces: [
      {
        family: '"JetBrains Mono"',
        status: 'loaded',
        unicodeRange: 'U+0-10FFFF',
        load() {
          return Promise.resolve(this);
        },
      },
      {
        family: '"CustomUiSans"',
        status: 'loaded',
        unicodeRange: 'U+0-10FFFF',
        load() {
          return Promise.resolve(this);
        },
      },
    ],
    measureText(_font, text) {
      measureTextCalls += 1;
      return { width: text.replace(/\u200C/g, '').length * 10 };
    },
  });

  const doc = env.dom.document;

  const pre = doc.createElement('pre');
  const code = doc.createElement('code');
  pre.appendChild(code);
  for (let i = 0; i < 500; i += 1) {
    const token = doc.createElement('span');
    token.className = 'token';
    token.rawStyle.fontFamily = '"JetBrains Mono", monospace';
    token.textContent = i % 2 === 0 ? `identifier_name_${i}` : 'identifier_name';
    code.appendChild(token);
  }
  doc.body.appendChild(pre);

  const digitSpan = doc.createElement('span');
  digitSpan.rawStyle.fontFamily = '"CustomUiSans", sans-serif';
  digitSpan.textContent = '2026';
  doc.body.appendChild(digitSpan);

  // Trigger full document scan.
  env.chrome.storage.sync.set({ selectedFont: 'Noto Sans TC' });
  assert.equal(measureTextCalls, 0);

  // Also verify direct classification of pure-digit span does not invoke measureText.
  env.controller().classifyElement(digitSpan, doc, true);
  assert.equal(measureTextCalls, 0);

  // Classify 600 unique ASCII words on <span> outside <code> with loaded CustomUiSans.
  const wordSpans = [];
  for (let i = 0; i < 600; i += 1) {
    const span = doc.createElement('span');
    span.rawStyle.fontFamily = '"CustomUiSans", sans-serif';
    span.textContent = `word_${i}`;
    doc.body.appendChild(span);
    wordSpans.push(span);
  }

  for (let i = 0; i < 600; i += 1) {
    env.controller().classifyElement(wordSpans[i], doc, true);
  }
  assert.equal(measureTextCalls, 1200);

  // Re-classifying word_599 (most recent) hits the cache -> 0 new measureText calls.
  const beforeHit = measureTextCalls;
  env.controller().classifyElement(wordSpans[599], doc, true);
  assert.equal(measureTextCalls - beforeHit, 0);

  // Re-classifying word_0 (evicted past the 512 LRU cap) misses -> 2 new measureText calls.
  const beforeMiss = measureTextCalls;
  env.controller().classifyElement(wordSpans[0], doc, true);
  assert.equal(measureTextCalls - beforeMiss, 2);
});
