#!/usr/bin/env node
/* Serve the palette picker on 127.0.0.1, wait for the user to press "Send to Claude",
   write the exported files to --out, then exit 0. Runs on Node 18+ or Bun, no dependencies.

   node serve.mjs --brief <brief.json> --out <dir> [--port 0] [--no-open] [--timeout-min 120]

   Exit codes: 0 = palette received and written, 2 = timed out or cancelled, 1 = error. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const ALLOWED = ['palette.css', 'palette.tokens.json', 'palette.state.json'];
const STATIC = { '/': 'picker.html', '/picker.js': 'picker.js', '/palette-core.js': 'palette-core.js', '/radix-colors.js': 'radix-colors.js' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

function args(argv) {
  const a = { port: 0, open: true, timeoutMin: 120 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--brief') a.brief = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--port') a.port = +argv[++i];
    else if (k === '--timeout-min') a.timeoutMin = +argv[++i];
    else if (k === '--no-open') a.open = false;
    else if (k === '-h' || k === '--help') a.help = true;
    else { console.error(`Unknown argument: ${k}`); process.exit(1); }
  }
  return a;
}

const opt = args(process.argv.slice(2));
if (opt.help || !opt.out) {
  console.log('Usage: node serve.mjs --brief <brief.json> --out <dir> [--port 0] [--no-open] [--timeout-min 120]');
  process.exit(opt.help ? 0 : 1);
}
let brief = {};
if (opt.brief) {
  try { brief = JSON.parse(fs.readFileSync(opt.brief, 'utf8')); }
  catch (e) { console.error(`Cannot read brief ${opt.brief}: ${e.message}`); process.exit(1); }
}
const outDir = path.resolve(opt.out);

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch { /* the URL is printed anyway */ }
}

function readBody(req, limit = 5e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

let done = false;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && STATIC[url.pathname]) {
      const file = path.join(APP, STATIC[url.pathname]);
      let body = fs.readFileSync(file, 'utf8');
      if (url.pathname === '/') {
        const json = JSON.stringify({ ...brief, served: true, outDir }).replace(/</g, '\\u003c');
        body = body.replace('<script id="brief" type="application/json">null</script>', `<script id="brief" type="application/json">${json}</script>`);
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)], 'cache-control': 'no-store' });
      return res.end(body);
    }
    // Reference images listed in the brief ("references": ["/abs/path.png" | {path, label}]) are served
    // by index only, so the page can turn them into candidates without exposing other files.
    const ref = url.pathname.match(/^\/ref\/(\d+)$/);
    if (req.method === 'GET' && ref) {
      const r = (brief.references || [])[+ref[1]];
      const file = r && path.resolve(typeof r === 'string' ? r : r.path);
      if (!file || !TYPES[path.extname(file).toLowerCase()] || !fs.existsSync(file)) { res.writeHead(404); return res.end('no such reference'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()], 'cache-control': 'no-store' });
      return res.end(fs.readFileSync(file));
    }
    if (req.method === 'POST' && url.pathname === '/submit') {
      if (done) { res.writeHead(409); return res.end('already submitted'); }
      const payload = JSON.parse(await readBody(req));
      const files = payload && payload.files;
      if (!files || !ALLOWED.every(n => typeof files[n] === 'string')) { res.writeHead(400); return res.end('expected files: ' + ALLOWED.join(', ')); }
      fs.mkdirSync(outDir, { recursive: true });
      const written = ALLOWED.map(n => { const p = path.join(outDir, n); fs.writeFileSync(p, files[n]); return p; });
      done = true;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, written }));
      console.log('SUBMITTED');
      written.forEach(p => console.log('  ' + p));
      setTimeout(() => process.exit(0), 300);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/cancel') {
      res.writeHead(200); res.end('ok');
      console.log('CANCELLED by the user in the picker');
      setTimeout(() => process.exit(2), 300);
      return;
    }
    res.writeHead(404); res.end('not found');
  } catch (e) {
    res.writeHead(500); res.end(String(e.message || e));
  }
});

server.listen(opt.port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`Palette picker: ${url}`);
  console.log(`Waiting for "Send to Claude"; files will be written to ${outDir}`);
  if (opt.open) openBrowser(url);
});
setTimeout(() => { console.log(`TIMEOUT: nothing submitted within ${opt.timeoutMin} min`); process.exit(2); }, opt.timeoutMin * 60e3).unref();
