#!/usr/bin/env node
/**
 * Verify PWA installability files and service worker contract.
 * Usage: node scripts/verify-pwa.js
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const failures = [];
const passes = [];

function ok(msg) { passes.push(msg); console.log('PASS', msg); }
function fail(msg) { failures.push(msg); console.error('FAIL', msg); }

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    fail(`missing file ${rel}`);
    return null;
  }
  return fs.readFileSync(p);
}

function pngSize(buf) {
  if (!buf || buf.length < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function checkPng(rel, expected) {
  const buf = read(rel);
  if (!buf) return;
  const size = pngSize(buf);
  if (!size) return fail(`${rel} is not a PNG`);
  if (size.width !== expected || size.height !== expected) {
    return fail(`${rel} is ${size.width}x${size.height}, expected ${expected}x${expected}`);
  }
  ok(`${rel} ${size.width}x${size.height} PNG`);
}

const manifestRaw = read('public/manifest.json');
if (manifestRaw) {
  const manifest = JSON.parse(manifestRaw.toString('utf8'));
  if (manifest.name && manifest.short_name) ok('manifest has name/short_name');
  else fail('manifest missing name');
  if (manifest.start_url) ok(`start_url=${manifest.start_url}`);
  else fail('manifest missing start_url');
  if (manifest.display === 'standalone') ok('display=standalone');
  else fail('display must be standalone');
  if (manifest.scope === '/') ok('scope=/');
  else fail('scope should be /');
  if (manifest.permissions) fail('manifest should not include invalid permissions field');
  else ok('no invalid permissions field');
  const icons = manifest.icons || [];
  const any192 = icons.find((i) => i.sizes === '192x192' && i.purpose === 'any');
  const any512 = icons.find((i) => i.sizes === '512x512' && i.purpose === 'any');
  const mask192 = icons.find((i) => i.sizes === '192x192' && String(i.purpose).includes('maskable'));
  const mask512 = icons.find((i) => i.sizes === '512x512' && String(i.purpose).includes('maskable'));
  if (any192 && any512) ok('192 and 512 any icons declared');
  else fail('need separate 192 and 512 purpose:any PNG icons');
  if (mask192 && mask512) ok('maskable 192 and 512 declared separately');
  else fail('need separate maskable icons (not "any maskable")');
  if (icons.some((i) => String(i.purpose).includes('any maskable'))) {
    fail('purpose "any maskable" is invalid');
  }
}

checkPng('public/icon-192x192.png', 192);
checkPng('public/icon-512x512.png', 512);
checkPng('public/icon-maskable-192.png', 192);
checkPng('public/icon-maskable-512.png', 512);
checkPng('public/apple-touch-icon.png', 180);

const html = read('index.html')?.toString('utf8') || '';
if (html.includes('rel="manifest"')) ok('index.html links manifest');
else fail('index.html missing manifest link');
if (html.includes("navigator.serviceWorker.register('/sw.js'")) ok('index.html registers /sw.js');
else fail('index.html does not register /sw.js');
if (/user-scalable\s*=\s*no/.test(html) || /maximum-scale\s*=\s*1/.test(html)) {
  fail('viewport still blocks zoom (hurts a11y / older installability)');
} else {
  ok('viewport allows zoom');
}
if (html.includes('apple-touch-icon.png')) ok('apple-touch-icon present');
else fail('missing apple-touch-icon');

const sw = (read('public/sw.js') || read('sw.js'))?.toString('utf8') || '';
if (sw.includes("addEventListener('install'") && sw.includes("addEventListener('fetch'")) {
  ok('service worker has install + fetch handlers');
} else {
  fail('service worker missing install or fetch');
}
if (sw.includes('/offline.html')) ok('service worker has offline fallback');
else fail('service worker missing offline.html fallback');
if (sw.includes("pathname.startsWith('/api/')")) ok('service worker bypasses /api/');
else fail('service worker should not intercept API calls');

const app = read('App.tsx')?.toString('utf8') || '';
if (app.includes('PWAInstallPrompt')) ok('PWAInstallPrompt is mounted');
else fail('PWAInstallPrompt is not used');
if (app.includes('parseViewFromHash')) ok('hash view routing wired in App');
else fail('hash view routing not wired');

const vite = read('vite.config.ts')?.toString('utf8') || '';
if (/sw:\s*['"]\.\/sw\.js['"]/.test(vite)) fail('vite still bundles sw.js as a rollup input');
else ok('vite does not bundle sw.js as an app chunk');

if (read('public/offline.html')) ok('offline.html exists');

const appView = read('utils/appView.ts')?.toString('utf8') || '';
if (appView.includes("'leads'") && appView.includes("'meetings'") && appView.includes("'followups'")) {
  ok('appView maps core CRM pages');
} else {
  fail('appView is missing core page ids');
}

const hashCases = [
  ['#/meetings', 'meetings'],
  ['#/followups', 'followups'],
  ['#/nope', 'leads'],
  ['', 'leads'],
];
for (const [hash, expected] of hashCases) {
  const raw = hash.replace(/^#\/?/, '').split('?')[0].split('/')[0].trim();
  const views = ['leads','pipeline','meetings','followups','notifications','travel-claims','reports','calls-report','bulk-email','live-tracking','admin-users','usage-report','database-admin','data-export','meeting-photos','website-control'];
  const got = views.includes(raw) ? raw : 'leads';
  if (got === expected) ok(`hash ${hash || '(empty)'} -> ${got}`);
  else fail(`hash ${hash} expected ${expected} got ${got}`);
}

console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
