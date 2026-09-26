import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';

const root = fileURLToPath(new URL('../web/', import.meta.url));
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, 'Duplicate HTML IDs');
assert.equal((html.match(/<h1\b/g) || []).length, 1, 'Expected one main heading');
assert.match(html, /<html lang="en">/);
assert.match(html, /data-site="usagewatch"/, 'Deployment health checks need the stable site marker');
assert.match(html, /https:\/\/usagewatch\.seev\.pro\//);
assert.match(html, /Demo accounts/, 'Screenshots must disclose demo data');
for (const [, url] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
  if (url.startsWith('https://')) continue;
  if (url.startsWith('#')) {
    assert.ok(url === '#' || ids.includes(url.slice(1)), `Missing anchor: ${url}`);
  } else {
    const path = resolve(root, url);
    assert.ok(path.startsWith(root.endsWith(sep) ? root : root + sep), `Path escapes website: ${url}`);
    assert.ok(existsSync(path), `Missing local asset: ${url}`);
  }
}
for (const tag of html.matchAll(/<img\b[^>]*>/g)) {
  assert.match(tag[0], /\balt="[^"]*"/, 'Image needs alt text');
  assert.match(tag[0], /\bwidth="\d+"/, 'Image needs intrinsic width');
  assert.match(tag[0], /\bheight="\d+"/, 'Image needs intrinsic height');
}
for (const name of ['app-screenshot.png', 'widget-screenshot.png', 'widget-detail-screenshot.png']) {
  const png = readFileSync(resolve(root, 'assets', name));
  assert.equal(png.subarray(1, 4).toString(), 'PNG', `${name} must be a real PNG`);
  assert.ok(png.readUInt32BE(16) >= 300 && png.readUInt32BE(20) >= 70, `${name} is too small`);
}
assert.ok(existsSync(new URL('../CONTRIBUTING.md', import.meta.url)));
const vertical = readFileSync(resolve(root, 'assets/widget-vertical-screenshot.png'));
assert.equal(vertical.subarray(1, 4).toString(), 'PNG');
assert.equal(vertical.readUInt32BE(16), 62, 'Vertical screenshot should match the real widget depth');
assert.equal(vertical.readUInt32BE(20), 276, 'Vertical screenshot should fit three providers');
console.log('Website checks passed: anchors, assets, screenshots, metadata and contribution guide.');
