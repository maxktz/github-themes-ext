// Loads dist/ into Playwright's Chromium, picks a theme through the real
// popup, and screenshots a set of GitHub pages (signed out).
// Usage: node scripts/shots.ts [theme-id ...]   (default: tokyo-night)
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';

import { findTheme } from '../src/themes.ts';

const themes = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
if (themes.length === 0) themes.push('tokyo-night');

const PAGES: [string, string][] = [
  ['repo', 'https://github.com/tokyo-night/tokyo-night-vscode-theme'],
  ['code', 'https://github.com/facebook/react/blob/main/packages/react/src/ReactHooks.js'],
  ['pr', 'https://github.com/mastra-ai/mastra/pull/26691'],
  ['pr-files', 'https://github.com/mastra-ai/mastra/pull/26691/files'],
  ['issues', 'https://github.com/microsoft/vscode/issues'],
  ['profile', 'https://github.com/torvalds'],
];

const extensionPath = resolve('dist');
const outdir = resolve('.scratch/shots');
await mkdir(outdir, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), 'github-themes-ext-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: !process.argv.includes('--headed'),
  colorScheme: 'dark',
  viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

async function extensionId(page: Page): Promise<string> {
  await page.goto('chrome://extensions');
  return page.evaluate(() => {
    const manager = document.querySelector('extensions-manager');
    const list = manager?.shadowRoot?.querySelector('extensions-item-list');
    const item = list?.shadowRoot?.querySelector('extensions-item');
    return item?.id ?? '';
  });
}

const errors: string[] = [];
try {
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  const id = await extensionId(page);
  if (id === '') throw new Error('Extension did not load');

  for (const theme of themes) {
    const name = findTheme(theme)?.name;
    if (name == null) throw new Error(`Unknown theme ${theme}`);
    const type = findTheme(theme)!.type;
    await page.emulateMedia({ colorScheme: type });
    await page.goto(`chrome-extension://${id}/popup.html`);
    await page.locator('#tabs button', { hasText: type === 'dark' ? 'Dark mode' : 'Light mode' }).click();
    await page.locator('.option .name', { hasText: new RegExp(`^${name}$`) }).click();
    await page.locator('.option[aria-pressed="true"]', { hasText: name }).waitFor();
    await page.screenshot({ path: join(outdir, `${theme}-popup.png`), clip: { x: 0, y: 0, width: 300, height: 560 } });

    for (const [name, url] of PAGES) {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      const applied = await page.evaluate(() => ({
        style: document.getElementById('github-themes-ext') != null,
        bg: getComputedStyle(document.body).backgroundColor,
        mode: document.documentElement.dataset.colorMode,
      }));
      console.log(`${theme} ${name}: style=${applied.style} mode=${applied.mode} body=${applied.bg}`);
      await page.screenshot({ path: join(outdir, `${theme}-${name}.png`) });
    }
  }
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
  if (errors.length > 0) console.log('Page errors:', errors.slice(0, 5));
  console.log(`Screenshots in ${outdir}`);
}
