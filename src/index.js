require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const { installPanel, CHANNELS, NOTIFY_ROLES } = require('./panel');
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events
} = require('discord.js');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'data', 'config.json');
const STATE_PATH = path.join(ROOT, 'data', 'state.json');

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`[STORM] Impossible de lire ${file}:`, err);
    return fallback;
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

let config = readJson(CONFIG_PATH, {});
let state = readJson(STATE_PATH, {
  activeAppeals: {}, activeTickets: {}, appeals: {}, giveaways: {}, tickets: {}, announcements: [], siteConfig: { development: true }
});
// Compatibilité avec les anciens fichiers state.json
state.activeAppeals ||= {};
state.activeTickets ||= {};
state.appeals ||= {};
state.giveaways ||= {};
state.tickets ||= {};
state.announcements ||= [];
state.siteConfig ||= { development: true };

function saveConfig() { writeJson(CONFIG_PATH, config); }
function saveState() { writeJson(STATE_PATH, state); }

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const BOT_NAME = process.env.BOT_NAME || 'STORM SYSTEM';
const COLOR = parseInt((process.env.BOT_COLOR || '2B7FFF').replace('#', ''), 16);
const PORT = Number(process.env.SERVER_PORT || process.env.PORT || 3000);
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const FIVEM_STATUS_URL = process.env.FIVEM_STATUS_URL || '';
const DISCORD_INVITE_URL = process.env.DISCORD_INVITE_URL || '#';

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('[STORM] DISCORD_TOKEN, CLIENT_ID et GUILD_ID sont obligatoires dans le fichier .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.DirectMessageReactions
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User]
});

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure STORM SYSTEM et publie le panel de tickets')
    .addRoleOption(o => o.setName('staff_role').setDescription('Rôle qui gère les tickets et les bans').setRequired(true))
    .addChannelOption(o => o.setName('panel_channel').setDescription('Salon où publier le panel').addChannelTypes(ChannelType.GuildText))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('annonce')
    .setDescription('Publie une annonce STORM')
    .addStringOption(o => o.setName('titre').setDescription('Titre').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Contenu').setRequired(true))
    .addStringOption(o => o.setName('image').setDescription('URL d’une image'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('stream')
    .setDescription('Annonce un live/stream')
    .addChannelOption(o => o.setName('salon').setDescription('Salon de destination').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName('streamer').setDescription('Nom du streamer').setRequired(true))
    .addStringOption(o => o.setName('url').setDescription('Lien Twitch/YouTube/Kick').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Message personnalisé'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Lance un giveaway')
    .addStringOption(o => o.setName('duree').setDescription('Ex: 10m, 2h, 1d').setRequired(true))
    .addStringOption(o => o.setName('lot').setDescription('Lot à gagner').setRequired(true))
    .addIntegerOption(o => o.setName('gagnants').setDescription('Nombre de gagnants').setMinValue(1).setMaxValue(10).setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('reroll')
    .setDescription('Retire un gagnant pour un giveaway terminé')
    .addStringOption(o => o.setName('message_id').setDescription('ID du message giveaway').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('reply')
    .setDescription('Répond en DM au joueur depuis un ticket ou une contestation')
    .addStringOption(o => o.setName('message').setDescription('Message à envoyer au joueur').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Teste STORM SYSTEM')
].map(c => c.toJSON());

function parseDuration(input) {
  const match = /^([1-9]\d*)(s|m|h|d)$/i.exec(input.trim());
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const factor = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
  return value * factor;
}

function stormEmbed(title, description) {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `${BOT_NAME} • STORM PVP` })
    .setTimestamp();
}

function messagePayloadText(message) {
  const attachments = [...message.attachments.values()].map(a => a.url);
  return [message.content, ...attachments].filter(Boolean).join('\n').trim() || '[pièce jointe]';
}

async function sendTranscript(channel, user, questions, answers, dossierId) {
  const intro = stormEmbed(
    `💬 Conversation DM • ${dossierId}`,
    `**Joueur :** ${user ? `${user.tag} • <@${user.id}>` : 'Utilisateur inconnu'}\n**ID Discord :** \`${user?.id || 'inconnu'}\`\n\n📡 **Ce salon est le miroir du DM.**\nÉcris simplement dans ce salon : ton message sera envoyé au joueur en privé.\n✅ Le bot réagit à ton message quand l'envoi DM a réussi.`
  );
  await channel.send({ embeds: [intro] });

  for (let i = 0; i < questions.length; i++) {
    const q = new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor({ name: `${BOT_NAME} • Question ${i + 1}` })
      .setDescription(questions[i])
      .setTimestamp();
    await channel.send({ embeds: [q] });

    const a = new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor({
        name: user ? `${user.username} • réponse DM` : 'Joueur • réponse DM',
        iconURL: user?.displayAvatarURL?.() || undefined
      })
      .setDescription(String(answers[i] || '—').slice(0, 4000))
      .setTimestamp();
    await channel.send({ embeds: [a] });
  }
}

async function safeDM(userId, payload) {
  try {
    const user = await client.users.fetch(userId);
    const dm = await user.createDM();
    const sent = await dm.send(payload);
    // Accusé visuel demandé : le bot ajoute ✅ sur le message qu'il vient d'envoyer.
    await sent.react('✅').catch(() => {});
    return { ok: true, sent };
  } catch (err) {
    console.error('[STORM] DM impossible:', err);
    return { ok: false, error: err };
  }
}

async function log(guild, text) {
  try {
    if (!config.logChannelId) return;
    const ch = await guild.channels.fetch(config.logChannelId);
    if (ch?.isTextBased()) await ch.send({ embeds: [stormEmbed('📋 Log STORM', text)] });
  } catch (_) {}
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log(`[STORM] ${commands.length} commandes enregistrées sur le serveur.`);
}

async function ensureSetup(guild, interaction) {
  if (!config.staffRoleId) {
    await interaction.reply({ content: '❌ Lance d’abord `/setup`.', ephemeral: true });
    return false;
  }
  if (guild.id !== GUILD_ID) {
    await interaction.reply({ content: '❌ Ce bot est configuré pour un autre serveur.', ephemeral: true });
    return false;
  }
  return true;
}

async function createSetup(interaction) {
  const guild = interaction.guild;
  await interaction.deferReply({ ephemeral: true });

  const staffRole = interaction.options.getRole('staff_role');
  const panelChannel = interaction.options.getChannel('panel_channel') || interaction.channel;

  let ticketCategory = config.ticketCategoryId ? await guild.channels.fetch(config.ticketCategoryId).catch(() => null) : null;
  if (!ticketCategory) {
    ticketCategory = await guild.channels.create({
      name: '🎫 STORM TICKETS',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
      ]
    });
  } else {
    await ticketCategory.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: false }).catch(() => {});
    await ticketCategory.permissionOverwrites.edit(staffRole.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
  }

  let appealCategory = config.appealCategoryId ? await guild.channels.fetch(config.appealCategoryId).catch(() => null) : null;
  if (!appealCategory) {
    appealCategory = await guild.channels.create({
      name: '🔨 BAN APPEALS',
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
      ]
    });
  }

  let logChannel = config.logChannelId ? await guild.channels.fetch(config.logChannelId).catch(() => null) : null;
  if (!logChannel) {
    logChannel = await guild.channels.create({
      name: 'storm-logs',
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }
      ]
    });
  }

  config = {
    ...config,
    guildId: guild.id,
    staffRoleId: staffRole.id,
    ticketCategoryId: ticketCategory.id,
    appealCategoryId: appealCategory.id,
    logChannelId: logChannel.id,
    panelChannelId: panelChannel.id
  };
  saveConfig();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_type')
    .setPlaceholder('Choisis le type de demande')
    .addOptions(
      { label: 'Support', value: 'support', emoji: '🎫', description: 'Besoin d’aide sur STORM PVP' },
      { label: 'Report joueur', value: 'report', emoji: '🚨', description: 'Signaler un joueur' },
      { label: 'Boutique', value: 'shop', emoji: '🛒', description: 'Achat, VIP ou paiement' },
      { label: 'Partenariat', value: 'partner', emoji: '🤝', description: 'Demande de partenariat' },
      { label: 'Recrutement staff', value: 'recruitment', emoji: '👮', description: 'Candidature staff' },
      { label: 'Contester un ban', value: 'ban_appeal', emoji: '🔨', description: 'Faire appel d’un bannissement en privé' }
    );

  const panelEmbed = stormEmbed(
    '⚡ STORM SYSTEM • SUPPORT',
    'Sélectionne la catégorie correspondant à ta demande.\n\n📩 **Tous les tickets se déroulent en message privé avec le bot.**\n✅ Le bot réagit à chacune de tes réponses pour confirmer sa réception.\n🔒 Seul le staff voit le dossier interne créé pour traiter ta demande.'
  );

  await panelChannel.send({ embeds: [panelEmbed], components: [new ActionRowBuilder().addComponents(menu)] });
  await interaction.editReply(`✅ STORM SYSTEM configuré. Panel publié dans ${panelChannel}.`);
}

