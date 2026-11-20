'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const shared = require('../extension/shared.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const EXTENSION_DIR = path.join(ROOT_DIR, 'extension');

function findChromeExecutable() {
  const envPath = process.env.FONT_CHANGER_CHROME;
  const candidates = [
    envPath,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  for (const bin of ['google-chrome', 'chromium', 'chromium-browser', 'msedge']) {
    const res = spawnSync(cmd, [bin], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout) {
      const first = res.stdout.trim().split(/\r?\n/)[0];
      if (first && fs.existsSync(first)) return first;
    }
  }
  return null;
}

/**
 * Generates a minimal valid SFNT TrueType font containing `.notdef` (glyph 0)
 * and one square glyph mapped at U+E715 so Chromium loads a real cross-origin icon WebFont.
 */
function buildMinimalPuaTtf() {
  function pad4(buf) {
    const rem = buf.length % 4;
    if (rem === 0) return buf;
    return Buffer.concat([buf, Buffer.alloc(4 - rem)]);
  }
  function checksum(buf) {
    const p = pad4(buf);
    let sum = 0;
    for (let i = 0; i < p.length; i += 4) {
      sum = (sum + p.readUInt32BE(i)) >>> 0;
    }
    return sum;
  }

  // glyf: glyph 0 empty, glyph 1 simple square (400..600)
  const glyph1 = Buffer.alloc(36);
  glyph1.writeInt16BE(1, 0); // numberOfContours
  glyph1.writeInt16BE(100, 2); // xMin
  glyph1.writeInt16BE(100, 4); // yMin
  glyph1.writeInt16BE(900, 6); // xMax
  glyph1.writeInt16BE(900, 8); // yMax
  glyph1.writeUInt16BE(3, 10); // endPtsOfContours[0]
  glyph1.writeUInt16BE(0, 12); // instructionLength
  // flags: onCurve(1) | xShort(2) | yShort(4) | xSameOrPos(16) | ySameOrPos(32)
  // Using absolute 16-bit deltas cleanly with flag = 1 (on curve):
  glyph1[14] = 0x01; glyph1[15] = 0x01; glyph1[16] = 0x01; glyph1[17] = 0x01;
  // xCoordinates (int16 deltas): 100, +800, 0, -800
  glyph1.writeInt16BE(100, 18);
  glyph1.writeInt16BE(800, 20);
  glyph1.writeInt16BE(0, 22);
  glyph1.writeInt16BE(-800, 24);
  // yCoordinates (int16 deltas): 100, 0, +800, -800
  glyph1.writeInt16BE(100, 26);
  glyph1.writeInt16BE(0, 28);
  glyph1.writeInt16BE(800, 30);
  glyph1.writeInt16BE(-800, 32);

  const glyf = glyph1; // Wait: index 0 has length 0 if loca=[0,0,36]
  const loca = Buffer.alloc(6); // short format (offset/2): 0, 0, 18
  loca.writeUInt16BE(0, 0);
  loca.writeUInt16BE(0, 2);
  loca.writeUInt16BE(glyf.length / 2, 4);

  const head = Buffer.alloc(54);
  head.writeUInt32BE(0x00010000, 0);
  head.writeUInt32BE(0x00010000, 4);
  head.writeUInt32BE(0x5f0f3cf5, 12); // magicNumber
  head.writeUInt16BE(0x000b, 16); // flags
  head.writeUInt16BE(1000, 18); // unitsPerEm
  head.writeInt16BE(100, 36); // xMin
  head.writeInt16BE(100, 38); // yMin
  head.writeInt16BE(900, 40); // xMax
  head.writeInt16BE(900, 42); // yMax
  head.writeInt16BE(0, 50); // indexToLocFormat = 0 (short)

  const hhea = Buffer.alloc(36);
  hhea.writeUInt32BE(0x00010000, 0);
  hhea.writeInt16BE(900, 4); // ascender
  hhea.writeInt16BE(-100, 6); // descender
  hhea.writeInt16BE(1000, 10); // advanceWidthMax
  hhea.writeUInt16BE(2, 34); // numberOfHMetrics

  const maxp = Buffer.alloc(32);
  maxp.writeUInt32BE(0x00010000, 0);
  maxp.writeUInt16BE(2, 4); // numGlyphs

  const hmtx = Buffer.alloc(8);
  hmtx.writeUInt16BE(1000, 0); hmtx.writeInt16BE(0, 2);
  hmtx.writeUInt16BE(1000, 4); hmtx.writeInt16BE(100, 6);

  // cmap: format 4 mapping U+E715 -> glyph 1, plus U+FFFF -> .notdef
  const subtable = Buffer.alloc(32);
  subtable.writeUInt16BE(4, 0); // format
  subtable.writeUInt16BE(32, 2); // length
  subtable.writeUInt16BE(0, 4); // language
  subtable.writeUInt16BE(4, 6); // segCountX2 = 2*2
  subtable.writeUInt16BE(4, 8); // searchRange
  subtable.writeUInt16BE(1, 10); // entrySelector
  subtable.writeUInt16BE(0, 12); // rangeShift
  subtable.writeUInt16BE(0xe715, 14); // endCode[0]
  subtable.writeUInt16BE(0xffff, 16); // endCode[1]
  subtable.writeUInt16BE(0, 18); // reservedPad
  subtable.writeUInt16BE(0xe715, 20); // startCode[0]
  subtable.writeUInt16BE(0xffff, 22); // startCode[1]
  subtable.writeUInt16BE((1 - 0xe715) & 0xffff, 24); // idDelta[0]: (0xE715 + 6380) mod 65536 = 1
  subtable.writeInt16BE(1, 26); // idDelta[1]: 0xFFFF + 1 = 0
  subtable.writeUInt16BE(0, 28); // idRangeOffset[0]
  subtable.writeUInt16BE(0, 30); // idRangeOffset[1]

  const cmap = Buffer.alloc(12 + subtable.length);
  cmap.writeUInt16BE(0, 0); // version
  cmap.writeUInt16BE(1, 2); // numTables
  cmap.writeUInt16BE(3, 4); // platformID (Windows)
  cmap.writeUInt16BE(1, 6); // encodingID (Unicode BMP)
  cmap.writeUInt32BE(12, 8); // offset
  subtable.copy(cmap, 12);

  const os2 = Buffer.alloc(78);
  os2.writeUInt16BE(1, 0);
  os2.writeInt16BE(500, 2); // xAvgCharWidth
  os2.writeUInt16BE(400, 4); // usWeightClass
  os2.writeUInt16BE(5, 6); // usWidthClass
  os2.writeUInt16BE(0x0040, 62); // fsSelection REGULAR
  os2.writeUInt16BE(0xe715, 64); // firstCharIndex
  os2.writeUInt16BE(0xe715, 66); // lastCharIndex
  os2.writeInt16BE(900, 68);
  os2.writeInt16BE(-100, 70);
  os2.writeInt16BE(700, 74);

  const nameBuf = Buffer.from('TestPuaIcons', 'utf16le').swap16();
  const nameHeader = Buffer.alloc(6 + 12);
  nameHeader.writeUInt16BE(0, 0);
  nameHeader.writeUInt16BE(1, 2); // count
  nameHeader.writeUInt16BE(18, 4); // stringOffset
  nameHeader.writeUInt16BE(3, 6); // platformID
  nameHeader.writeUInt16BE(1, 8); // encodingID
  nameHeader.writeUInt16BE(0x0409, 10); // languageID
  nameHeader.writeUInt16BE(1, 12); // font family
  nameHeader.writeUInt16BE(nameBuf.length, 14);
  nameHeader.writeUInt16BE(0, 16);
  const name = Buffer.concat([nameHeader, nameBuf]);

  const post = Buffer.alloc(32);
  post.writeUInt32BE(0x00030000, 0);

  const tables = [
    ['OS/2', os2],
    ['cmap', cmap],
    ['glyf', glyf],
    ['head', head],
    ['hhea', hhea],
    ['hmtx', hmtx],
    ['loca', loca],
    ['maxp', maxp],
    ['name', name],
    ['post', post],
  ];

  const numTables = tables.length;
  const headerSize = 12 + numTables * 16;
  let offset = headerSize;
  const dir = Buffer.alloc(headerSize);
  dir.writeUInt32BE(0x00010000, 0);
  dir.writeUInt16BE(numTables, 4);
  const entrySelector = Math.floor(Math.log2(numTables));
  const searchRange = (1 << entrySelector) * 16;
  dir.writeUInt16BE(searchRange, 6);
  dir.writeUInt16BE(entrySelector, 8);
  dir.writeUInt16BE(numTables * 16 - searchRange, 10);

  const chunks = [dir];
  tables.forEach(([tag, data], idx) => {
    const padded = pad4(data);
    const recOff = 12 + idx * 16;
    dir.write(tag, recOff, 4, 'ascii');
    dir.writeUInt32BE(checksum(padded), recOff + 4);
    dir.writeUInt32BE(offset, recOff + 8);
    dir.writeUInt32BE(data.length, recOff + 12);
    chunks.push(padded);
    offset += padded.length;
  });

  const full = Buffer.concat(chunks);
  const headEntryOffset = dir.readUInt32BE(12 + tables.findIndex(([t]) => t === 'head') * 16 + 8);
  const totalSum = checksum(full);
  full.writeUInt32BE((0xb1b0afba - totalSum) >>> 0, headEntryOffset + 8);
  return full;
}

function listFilesRecursive(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full, base));
    } else {
      out.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return out.sort();
}

