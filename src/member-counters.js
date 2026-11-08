const { ChannelType, PermissionFlagsBits } = require('discord.js');
const HUMAN_CHANNEL = '1564314924111495368';
const BOT_CHANNEL = '1564315023952580700';

function createMemberCounters({ client, guildId, debounceMs = 10000, onError = err => console.error('[STORM COMPTEURS]', err.message) }) {
  let members = new Map(), pending = new Map(), initialized = false, initialization = null;
  let timer = null, running = null, dirty = false, stopped = false;
  async function initialize() {
    if (initialized) return;
    if (initialization) return initialization;
    initialization = (async () => {
      const guild = await client.guilds.fetch(guildId);
      // Never derive the human count from an incomplete gateway cache.
      const fetched = await guild.members.fetch();
      const snapshot = new Map();
      for (const member of fetched.values()) {
        if (!member.user || typeof member.user.bot !== 'boolean') throw Error('Liste des membres incomplète : compteurs inchangés.');
        snapshot.set(member.id, member.user.bot);
      }
      for (const [id, bot] of pending) { if (bot === null) snapshot.delete(id); else snapshot.set(id, bot); }
      pending.clear(); members = snapshot; initialized = true;
    })();
    try { await initialization; } finally { initialization = null; }
  }
  function counts() { let bots = 0; for (const bot of members.values()) if (bot) bots++; return { humans: members.size - bots, bots }; }
  function schedule(delay = debounceMs) {
    if (stopped || timer) return;
    timer = setTimeout(() => { timer = null; syncNow().catch(err => { onError(err); schedule(60000); }); }, delay);
    timer.unref?.();
  }
  async function rename(guild, id, name) {
    const channel = await guild.channels.fetch(id);
    if (!channel || channel.guildId !== guildId || ![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) throw Error(`Le salon compteur ${id} doit être un salon vocal du serveur configuré.`);
    if (channel.name === name) return;
    const bot = await guild.members.fetchMe();
    if (!channel.permissionsFor(bot)?.has(PermissionFlagsBits.ManageChannels)) throw Error(`Permission Gérer les salons manquante pour ${id}.`);
    // discord.js handles Discord's per-channel rename rate limits.
    await channel.setName(name, 'Actualisation des statistiques STØRM PVP');
  }
  async function syncNow() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (stopped) return;
    dirty = true;
    if (running) return running;
    running = (async () => {
      await initialize();
      do {
        dirty = false;
        const guild = await client.guilds.fetch(guildId), current = counts();
        const results = await Promise.allSettled([
          rename(guild, HUMAN_CHANNEL, `🌐・Membres : ${current.humans}`),
          rename(guild, BOT_CHANNEL, `🤖・Bots : ${current.bots}`)
        ]);
        const failed = results.find(result => result.status === 'rejected');
        if (failed) throw failed.reason;
      } while (dirty && !stopped);
      return counts();
    })();
    try { return await running; } finally { running = null; }
  }
  function update(member, remove) {
    if (stopped || member.guild.id !== guildId) return;
    if (!remove && typeof member.user?.bot !== 'boolean') { onError(Error('Arrivée de membre incomplète : compteur non modifié.')); return; }
    if (initialized) { if (remove) members.delete(member.id); else members.set(member.id, member.user.bot); }
    else pending.set(member.id, remove ? null : member.user.bot);
    dirty = true; schedule();
  }
  return {
    start: () => syncNow().catch(err => { onError(err); schedule(60000); }),
    syncNow,
    onJoin: member => update(member, false),
    onLeave: member => update(member, true),
    stop: () => { stopped = true; if (timer) clearTimeout(timer); timer = null; }
  };
}
module.exports = { createMemberCounters, HUMAN_CHANNEL, BOT_CHANNEL };