const APPEAL_QUESTIONS = [
  'Quel est ton **pseudo FiveM** ?',
  'Quel est ton **identifiant FiveM / licence** si tu le connais ? (sinon écris `inconnu`)',
  'Quelle est la **date approximative du bannissement** ?',
  'Quel **motif de bannissement** est affiché ?',
  'Quel membre du staff a appliqué la sanction, si tu le sais ? (sinon `inconnu`)',
  'Explique précisément **pourquoi tu contestes le bannissement**.',
  'As-tu une **preuve** (clip, vidéo, capture) ? Envoie le lien ou écris `aucune`.'
];

async function startBanAppeal(interaction) {
  const uid = interaction.user.id;
  if (state.activeAppeals[uid]) {
    return interaction.reply({ content: '❌ Tu as déjà une contestation en cours dans tes messages privés.', ephemeral: true });
  }

  const existing = Object.values(state.appeals).find(a => a.userId === uid && ['open', 'waiting_info'].includes(a.status));
  if (existing) {
    return interaction.reply({ content: '❌ Tu as déjà un dossier de contestation ouvert.', ephemeral: true });
  }

  const dmResult = await safeDM(uid, {
    embeds: [stormEmbed(
      '🔨 STORM PVP • Contestation de ban',
      `Ta contestation va être remplie ici, en privé.\n\nJe vais te poser **${APPEAL_QUESTIONS.length} questions**. Réponds à chaque message.\n\n✅ Je mettrai une réaction sur chacune de tes réponses pour confirmer qu’elle a bien été enregistrée.`
    )]
  });

  if (!dmResult.ok) {
    return interaction.reply({ content: '❌ Je ne peux pas t’envoyer de message privé. Active les DM du serveur puis réessaie.', ephemeral: true });
  }

  state.activeAppeals[uid] = { step: 0, answers: [], guildId: interaction.guildId, startedAt: Date.now() };
  saveState();

  await safeDM(uid, { content: `**Question 1/${APPEAL_QUESTIONS.length}**\n${APPEAL_QUESTIONS[0]}` });
  await interaction.reply({ content: '📩 Je viens de t’envoyer un message privé. La contestation continue dans tes DM.', ephemeral: true });
}

async function finishBanAppeal(userId) {
  const session = state.activeAppeals[userId];
  if (!session) return;

  const guild = await client.guilds.fetch(session.guildId);
  const user = await client.users.fetch(userId).catch(() => null);
  const safeName = (user?.username || `user-${userId}`).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);

  const channel = await guild.channels.create({
    name: `appeal-${safeName}`,
    type: ChannelType.GuildText,
    parent: config.appealCategoryId,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
    ]
  });

  const appealId = `A-${Date.now().toString().slice(-6)}`;
  const initialHistory = [];
  APPEAL_QUESTIONS.forEach((q, i) => {
    initialHistory.push({ from: 'bot', author: BOT_NAME, content: q.replace(/\*\*/g, ''), at: Date.now() - (APPEAL_QUESTIONS.length - i) * 2 });
    initialHistory.push({ from: 'user', author: user?.username || 'Joueur', content: String(session.answers[i] || '—'), at: Date.now() - (APPEAL_QUESTIONS.length - i) });
  });
  state.appeals[channel.id] = {
    id: appealId,
    userId,
    guildId: guild.id,
    status: 'open',
    answers: session.answers,
    history: initialHistory,
    createdAt: Date.now()
  };
  delete state.activeAppeals[userId];
  saveState();

  const fields = APPEAL_QUESTIONS.map((q, i) => ({
    name: `${i + 1}. ${q.replace(/\*\*/g, '')}`.slice(0, 256),
    value: String(session.answers[i] || '—').slice(0, 1024),
    inline: false
  }));

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('appeal_accept').setLabel('Accepter').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('appeal_refuse').setLabel('Refuser').setEmoji('❌').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('appeal_info').setLabel('Demander une info').setEmoji('💬').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('appeal_close').setLabel('Clôturer').setEmoji('🔒').setStyle(ButtonStyle.Secondary)
  );

  await channel.send({ content: `<@&${config.staffRoleId}> • Nouvelle contestation` });
  await sendTranscript(channel, user, APPEAL_QUESTIONS, session.answers, appealId);
  await channel.send({
    embeds: [stormEmbed('🟡 Contestation à étudier', `**${appealId}** • Écris directement dans ce salon pour parler au joueur en DM.`)],
    components: [buttons]
  });
  await safeDM(userId, { embeds: [stormEmbed('✅ Contestation enregistrée', `Ton dossier **${appealId}** a bien été transmis au staff STORM PVP.\nTu recevras la décision ici, en message privé.`)] });
  await log(guild, `Nouvelle contestation **${appealId}** de <@${userId}> → ${channel}`);
}

