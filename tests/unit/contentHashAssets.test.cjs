const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { contentHashAssets } = require('../../scripts/content-hash-assets.cjs');

test('wersje zależą od treści importu, a niezależne zasoby zachowują URL', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-hash-'));
  const write = (name, data) => fs.writeFileSync(path.join(root, name), data);
  const read = name => fs.readFileSync(path.join(root, name), 'utf8');
  try {
    write('index.html', '<script type="module" src="./a.js?v=vOLD"></script><img src="/image.png?v=vOLD">');
    write('a.js', 'import "./b.js?v=vOLD";');
    write('b.js', 'export const answer = 1;');
    write('image.png', Buffer.from([1, 2, 3]));
    write('sw.js', '// Version: vOLD\nself.skipWaiting();\n');
    contentHashAssets(root);
    const first = read('index.html');
    const firstManifest = JSON.parse(read('asset-hashes.json'));
    const firstSw = read('sw.js');
    contentHashAssets(root);
    assert.equal(read('index.html'), first);
    assert.deepEqual(JSON.parse(read('asset-hashes.json')), firstManifest);
    assert.equal(read('sw.js'), firstSw);

    write('image.png', Buffer.from([1, 2, 4]));
    contentHashAssets(root);
    const imageChanged = read('index.html');
    assert.equal(imageChanged.match(/a\.js\?v=h[0-9a-f]+/)[0], first.match(/a\.js\?v=h[0-9a-f]+/)[0]);
    assert.notEqual(imageChanged.match(/image\.png\?v=h[0-9a-f]+/)[0], first.match(/image\.png\?v=h[0-9a-f]+/)[0]);

    write('b.js', 'export const answer = 2;');
    contentHashAssets(root);
    assert.notEqual(read('index.html').match(/a\.js\?v=h[0-9a-f]+/)[0], first.match(/a\.js\?v=h[0-9a-f]+/)[0]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
