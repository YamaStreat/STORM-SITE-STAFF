const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s || '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let current = null;
let dossiers = [];
let lastSelectedId = null;
let permissions = [];
let panelInfo = {};
let accessData = null;
let roleUpdates = {};
let editedRoleId = null;
const actionLabels = { ban: 'Bannir', unban: 'Débannir', kick: 'Expulser', timeout: 'Mute temporaire', untimeout: 'Retirer le mute', warn: 'Avertir' };
const tabPermissions = { tickets: 'tickets', annonces: 'announcements', giveaways: 'giveaways', streams: 'streams', settings: 'settings', patchNotes: 'patchNotes', access: 'access' };
const can = p => permissions.includes(p);
const canModerate = () => ['ban', 'unban', 'kick', 'timeout', 'warn'].some(can);

const tabTitles = { dashboard:'Dashboard', tickets:'Tickets & contestations', annonces:'Annonces', giveaways:'Giveaways', streams:'Streams', settings:'Serveur FiveM', moderation:'Modération', patchNotes:'Patch notes', access:'Rôles & permissions' };

function notice(msg, bad = false) {
  $('#globalNotice').innerHTML = `<div class="notice-v2 ${bad ? 'error' : ''}"><span>${bad ? '!' : '✓'}</span>${esc(msg)}</div>`;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => { $('#globalNotice').innerHTML = ''; }, 3500);
}

async function api(url, opt = {}) {
  const headers = { ...(opt.body ? {'Content-Type':'application/json'} : {}), ...(opt.headers || {}) };
  const r = await fetch(url, { ...opt, headers, cache:'no-store' });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { location.href = '/staff'; throw new Error('auth'); }
  if (!r.ok) throw new Error(d.error || 'Erreur serveur');
  return d;
}

