import { MODE_KEYS, type Mode, type StoredTheme } from './shared.ts';
import { findTheme, THEMES, type Theme } from './themes.ts';

const tabs = document.getElementById('tabs')!;
const list = document.getElementById('list')!;
const status = document.getElementById('status')!;

const selected: Record<Mode, string | null> = { dark: null, light: null };
let mode: Mode = 'dark';

async function load(): Promise<void> {
  const items = await chrome.storage.local.get([MODE_KEYS.dark, MODE_KEYS.light]);
  for (const m of ['dark', 'light'] as const) {
    selected[m] = (items[MODE_KEYS[m]] as StoredTheme | undefined)?.id ?? null;
  }
}

async function select(theme: Theme | null): Promise<void> {
  const key = MODE_KEYS[mode];
  if (theme == null) {
    await chrome.storage.local.remove(key);
  } else {
    const css = await (await fetch(chrome.runtime.getURL(`themes/${theme.id}.css`))).text();
    const stored: StoredTheme = { id: theme.id, css };
    await chrome.storage.local.set({ [key]: stored });
  }
  selected[mode] = theme?.id ?? null;
  render();
}

/** Paints the popup in the theme chosen for the visible mode. */
function paint(theme: Theme | undefined): void {
  const fallback =
    mode === 'dark'
      ? { bg: '#0d1117', bgMuted: '#151b23', border: '#3d444d', fg: '#f0f6fc', fgMuted: '#9198a1', blue: '#4493f8' }
      : { bg: '#ffffff', bgMuted: '#f6f8fa', border: '#d1d9e0', fg: '#1f2328', fgMuted: '#59636e', blue: '#0969da' };
  const p = theme?.palette ?? fallback;
  const root = document.documentElement.style;
  root.setProperty('--bg', p.bg);
  root.setProperty('--bg-muted', p.bgMuted);
  root.setProperty('--border', p.border);
  root.setProperty('--fg', p.fg);
  root.setProperty('--fg-muted', p.fgMuted);
  root.setProperty('--accent', p.blue);
  root.colorScheme = mode;
}

function swatch(theme: Theme | null): HTMLElement {
  const node = document.createElement('span');
  node.className = 'swatch';
  if (theme == null) {
    node.classList.add(`swatch-default-${mode}`);
    return node;
  }
  const p = theme.palette;
  node.style.background = p.bg;
  node.style.borderColor = p.border;
  for (const color of [p.blue, p.green, p.yellow, p.red, p.purple]) {
    const dot = document.createElement('i');
    dot.style.background = color;
    node.append(dot);
  }
  return node;
}

function option(theme: Theme | null): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'option';
  button.setAttribute('aria-pressed', String((theme?.id ?? null) === selected[mode]));
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = theme?.name ?? 'GitHub default';
  button.append(swatch(theme), name);
  button.addEventListener('click', () => {
    void select(theme);
  });
  return button;
}

function tab(target: Mode): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', String(target === mode));
  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = target === 'dark' ? 'Dark mode' : 'Light mode';
  const value = document.createElement('span');
  value.className = 'tab-value';
  value.textContent = findTheme(selected[target] ?? undefined)?.name ?? 'GitHub default';
  button.append(label, value);
  button.addEventListener('click', () => {
    mode = target;
    render();
  });
  return button;
}

function render(): void {
  paint(findTheme(selected[mode] ?? undefined));
  status.textContent = 'Follows your GitHub appearance setting';
  tabs.replaceChildren(tab('dark'), tab('light'));
  list.replaceChildren(option(null), ...THEMES.filter((theme) => theme.type === mode).map(option));
  list.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
}

await load();
render();
