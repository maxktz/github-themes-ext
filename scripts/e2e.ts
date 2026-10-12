// Checks per-mode theme slots, live switching and persistence, with dist/ loaded as an
// unpacked extension (signed out). Usage: node scripts/e2e.ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const extensionPath = resolve('dist');
const profile = await mkdtemp(join(tmpdir(), 'github-themes-ext-e2e-'));
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  colorScheme: 'light',
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
const failures: string[] = [];
const check = (ok: boolean, message: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};

try {
  const admin = await context.newPage();
  await admin.goto('chrome://extensions');
  const id = await admin.evaluate(
    () =>
      document
        .querySelector('extensions-manager')
        ?.shadowRoot?.querySelector('extensions-item-list')
        ?.shadowRoot?.querySelector('extensions-item')?.id ?? ''
  );
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);

  const gh = await context.newPage();
  await gh.goto('https://github.com/tokyo-night/tokyo-night-vscode-theme', { waitUntil: 'domcontentloaded' });
  const state = () =>
    gh.evaluate(() => ({
      style: document.getElementById('github-themes-ext') != null,
      mode: document.documentElement.getAttribute('data-color-mode'),
      bg: getComputedStyle(document.body).backgroundColor,
    }));
  /** Polls until the page reaches the expected state (or 5s pass). */
  const settle = async (expectStyle: boolean) => {
    await gh
      .waitForFunction((want) => (document.getElementById('github-themes-ext') != null) === want, expectStyle, { timeout: 5000 })
      .catch(() => {});
    await gh.waitForTimeout(150);
  };
  /** Waits until the popup's selection for a mode is saved to storage. */
  const saved = (key: string, id: string | null) =>
    popup.evaluate(
      async ([key, id]) => {
        for (let i = 0; i < 100; i++) {
          const items = await chrome.storage.local.get(key);
          if (((items[key as string] as { id: string } | undefined)?.id ?? null) === id) return true;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return false;
      },
      [key, id] as const
    );
  const lightDefault = await state();
  check(!lightDefault.style, `no theme by default (mode=${lightDefault.mode}, bg=${lightDefault.bg})`);

  // Dark slot: Tokyo Night. The page is in light mode, so nothing changes yet.
  await popup.locator('#tabs button', { hasText: 'Dark mode' }).click();
  await popup.locator('.option', { hasText: /^Tokyo Night$/ }).click();
  await saved('darkTheme', 'tokyo-night');
  await gh.waitForTimeout(300);
  let now = await state();
  check(!now.style && now.bg === lightDefault.bg, 'dark-mode theme stays off while GitHub is in light mode');

  // OS switches to dark (GitHub is on "auto"): Tokyo Night applies live.
  await gh.emulateMedia({ colorScheme: 'dark' });
  await settle(true);
  now = await state();
  check(now.style && now.bg === 'rgb(26, 27, 38)', `Tokyo Night applies when the mode turns dark (${JSON.stringify(now)})`);
  check(now.mode === lightDefault.mode, `GitHub's data-color-mode is left untouched (${now.mode})`);

  await gh.reload({ waitUntil: 'domcontentloaded' });
  now = await state();
  check(now.style && now.bg === 'rgb(26, 27, 38)', 'theme persists across reloads (applied at document_start)');

  // Back to light: the light slot is still GitHub default.
  await gh.emulateMedia({ colorScheme: 'light' });
  await settle(false);
  now = await state();
  check(!now.style && now.bg === lightDefault.bg, `light mode keeps GitHub's default (${JSON.stringify(now)})`);

  // Light slot can be set independently.
  await popup.locator('#tabs button', { hasText: 'Light mode' }).click();
  await popup.locator('.option', { hasText: 'Catppuccin Latte' }).click();
  await saved('lightTheme', 'catppuccin-latte');
  await settle(true);
  now = await state();
  check(now.style && now.bg === 'rgb(239, 241, 245)', `a light-mode theme applies in light mode (${JSON.stringify(now)})`);
  await popup.locator('.option', { hasText: 'GitHub default' }).click();
  await saved('lightTheme', null);
  await settle(false);
  now = await state();
  check(!now.style && now.bg === lightDefault.bg, 'setting light mode back to GitHub default restores it');

  // Settings page picker. The real page needs a session, so serve a stand-in
  // with GitHub's anchor markup at the same URL.
  await context.route('https://github.com/settings/appearance', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html data-color-mode="auto"><head><title>Appearance</title></head><body>
        <section><appearance-form><div class="Subhead"><h2 id="color-mode-heading">Theme preferences</h2></div></appearance-form></section>
        <section><h2 id="emoji-heading">Emoji skin tone preference</h2></section></body></html>`,
    })
  );
  const settings = await context.newPage();
  await settings.emulateMedia({ colorScheme: 'dark' });
  await settings.goto('https://github.com/settings/appearance');
  const darkSelect = settings.locator('#github-themes-ext-settings-dark');
  await darkSelect.waitFor({ timeout: 5000 });
  const placed = await settings.evaluate(
    () => document.getElementById('github-themes-ext-settings')?.previousElementSibling?.querySelector('#color-mode-heading') != null
  );
  check(placed, 'settings page gets an "Extension themes" section below Theme preferences');
  check((await darkSelect.inputValue()) === 'tokyo-night', 'settings picker shows the current dark-mode theme');
  await darkSelect.selectOption('tokyo-night-storm');
  await saved('darkTheme', 'tokyo-night-storm');
  await gh.emulateMedia({ colorScheme: 'dark' });
  await gh.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(36, 40, 59)', undefined, { timeout: 5000 }).catch(() => {});
  now = await state();
  check(now.bg === 'rgb(36, 40, 59)', `choosing in settings applies to other tabs (${JSON.stringify(now)})`);
  await darkSelect.selectOption('tokyo-night');
  await gh.emulateMedia({ colorScheme: 'light' });
  await settle(false);

  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options.html`);
  check((await options.locator('.option').count()) > 5, 'options page lists themes');

  const tabValues = await popup.locator('.tab-value').allTextContents();
  check(
    tabValues[0] === 'Tokyo Night' && tabValues[1] === 'GitHub default',
    `popup shows both slots (${tabValues.join(' / ')})`
  );
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
  console.log(failures.length === 0 ? '\nAll checks passed' : `\n${failures.length} failed`);
  process.exit(failures.length === 0 ? 0 : 1);
}