const TICKET_TYPES = {
  support: {
    prefix: 'support', title: '🎫 Support',
    questions: [
      'Quel est ton **pseudo FiveM** ?',
      'Décris précisément le **problème rencontré**.',
      'As-tu une **capture, vidéo ou autre preuve** ? Envoie-la ou écris `aucune`.'
    ]
  },
  report: {
    prefix: 'report', title: '🚨 Report joueur',
    questions: [
      'Quel est ton **pseudo FiveM** ?',
      'Quel est le **pseudo / ID du joueur signalé** ?',
      'Explique précisément les **faits reprochés**.',
      'Envoie tes **preuves** (clip, capture, vidéo) ou écris `aucune`.'
    ]
  },
  shop: {
    prefix: 'boutique', title: '🛒 Boutique',
    questions: [
      'Quel est ton **pseudo FiveM** ?',
      'Quel **achat / VIP / produit** concerne ta demande ?',
      'Explique précisément le **problème**.',
      'Si tu en as une, envoie une **preuve de paiement ou capture**. Sinon écris `aucune`.'
    ]
  },
  partner: {
    prefix: 'partenariat', title: '🤝 Partenariat',
    questions: [
      'Quel est ton **pseudo / nom** ?',
      'Présente ton **serveur, communauté ou projet**.',
      'Envoie le **lien Discord / réseau** concerné.',
      'Explique ce que tu proposes comme **partenariat avec STORM PVP**.'
    ]
  },
  recruitment: {
    prefix: 'recrutement', title: '👮 Recrutement staff',
    questions: [
      'Quel est ton **pseudo FiveM** ?',
      'Quel est ton **âge** ?',
      'As-tu déjà eu une **expérience de staff** ? Explique brièvement.',
      'Pourquoi veux-tu rejoindre le **staff STORM PVP** ?',
      'Quelles sont tes **disponibilités habituelles** ?'
    ]
  }
};

async function startTicketDM(interaction, type) {
  const uid = interaction.user.id;
  const def = TICKET_TYPES[type];
  if (!def) return interaction.reply({ content: '❌ Type de ticket inconnu.', ephemeral: true });

  if (state.activeTickets[uid]) {
    return interaction.reply({ content: '❌ Tu as déjà un ticket en cours de création dans tes messages privés.', ephemeral: true });
  }

  const existing = Object.values(state.tickets).find(t => t.userId === uid && t.status === 'open');
  if (existing) {
    return interaction.reply({ content: `❌ Tu as déjà un ticket ouvert (**${existing.id || 'ticket'}**). Continue directement dans tes DM avec le bot.`, ephemeral: true });
  }

  const dmResult = await safeDM(uid, {
    embeds: [stormEmbed(
      `${def.title} • STORM PVP`,
      `Ton ticket se déroule entièrement **ici en message privé**.\n\nJe vais te poser **${def.questions.length} questions**.\n✅ Je mettrai une réaction sur chacune de tes réponses pour confirmer qu’elle a bien été enregistrée.\n🔒 Tes réponses seront visibles uniquement par le staff STORM PVP.`
    )]
  });

  if (!dmResult.ok) {
    return interaction.reply({ content: '❌ Je ne peux pas t’envoyer de message privé. Active les DM du serveur puis réessaie.', ephemeral: true });
  }

  state.activeTickets[uid] = { type, step: 0, answers: [], guildId: interaction.guildId, startedAt: Date.now() };
  saveState();

  await safeDM(uid, { content: `**Question 1/${def.questions.length}**\n${def.questions[0]}` });
  await interaction.reply({ content: '📩 Je viens de t’envoyer un message privé. Ton ticket continue maintenant dans tes DM.', ephemeral: true });
}

async function finishTicket(userId) {
  const session = state.activeTickets[userId];
  if (!session) return;
  const def = TICKET_TYPES[session.type];
  if (!def) return;

  const guild = await client.guilds.fetch(session.guildId);
  const user = await client.users.fetch(userId).catch(() => null);
  const safeName = (user?.username || `user-${userId}`).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 32);

  const channel = await guild.channels.create({
    name: `${def.prefix}-${safeName}`,
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
    ]
  });

  const ticketId = `T-${Date.now().toString().slice(-6)}`;
  const initialHistory = [];
  def.questions.forEach((q, i) => {
    initialHistory.push({ from: 'bot', author: BOT_NAME, content: q.replace(/\*\*/g, ''), at: Date.now() - (def.questions.length - i) * 2 });
    initialHistory.push({ from: 'user', author: user?.username || 'Joueur', content: String(session.answers[i] || '—'), at: Date.now() - (def.questions.length - i) });
  });
  state.tickets[channel.id] = {
    id: ticketId,
    userId,
    guildId: guild.id,
    type: session.type,
    status: 'open',
    answers: session.answers,
    history: initialHistory,
    createdAt: Date.now()
  };
  delete state.activeTickets[userId];
  saveState();

  const fields = def.questions.map((q, i) => ({
    name: `${i + 1}. ${q.replace(/\*\*/g, '')}`.slice(0, 256),
    value: String(session.answers[i] || '—').slice(0, 1024),
    inline: false
  }));

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_close').setLabel('Clôturer le ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );

  await channel.send({ content: `<@&${config.staffRoleId}> • Nouveau ${def.title}` });
  await sendTranscript(channel, user, def.questions, session.answers, ticketId);
  await channel.send({
    embeds: [stormEmbed('🟢 Ticket ouvert', `**${ticketId}** • Écris directement dans ce salon pour parler au joueur en DM.\nLa commande \`/reply\` reste disponible en secours.`)],
    components: [buttons]
  });
  await safeDM(userId, { embeds: [stormEmbed('✅ Ticket enregistré', `Ton ticket **${ticketId}** a bien été transmis au staff STORM PVP.\n\nTu peux continuer à écrire **directement ici en DM** : tous tes prochains messages seront transmis au staff jusqu’à la clôture du ticket.`)] });
  await log(guild, `Nouveau ticket **${ticketId}** (${def.title}) de <@${userId}> → ${channel}`);
}

