const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const shared = require('../extension/shared.js');

function parseRanges(value) {
  return shared.parseUnicodeRangeString(value);
}

function includesCodePoint(ranges, point) {
  return ranges.some(([start, end]) => point >= start && point <= end);
}

test('shared.js can be re-evaluated in the same isolated world without SyntaxError', () => {
  const code = fs.readFileSync(path.join(__dirname, '../extension/shared.js'), 'utf8');
  const sandbox = { console, URL, Set };
  vm.createContext(sandbox);
  assert.doesNotThrow(() => {
    vm.runInContext(code, sandbox);
    vm.runInContext(code, sandbox);
  });
  assert.equal(typeof sandbox.FontChangerShared.normalizeSiteKey, 'function');
});

test('CJK and non-CJK ranges partition Unicode without overlaps or holes', () => {
  const cjk = parseRanges(shared.CJK_UNICODE_RANGE);
  const latin = parseRanges(shared.buildNonCjkUnicodeRange());
  const combined = cjk.concat(latin).sort((a, b) => a[0] - b[0]);
  let next = 0;
  for (const [start, end] of combined) {
    assert.equal(start, next, `overlap or gap at U+${next.toString(16)}`);
    assert.ok(end >= start);
    next = end + 1;
  }
  assert.equal(next, 0x110000);
});

test('CJK range covers Chinese, Japanese Kana, Korean Hangul, CJK punctuation, and halfwidth katakana while routing fullwidth ASCII/digits to non-CJK', () => {
  const cjk = parseRanges(shared.CJK_UNICODE_RANGE);
  const latin = parseRanges(shared.buildNonCjkUnicodeRange());

  for (const char of '中文あいうえおアイウエオヴヵヶ한글가나다，。！？（）［］「」～　ｶﾅ') {
    assert.equal(includesCodePoint(cjk, char.codePointAt(0)), true, char);
    assert.equal(includesCodePoint(latin, char.codePointAt(0)), false, char);
  }

  for (const char of 'META CURSOR React 12~7ＭＥＴＡＣＵＲＳＯＲ１２７ａｇｅｎｔ') {
    assert.equal(includesCodePoint(cjk, char.codePointAt(0)), false, char);
    assert.equal(includesCodePoint(latin, char.codePointAt(0)), true, char);
  }
});

test('buildLocalFontCandidates isolates weight/style slots and removes personal hacks', () => {
  const jx = shared.buildLocalFontCandidates('777jf金萱', '777jf金萱');
  assert.equal(jx.regular.includes('777jf金萱'), true);
  assert.equal(jx.regular.includes('777jf-Medium'), true);
  assert.equal(jx.regular.some((name) => name.includes('半糖')), false);
  assert.equal(jx.bold.includes('777jf金萱'), false);
  assert.equal(jx.bold.includes('777jf-Regular'), false);
  assert.equal(jx.bold.includes('777jf-Bold'), true);
  assert.equal(jx.italic.includes('777jf-Italic'), true);
  assert.equal(jx.boldItalic.includes('777jf-BoldItalic'), true);

  const shs = shared.buildLocalFontCandidates('思源黑體 TW', 'Noto Sans CJK TC');
  assert.equal(shs.regular.includes('TW'), false);
  assert.equal(shs.bold.includes('TW-Bold'), false);
  assert.equal(shs.bold.includes('Noto Sans CJK TC Bold'), true);
});

test('buildRestrictedFontFaceSetCss emits auto base rule and only resolved bold/italic slots', () => {
  const baseOnly = shared.buildRestrictedFontFaceSetCss(
    shared.CJK_FONT_FAMILY,
    'PingFang TC',
    'PingFang TC',
    shared.CJK_UNICODE_RANGE,
    { bold: false, italic: false, boldItalic: false }
  );
  assert.equal((baseOnly.match(/@font-face/g) || []).length, 1);
  assert.match(baseOnly, /font-weight:\s*auto;/);
  assert.match(baseOnly, /font-style:\s*auto;/);

  const withSlots = shared.buildRestrictedFontFaceSetCss(
    shared.LATIN_FONT_FAMILY,
    'Arial',
    'Arial',
    'U+0-FF',
    { bold: true, italic: true, boldItalic: true }
  );
  assert.equal((withSlots.match(/@font-face/g) || []).length, 4);
  assert.match(withSlots, /font-weight:\s*700;\s*font-style:\s*normal;/);
  assert.match(withSlots, /font-weight:\s*auto;\s*font-style:\s*italic;/);
  assert.match(withSlots, /font-weight:\s*700;\s*font-style:\s*italic;/);
});

