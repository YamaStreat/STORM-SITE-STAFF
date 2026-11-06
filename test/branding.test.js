const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { cacheBrandAssets } = require('../src/branding');
const logos = require('../public/branding.json');

test('original PNGs are cached locally and reused without further network access', async () => {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storm-branding-'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7S8AAAAASUVORK5CYII=', 'base64');
  let calls = 0;
  try {
    await cacheBrandAssets({publicDir,fetchImage:async () => {calls++;return new Response(png);}});
    assert.equal(calls, 2);
    for (const logo of Object.values(logos)) assert.deepEqual(await fs.readFile(path.join(publicDir,logo.local)),png);
    await cacheBrandAssets({publicDir,fetchImage:async () => {throw Error('Must not fetch cached images');}});
    await fs.rm(path.join(publicDir,'assets/storm-round.png'));
    await assert.rejects(cacheBrandAssets({publicDir,fetchImage:async () => new Response('<html>not an image</html>')}), /PNG invalide/);
    await assert.rejects(fs.access(path.join(publicDir,'assets/storm-round.png')));
  } finally {await fs.rm(publicDir,{recursive:true,force:true});}
});
