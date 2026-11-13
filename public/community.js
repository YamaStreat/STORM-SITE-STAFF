const $ = selector => document.querySelector(selector);
const esc = value => String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let recruitmentTypes={};
let candidateSession=false;
let latestRecruitment=null;
let firstAvailabilityRender=true;
const statusLabels={pending:'En attente',reviewing:'En cours d’étude',accepted:'Acceptée',rejected:'Refusée'};
const page=location.pathname.replace(/\/$/,'').slice(1);
const titles={developpement:['Le projet avance.','Retrouve les fonctionnalités terminées, celles en cours et les prochaines étapes.'],reglement:['Le règlement STØRM.','Les repères pour une communauté respectueuse et un jeu loyal.'],serveur:['Entre dans la tempête.','Découvre le projet, sa communauté et les prochaines images du serveur.'],faq:['Une question ?','Les réponses utiles avant de rejoindre STØRM.'],candidatures:['Rejoins les coulisses.','Contribue au projet et accompagne la communauté.']};
const notice=message=>{$('#communityNotice').innerHTML=`<p class="community-alert">${esc(message)}</p>`;};
async function api(url,options={}){const response=await fetch(url,{...options,cache:'no-store',headers:options.body?{'Content-Type':'application/json'}:{}});const data=await response.json();if(!response.ok)throw Error(data.error||'Service indisponible.');return data;}
function updateRecruitType(){const info=recruitmentTypes[$('#applicationType').value];$('#applicationScenarioLabel').textContent=info?info.question:'Mise en situation';}
$('#applicationType').onchange=updateRecruitType;
async function myApplications(){const rows=await api('/api/applications/mine');$('#myApplications').innerHTML=rows.length?rows.map(row=>`<article><h3>${esc(recruitmentTypes[row.type]?.label||'Candidature générale')}</h3><span class="application-status">${statusLabels[row.status]||esc(row.status)}</span><p>Envoyée le ${new Date(row.createdAt).toLocaleString('fr-FR',{timeZone:'Europe/Paris'})}</p>${row.notificationStatus==='failed'?'<p>Le dernier MP n’a pas pu être envoyé. Ton suivi reste disponible ici.</p>':''}${row.feedback?`<p class="application-feedback">${esc(row.feedback)}</p>`:''}${!row.aiReviewConsent&&['pending','reviewing'].includes(row.status)?`<button class="btn btn-outline" data-ai-consent="${esc(row.id)}">Autoriser la préanalyse IA de mes réponses</button>`:''}</article>`).join(''):'<p>Aucune candidature envoyée pour le moment.</p>';document.querySelectorAll('[data-ai-consent]').forEach(button=>button.onclick=async()=>{if(!confirm('Autoriser OpenAI à relire tes réponses rédactionnelles et tes heures de jeu ? Le pseudo, l’identifiant Discord, l’âge et les sanctions déclarées ne sont pas joints automatiquement. La décision reste humaine.'))return;button.disabled=true;try{await api('/api/applications/'+button.dataset.aiConsent+'/ai-consent',{method:'POST',body:JSON.stringify({consent:true})});notice('Autorisation enregistrée. L’équipe pourra lancer la préanalyse si son service IA est configuré.');await myApplications();}catch(e){notice(e.message);button.disabled=false;}});}
function renderRecruitmentAvailability(content){
  latestRecruitment=content.recruitment;
  $('#applicationType').dataset.previousType=$('#applicationType').value;
  const openings=content.recruitment.types||{helper:content.recruitment.open,animator:content.recruitment.open};

  $('#applicationType').innerHTML='<option value="">Choisir un poste ouvert</option>'+Object.entries(recruitmentTypes).filter(([key])=>openings[key]).map(([key,type])=>`<option value="${key}">${esc(type.label)}</option>`).join('');
  const previousType=$('#applicationType').dataset.previousType||'';
  const requested=new URLSearchParams(location.search).get('type');
  if(!firstAvailabilityRender&&openings[previousType])$('#applicationType').value=previousType;
  else if(firstAvailabilityRender&&requested&&openings[requested])$('#applicationType').value=requested;
  else if(firstAvailabilityRender&&!requested)$('#applicationType').value=Object.keys(openings).find(key=>openings[key])||'';
  else if(firstAvailabilityRender&&requested)notice('Le poste demandé était fermé à l’ouverture de cette page. Consulte les disponibilités affichées ci-dessus.');
  updateRecruitType();

  $('#applicationForm').hidden=!candidateSession||!content.recruitment.open;
  $('#applicationLogin').hidden=candidateSession||!content.recruitment.open;
  firstAvailabilityRender=false;
}
window.addEventListener('recruitment-status',event=>{if(page==='candidatures'&&Object.keys(recruitmentTypes).length)renderRecruitmentAvailability({recruitment:event.detail});});
window.addEventListener('recruitment-choose',event=>{if(page!=='candidatures')return;const select=$('#applicationType');if(![...select.options].some(option=>option.value===event.detail))return;select.value=event.detail;updateRecruitType();const target=$('#applicationForm').hidden?$('#applicationLogin'):select;target.scrollIntoView({block:'center',behavior:'smooth'});target.focus({preventScroll:true});});

