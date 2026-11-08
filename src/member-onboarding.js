const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { brandedMessage } = require('./discord-branding');
const { RULES, LEGACY_RULES, RULES_VERSION } = require('./rules');
const WELCOME_CHANNEL = '1564691566722031767';
const RULES_CHANNEL = '1564691736893202473';
const PENDING_ROLE = '1569015388514164822';
const MEMBER_ROLE = '1564827474099966103';
const ACCEPT_ID = 'storm:accept-rules:v1';

function rulesMessages(publicUrl, rules = RULES) {
  const messages = [brandedMessage({title:'📜 RÈGLEMENT OFFICIEL — STØRM PVP',description:'**Une communauté. Du respect. Un jeu loyal.**\nPrends le temps de lire les règles Discord et FiveM ci-dessous avant de rejoindre la tempête.',fields:[{name:'🔎 Comment obtenir ton accès ?',value:'Lis tous les messages du règlement, puis clique sur **J’accepte le règlement** au bas du dernier message. Ton rôle d’attente sera remplacé par le rôle membre.'}]},{links:[{label:'Lire sur le site',url:new URL('/reglement',publicUrl).href}]})];
  let fields=[],size=0;
  const flush=()=>{if(fields.length){messages.push(brandedMessage({title:`📖 STØRM PVP · Règlement (${messages.length})`,fields}));fields=[];size=0;}};
  for(const rule of rules){
    const chunks=rule.text.match(/[\s\S]{1,1024}/g)||[];
    for(let i=0;i<chunks.length;i++){
      const field={name:rule.title+(i?' · suite':''),value:chunks[i],inline:false};
      if(fields.length>=8||size+field.name.length+field.value.length>4500)flush();
      fields.push(field);size+=field.name.length+field.value.length;
    }
  }
  flush();
  const acceptance=brandedMessage({title:'✅ PRÊT À REJOINDRE LA TEMPÊTE ?',description:'En cliquant ci-dessous, tu confirmes avoir lu et accepté le règlement STØRM PVP.\n\nTon rôle membre te sera attribué et le rôle d’attente sera retiré. Si tu as une question, contacte l’équipe avant de valider.'},{links:[{label:'Règlement complet',url:new URL('/reglement',publicUrl).href}]});
  acceptance.components.push({type:1,components:[{type:2,style:3,custom_id:ACCEPT_ID,label:'J’accepte le règlement',emoji:{name:'✅'}}]});
  messages.push(acceptance);return messages;
}
function createMemberOnboarding({client,state,saveState,guildId,publicUrl}) {
  const locks=new Set();let syncing=false;
  const storage=()=>{state.memberOnboarding||={};state.memberOnboarding.rulesMessageIds||=[];return state.memberOnboarding;};
  async function channel(guild,id){const value=await guild.channels.fetch(id);if(!value||value.guildId!==guildId||![ChannelType.GuildText,ChannelType.GuildAnnouncement].includes(value.type))throw Error('Salon d’accueil ou de règlement introuvable.');return value;}
  async function editableRole(guild,id){
    const role=await guild.roles.fetch(id);const bot=await guild.members.fetchMe();
    if(!role||role.id===guild.id||role.managed||!bot.permissions.has(PermissionFlagsBits.ManageRoles)||bot.roles.highest.comparePositionTo(role)<=0)throw Error('Le bot doit pouvoir gérer les rôles et être placé au-dessus des deux rôles d’accès.');
    return role;
  }
  async function syncMessage(dest,id,payload){
    const old=id?await dest.messages.fetch(id).catch(e=>{if(e.code===10008)return null;throw e;}):null;
    if(old){if(old.author?.id!==client.user.id)throw Error('Le message enregistré n’appartient pas au bot.');return old.edit({...payload,attachments:[]});}
    return dest.send(payload);
  }
  function welcomePayload(member){
    const user=member?`<@${member.id}>`:'à toute la communauté';
    const payload=brandedMessage({title:member?'⚡ BIENVENUE DANS LA TEMPÊTE !':'⚡ BIENVENUE SUR STØRM PVP',description:`Bienvenue ${user} !\n**Ton aventure dans la communauté STØRM commence ici.**\nUn espace pour le PVP, la compétition et les bons moments ensemble.`,fields:[{name:'📜 Première étape',value:`Lis le règlement dans <#${RULES_CHANNEL}> puis clique sur **J’accepte le règlement** pour recevoir ton accès membre.`},{name:'🤝 Fais connaissance',value:'Reste respectueux, découvre les annonces et n’hésite pas à échanger avec la communauté.'},{name:'🛠️ Le projet avance',value:'Le statut actuel et les prochaines étapes sont disponibles sur notre site. Si tu as besoin d’aide, utilise les tickets Discord.'}]},{content:member?`Bienvenue <@${member.id}> 👋`:'',links:[{label:'Lire et accepter le règlement',url:`https://discord.com/channels/${guildId}/${RULES_CHANNEL}`},{label:'Découvrir STØRM',url:new URL('/',publicUrl).href}]});
    payload.allowedMentions={parse:[],users:member?[member.id]:[]};return payload;
  }
  async function publish(){
    if(syncing)throw Error('La publication de l’accueil est déjà en cours.');syncing=true;
    try{
      const guild=await client.guilds.fetch(guildId),rules=await channel(guild,RULES_CHANNEL),welcome=await channel(guild,WELCOME_CHANNEL);
      await editableRole(guild,PENDING_ROLE);await editableRole(guild,MEMBER_ROLE);
      const configured=state.communityContent?.rules;
      const currentRules=configured&&JSON.stringify(configured)!==JSON.stringify(LEGACY_RULES)?configured:RULES;
      const saved=storage(),payloads=rulesMessages(publicUrl,currentRules);
      for(let index=0;index<payloads.length;index++){const message=await syncMessage(rules,saved.rulesMessageIds[index],payloads[index]);saved.rulesMessageIds[index]=message.id;saveState();}
      for(const id of saved.rulesMessageIds.slice(payloads.length)){const message=await rules.messages.fetch(id).catch(e=>{if(e.code===10008)return null;throw e;});if(message?.author?.id===client.user.id)await message.edit({components:[]});}
      saved.rulesMessageIds=saved.rulesMessageIds.slice(0,payloads.length);saved.rulesVersion=RULES_VERSION;saveState();
      const message=await syncMessage(welcome,saved.welcomeMessageId,welcomePayload());saved.welcomeMessageId=message.id;saveState();
      return {rulesMessages:payloads.length};
    }finally{syncing=false;}
  }
  async function onJoin(member){
    if(member.guild.id!==guildId||member.user.bot)return;
    try{const role=await editableRole(member.guild,PENDING_ROLE);await member.roles.add(role,'Nouveau membre : règlement à accepter');}catch(err){console.error('[STORM ACCUEIL] Attribution du rôle d’attente :',err.message);}
    const dest=await channel(member.guild,WELCOME_CHANNEL);await dest.send(welcomePayload(member));
  }
  async function accept(interaction){
    if(interaction.customId!==ACCEPT_ID)return false;
    const saved=storage();
    if(interaction.guildId!==guildId||interaction.channelId!==RULES_CHANNEL||interaction.message?.id!==saved.rulesMessageIds.at(-1)||!saved.rulesVersion){await interaction.reply({content:'Ce bouton n’est plus actif. Utilise le dernier message du règlement officiel.',ephemeral:true});return true;}
    await interaction.deferReply({ephemeral:true});
    if(locks.has(interaction.user.id)){await interaction.editReply('Ta validation est déjà en cours. Patiente un instant.');return true;}
    locks.add(interaction.user.id);
    try{
      const guild=await client.guilds.fetch(guildId),member=await guild.members.fetch({user:interaction.user.id,force:true});
      if(member.user.bot)throw Error('Cette validation est réservée aux membres.');
      const accepted=await editableRole(guild,MEMBER_ROLE),pending=await editableRole(guild,PENDING_ROLE);
      // Grant access first. Never remove the waiting role when granting access failed.
      await member.roles.add(accepted,'Règlement STØRM PVP accepté');
      await member.roles.remove(pending,'Règlement accepté : fin de l’attente');
      saved.lastAcceptance={userId:member.id,version:saved.rulesVersion,acceptedAt:Date.now()};saveState();
      await interaction.editReply('✅ Règlement accepté ! Ton rôle membre a été attribué et ton rôle d’attente retiré. Bienvenue sur STØRM PVP !');
    }catch(err){console.error('[STORM ACCUEIL] Validation :',err.message);await interaction.editReply('❌ La validation n’a pas pu être terminée. Réessaie ou contacte le staff : le bot doit avoir la permission Gérer les rôles et être placé au-dessus des deux rôles d’accès.');}
    finally{locks.delete(interaction.user.id);}
    return true;
  }
  return{publish,onJoin,accept};
}
module.exports={createMemberOnboarding,rulesMessages,WELCOME_CHANNEL,RULES_CHANNEL,PENDING_ROLE,MEMBER_ROLE,ACCEPT_ID};