function activateTab(tab) {
  if ((tabPermissions[tab] && !can(tabPermissions[tab])) || (tab === 'moderation' && !canModerate())) return notice('Tu ne disposes pas de cette permission.', true);
  $$('.admin-menu button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $$('.admin-panel').forEach((p) => p.classList.toggle('active', p.id === tab));
  $('#pageTitle').textContent = tabTitles[tab] || 'STØRM SYSTEM';
  if (tab === 'tickets') loadDossiers().catch(e => notice(e.message, true));
  if (tab === 'giveaways') loadGiveaways().catch(e => notice(e.message, true));
  if (tab === 'access') loadAccess().catch(e => notice(e.message, true));
  if (tab === 'patchNotes') loadPatches().catch(e => notice(e.message, true));
  if (tab === 'moderation') loadModeration().catch(e => notice(e.message, true));
}

$$('.admin-menu button').forEach((b) => b.addEventListener('click', () => activateTab(b.dataset.tab)));
$$('[data-jump]').forEach((b) => b.addEventListener('click', () => activateTab(b.dataset.jump)));

async function boot() {
  const me = await api('/api/me');
  if (!me.user) { location.href = '/staff'; return; }
  if (!me.user.isStaff) { notice('Ton compte ne dispose pas d’un rôle autorisé. Contacte le propriétaire du serveur.', true); return; }
  $('#username').textContent = me.user.username;
  $('#welcomeName').textContent = me.user.username;
  $('#avatar').src = me.user.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
  await refreshPanel();
}

async function summary() {
  const d = await api('/api/admin/summary');
  $('#sTickets').textContent = d.openTickets;
  $('#sAppeals').textContent = d.openAppeals;
  $('#sGiveaways').textContent = d.activeGiveaways;
  $('#sAnnouncements').textContent = d.announcements;
  $('#menuTicketCount').textContent = d.openTickets + d.openAppeals;
  $('#developmentMode').checked = d.development;
  $('#dashboardSync').textContent = 'Actualisé à ' + new Date().toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
  $('#panelConnection').textContent = d.botReady ? 'Discord connecté' : 'Discord en attente';
  $('#panelConnection').classList.toggle('connected', Boolean(d.botReady));
  $('.welcome-badge small').textContent = d.botReady ? 'Discord connecté' : 'Connexion Discord en attente';
  $('.system-mini small').textContent = d.botReady ? 'Bot connecté' : 'Bot en attente';
  $('.system-mini').classList.toggle('pending', !d.botReady);
  $('.server-card p').textContent = d.development ? 'Le serveur est en cours de développement. Le site affiche ce statut aux joueurs.' : 'Le statut public suit la disponibilité FiveM lorsque son URL est configurée.';
  const badge = $('#dashboardServerBadge');
  badge.textContent = d.development ? 'DÉVELOPPEMENT' : 'STATUT AUTOMATIQUE';
  badge.classList.toggle('active', !d.development);
}

async function channels() {
  const rows = await api('/api/admin/channels');
  $$('.discord-channels').forEach((sel) => {
    const previous = sel.value;
    sel.innerHTML = rows.map((c) => `<option value="${c.id}"># ${esc(c.name)}</option>`).join('');
    if (previous && rows.some((c) => c.id === previous)) sel.value = previous;
  });
}

function dossierMatches(d) {
  const q = ($('#ticketSearch')?.value || '').trim().toLowerCase();
  const f = $('#ticketFilter')?.value || 'all';
  if (q && !`${d.id} ${d.type} ${d.userId} ${d.status}`.toLowerCase().includes(q)) return false;
  if (f === 'open' && !['open','waiting_info'].includes(d.status)) return false;
  if (f === 'closed' && ['open','waiting_info'].includes(d.status)) return false;
  if (f === 'appeal' && d.kind !== 'appeal') return false;
  if (f === 'ticket' && d.kind !== 'ticket') return false;
  return true;
}

function statusLabel(s) {
  return ({open:'OUVERT',waiting_info:'EN ATTENTE',closed:'CLOTURÉ',accepted:'ACCEPTÉ',refused:'REFUSÉ'})[s] || String(s || '—').toUpperCase();
}

function renderDossierList() {
  const list = dossiers.filter(dossierMatches);
  const box = $('#dossierList');
  box.innerHTML = list.length ? list.map((d) => {
    const icon = d.kind === 'appeal' ? '⌁' : '✉';
    const date = new Date(d.createdAt || Date.now()).toLocaleDateString('fr-FR', {day:'2-digit',month:'2-digit'});
    return `<button class="dossier-item-v2 ${current?.channelId === d.channelId ? 'active' : ''}" data-id="${d.channelId}">
      <span class="dossier-icon">${icon}</span>
      <span class="dossier-copy"><b>${esc(d.id)}</b><small>${esc(d.type || 'ban_appeal')} • Discord ${esc(d.userId)}</small></span>
      <span class="dossier-side"><i class="status-chip ${esc(d.status)}">${esc(statusLabel(d.status))}</i><small>${date}</small></span>
    </button>`;
  }).join('') : `<div class="empty-list"><span>⌕</span><b>Aucun dossier</b><small>Aucun résultat pour ce filtre.</small></div>`;
  $$('.dossier-item-v2[data-id]').forEach((x) => x.addEventListener('click', () => selectDossier(x.dataset.id)));
}

async function loadDossiers() {
  if (!can('tickets')) return;
  dossiers = await api('/api/admin/dossiers');
  renderDossierList();
  if (lastSelectedId && dossiers.some((d) => d.channelId === lastSelectedId) && current) {
    const fresh = await api('/api/admin/dossiers/' + lastSelectedId).catch(() => null);
    if (fresh) { current = fresh; renderConversation(); }
  }
}

async function selectDossier(id) {
  lastSelectedId = id;
  current = await api('/api/admin/dossiers/' + id);
  renderConversation();
  renderDossierList();
}

function messageHtml(m) {
  const cls = m.from === 'staff' ? 'staff' : m.from === 'system' || m.from === 'bot' ? 'system' : 'user';
  const time = new Date(m.at || Date.now()).toLocaleString('fr-FR', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  return `<div class="chat-row ${cls}">
    <div class="chat-avatar">${cls === 'staff' ? 'S' : cls === 'system' ? '⚡' : 'U'}</div>
    <div class="chat-bubble"><div class="chat-meta"><b>${esc(m.author || (cls === 'staff' ? 'Staff' : 'Joueur'))}</b><span>${time}${m.source === 'web' ? ' • WEB' : ''}</span></div><div class="chat-text">${esc(m.content).replace(/\n/g,'<br>')}</div></div>
  </div>`;
}

function renderConversation() {
  if (!current) return;
  $('#convType').textContent = current.kind === 'appeal' ? 'CONTESTATION DE BAN' : 'TICKET SUPPORT';
  $('#convTitle').textContent = current.id;
  $('#convMeta').textContent = `Discord ${current.userId} • ${statusLabel(current.status)}`;
  const h = current.history || [];
  $('#messages').innerHTML = h.length ? h.map(messageHtml).join('') : `<div class="empty-state"><span>✉</span><b>Historique vide</b><p>Aucun message enregistré.</p></div>`;
  $('#messages').scrollTop = $('#messages').scrollHeight;
  const open = current.kind === 'ticket' ? current.status === 'open' : ['open','waiting_info'].includes(current.status);
  $('#sendReply').disabled = !open;
  $('#closeTicket').disabled = !open;
  $('#replyText').disabled = !open;
  $('#acceptAppeal').style.display = current.kind === 'appeal' && open ? 'inline-flex' : 'none';
  $('#refuseAppeal').style.display = current.kind === 'appeal' && open ? 'inline-flex' : 'none';
}

$('#ticketSearch')?.addEventListener('input', renderDossierList);
$('#ticketFilter')?.addEventListener('change', renderDossierList);
$('#refreshTickets').onclick = async () => { await loadDossiers(); notice('Tickets actualisés'); };

$('#sendReply').onclick = async () => {
  const text = $('#replyText').value.trim();
  if (!current || !text) return;
  const btn = $('#sendReply');
  btn.disabled = true;
  btn.textContent = 'Envoi...';
  try {
    await api(`/api/admin/dossiers/${current.channelId}/reply`, { method:'POST', body:JSON.stringify({message:text}) });
    $('#replyText').value = '';
    await selectDossier(current.channelId);
    notice('Message envoyé en DM ✓');
  } catch (e) { notice(e.message, true); }
  finally { btn.textContent = 'Envoyer ➤'; btn.disabled = false; }
};

$('#replyText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#sendReply').click(); }
});

