import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { modes, definitions, contrast, exportTokens } from '../design-system/tokens.js';
const require = createRequire(import.meta.url);
assert.equal(contrast('#FFFFFF', '#000000'), 21);
assert.equal(contrast('#5145CD', '#5145CD'), 1);
for (const [mode, palette] of Object.entries(modes)) {
  for (const [name, key, , partner, target] of definitions) if (partner) assert.ok(contrast(palette[key], palette[partner]) >= target, `${mode}: ${name}`);
  const tokens = exportTokens(mode);
  for (const group of Object.values(tokens.semantic)) for (const token of Object.values(group)) {
    const key = token.$value.match(/^\{primitive\.(.+)\}$/)?.[1];
    assert.ok(tokens.primitive[key], 'Token aliases resolve');
  }
}
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await mkdir('reports/design-system', { recursive: true });
try {
  await page.goto(process.env.UI_URL || 'http://127.0.0.1:5173');
  await page.screenshot({ path: 'reports/design-system/overview.png', fullPage: true });
  const findings = [];
  for (const theme of Object.keys(modes)) {
    await page.selectOption('#theme', theme);
    for (const route of ['overview', 'tokens', 'components', 'audits', 'docs']) {
      await page.locator(`nav a[data-page="${route}"]`).click();
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      const result = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }));
      findings.push({ theme, route, violations: result.violations });
    }
  }
  await writeFile('reports/design-system/axe.json', JSON.stringify(findings, null, 2));
  assert.equal(findings.reduce((n, f) => n + f.violations.length, 0), 0, 'Axe violations (see reports/design-system/axe.json)');
  await page.locator('nav a[data-page="tokens"]').click();
  await page.locator('#token-search').fill('focus');
  assert.equal(await page.locator('#token-rows tr').count(), 1);
  await page.locator('#token-search').fill('no-match');
  assert.equal(await page.locator('#token-empty').isVisible(), true);
  const tokenDownload = page.waitForEvent('download');
  await page.locator('#tokens .export').click();
  assert.equal((await tokenDownload).suggestedFilename(), 'access-tokens-contrast.json');
  await page.locator('nav a[data-page="components"]').click();
  await page.locator('#generate').click();
  await page.waitForFunction(() => document.querySelector('#response').textContent.length > 20);
  await page.locator('#pause').click();
  const pausedText = await page.locator('#response').textContent();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#response').textContent(), pausedText);
  await page.locator('#pause').click();
  await page.locator('#stop').click();
  assert.equal(await page.locator('.chat-output').getAttribute('aria-busy'), 'false');
  await page.locator('#retry').click();
  await page.waitForFunction(() => document.querySelector('#chat-state').textContent === 'Completed');
  assert.ok((await page.locator('#response').textContent()).endsWith('real product.'));
  await page.locator('#mic').click();
  assert.equal(await page.locator('#mic').getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#voice-state').textContent(), 'Idle');
  await page.locator('#mic').click();
  await page.locator('#voice-done').click();
  await page.waitForFunction(() => document.querySelector('#transcript').textContent.startsWith('Simulated transcript:'));
  await page.locator('nav a[data-page="audits"]').click();
  await page.locator('input[value="keyboard"]').check();
  await page.locator('#audit-notes').fill('Browser smoke test; manual AT review still required.');
  await page.reload();
  assert.equal(await page.locator('input[value="keyboard"]').isChecked(), true);
  assert.match(await page.locator('#audit-notes').inputValue(), /manual AT/);
  const auditDownload = page.waitForEvent('download');
  await page.locator('#export-audit').click();
  assert.equal((await auditDownload).suggestedFilename(), 'access-audit-checklist.json');
  await page.selectOption('#theme', 'light');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of ['overview', 'tokens', 'components', 'audits', 'docs']) {
      await page.locator(`nav a[data-page="${route}"]`).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px ${route} overflow`);
    }
  }
  await page.locator('nav a[data-page="overview"]').click();
  await page.screenshot({ path: 'reports/design-system/mobile.png', fullPage: true });
  await page.emulateMedia({ forcedColors: 'active' });
  await page.keyboard.press('Tab');
  await page.locator('#overview .export').focus();
  assert.equal(await page.locator('#overview .export').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
  await page.screenshot({ path: 'reports/design-system/forced-colors.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log('Passed: 21 contrast pairs, token aliases, 15 axe scans, exports, chat states, voice flow, local persistence, 320/390px layouts, forced-color focus.');
} finally { await browser.close(); }