test('probeLocalFontSlots caches resolved slots per context and handles rejections safely', async () => {
  const originalFontFace = globalThis.FontFace;
  let calls = 0;
  globalThis.FontFace = class FakeFontFace {
    constructor(_family, src, descriptors) {
      this.src = src;
      this.descriptors = descriptors;
    }
    load() {
      calls++;
      if (this.descriptors.weight === '700' && this.descriptors.style === 'normal') {
        return Promise.resolve(this);
      }
      return Promise.reject(new Error('not found'));
    }
  };
  try {
    const cache = new Map();
    const first = await shared.probeLocalFontSlots('Arial', 'Arial', cache);
    assert.deepEqual(first, { bold: true, italic: false, boldItalic: false });
    assert.equal(calls, 3);
    const second = await shared.probeLocalFontSlots('Arial', 'Arial', cache);
    assert.deepEqual(second, { bold: true, italic: false, boldItalic: false });
    assert.equal(calls, 3);
  } finally {
    globalThis.FontFace = originalFontFace;
  }
});

test('getFontStack never falls back to basic font when advanced split dropdowns are both empty', () => {
  const stack = shared.getFontStack('advanced', 'Basic Font', { cjkFont: '', latinFont: '' });
  assert.equal(stack, shared.FALLBACK_STACK);
  assert.doesNotMatch(stack, /Basic Font/);
});

test('normalizeSiteKey and isRestrictedUrl enforce scheme and CWS boundaries', () => {
  assert.equal(shared.normalizeSiteKey('https://Example.COM:8443/path'), 'example.com:8443');
  assert.equal(shared.normalizeSiteKey('http://localhost:3000/app'), 'localhost:3000');
  assert.equal(shared.normalizeSiteKey('https://example.com:443/'), 'example.com');
  assert.equal(shared.normalizeSiteKey('file:///Users/test/a.html'), null);
  assert.equal(shared.normalizeSiteKey('chrome://settings'), null);
  assert.equal(shared.normalizeSiteKey('about:blank'), null);
  assert.equal(shared.normalizeSiteKey('null'), null);
  assert.equal(shared.normalizeSiteKey('https://chromewebstore.google.com/detail/abc'), null);
  assert.equal(shared.normalizeSiteKey('https://chrome.google.com/webstore/detail/abc'), null);
  assert.equal(shared.normalizeSiteKey('https://chrome.google.com/webstorex'), 'chrome.google.com');
  assert.equal(shared.isRestrictedUrl('chrome-extension://abcdef/popup.html'), true);
});

test('resolveFrameSiteKeys handles multi-hop ancestorOrigins, srcdoc, and referrer fallback', () => {
  const nested = shared.resolveFrameSiteKeys(
    { href: 'https://embed.example.org/frame', origin: 'https://embed.example.org' },
    ['https://mid.example.net', 'https://top.example.com'],
    ''
  );
  assert.equal(nested.ownHost, 'embed.example.org');
  assert.equal(nested.topHost, 'top.example.com');
  assert.deepEqual(nested.keys, ['embed.example.org', 'mid.example.net', 'top.example.com']);

  const srcdoc = shared.resolveFrameSiteKeys(
    { href: 'about:srcdoc', origin: 'http://127.0.0.1:4100' },
    ['http://127.0.0.1:4100'],
    ''
  );
  assert.equal(srcdoc.ownHost, '127.0.0.1:4100');
  assert.deepEqual(srcdoc.keys, ['127.0.0.1:4100']);

  const opaqueWithReferrer = shared.resolveFrameSiteKeys(
    { href: 'about:blank', origin: 'null' },
    ['null'],
    'https://parent.example.com/article'
  );
  assert.equal(opaqueWithReferrer.topHost, 'parent.example.com');
  assert.deepEqual(opaqueWithReferrer.keys, ['parent.example.com']);
});

