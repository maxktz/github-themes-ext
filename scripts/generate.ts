// Generates a theme stylesheet by remapping every color in GitHub's own theme
// variables (src/github/*.json) onto a palette:
//  - near-gray colors follow the palette's neutral ramp, interpolated in OKLab
//    between anchors (GitHub's inset/default/muted/border/fg colors),
//  - saturated colors keep their hue family (accent, success, danger, ...)
//    and their lightness/chroma offset from that family's base color,
//  - semantic and syntax tokens are then pinned to exact palette colors.
import { clampChroma, converter, formatHex, formatHex8, interpolate, parse, wcagContrast } from 'culori';
import type { Oklch } from 'culori';

import darkBase from '../src/github/dark.json' with { type: 'json' };
import lightBase from '../src/github/light.json' with { type: 'json' };
import { syntaxFor, type Palette, type Theme } from '../src/themes.ts';

const toOklch = converter('oklch');
const NEUTRAL_CHROMA = 0.035;

type Role = keyof Palette;

const NEUTRAL_ANCHORS: [string, Role][] = [
  ['--bgColor-inset', 'bgInset'],
  ['--bgColor-default', 'bg'],
  ['--bgColor-muted', 'bgMuted'],
  ['--borderColor-default', 'border'],
  ['--fgColor-disabled', 'fgSubtle'],
  ['--fgColor-muted', 'fgMuted'],
  ['--fgColor-default', 'fg'],
];

const FAMILY_ANCHORS: [string, Role][] = [
  ['--fgColor-accent', 'blue'],
  ['--ansi-cyan', 'cyan'],
  ['--fgColor-success', 'green'],
  ['--fgColor-attention', 'yellow'],
  ['--fgColor-severe', 'orange'],
  ['--fgColor-danger', 'red'],
  ['--fgColor-done', 'purple'],
  ['--fgColor-sponsors', 'pink'],
];

function oklch(color: string): Oklch {
  const parsed = parse(color);
  if (parsed == null) throw new Error(`Cannot parse color ${color}`);
  const result = toOklch(parsed);
  return { ...result, c: result.c ?? 0, h: result.h ?? 0 };
}

