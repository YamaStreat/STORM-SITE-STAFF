const fs = require('node:fs');
const path = require('node:path');
const logos = require('../public/branding.json');

function brandedMessage(embed, { content = '', links = [], publicDir = path.join(__dirname, '..', 'public') } = {}) {
  const files = [];
  function logo(name) {
    const file = path.join(publicDir, logos[name].local.replace(/^\//, ''));
    try {
      const stat = fs.statSync(file);
      if (stat.size > 0 && stat.size <= 4 * 1024 * 1024) {
        const data = fs.readFileSync(file);
        if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
          const filename = `storm-${name}.png`;
          files.push({ attachment: data, name: filename });
          return 'attachment://' + filename;
        }
      }
    } catch (_) { /* Use the supplied original link when a local copy is unavailable. */ }
    return logos[name].remote;
  }
  const round = logo('round'), wordmark = logo('wordmark');
  return {
    content,
    embeds: [{ color: 0x1987f3, author: { name: 'STØRM PVP · Espace communautaire', icon_url: round }, thumbnail: { url: round }, image: { url: wordmark }, footer: { text: 'STØRM PVP · Ensemble, faisons grandir la communauté' }, timestamp: new Date().toISOString(), ...embed }],
    files,
    components: links.length ? [{ type: 1, components: links.slice(0, 5).map(link => ({ type: 2, style: 5, label: link.label, url: link.url })) }] : [],
    allowedMentions: { parse: [] }
  };
}
module.exports = { brandedMessage };
