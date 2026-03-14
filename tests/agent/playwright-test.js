/**
 * Playwright test for the observability dashboard agent test environment.
 * Verifies the dashboard UI loads correctly and can be navigated.
 *
 * Prerequisites (handled by setup.sh --web):
 *   - Test server running on port 4100
 *   - Dashboard dev server running on port 5174
 *
 * Usage:
 *   ./setup.sh --web
 *   node tests/agent/playwright-test.js
 *   ./teardown.sh
 */

// Support multiple install locations (global, npm prefix, npx cache)
const { readdirSync } = require('fs');
let chromium;
const _pwLocations = [
  'playwright',
  '/home/node/.local/lib/node_modules/playwright',
];
// Also search the npx cache (hashed dirs under ~/.npm/_npx/)
try {
  const npxBase = `${process.env.HOME}/.npm/_npx`;
  for (const hash of readdirSync(npxBase)) {
    _pwLocations.push(`${npxBase}/${hash}/node_modules/playwright`);
  }
} catch (_) {}
for (const loc of _pwLocations) {
  try { ({ chromium } = require(loc)); break; } catch (_) {}
}
if (!chromium) throw new Error('playwright not found — install with: npm install -g playwright');

const DASHBOARD_URL = 'http://127.0.0.1:5174/dashboard/';
const EXPECTED_CONTAINERS = ['container-alpha', 'container-beta'];
const EXPECTED_HOSTS = ['test-host1', 'test-host2'];

async function run() {
  // Use system chromium if Playwright's bundled binary isn't available
  const launchOpts = { headless: true };
  for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) {
    try { require('fs').accessSync(p); launchOpts.executablePath = p; break; } catch (_) {}
  }
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();

  let passed = 0;
  let failed = 0;

  function pass(msg) { console.log(`  PASS: ${msg}`); passed++; }
  function fail(msg) { console.log(`  FAIL: ${msg}`); failed++; }

  async function check(desc, fn) {
    try {
      await fn();
      pass(desc);
    } catch (e) {
      fail(`${desc} — ${e.message}`);
    }
  }

  console.log('\n=== Observability Dashboard Playwright Test ===\n');

  // ── 1. Page loads ──────────────────────────────────────────────────────────
  await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle', timeout: 15000 });

  await check('Page title is "Infrastructure Dashboard"', async () => {
    const h1 = await page.textContent('h1');
    if (!h1?.includes('Infrastructure Dashboard')) throw new Error(`Got: "${h1}"`);
  });

  // ── 2. WebSocket connects (Live indicator) ─────────────────────────────────
  await check('Live connection indicator appears within 5s', async () => {
    await page.waitForSelector('text=Live', { timeout: 5000 });
  });

  // ── 3. Wait for containers to appear ──────────────────────────────────────
  // Give daemons time to send heartbeats and dashboard to render
  await page.waitForTimeout(3000);

  await check('Summary shows at least 2 containers', async () => {
    const summaryText = await page.textContent('header');
    const m = summaryText?.match(/(\d+)\s+container/);
    const count = m ? parseInt(m[1]) : 0;
    if (count < 2) throw new Error(`Summary shows ${count} containers, expected ≥2`);
  });

  await check('Summary shows at least 2 hosts', async () => {
    const summaryText = await page.textContent('header');
    const m = summaryText?.match(/(\d+)\s+host/);
    const count = m ? parseInt(m[1]) : 0;
    if (count < 2) throw new Error(`Summary shows ${count} hosts, expected ≥2`);
  });

  // ── 4. Hosts appear in the main body ──────────────────────────────────────
  // HostGroup renders "HOST: <hostname>" in a collapsible button
  for (const host of EXPECTED_HOSTS) {
    await check(`Host "${host}" visible in main body`, async () => {
      await page.waitForSelector(`text=HOST: ${host}`, { timeout: 5000 });
    });
  }

  // ── 5. Container names visible ─────────────────────────────────────────────
  for (const container of EXPECTED_CONTAINERS) {
    await check(`Container "${container}" visible`, async () => {
      const els = await page.locator(`text=${container}`).all();
      if (els.length === 0) throw new Error(`No element found with text "${container}"`);
    });
  }

  // ── 6. Review Board toggle ────────────────────────────────────────────────
  await check('Review Board button toggles view', async () => {
    const btn = page.locator('button', { hasText: 'Review Board' });
    await btn.waitFor({ timeout: 3000 });
    await btn.click();
    await page.waitForTimeout(500);
    await btn.click();
    await page.waitForTimeout(500);
  });

  // ── 7. System versions gear button ────────────────────────────────────────
  await check('System versions gear button toggles panel', async () => {
    const btn = page.locator('button[title="System versions"]');
    await btn.waitFor({ timeout: 3000 });
    await btn.click();
    await page.waitForTimeout(400);
    await btn.click();
    await page.waitForTimeout(400);
  });

  // ── 8. Event Stream link present ──────────────────────────────────────────
  await check('Event Stream link is present', async () => {
    await page.locator('a', { hasText: 'Event Stream' }).waitFor({ timeout: 3000 });
  });

  // ── 9. Task queue content visible ────────────────────────────────────────
  await check('Task queue content is visible in main body', async () => {
    const body = await page.textContent('main');
    if (!body || body.length < 10) throw new Error('Main body is empty');
    // planq-order.txt contains task content; any of these words confirms it rendered
    if (!body.includes('task') && !body.includes('Review') && !body.includes('planq')) {
      throw new Error('No task content found in main body');
    }
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  await browser.close();

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nSome checks failed.');
    process.exit(1);
  } else {
    console.log('\nAll checks passed — dashboard is navigable.');
  }
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
