// Snapshots GitHub's dark and light theme variables into src/github/*.json.
// GitHub ships each color theme as its own stylesheet (dark-<hash>.css,
// light-<hash>.css); the first rule of each holds every variable.
// Usage: node scripts/sync-github.ts
import { mkdir, writeFile } from 'node:fs/promises';

const PAGE = 'https://github.com/github/docs';

function extractVars(css: string): Record<string, string> {
  const open = css.indexOf('{');
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);
  const vars: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
    vars[match[1]] ??= match[2].trim();
  }
  return vars;
}

const html = await (await fetch(PAGE)).text();
const sheets = [...html.matchAll(/https:\/\/github\.githubassets\.com\/assets\/(dark|light)-[0-9a-f]+\.css/g)];
await mkdir('src/github', { recursive: true });
for (const mode of ['dark', 'light'] as const) {
  const url = sheets.find((match) => match[1] === mode)?.[0];
  if (url == null) throw new Error(`No ${mode} stylesheet found on ${PAGE}`);
  const vars = extractVars(await (await fetch(url)).text());
  await writeFile(
    `src/github/${mode}.json`,
    `${JSON.stringify({ source: url, fetchedAt: new Date().toISOString(), vars }, null, 1)}\n`
  );
  console.log(`src/github/${mode}.json: ${Object.keys(vars).length} variables from ${url}`);
}
