#!/usr/bin/env node
/* Rebuild palette files from a state without opening the picker.
   Use it to apply a small change (edit the state JSON, then re-export) or to check a palette.

   node export.mjs --state <palette.state.json | state.json> [--set key=value ...] [--out <dir>] [--report]

   --state   a palette.state.json written by the picker (its "state" field is used) or a bare state object
   --set     dotted-path overrides, e.g. --set brand.family=tomato --set background.mode=deep --set background.family=indigo --set rules.target=AAA --set overrides.light.primary=10
   --out     write palette.css, palette.tokens.json and palette.state.json here
   --report  print the contrast report and resolved tokens as JSON (default when --out is omitted)
   --tailwind-theme  print an `@theme inline` block mapping every token into Tailwind v4 (needs export.prefix "") */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'palette-core.js'));
const P = globalThis.PaletteCore;

const a = { set: [] };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  if (k === '--state') a.state = argv[++i];
  else if (k === '--out') a.out = argv[++i];
  else if (k === '--set') a.set.push(argv[++i]);
  else if (k === '--report') a.report = true;
  else if (k === '--tailwind-theme') a.tailwind = true;
  else { console.error(`Unknown argument: ${k}`); process.exit(1); }
}

let state = {};
if (a.state) {
  const raw = JSON.parse(fs.readFileSync(a.state, 'utf8'));
  state = raw.state || raw;
}
for (const kv of a.set) {
  const eq = kv.indexOf('=');
  if (eq < 0) { console.error(`--set needs key=value, got ${kv}`); process.exit(1); }
  const keys = kv.slice(0, eq).split('.');
  let v = kv.slice(eq + 1);
  if (v === 'true' || v === 'false') v = v === 'true';
  else if (v === 'null') v = null;
  else if (v !== '' && !isNaN(+v)) v = +v;
  let o = state;
  keys.slice(0, -1).forEach(k => { if (!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
  o[keys[keys.length - 1]] = v;
}

const built = P.build(state);
if (a.tailwind) {
  const p = built.state.export.prefix || '';
  if (p.startsWith('color-')) {
    console.error('Tailwind v4 mapping needs an empty prefix (now "' + p + '"); otherwise names would reference themselves. Re-run with --set export.prefix= and rewrite the files with --out.');
    process.exit(1);
  }
  const names = [];
  for (const k of ['brand', 'accent', 'neutral', 'canvas', 'success', 'warning', 'danger', 'info']) if (!built.scales[k].alias) for (let i = 1; i <= 12; i++) names.push(`${k}-${i}`);
  names.push('neutral-ink', ...Object.keys(built.tokens.light));
  console.log('@theme inline {\n' + names.map(n => `  --color-${n}: var(--${p}${n});`).join('\n') + '\n}');
  process.exit(0);
}
if (a.out) {
  const dir = path.resolve(a.out);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(built.files())) fs.writeFileSync(path.join(dir, name), body);
  console.log(`Wrote palette.css, palette.tokens.json, palette.state.json to ${dir}`);
}
if (a.report || !a.out) {
  const r = built.report;
  const flat = th => Object.fromEntries(Object.values(built.tokens[th]).map(t => [t.name, `${t.step === 'white' ? 'white' : t.step === 'ink' ? 'neutral-ink' : t.scale + '-' + t.step} ${P.hex(t.rgb)}`]));
  const fam = Object.fromEntries(['brand', 'accent', 'neutral', 'canvas', 'success', 'warning', 'danger', 'info'].map(k => [k, built.scales[k].family + (built.scales[k].alias ? ` (= ${built.scales[k].alias})` : '')]));
  console.log(JSON.stringify({ families: fam, passed: `${r.passed}/${r.total} (${r.target})`, failures: r.failures, adjusted: r.adjusted, warnings: r.warnings, notes: r.notes, light: flat('light'), dark: flat('dark') }, null, 2));
}
