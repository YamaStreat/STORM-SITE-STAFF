const $ = (s) => document.querySelector(s);
const esc = (s) => String(s || '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function setDiscordLinks(url) {
  ['#discordTop','#discordMain','#discordModal','#discordBottom'].forEach((id) => {
    const a = $(id);
    if (!a) return;
    a.href = url || '#';
    a.target = '_blank';
    a.rel = 'noopener';
  });
}

function setServerStatus(server) {
  const st = $('#serverStatus');
  if (!st) return;
  st.classList.remove('online','offline','development');
  const label = st.querySelector('strong');
  if (server?.mode === 'development') {
    st.classList.add('development');
    label.textContent = 'EN COURS DE DÉVELOPPEMENT';
    st.onclick = () => $('#devModal')?.classList.add('open');
  } else if (server?.online) {
    st.classList.add('online');
    label.textContent = 'SERVEUR EN LIGNE';
    st.onclick = null;
  } else {
    st.classList.add('offline');
    label.textContent = 'SERVEUR HORS LIGNE';
    st.onclick = null;
  }
}

function renderAnnouncements(list = []) {
  const box = $('#announcements');
  if (!box) return;
  if (!list.length) {
    box.innerHTML = `<article class="news-card news-placeholder"><div class="news-index">00</div><div><span class="news-date">STØRM FEED</span><h3>Aucune annonce publiée</h3><p>Les prochaines actualités du serveur apparaîtront ici.</p></div></article>`;
    return;
  }
  box.innerHTML = list.map((a, i) => {
    const n = String(i + 1).padStart(2, '0');
    const date = new Date(a.createdAt).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }).toUpperCase();
    return `<article class="news-card">
      <div class="news-index">${n}</div>
      <div class="news-content">
        <span class="news-date">${esc(date)} • ${esc(a.author || 'STAFF')}</span>
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.message).replace(/\n/g,'<br>')}</p>
        ${a.image ? `<img class="news-image" src="${esc(a.image)}" alt="Illustration de l'annonce" loading="lazy">` : ''}
      </div>
    </article>`;
  }).join('');
}

async function loadPublic() {
  try {
    const r = await fetch('/api/public', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    document.querySelector('#publicDevelopment').hidden = data.server?.mode !== 'development';
    renderPatchNotes(data.patchNotes);
    document.querySelector('#feedError')?.remove();
    setDiscordLinks(data.discordInvite);
    setServerStatus(data.server);
    renderAnnouncements(data.announcements);
  } catch (err) {
    console.error('[STORM SITE]', err);
    $('#serverStatus strong').textContent = 'STATUT INDISPONIBLE';
    if (!$('#feedError')) {
      const error = document.createElement('p'); error.id = 'feedError'; error.className = 'feed-error'; error.setAttribute('role', 'status');
      error.textContent = 'Les dernières informations sont temporairement indisponibles. Une nouvelle tentative aura lieu automatiquement.';
      $('#announcements').before(error);
    }
  }
}

function closeDevModal() { $('#devModal')?.classList.remove('open'); }
$('#closeModal')?.addEventListener('click', closeDevModal);
$('#closeModalSecondary')?.addEventListener('click', closeDevModal);
$('#devModal')?.addEventListener('click', (e) => { if (e.target.id === 'devModal') closeDevModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDevModal(); });

loadPublic();
setInterval(loadPublic, 30000);

function renderPatchNotes(rows = []) {
  const labels = { additions: '🆕 AJOUTS', changes: '🔄 MODIFICATIONS', fixes: '🐛 CORRECTIONS', optimizations: '⚙️ OPTIMISATIONS' };
  $('#publicPatchNotes').innerHTML = rows.length ? rows.map(row => `<article class="patch-release"><header class="release-heading"><span class="version-tag">${esc(row.version)}</span><h3>STØRM PVP évolue</h3><time datetime="${esc(new Date(row.createdAt).toISOString())}">${esc(new Date(row.createdAt).toLocaleDateString('fr-FR', {timeZone: 'Europe/Paris'}))}</time></header><div class="release-sections">${Object.entries(labels).filter(([key]) => row.sections?.[key]?.length).map(([key, label]) => `<section><h4>${label}</h4><ul>${row.sections[key].map(line => `<li>${esc(line)}</li>`).join('')}</ul></section>`).join('')}</div></article>`).join('') : '<article class="admin-card"><span class="section-kicker">BIENTÔT</span><h3>Le début d’une nouvelle aventure.</h3><p class="muted">Les premiers patch notes seront publiés ici. Rejoins notre Discord pour suivre les avancées.</p></article>';
}
