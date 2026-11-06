const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const logos = require('../public/branding.json');
const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Cache the original supplied images once. Failure never prevents bot or web startup.
async function cacheBrandAssets({ publicDir = path.join(__dirname, '..', 'public'), fetchImage = globalThis.fetch } = {}) {
  const outcomes = await Promise.allSettled(Object.values(logos).map(async logo => {
    const file = path.join(publicDir, logo.local.replace(/^\//, ''));
    try {
      const existing = await fs.readFile(file);
      if (existing.subarray(0, 8).equals(PNG_HEADER)) return;
    } catch (err) { if (err.code !== 'ENOENT') throw err; }
    const response = await fetchImage(logo.remote, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Téléchargement du logo : HTTP ${response.status}`);
    const maxSize = 10 * 1024 * 1024;
    if (Number(response.headers.get('content-length')) > maxSize) throw new Error('Image trop volumineuse');
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > maxSize || !data.subarray(0, 8).equals(PNG_HEADER)) throw new Error('Logo PNG invalide');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, data); await fs.rename(temporary, file); }
    finally { await fs.rm(temporary, { force: true }); }
  }));
  const failed = outcomes.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
}
module.exports = { cacheBrandAssets };
