const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { RULES, LEGACY_RULES, RULES_VERSION } = require('./rules');
const { TYPES, settingsFor, createRecruitmentService } = require('./recruitment');
const ID = /^\d{17,20}$/;
const DEFAULT_CONTENT = {
  roadmap: [{title:'Site public et espace staff',status:'done',description:'Un point central pour les actualités et les outils de l’équipe.'},{title:'Préparation du serveur FiveM',status:'in_progress',description:'Le serveur est actuellement en développement.'},{title:'Annonce de l’ouverture',status:'planned',description:'La date sera communiquée lorsque le serveur sera prêt.'}],
  rules: RULES,
  presentation: {description:'STØRM PVP prépare une expérience FiveM axée sur le combat, la compétition et la communauté.',features:['Une expérience orientée PVP','Une communauté Discord','Un support par tickets privés'],screenshots:[]},
  faq:[{question:'Comment rejoindre le serveur ?',answer:'Le serveur est en développement. Rejoins le Discord pour suivre les annonces et connaître la date d’ouverture.'},{question:'Comment contacter le staff ?',answer:'Ouvre un ticket depuis le panel Discord. La conversation continue en message privé.'},{question:'Comment contester une sanction ?',answer:'Utilise la procédure de contestation sur Discord et explique clairement ta situation.'}],
  recruitment:{open:true,intro:'Tu souhaites contribuer à STØRM ? Présente ta motivation, ton expérience et tes disponibilités. L’équipe étudiera ta candidature.'}
};
const text = (value, max, min = 1) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) error(400, `Texte attendu : entre ${min} et ${max} caractères.`);
  return value.trim();
};
function error(status,message){const e=new Error(message);e.status=status;throw e;}
function auditEvent(state, user, action, target, saveState, source='panel') {
  state.audit ||= [];
  state.audit.unshift({id:randomUUID(),actorId:user.id,actor:user.username,action,target,source,createdAt:Date.now()});
  state.audit=state.audit.slice(0,5000);saveState();
}
function supportStats(state,days=30,now=Date.now()) {
  const all=[...Object.values(state.tickets||{}),...Object.values(state.appeals||{})];
  const dateKey=ms=>new Date(ms).toLocaleDateString('en-CA',{timeZone:'Europe/Paris'});
  const daily=Array.from({length:days},(_,i)=>({date:dateKey(now-(days-1-i)*86400000),opened:0,closed:0}));
  const range=new Map(daily.map(row=>[row.date,row]));
  const firstReplies=[],resolutions=[];let waiting=0,oldestWaitingMs=0;
  for(const dossier of all){
    const created=Number(dossier.createdAt);if(!Number.isFinite(created)||created<=0)continue;
    const first=(dossier.history||[]).filter(m=>m.from==='staff'&&m.at>=created).sort((a,b)=>a.at-b.at)[0];
    const open=['open','waiting_info'].includes(dossier.status);
    if(open&&!first){waiting++;oldestWaitingMs=Math.max(oldestWaitingMs,now-created);}
    if(created>=now-days*86400000&&first)firstReplies.push(first.at-created);
    if(dossier.closedAt>=now-days*86400000&&dossier.closedAt>=created)resolutions.push(dossier.closedAt-created);
    const opened=range.get(dateKey(created));if(opened)opened.opened++;
    if(dossier.closedAt){const closed=range.get(dateKey(dossier.closedAt));if(closed)closed.closed++;}
  }
  const mean=values=>values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null;
  return {days,total:all.length,open:all.filter(d=>['open','waiting_info'].includes(d.status)).length,waiting,oldestWaitingMs,averageFirstReplyMs:mean(firstReplies),firstReplySamples:firstReplies.length,averageResolutionMs:mean(resolutions),resolutionSamples:resolutions.length,daily};
}
function validateContent(input){
  if(!input||typeof input!=='object')error(400,'Contenu invalide.');
  const list=(value,max,fn)=>{if(!Array.isArray(value)||value.length>max)error(400,'Liste invalide ou trop longue.');return value.map(item=>{if(item===null||item===undefined)error(400,'Entrée de liste invalide.');return fn(item);});};
  const url=value=>{const clean=text(value,1500);let parsed;try{parsed=new URL(clean);}catch(_){error(400,'URL d’image invalide.');}if(parsed.protocol!=='https:')error(400,'Les images doivent utiliser HTTPS.');return clean;};
  return {
    roadmap:list(input.roadmap,40,item=>{if(!['planned','in_progress','done'].includes(item.status))error(400,'Statut de développement invalide.');return{title:text(item.title,120),description:text(item.description,800),status:item.status};}),
    rules:list(input.rules,40,item=>({title:text(item.title,120),text:text(item.text,2000)})),
    presentation:{description:text(input.presentation?.description,3000),features:list(input.presentation?.features,20,item=>text(item,200)),screenshots:list(input.presentation?.screenshots,12,url)},
    faq:list(input.faq,40,item=>({question:text(item.question,200),answer:text(item.answer,2000)})),
    recruitment:{open:input.recruitment?.open===true,intro:text(input.recruitment?.intro,2000)}
  };
}
function installCommunity(app,{state,saveState,client,guildId,publicUrl,requireStaff,route}){
  const recruitment = createRecruitmentService({state,saveState,client,guildId,publicUrl});
  const content=()=>{
    const base=structuredClone(state.communityContent||DEFAULT_CONTENT);
    if(JSON.stringify(base.rules)===JSON.stringify(LEGACY_RULES))base.rules=structuredClone(RULES);
    const settings=settingsFor(state,base.recruitment);
    base.recruitment={...base.recruitment,types:settings.types,open:Object.values(settings.types).some(Boolean)};
    return base;
  };
  const has=(req,permission)=>req.staff?.permissions.includes(permission);
  const origin=(req)=>{if(req.headers.origin&&req.headers.origin!==new URL(publicUrl).origin)error(403,'Origine refusée.');};
  const user=(req)=>{if(!req.session?.user?.id)error(401,'Connecte-toi avec Discord.');return req.session.user;};
  const checkRevision=(entry,req)=>{if(req.body.revision!==entry.revision)error(409,'Ce dossier a changé. Actualise avant de continuer.');};
  for(const page of ['developpement','reglement','serveur','faq','candidatures'])app.get('/'+page,(req,res)=>res.sendFile(path.join(__dirname,'..','public','community.html')));
  app.get('/api/community',(req,res)=>res.json({content:content(),revision:state.contentRevision||0,recruitmentTypes:TYPES,rulesVersion:RULES_VERSION}));
  app.get('/api/applications/mine',route(async(req,res)=>{
    const applicant=user(req);res.set('Cache-Control','no-store');
    res.json((state.applications||[]).filter(row=>row.userId===applicant.id).map(row=>{
      const unpublished=['accepted','rejected'].includes(row.status)&&row.publicDecisionVersion>(row.publicResultPublishedVersion||0);
      const visible=unpublished?(row.publishedOutcome||row.preparedFrom||{status:'reviewing',feedback:''}):row;
      return{id:row.id,type:row.type,status:visible.status,feedback:visible.feedback,createdAt:row.createdAt,updatedAt:row.updatedAt,revision:row.revision,notificationStatus:row.notifications?.findLast(event=>!['accepted','rejected'].includes(event.kind)||event.status==='sent')?.status||null};
    }));
  }));
  app.post('/api/applications',route(async(req,res)=>{
    origin(req);const applicant=user(req);
    if(!content().recruitment.open)error(409,'Les candidatures sont actuellement fermées.');
    const type=req.body.type;
    if(!Object.hasOwn(TYPES,type||''))error(400,'Choisis le recrutement Helpeur ou Animateur.');
    if(!content().recruitment.types[type])error(409,'Ce type de recrutement est fermé.');
    const scenario=text(req.body.scenario,2000,30);
    const weeklyHours=Number(req.body.weeklyHours);
    if(!Number.isInteger(weeklyHours)||weeklyHours<1||weeklyHours>80)error(400,'Indique entre 1 et 80 heures de disponibilité par semaine.');
    if(req.body.rulesAccepted!==true)error(400,'Tu dois accepter le règlement.');
    const age=req.body.age,fivemHours=req.body.fivemHours;
    if(!Number.isInteger(age)||age<1||age>120)error(400,'Indique un âge valide en années.');
    if(!Number.isInteger(fivemHours)||fivemHours<0||fivemHours>100000)error(400,'Indique un nombre d’heures FiveM valide.');
    if(req.body.conditionsAccepted!==true)error(400,'Tu dois accepter les conditions : réponses personnelles, sans IA ni copier-coller.');
    const gameExperience=text(req.body.gameExperience,1500,10),qualities=text(req.body.qualities,1000,20),teamwork=text(req.body.teamwork,1500,30),history=text(req.body.history,1000,3);
    const motivation=text(req.body.motivation,2500,30),availability=text(req.body.availability,500,3),experience=text(req.body.experience,2000,3);
    await (await client.guilds.fetch(guildId)).members.fetch({user:applicant.id,force:true}).catch(e=>{if(e.code===10007)error(403,'Rejoins le serveur Discord avant de candidater.');throw e;});
    if(!content().recruitment.types[type])error(409,'Ce recrutement vient de fermer.');
    state.applications||=[];
    if(state.applications.some(row=>row.userId===applicant.id&&['pending','reviewing'].includes(row.status)))error(409,'Tu as déjà une candidature en cours d’étude.');
    if(state.applications.length>=2000)error(503,'Le formulaire est temporairement indisponible. Contacte l’équipe.');
    const entry={id:randomUUID(),userId:applicant.id,username:applicant.username,type,scenario,weeklyHours,age,fivemHours,gameExperience,qualities,teamwork,history,conditionsVersion:'staff-application-v2',conditionsAcceptedAt:Date.now(),rulesVersion:RULES_VERSION,motivation,availability,experience,status:'pending',feedback:'',createdAt:Date.now(),updatedAt:Date.now(),revision:1};
    state.applications.unshift(entry);saveState();
    const notification=recruitment.queueDM(entry,'received');
    const dmSent=await recruitment.deliver(entry,notification);
    res.status(201).json({ok:true,id:entry.id,dmSent});
  }));
  // Journal only successful writes; never store request bodies, OAuth values or private form answers here.
  app.use('/api/admin',(req,res,next)=>{
    const action = `${req.method} ${req.path.split('/')[1]||'panel'}`;
    const target = req.originalUrl.split('?')[0];
    if(!['GET','HEAD'].includes(req.method))res.on('finish',()=>{if(res.statusCode>=200&&res.statusCode<300){try{auditEvent(state,req.session.user,action,target,saveState);}catch(e){console.error('[STORM AUDIT]',e.message);}}});
    next();
  });
  const publishing=new Set();
  for(const pathname of ['announcements','patch-notes'])app.post('/api/admin/'+pathname,requireStaff,routeGuard);
  function routeGuard(req,res,next){
    try{
      if(!req.body.draftId){if(!req.staff.owner&&!has(req,'approvePublications'))error(403,'Enregistre un brouillon et demande sa validation avant de publier.');return next();}
      const draft=(state.drafts||[]).find(row=>row.id===req.body.draftId);
      const kind=req.path.includes('announcements')?'announcement':'patchNote';
      if(!draft||draft.kind!==kind)error(404,'Brouillon introuvable.');
      if(draft.status!=='approved'||publishing.has(draft.id))error(409,'Le brouillon doit être validé et ne pas être déjà publié.');
      if(req.body.revision!==draft.revision)error(409,'Le brouillon a changé. Recharge la liste.');
      const expectedVersion=req.body.expectedVersion;
      req.body={...structuredClone(draft.payload),expectedVersion};publishing.add(draft.id);
      res.on('close',()=>publishing.delete(draft.id));
      res.on('finish',()=>{publishing.delete(draft.id);if(res.statusCode>=200&&res.statusCode<300){draft.status='published';draft.publishedAt=Date.now();draft.publishedBy=req.session.user.id;draft.revision++;saveState();}});
      next();
    }catch(e){res.status(e.status||500).json({error:e.message});}
  }
  app.get('/api/admin/content',requireStaff,route(async(req,res)=>res.json({content:content(),revision:state.contentRevision||0,rulesTemplate:RULES})));
  app.post('/api/admin/content',requireStaff,route(async(req,res)=>{
    if(req.body.revision!==(state.contentRevision||0))error(409,'Le contenu a changé. Recharge la page.');
    const nextContent=validateContent(req.body.content);
    // Recruitment openings use their own announced workflow; content edits cannot bypass it.
    nextContent.recruitment.open=content().recruitment.open;
    state.communityContent=nextContent;state.contentRevision=(state.contentRevision||0)+1;saveState();res.json({ok:true,revision:state.contentRevision});
  }));
  app.get('/api/admin/recruitment',requireStaff,route(async(req,res)=>res.json({...settingsFor(state,(state.communityContent||DEFAULT_CONTENT).recruitment),typesInfo:TYPES})));
  app.post('/api/admin/recruitment',requireStaff,route(async(req,res)=>{
    const result=await recruitment.updateSettings({...req.body,base:(state.communityContent||DEFAULT_CONTENT).recruitment});res.json({ok:true,...result});
  }));
  app.get('/api/admin/applications/results',requireStaff,route(async(req,res)=>{const entries=recruitment.pendingResults().map(({feedback,...row})=>row);res.json({pending:entries.length,entries,lastError:state.recruitmentResultsError||null,batches:(state.recruitmentBatches||[]).slice(0,10)});}));
  app.post('/api/admin/applications/results',requireStaff,route(async(req,res)=>res.json({ok:true,...await recruitment.flushResults({selection:req.body.selection})})));
  app.post('/api/admin/applications/:id/notify',requireStaff,route(async(req,res)=>{
    const entry=(state.applications||[]).find(row=>row.id===req.params.id);if(!entry)error(404,'Candidature introuvable.');
    const event=entry.notifications?.at(-1);if(!event)error(409,'Aucune notification disponible.');
    if(['accepted','rejected'].includes(event.kind)&&(!event.decisionVersion||(entry.publicResultPublishedVersion||0)<event.decisionVersion))error(409,'Publie les résultats en attente avant de notifier une décision finale.');
    const dmSent=await recruitment.deliver(entry,event);res.json({ok:true,dmSent});
  }));
  app.get('/api/admin/applications',requireStaff,route(async(req,res)=>res.json(state.applications||[])));
  app.post('/api/admin/applications/:id',requireStaff,route(async(req,res)=>{
    const entry=(state.applications||[]).find(row=>row.id===req.params.id);if(!entry)error(404,'Candidature introuvable.');checkRevision(entry,req);
    if(!['reviewing','accepted','rejected'].includes(req.body.status))error(400,'Décision invalide.');
    const feedback=text(req.body.feedback||'',1500,0);
    const statusChanged=entry.status!==req.body.status;
    if(!statusChanged&&entry.feedback===feedback)return res.json({ok:true,unchanged:true});
    if(statusChanged&&['accepted','rejected'].includes(req.body.status)&&['pending','reviewing'].includes(entry.status))entry.preparedFrom={status:entry.status,feedback:entry.feedback||''};
    entry.status=req.body.status;entry.feedback=feedback;entry.reviewedBy=req.session.user.id;entry.updatedAt=Date.now();entry.revision++;
    if(statusChanged&&['accepted','rejected'].includes(entry.status))entry.publicDecisionVersion=(entry.publicDecisionVersion||0)+1;
    saveState();
    if(['accepted','rejected'].includes(entry.status))return res.json({ok:true,dmSent:false,resultsQueued:true});
    const notification=recruitment.queueDM(entry,entry.status,feedback);
    const dmSent=await recruitment.deliver(entry,notification);
    res.json({ok:true,dmSent,resultsQueued:['accepted','rejected'].includes(entry.status)});
  }));
  app.get('/api/admin/audit',requireStaff,route(async(req,res)=>{
    const search=String(req.query.q||'').slice(0,100).toLowerCase();
    res.json((state.audit||[]).filter(row=>!search||`${row.actor} ${row.actorId} ${row.action} ${row.target}`.toLowerCase().includes(search)).slice(0,200));
  }));
  app.get('/api/admin/statistics',requireStaff,route(async(req,res)=>res.json(supportStats(state,req.query.days==='7'?7:30))));
  app.get('/api/admin/members',requireStaff,route(async(req,res)=>{
    const query=text(req.query.q,100,2);const guild=await client.guilds.fetch(guildId);let members=[];
    if(ID.test(query)){const member=await guild.members.fetch({user:query,force:true}).catch(e=>{if(e.code===10007)return null;throw e;});if(member)members=[member];}
    else members=[...(await guild.members.search({query,limit:10})).values()];
    const rows=members.map(member=>({id:member.id,username:member.user?.username||member.displayName||member.id,avatar:member.user?.displayAvatarURL?.()||''}));
    if(ID.test(query)&&!rows.length&&[...(state.moderation||[]),...Object.values(state.tickets||{}),...Object.values(state.appeals||{})].some(row=>row.userId===query))rows.push({id:query,username:'Ancien membre / historique local',avatar:''});
    res.json(rows);
  }));
  app.get('/api/admin/members/:id',requireStaff,route(async(req,res)=>{
    if(!ID.test(req.params.id))error(400,'Identifiant Discord invalide.');
    const guild=await client.guilds.fetch(guildId);const member=await guild.members.fetch({user:req.params.id,force:true}).catch(e=>{if(e.code===10007)return null;throw e;});
    const tickets=[...Object.entries(state.tickets||{}).map(([channelId,row])=>({...row,channelId,kind:'ticket'})),...Object.entries(state.appeals||{}).map(([channelId,row])=>({...row,channelId,kind:'appeal'}))].filter(row=>row.userId===req.params.id).map(({id,channelId,kind,status,createdAt,closedAt})=>({id,channelId,kind,status,createdAt,closedAt}));
    const moderation=(state.moderation||[]).filter(row=>row.userId===req.params.id);
    if(!member&&!tickets.length&&!moderation.length)error(404,'Membre introuvable.');
    res.json({id:req.params.id,username:member?.user?.username||member?.displayName||'Ancien membre',avatar:member?.user?.displayAvatarURL?.()||'',joinedAt:member?.joinedTimestamp||null,roles:member?[...member.roles.cache.values()].filter(role=>role.id!==guildId).map(role=>({id:role.id,name:role.name})):[],tickets,moderation});
  }));
  const draftPermission=kind=>kind==='announcement'?'announcements':kind==='patchNote'?'patchNotes':null;
  const payload=(kind,input)=>{
    if(kind==='announcement'){
      const image=typeof input?.image==='string'?input.image.trim():'';
      if(image){let parsed;try{parsed=new URL(image);}catch(_){error(400,'URL d’image invalide.');}if(parsed.protocol!=='https:'||image.length>1500)error(400,'L’image doit utiliser une URL HTTPS valide.');}
      return{title:text(input?.title,200),message:text(input?.message,3500),image,pingEveryone:input?.pingEveryone===true};
    }
    const sections={};for(const key of ['additions','changes','fixes','optimizations'])sections[key]=text(input?.sections?.[key]||'',1500,0);
    if(!Object.values(sections).some(Boolean))error(400,'Une rubrique au minimum est obligatoire.');return{sections};
  };
  app.get('/api/admin/drafts',requireStaff,route(async(req,res)=>{
    if(!has(req,'drafts')&&!has(req,'approvePublications'))error(403,'Accès aux brouillons refusé.');
    res.json((state.drafts||[]).filter(row=>has(req,draftPermission(row.kind))||has(req,'approvePublications')));
  }));
  app.post('/api/admin/drafts',requireStaff,route(async(req,res)=>{
    if(!has(req,'drafts')||!has(req,draftPermission(req.body.kind)))error(403,'Tu ne peux pas rédiger ce type de publication.');
    const entry={id:randomUUID(),kind:req.body.kind,payload:payload(req.body.kind,req.body.payload),status:'draft',authorId:req.session.user.id,author:req.session.user.username,createdAt:Date.now(),updatedAt:Date.now(),revision:1};
    state.drafts||=[];if(state.drafts.length>=1000)error(409,'La limite de brouillons est atteinte.');state.drafts.unshift(entry);saveState();res.status(201).json(entry);
  }));
  app.post('/api/admin/drafts/:id',requireStaff,route(async(req,res)=>{
    const entry=(state.drafts||[]).find(row=>row.id===req.params.id);if(!entry)error(404,'Brouillon introuvable.');checkRevision(entry,req);
    if(publishing.has(entry.id)||entry.status==='published')error(409,'Cette publication ne peut plus être modifiée.');
    const action=req.body.action;
    if(['approve','reject'].includes(action)){
      if(!has(req,'approvePublications'))error(403,'Droit de validation requis.');
      if(entry.status!=='pending')error(409,'Ce brouillon n’est pas en attente de validation.');
      if(entry.authorId===req.session.user.id&&!req.staff.owner)error(403,'Un autre responsable doit valider ton brouillon.');
      entry.reviewComment=text(req.body.comment||'',1000,action==='reject'?3:0);entry.status=action==='approve'?'approved':'draft';entry.reviewedBy=req.session.user.id;
    }else{
      if(!has(req,'drafts')||!has(req,draftPermission(entry.kind))||(entry.authorId!==req.session.user.id&&!req.staff.owner))error(403,'Seul l’auteur ou le propriétaire peut modifier ce brouillon.');
      if(action==='edit'){entry.payload=payload(entry.kind,req.body.payload);entry.status='draft';delete entry.reviewedBy;delete entry.reviewComment;}
      else if(action==='submit'&&entry.status==='draft')entry.status='pending';
      else error(409,'Transition de brouillon invalide.');
    }
    entry.updatedAt=Date.now();entry.revision++;saveState();res.json(entry);
  }));
}
module.exports={installCommunity,DEFAULT_CONTENT,validateContent,supportStats,auditEvent};