test('extension/ directory contains strictly runtime files with zero tests or dev leftovers', () => {
  const files = listFilesRecursive(EXTENSION_DIR);
  assert.deepEqual(files, [
    'content.js',
    'images/icon128.png',
    'images/icon16.png',
    'images/icon48.png',
    'manifest.json',
    'popup.html',
    'popup.js',
    'shared.js',
  ]);

  const manifest = JSON.parse(fs.readFileSync(path.join(EXTENSION_DIR, 'manifest.json'), 'utf8'));
  assert.equal(manifest.version, '2.0.0');
  assert.deepEqual(manifest.permissions, ['activeTab', 'storage', 'fontSettings', 'scripting']);
  assert.deepEqual(manifest.content_scripts[0].js, ['shared.js', 'content.js']);
  assert.equal(manifest.background, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
});

const CHROME_PATH = findChromeExecutable();

test('restricted local Latin font renders real bold and italic faces when slot probing succeeds', () => {
  assert.ok(CHROME_PATH, 'Chrome or Chromium must be installed for real font rendering verification');

  const latinCandidates = process.platform === 'win32'
    ? ['Segoe UI', 'Arial']
    : process.platform === 'linux'
      ? ['DejaVu Sans', 'Liberation Sans', 'Noto Sans']
      : ['Arial', 'Helvetica'];
  const latinFont = latinCandidates[0];
  const cssText = shared.buildRestrictedFontFaceSetCss(
    shared.LATIN_FONT_FAMILY,
    latinFont,
    latinFont,
    shared.buildNonCjkUnicodeRange(shared.CJK_UNICODE_RANGE),
    { bold: true, italic: true, boldItalic: true }
  );

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-render-bold-'));
  try {
    const file = path.join(dir, 'test.html');
    fs.writeFileSync(
      file,
      `<!doctype html><style>${cssText}</style>
      <pre id="result">pending</pre><script>
      async function run() {
        const result = {};
        for (const [label, style] of [['normal', '400'], ['bold', '700'], ['italic', 'italic 400']]) {
          const font = style + ' 40px FontChangerLatin';
          const loaded = await document.fonts.load(font, 'META CURSOR 123 abc');
          if (!loaded.length) throw new Error('Local font did not load for ' + style);
          const canvas = document.createElement('canvas');
          canvas.width = 800; canvas.height = 70;
          const ctx = canvas.getContext('2d');
          ctx.font = font;
          ctx.fillText('META CURSOR 123 abc', 10, 50);
          const pixels = ctx.getImageData(0, 0, 800, 70).data;
          let alpha = 0, hash = 2166136261;
          for (let i = 3; i < pixels.length; i += 4) {
            alpha += pixels[i];
            hash = Math.imul(hash ^ pixels[i], 16777619);
          }
          result[label] = { alpha, hash };
        }
        document.getElementById('result').textContent = JSON.stringify(result);
      }
      run().catch(e => { document.getElementById('result').textContent = JSON.stringify({ error: String(e) }); });
      </script>`
    );

    const run = spawnSync(
      CHROME_PATH,
      [
        '--headless=new',
        '--no-first-run',
        '--disable-gpu',
        '--user-data-dir=' + path.join(dir, 'profile'),
        '--dump-dom',
        '--virtual-time-budget=5000',
        pathToFileURL(file).href,
      ],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 }
    );

    assert.equal(run.status, 0, run.error?.message || run.stderr);
    const match = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/);
    assert.ok(match, 'Chrome must return rendering result');
    const result = JSON.parse(match[1]);
    assert.equal(result.error, undefined, result.error);
    assert.ok(result.bold.alpha > result.normal.alpha, 'Bold must add visible stroke ink');
    assert.notEqual(result.italic.hash, result.normal.hash, 'Italic must render distinctly from normal');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('dual-origin real Chrome CDP suite verifies cross-origin icons, underscore words, CJK/Kana/Hangul split, SPA updates, and iframe union disable', { timeout: 45000 }, async () => {
  assert.ok(CHROME_PATH, 'Chrome or Chromium must be installed for CDP integration verification');

  const ttfBytes = buildMinimalPuaTtf();
  let currentSyncState = {
    isEnabled: true,
    fontMode: 'advanced',
    advancedFontConfig: {
      cjkFont: '',
      cjkFontId: '',
      latinFont: '',
      latinFontId: '',
    },
  };

  let portA = 0;
  let portB = 0;

  const serverA = http.createServer((req, res) => {
    if (req.url === '/__fc_sync.json') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(currentSyncState));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
<html>
<head>
  <link rel="stylesheet" href="http://127.0.0.1:${portB}/icons.css">
  <style>
    body { font-family: sans-serif; }
    pre { font-family: serif; }
  </style>
</head>
<body>
  <article id="article">
    <i id="pua-icon">&#xE715;</i>
    <button id="mixed-btn" class="pua-before">Inbox</button>
    <code id="auto-machine">auto_machine</code>
    <span id="uuuu">u_uuuu_uuuu</span>
    <br>--<br>
    <pre id="bbs-pre">質疑台北市長蔣萬安</pre>
    <span id="bbs-ja">日本語テスト</span>
    <span id="bbs-ko">한국어</span>
    <span id="bbs-punc">／（）「」，。</span>
    <b id="bold-cjk">中時新聞網</b><i id="italic-cjk">蔣萬安</i>
    <span id="latin-txt">Threads 23 META</span>
  </article>
  <iframe id="child-cross" src="http://127.0.0.1:${portB}/frame.html"></iframe>
  <iframe id="child-srcdoc" srcdoc="<p id='srcdoc-p'>Hello srcdoc</p>"></iframe>
  <div id="ref-box"></div>
</body>
</html>`);
  });

  const serverB = http.createServer((req, res) => {
    if (req.url === '/pua.ttf') {
      res.writeHead(200, {
        'Content-Type': 'font/ttf',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(ttfBytes);
      return;
    }
    if (req.url === '/icons.css') {
      res.writeHead(200, {
        'Content-Type': 'text/css; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(`
        @font-face {
          font-family: "TestPuaIcons";
          src: url("http://127.0.0.1:${portB}/pua.ttf") format("truetype");
          unicode-range: U+E715;
        }
        #pua-icon { font-family: "TestPuaIcons", sans-serif; }
        .pua-before::before {
          content: "\\E715";
          font-family: "TestPuaIcons", sans-serif;
        }
      `);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body><p id="cross-p">Cross origin child</p></body></html>');
  });

  await Promise.all([
    new Promise((resolve) => serverA.listen(0, '127.0.0.1', resolve)),
    new Promise((resolve) => serverB.listen(0, '127.0.0.1', resolve)),
  ]);
  portA = serverA.address().port;
  portB = serverB.address().port;

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-cdp-v2-'));
  const browser = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      '--no-first-run',
      '--disable-gpu',
      '--remote-debugging-port=0',
      '--user-data-dir=' + userDataDir,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let socket;
  try {
    const portFile = path.join(userDataDir, 'DevToolsActivePort');
    const deadline = Date.now() + 10000;
    while (!fs.existsSync(portFile)) {
      assert.ok(Date.now() < deadline, 'Chrome DevTools port did not become ready');
      assert.equal(browser.exitCode, null, 'Chrome exited prematurely');
      await new Promise((r) => setTimeout(r, 50));
    }
    const debugPort = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json();
    const pageTarget = pages.find((p) => p.type === 'page');
    socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });

    let nextId = 0;
    const pending = new Map();
    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id) return;
      const cb = pending.get(msg.id);
      if (!cb) return;
      pending.delete(msg.id);
      if (msg.error) cb.reject(new Error(JSON.stringify(msg.error)));
      else cb.resolve(msg.result);
    };

    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });

    const evalTop = async (expr) => {
      const res = await send('Runtime.evaluate', {
        expression: expr,
        awaitPromise: true,
        returnByValue: true,
      });
      assert.equal(res.exceptionDetails, undefined, JSON.stringify(res.exceptionDetails));
      return res.result ? res.result.value : undefined;
    };

    await send('Page.enable');
    await send('DOM.enable');
    await send('CSS.enable');

    // First discover one installed OS CJK font and one OS Latin font using shared.buildLocalFontCandidates.
    const cjkProbeList = [
      'PingFang TC', 'Hiragino Sans', 'Microsoft JhengHei',
      'Noto Sans CJK TC', 'Noto Sans TC', 'WenQuanYi Micro Hei', 'Source Han Sans TC',
    ];
    const latinProbeList = ['Arial', 'Helvetica', 'DejaVu Sans', 'Segoe UI', 'Liberation Sans'];

    await send('Page.navigate', { url: `http://127.0.0.1:${portA}/` });
    const cjkCandidatesMap = cjkProbeList.map((name) => ({
      name,
      regular: shared.buildLocalFontCandidates(name, name).regular,
    }));
    const latinCandidatesMap = latinProbeList.map((name) => ({
      name,
      regular: shared.buildLocalFontCandidates(name, name).regular,
    }));

    const detected = await evalTop(`(async function () {
      async function firstLoaded(entries) {
        for (var i = 0; i < entries.length; i++) {
          var src = entries[i].regular.map(function (c) { return 'local(' + JSON.stringify(c) + ')'; }).join(', ');
          try {
            var f = new FontFace('__probe_os', src);
            await f.load();
            return entries[i].name;
          } catch (_e) {}
        }
        return null;
      }
      return {
        cjk: await firstLoaded(${JSON.stringify(cjkCandidatesMap)}),
        latin: await firstLoaded(${JSON.stringify(latinCandidatesMap)})
      };
    })()`);

    const chosenCjk = detected.cjk;
    const chosenLatin = detected.latin;
    assert.ok(chosenCjk, 'Environment must have at least one system CJK font');
    assert.ok(chosenLatin, 'Environment must have at least one system Latin font');

    currentSyncState.advancedFontConfig = {
      cjkFont: chosenCjk,
      cjkFontId: chosenCjk,
      latinFont: chosenLatin,
      latinFontId: chosenLatin,
    };

    const sharedCode = fs.readFileSync(path.join(EXTENSION_DIR, 'shared.js'), 'utf8');
    const contentCode = fs.readFileSync(path.join(EXTENSION_DIR, 'content.js'), 'utf8');

    // Inject Chrome storage shim + shared.js + content.js into EVERY frame at document_start.
    const preloadScript = `
      (function () {
        var listeners = [];
        globalThis.__fcTriggerStorageChanges = function (changes) {
          for (var i = 0; i < listeners.length; i++) {
            listeners[i](changes, 'sync');
          }
        };
        globalThis.chrome = {
          extension: { inIncognitoContext: false },
          runtime: {
            id: 'cdp-test-ext',
            onMessage: { addListener: function () {}, removeListener: function () {} }
          },
          storage: {
            sync: {
              get: function (keys, cb) {
                fetch('http://127.0.0.1:${portA}/__fc_sync.json', { cache: 'no-store' })
                  .then(function (r) { return r.json(); })
                  .then(function (data) { cb(data); });
              }
            },
            onChanged: {
              addListener: function (fn) { listeners.push(fn); },
              removeListener: function (fn) { listeners = listeners.filter(function (f) { return f !== fn; }); }
            }
          }
        };
      })();
      ${sharedCode}
      ${contentCode}
    `;

    await send('Page.addScriptToEvaluateOnNewDocument', { source: preloadScript });
    await send('Page.navigate', { url: `http://127.0.0.1:${portA}/` });

    // Wait for document, subframes, TestPuaIcons WebFont, and initial controller activation.
    await evalTop(`new Promise(function (resolve) {
      var check = function () {
        var ctrl = globalThis[Symbol.for('fontChanger333.controller')];
        if (document.readyState === 'complete' && ctrl && ctrl.getState().active && document.fonts.size >= 0) {
          Promise.all([
            document.fonts.ready,
            new Promise(function (r) { setTimeout(r, 250); })
          ]).then(resolve);
          return;
        }
        setTimeout(check, 25);
      };
      check();
    })`);

    // Inject reference swatches in top page to know Blink's exact resolved familyName/postScriptName.
    await evalTop(`
      document.getElementById('ref-box').innerHTML =
        '<div id="ref-cjk" style="font-family:' + JSON.stringify(${JSON.stringify(chosenCjk)}) + ' !important">中文テスト</div>' +
        '<div id="ref-ko" style="font-family:' + JSON.stringify(${JSON.stringify(chosenCjk)}) + ', sans-serif !important">한국어</div>' +
        '<div id="ref-lat" style="font-family:' + JSON.stringify(${JSON.stringify(chosenLatin)}) + ' !important">Threads 23</div>';
      document.fonts.ready;
    `);
    await new Promise((r) => setTimeout(r, 150));

    const { root } = await send('DOM.getDocument', { depth: -1, pierce: true });
    const fontsFor = async (selector) => {
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
      assert.ok(nodeId > 0, `Selector ${selector} must resolve`);
      return (await send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
    };

    const refCjkFonts = await fontsFor('#ref-cjk');
    const refKoFonts = await fontsFor('#ref-ko');
    const refLatinFonts = await fontsFor('#ref-lat');
    const expectedCjkFamily = refCjkFonts[0].familyName;
    const expectedKoFamily = refKoFonts[0].familyName;
    const expectedLatinFamily = refLatinFonts[0].familyName;

    // 1. Cross-origin PUA icon + ::before mixed button
    const puaState = await evalTop(`({
      puaPinned: document.getElementById('pua-icon').hasAttribute('data-fc-icon-font'),
      puaFont: getComputedStyle(document.getElementById('pua-icon')).fontFamily,
      btnWholePinned: document.getElementById('mixed-btn').hasAttribute('data-fc-icon-font'),
      btnBeforePinned: document.getElementById('mixed-btn').hasAttribute('data-fc-icon-before'),
      btnBeforeFont: getComputedStyle(document.getElementById('mixed-btn'), '::before').fontFamily,
      autoPinned: document.getElementById('auto-machine').hasAttribute('data-fc-icon-font'),
      uuuuPinned: document.getElementById('uuuu').hasAttribute('data-fc-icon-font'),
      articlePinned: document.getElementById('article').hasAttribute('data-fc-icon-font')
    })`);
    assert.equal(puaState.puaPinned, true, '#pua-icon must be pinned');
    assert.match(puaState.puaFont, /TestPuaIcons/);
    assert.equal(puaState.btnWholePinned, false, 'Mixed button host must NOT be pinned');
    assert.equal(puaState.btnBeforePinned, true, 'Mixed button ::before must be pinned independently');
    assert.match(puaState.btnBeforeFont, /TestPuaIcons/);
    assert.equal(puaState.autoPinned, false, 'auto_machine must keep custom font');
    assert.equal(puaState.uuuuPinned, false, 'u_uuuu_uuuu must keep custom font');
    assert.equal(puaState.articlePinned, false, 'BBS article container must not be excluded');

    // Verify real platform fonts on #mixed-btn, #auto-machine, #uuuu, #latin-txt, CJK/JA/KO/<pre>
    for (const sel of ['#mixed-btn', '#auto-machine', '#uuuu', '#latin-txt']) {
      const f = await fontsFor(sel);
      assert.ok(
        f.some((entry) => entry.familyName === expectedLatinFamily),
        `${sel} expected Latin font ${expectedLatinFamily}, got ${JSON.stringify(f)}`
      );
    }
    for (const sel of ['#bbs-pre', '#bbs-ja', '#bbs-punc', '#bold-cjk', '#italic-cjk']) {
      const f = await fontsFor(sel);
      assert.ok(
        f.some((entry) => entry.familyName === expectedCjkFamily),
        `${sel} expected CJK font ${expectedCjkFamily}, got ${JSON.stringify(f)}`
      );
    }
    const koFonts = await fontsFor('#bbs-ko');
    assert.ok(
      koFonts.some((entry) => entry.familyName === expectedKoFamily),
      `#bbs-ko expected CJK/Hangul font ${expectedKoFamily}, got ${JSON.stringify(koFonts)}`
    );

    // 2. Dynamic SPA insertion via real MutationObserver
    await evalTop(`
      document.getElementById('article').insertAdjacentHTML('beforeend',
        '<span id="dyn-pua" style="font-family:\\'TestPuaIcons\\'">&#xE715;</span>' +
        '<p id="dyn-uuuu">u_uuuu_uuuu</p>');
      new Promise(function (r) { setTimeout(r, 250); });
    `);
    const dynState = await evalTop(`({
      dynPua: document.getElementById('dyn-pua').hasAttribute('data-fc-icon-font'),
      dynUuuu: document.getElementById('dyn-uuuu').hasAttribute('data-fc-icon-font')
    })`);
    assert.equal(dynState.dynPua, true, 'SPA PUA icon must be protected');
    assert.equal(dynState.dynUuuu, false, 'SPA u_uuuu_uuuu must keep user font');
    assert.ok((await fontsFor('#dyn-uuuu')).some((e) => e.familyName === expectedLatinFamily));

    // 3. Cross-origin portB iframe + srcdoc union disable in real Chromium contexts
    const frameTree = await send('Page.getFrameTree');
    const childCrossFrame = frameTree.frameTree.childFrames.find((cf) => cf.frame.url.includes(`:${portB}/`));
    const childSrcdocFrame = frameTree.frameTree.childFrames.find((cf) => cf.frame.url.startsWith('about:srcdoc'));
    assert.ok(childCrossFrame, 'Cross-origin frame must exist');
    assert.ok(childSrcdocFrame, 'srcdoc frame must exist');

    // Update serverA /__fc_sync.json and navigate cleanly to exercise real cross-frame document_start sync:
    const topKey = `siteDisabled:127.0.0.1:${portA}`;
    currentSyncState[topKey] = 1;
    await send('Page.navigate', { url: `http://127.0.0.1:${portA}/` });
    await new Promise((r) => setTimeout(r, 300));

    const parentDisabledStates = await evalTop(`({
      topActive: globalThis[Symbol.for('fontChanger333.controller')].getState().active,
      srcdocActive: document.getElementById('child-srcdoc').contentWindow[Symbol.for('fontChanger333.controller')].getState().active,
      dpipProp: typeof window.documentPictureInPicture
    })`);
    assert.equal(parentDisabledStates.topActive, false, 'Top frame must be Dormant when excluded');
    assert.equal(parentDisabledStates.srcdocActive, false, 'srcdoc child must be Dormant via parent exclusion');

    // Now check cross-origin portB frame adoptedStyleSheets via DOM/CSS computed font!
    const { root: rootAfter } = await send('DOM.getDocument', { depth: -1, pierce: true });
    const crossP = await send('DOM.querySelector', { nodeId: rootAfter.nodeId, selector: '#cross-p' });
    // Note DOM.querySelector across frames searches pierced subtrees; verify or check frame key:
    if (crossP && crossP.nodeId) {
      const crossFonts = (await send('CSS.getPlatformFontsForNode', { nodeId: crossP.nodeId })).fonts;
      assert.equal(
        crossFonts.some((e) => e.familyName.includes('FontChanger')),
        false,
        'Cross-origin portB child must not load FontChanger when parent is disabled'
      );
    }

    // Re-enable top site and verify srcdoc reactivates + union check passes cleanly.
    delete currentSyncState[topKey];
    await send('Page.navigate', { url: `http://127.0.0.1:${portA}/` });
    await new Promise((r) => setTimeout(r, 300));
    const reenabled = await evalTop(`({
      topActive: globalThis[Symbol.for('fontChanger333.controller')].getState().active,
      srcdocActive: document.getElementById('child-srcdoc').contentWindow[Symbol.for('fontChanger333.controller')].getState().active
    })`);
    assert.equal(reenabled.topActive, true);
    assert.equal(reenabled.srcdocActive, true);
  } finally {
    socket?.close();
    browser.kill();
    await new Promise((resolve) => {
      if (browser.exitCode !== null || browser.signalCode !== null) return resolve();
      const t = setTimeout(resolve, 2000);
      browser.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
    serverA.close();
    serverB.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
