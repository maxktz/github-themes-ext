// Runs at document_start on GitHub. Each color mode has its own theme slot
// (or none, for GitHub's default). GitHub's appearance setting decides the
// mode: `data-color-mode` on <html>, and the OS preference when it is "auto".
// The matching slot's stylesheet is injected; GitHub's attributes are left
// alone.
//
// chrome.storage is async, so both slots are also cached in the page's
// localStorage and applied synchronously before first paint.

import { initSettingsPage } from './settings-page.ts';
import { MODE_KEYS, type Mode, type StoredTheme } from './shared.ts';

const STYLE_ID = 'github-themes-ext';
const CACHE_KEY = 'github-themes-ext:themes';

type Slots = Record<Mode, StoredTheme | null>;

let slots: Slots = readCache();
const systemDark = matchMedia('(prefers-color-scheme: dark)');

function readCache(): Slots {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw != null) return JSON.parse(raw) as Slots;
  } catch {
    // Fall through to the async path.
  }
  return { dark: null, light: null };
}

function writeCache(): void {
  try {
    if (slots.dark == null && slots.light == null) localStorage.removeItem(CACHE_KEY);
    else localStorage.setItem(CACHE_KEY, JSON.stringify(slots));
  } catch {
    // Quota or privacy settings; the async path still applies the theme.
  }
}

function currentMode(root: HTMLElement): Mode {
  const mode = root.getAttribute('data-color-mode');
  if (mode === 'dark' || mode === 'light') return mode;
  return systemDark.matches ? 'dark' : 'light';
}

function sync(): void {
  const root = document.documentElement;
  if (root == null) return;
  const theme = slots[currentMode(root)];
  let style = document.getElementById(STYLE_ID);
  if (theme == null) {
    style?.remove();
    return;
  }
  if (style == null) {
    style = document.createElement('style');
    style.id = STYLE_ID;
  }
  if (style.textContent !== theme.css) style.textContent = theme.css;
  // Directly under <html>: outside <head>, which GitHub's Turbo navigation
  // rewrites, and after it in document order.
  if (style.parentElement !== root) root.append(style);
}

function observe(): void {
  const root = document.documentElement;
  if (root == null) return;
  // GitHub changes the mode attribute when you switch appearance settings,
  // and may drop our style element during navigation.
  new MutationObserver(sync).observe(root, {
    attributes: true,
    attributeFilter: ['data-color-mode'],
    childList: true,
  });
}

if (document.documentElement != null) {
  sync();
  observe();
} else {
  const waiter = new MutationObserver(() => {
    if (document.documentElement == null) return;
    waiter.disconnect();
    sync();
    observe();
  });
  waiter.observe(document, { childList: true });
}
systemDark.addEventListener('change', sync);

function fromStorage(items: Record<string, unknown>): Slots {
  return {
    dark: (items[MODE_KEYS.dark] as StoredTheme | undefined) ?? null,
    light: (items[MODE_KEYS.light] as StoredTheme | undefined) ?? null,
  };
}

chrome.storage.local.get([MODE_KEYS.dark, MODE_KEYS.light]).then((items) => {
  const stored = fromStorage(items);
  if (JSON.stringify(stored) === JSON.stringify(slots)) return;
  slots = stored;
  writeCache();
  sync();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let changed = false;
  for (const mode of ['dark', 'light'] as const) {
    const change = changes[MODE_KEYS[mode]];
    if (change == null) continue;
    slots[mode] = (change.newValue as StoredTheme | undefined) ?? null;
    changed = true;
  }
  if (!changed) return;
  writeCache();
  sync();
});

initSettingsPage();