test('serializeFontFamilyList quotes multi-word and unsafe names while leaving generic keywords bare', () => {
  assert.equal(
    shared.serializeFontFamilyList('"FabricMDL2Icons", "Font Awesome 6 Free", sans-serif'),
    '"FabricMDL2Icons", "Font Awesome 6 Free", sans-serif'
  );
  assert.equal(
    shared.serializeFontFamilyList('Bad}Font;color:red, monospace'),
    '"Bad}Font;color:red", monospace'
  );
});

test('isPurePuaUnicodeRange detects PUA-only FontFace ranges accurately', () => {
  assert.equal(shared.isPurePuaUnicodeRange('U+E000-F8FF'), true);
  assert.equal(shared.isPurePuaUnicodeRange('U+E000-E100, U+F0000-F0100'), true);
  assert.equal(shared.isPurePuaUnicodeRange('U+0-10FFFF'), false);
  assert.equal(shared.isPurePuaUnicodeRange('U+41-5A, U+E000-E100'), false);
});

test('siteFontRule helpers normalize, detect emptiness, resolve precedence, and expose feedback URL', () => {
  assert.equal(shared.FEEDBACK_URL, 'https://david888.com/contact');
  assert.equal(shared.siteFontKey('github.com'), 'siteFont:github.com');

  const emptyBasic = shared.createSiteFontRule({ fontMode: 'basic', selectedFont: '' });
  assert.equal(shared.isSiteFontRuleEmpty(emptyBasic), true);

  const splitRule = shared.createSiteFontRule({
    fontMode: 'advanced',
    advancedFontConfig: { cjkFont: 'PingFang TC', latinFont: 'Inter' },
  });
  assert.equal(shared.isSiteFontRuleEmpty(splitRule), false);

  const globalCfg = { fontMode: 'basic', selectedFont: 'Arial', advancedFontConfig: {} };
  const resolvedOverride = shared.resolveEffectiveFontSettings(globalCfg, splitRule);
  assert.equal(resolvedOverride.fontMode, 'advanced');
  assert.equal(resolvedOverride.advancedFontConfig.cjkFont, 'PingFang TC');

  const resolvedFallback = shared.resolveEffectiveFontSettings(globalCfg, emptyBasic);
  assert.equal(resolvedFallback.fontMode, 'basic');
  assert.equal(resolvedFallback.selectedFont, 'Arial');
});

test('MSG_ACTIONS exposes cross-frame font slot cache actions', () => {
  assert.equal(shared.MSG_ACTIONS.GET_CACHED_FONT_SLOTS, 'getCachedFontSlots');
  assert.equal(shared.MSG_ACTIONS.SET_CACHED_FONT_SLOTS, 'setCachedFontSlots');
});

test('buildNonCjkUnicodeRange memoizes default and custom ranges with bounded cache eviction', () => {
  const defaultA = shared.buildNonCjkUnicodeRange();
  const defaultB = shared.buildNonCjkUnicodeRange(shared.CJK_UNICODE_RANGE);
  assert.equal(defaultA, defaultB);

  const customA = shared.buildNonCjkUnicodeRange('U+41-5A');
  const customB = shared.buildNonCjkUnicodeRange('U+41-5A');
  assert.equal(customA, customB);
  assert.equal(customA, 'U+0-40, U+5B-10FFFF');

  // Exceed the 16-entry custom cache and confirm eviction does not corrupt output.
  for (let i = 0; i < 25; i += 1) {
    const startHex = (0x100 + i * 0x10).toString(16).toUpperCase();
    const endHex = (0x105 + i * 0x10).toString(16).toUpperCase();
    const res = shared.buildNonCjkUnicodeRange(`U+${startHex}-${endHex}`);
    assert.match(res, /^U\+0-/);
  }
  assert.equal(shared.buildNonCjkUnicodeRange('U+41-5A'), customA);
  assert.equal(shared.buildNonCjkUnicodeRange(shared.CJK_UNICODE_RANGE), defaultA);
});

