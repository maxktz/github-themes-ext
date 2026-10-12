// Renders static/icons/*.png from an inline SVG. Run once: node scripts/icons.ts
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="28" fill="#1a1b26"/>
  <circle cx="44" cy="44" r="22" fill="#7aa2f7"/>
  <circle cx="84" cy="44" r="22" fill="#bb9af7"/>
  <circle cx="44" cy="84" r="22" fill="#9ece6a"/>
  <circle cx="84" cy="84" r="22" fill="#f7768e"/>
</svg>`;

await mkdir('static/icons', { recursive: true });
const browser = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: `static/icons/${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('static/icons written');
