const { installCommunity } = require('./community');
const { PermissionFlagsBits, ChannelType } = require('discord.js');

const CHANNELS = Object.freeze({ announcements: '1564691828312375449', giveaways: '1568295438610858024', development: '1564691848222613644', patchNotes: '1564739753222475807' });
const NOTIFY_ROLES = Object.freeze({ patchNotes: '1568307263695749201', giveaways: '1568307516197179534' });
const PERMISSIONS = Object.freeze({
  tickets: 'Gérer les tickets et contestations', announcements: 'Publier des annonces', giveaways: 'Gérer les giveaways', streams: 'Publier des streams',
  patchNotes: 'Publier des patch notes', settings: 'Gérer le statut du serveur', access: 'Configurer les accès staff',
  recruitment: 'Ouvrir, fermer et annoncer les recrutements', content: 'Gérer les pages publiques', applications: 'Étudier les candidatures staff', members: 'Voir les fiches membres, sanctions et tickets', audit: 'Consulter le journal des actions', statistics: 'Consulter les statistiques de support', drafts: 'Rédiger des brouillons', approvePublications: 'Valider les publications',
  ban: 'Bannir', unban: 'Débannir', kick: 'Expulser', timeout: 'Mute temporaire / retirer le mute', warn: 'Avertir'
});
const SNOWFLAKE = /^\d{17,20}$/;
const SECTIONS = { additions: ':new:・AJOUTS', changes: ':arrows_counterclockwise:・MODIFICATIONS', fixes: ':bug:・CORRECTIONS', optimizations: ':gear:・OPTIMISATIONS' };
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (status, message) => { const e = new Error(message); e.status = status; throw e; };

function permissionsFor(config, roles, owner) {
  if (owner) return Object.keys(PERMISSIONS);
  // Once explicitly configured, legacy /setup role no longer bypasses the access matrix.
  if (config.panelRoles !== undefined) return [...new Set(roles.flatMap(id => config.panelRoles[id] || []))].filter(p => Object.hasOwn(PERMISSIONS, p));
  return roles.includes(config.staffRoleId) ? Object.keys(PERMISSIONS).filter(p => p !== 'access') : [];
}
function nextVersion(previous) {
  if (!previous) return 'v1.0.0';
  const [major, minor, patch] = previous.replace(/^v/, '').split('.').map(Number);
  return `v${major}.${minor}.${patch + 1}`;
}
function patchContent(version, sections, now = new Date()) {
  const date = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
  const blocks = Object.entries(SECTIONS).filter(([key]) => sections[key]?.length).map(([key, label]) => `### ${label}\n${sections[key].map(line => `> ➜ ${line}`).join('\n')}`);
  return `# :clipboard:・PATCH NOTE — STØRM PVP\n\n:date: **Date :** \`${date}\`  \n:label: **Version :** \`${version}\`\n\n${blocks.join('\n\n')}\n\n**STØRM PVP ・ Development Team**`;
}