$('#closeTicket').onclick = async () => {
  if (!current || !confirm(`Clôturer le dossier ${current.id} ?`)) return;
  try {
    await api(`/api/admin/dossiers/${current.channelId}/close`, { method:'POST', body:'{}' });
    await selectDossier(current.channelId); await summary(); notice('Dossier clôturé');
  } catch (e) { notice(e.message, true); }
};

async function decision(action) {
  if (!current) return;
  const reason = prompt(action === 'accept' ? "Message d'acceptation envoyé au joueur :" : 'Motif du refus envoyé au joueur :');
  if (!reason) return;
  try {
    await api(`/api/admin/appeals/${current.channelId}/decision`, { method:'POST', body:JSON.stringify({action,reason}) });
    await selectDossier(current.channelId); await summary(); notice('Décision envoyée au joueur');
  } catch (e) { notice(e.message, true); }
}
$('#acceptAppeal').onclick = () => decision('accept');
$('#refuseAppeal').onclick = () => decision('refuse');

function updateAnnouncementPreview() {
  $('#annPreviewTitle').textContent = $('#annTitle').value.trim() || 'Titre de ton annonce';
  $('#annPreviewMessage').innerHTML = esc($('#annMessage').value.trim() || 'Le contenu de ton annonce apparaîtra ici.').replace(/\n/g,'<br>');
  const url = $('#annImage').value.trim();
  $('#annPreviewImage').innerHTML = url ? `<img class="news-image preview-img" src="${esc(url)}" alt="Aperçu">` : '';
}
['annTitle','annMessage','annImage'].forEach((id) => $('#' + id).addEventListener('input', updateAnnouncementPreview));

