(() => {
  const root = document.querySelector('[data-recruitment-spotlight]');
  const onApplicationPage = location.pathname.replace(/\/$/, '') === '/candidatures';
  if (!root || (!onApplicationPage && !document.body.classList.contains('public-page'))) return;
  root.hidden = false;
  let signature = '', loading = false;
  const roles = { helper: 'Helpeur', animator: 'Animateur' };
  function render(recruitment) {
    const types = recruitment.types || { helper: recruitment.open, animator: recruitment.open };
    if (Object.keys(roles).some(key => typeof types[key] !== 'boolean')) throw Error('Statuts incomplets');
    const next = JSON.stringify(types);
    if (next === signature) return;
    signature = next;
    const count = Object.keys(roles).filter(key => types[key]).length;
    root.dataset.state = count ? 'open' : 'closed';
    root.innerHTML = `<div class="spotlight-panel"><div class="spotlight-heading"><div><span class="spotlight-eyebrow">${count ? 'L’ÉQUIPE STØRM RECRUTE' : 'RECRUTEMENTS STØRM · EN PAUSE'}</span><h2>${count ? (count === 1 ? 'Un poste staff est ouvert.' : 'Les recrutements staff sont ouverts.') : 'Les recrutements staff sont fermés.'}</h2><p>${count ? 'Un poste te correspond ? Prépare ta candidature et rejoins les coulisses.' : 'Aucun poste n’est ouvert pour le moment. Le suivi des dossiers déjà envoyés reste accessible.'}</p></div><span class="spotlight-total">${count ? count + ' poste' + (count > 1 ? 's ouverts' : ' ouvert') : 'Aucun poste ouvert'}</span></div><div class="spotlight-roles">${Object.entries(roles).map(([key,label]) => `<article class="spotlight-role ${types[key] ? 'is-open' : 'is-closed'}"><div><span class="spotlight-state">${types[key] ? '● OUVERT' : '🔒 FERMÉ'}</span><h3>${label}</h3><p>${types[key] ? 'Les candidatures sont disponibles.' : 'Les candidatures sont suspendues.'}</p></div>${types[key] ? `<a class="btn btn-primary" data-recruit-type="${key}" href="/candidatures?type=${key}">Candidater <span aria-hidden="true">→</span></a>` : '<span class="spotlight-unavailable">Pas de candidature</span>'}</article>`).join('')}</div><a class="spotlight-follow" href="/candidatures#myApplications">Voir les recrutements et mon suivi →</a></div>`;
    window.dispatchEvent(new CustomEvent('recruitment-status', { detail: { ...recruitment, types } }));
  }
  async function refresh() {
    if (loading || document.hidden) return;
    loading = true;
    try {
      const response = await fetch('/api/community', { cache: 'no-store' });
      if (!response.ok) throw Error('Statut indisponible');
      const data = await response.json();
      render(data.content.recruitment);
    } catch (_) {
      signature = '';
      root.dataset.state = 'unknown';
      root.innerHTML = '<div class="spotlight-panel spotlight-error"><span class="spotlight-eyebrow">RECRUTEMENTS STAFF</span><h2>Statut temporairement indisponible</h2><p>Nous n’avons pas pu vérifier les ouvertures. Consulte la page de recrutement pour réessayer.</p><a class="btn btn-outline" href="/candidatures">Voir les recrutements</a></div>';
    } finally { loading = false; }
  }
  root.addEventListener('click', event => {
    const link = event.target.closest('[data-recruit-type]');
    if (!onApplicationPage || !link) return;
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('recruitment-choose', { detail: link.dataset.recruitType }));
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
  setInterval(refresh, 30000);
})();
