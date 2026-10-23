const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const chrome = [
  process.env.FONT_CHANGER_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((candidate) => candidate && fs.existsSync(candidate));

test('restricted local Latin font still renders bold and italic text', { skip: !chrome }, () => {
  // Reuse the content-script environment, but render its actual CSS in Chrome.
  const helpers = fs.readFileSync(path.join(__dirname, 'content.test.js'), 'utf8')
    .split("test('buildCss covers")[0];
  const context = { require, __dirname, console, setTimeout, clearTimeout };
  vm.createContext(context);
  vm.runInContext(helpers + '\nglobalThis.content = loadContentScript();', context);
  context.content.applyFontSettings({
    fontMode: 'advanced',
    advancedFontConfig: { latinFont: process.platform === 'linux' ? 'DejaVu Sans' : 'Arial' },
  });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'font-changer-render-'));
  try {
    const file = path.join(dir, 'test.html');
    fs.writeFileSync(file, `<!doctype html><style>${context.content.buildCompositeFontFaceCss()}</style>
      <pre id="result">pending</pre><script>
      async function run() {
        const result = {};
        for (const [label, style] of [['normal', '400'], ['bold', '700'], ['italic', 'italic 400']]) {
          const font = style + ' 40px FontChangerLatin';
          const loaded = await document.fonts.load(font, 'META CURSOR 123 abc');
          if (!loaded.length) throw new Error('Local font did not load');
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
      run().catch(error => document.getElementById('result').textContent = JSON.stringify({error: String(error)}));
      </script>`);
    const run = spawnSync(chrome, [
      '--headless=new', '--no-first-run', '--disable-gpu',
      '--user-data-dir=' + path.join(dir, 'profile'),
      '--dump-dom', '--virtual-time-budget=5000', pathToFileURL(file).href,
    ], { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
    assert.equal(run.status, 0, run.error?.message || run.stderr);
    const match = run.stdout.match(/<pre id="result">([^<]+)<\/pre>/);
    assert.ok(match, 'Chrome must return a rendering result');
    const result = JSON.parse(match[1]);
    assert.equal(result.error, undefined, result.error);
    assert.ok(result.bold.alpha > result.normal.alpha, 'Bold must add ink to the rendered text');
    assert.notEqual(result.italic.hash, result.normal.hash, 'Italic must render differently from normal');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Inspect Chrome's actual platform fonts, rather than trusting computed CSS.
// This fixture reproduces Disp BBS: text nodes, <br>, colored <span>/<pre>,
// fullwidth slashes and a '--' separator share one article container.
test('BBS text keeps the selected CJK and Latin fonts after icon scanning', {
  skip: !chrome || process.platform !== 'darwin', timeout: 30000,
}, async () => {
  const { spawn } = require('node:child_process');
  const cjkFont = fs.existsSync(path.join(os.homedir(), 'Library/Fonts/777jf金萱.otf'))
    ? '777jf金萱' : 'PingFang TC';
  const latinFont = fs.existsSync(path.join(os.homedir(), 'Library/Fonts/JetBrainsMono-Regular.ttf'))
    ? 'JetBrains Mono' : 'Arial';
  const settings = { isEnabled: true, fontMode: 'advanced',
    advancedFontConfig: { cjkFont, cjkFontId: cjkFont, latinFont, latinFontId: latinFont } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'font-changer-bbs-'));
  const browser = spawn(chrome, ['--headless=new', '--no-first-run', '--disable-gpu',
    '--remote-debugging-port=0', '--user-data-dir=' + dir, 'about:blank'], { stdio: 'ignore' });
  let socket;
  try {
    const portFile = path.join(dir, 'DevToolsActivePort');
    const deadline = Date.now() + 10000;
    while (!fs.existsSync(portFile)) {
      assert.ok(Date.now() < deadline, 'Chrome debugging port must become available');
      assert.equal(browser.exitCode, null, 'Chrome must remain running');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const callback = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) callback.reject(new Error(JSON.stringify(message.error)));
      else callback.resolve(message.result);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const html = `<head><style>
      body { font-family: Arial; } pre { font-family: serif; }
      .fgY1 { color: yellow; } .fgY1 pre { display: inline; }
      </style></head><body><article id="article">
      中時新聞網黃朝郁<br>編譯陳成良／綜合報導<br>
      <span class="fgY1"><pre id="yellow">質疑台北市長蔣萬安</pre></span><br>
      <span id="gray">中時新聞網黃朝郁</span><br>--<br>
      <span id="latin">Threads 23 META CURSOR</span>
      <b id="bold">中時新聞網</b><i id="italic">蔣萬安</i>
      <span id="punctuation">／（）「」，。</span>
      <span id="han">𠀀</span><span id="emoji">😀</span>
      <span id="pua">&#xE8B6;</span>
      <span class="material-icons" id="ligature">arrow_drop_down</span>
      --</article>
      <div id="reference-cjk" style='font-family:${JSON.stringify(cjkFont)} !important'>中時新聞網</div>
      <div id="reference-latin" style='font-family:${JSON.stringify(latinFont)} !important'>Threads 23</div>
      </body>`;
    await evaluate(`document.documentElement.innerHTML = ${JSON.stringify(html)}`);
    await evaluate(`globalThis.chrome = {
      runtime: { onMessage: { addListener() {} } },
      storage: { sync: { get(keys, callback) { callback(${JSON.stringify(settings)}); } },
        onChanged: { addListener() {} } }
    }`);
    await evaluate(fs.readFileSync(path.join(__dirname, 'content.js'), 'utf8'));
    await evaluate('document.fonts.ready.then(() => true)');
    await send('DOM.enable');
    await send('CSS.enable');
    const { root } = await send('DOM.getDocument');
    const fontsFor = async selector => {
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
      return (await send('CSS.getPlatformFontsForNode', { nodeId })).fonts;
    };
    const expectedCjk = await fontsFor('#reference-cjk');
    const expectedLatin = await fontsFor('#reference-latin');
    assert.equal(expectedCjk.length, 1, 'Reference CJK text must have one available font');
    assert.equal(expectedLatin.length, 1, 'Reference Latin text must have one available font');
    for (const selector of ['#yellow', '#gray', '#bold', '#italic', '#punctuation']) {
      const fonts = await fontsFor(selector);
      assert.deepEqual(fonts.map(font => font.familyName), [expectedCjk[0].familyName], selector);
    }
    assert.deepEqual((await fontsFor('#latin')).map(font => font.postScriptName),
      [expectedLatin[0].postScriptName]);
    for (const selector of ['#article', '#yellow', '#gray', '#latin', '#punctuation', '#han', '#emoji']) {
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(selector)}).closest('[data-font-changer-exclude]') !== null`), false, selector);
    }
    assert.equal(await evaluate(`document.querySelector('#pua').hasAttribute('data-font-changer-exclude')`), true);
    assert.equal(await evaluate(`document.querySelector('#ligature').hasAttribute('data-font-changer-exclude')`), true);
    // Dynamic additions must go through the actual MutationObserver as well.
    await evaluate(`document.querySelector('#article').insertAdjacentHTML('beforeend',
      '<br>--<br>／<br><pre id="dynamic">中時新聞網</pre>')`);
    await evaluate('new Promise(resolve => setTimeout(resolve, 350))');
    assert.equal(await evaluate(`document.querySelector('#article').hasAttribute('data-font-changer-exclude')`), false);
    assert.deepEqual((await fontsFor('#dynamic')).map(font => font.familyName), [expectedCjk[0].familyName]);
  } finally {
    socket?.close();
    browser.kill();
    await new Promise(resolve => {
      if (browser.exitCode !== null || browser.signalCode !== null) return resolve();
      const timer = setTimeout(resolve, 2000);
      browser.once('exit', () => { clearTimeout(timer); resolve(); });
    });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