function format(color: Oklch, alpha: number): string {
  const inGamut = clampChroma({ ...color, alpha: undefined }, 'oklch');
  return alpha < 1 ? formatHex8({ ...inGamut, alpha }) : formatHex(inGamut);
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function makeMapper(vars: Record<string, string>, palette: Palette) {
  const neutrals = NEUTRAL_ANCHORS.flatMap(([name, role]) => {
    const value = vars[name];
    if (value == null || !value.startsWith('#')) return [];
    return [{ l: oklch(value).l, target: oklch(palette[role]) }];
  })
    .sort((a, b) => a.l - b.l)
    .filter((anchor, index, list) => index === 0 || anchor.l - list[index - 1].l > 0.005);

  const families = FAMILY_ANCHORS.flatMap(([name, role]) => {
    const value = vars[name];
    if (value == null || !value.startsWith('#')) return [];
    return [{ source: oklch(value), target: oklch(palette[role]) }];
  });

  function mapNeutral(l: number): Oklch {
    const first = neutrals[0];
    const last = neutrals[neutrals.length - 1];
    if (l <= first.l) return { ...first.target, l: Math.max(0, first.target.l + (l - first.l)) };
    if (l >= last.l) return { ...last.target, l: Math.min(1, last.target.l + (l - last.l)) };
    const index = neutrals.findIndex((anchor, i) => l >= anchor.l && l <= neutrals[i + 1].l);
    const a = neutrals[index];
    const b = neutrals[index + 1];
    const t = (l - a.l) / (b.l - a.l);
    return oklch(formatHex(interpolate([a.target, b.target], 'oklab')(t)));
  }

  function mapChromatic(color: Oklch): Oklch {
    const family = families.reduce((best, candidate) =>
      hueDistance(candidate.source.h ?? 0, color.h ?? 0) < hueDistance(best.source.h ?? 0, color.h ?? 0)
        ? candidate
        : best
    );
    const { source, target } = family;
    return {
      mode: 'oklch',
      l: Math.min(1, Math.max(0, target.l + (color.l - source.l))),
      c: Math.max(0, target.c * (color.c / Math.max(source.c, 0.01))),
      h: target.h,
    };
  }

  return (hex: string, desaturate = false): string => {
    const parsed = parse(hex);
    if (parsed == null) return hex;
    const alpha = parsed.alpha ?? 1;
    const color = oklch(hex);
    const mapped = color.c < NEUTRAL_CHROMA ? mapNeutral(color.l) : mapChromatic(color);
    // Shadows read as tinted glows when they pick up a saturated palette color.
    if (desaturate) mapped.c = Math.min(mapped.c, 0.02);
    return format(mapped, alpha);
  };
}

function pinnedVars(theme: Theme): Record<string, string> {
  const p = theme.palette;
  const s = syntaxFor(theme);
  return {
    '--bgColor-default': p.bg,
    '--bgColor-muted': p.bgMuted,
    '--bgColor-inset': p.bgInset,
    '--borderColor-default': p.border,
    '--fgColor-default': p.fg,
    '--fgColor-muted': p.fgMuted,
    '--fgColor-accent': p.blue,
    '--fgColor-success': p.green,
    '--fgColor-attention': p.yellow,
    '--fgColor-severe': p.orange,
    '--fgColor-danger': p.red,
    '--fgColor-done': p.purple,
    '--fgColor-sponsors': p.pink,
    '--prettylights-syntax-comment': s.comment,
    '--prettylights-syntax-constant': s.constant,
    '--prettylights-syntax-entity': s.entity,
    '--prettylights-syntax-entityTag': s.tag,
    '--prettylights-syntax-entity-tag': s.tag,
    '--prettylights-syntax-keyword': s.keyword,
    '--prettylights-syntax-string': s.string,
    '--prettylights-syntax-variable': s.variable,
    '--prettylights-syntax-stringRegexp': s.regexp,
    '--prettylights-syntax-string-regexp': s.regexp,
    '--prettylights-syntax-storageModifierImport': p.fg,
    '--prettylights-syntax-storage-modifier-import': p.fg,
    '--prettylights-syntax-markup-heading': s.heading,
    '--prettylights-syntax-markup-list': s.variable,
    '--prettylights-syntax-constantOtherReferenceLink': s.link,
    '--prettylights-syntax-constant-other-reference-link': s.link,
    '--prettylights-syntax-metaDiffRange': s.keyword,
    '--prettylights-syntax-meta-diff-range': s.keyword,
    '--codeMirror-syntax-fgColor-comment': s.comment,
    '--codeMirror-syntax-fgColor-constant': s.constant,
    '--codeMirror-syntax-fgColor-entity': s.entity,
    '--codeMirror-syntax-fgColor-keyword': s.keyword,
    '--codeMirror-syntax-fgColor-storage': s.keyword,
    '--codeMirror-syntax-fgColor-string': s.string,
    '--codeMirror-syntax-fgColor-support': p.cyan,
    '--codeMirror-syntax-fgColor-variable': s.variable,
    ...BRAND_ALIASES,
  };
}

// Primer Brand (marketing pages, signed-out header) has its own palette in a
// separate stylesheet; alias it to the themed Primer tokens.
const BRAND_ALIASES: Record<string, string> = {
  '--brand-color-canvas-default': 'var(--bgColor-default)',
  '--brand-color-canvas-inset': 'var(--bgColor-inset)',
  '--brand-color-canvas-subtle': 'var(--bgColor-muted)',
  '--brand-color-canvas-muted': 'var(--bgColor-muted)',
  '--brand-color-canvas-overlay': 'var(--overlay-bgColor)',
  '--brand-color-canvas-invert': 'var(--fgColor-default)',
  '--brand-color-text-default': 'var(--fgColor-default)',
  '--brand-color-text-muted': 'var(--fgColor-muted)',
  '--brand-color-text-subtle': 'var(--fgColor-muted)',
  '--brand-color-text-onEmphasis': 'var(--fgColor-onEmphasis)',
  '--brand-color-text-emphasized': 'var(--fgColor-accent)',
  '--brand-color-text-link-rest': 'var(--fgColor-accent)',
  '--brand-color-text-link-pressed': 'var(--fgColor-accent)',
  '--brand-color-text-danger': 'var(--fgColor-danger)',
  '--brand-color-border-default': 'var(--borderColor-default)',
  '--brand-color-border-muted': 'var(--borderColor-muted)',
  '--brand-color-border-subtle': 'var(--borderColor-muted)',
  '--brand-color-focus': 'var(--focus-outlineColor)',
  '--brand-color-accent-primary': 'var(--fgColor-accent)',
  '--brand-color-accent-secondary': 'var(--fgColor-attention)',
  '--brand-color-success-fg': 'var(--fgColor-success)',
  '--brand-color-success-emphasis': 'var(--bgColor-success-emphasis)',
  '--brand-color-success-muted': 'var(--bgColor-success-muted)',
  '--brand-color-success-subtle': 'var(--bgColor-success-muted)',
  '--brand-color-danger-fg': 'var(--fgColor-danger)',
  '--brand-color-danger-emphasis': 'var(--bgColor-danger-emphasis)',
  '--brand-color-danger-muted': 'var(--bgColor-danger-muted)',
  '--brand-color-danger-subtle': 'var(--bgColor-danger-muted)',
  '--brand-color-neutral-emphasis': 'var(--fgColor-muted)',
  '--brand-color-neutral-emphasisPlus': 'var(--fgColor-muted)',
  '--brand-color-neutral-muted': 'var(--bgColor-neutral-muted)',
  '--brand-color-neutral-subtle': 'var(--bgColor-neutral-muted)',
};

// Spots where GitHub hardcodes colors instead of using variables.
const FIXES = `
.turbo-progress-bar, .progress-pjax-loader > .progress-pjax-loader-bar {
  background-color: var(--fgColor-accent) !important;
}
/* Match the signed-in header, which sits on the inset color. */
[class*="MarketingHeader-module__root"] {
  --MarketingHeader-canvas-default: var(--bgColor-inset) !important;
}
[fill="#DBAB0A" i] { fill: var(--fgColor-attention) !important; }
[stroke="#DBAB0A" i] { stroke: var(--fgColor-attention) !important; }
`;

// Solid backgrounds that carry --fgColor-onEmphasis text (primary buttons,
// state badges, counters). Pastel palettes would leave that text unreadable.
const EMPHASIS_BG = /^--(?:bgColor-[\w-]*emphasis|button-(?:primary|danger)-bgColor-(?:rest|hover|active)|counter-bgColor-emphasis)$/;
const MIN_CONTRAST = 4.5;

function darkenForContrast(background: string, text: string): string {
  const color = oklch(background);
  const alpha = parse(background)?.alpha ?? 1;
  if (alpha < 1) return background;
  let current = format(color, 1);
  while (wcagContrast(current, text) < MIN_CONTRAST && color.l > 0.25) {
    color.l -= 0.02;
    current = format(color, 1);
  }
  return current;
}

export interface GeneratedTheme {
  css: string;
  /** Count of variables rewritten, for build output. */
  variables: number;
}

export function generateTheme(theme: Theme): GeneratedTheme {
  const base = (theme.type === 'dark' ? darkBase : lightBase).vars as Record<string, string>;
  const map = makeMapper(base, theme.palette);
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(base)) {
    const shadow = /shadow/i.test(name);
    vars[name] = value.includes('#')
      ? value.replace(/#[0-9a-fA-F]{3,8}\b/g, (hex) => map(hex, shadow))
      : value;
  }
  Object.assign(vars, pinnedVars(theme));
  const onEmphasis = vars['--fgColor-onEmphasis'];
  if (onEmphasis?.startsWith('#')) {
    for (const [name, value] of Object.entries(vars)) {
      if (EMPHASIS_BG.test(name) && /^#[0-9a-fA-F]{3,8}$/.test(value)) {
        vars[name] = darkenForContrast(value, onEmphasis);
      }
    }
  }

  const declarations = Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value} !important;`)
    .join('\n');
  const css = `/* ${theme.name}, generated by github-themes-ext from ${
    theme.type === 'dark' ? darkBase.source : lightBase.source
  } */
:root,
[data-color-mode] {
  color-scheme: ${theme.type} !important;
  accent-color: ${theme.palette.blue};
${declarations}
}
${FIXES}`;
  return { css, variables: Object.keys(vars).length };
}
