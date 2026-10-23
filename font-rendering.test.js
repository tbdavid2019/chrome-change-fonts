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
