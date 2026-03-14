/**
 * Playwright tests for features added in the prompt-task-commit association session:
 *   - Task filter dimming: parent tasks shown grayed-out when only a child matches
 *   - 💬 session link button on tasks with session_ids
 *   - System versions stamp-unknown state
 *   - Subtask display in task panels
 *
 * Prerequisites (handled by setup.sh --web):
 *   - Test server running on port 4100
 *   - Dashboard dev server running on port 5174
 *
 * Usage:
 *   cd observability/tests/agent
 *   ./setup.sh --web
 *   node playwright-test-new-features.js
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

  console.log('\n=== New Feature Tests — Observability Dashboard ===\n');

  // ── 0. Setup: load dashboard and wait for data ─────────────────────────────
  await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForSelector('text=Live', { timeout: 10000 });
  // Give daemons time to send heartbeats and session logs
  await page.waitForTimeout(8000);

  // ── 1. Subtasks render under parent task ──────────────────────────────────
  console.log('\n-- Subtask display --');

  await check('Task "task-example" is visible in at least one container', async () => {
    await page.waitForSelector('text=task-example', { timeout: 5000 });
  });

  await check('Subtask "subtask of example" appears under parent', async () => {
    await page.waitForSelector('text=subtask of example', { timeout: 5000 });
  });

  await check('"another subtask" also appears', async () => {
    await page.waitForSelector('text=another subtask', { timeout: 5000 });
  });

  // ── 2. Task filter dimming — type filter buttons ───────────────────────────
  console.log('\n-- Task filter dimming --');

  // The Plan Queue panel has status/review/type filter buttons.
  // task-example.md has type=task; its children are unnamed-task.
  // Activating the "unnamed-task" type filter should:
  //   - show the parent task-example.md as DIMMED (parent of matching unnamed-task children)
  //   - show the unnamed-task subtasks and "standalone filter target" normally
  //   - hide "Review the output and approve" (manual-task, no unnamed-task descendants)

  // The type filter button for unnamed-task has title "Unnamed-task (N) — click to filter..."
  const unnamedTaskFilterBtn = page.locator('button[title*="Unnamed-task"]').first();

  await check('Unnamed-task type filter button is visible', async () => {
    await unnamedTaskFilterBtn.waitFor({ timeout: 5000 });
  });

  await check('Clicking unnamed-task filter applies it', async () => {
    await unnamedTaskFilterBtn.click();
    await page.waitForTimeout(400);
    // After filtering, no-match tasks should be hidden; task-example should be dimmed
    // Verify the clear button for type filter appears
    await page.locator('button[title="Clear type filter"]').first().waitFor({ timeout: 3000 });
  });

  await check('Parent task appears dimmed (grayscale) when only children match filter', async () => {
    // PlanqTaskRow adds 'grayscale opacity-40' when dimmed prop is true
    const dimmedRows = await page.locator('[class*="grayscale"]').count();
    if (dimmedRows === 0) throw new Error('No dimmed (grayscale) task rows found — parent should be dimmed when only its unnamed-task children match the type filter');
  });

  await check('"standalone filter target" is visible when unnamed-task filter active', async () => {
    await page.locator('text=standalone filter target').first().waitFor({ timeout: 3000 });
  });

  await check('Clearing type filter restores all tasks', async () => {
    const clearBtn = page.locator('button[title="Clear type filter"]').first();
    await clearBtn.click();
    await page.waitForTimeout(400);
    // The clear button should disappear
    const clearCount = await page.locator('button[title="Clear type filter"]').count();
    if (clearCount > 0) throw new Error('Clear type filter button should be gone after clearing');
    // All tasks should reappear — including manual-task
    await page.locator('text=Review the output and approve').first().waitFor({ timeout: 3000 });
  });

  await check('No dimmed tasks after clearing filter', async () => {
    const dimmedRows = await page.locator('[class*="grayscale"]').count();
    if (dimmedRows > 0) throw new Error(`${dimmedRows} task rows are still dimmed after clearing filter`);
  });

  // ── 3. Session link (💬) button on tasks ──────────────────────────────────
  console.log('\n-- Session link 💬 button --');

  // populate-data.sh writes session logs that reference "task-example.md".
  // The server scans incoming session_log_push content and creates task_session_links.
  // This propagates back as session_ids[] on the task, which causes 💬 to appear.
  // Give extra time for the session links to propagate.
  await page.waitForTimeout(10000);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  await check('💬 button present on task with linked session', async () => {
    // The 💬 button has title "N linked session(s) — click to view"
    const sessionBtns = await page.locator('button[title*="linked session"]').count();
    if (sessionBtns === 0) throw new Error('No session-link (💬) buttons found — task_session_links may not be populated yet');
  });

  await check('💬 button has correct title format', async () => {
    const btn = page.locator('button[title*="linked session"]').first();
    const title = await btn.getAttribute('title');
    if (!title?.match(/\d+ linked session/)) throw new Error(`Button title "${title}" does not match expected format`);
  });

  // ── 4. System versions panel ──────────────────────────────────────────────
  console.log('\n-- System versions panel --');

  await check('Gear button opens system versions panel', async () => {
    const gearBtn = page.locator('button[title="System versions"]');
    await gearBtn.waitFor({ timeout: 3000 });
    await gearBtn.click();
    await page.waitForTimeout(500);
    // Panel renders "System Versions" title and "Worktrees" section heading
    await page.locator('text=System Versions').first().waitFor({ timeout: 3000 });
    // Close the panel
    await gearBtn.click();
    await page.waitForTimeout(300);
    // Panel should be gone after closing
    const panelVisible = await page.locator('.system-version-panel').isVisible().catch(() => false);
    if (panelVisible) throw new Error('System versions panel still visible after closing gear button');
  });

  // ── 5. Review Board toggle still works ────────────────────────────────────
  console.log('\n-- Review Board --');

  await check('Review Board button toggles view', async () => {
    const btn = page.locator('button', { hasText: 'Review Board' });
    await btn.waitFor({ timeout: 3000 });
    await btn.click();
    await page.waitForTimeout(500);
    // After enabling, main should be hidden
    const mainVisible = await page.locator('main').isVisible();
    if (mainVisible) throw new Error('main body is still visible after enabling Review Board');
    await btn.click();
    await page.waitForTimeout(500);
    await page.locator('main').waitFor({ state: 'visible', timeout: 3000 });
  });

  // ── 6. Status filter also works (regression) ──────────────────────────────
  console.log('\n-- Status filter regression --');

  await check('Status filter buttons are visible', async () => {
    // Status label text is visible in the filter row
    await page.locator('text=status:').first().waitFor({ timeout: 3000 });
  });

  // ── Summary ────────────────────────────────────────────────────────────────
  await browser.close();

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\nSome checks failed.');
    process.exit(1);
  } else {
    console.log('\nAll checks passed.');
  }
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