async function boot(){
 const [title,intro]=titles[page]||titles.developpement;document.title=`${title} — STØRM PVP`;$('#communityTitle').textContent=title;$('#communityIntro').textContent=intro;
 document.querySelectorAll('.community-nav a').forEach(link=>{if(link.pathname===location.pathname)link.setAttribute('aria-current','page');});
 const {content,recruitmentTypes:types}=await api('/api/community');
 recruitmentTypes=types||{helper:{label:'Helpeur',description:'Accompagner les joueurs.',question:'Comment gères-tu une demande difficile ?'},animator:{label:'Animateur',description:'Créer des événements.',question:'Propose un événement équitable.'}};
 if(page==='developpement')$('#communityBody').innerHTML=`<div class="roadmap-grid">${Object.entries({done:'✓ Terminé',in_progress:'◌ En cours',planned:'↗ À venir'}).map(([status,label])=>`<section class="roadmap-column"><h2>${label}</h2>${content.roadmap.filter(item=>item.status===status).map(item=>`<article class="roadmap-item"><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></article>`).join('')||'<p class="community-empty">Aucune étape annoncée ici.</p>'}</section>`).join('')}</div>`;
 if(page==='reglement'){
  const groups={COMMUN:'Règles communes',DISCORD:'Discord',FIVEM:'FiveM · PVP',STAFF:'Engagement du staff'};
  const groupOf=rule=>Object.keys(groups).find(key=>rule.title.startsWith(key+' — '))||'COMMUN';
  $('#communityBody').innerHTML=`<nav class="rules-nav" aria-label="Sections du règlement">${Object.entries(groups).filter(([key])=>content.rules.some(rule=>groupOf(rule)===key)).map(([key,label])=>`<a href="#rules-${key.toLowerCase()}">${label}</a>`).join('')}</nav>`+Object.entries(groups).map(([key,label])=>{
   const rules=content.rules.filter(rule=>groupOf(rule)===key);return rules.length?`<section class="rules-section" id="rules-${key.toLowerCase()}"><h2>${label}</h2>${rules.map((rule,index)=>`<article class="community-card"><span class="section-kicker">${key} · ${String(index+1).padStart(2,'0')}</span><h3>${esc(rule.title.replace(/^(COMMUN|DISCORD|FIVEM|STAFF) — /,''))}</h3><p>${esc(rule.text)}</p></article>`).join('')}</section>`:'';
  }).join('');
 }

 if(page==='serveur')$('#communityBody').innerHTML=`<article class="community-card"><h2>Le projet STØRM PVP</h2><p>${esc(content.presentation.description)}</p><ul>${content.presentation.features.map(feature=>`<li>${esc(feature)}</li>`).join('')}</ul></article><h2>Dans l’univers STØRM</h2>${content.presentation.screenshots.length?`<div class="screenshot-grid">${content.presentation.screenshots.map((url,index)=>`<img src="${esc(url)}" alt="Capture du serveur STØRM ${index+1}" loading="lazy">`).join('')}</div>`:'<p class="community-empty">Les captures du serveur seront ajoutées ici par l’équipe.</p>'}`;
 if(page==='faq')$('#communityBody').innerHTML=`<div class="community-faq">${content.faq.map(item=>`<details><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join('')||'<p class="community-empty">Les réponses seront publiées prochainement.</p>'}</div>`;
 if(page==='candidatures'){
  $('#applicationArea').hidden=false;$('#recruitmentIntro').textContent=content.recruitment.intro;
  renderRecruitmentAvailability(content);
  const me=await api('/api/me');
  if(me.user){candidateSession=true;$('#applicationLogin').hidden=true;$('#applicationForm').hidden=!latestRecruitment.open;await myApplications();}
 }
}
$('#applicationForm').onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const result=await api('/api/applications',{method:'POST',body:JSON.stringify({type:$('#applicationType').value,age:Number($('#applicationAge').value),fivemHours:Number($('#applicationFivemHours').value),gameExperience:$('#applicationGameExperience').value,qualities:$('#applicationQualities').value,teamwork:$('#applicationTeamwork').value,history:$('#applicationHistory').value,conditionsAccepted:$('#applicationConditions').checked,aiReviewConsent:$('#applicationAiConsent').checked,scenario:$('#applicationScenario').value,weeklyHours:Number($('#applicationWeeklyHours').value),motivation:$('#applicationMotivation').value,experience:$('#applicationExperience').value,availability:$('#applicationAvailability').value,rulesAccepted:$('#applicationRules').checked})});event.target.reset();notice(result.dmSent?'Ta candidature a bien été reçue. Une confirmation t’a été envoyée en MP Discord.':'Ta candidature a bien été reçue, mais le MP n’a pas pu être envoyé. Active les messages privés du serveur et consulte ton suivi ci-dessous.');updateRecruitType();await myApplications();}catch(e){notice(e.message);}finally{button.disabled=false;}};
boot().catch(e=>notice(e.message));
