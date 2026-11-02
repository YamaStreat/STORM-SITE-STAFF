const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s || '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let current = null;
let dossiers = [];
let lastSelectedId = null;

const tabTitles = { dashboard:'Dashboard', tickets:'Tickets & contestations', annonces:'Annonces', giveaways:'Giveaways', streams:'Streams', settings:'Serveur FiveM' };

function notice(msg, bad = false) {
  $('#globalNotice').innerHTML = `<div class="notice-v2 ${bad ? 'error' : ''}"><span>${bad ? '!' : '✓'}</span>${esc(msg)}</div>`;
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => { $('#globalNotice').innerHTML = ''; }, 3500);
}

async function api(url, opt = {}) {
  const headers = { ...(opt.body ? {'Content-Type':'application/json'} : {}), ...(opt.headers || {}) };
  const r = await fetch(url, { ...opt, headers, cache:'no-store' });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { location.href = '/auth/discord'; throw new Error('auth'); }
  if (!r.ok) throw new Error(d.error || 'Erreur serveur');
  return d;
}

function activateTab(tab) {
  $$('.admin-menu button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.admin-panel').forEach((p) => p.classList.toggle('active', p.id === tab));
  $('#pageTitle').textContent = tabTitles[tab] || 'STØRM SYSTEM';
  if (tab === 'tickets') loadDossiers();
  if (tab === 'giveaways') loadGiveaways();
}

$$('.admin-menu button').forEach((b) => b.addEventListener('click', () => activateTab(b.dataset.tab)));
$$('[data-jump]').forEach((b) => b.addEventListener('click', () => activateTab(b.dataset.jump)));

async function boot() {
  const me = await api('/api/me');
  if (!me.user?.isStaff) { location.href = '/auth/discord'; return; }
  $('#username').textContent = me.user.username;
  $('#avatar').src = me.user.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
  await Promise.all([summary(), channels(), loadDossiers(), loadGiveaways()]);
}

async function summary() {
  const d = await api('/api/admin/summary');
  $('#sTickets').textContent = d.openTickets;
  $('#sAppeals').textContent = d.openAppeals;
  $('#sGiveaways').textContent = d.activeGiveaways;
  $('#sAnnouncements').textContent = d.announcements;
  $('#menuTicketCount').textContent = d.openTickets + d.openAppeals;
  $('#developmentMode').checked = d.development;
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
    await api('/api/admin/announcements', { method:'POST', body:JSON.stringify({ channelId:$('#annChannel').value, title:$('#annTitle').value, message:$('#annMessage').value, image:$('#annImage').value, pingEveryone:$('#annEveryone').checked }) });
    notice('Annonce publiée sur Discord et le site ✓');
    $('#annTitle').value = ''; $('#annMessage').value = ''; $('#annImage').value = ''; $('#annEveryone').checked = false; updateAnnouncementPreview(); await summary();
  } catch (e) { notice(e.message, true); }
};

async function loadGiveaways() {
  const rows = await api('/api/admin/giveaways');
  $('#giveList').innerHTML = rows.length ? rows.map((g) => `<tr><td><b>${esc(g.prize)}</b></td><td>${new Date(g.endAt).toLocaleString('fr-FR')}</td><td><span class="status-chip ${g.ended ? 'closed' : 'open'}">${g.ended ? 'TERMINÉ' : 'ACTIF'}</span></td><td>${g.ended ? `<button class="btn btn-outline compact" data-reroll="${g.id}">Reroll</button>` : '<span class="muted">—</span>'}</td></tr>`).join('') : '<tr><td colspan="4"><div class="table-empty">Aucun giveaway.</div></td></tr>';
  $$('[data-reroll]').forEach((b) => b.onclick = async () => {
    try { await api('/api/admin/giveaways/' + b.dataset.reroll + '/reroll', {method:'POST',body:'{}'}); notice('Reroll effectué'); }
    catch (e) { notice(e.message, true); }
  });
}

$('#createGiveaway').onclick = async () => {
  try {
    await api('/api/admin/giveaways', { method:'POST', body:JSON.stringify({ channelId:$('#giveChannel').value, prize:$('#givePrize').value, duration:$('#giveDuration').value, winners:$('#giveWinners').value }) });
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
  try { await api('/api/admin/site-status', { method:'POST', body:JSON.stringify({development:$('#developmentMode').checked}) }); await summary(); notice('Statut public enregistré'); }
  catch (e) { notice(e.message, true); }
};

$('#manualRefresh').onclick = async () => { await Promise.all([summary(), loadDossiers(), loadGiveaways()]); notice('Panel actualisé'); };
$('#logout').onclick = async () => { await fetch('/auth/logout', {method:'POST'}); location.href = '/'; };

setInterval(() => {
  summary().catch(() => {});
  if ($('#tickets').classList.contains('active')) loadDossiers().catch(() => {});
}, 10000);

boot().catch((e) => console.error('[STORM ADMIN]', e));
