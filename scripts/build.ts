// Builds the extension into dist/: one stylesheet per theme plus the
// content script and popup.
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import * as esbuild from 'esbuild';

import { THEMES } from '../src/themes.ts';
import { generateTheme } from './generate.ts';

const outdir = 'dist';
await rm(outdir, { recursive: true, force: true });
await mkdir(`${outdir}/themes`, { recursive: true });

for (const theme of THEMES) {
  const { css, variables } = generateTheme(theme);
  await writeFile(`${outdir}/themes/${theme.id}.css`, css);
  console.log(`themes/${theme.id}.css  ${variables} variables  ${(css.length / 1024).toFixed(0)} KB`);
}

await esbuild.build({
  entryPoints: { content: 'src/content.ts', popup: 'src/popup.ts' },
  outdir,
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
});
// Content scripts are classic scripts; rebuild that one as an IIFE.
await esbuild.build({
  entryPoints: { content: 'src/content.ts' },
  outdir,
  bundle: true,
  format: 'iife',
  target: 'chrome120',
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
});

for (const file of ['manifest.json', 'popup.html', 'options.html', 'popup.css', 'icons']) {
  await cp(`static/${file}`, `${outdir}/${file}`, { recursive: true });
}
console.log(`Built ${THEMES.length} themes into ${outdir}/`);
