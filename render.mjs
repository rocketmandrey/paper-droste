// node render.mjs                 -> out/paper-droste.mp4 (seamless 6 s loop, 1024x1024, 25 fps)
// node render.mjs --sheet         -> out/sheet.jpg (8 frames across the loop)
// node render.mjs --loops=3       -> the loop repeated 3 times
// Chrome: set CHROME=/path/to/chrome if it is not in the default macOS location.
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http'; import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'; import { resolve, extname, relative, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url)), FPS = 25, T = 6;
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const server = createServer((q, r) => { const f = resolve(ROOT, '.' + decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (relative(ROOT, f).startsWith('..')) return r.writeHead(403).end(); let body; try { body = readFileSync(f); } catch { return r.writeHead(404).end(); }
  r.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript' }[extname(f)] || 'application/octet-stream' }).end(body); }).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const b = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 0, args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu-rasterization'] });
const pg = await b.newPage(); pg.on('pageerror', e => { console.log('[page error]', e.message); process.exit(1); });
await pg.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'networkidle0' }); await pg.waitForFunction('window.ready === true', { timeout: 120000 });
const grab = t => pg.evaluate(async t => { await window.frame(t); return document.getElementById('c').toDataURL('image/jpeg', .93); }, t);
mkdirSync(resolve(ROOT, 'out'), { recursive: true });
if (args.sheet) {
  const ts = [0, .8, 2.2, 3.4, 3.9, 4.6, 5.3, 5.8], cells = []; for (const t of ts) cells.push(await grab(t));
  const url = await pg.evaluate(async cells => { const w = 384, s = document.createElement('canvas'); s.width = w * 4; s.height = w * 2; const x = s.getContext('2d');
    for (let i = 0; i < cells.length; i++) { const im = new Image(); im.src = cells[i]; await im.decode(); x.drawImage(im, (i % 4) * w, (i / 4 | 0) * w, w, w); }
    return s.toDataURL('image/jpeg', .9); }, cells);
  writeFileSync(resolve(ROOT, 'out/sheet.jpg'), Buffer.from(url.split(',')[1], 'base64')); console.log('wrote out/sheet.jpg');
} else {
  const loops = +(args.loops || 1), out = resolve(ROOT, 'out/paper-droste.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const frames = []; for (let i = 0; i < T * FPS; i++) frames.push(Buffer.from((await grab(i / FPS)).split(',')[1], 'base64'));
  for (let l = 0; l < loops; l++) for (const buf of frames) if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); console.log('wrote out/paper-droste.mp4');
}
await b.close(); server.close(); process.exit(0);