test('buildLocalFontCandidates returns cached frozen objects and bounds cache size', () => {
  const first = shared.buildLocalFontCandidates('  Inter  ', 'Inter');
  const second = shared.buildLocalFontCandidates('Inter', 'Inter');
  const third = shared.buildLocalFontCandidates('Inter', '');
  assert.equal(first, second);
  assert.equal(first, third);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.regular), true);
  assert.throws(() => {
    first.regular.push('Mutated');
  }, TypeError);

  // Exceed the 128-entry cap and confirm subsequent builds stay accurate.
  for (let i = 0; i < 150; i += 1) {
    const entry = shared.buildLocalFontCandidates(`BoundedFont${i}`, `BoundedFontId${i}`);
    assert.equal(entry.regular[0], `BoundedFont${i}`);
    assert.equal(Object.isFrozen(entry), true);
  }
  const rebuilt = shared.buildLocalFontCandidates('Inter', 'Inter');
  assert.equal(rebuilt.regular[0], 'Inter');
});

test('probeLocalFontSlots deduplicates concurrent in-flight probes per (cacheMap, key)', async () => {
  const originalFontFace = globalThis.FontFace;
  let loadCalls = 0;
  let resolveLoads;
  const loadGate = new Promise((resolve) => {
    resolveLoads = resolve;
  });

  globalThis.FontFace = class DeferredFakeFontFace {
    constructor(_family, _src, descriptors) {
      this.descriptors = descriptors;
    }
    load() {
      loadCalls += 1;
      return loadGate.then(() => {
        if (this.descriptors.style === 'italic' && this.descriptors.weight === 'normal') {
          return this;
        }
        throw new Error('missing');
      });
    }
  };

  try {
    const cacheA = new Map();
    const cacheB = new Map();

    // Two concurrent probes on the same (cacheA, key) share 1 set of 3 FontFace loads.
    const p1 = shared.probeLocalFontSlots('Inter', 'Inter', cacheA, { useRuntimeCache: false });
    const p2 = shared.probeLocalFontSlots('Inter', 'Inter', cacheA, { useRuntimeCache: false });
    assert.equal(p1, p2);
    assert.equal(loadCalls, 3);

    // A concurrent probe on a different cacheMap runs independently.
    const p3 = shared.probeLocalFontSlots('Inter', 'Inter', cacheB, { useRuntimeCache: false });
    assert.notEqual(p1, p3);
    assert.equal(loadCalls, 6);

    resolveLoads();
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    assert.deepEqual(r1, { bold: false, italic: true, boldItalic: false });
    assert.deepEqual(r2, r1);
    assert.deepEqual(r3, r1);

    // Subsequent call hits cacheA immediately with zero additional loads.
    const r4 = await shared.probeLocalFontSlots('Inter', 'Inter', cacheA, { useRuntimeCache: false });
    assert.deepEqual(r4, r1);
    assert.equal(loadCalls, 6);
  } finally {
    globalThis.FontFace = originalFontFace;
  }
});