$('#publishAnnouncement').onclick = async () => {
  try {
    await api('/api/admin/announcements', { method:'POST', body:JSON.stringify({ title:$('#annTitle').value, message:$('#annMessage').value, image:$('#annImage').value, pingEveryone:$('#annEveryone').checked }) });
    notice('Annonce publiée sur Discord et le site ✓');
    $('#annTitle').value = ''; $('#annMessage').value = ''; $('#annImage').value = ''; $('#annEveryone').checked = false; updateAnnouncementPreview(); await summary();
  } catch (e) { notice(e.message, true); }
};

async function loadGiveaways() {
  if (!can('giveaways')) return;
  const rows = await api('/api/admin/giveaways');
  $('#giveList').innerHTML = rows.length ? rows.map((g) => `<tr><td><b>${esc(g.prize)}</b></td><td>${new Date(g.endAt).toLocaleString('fr-FR')}</td><td><span class="status-chip ${g.ended ? 'closed' : 'open'}">${g.ended ? 'TERMINÉ' : 'ACTIF'}</span></td><td>${g.ended ? `<button class="btn btn-outline compact" data-reroll="${g.id}">Reroll</button>` : '<span class="muted">—</span>'}</td></tr>`).join('') : '<tr><td colspan="4"><div class="table-empty">Aucun giveaway.</div></td></tr>';
  $$('[data-reroll]').forEach((b) => b.onclick = async () => {
    try { await api('/api/admin/giveaways/' + b.dataset.reroll + '/reroll', {method:'POST',body:'{}'}); notice('Reroll effectué'); }
    catch (e) { notice(e.message, true); }
  });
}

$('#createGiveaway').onclick = async () => {
  try {
    await api('/api/admin/giveaways', { method:'POST', body:JSON.stringify({ prize:$('#givePrize').value, duration:$('#giveDuration').value, winners:$('#giveWinners').value }) });
    notice('Giveaway lancé ✓'); $('#givePrize').value = ''; $('#giveDuration').value = ''; await loadGiveaways(); await summary();
  } catch (e) { notice(e.message, true); }
};

$('#publishStream').onclick = async () => {
  try {
    await api('/api/admin/streams', { method:'POST', body:JSON.stringify({ channelId:$('#streamChannel').value, streamer:$('#streamer').value, url:$('#streamUrl').value, message:$('#streamMessage').value }) });
    notice('Annonce stream publiée ✓');
  } catch (e) { notice(e.message, true); }
};

$('#saveStatus').onclick = async () => {
  try { await api('/api/admin/site-status', { method:'POST', body:JSON.stringify({development:$('#developmentMode').checked}) }); await summary(); notice('Statut public et message Discord actualisés'); }
  catch (e) { notice(e.message, true); }
};

$('#manualRefresh').onclick = async () => { try { await refreshPanel(); notice('Panel actualisé'); } catch (e) { notice(e.message, true); } };
$('#logout').onclick = async () => { await fetch('/auth/logout', {method:'POST'}); location.href = '/'; };

setInterval(() => {
  summary().catch(() => {});
  if ($('#tickets').classList.contains('active')) loadDossiers().catch(() => {});
}, 10000);

boot().catch((e) => notice(e.message, true));

