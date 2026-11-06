const login = document.querySelector('#staffLogin');
const statusMessage = document.querySelector('#loginStatus');
function showStatus(text) { statusMessage.textContent = text; statusMessage.hidden = false; }

// Local copies take priority; supplied Discord attachments are used as a fallback.
async function loadLogos() {
  const response = await fetch('/branding.json', { cache: 'no-store' });
  if (!response.ok) return;
  const logos = await response.json();
for (const [name, paths] of Object.entries(logos)) {
  const img = document.querySelector(`[data-logo="${name}"]`);
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('load', () => { img.hidden = false; document.querySelector(`[data-logo-fallback="${name}"]`).hidden = true; });
  img.addEventListener('error', () => { if (img.getAttribute('src') === paths.local) img.src = paths.remote; });
  img.src = paths.local;
}
}
loadLogos().catch(() => {});

const params = new URLSearchParams(location.search);
if (params.has('denied')) showStatus('Ce compte ne possède pas de rôle autorisé. Contacte un responsable pour obtenir l’accès.');
if (params.has('error')) showStatus('La connexion Discord n’a pas abouti. Tu peux réessayer.');

async function checkSession() {
  try {
    const response = await fetch('/api/me', { cache: 'no-store' });
    if (!response.ok) throw new Error('Session indisponible');
    const data = await response.json();
    if (data.user?.isStaff) {
      login.href = '/admin.html';
      document.querySelector('#loginLabel').textContent = 'Accéder à mon espace staff';
      showStatus(`Connecté en tant que ${data.user.username}.`);
    } else if (data.user) {
      showStatus('Ton compte n’a pas de rôle autorisé à accéder au panel. Contacte un responsable.');
    } else if (!data.oauthReady) {
      showStatus('La connexion Discord est temporairement indisponible. Contacte un responsable.');
    }
    if (data.user) document.querySelector('#switchAccount').hidden = false;
  } catch (_) { showStatus('Impossible de vérifier ta session pour le moment. Tu peux réessayer de te connecter.'); }
}
document.querySelector('#switchAccount').addEventListener('click', async event => {
  event.preventDefault();
  try {
    const response = await fetch('/auth/logout', { method: 'POST' });
    if (!response.ok) throw new Error('Déconnexion impossible');
    location.href = '/auth/discord';
  } catch (_) { showStatus('La déconnexion n’a pas abouti. Réessaie dans un instant.'); }
});
checkSession();