test('probeLocalFontSlots reads/populates runtime background cache and falls back cleanly on miss or error', async () => {
  const originalFontFace = globalThis.FontFace;
  let fontFaceCalls = 0;
  globalThis.FontFace = class FakeFontFace {
    constructor(_family, _src, descriptors) {
      this.descriptors = descriptors;
    }
    load() {
      fontFaceCalls += 1;
      if (this.descriptors.weight === '700' && this.descriptors.style === 'normal') {
        return Promise.resolve(this);
      }
      return Promise.reject(new Error('not found'));
    }
  };

  try {
    // 1. Runtime cache hit avoids FontFace.load() completely.
    const hitMessages = [];
    const hitRuntime = {
      sendMessage(msg, cb) {
        hitMessages.push(msg);
        cb({ ok: true, slots: { bold: true, italic: true, boldItalic: false } });
      },
    };
    const hitCache = new Map();
    const hitRes = await shared.probeLocalFontSlots('PingFang TC', 'PingFang TC', hitCache, hitRuntime);
    assert.deepEqual(hitRes, { bold: true, italic: true, boldItalic: false });
    assert.equal(fontFaceCalls, 0);
    assert.deepEqual(hitMessages, [
      { action: shared.MSG_ACTIONS.GET_CACHED_FONT_SLOTS, key: 'PingFang TC\0PingFang TC' },
    ]);
    assert.deepEqual(hitCache.get('PingFang TC\0PingFang TC'), hitRes);

    // 2. Runtime cache miss probes locally and stores back via SET_CACHED_FONT_SLOTS.
    const missMessages = [];
    const missRuntime = {
      sendMessage(msg, cb) {
        missMessages.push(msg);
        if (msg.action === shared.MSG_ACTIONS.GET_CACHED_FONT_SLOTS) {
          cb({ ok: true, slots: null });
          return;
        }
        cb({ ok: true });
      },
    };
    const missCache = new Map();
    const missRes = await shared.probeLocalFontSlots('Arial', 'Arial', missCache, missRuntime);
    assert.deepEqual(missRes, { bold: true, italic: false, boldItalic: false });
    assert.equal(fontFaceCalls, 3);
    assert.deepEqual(missMessages, [
      { action: shared.MSG_ACTIONS.GET_CACHED_FONT_SLOTS, key: 'Arial\0Arial' },
      {
        action: shared.MSG_ACTIONS.SET_CACHED_FONT_SLOTS,
        key: 'Arial\0Arial',
        slots: { bold: true, italic: false, boldItalic: false },
      },
    ]);

    // 3. Throwing runtime falls back safely to local FontFace probe.
    const errRuntime = {
      sendMessage() {
        throw new Error('Extension context invalidated');
      },
    };
    const errCache = new Map();
    const errRes = await shared.probeLocalFontSlots('Georgia', 'Georgia', errCache, errRuntime);
    assert.deepEqual(errRes, { bold: true, italic: false, boldItalic: false });
    assert.equal(fontFaceCalls, 6);
  } finally {
    globalThis.FontFace = originalFontFace;
  }
});

test('CLOUD_GOOGLE_FONTS catalog and getFontStack handle cloud fonts and explicit system fontIds cleanly', () => {
  assert.equal(shared.CLOUD_GOOGLE_FONTS.length, 10);
  const fira = shared.getCloudGoogleFont('Fira Code');
  assert.ok(fira);
  assert.equal(fira.id, 'gf:fira-code');
  assert.match(fira.googleFontsUrl, /^https:\/\/fonts\.googleapis\.com\/css2\?family=Fira\+Code/);

  // Explicit system fontId must NOT trigger cloud font resolution even if name matches.
  assert.equal(shared.resolveCloudGoogleFont('JetBrains Mono', 'JetBrainsMono-Regular'), null);
  // Explicit gf:* fontId or legacy empty fontId resolves cloud metadata.
  assert.equal(shared.resolveCloudGoogleFont('JetBrains Mono', 'gf:jetbrains-mono').id, 'gf:jetbrains-mono');
  assert.equal(shared.resolveCloudGoogleFont('Fira Code', '').id, 'gf:fira-code');

  // Advanced split mode with local CJK + cloud Google Font Latin emits direct Google Font family after CJK.
  const splitStack = shared.getFontStack(
    shared.FONT_MODE_ADVANCED,
    '',
    { cjkFont: 'PingFang TC', cjkFontId: 'PingFangTC-Regular', latinFont: 'Fira Code', latinFontId: 'gf:fira-code' },
    shared.CJK_FONT_FAMILY,
    shared.LATIN_FONT_FAMILY
  );
  assert.match(splitStack, /^"FontChangerCjk", "Fira Code", /);
  assert.doesNotMatch(splitStack, /FontChangerLatin/);
});