async function refreshPanel() {
  panelInfo = await api('/api/admin/panel');
  permissions = panelInfo.permissions;
  $$('.admin-menu [data-tab], [data-jump]').forEach(button => {
    const tab = button.dataset.tab || button.dataset.jump;
    button.hidden = tab === 'moderation' ? !canModerate() : Boolean(tabPermissions[tab] && !can(tabPermissions[tab]));
    button.title = tabTitles[tab] || tab;
    button.setAttribute('aria-label', tabTitles[tab] || tab);
  });
  const selected = $('.admin-panel.active')?.id;
  if ((tabPermissions[selected] && !can(tabPermissions[selected])) || (selected === 'moderation' && !canModerate())) activateTab('dashboard');
  $('#modAction').innerHTML = Object.entries(actionLabels).filter(([key]) => can(key === 'untimeout' ? 'timeout' : key)).map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
  updateDuration();
  $('#patchVersion').textContent = panelInfo.nextVersion;
  updatePatchPreview();
  await Promise.all([summary(), can('streams') ? channels() : null, loadDossiers(), loadGiveaways(), loadDashboardActivity()]);
}
function updateDuration() { $('#durationField').hidden = $('#modAction').value !== 'timeout'; }
$('#modAction').onchange = updateDuration;
async function loadModeration() {
  const rows = await api('/api/admin/moderation');
  $('#moderationHistory').innerHTML = rows.length ? rows.map(row => `<tr><td>${esc(new Date(row.createdAt).toLocaleString('fr-FR'))}</td><td>${esc(row.userId)}</td><td>${esc(actionLabels[row.action])}${row.minutes ? ` · ${row.minutes} min` : ''}</td><td>${esc(row.reason)}</td><td>${esc(row.staff)}</td></tr>`).join('') : '<tr><td colspan="5">Aucune action enregistrée.</td></tr>';
}
$('#moderationForm').onsubmit = async event => {
  event.preventDefault();
  const action = $('#modAction').value;
  const userId = $('#modUser').value.trim();
  if (!confirm(`${actionLabels[action]} le membre ${userId} ?\n\nMotif : ${$('#modReason').value.trim()}`)) return;
  const button = event.submitter; button.disabled = true;
  try {
    await api('/api/admin/moderation', { method: 'POST', body: JSON.stringify({ action, userId, reason: $('#modReason').value, minutes: $('#modMinutes').value }) });
    notice('Action effectuée et enregistrée.'); $('#modReason').value = ''; await loadModeration();
  } catch (e) { notice(e.message, true); } finally { button.disabled = false; }
};
const patchFields = { additions: 'patchAdditions', changes: 'patchChanges', fixes: 'patchFixes', optimizations: 'patchOptimizations' };
const patchTitles = { additions: ':new:・AJOUTS', changes: ':arrows_counterclockwise:・MODIFICATIONS', fixes: ':bug:・CORRECTIONS', optimizations: ':gear:・OPTIMISATIONS' };
function patchSections() { return Object.fromEntries(Object.entries(patchFields).map(([key, id]) => [key, $('#' + id).value])); }
function updatePatchPreview() {
  const date = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
  const blocks = Object.entries(patchSections()).map(([key, value]) => {
    const lines = value.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    return lines.length ? `### ${patchTitles[key]}\n${lines.map(x => `> ➜ ${x}`).join('\n')}` : '';
  }).filter(Boolean);
  const content = `<@&1568307263695749201>\n\n# :clipboard:・PATCH NOTE — STØRM PVP\n\n:date: **Date :** \`${date}\`  \n:label: **Version :** \`${panelInfo.nextVersion || 'v1.0.0'}\`\n\n${blocks.join('\n\n')}\n\n**STØRM PVP ・ Development Team**`;
  $('#patchPreview').textContent = content;
  $('#patchLength').textContent = `${content.length} / 2 000 caractères · version +0.0.1 à chaque publication`;
}
Object.values(patchFields).forEach(id => $('#' + id).addEventListener('input', updatePatchPreview));
async function loadPatches() {
  const [info, rows] = await Promise.all([api('/api/admin/panel'), api('/api/admin/patch-notes')]);
  panelInfo = info; $('#patchVersion').textContent = info.nextVersion; updatePatchPreview();
  $('#patchHistory').innerHTML = rows.slice(0, 5).map(row => `<article class="admin-card"><span class="version-tag">${esc(row.version)}</span><p class="muted">${esc(new Date(row.createdAt).toLocaleString('fr-FR'))} · ${esc(row.author)}</p></article>`).join('');
}
$('#patchForm').onsubmit = async event => {
  event.preventDefault();
  if (!confirm(`Publier ${panelInfo.nextVersion} sur Discord et le site ?`)) return;
  const button = event.submitter; button.disabled = true;
  try {
    const result = await api('/api/admin/patch-notes', { method: 'POST', body: JSON.stringify({ expectedVersion: panelInfo.nextVersion, sections: patchSections() }) });
    Object.values(patchFields).forEach(id => $('#' + id).value = '');
    notice(`Patch note ${result.version} publié.`); await loadPatches();
  } catch (e) { notice(e.message, true); if (e.message.includes('version')) await loadPatches(); } finally { button.disabled = false; }
};
$('#publishDevelopment').onclick = async () => {
  if (!confirm('Publier ou actualiser le message de statut Discord avec le statut actuellement enregistré ?')) return;
  const button = $('#publishDevelopment'); button.disabled = true;
  try { await api('/api/admin/development-message', { method: 'POST', body: '{}' }); notice('Message de statut Discord actualisé.'); }
  catch (e) { notice(e.message, true); } finally { button.disabled = false; }
};
async function loadAccess() {
  if (accessData && Object.keys(roleUpdates).length) { renderAccess(); return; }
  accessData = await api('/api/admin/access'); roleUpdates = {}; renderAccess();
}
function renderAccess() {
  $('#accessRole').innerHTML = accessData.roles.filter(role => !Object.hasOwn(accessData.panelRoles, role.id)).map(role => `<option value="${role.id}">${esc(role.name)}</option>`).join('');
  const configuredIds = Object.keys(accessData.panelRoles);
  if (!configuredIds.includes(editedRoleId)) editedRoleId = configuredIds[0] || null;
  $('#configuredRole').innerHTML = configuredIds.map(id => `<option value="${esc(id)}">${esc(accessData.roles.find(role => role.id === id)?.name || 'Rôle supprimé')} · ${esc(id)}</option>`).join('');
  $('#configuredRole').value = editedRoleId || '';
  $('#accessMatrix').innerHTML = Object.entries(accessData.panelRoles).filter(([id]) => id === editedRoleId).map(([id, selected]) => {
    const role = accessData.roles.find(role => role.id === id);
    return `<article class="role-card" data-editing-role="${esc(id)}"><div class="role-heading"><b>${esc(role?.name || 'Rôle supprimé')} <small>${esc(id)}</small></b><div class="action-row"><button class="btn btn-primary compact" data-save-role="${esc(id)}">Enregistrer ce rôle</button><button class="btn btn-danger compact" data-remove-role="${esc(id)}">Retirer ce rôle</button></div></div><div class="permission-grid">${Object.entries(accessData.permissionLabels).map(([key, label]) => `<label><input type="checkbox" data-role="${esc(id)}" data-permission="${key}" ${selected.includes(key) ? 'checked' : ''}> ${esc(label)}</label>`).join('')}</div></article>`;
  }).join('') || '<p class="muted">Aucun rôle autorisé. Seul le propriétaire a accès au panel.</p>';
  $$('[data-permission]').forEach(input => input.onchange = () => {
    const id = input.closest('[data-editing-role]').dataset.editingRole;
    const selected = accessData.panelRoles[id];
    const updated = input.checked ? [...new Set([...selected, input.dataset.permission])] : selected.filter(x => x !== input.dataset.permission);
    accessData.panelRoles[id] = [...updated];
    roleUpdates[id] = [...updated];
  });
  $$('[data-save-role]').forEach(button => button.onclick = () => saveOneRole(button.dataset.saveRole, false, button));
  $$('[data-remove-role]').forEach(button => button.onclick = () => saveOneRole(button.dataset.removeRole, true, button));
}
$('#addAccessRole').onclick = () => { const id = $('#accessRole').value; if (id) { accessData.panelRoles[id] = []; roleUpdates[id] = []; editedRoleId = id; renderAccess(); } };
$('#configuredRole').onchange = event => { editedRoleId = event.target.value; renderAccess(); };
async function saveOneRole(id, remove, button) {
  const role = accessData.roles.find(role => role.id === id);
  const name = role?.name || id;
  if (!confirm(`${remove ? 'Retirer uniquement' : 'Enregistrer uniquement'} le rôle « ${name} » (${id}) ? Les autres rôles resteront inchangés.`)) return;
  const card = button.closest('.role-card');
  card.querySelectorAll('input,button').forEach(element => element.disabled = true);
  try {
    await api('/api/admin/access/' + encodeURIComponent(id), { method: 'POST', body: JSON.stringify(remove ? {remove: true} : {permissions: [...accessData.panelRoles[id]]}) });
    delete roleUpdates[id];
    if (remove) delete accessData.panelRoles[id];
    notice(`Rôle « ${name} » ${remove ? 'retiré' : 'enregistré'}. Les autres rôles sont inchangés.`);
    renderAccess();
    await refreshPanel();
  } catch (e) { notice(e.message, true); }
  finally { card.querySelectorAll('input,button').forEach(element => element.disabled = false); }
}

