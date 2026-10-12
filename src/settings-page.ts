// Adds an "Extension themes" section to github.com/settings/appearance, right
// below GitHub's own theme preferences, so themes can be picked without the
// toolbar popup.

import { MODE_KEYS, type Mode, type StoredTheme } from './shared.ts';
import { THEMES, type Theme } from './themes.ts';

const SECTION_ID = 'github-themes-ext-settings';
const PATH = '/settings/appearance';
const repaint = new Map<Mode, () => void>();

async function loadSelection(): Promise<Record<Mode, string>> {
  const items = await chrome.storage.local.get([MODE_KEYS.dark, MODE_KEYS.light]);
  return {
    dark: (items[MODE_KEYS.dark] as StoredTheme | undefined)?.id ?? '',
    light: (items[MODE_KEYS.light] as StoredTheme | undefined)?.id ?? '',
  };
}

async function choose(mode: Mode, id: string): Promise<void> {
  const key = MODE_KEYS[mode];
  if (id === '') {
    await chrome.storage.local.remove(key);
    return;
  }
  const css = await (await fetch(chrome.runtime.getURL(`themes/${id}.css`))).text();
  const stored: StoredTheme = { id, css };
  await chrome.storage.local.set({ [key]: stored });
}

function swatch(theme: Theme | undefined): HTMLElement {
  const node = document.createElement('span');
  node.style.cssText =
    'display:inline-flex;align-items:center;gap:3px;height:32px;padding:0 8px;border:1px solid var(--borderColor-default);border-radius:6px;flex:none';
  if (theme == null) {
    node.textContent = 'GitHub';
    node.style.color = 'var(--fgColor-muted)';
    node.style.fontSize = '12px';
    return node;
  }
  node.style.background = theme.palette.bg;
  node.style.borderColor = theme.palette.border;
  for (const color of [theme.palette.blue, theme.palette.green, theme.palette.yellow, theme.palette.red, theme.palette.purple]) {
    const dot = document.createElement('i');
    dot.style.cssText = `width:9px;height:9px;border-radius:50%;background:${color}`;
    node.append(dot);
  }
  return node;
}

function field(mode: Mode, value: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'flex:1;min-width:220px';
  const label = document.createElement('label');
  label.className = 'd-block text-bold tmp-mb-2';
  label.style.marginBottom = '8px';
  label.textContent = mode === 'dark' ? 'Dark mode' : 'Light mode';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:8px';
  const select = document.createElement('select');
  select.className = 'form-select';
  select.style.flex = '1';
  select.id = `${SECTION_ID}-${mode}`;
  label.htmlFor = select.id;
  select.append(new Option('GitHub default', '', false, value === ''));
  for (const theme of THEMES.filter((t) => t.type === mode)) {
    select.append(new Option(theme.name, theme.id, false, theme.id === value));
  }
  const preview = document.createElement('span');
  const paintPreview = () => preview.replaceChildren(swatch(THEMES.find((t) => t.id === select.value)));
  paintPreview();
  repaint.set(mode, paintPreview);
  select.addEventListener('change', () => {
    paintPreview();
    void choose(mode, select.value);
  });
  row.append(select, preview);
  wrapper.append(label, row);
  return wrapper;
}

async function build(): Promise<HTMLElement> {
  const selection = await loadSelection();
  const section = document.createElement('section');
  section.id = SECTION_ID;
  section.style.marginTop = '40px';
  section.style.marginBottom = '40px';

  const subhead = document.createElement('div');
  subhead.className = 'Subhead';
  const heading = document.createElement('h2');
  heading.className = 'Subhead-heading Subhead-heading--large';
  heading.textContent = 'Extension themes';
  subhead.append(heading);

  const note = document.createElement('p');
  note.className = 'color-fg-muted';
  note.textContent =
    'From the GitHub Themes extension. Replaces GitHub’s colors while GitHub is in the matching mode above; “GitHub default” leaves that mode untouched.';

  const fields = document.createElement('div');
  fields.style.cssText = 'display:flex;flex-wrap:wrap;gap:24px';
  fields.append(field('dark', selection.dark), field('light', selection.light));

  section.append(subhead, note, fields);
  return section;
}

let building = false;
async function ensure(): Promise<void> {
  if (location.pathname !== PATH || building) return;
  if (document.getElementById(SECTION_ID) != null) return;
  const anchor = document.getElementById('color-mode-heading')?.closest('section');
  if (anchor == null) return;
  building = true;
  try {
    const section = await build();
    if (document.getElementById(SECTION_ID) == null) anchor.after(section);
  } finally {
    building = false;
  }
}

export function initSettingsPage(): void {
  // GitHub swaps settings pages client-side; a cheap path check covers it.
  setInterval(() => void ensure(), 800);
  document.addEventListener('DOMContentLoaded', () => void ensure());

  // Keep the selects in sync with changes from the popup or other tabs.
  chrome.storage.onChanged.addListener(async (_changes, area) => {
    if (area !== 'local') return;
    const selection = await loadSelection();
    for (const mode of ['dark', 'light'] as const) {
      const select = document.getElementById(`${SECTION_ID}-${mode}`) as HTMLSelectElement | null;
      if (select != null && select.value !== selection[mode]) {
        select.value = selection[mode];
        repaint.get(mode)?.();
      }
    }
  });
}
