const {randomUUID,createHash}=require('node:crypto');
const {ChannelType}=require('discord.js');
const {brandedMessage}=require('./discord-branding');
const TYPES=Object.freeze({helper:{label:'Helpeur',description:'Accompagner les joueurs, traiter les demandes et garder une attitude calme et impartiale.',question:'Un joueur mécontent conteste une décision et s’énerve dans un ticket. Comment l’accompagnes-tu ?'},animator:{label:'Animateur',description:'Imaginer et encadrer des événements accessibles, équitables et respectueux des règles.',question:'Propose un événement PVP : objectif, déroulement, règles, équité et gestion d’un imprévu.'}});
const CHANNEL_ID='1568410724605239326',ROLE_ID='1564827474099966103',RESULTS_CHANNEL_ID='1568419705893687459';
const services=new WeakMap();
function settingsFor(state,base){const fallback=Boolean(base?.open);const types=state.recruitmentSettings?.types||base?.types||{helper:fallback,animator:fallback};return{types:{helper:types.helper===true,animator:types.animator===true},revision:state.recruitmentSettings?.revision||0};}
function createRecruitmentService({state,saveState,client,guildId,publicUrl}){
 if(services.has(state))return services.get(state);
 let sendingResults=false,updating=false;
 const dmLocks=new Set();
 const link=type=>new URL('/candidatures'+(type?'?type='+type:''),publicUrl).href;
 const typeLabel=entry=>TYPES[entry.type]?.label||'Candidature générale';
 function queueDM(entry,kind,feedback=''){
  const labels={received:'a bien été reçue',reviewing:'a été prise en compte et son étude est en cours',accepted:'a été acceptée',rejected:'a été refusée'};
  const event={id:randomUUID(),kind,status:'pending',createdAt:Date.now(),content:`# 📩・CANDIDATURE STØRM PVP\n\nTa candidature **${typeLabel(entry)}** **${labels[kind]}**.\n\n${feedback?`**Retour de l’équipe :**\n${feedback}\n\n`:''}${kind==='accepted'?'Un responsable te communiquera la suite de ton intégration. Aucun rôle n’est attribué automatiquement.\n\n':''}🔎 Suivre ton dossier : ${link()}\nRéférence : ${entry.id}\n\n**STØRM PVP ・ Équipe de recrutement**`};
  entry.notifications||=[];entry.notifications.push(event);saveState();return event;
 }
 async function deliver(entry,event){
  if(['accepted','rejected'].includes(event?.kind)&&(!event.decisionVersion||(entry.publicResultPublishedVersion||0)<event.decisionVersion))return false;
  if(event?.status==='sent')return true;
  if(!event||dmLocks.has(event.id))return false;
  dmLocks.add(event.id);event.attemptedAt=Date.now();
  try{const user=await client.users.fetch(entry.userId);
   const chunks=event.content.match(/[\s\S]{1,1850}/g)||[];event.partsSent||=0;
   for(let index=event.partsSent;index<chunks.length;index++){await user.send({content:chunks[index],allowedMentions:{parse:[]},nonce:event.id.replace(/-/g,'').slice(0,20)+index,enforceNonce:true});event.partsSent=index+1;saveState();}
   event.status='sent';event.sentAt=Date.now();delete event.error;return true;}
  catch(err){event.status='failed';event.error=err.code===50007?'Messages privés fermés':'Envoi Discord indisponible';return false;}
  finally{dmLocks.delete(event.id);saveState();}
 }
 async function channel(id=CHANNEL_ID){const guild=await client.guilds.fetch(guildId);const value=await guild.channels.fetch(id);if(!value||value.guildId!==guildId||![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(value.type)){const err=new Error('Salon des recrutements inaccessible.');err.status=502;throw err;}return value;}
 async function updateSettings({types,revision,announce=false,base}){
  if(updating){const err=new Error('Une mise à jour des recrutements est déjà en cours.');err.status=409;throw err;}updating=true;
  try{
   const previous=settingsFor(state,base);if(previous.revision!==revision){const err=new Error('Les recrutements ont changé. Recharge leurs réglages.');err.status=409;throw err;}
   if(!types||Object.keys(TYPES).some(key=>typeof types[key]!=='boolean')||Object.keys(types).some(key=>!Object.hasOwn(TYPES,key))){const err=new Error('Choisis l’ouverture de chaque type de recrutement.');err.status=400;throw err;}
   if(typeof announce!=='boolean'){const err=new Error('Option d’annonce invalide.');err.status=400;throw err;}
   const firstSave=!state.recruitmentSettings;
   const changed=Object.keys(TYPES).some(key=>types[key]!==previous.types[key]);
   const opened=Object.keys(TYPES).filter(key=>types[key]&&!previous.types[key]);
   let messageId=null,announcementError=null;
   // A closure must take effect even if Discord is temporarily unavailable.
   if(changed&&!opened.length){state.recruitmentSettings={types:{helper:types.helper,animator:types.animator},revision:previous.revision+1,updatedAt:Date.now(),lastAnnouncementId:state.recruitmentSettings?.lastAnnouncementId||null};saveState();}
   try {
   if(changed||announce||firstSave){
    const notify=opened.length>0||((announce||firstSave)&&Object.values(types).some(Boolean));
    const fields=Object.entries(TYPES).map(([key,value])=>({name:`${types[key]?'🟢':'🔒'} ${value.label} — ${types[key]?'OUVERT':'FERMÉ'}`,value:types[key]?`${value.description}\n\n**Ton objectif :** ${key==='helper'?'écouter, guider et aider les joueurs avec impartialité.':'rassembler la communauté autour d’événements créatifs et équitables.'}\n[Déposer ma candidature](${link(key)})`:'Les candidatures pour ce poste sont actuellement fermées.',inline:false}));
    fields.push({name:'📋 Avant de candidater',value:'Lis le règlement, présente une motivation personnelle et prends le temps de répondre à la mise en situation.\nLe suivi et les retours détaillés sont privés. Les décisions finales sont annoncées dans ce salon.'},{name:'📩 Et ensuite ?',value:'Une confirmation est envoyée en MP si tes paramètres Discord le permettent. L’équipe étudie ton dossier ; tu retrouves chaque étape dans ton suivi.'});
    const links=Object.entries(TYPES).filter(([key])=>types[key]).map(([key,value])=>({label:`Candidater · ${value.label}`,url:link(key)}));
    links.push({label:'Règlement',url:new URL('/reglement',publicUrl).href},{label:'Mon suivi',url:link()});
    const payload=brandedMessage({title:Object.values(types).some(Boolean)?'📣 REJOINS LE STAFF STØRM PVP':'🔒 RECRUTEMENTS ACTUELLEMENT FERMÉS',description:Object.values(types).some(Boolean)?'Tu souhaites t’investir dans une communauté PVP et faire la différence ?\n**Choisis le poste qui te correspond et rejoins les coulisses de STØRM.**':'Merci pour votre intérêt et vos candidatures.\nLes dossiers déjà envoyés restent en cours de traitement et leur suivi demeure accessible.',fields},{content:notify?`<@&${ROLE_ID}>`:'',links});
    payload.allowedMentions={parse:[],roles:notify?[ROLE_ID]:[]};
    const sent=await(await channel()).send(payload);messageId=sent.id;
   }
   } catch(err){if(opened.length||!changed||announce)throw err;announcementError='Recrutements fermés sur le site, mais l’annonce Discord n’a pas pu être envoyée.';}
   state.recruitmentSettings={types:{helper:types.helper,animator:types.animator},revision:previous.revision+1,updatedAt:Date.now(),lastAnnouncementId:messageId||state.recruitmentSettings?.lastAnnouncementId||null,announcementError};saveState();
   return{...state.recruitmentSettings,announced:Boolean(messageId)};
  }finally{updating=false;}
 }
 function decisionNotification(entry,version){
  return entry.notifications?.findLast(event=>event.decisionVersion===version)||((entry.publicResultPublishedVersion||0)>=version?entry.notifications?.findLast(event=>event.kind===entry.status&&event.status==='sent'&&!event.decisionVersion):null);
 }
 function pendingResults(){
  return (state.applications||[]).filter(entry=>['accepted','rejected'].includes(entry.status)&&entry.publicDecisionVersion&&((entry.publicResultPublishedVersion||0)<entry.publicDecisionVersion||decisionNotification(entry,entry.publicDecisionVersion)?.status!=='sent')).map(entry=>({id:entry.id,userId:entry.userId,username:entry.username||entry.userId,type:entry.type,status:entry.status,feedback:entry.feedback||'',version:entry.publicDecisionVersion,publicSent:(entry.publicResultPublishedVersion||0)>=entry.publicDecisionVersion,dmStatus:decisionNotification(entry,entry.publicDecisionVersion)?.status||'pending'}));
 }
 async function flushResults({selection}={}){
  if(sendingResults){const error=new Error('Une publication est déjà en cours.');error.status=409;throw error;}
  sendingResults=true;let count=0,dmSent=0,dmFailed=0;
  try{
   let rows=pendingResults();
   if(selection!==undefined){
    if(!Array.isArray(selection)||selection.length>2000||new Set(selection.map(row=>row?.id)).size!==selection.length){const error=new Error('Sélection de résultats invalide.');error.status=400;throw error;}
    rows=selection.map(selected=>{const current=rows.find(row=>row.id===selected?.id&&row.version===selected.version);if(!current){const error=new Error('Les résultats ont changé. Recharge la liste avant de publier.');error.status=409;throw error;}return current;});
   }
   if(!rows.length){delete state.recruitmentResultsError;saveState();return{sent:0,dmSent:0,dmFailed:0};}
   const publicRows=rows.filter(row=>!row.publicSent);
   const dest=publicRows.length?await channel(RESULTS_CHANNEL_ID):null;
   for(let offset=0;offset<publicRows.length;offset+=12){
    const batch=publicRows.slice(offset,offset+12);
    const sections=['accepted','rejected'].map(status=>{const entries=batch.filter(row=>row.status===status);return entries.length?`### ${status==='accepted'?'✅ CANDIDATURES ACCEPTÉES':'❌ CANDIDATURES REFUSÉES'}\n${entries.map(row=>`> ➜ <@${row.userId}> — **${typeLabel(row)}**`).join('\n')}`:'';}).filter(Boolean);
    const content=`# 📋・RÉSULTATS DES RECRUTEMENTS — STØRM PVP\n\n${sections.join('\n\n')}\n\nLes retours détaillés sont disponibles dans votre suivi privé. Un MP est également envoyé lorsque vos paramètres Discord le permettent : ${link()}\n\n**STØRM PVP ・ Équipe de recrutement**`;
    const nonce=createHash('sha256').update(batch.map(row=>row.id+':'+row.version).join('|')).digest('hex').slice(0,24);
    const sent=await dest.send({content,allowedMentions:{parse:[],users:[...new Set(batch.map(row=>row.userId))]},nonce,enforceNonce:true});
    for(const snapshot of batch){const entry=state.applications.find(row=>row.id===snapshot.id);if(entry){entry.publicResultPublishedVersion=snapshot.version;entry.publishedOutcome={status:snapshot.status,feedback:snapshot.feedback};}}
    state.recruitmentBatches||=[];state.recruitmentBatches.unshift({id:sent.id,createdAt:Date.now(),entries:batch.map(({feedback,...row})=>row)});state.recruitmentBatches=state.recruitmentBatches.slice(0,100);saveState();count+=batch.length;
   }
   for(const snapshot of rows){
    const entry=state.applications.find(row=>row.id===snapshot.id);
    if(!entry||(entry.publicResultPublishedVersion||0)<snapshot.version)continue;
    let event=decisionNotification(entry,snapshot.version);
    if(!event){event=queueDM(entry,snapshot.status,snapshot.feedback);event.decisionVersion=snapshot.version;saveState();}
    if(await deliver(entry,event))dmSent++;else dmFailed++;
   }
   delete state.recruitmentResultsError;saveState();return{sent:count,dmSent,dmFailed};
  }catch(err){state.recruitmentResultsError='Publication interrompue. Les envois confirmés sont conservés ; clique sur Publier pour reprendre.';saveState();throw err;}
  finally{sendingResults=false;}
 }

 const service={queueDM,deliver,updateSettings,flushResults,pendingResults};services.set(state,service);return service;
}
module.exports={TYPES,CHANNEL_ID,RESULTS_CHANNEL_ID,ROLE_ID,settingsFor,createRecruitmentService};