// Keep repeated clicks from publishing the same announcement or giveaway twice.
['publishAnnouncement', 'createGiveaway', 'publishStream', 'saveStatus', 'manualRefresh'].forEach(id => {
  const button = $('#' + id);
  const action = button.onclick;
  button.onclick = async event => {
    if (button.disabled) return;
    button.disabled = true;
    try { await action(event); } catch (e) { notice(e.message, true); }
    finally { button.disabled = false; }
  };
});

async function loadDashboardActivity() {
  const sources = [];
  if (can('announcements')) sources.push(api('/api/admin/announcements').then(rows => (rows || []).map(row => ({...row, kind:'Annonce', tab:'annonces'}))));
  if (can('patchNotes')) sources.push(api('/api/admin/patch-notes').then(rows => (rows || []).map(row => ({...row, title:row.version, kind:'Patch note', tab:'patchNotes'}))));
  const results = await Promise.allSettled(sources);
  const failed = results.some(result => result.status === 'rejected');
  const rows = results.filter(result => result.status === 'fulfilled').flatMap(result => result.value).sort((a,b) => b.createdAt - a.createdAt).slice(0,5);
  const box = $('#dashboardActivity');
  if (!rows.length) { box.innerHTML = `<div class="activity-empty"><span>◌</span><p>${failed ? 'Les publications sont temporairement indisponibles.' : sources.length ? 'Les prochaines publications de l’équipe apparaîtront ici.' : 'Les publications ne sont pas accessibles avec tes permissions actuelles.'}</p></div>`; return; }
  box.innerHTML = rows.map(row => `<button class="activity-item" data-activity-tab="${row.tab}"><span class="activity-icon">${row.tab === 'patchNotes' ? '≡' : '◉'}</span><span class="activity-copy"><small>${row.kind}</small><b>${esc(row.title)}</b><span>${esc(row.author || 'Équipe STØRM')}</span></span><time>${esc(new Date(row.createdAt).toLocaleDateString('fr-FR', {timeZone:'Europe/Paris',day:'2-digit',month:'short'}))}</time><span aria-hidden="true">↗</span></button>`).join('');
  if (failed) box.insertAdjacentHTML('beforeend', '<p class="muted">Certaines publications n’ont pas pu être chargées.</p>');
  box.querySelectorAll('[data-activity-tab]').forEach(button => button.onclick = () => activateTab(button.dataset.activityTab));
}