function installPanel(app, { client, getConfig, state, saveConfig, saveState, guildId, publicUrl }) {
  async function resolveAccess(id) {
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch({ user: id, force: true });
    const owner = guild.ownerId === id;
    return { guild, member, owner, permissions: permissionsFor(getConfig(), [...member.roles.cache.keys()], owner) };
  }
  const requireStaff = (req, res, next) => req.staff ? next() : res.status(401).json({ error: 'Connexion staff requise.' });
  app.use('/api/admin', wrap(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.session?.user?.id) return res.status(401).json({ error: 'Connexion staff requise.' });
    let access;
    try { access = await resolveAccess(req.session.user.id); }
    catch (_) { return res.status(503).json({ error: 'Impossible de vérifier tes rôles Discord. Réessaie.' }); }
    if (!access.permissions.length) return res.status(403).json({ error: 'Tu n’as plus accès au panel staff.' });
    req.staff = access;
    if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin) {
      const expected = new URL(publicUrl).origin;
      if (req.headers.origin !== expected) return res.status(403).json({ error: 'Origine de la requête refusée.' });
    }
    const area = req.path.split('/')[1];
    const permission = ({ dossiers: 'tickets', appeals: 'tickets', announcements: 'announcements', giveaways: 'giveaways', streams: 'streams', 'site-status': 'settings', 'development-message': 'settings', 'patch-notes': 'patchNotes', access: 'access', content: 'content', applications: 'applications', recruitment: 'recruitment', members: 'members', audit: 'audit', statistics: 'statistics' })[area];
    if (permission && !access.permissions.includes(permission)) return res.status(403).json({ error: `Permission requise : ${PERMISSIONS[permission]}.` });
    next();
  }));
  const route = fn => wrap(async (req, res) => {
    try { await fn(req, res); }
    catch (e) { console.error('[STORM PANEL]', e.message); res.status(e.status || 502).json({ error: e.status ? e.message : 'Discord refuse cette action. Vérifie les permissions et la hiérarchie des rôles du bot.' }); }
  });
  installCommunity(app, { state, saveState, client, guildId, publicUrl, requireStaff, route });
  async function destination(guild, id) {
    const channel = await guild.channels.fetch(id);
    if (!channel || channel.guildId !== guildId || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) fail(404, 'Salon de publication introuvable dans ce serveur.');
    return channel;
  }
  app.get('/api/admin/panel', requireStaff, route(async (req, res) => {
    res.json({ channels: CHANNELS, permissions: req.staff.permissions, permissionLabels: PERMISSIONS, nextVersion: nextVersion(state.patchNotes?.[0]?.version), accessMode: 'per-role-v3' });
  }));
  const configuredRoles = () => {
    const config = getConfig();
    return config.panelRoles ?? (config.staffRoleId ? { [config.staffRoleId]: Object.keys(PERMISSIONS).filter(p => p !== 'access') } : {});
  };
  app.get('/api/admin/access', requireStaff, route(async (req, res) => {
    const roles = await req.staff.guild.roles.fetch();
    const panelRoles = configuredRoles();
    res.json({ roles: [...roles.values()].filter(r => r.id !== guildId && !r.managed).sort((a, b) => b.position - a.position).map(r => ({ id: r.id, name: r.name, color: r.hexColor })), panelRoles, permissionLabels: PERMISSIONS });
  }));
  const updateRole = route(async (req, res) => {
    if (Object.hasOwn(req.body, 'panelRoles')) fail(409, 'Recharge le panel avec Ctrl+F5 avant de modifier les permissions.');
    const entries = req.body.roleUpdates;
    if (!entries || typeof entries !== 'object' || Array.isArray(entries) || Object.keys(entries).length !== 1) fail(400, 'Configuration des rôles invalide.');
    const roles = await req.staff.guild.roles.fetch();
    // Merge only edited role IDs; a stale browser must never overwrite other roles.
    const clean = Object.fromEntries(Object.entries(configuredRoles()).map(([id, permissions]) => [id, [...permissions]]));
    for (const [id, permissions] of Object.entries(entries)) {
      if (!SNOWFLAKE.test(id) || id === guildId) fail(400, 'Rôle invalide.');
      if (permissions === null) { delete clean[id]; continue; }
      const role = roles.get(id);
      if (!role || role.managed || !Array.isArray(permissions) || permissions.some(p => !Object.hasOwn(PERMISSIONS, p))) fail(400, 'Rôle ou permission invalide.');
      clean[id] = [...new Set(permissions)];
    }
    if (Object.keys(clean).length > 100) fail(400, 'Maximum 100 rôles configurés.');
    getConfig().panelRoles = clean;
    saveConfig();
    res.json({ ok: true, roleId: Object.keys(entries)[0] });
  });
  app.post('/api/admin/access/:roleId', requireStaff, (req, res, next) => {
    const permissions = req.body.remove === true ? null : req.body.permissions;
    req.body = { roleUpdates: { [req.params.roleId]: permissions } };
    updateRole(req, res, next);
  });
  // Old browsers must reload; batch replacement is no longer accepted.
  app.post('/api/admin/access', requireStaff, (req, res) => res.status(409).json({ error: 'Recharge le panel avec Ctrl+F5 : les rôles se sauvegardent individuellement.' }));
  let publishingPatch = false;
  app.get('/api/admin/patch-notes', requireStaff, route(async (req, res) => res.json(state.patchNotes || [])));
  app.post('/api/admin/patch-notes', requireStaff, route(async (req, res) => {
    if (publishingPatch) fail(409, 'Une publication est déjà en cours.');
    publishingPatch = true;
    try {
      const version = nextVersion(state.patchNotes?.[0]?.version);
      if (req.body.expectedVersion !== version) fail(409, 'La version a changé. Actualise l’aperçu avant de publier.');
      const sections = {};
      for (const key of Object.keys(SECTIONS)) {
        const value = req.body.sections?.[key];
        if (value !== undefined && typeof value !== 'string') fail(400, 'Rubrique invalide.');
        sections[key] = (value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      }
      if (!Object.values(sections).some(lines => lines.length)) fail(400, 'Ajoute au moins une ligne dans une rubrique.');
      const now = new Date();
      const content = patchContent(version, sections, now);
      if (content.length > 2000) fail(400, 'Le patch note dépasse 2 000 caractères. Raccourcis son contenu.');
      const channel = await destination(req.staff.guild, CHANNELS.patchNotes);
      const notification = `<@&${NOTIFY_ROLES.patchNotes}>`;
      if (content.length + notification.length + 2 > 2000) fail(400, 'Le patch note avec sa mention dépasse 2 000 caractères.');
      const message = await channel.send({ content: `${notification}\n\n${content}`, allowedMentions: { parse: [], roles: [NOTIFY_ROLES.patchNotes] } });
      state.patchNotes ||= [];
      state.patchNotes.unshift({ id: message.id, version, sections, content, createdAt: now.getTime(), author: req.session.user.username });
      state.patchNotes = state.patchNotes.slice(0, 100); saveState();
      res.json({ ok: true, version, nextVersion: nextVersion(version) });
    } finally { publishingPatch = false; }
  }));
  let updatingStatus = false;
  async function publishStatus(guild, development) {
    if (updatingStatus) fail(409, 'Le message de statut est déjà en cours de mise à jour.');
    updatingStatus = true;
    try {
    const channel = await destination(guild, CHANNELS.development);
    const content = development
      ? '# ⚙️・STØRM PVP — EN COURS DE DÉVELOPPEMENT\n\nLe serveur est actuellement en cours de développement et n’est pas encore ouvert au public.\n\nNotre équipe prépare le gameplay, les systèmes PVP et les dernières finitions pour vous proposer une expérience de qualité.\n\n📢 Suivez les annonces et les patch notes pour découvrir nos avancées. La date d’ouverture sera communiquée ici dès qu’elle sera confirmée.\n\n**Merci pour votre patience et votre soutien !**\n\n**STØRM PVP ・ Development Team**'
      : '# 📡・STØRM PVP — STATUT DU SERVEUR\n\nLe mode développement est désactivé. Consultez le site et les annonces pour connaître la disponibilité du serveur.\n\n**STØRM PVP ・ Development Team**';
    const previous = state.siteConfig.developmentMessageId;
    let message = previous ? await channel.messages.fetch(previous).catch(e => { if (e.code === 10008) return null; throw e; }) : null;
    if (message) await message.edit({ content, allowedMentions: { parse: [] } });
    else { message = await channel.send({ content, allowedMentions: { parse: [] } }); state.siteConfig.developmentMessageId = message.id; saveState(); }
    } finally { updatingStatus = false; }
  }
  app.post('/api/admin/development-message', requireStaff, route(async (req, res) => {
    await publishStatus(req.staff.guild, Boolean(state.siteConfig.development));
    res.json({ ok: true });
  }));
  app.post('/api/admin/site-status', requireStaff, route(async (req, res) => {
    if (typeof req.body.development !== 'boolean') fail(400, 'Statut de développement invalide.');
    await publishStatus(req.staff.guild, req.body.development);
    state.siteConfig.development = req.body.development; saveState();
    res.json({ ok: true, development: req.body.development });
  }));
  app.get('/api/admin/moderation', requireStaff, route(async (req, res) => {
    if (!['ban', 'unban', 'kick', 'timeout', 'warn'].some(p => req.staff.permissions.includes(p))) fail(403, 'Accès modération refusé.');
    res.json((state.moderation || []).slice(0, 100));
  }));
  app.post('/api/admin/moderation', requireStaff, route(async (req, res) => {
    const { action, userId } = req.body;
    const permission = action === 'untimeout' ? 'timeout' : action;
    if (!['ban', 'unban', 'kick', 'timeout', 'warn'].includes(permission) || !req.staff.permissions.includes(permission)) fail(403, 'Permission de modération refusée.');
    if (typeof userId !== 'string' || !SNOWFLAKE.test(userId)) fail(400, 'Identifiant Discord invalide.');
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length > 400) fail(400, 'Le motif doit contenir entre 1 et 400 caractères.');
    const { guild, member: actor, owner } = req.staff;
    if ([actor.id, guild.ownerId, client.user.id].includes(userId)) fail(403, 'Tu ne peux pas cibler ce membre.');
    const flag = ({ ban: PermissionFlagsBits.BanMembers, unban: PermissionFlagsBits.BanMembers, kick: PermissionFlagsBits.KickMembers, timeout: PermissionFlagsBits.ModerateMembers, untimeout: PermissionFlagsBits.ModerateMembers })[action];
    if (flag && !actor.permissions.has(flag)) fail(403, 'Tu ne possèdes pas cette permission Discord.');
    const bot = await guild.members.fetchMe();
    if (flag && !bot.permissions.has(flag)) fail(403, 'Le bot ne possède pas la permission Discord nécessaire.');
    const auditReason = `${actor.id} (${req.session.user.username}) : ${reason}`.slice(0, 512);
    const minutes = Number(req.body.minutes);
    if (action === 'timeout' && (!Number.isInteger(minutes) || minutes < 1 || minutes > 40320)) fail(400, 'Le mute doit durer de 1 minute à 28 jours.');
    if (action === 'unban') {
      // No member hierarchy exists for a user outside the guild; Discord BanMembers is still required.
      await guild.bans.fetch(userId);
      await guild.members.unban(userId, auditReason);
    } else {
      const target = await guild.members.fetch({ user: userId, force: true });
      if ((!owner && actor.roles.highest.comparePositionTo(target.roles.highest) <= 0) || bot.roles.highest.comparePositionTo(target.roles.highest) <= 0) fail(403, 'La hiérarchie des rôles ne permet pas cette action.');
      if (action === 'ban') { if (!target.bannable) fail(403, 'Ce membre ne peut pas être banni.'); await target.ban({ reason: auditReason }); }
      if (action === 'kick') { if (!target.kickable) fail(403, 'Ce membre ne peut pas être expulsé.'); await target.kick(auditReason); }
      if (action === 'timeout' || action === 'untimeout') { if (!target.moderatable) fail(403, 'Ce membre ne peut pas être mute.'); await target.timeout(action === 'timeout' ? minutes * 60000 : null, auditReason); }
      if (action === 'warn') {
        await target.send({ content: `⚠️ **Avertissement STØRM PVP**\n\n${reason}`, allowedMentions: { parse: [] } }).catch(() => {});
      }
    }
    const entry = { id: require('crypto').randomUUID(), action, userId, reason, minutes: action === 'timeout' ? minutes : null, staffId: actor.id, staff: req.session.user.username, createdAt: Date.now() };
    state.moderation ||= []; state.moderation.unshift(entry); state.moderation = state.moderation.slice(0, 1000); saveState();
    res.json({ ok: true, entry });
  }));
  return { requireStaff, resolveAccess };
}
module.exports = { installPanel, CHANNELS, NOTIFY_ROLES, PERMISSIONS, permissionsFor, nextVersion, patchContent };