async function showDecisionModal(interaction, action) {
  const modal = new ModalBuilder().setCustomId(`appeal_decision:${action}`).setTitle(action === 'accept' ? 'Accepter la contestation' : 'Refuser la contestation');
  const reason = new TextInputBuilder()
    .setCustomId('reason')
    .setLabel(action === 'accept' ? 'Message / motif d’acceptation' : 'Motif du refus')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(1000);
  modal.addComponents(new ActionRowBuilder().addComponents(reason));
  await interaction.showModal(modal);
}

async function showInfoModal(interaction) {
  const modal = new ModalBuilder().setCustomId('appeal_info_modal').setTitle('Demander une information');
  const q = new TextInputBuilder().setCustomId('question').setLabel('Question à envoyer au joueur').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
  modal.addComponents(new ActionRowBuilder().addComponents(q));
  await interaction.showModal(modal);
}

async function processDecision(interaction, action, reason) {
  const appeal = state.appeals[interaction.channelId];
  if (!appeal) return interaction.reply({ content: '❌ Aucun dossier lié à ce salon.', ephemeral: true });

  const accepted = action === 'accept';
  const title = accepted ? '✅ Contestation acceptée' : '❌ Contestation refusée';
  const body = accepted
    ? `Après étude de ton dossier **${appeal.id}**, l’équipe STORM PVP accepte ta contestation.\n\n**Décision du staff :**\n${reason}`
    : `Après étude de ton dossier **${appeal.id}**, l’équipe STORM PVP maintient la sanction.\n\n**Motif :**\n${reason}`;

  const sent = await safeDM(appeal.userId, { embeds: [stormEmbed(title, body)] });
  if (!sent.ok) return interaction.reply({ content: '❌ Impossible d’envoyer le DM au joueur.', ephemeral: true });

  appeal.status = accepted ? 'accepted' : 'refused';
  appeal.closedAt = Date.now();
  appeal.decisionBy = interaction.user.id;
  appeal.reason = reason;
  saveState();

  await interaction.reply({
    embeds: [stormEmbed('📨 Message envoyé', `✅ La décision a bien été envoyée en privé à <@${appeal.userId}>.\n\n**${accepted ? 'Accepté' : 'Refusé'} par :** <@${interaction.user.id}>\n**Motif :** ${reason}`)]
  });
  // Ajoute aussi une réaction de confirmation sur le message d'audit dans le salon staff.
  const audit = await interaction.fetchReply().catch(() => null);
  if (audit) await audit.react('✅').catch(() => {});
  await log(interaction.guild, `Dossier **${appeal.id}** ${accepted ? 'accepté' : 'refusé'} par <@${interaction.user.id}>.`);
}

async function requestInfo(interaction, question) {
  const appeal = state.appeals[interaction.channelId];
  if (!appeal) return interaction.reply({ content: '❌ Aucun dossier lié à ce salon.', ephemeral: true });

  const sent = await safeDM(appeal.userId, { embeds: [stormEmbed('💬 Information demandée par le staff', `${question}\n\nRéponds directement dans ce message privé. Ta réponse sera transmise au staff.`)] });
  if (!sent.ok) return interaction.reply({ content: '❌ Impossible d’envoyer le DM au joueur.', ephemeral: true });

  appeal.status = 'waiting_info';
  saveState();
  const reply = await interaction.reply({ content: `✅ Question envoyée en DM à <@${appeal.userId}> :\n> ${question}`, fetchReply: true });
  await reply.react('✅').catch(() => {});
}

async function handleDM(message) {
  const uid = message.author.id;

  // 1) Création d'un ticket classique en DM
  const ticketSession = state.activeTickets[uid];
  if (ticketSession) {
    const def = TICKET_TYPES[ticketSession.type];
    await message.react('✅').catch(() => {});
    const text = [message.content, ...message.attachments.map(a => a.url)].filter(Boolean).join('\n').trim() || '[pièce jointe]';
    ticketSession.answers.push(text);
    ticketSession.step += 1;
    saveState();

    if (ticketSession.step >= def.questions.length) {
      await message.channel.send({ embeds: [stormEmbed('📨 Envoi du ticket', 'Toutes tes réponses sont enregistrées. Je transmets maintenant ton ticket au staff.')] });
      await finishTicket(uid);
    } else {
      await message.channel.send(`**Question ${ticketSession.step + 1}/${def.questions.length}**\n${def.questions[ticketSession.step]}`);
    }
    return;
  }

  // 2) Création d'une contestation de ban en DM
  const appealSession = state.activeAppeals[uid];
  if (appealSession) {
    await message.react('✅').catch(() => {});
    const text = [message.content, ...message.attachments.map(a => a.url)].filter(Boolean).join('\n').trim() || '[pièce jointe]';
    appealSession.answers.push(text);
    appealSession.step += 1;
    saveState();

    if (appealSession.step >= APPEAL_QUESTIONS.length) {
      await message.channel.send({ embeds: [stormEmbed('📨 Envoi du dossier', 'Toutes tes réponses sont enregistrées. Je transmets maintenant ton dossier au staff.')] });
      await finishBanAppeal(uid);
    } else {
      await message.channel.send(`**Question ${appealSession.step + 1}/${APPEAL_QUESTIONS.length}**\n${APPEAL_QUESTIONS[appealSession.step]}`);
    }
    return;
  }

  // 3) Conversation continue sur un ticket déjà ouvert
  const ticketEntry = Object.entries(state.tickets).find(([, t]) => t.userId === uid && t.status === 'open');
  if (ticketEntry) {
    await message.react('✅').catch(() => {});
    const [channelId, ticket] = ticketEntry;
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (ch?.isTextBased()) {
      const content = messagePayloadText(message);
      const user = message.author;
      const mirrored = new EmbedBuilder()
        .setColor(COLOR)
        .setAuthor({ name: `${user.username} • DM`, iconURL: user.displayAvatarURL() })
        .setDescription(content.slice(0, 4000))
        .setFooter({ text: `${ticket.id} • reçu en message privé` })
        .setTimestamp();
      await ch.send({ embeds: [mirrored] });
      ticket.history ||= [];
      ticket.history.push({ from: 'user', author: user.username, content, at: Date.now() });
      saveState();
    }
    return;
  }

  // 4) Conversation continue sur une contestation ouverte
  const appealEntry = Object.entries(state.appeals).find(([, a]) => a.userId === uid && ['open', 'waiting_info'].includes(a.status));
  if (appealEntry) {
    await message.react('✅').catch(() => {});
    const [channelId, appeal] = appealEntry;
    const ch = await client.channels.fetch(channelId).catch(() => null);
    if (ch?.isTextBased()) {
      const content = messagePayloadText(message);
      const user = message.author;
      const mirrored = new EmbedBuilder()
        .setColor(COLOR)
        .setAuthor({ name: `${user.username} • DM`, iconURL: user.displayAvatarURL() })
        .setDescription(content.slice(0, 4000))
        .setFooter({ text: `${appeal.id} • reçu en message privé` })
        .setTimestamp();
      await ch.send({ embeds: [mirrored] });
      appeal.history ||= [];
      appeal.history.push({ from: 'user', author: user.username, content, at: Date.now() });
      appeal.status = 'open';
      saveState();
    }
    return;
  }

  await message.channel.send('ℹ️ Tu n’as actuellement aucun ticket ouvert. Utilise le panel **STORM SYSTEM** sur le serveur pour en créer un.').catch(() => {});
}

