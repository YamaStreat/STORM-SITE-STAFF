const {randomUUID,createHash}=require('node:crypto');
const {ChannelType}=require('discord.js');
const TYPES=Object.freeze({helper:{label:'Helpeur',description:'Accompagner les joueurs, traiter les demandes et garder une attitude calme et impartiale.',question:'Un joueur mécontent conteste une décision et s’énerve dans un ticket. Comment l’accompagnes-tu ?'},animator:{label:'Animateur',description:'Imaginer et encadrer des événements accessibles, équitables et respectueux des règles.',question:'Propose un événement PVP : objectif, déroulement, règles, équité et gestion d’un imprévu.'}});
const CHANNEL_ID='1568410724605239326',ROLE_ID='1564827474099966103';
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
 async function channel(){const guild=await client.guilds.fetch(guildId);const value=await guild.channels.fetch(CHANNEL_ID);if(!value||value.guildId!==guildId||![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(value.type)){const err=new Error('Salon des recrutements inaccessible.');err.status=502;throw err;}return value;}
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
    const content=`${notify?`<@&${ROLE_ID}>\n\n`:''}# 📣・RECRUTEMENTS STØRM PVP\n\n${Object.entries(TYPES).map(([key,value])=>`${types[key]?'🟢':'🔴'} **${value.label} : ${types[key]?'OUVERT':'FERMÉ'}**${types[key]?`\n${value.description}\n👉 Candidater : ${link(key)}`:''}`).join('\n\n')}\n\n📋 Consulte le règlement et prépare une candidature personnelle et complète.\nLes candidatures en cours restent consultables même après la fermeture.\n\n**STØRM PVP ・ Équipe de recrutement**`;
    const sent=await(await channel()).send({content,allowedMentions:{parse:[],roles:notify?[ROLE_ID]:[]}});messageId=sent.id;
   }
   } catch(err){if(opened.length||!changed||announce)throw err;announcementError='Recrutements fermés sur le site, mais l’annonce Discord n’a pas pu être envoyée.';}
   state.recruitmentSettings={types:{helper:types.helper,animator:types.animator},revision:previous.revision+1,updatedAt:Date.now(),lastAnnouncementId:messageId||state.recruitmentSettings?.lastAnnouncementId||null,announcementError};saveState();
   return{...state.recruitmentSettings,announced:Boolean(messageId)};
  }finally{updating=false;}
 }
 async function flushResults(){
  if(sendingResults)return{sent:0,pending:true};sendingResults=true;let count=0;
  try{
   const rows=(state.applications||[]).filter(row=>['accepted','rejected'].includes(row.status)&&row.publicDecisionVersion&&(row.publicResultPublishedVersion||0)<row.publicDecisionVersion).map(row=>({id:row.id,userId:row.userId,type:row.type,status:row.status,version:row.publicDecisionVersion}));
   if(!rows.length){if(state.recruitmentResultsError){delete state.recruitmentResultsError;saveState();}return{sent:0};}
   const dest=await channel();
   // Each message contains a bounded group; only identities and decisions are public.
   for(let offset=0;offset<rows.length;offset+=12){const batch=rows.slice(offset,offset+12);
    const sections=['accepted','rejected'].map(status=>{const entries=batch.filter(row=>row.status===status);return entries.length?`### ${status==='accepted'?'✅ CANDIDATURES ACCEPTÉES':'❌ CANDIDATURES REFUSÉES'}\n${entries.map(row=>`> ➜ <@${row.userId}> — **${typeLabel(row)}**`).join('\n')}`:'';}).filter(Boolean);
    const content=`# 📋・RÉSULTATS DES RECRUTEMENTS — STØRM PVP\n\n${sections.join('\n\n')}\n\nLes retours détaillés sont disponibles dans votre suivi privé. Un MP est également envoyé lorsque vos paramètres Discord le permettent : ${link()}\n\n**STØRM PVP ・ Équipe de recrutement**`;
    const nonce=createHash('sha256').update(batch.map(row=>row.id+':'+row.version).join('|')).digest('hex').slice(0,24);
    const sent=await dest.send({content,allowedMentions:{parse:[],users:[...new Set(batch.map(row=>row.userId))]},nonce,enforceNonce:true});
    for(const snapshot of batch){const entry=state.applications.find(row=>row.id===snapshot.id);if(entry)entry.publicResultPublishedVersion=snapshot.version;}
    state.recruitmentBatches||=[];state.recruitmentBatches.unshift({id:sent.id,createdAt:Date.now(),entries:batch});state.recruitmentBatches=state.recruitmentBatches.slice(0,100);saveState();count+=batch.length;
   }
   delete state.recruitmentResultsError;saveState();return{sent:count};
  }catch(err){state.recruitmentResultsError='Publication des résultats indisponible. Vérifie le salon et les permissions du bot.';saveState();throw err;}finally{sendingResults=false;}
 }
 async function processQueue(){for(const entry of state.applications||[])for(const event of entry.notifications||[])if(event.status==='pending')await deliver(entry,event);return flushResults();}
 const service={queueDM,deliver,updateSettings,flushResults,processQueue};services.set(state,service);return service;
}
module.exports={TYPES,CHANNEL_ID,ROLE_ID,settingsFor,createRecruitmentService};
