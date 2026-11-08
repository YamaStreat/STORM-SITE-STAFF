const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { brandedMessage } = require('./discord-branding');
const { RULES_VERSION } = require('./rules');
const WELCOME_CHANNEL = '1564691566722031767';
const RULES_CHANNEL = '1564691736893202473';
const PENDING_ROLE = '1569015388514164822';
const MEMBER_ROLE = '1564827474099966103';
const ACCEPT_ID = 'storm:accept-rules:v1';

function rulesMessages(publicUrl) {
  const payload=brandedMessage({
    title:'📜 RÈGLEMENT — STØRM PVP',
    description:'**Bienvenue dans la communauté STØRM.**\n\nLe règlement Discord et FiveM est disponible sur notre site. Prends le temps de le lire avant de demander ton accès membre.\n\n**1.** Clique sur **Lire le règlement** pour ouvrir le site.\n**2.** Reviens ici, puis clique sur **J’accepte le règlement**.\n\nEn acceptant, tu confirmes avoir lu et accepté les règles. Ton rôle membre sera attribué et ton rôle d’attente retiré.'
  },{links:[{label:'Lire le règlement',url:new URL('/reglement',publicUrl).href}]});
  payload.components.push({type:1,components:[{type:2,style:3,custom_id:ACCEPT_ID,label:'J’accepte le règlement',emoji:{name:'✅'}}]});
  return [payload];
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
    const payload=brandedMessage({title:member?'⚡ BIENVENUE DANS LA TEMPÊTE !':'⚡ BIENVENUE SUR STØRM PVP',description:`Bienvenue ${user} !\n**Ton aventure dans la communauté STØRM commence ici.**\nUn espace pour le PVP, la compétition et les bons moments ensemble.`,fields:[{name:'📜 Première étape',value:`Ouvre le lien du règlement sur le site depuis <#${RULES_CHANNEL}>, puis clique sur **J’accepte le règlement** pour recevoir ton accès membre.`},{name:'🤝 Fais connaissance',value:'Reste respectueux, découvre les annonces et n’hésite pas à échanger avec la communauté.'},{name:'🛠️ Le projet avance',value:'Le statut actuel et les prochaines étapes sont disponibles sur notre site. Si tu as besoin d’aide, utilise les tickets Discord.'}]},{content:member?`Bienvenue <@${member.id}> 👋`:'',links:[{label:'Lire et accepter le règlement',url:`https://discord.com/channels/${guildId}/${RULES_CHANNEL}`},{label:'Découvrir STØRM',url:new URL('/',publicUrl).href}]});
    payload.allowedMentions={parse:[],users:member?[member.id]:[]};return payload;
  }
  async function publish(){
    if(syncing)throw Error('La publication de l’accueil est déjà en cours.');syncing=true;
    try{
      const guild=await client.guilds.fetch(guildId),rules=await channel(guild,RULES_CHANNEL),welcome=await channel(guild,WELCOME_CHANNEL);
      await editableRole(guild,PENDING_ROLE);await editableRole(guild,MEMBER_ROLE);
      const saved=storage(),payload=rulesMessages(publicUrl)[0];
      const oldIds=[...saved.rulesMessageIds];
      const canonical=await syncMessage(rules,oldIds[0],payload);
      saved.rulesCleanupIds=[...new Set([...(saved.rulesCleanupIds||[]),...oldIds.slice(1)])].filter(id=>id!==canonical.id);
      // Switch the trusted button immediately, even if cleanup needs a later retry.
      saved.rulesMessageIds=[canonical.id];saved.rulesVersion=RULES_VERSION;saveState();
      for(const id of [...saved.rulesCleanupIds]){
        const previous=await rules.messages.fetch(id).catch(e=>{if(e.code===10008)return null;throw e;});
        if(previous){
          if(previous.author?.id!==client.user.id)throw Error('Nettoyage interrompu : un ancien message n’appartient pas au bot.');
          await previous.delete().catch(e=>{if(e.code!==10008)throw e;});
        }
        saved.rulesCleanupIds=saved.rulesCleanupIds.filter(value=>value!==id);saveState();
      }
      const message=await syncMessage(welcome,saved.welcomeMessageId,welcomePayload());saved.welcomeMessageId=message.id;saveState();
      return {rulesMessages:1};
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
