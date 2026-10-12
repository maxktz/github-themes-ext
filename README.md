# GitHub Themes

Chrome extension that re-themes all of GitHub: Tokyo Night (Night, Storm, Moon, Day),
Catppuccin, Dracula, Nord, Gruvbox, Rosé Pine, One Dark, Kanagawa, Everforest and Solarized.
Pick a theme per color mode in the toolbar popup (for example Tokyo Night for dark mode and
GitHub's default for light mode). It follows your GitHub appearance setting, and the OS
preference when that is "auto"; open tabs switch instantly.

## Install (unpacked)

```bash
pnpm install
```

```bash
pnpm build
```

Then open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and pick `dist/`.

## How it works

GitHub's UI is driven by Primer CSS variables (`--bgColor-default`, `--fgColor-accent`,
`--prettylights-syntax-keyword`, …), about 960 per color mode.

- `pnpm sync-github` snapshots GitHub's live `dark`/`light` theme stylesheets into
  `src/github/*.json`.
- `scripts/generate.ts` rewrites every color in that snapshot onto a theme palette, in OKLab:
  near-grays follow the palette's background-to-foreground ramp; saturated colors keep their hue
  family (accent, success, danger, …) and their lightness offset from it. Semantic and syntax
  tokens are then pinned to exact palette colors, Primer Brand (marketing pages) is aliased to
  the themed tokens, and emphasis backgrounds are darkened until their text reaches 4.5:1.
- `src/content.ts` runs at `document_start`, reads GitHub's mode (`data-color-mode`, and
  `prefers-color-scheme` for "auto") and injects that mode's theme stylesheet (variables with
  `!important`). GitHub's own attributes are left alone. Both slots are cached in the page's
  `localStorage` so the theme applies before first paint.

## Add a theme

Add a palette to `THEMES` in `src/themes.ts` (15 role colors, optional syntax overrides), then
`pnpm build`.

## Scripts

- `pnpm build`: generate theme CSS and bundle the extension into `dist/`
- `pnpm sync-github`: refresh the GitHub variable snapshot when GitHub ships new tokens
- `pnpm e2e`: per-mode slots, live switching and persistence in Playwright's Chromium
- `pnpm shots [theme-id ...]`: screenshots of common GitHub pages into `.scratch/shots/`