async function startGiveaway(interaction) {
  const channel = await interaction.guild.channels.fetch(CHANNELS.giveaways);
  const durationText = interaction.options.getString('duree');
  const duration = parseDuration(durationText);
  if (!duration) return interaction.reply({ content: '❌ Durée invalide. Utilise par exemple `10m`, `2h` ou `1d`.', ephemeral: true });

  const prize = interaction.options.getString('lot');
  const winners = interaction.options.getInteger('gagnants');
  const endAt = Date.now() + duration;

  const embed = stormEmbed('🎁 STORM GIVEAWAY', `**Lot :** ${prize}\n**Gagnant(s) :** ${winners}\n**Fin :** <t:${Math.floor(endAt / 1000)}:R>\n\nRéagis avec 🎉 pour participer !`);
  const msg = await channel.send({ content: `<@&${NOTIFY_ROLES.giveaways}>`, embeds: [embed], allowedMentions: { parse: [], roles: [NOTIFY_ROLES.giveaways] } });
  await msg.react('🎉');

  state.giveaways[msg.id] = { channelId: channel.id, guildId: interaction.guildId, prize, winners, endAt, ended: false };
  saveState();
  await interaction.reply({ content: `✅ Giveaway lancé dans ${channel}.`, ephemeral: true });
}

async function endGiveaway(messageId, forceReroll = false) {
  const g = state.giveaways[messageId];
  if (!g) return { ok: false, error: 'Giveaway introuvable.' };

  const channel = await client.channels.fetch(g.channelId).catch(() => null);
  if (!channel?.isTextBased()) return { ok: false, error: 'Salon introuvable.' };
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg) return { ok: false, error: 'Message introuvable.' };

  const reaction = msg.reactions.cache.get('🎉') || await msg.reactions.resolve('🎉');
  const users = reaction ? await reaction.users.fetch() : null;
  const pool = users ? [...users.values()].filter(u => !u.bot) : [];
  if (!pool.length) {
    if (!forceReroll) {
      g.ended = true;
      saveState();
      await channel.send(`🎁 Giveaway terminé pour **${g.prize}** : aucun participant valide.`);
    }
    return { ok: false, error: 'Aucun participant valide.' };
  }

  const shuffled = pool.sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, Math.min(g.winners, shuffled.length));
  const mentions = selected.map(u => `<@${u.id}>`).join(', ');
  await channel.send(`🎉 **${forceReroll ? 'REROLL' : 'GIVEAWAY TERMINÉ'}** — ${mentions} gagne${selected.length > 1 ? 'nt' : ''} **${g.prize}** !`);

  if (!forceReroll) {
    g.ended = true;
    g.winnerIds = selected.map(u => u.id);
    saveState();
  }
  return { ok: true, winners: selected };
}

async function giveawayLoop() {
  for (const [messageId, g] of Object.entries(state.giveaways)) {
    if (!g.ended && g.endAt <= Date.now()) {
      await endGiveaway(messageId).catch(console.error);
    }
  }
}

