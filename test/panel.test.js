const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { installPanel, permissionsFor, nextVersion, patchContent, PERMISSIONS, CHANNELS } = require('../src/panel');
const { ChannelType } = require('discord.js');
const ID = { guild: '111111111111111111', owner: '222222222222222222', staff: '333333333333333333', role: '444444444444444444', target: '555555555555555555', bot: '666666666666666666' };

function fixture() {
  const config = { panelRoles: { [ID.role]: Object.keys(PERMISSIONS) } };
  const state = { siteConfig: { development: true } };
  const calls = []; let writes = 0;
  const highest = position => ({ position, comparePositionTo: other => position - other.position });
  const member = (id, pos) => ({ id, roles: { cache: new Map([[ID.role, {}]]), highest: highest(pos) }, permissions: { has: () => true } });
  const actor = member(ID.staff, 10), bot = member(ID.bot, 20), target = member(ID.target, 1);
  Object.assign(target, { bannable: true, kickable: true, moderatable: true, ban: async opts => calls.push(['ban', opts]), kick: async reason => calls.push(['kick', reason]), timeout: async (duration, reason) => calls.push(['timeout', duration, reason]), send: async payload => calls.push(['dm', payload]) });
  const messages = new Map();
  const guild = { ownerId: ID.owner, members: { fetch: async ({user}) => user === ID.target ? target : user === ID.owner ? member(ID.owner, 30) : actor, fetchMe: async () => bot, unban: async id => calls.push(['unban', id]) }, bans: { fetch: async () => ({}) }, roles: { fetch: async () => new Map([[ID.role, { id: ID.role, name: 'Staff', position: 10, managed: false }]]) }, channels: { fetch: async id => ({ id, guildId: ID.guild, type: ChannelType.GuildText, messages: { fetch: async id => messages.get(id) }, send: async payload => { calls.push(['send', id, payload]); const msg = { id: `message${messages.size}`, edit: async p => calls.push(['edit', id, p]) }; messages.set(msg.id, msg); return msg; } }) } };
  const client = { user: { id: ID.bot }, guilds: { fetch: async () => guild } };
  const app = express(); app.use(express.json());
  // Test-only session adapter; production uses express-session and Discord OAuth.
  app.use((req, res, next) => { if (req.headers['x-test-user']) req.session = { user: { id: req.headers['x-test-user'], username: 'Test staff' } }; next(); });
  installPanel(app, { client, getConfig: () => config, state, saveConfig: () => writes++, saveState: () => writes++, guildId: ID.guild, publicUrl: 'http://localhost' });
  app.get('/api/admin/dossiers', (req, res) => res.json([]));
  return { app, config, state, calls, actor, bot, target, guild, writes: () => writes };
}
async function withServer(fn) {
  const f = fixture(); const server = f.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, user = ID.staff, origin) => {
    const response = await fetch(url + '/api/admin/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(user ? {'x-test-user': user} : {}), ...(body === undefined ? {} : {'content-type':'application/json'}), ...(origin ? {origin} : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try { await fn(f, request); } finally { await new Promise(resolve => server.close(resolve)); }
}
test('explicit role matrix overrides legacy role, unions permissions, owner cannot be locked out', () => {
  assert.deepEqual(permissionsFor({ staffRoleId:'old', panelRoles: {} }, ['old'], false), []);
  assert.deepEqual(permissionsFor({ panelRoles: {a:['tickets'],b:['tickets','warn']} }, ['a','b'], false), ['tickets','warn']);
  assert.equal(permissionsFor({panelRoles:{}}, [], true).length, Object.keys(PERMISSIONS).length);
  assert.ok(!permissionsFor({staffRoleId:'old'}, ['old'], false).includes('access'));
});
test('patch format preserves blank lines, selected headings and Paris date rollover', () => {
  assert.equal(nextVersion(), 'v1.0.0'); assert.equal(nextVersion('v1.0.9'), 'v1.0.10');
  const content = patchContent('v1.0.0', { additions:['Nouveau contenu'], fixes:['Bug corrigé'] }, new Date('2026-11-06T23:30:00Z'));
  assert.match(content, /`07\/11\/2026`/); assert.match(content, /\n\n### :new:・AJOUTS\n> ➜ Nouveau contenu\n\n### :bug:・CORRECTIONS/);
  assert.ok(!content.includes('MODIFICATIONS')); assert.ok(content.endsWith('\n\n**STØRM PVP ・ Development Team**'));
});
test('HTTP access requires login, verifies live roles and rejects foreign origins', async () => withServer(async (f, request) => {
  assert.equal((await request('panel', undefined, null)).status, 401);
  assert.equal((await request('panel')).status, 200);
  assert.equal((await request('development-message', {}, ID.staff, 'https://foreign.example')).status, 403);
  f.actor.roles.cache.clear();
  assert.equal((await request('panel')).status, 403);
  assert.equal((await request('panel', undefined, ID.owner)).status, 200);
  assert.equal(f.calls.length, 0);
}));
test('existing ticket endpoints also enforce granular permissions', async () => withServer(async (f, request) => {
  f.config.panelRoles[ID.role] = ['warn'];
  assert.equal((await request('dossiers')).status, 403);
  assert.equal((await request('access', {panelRoles:{}})).status, 403);
}));
test('patch publishing validates, routes, serializes version and disables mentions', async () => withServer(async (f, request) => {
  assert.equal((await request('patch-notes', {expectedVersion:'v1.0.0',sections:{}})).status, 400);
  assert.equal((await request('patch-notes', {expectedVersion:'v1.0.0',sections:{fixes:'x'.repeat(2100)}})).status, 400);
  const result = await request('patch-notes', {expectedVersion:'v1.0.0',sections:{additions:'Une nouveauté\n\nAutre ajout',fixes:'Un bug'}});
  assert.equal(result.status, 200); assert.equal(result.body.nextVersion, 'v1.0.1');
  assert.equal(f.calls[0][1], CHANNELS.patchNotes); assert.deepEqual(f.calls[0][2].allowedMentions, {parse:[]});
  assert.deepEqual(f.state.patchNotes[0].sections.additions, ['Une nouveauté','Autre ajout']);
  assert.equal((await request('patch-notes', {expectedVersion:'v1.0.0',sections:{fixes:'Stale'}})).status, 409);
  assert.equal(f.calls.length, 1);
}));
test('development publication updates same message instead of duplicating it', async () => withServer(async (f, request) => {
  assert.equal((await request('development-message', {})).status, 200);
  assert.match(f.calls[0][2].content, /EN COURS DE DÉVELOPPEMENT\n\n/);
  assert.equal(f.calls[0][1], CHANNELS.development);
  f.state.siteConfig.development = false;
  assert.equal((await request('development-message', {})).status, 200);
  assert.equal(f.calls[1][0], 'edit'); assert.ok(!f.calls[1][2].content.includes('EN COURS DE DÉVELOPPEMENT'));
}));
test('moderation blocks invalid duration, protected members, hierarchy and missing native permissions', async () => withServer(async (f, request) => {
  const body = {action:'timeout',userId:ID.target,reason:'Spam',minutes:60};
  assert.equal((await request('moderation', {...body,minutes:40321})).status, 400);
  assert.equal((await request('moderation', {...body,userId:ID.owner})).status, 403);
  f.actor.roles.highest.comparePositionTo = () => 0;
  assert.equal((await request('moderation', body)).status, 403);
  f.actor.roles.highest.comparePositionTo = () => 1;
  f.actor.permissions.has = () => false;
  assert.equal((await request('moderation', body)).status, 403);
  assert.equal(f.calls.length, 0); assert.equal(f.writes(), 0);
}));
test('moderation executes all actions and persists successful audit entries', async () => withServer(async (f, request) => {
  for (const action of ['timeout','untimeout','ban','kick','unban','warn']) {
    assert.equal((await request('moderation', {action,userId:ID.target,reason:'Motif documenté',minutes:5})).status, 200);
  }
  assert.equal(f.calls[0][1], 300000); assert.equal(f.calls[1][1], null);
  assert.equal(f.state.moderation.length, 6); assert.equal(f.writes(), 6);
  f.target.ban = async () => { throw new Error('Discord failure'); };
  assert.equal((await request('moderation', {action:'ban',userId:ID.target,reason:'Test'})).status, 502);
  assert.equal(f.state.moderation.length, 6);
}));
test('access configuration validates role IDs and supports immediate revocation', async () => withServer(async (f, request) => {
  assert.equal((await request('access', {panelRoles:{[ID.role]:['invented']}})).status, 400);
  assert.equal((await request('access', {panelRoles:{[ID.guild]:['access']}})).status, 400);
  assert.equal((await request('access', {panelRoles:{[ID.role]:['tickets']}})).status, 200);
  assert.equal((await request('access')).status, 403);
  assert.equal((await request('access', {panelRoles:{}}, ID.owner)).status, 200);
  assert.equal((await request('panel')).status, 403);
}));
test('saving server status also synchronizes Discord and rejects malformed values', async () => withServer(async (f, request) => {
  assert.equal((await request('site-status', {development:'false'})).status, 400);
  assert.equal((await request('site-status', {development:false})).status, 200);
  assert.equal(f.state.siteConfig.development, false);
  assert.equal(f.calls[0][1], CHANNELS.development);
  assert.match(f.calls[0][2].content, /STATUT DU SERVEUR/);
  assert.equal((await request('site-status', {development:true})).status, 200);
  assert.equal(f.calls[1][0], 'edit');
  assert.match(f.calls[1][2].content, /EN COURS DE DÉVELOPPEMENT/);
}));
test('concurrent patch submissions cannot publish the same version twice', async () => withServer(async (f, request) => {
  const originalFetch = f.guild.channels.fetch;
  let release, entered;
  const started = new Promise(resolve => entered = resolve);
  const pending = new Promise(resolve => release = resolve);
  f.guild.channels.fetch = async id => {
    const channel = await originalFetch(id);
    const send = channel.send;
    channel.send = async payload => { entered(); await pending; return send(payload); };
    return channel;
  };
  const body = {expectedVersion:'v1.0.0',sections:{fixes:'Correction'}};
  const first = request('patch-notes', body);
  await started;
  const second = await request('patch-notes', body);
  release();
  assert.equal(second.status, 409);
  assert.equal((await first).status, 200);
  assert.equal(f.state.patchNotes.length, 1);
}));
