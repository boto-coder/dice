// Measures frame rate while rolling a full tray of 20 mixed dice.
// Usage: node scripts/perf.mjs [baseUrl] [--headed] [--profile] [--styled]
//   --styled gives each die type a different look (every pattern and finish).
//   --profile prints the functions using the most CPU in the first 0.5 s of the second roll.
//   Use a production build for realistic numbers: npm run build && npm run preview
// Runs a Pixel 7 emulation at 1× and 4× CPU slowdown (4× ≈ a mid-range phone)
// and a desktop viewport, and prints frame statistics per run.
// Note: headless Chromium usually renders WebGL in software (SwiftShader),
// which is slower than a real phone GPU; the GL renderer is printed per run.
import { chromium, devices } from '@playwright/test';

const args = process.argv.slice(2);
const headed = args.includes('--headed');
const profile = args.includes('--profile');
const styled = args.includes('--styled');
/** One look per die type, covering every pattern and finish. */
const LOOKS = {
  d4: { body: '#fbfbf8', accent: '#d9d6cc', label: 'auto', pattern: 'solid', finish: 'matte' },
  d6: { body: '#8e1428', accent: '#e07a8c', label: 'auto', pattern: 'marble', finish: 'glossy' },
  d8: { body: '#0b4f6c', accent: '#8fdcf5', label: 'auto', pattern: 'speckled', finish: 'matte' },
  d10: {
    body: '#d4a73a',
    accent: '#fff0b3',
    label: 'auto',
    pattern: 'gradient',
    finish: 'metallic',
  },
  d12: { body: '#1e5e3f', accent: '#2f8a5c', label: 'auto', pattern: 'swirl', finish: 'glossy' },
  d20: { body: '#4b2a85', accent: '#7a52c0', label: 'auto', pattern: 'stripes', finish: 'glossy' },
  d100: {
    body: '#17171c',
    accent: '#4a4a5c',
    label: 'auto',
    pattern: 'marble',
    finish: 'metallic',
  },
};
const baseUrl = args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:4173';
const TRAY = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

const runs = [
  { name: 'desktop', context: { viewport: { width: 1280, height: 860 } }, cpu: 1 },
  { name: 'phone', context: devices['Pixel 7'], cpu: 1 },
  { name: 'phone, 4× slower CPU', context: devices['Pixel 7'], cpu: 4 },
];

/** Prints the functions with the most self time in a CDP CPU profile. */
function printTopFunctions(cpuProfile) {
  const byId = new Map(cpuProfile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const deltas = cpuProfile.timeDeltas;
  cpuProfile.samples.forEach((id, i) => {
    const { functionName, url, lineNumber } = byId.get(id).callFrame;
    const key = `${functionName || '(anonymous)'} ${url.split('/').pop()}:${lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (deltas[i] ?? 0) / 1000);
  });
  const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 15);
  console.log('  top self time in the first 0.5 s of a roll:');
  for (const [key, ms] of top) console.log(`    ${ms.toFixed(1).padStart(7)} ms  ${key}`);
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

const browser = await chromium.launch({ headless: !headed });
for (const { name, context, cpu } of runs) {
  const ctx = await browser.newContext(context);
  const page = await ctx.newPage();
  if (styled) {
    await page.addInitScript(
      (value) => {
        localStorage.setItem('dice-roller:settings', value);
      },
      JSON.stringify({ version: 1, theme: 'dark', dice: LOOKS }),
    );
  }
  await page.goto(baseUrl);
  await page.waitForSelector('canvas');
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  for (let i = 0; i < 20; i++) {
    await page.getByRole('button', { name: `Add ${TRAY[i % TRAY.length]} to tray` }).click();
  }
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

  const results = [];
  for (let roll = 0; roll < 3; roll++) {
    await page.evaluate(() => {
      window.__frames = [];
      const tick = (t) => {
        window.__frames.push(t);
        if (window.__recording) requestAnimationFrame(tick);
      };
      window.__recording = true;
      requestAnimationFrame(tick);
    });
    const started = Date.now();
    const profiling = profile && roll === 1;
    if (profiling) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
    }
    await page.getByRole('button', { name: 'Roll', exact: true }).click();
    if (profiling) {
      await page.waitForTimeout(500);
      const { profile: cpuProfile } = await cdp.send('Profiler.stop');
      printTopFunctions(cpuProfile);
    }
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, {
      timeout: 60_000,
    });
    const seconds = (Date.now() - started) / 1000;
    const frames = await page.evaluate(() => {
      window.__recording = false;
      return window.__frames;
    });
    const deltas = frames.slice(1).map((t, i) => t - frames[i]);
    results.push({ seconds, deltas });
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const all = results.flatMap((r) => r.deltas).sort((a, b) => a - b);
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const slow = all.filter((d) => d > 1000 / 30).length;
  console.log(
    [
      `${name} (GL: ${renderer})`,
      `  roll time: ${results.map((r) => r.seconds.toFixed(1) + ' s').join(', ')}`,
      `  longest frame per roll: ${results
        .map((r) => {
          const worst = Math.max(...r.deltas);
          return `${worst.toFixed(0)} ms (frame ${r.deltas.indexOf(worst) + 1} of ${r.deltas.length})`;
        })
        .join(', ')}`,
      `  frames: ${all.length}, mean ${mean.toFixed(1)} ms (${(1000 / mean).toFixed(0)} fps), ` +
        `median ${percentile(all, 0.5).toFixed(1)} ms, p95 ${percentile(all, 0.95).toFixed(1)} ms, ` +
        `worst ${all[all.length - 1].toFixed(1)} ms, below 30 fps: ${((100 * slow) / all.length).toFixed(0)}%`,
    ].join('\n'),
  );
  await ctx.close();
}
await browser.close();