client.once(Events.ClientReady, async c => {
  console.log(`[STORM] Connecté : ${c.user.tag}`);
  c.user.setActivity('⚡ STORM PVP • Support');
  await registerCommands().catch(err => console.error('[STORM] Commandes:', err));
  setInterval(giveawayLoop, 15000);
  giveawayLoop().catch(console.error);
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  // DM joueur -> salon staff miroir
  if (!message.guild) {
    await handleDM(message).catch(console.error);
    return;
  }

  // Salon staff miroir -> DM joueur : il suffit d'écrire normalement dans le salon.
  const ticket = state.tickets[message.channelId];
  const appeal = state.appeals[message.channelId];
  const dossier = ticket || appeal;
  if (!dossier) return;

  const isStaff = message.member?.roles?.cache?.has(config.staffRoleId) || message.member?.permissions?.has(PermissionFlagsBits.Administrator);
  if (!isStaff) return;

  const dossierOpen = ticket ? ticket.status === 'open' : ['open', 'waiting_info'].includes(appeal.status);
  if (!dossierOpen) return;

  // Les commandes slash ne passent pas par MessageCreate, donc aucun risque de double envoi avec /reply.
  const content = messagePayloadText(message);
  const sent = await safeDM(dossier.userId, {
    embeds: [new EmbedBuilder()
      .setColor(COLOR)
      .setAuthor({ name: `Staff STORM • ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
      .setDescription(content.slice(0, 4000))
      .setFooter({ text: `${dossier.id} • réponse du staff` })
      .setTimestamp()]
  });

  if (sent.ok) {
    dossier.history ||= [];
    dossier.history.push({ from: 'staff', author: message.author.username, authorId: message.author.id, content, at: Date.now(), source: 'discord' });
    saveState();
    await message.react('✅').catch(() => {});
  } else {
    await message.react('❌').catch(() => {});
    await message.reply('❌ Impossible d’envoyer ce message en DM au joueur.').catch(() => {});
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'ping') return interaction.reply({ content: `⚡ Pong • ${client.ws.ping} ms`, ephemeral: true });
      if (interaction.commandName === 'setup') return createSetup(interaction);
      if (!(await ensureSetup(interaction.guild, interaction))) return;

      if (interaction.commandName === 'annonce') {
        const channel = await interaction.guild.channels.fetch(CHANNELS.announcements);
        const title = interaction.options.getString('titre');
        const message = interaction.options.getString('message');
        const image = interaction.options.getString('image');
        const embed = stormEmbed(`📢 ${title}`, message);
        if (image) embed.setImage(image);
        const sentMessage = await channel.send({ embeds: [embed] });
        state.announcements.unshift({ id: sentMessage.id, channelId: channel.id, title, message, image: image || '', author: interaction.user.username, authorId: interaction.user.id, createdAt: Date.now() });
        state.announcements = state.announcements.slice(0, 100);
        saveState();
        return interaction.reply({ content: `✅ Annonce envoyée dans ${channel}.`, ephemeral: true });
      }

      if (interaction.commandName === 'stream') {
        const channel = interaction.options.getChannel('salon');
        const streamer = interaction.options.getString('streamer');
        const url = interaction.options.getString('url');
        const custom = interaction.options.getString('message') || 'Le live vient de commencer. Rejoins-le maintenant !';
        const embed = stormEmbed('🔴 STREAM EN DIRECT', `**${streamer}** est en live !\n\n${custom}\n\n🔗 ${url}`);
        await channel.send({ content: '@everyone', embeds: [embed], allowedMentions: { parse: ['everyone'] } });
        return interaction.reply({ content: `✅ Stream annoncé dans ${channel}.`, ephemeral: true });
      }

      if (interaction.commandName === 'giveaway') return startGiveaway(interaction);

      if (interaction.commandName === 'reroll') {
        const id = interaction.options.getString('message_id');
        const result = await endGiveaway(id, true);
        return interaction.reply({ content: result.ok ? '✅ Reroll effectué.' : `❌ ${result.error}`, ephemeral: true });
      }

      if (interaction.commandName === 'reply') {
        const appeal = state.appeals[interaction.channelId];
        const ticket = state.tickets[interaction.channelId];
        const dossier = appeal || ticket;
        if (!dossier) return interaction.reply({ content: '❌ Cette commande fonctionne uniquement dans un salon ticket/contestation STORM.', ephemeral: true });
        const text = interaction.options.getString('message');
        const label = appeal ? `Contestation ${appeal.id}` : `Ticket ${ticket.id}`;
        const sent = await safeDM(dossier.userId, { embeds: [stormEmbed(`💬 Réponse du staff • ${label}`, `${text}\n\nTu peux répondre directement ici en DM.`)] });
        if (!sent.ok) return interaction.reply({ content: '❌ DM impossible.', ephemeral: true });
        dossier.history ||= [];
        dossier.history.push({ from: 'staff', author: interaction.user.username, authorId: interaction.user.id, content: text, at: Date.now(), source: 'discord-command' });
        saveState();
        const audit = await interaction.reply({ content: `✅ Message envoyé en privé à <@${dossier.userId}>.`, fetchReply: true });
        await audit.react('✅').catch(() => {});
        return;
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_type') {
      if (!(await ensureSetup(interaction.guild, interaction))) return;
      const type = interaction.values[0];
      if (type === 'ban_appeal') return startBanAppeal(interaction);
      return startTicketDM(interaction, type);
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'ticket_close') {
        const ticket = state.tickets[interaction.channelId];
        if (!ticket) return interaction.reply({ content: '❌ Ticket inconnu.', ephemeral: true });
        const isStaff = interaction.member.roles.cache.has(config.staffRoleId) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isStaff) return interaction.reply({ content: '❌ Réservé au staff.', ephemeral: true });
        ticket.status = 'closed';
        ticket.history ||= [];
        ticket.history.push({ from: 'system', author: BOT_NAME, content: `Ticket clôturé par ${interaction.user.username}`, at: Date.now() });
        ticket.closedAt = Date.now();
        ticket.closedBy = interaction.user.id;
        saveState();
        await safeDM(ticket.userId, { embeds: [stormEmbed('🔒 Ticket clôturé', `Ton ticket **${ticket.id}** a été clôturé par le staff STORM PVP.\n\nSi tu as un nouveau problème, tu peux créer un nouveau ticket depuis le panel du serveur.`)] });
        await interaction.reply('🔒 Ticket clôturé. Le joueur a été prévenu en DM. Suppression du salon dans 10 secondes.');
        setTimeout(() => interaction.channel.delete('Ticket clôturé').catch(() => {}), 10000);
        return;
      }

      if (['appeal_accept', 'appeal_refuse', 'appeal_info', 'appeal_close'].includes(interaction.customId)) {
        const isStaff = interaction.member.roles.cache.has(config.staffRoleId) || interaction.member.permissions.has(PermissionFlagsBits.Administrator);
        if (!isStaff) return interaction.reply({ content: '❌ Réservé au staff.', ephemeral: true });
        if (interaction.customId === 'appeal_accept') return showDecisionModal(interaction, 'accept');
        if (interaction.customId === 'appeal_refuse') return showDecisionModal(interaction, 'refuse');
        if (interaction.customId === 'appeal_info') return showInfoModal(interaction);
        if (interaction.customId === 'appeal_close') {
          const appeal = state.appeals[interaction.channelId];
          if (appeal) { appeal.status = 'closed'; saveState(); }
          await interaction.reply('🔒 Dossier clôturé. Suppression du salon dans 10 secondes.');
          setTimeout(() => interaction.channel.delete('Dossier clôturé').catch(() => {}), 10000);
        }
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('appeal_decision:')) {
        const action = interaction.customId.split(':')[1];
        const reason = interaction.fields.getTextInputValue('reason');
        return processDecision(interaction, action, reason);
      }
      if (interaction.customId === 'appeal_info_modal') {
        const question = interaction.fields.getTextInputValue('question');
        return requestInfo(interaction, question);
      }
    }
  } catch (err) {
    console.error('[STORM] Interaction error:', err);
    if (interaction.isRepliable()) {
      const payload = { content: '❌ Une erreur est survenue. Regarde la console du bot.', ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => {});
      else await interaction.reply(payload).catch(() => {});
    }
  }
});

process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);



// ================================================================
// WEB PANEL / SITE STORM
// ================================================================
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: PUBLIC_URL.startsWith('https://'), maxAge: 1000 * 60 * 60 * 12 }
}));
app.use((req, res, next) => {
  if (['/admin.html', '/admin.js'].includes(req.path)) res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(ROOT, 'public')));

function oauthReady() { return Boolean(DISCORD_CLIENT_SECRET && PUBLIC_URL); }
function oauthRedirectUri() { return `${PUBLIC_URL}/auth/discord/callback`; }
function cleanText(v, max = 4000) { return String(v ?? '').trim().slice(0, max); }
function dossierByChannelId(id) { return state.tickets[id] || state.appeals[id] || null; }
function dossierKind(id) { return state.tickets[id] ? 'ticket' : (state.appeals[id] ? 'appeal' : null); }

const { requireStaff, resolveAccess } = installPanel(app, { client, getConfig: () => config, state, saveConfig, saveState, guildId: GUILD_ID, publicUrl: PUBLIC_URL });

app.get('/auth/discord', (req, res) => {
  if (!oauthReady()) return res.status(503).send('OAuth Discord non configuré. Ajoute DISCORD_CLIENT_SECRET et PUBLIC_URL dans .env.');
  const stateToken = crypto.randomBytes(18).toString('hex');
  req.session.oauthState = stateToken;
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: oauthRedirectUri(),
    response_type: 'code',
    scope: 'identify guilds.members.read',
    state: stateToken,
    prompt: 'none'
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
});

app.get('/auth/discord/callback', asyncRoute(async (req, res) => {
  try {
    if (!req.query.code || req.query.state !== req.session.oauthState) return res.status(400).send('Connexion Discord invalide.');
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code: String(req.query.code),
      redirect_uri: oauthRedirectUri()
    });
    const tokenResp = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
    });
    if (!tokenResp.ok) throw new Error(`OAuth token HTTP ${tokenResp.status}`);
    const tokenData = await tokenResp.json();
    const headers = { Authorization: `Bearer ${tokenData.access_token}` };
    const userResp = await fetch('https://discord.com/api/v10/users/@me', { headers });
    if (!userResp.ok) throw new Error('Impossible de lire le profil Discord.');
    const user = await userResp.json();
    const access = await resolveAccess(user.id);
    const isStaff = access.permissions.length > 0;
    req.session.user = {
      id: user.id,
      username: user.global_name || user.username,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : '',
      isStaff
    };
    delete req.session.oauthState;
    res.redirect(isStaff ? '/admin.html' : '/?denied=1');
  } catch (err) {
    console.error('[STORM WEB] OAuth:', err);
    res.status(500).send('Erreur pendant la connexion Discord. Vérifie PUBLIC_URL et le Redirect URI dans le Developer Portal.');
  }
}));

app.post('/auth/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', asyncRoute(async (req, res) => {
  try {
    const user = req.session?.user;
    const access = user ? await resolveAccess(user.id) : { permissions: [], owner: false };
    res.json({ user: user ? { ...user, isStaff: access.permissions.length > 0, permissions: access.permissions, owner: access.owner } : null, oauthReady: oauthReady() });
  } catch (_) { res.status(503).json({ error: 'Discord indisponible : accès impossible à vérifier.' }); }
}));

app.get('/api/public', asyncRoute(async (req, res) => {
  let server = { mode: state.siteConfig.development ? 'development' : 'offline', online: false };
  if (!state.siteConfig.development && FIVEM_STATUS_URL) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);
      const r = await fetch(FIVEM_STATUS_URL, { signal: ctrl.signal });
      clearTimeout(t);
      server = { mode: r.ok ? 'online' : 'offline', online: r.ok };
    } catch (_) { server = { mode: 'offline', online: false }; }
  }
  res.json({
    name: 'STØRM PVP',
    discordInvite: DISCORD_INVITE_URL,
    server,
    patchNotes: (state.patchNotes || []).slice(0, 10),
    announcements: state.announcements.slice(0, 8).map(a => ({ id: a.id, title: a.title, message: a.message, image: a.image, createdAt: a.createdAt, author: a.author }))
  });
}));

app.get('/api/admin/summary', requireStaff, asyncRoute(async (req, res) => {
  const openTickets = Object.values(state.tickets).filter(t => t.status === 'open').length;
  const openAppeals = Object.values(state.appeals).filter(a => ['open','waiting_info'].includes(a.status)).length;
  const activeGiveaways = Object.values(state.giveaways).filter(g => !g.ended).length;
  res.json({ botReady: client.isReady(), openTickets, openAppeals, activeGiveaways, announcements: state.announcements.length, development: Boolean(state.siteConfig.development) });
}));

app.get('/api/admin/channels', requireStaff, asyncRoute(async (req, res) => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channels = await guild.channels.fetch();
    const rows = [...channels.values()].filter(c => c && c.type === ChannelType.GuildText).map(c => ({ id: c.id, name: c.name })).sort((a,b) => a.name.localeCompare(b.name));
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Impossible de charger les salons Discord.' }); }
}));

app.get('/api/admin/dossiers', requireStaff, asyncRoute(async (req, res) => {
  const list = [];
  for (const [channelId, t] of Object.entries(state.tickets)) list.push({ channelId, kind: 'ticket', ...t });
  for (const [channelId, a] of Object.entries(state.appeals)) list.push({ channelId, kind: 'appeal', ...a });
  list.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
  res.json(list.map(d => ({ channelId: d.channelId, kind: d.kind, id: d.id, userId: d.userId, type: d.type || 'ban_appeal', status: d.status, createdAt: d.createdAt, closedAt: d.closedAt || null, history: d.history || [] })));
}));

app.get('/api/admin/dossiers/:channelId', requireStaff, (req, res) => {
  const d = dossierByChannelId(req.params.channelId);
  if (!d) return res.status(404).json({ error: 'Dossier introuvable.' });
  res.json({ channelId: req.params.channelId, kind: dossierKind(req.params.channelId), ...d, history: d.history || [] });
});

app.post('/api/admin/dossiers/:channelId/reply', requireStaff, asyncRoute(async (req, res) => {
  const d = dossierByChannelId(req.params.channelId);
  if (!d) return res.status(404).json({ error: 'Dossier introuvable.' });
  const isOpen = state.tickets[req.params.channelId] ? d.status === 'open' : ['open','waiting_info'].includes(d.status);
  if (!isOpen) return res.status(409).json({ error: 'Ce dossier est clôturé.' });
  const text = cleanText(req.body.message, 3500);
  if (!text) return res.status(400).json({ error: 'Message vide.' });
  const staffName = req.session.user.username;
  const sent = await safeDM(d.userId, { embeds: [stormEmbed(`💬 Staff STORM • ${staffName}`, `${text}\n\nTu peux répondre directement ici en DM.`)] });
  if (!sent.ok) return res.status(502).json({ error: 'Impossible d’envoyer le DM au joueur.' });
  d.history ||= [];
  d.history.push({ from: 'staff', author: staffName, authorId: req.session.user.id, content: text, at: Date.now(), source: 'web' });
  saveState();
  const ch = await client.channels.fetch(req.params.channelId).catch(() => null);
  if (ch?.isTextBased()) await ch.send({ embeds: [new EmbedBuilder().setColor(COLOR).setAuthor({ name: `${staffName} • PANEL WEB` }).setDescription(text).setFooter({ text: `${d.id} • envoyé en DM depuis le site` }).setTimestamp()] });
  res.json({ ok: true });
}));

app.post('/api/admin/dossiers/:channelId/close', requireStaff, asyncRoute(async (req, res) => {
  const d = dossierByChannelId(req.params.channelId);
  if (!d) return res.status(404).json({ error: 'Dossier introuvable.' });
  d.status = 'closed';
  d.closedAt = Date.now();
  d.closedBy = req.session.user.id;
  d.history ||= [];
  d.history.push({ from: 'system', author: BOT_NAME, content: `Dossier clôturé depuis le site par ${req.session.user.username}`, at: Date.now() });
  saveState();
  await safeDM(d.userId, { embeds: [stormEmbed('🔒 Dossier clôturé', `Ton dossier **${d.id}** a été clôturé par le staff STORM PVP.`)] });
  const ch = await client.channels.fetch(req.params.channelId).catch(() => null);
  if (ch?.isTextBased()) await ch.send({ embeds: [stormEmbed('🔒 Clôturé depuis le panel web', `Par **${req.session.user.username}**.`)] }).catch(() => {});
  res.json({ ok: true });
}));

app.post('/api/admin/appeals/:channelId/decision', requireStaff, asyncRoute(async (req, res) => {
  const a = state.appeals[req.params.channelId];
  if (!a) return res.status(404).json({ error: 'Contestation introuvable.' });
  const action = req.body.action === 'accept' ? 'accept' : 'refuse';
  const reason = cleanText(req.body.reason, 1000);
  if (!reason) return res.status(400).json({ error: 'Motif obligatoire.' });
  const accepted = action === 'accept';
  const title = accepted ? '✅ Contestation acceptée' : '❌ Contestation refusée';
  const body = accepted ? `Après étude de ton dossier **${a.id}**, l’équipe STORM PVP accepte ta contestation.\n\n**Décision du staff :**\n${reason}` : `Après étude de ton dossier **${a.id}**, l’équipe STORM PVP maintient la sanction.\n\n**Motif :**\n${reason}`;
  const sent = await safeDM(a.userId, { embeds: [stormEmbed(title, body)] });
  if (!sent.ok) return res.status(502).json({ error: 'DM impossible.' });
  a.status = accepted ? 'accepted' : 'refused';
  a.closedAt = Date.now(); a.decisionBy = req.session.user.id; a.reason = reason;
  a.history ||= []; a.history.push({ from: 'system', author: req.session.user.username, content: `${accepted ? 'Contestation acceptée' : 'Contestation refusée'} : ${reason}`, at: Date.now() });
  saveState();
  const ch = await client.channels.fetch(req.params.channelId).catch(() => null);
  if (ch?.isTextBased()) await ch.send({ embeds: [stormEmbed(title, `Décision depuis le panel web par **${req.session.user.username}**.\n\n${reason}`)] }).catch(() => {});
  res.json({ ok: true });
}));

app.post('/api/admin/announcements', requireStaff, asyncRoute(async (req, res) => {
  const channelId = CHANNELS.announcements;
  const title = cleanText(req.body.title, 200);
  const message = cleanText(req.body.message, 3500);
  const image = cleanText(req.body.image, 1000);
  const pingEveryone = Boolean(req.body.pingEveryone);
  if (!channelId || !title || !message) return res.status(400).json({ error: 'Salon, titre et message obligatoires.' });
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch?.isTextBased() || ch.guildId !== GUILD_ID) return res.status(404).json({ error: 'Salon Discord introuvable.' });
  const embed = stormEmbed(`📢 ${title}`, message); if (image) embed.setImage(image);
  const sent = await ch.send({ content: pingEveryone ? '@everyone' : undefined, embeds: [embed], allowedMentions: pingEveryone ? { parse: ['everyone'] } : { parse: [] } });
  state.announcements.unshift({ id: sent.id, channelId, title, message, image, author: req.session.user.username, authorId: req.session.user.id, createdAt: Date.now() });
  state.announcements = state.announcements.slice(0, 100); saveState();
  res.json({ ok: true, id: sent.id });
}));

app.get('/api/admin/announcements', requireStaff, (req, res) => res.json(state.announcements));

app.post('/api/admin/giveaways', requireStaff, asyncRoute(async (req, res) => {
  const channelId = CHANNELS.giveaways;
  const duration = parseDuration(cleanText(req.body.duration, 20));
  const prize = cleanText(req.body.prize, 500);
  const winners = Number(req.body.winners || 1);
  if (!Number.isInteger(winners) || winners < 1 || winners > 10) return res.status(400).json({ error: 'Choisis entre 1 et 10 gagnants.' });
  if (!channelId || !duration || !prize) return res.status(400).json({ error: 'Salon, durée valide et lot obligatoires.' });
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch?.isTextBased() || ch.guildId !== GUILD_ID) return res.status(404).json({ error: 'Salon introuvable.' });
  const endAt = Date.now() + duration;
  const embed = stormEmbed('🎁 STORM GIVEAWAY', `**Lot :** ${prize}\n**Gagnant(s) :** ${winners}\n**Fin :** <t:${Math.floor(endAt/1000)}:R>\n\nRéagis avec 🎉 pour participer !`);
  const msg = await ch.send({ content: `<@&${NOTIFY_ROLES.giveaways}>`, embeds: [embed], allowedMentions: { parse: [], roles: [NOTIFY_ROLES.giveaways] } }); await msg.react('🎉');
  state.giveaways[msg.id] = { channelId, guildId: GUILD_ID, prize, winners, endAt, ended: false, createdBy: req.session.user.id }; saveState();
  res.json({ ok: true, id: msg.id });
}));

app.get('/api/admin/giveaways', requireStaff, (req, res) => res.json(Object.entries(state.giveaways).map(([id,g]) => ({ id, ...g })).sort((a,b)=>(b.endAt||0)-(a.endAt||0))));
app.post('/api/admin/giveaways/:id/reroll', requireStaff, asyncRoute(async (req, res) => { const r = await endGiveaway(req.params.id, true); res.status(r.ok ? 200 : 400).json(r); }));

app.post('/api/admin/streams', requireStaff, asyncRoute(async (req, res) => {
  const channelId = cleanText(req.body.channelId, 30);
  const streamer = cleanText(req.body.streamer, 200);
  const url = cleanText(req.body.url, 1000);
  const message = cleanText(req.body.message || 'Le live vient de commencer. Rejoins-le maintenant !', 2000);
  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch?.isTextBased() || ch.guildId !== GUILD_ID || !streamer || !url) return res.status(400).json({ error: 'Salon, streamer et URL obligatoires.' });
  await ch.send({ content: '@everyone', embeds: [stormEmbed('🔴 STREAM EN DIRECT', `**${streamer}** est en live !\n\n${message}\n\n🔗 ${url}`)], allowedMentions: { parse: ['everyone'] } });
  res.json({ ok: true });
}));

app.use('/api', (err, req, res, next) => {
  console.error('[STORM API]', err.message);
  if (!res.headersSent) res.status(502).json({ error: 'Action impossible. Vérifie les permissions du bot et la disponibilité Discord.' });
});

app.get('/health', (req, res) => res.json({ ok: true, botReady: client.isReady(), time: Date.now() }));

app.listen(PORT, '0.0.0.0', () => console.log(`[STORM WEB] Site lancé sur le port ${PORT} • ${PUBLIC_URL}`));


client.login(TOKEN);
