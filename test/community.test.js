const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {installPanel,PERMISSIONS,CHANNELS}=require('../src/panel');
const {DEFAULT_CONTENT,supportStats}=require('../src/community');
const {ChannelType}=require('discord.js');
const applicationProfile={age:19,fivemHours:450,gameExperience:'J’ai découvert plusieurs modes PVP et participé à des événements.',qualities:'Patient et organisé, je travaille encore ma prise de parole.',teamwork:'Je discute calmement en privé, je présente les faits puis je demande un arbitrage si nécessaire.',history:'Non',conditionsAccepted:true};
const ids={owner:'111111111111111111',author:'222222222222222222',reviewer:'333333333333333333',candidate:'444444444444444444',other:'555555555555555555',role:'666666666666666666',reviewRole:'777777777777777777',guild:'888888888888888888'};
async function fixture(fn){
 const state={siteConfig:{development:true},tickets:{},appeals:{},moderation:[]};
 const config={panelRoles:{[ids.role]:['announcements','patchNotes','drafts'],[ids.reviewRole]:['approvePublications','announcements','patchNotes']}};
 const calls=[];let lastPublication;
 const member=id=>({id,user:{username:'User '+id,displayAvatarURL:()=>''},roles:{cache:new Map(id===ids.author?[[ids.role,{id:ids.role,name:'Auteur'}]]:id===ids.reviewer?[[ids.reviewRole,{id:ids.reviewRole,name:'Responsable'}]]:[])},joinedTimestamp:1000});
 const guild={ownerId:ids.owner,members:{fetch:async({user})=>member(user),search:async()=>new Map([[ids.candidate,member(ids.candidate)]])},channels:{fetch:async id=>({id,guildId:ids.guild,type:ChannelType.GuildText,send:async payload=>{calls.push({id,payload});return{id:'999999999999999999'};}})}};
 const directMessages=[];
 const client={guilds:{fetch:async()=>guild},users:{fetch:async id=>({send:async payload=>{directMessages.push({id,payload});return{id:'dm1'};}})}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.headers['x-user'])req.session={user:{id:req.headers['x-user'],username:req.headers['x-user']===ids.owner?'Owner':'User'}};next();});
 installPanel(app,{state,getConfig:()=>config,saveState:()=>{},saveConfig:()=>{},client,guildId:ids.guild,publicUrl:'http://localhost'});
 app.post('/api/admin/announcements',(req,res)=>{lastPublication=req.body;res.json({ok:true});});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,body,user=ids.owner,origin)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(user?{'x-user':user}:{}),...(body?{'content-type':'application/json'}:{}),...(origin?{origin}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json()};};
 try{await fn({state,config,calls,request,publication:()=>lastPublication,guild,client,directMessages});}finally{await new Promise(resolve=>server.close(resolve));}
}
test('public content is editable with revisions, validated URLs, and a separate permission',async()=>fixture(async({state,request})=>{
 const data=await request('/api/community');assert.equal(data.status,200);assert.equal(data.body.content.faq.length,3);
 assert.equal((await request('/api/admin/content',undefined,ids.author)).status,403);
 const content=structuredClone(DEFAULT_CONTENT);content.presentation.description='Un projet de communauté mis à jour.';
 assert.equal((await request('/api/admin/content',{content,revision:0})).status,200);
 assert.equal((await request('/api/admin/content',{content,revision:0})).status,409);
 assert.equal((await request('/api/community')).body.content.presentation.description,content.presentation.description);
 content.presentation.screenshots=['javascript:alert(1)'];
 assert.equal((await request('/api/admin/content',{content,revision:1})).status,400);
 assert.equal(state.contentRevision,1);assert.equal(state.audit.length,1);assert.equal(state.audit[0].action,'POST content');
 assert.ok(!JSON.stringify(state.audit).includes('Un projet de communauté'));
}));
test('applications require membership, consent and login, prevent duplicates, and keep tracking private',async()=>fixture(async({state,request})=>{
 const body={...applicationProfile,type:'helper',scenario:'Je reste calme et je prends le temps de comprendre le problème.',weeklyHours:8,motivation:'Je souhaite aider la communauté et accompagner les nouveaux joueurs.',experience:'Gestion de communauté',availability:'Les soirs et le week-end',rulesAccepted:true};
 assert.equal((await request('/api/applications',body,null)).status,401);
 assert.equal((await request('/api/applications',body,ids.candidate,'https://elsewhere.example')).status,403);
 assert.equal((await request('/api/applications',{...body,rulesAccepted:false},ids.candidate)).status,400);
 const created=await request('/api/applications',body,ids.candidate);assert.equal(created.status,201);
 assert.equal((await request('/api/applications',body,ids.candidate)).status,409);
 assert.deepEqual((await request('/api/applications/mine',undefined,ids.other)).body,[]);
 const mine=(await request('/api/applications/mine',undefined,ids.candidate)).body;
 assert.equal(mine.length,1);assert.ok(!Object.hasOwn(mine[0],'motivation'));
 assert.equal((await request('/api/admin/applications',undefined,ids.candidate)).status,403);
 const entry=state.applications[0];
 assert.equal((await request('/api/admin/applications/'+entry.id,{status:'accepted',feedback:'Bienvenue dans l’équipe !',revision:1})).status,200);
 assert.equal((await request('/api/admin/applications/'+entry.id,{status:'rejected',feedback:'Ancien formulaire',revision:1})).status,409);
 assert.equal((await request('/api/applications/mine',undefined,ids.candidate)).body[0].status,'pending');
 assert.equal((await request('/api/admin/applications/results',{})).status,200);
 assert.equal((await request('/api/applications/mine',undefined,ids.candidate)).body[0].status,'accepted');
 const publicData=await request('/api/community');assert.ok(!JSON.stringify(publicData.body).includes(entry.motivation));
 state.communityContent=structuredClone(DEFAULT_CONTENT);state.communityContent.recruitment.open=false;
 assert.equal((await request('/api/applications',body,ids.other)).status,409);
}));
test('member records require permission and combine sanctions with summarized support history',async()=>fixture(async({state,request})=>{
 state.tickets.x={id:'T-1',userId:ids.candidate,status:'open',createdAt:1000,history:[{content:'private discussion'}]};state.moderation.push({userId:ids.candidate,action:'warn',reason:'Spam',createdAt:1000});
 assert.equal((await request('/api/admin/members?q=User',undefined,ids.author)).status,403);
 assert.equal((await request('/api/admin/members?q=User')).body.length,1);
 const profile=await request('/api/admin/members/'+ids.candidate);assert.equal(profile.status,200);assert.equal(profile.body.moderation.length,1);assert.equal(profile.body.tickets.length,1);assert.ok(!JSON.stringify(profile.body).includes('private discussion'));
}));
test('statistics use real first staff replies, exclude bot messages and handle absent samples',()=>{
 const now=Date.parse('2026-11-07T12:00:00Z');
 const stats=supportStats({tickets:{a:{createdAt:now-3600000,status:'open',history:[{from:'bot',at:now-3500000}]},b:{createdAt:now-7200000,status:'closed',closedAt:now-3600000,history:[{from:'staff',at:now-5400000}]}},appeals:{}},7,now);
 assert.equal(stats.waiting,1);assert.equal(stats.averageFirstReplyMs,1800000);assert.equal(stats.averageResolutionMs,3600000);assert.equal(stats.firstReplySamples,1);assert.equal(stats.daily.reduce((sum,row)=>sum+row.opened,0),2);
 assert.equal(supportStats({tickets:{},appeals:{}},7,now).averageFirstReplyMs,null);
});
test('drafts need validation; publication uses approved content and cannot be duplicated',async()=>fixture(async({state,request,publication})=>{
 const payload={title:'Contenu approuvé',message:'Message original'};
 assert.equal((await request('/api/admin/announcements',payload,ids.author)).status,403);
 let draft=(await request('/api/admin/drafts',{kind:'announcement',payload},ids.author)).body;assert.equal(draft.status,'draft');
 draft=(await request('/api/admin/drafts/'+draft.id,{action:'submit',revision:1},ids.author)).body;assert.equal(draft.status,'pending');
 assert.equal((await request('/api/admin/drafts/'+draft.id,{action:'approve',revision:2},ids.author)).status,403);
 draft=(await request('/api/admin/drafts/'+draft.id,{action:'approve',revision:2},ids.reviewer)).body;assert.equal(draft.status,'approved');
 assert.equal((await request('/api/admin/announcements',{draftId:draft.id,revision:3,title:'Tampered',message:'Malicious replacement'},ids.author)).status,200);
 assert.equal(publication().title,'Contenu approuvé');assert.equal(publication().message,'Message original');
 assert.equal(state.drafts[0].status,'published');
 assert.equal((await request('/api/admin/announcements',{draftId:draft.id,revision:3},ids.author)).status,409);
 assert.equal((await request('/api/admin/drafts/'+draft.id,{action:'edit',revision:4,payload},ids.author)).status,409);
}));
test('editing approved drafts resets validation; an author cannot self-approve unless owner',async()=>fixture(async({state,config,request})=>{
 config.panelRoles[ids.role].push('approvePublications');
 let draft=(await request('/api/admin/drafts',{kind:'patchNote',payload:{sections:{fixes:'Correction d’un bug'}}},ids.author)).body;
 draft=(await request('/api/admin/drafts/'+draft.id,{action:'submit',revision:1},ids.author)).body;
 assert.equal((await request('/api/admin/drafts/'+draft.id,{action:'approve',revision:2},ids.author)).status,403);
 await request('/api/admin/drafts/'+draft.id,{action:'approve',revision:2},ids.reviewer);
 draft=(await request('/api/admin/drafts/'+draft.id,{action:'edit',revision:3,payload:{sections:{fixes:'Autre correction'}}},ids.author)).body;
 assert.equal(draft.status,'draft');assert.equal(draft.revision,4);
 assert.equal((await request('/api/admin/patch-notes',{draftId:draft.id,revision:4},ids.author)).status,409);
 assert.equal((await request('/api/admin/drafts',undefined,ids.candidate)).status,403);
}));
test('approved patch drafts keep role mentions, versions and their published state',async()=>fixture(async({state,calls,request})=>{
 let draft=(await request('/api/admin/drafts',{kind:'patchNote',payload:{sections:{additions:'Un ajout validé',fixes:'Une correction'}}},ids.author)).body;
 await request('/api/admin/drafts/'+draft.id,{action:'submit',revision:1},ids.author);
 await request('/api/admin/drafts/'+draft.id,{action:'approve',revision:2},ids.reviewer);
 assert.equal((await request('/api/admin/patch-notes',{draftId:draft.id,revision:3,expectedVersion:'v1.0.0'},ids.author)).status,200);
 assert.equal(calls[0].id,CHANNELS.patchNotes);assert.ok(calls[0].payload.content.startsWith('<@&1568307263695749201>'));
 assert.equal(state.patchNotes[0].version,'v1.0.0');assert.equal(state.drafts[0].status,'published');
}));
test('nonmembers cannot apply and readers cannot access restricted statistics or journals',async()=>fixture(async({guild,request})=>{
 const fetch=guild.members.fetch;guild.members.fetch=async args=>{if(args.user===ids.candidate){const err=new Error('Unknown member');err.code=10007;throw err;}return fetch(args);};
 assert.equal((await request('/api/applications',{...applicationProfile,type:'helper',scenario:'Je reste calme et j’écoute les personnes concernées avant de proposer une solution.',weeklyHours:8,motivation:'Une motivation suffisamment longue pour rejoindre le staff.',experience:'Support',availability:'Soirs',rulesAccepted:true},ids.candidate)).status,403);
 for(const path of ['/api/admin/audit','/api/admin/statistics','/api/admin/applications'])assert.equal((await request(path,undefined,ids.author)).status,403);
}));
const recruitmentBody={...applicationProfile,type:'helper',scenario:'Je reste calme, je reformule la demande et je cherche les faits sans prendre parti.',weeklyHours:8,motivation:'Je souhaite accompagner les joueurs et contribuer au bon fonctionnement du serveur.',experience:'Gestion de tickets et animation de communauté',availability:'Les soirs et le week-end',rulesAccepted:true};
test('recruitment types open independently, announce links and ping only the configured role',async()=>fixture(async({state,request,calls})=>{
 state.recruitmentSettings={types:{helper:false,animator:false},revision:0};
 assert.equal((await request('/api/admin/recruitment',{types:{helper:true,animator:false},revision:0},ids.author)).status,403);
 const opened=await request('/api/admin/recruitment',{types:{helper:true,animator:false},revision:0});assert.equal(opened.status,200);assert.equal(opened.body.announced,true);
 assert.equal(calls[0].id,'1568410724605239326');assert.deepEqual(calls[0].payload.allowedMentions,{parse:[],roles:['1564827474099966103']});assert.ok(calls[0].payload.components[0].components.some(button=>button.url.includes('candidatures?type=helper')));assert.ok(calls[0].payload.embeds[0].fields.some(field=>field.name.includes('Animateur — FERMÉ')));assert.ok(calls[0].payload.embeds[0].image.url);assert.ok(calls[0].payload.embeds[0].thumbnail.url);
 const publicInfo=(await request('/api/community')).body;assert.deepEqual(publicInfo.content.recruitment.types,{helper:true,animator:false});assert.ok(publicInfo.recruitmentTypes.animator.question);
 assert.equal((await request('/api/applications',{...recruitmentBody,type:'animator'},ids.candidate)).status,409);
 assert.equal((await request('/api/admin/recruitment',{types:{helper:true,animator:false},revision:1})).body.announced,false);assert.equal(calls.length,1);
 assert.equal((await request('/api/admin/recruitment',{types:{helper:false,animator:false},revision:2})).status,200);assert.deepEqual(calls[1].payload.allowedMentions.roles,[]);
 assert.equal((await request('/api/applications',recruitmentBody,ids.candidate)).status,409);
}));
test('failed opening announcements do not silently open recruitment or overwrite concurrent settings',async()=>fixture(async({state,guild,request})=>{
 state.recruitmentSettings={types:{helper:false,animator:false},revision:0};
 guild.channels.fetch=async()=>({guildId:ids.guild,type:ChannelType.GuildText,send:async()=>{throw Error('Discord unavailable');}});
 assert.equal((await request('/api/admin/recruitment',{types:{helper:true,animator:false},revision:0})).status,502);
 assert.deepEqual(state.recruitmentSettings.types,{helper:false,animator:false});assert.equal(state.recruitmentSettings.revision,0);
 assert.equal((await request('/api/admin/recruitment',{types:{helper:true,animator:false},revision:99})).status,409);
}));
test('applicants receive private status notifications and final decisions are published together without private reasons',async()=>fixture(async({state,request,calls,directMessages})=>{
 assert.equal((await request('/api/applications',recruitmentBody,ids.candidate)).body.dmSent,true);
 assert.equal((await request('/api/applications',{...recruitmentBody,type:'animator'},ids.other)).status,201);
 assert.equal(directMessages.length,2);assert.match(directMessages[0].payload.content,/Helpeur/);assert.deepEqual(directMessages[0].payload.allowedMentions,{parse:[]});
 const helper=state.applications.find(row=>row.userId===ids.candidate),animator=state.applications.find(row=>row.userId===ids.other);
 assert.equal((await request('/api/admin/applications/'+helper.id,{status:'reviewing',feedback:'Nous étudions ton dossier.',revision:1})).body.dmSent,true);
 assert.equal((await request('/api/admin/applications/'+helper.id,{status:'accepted',feedback:'Motif privé accepté',revision:2})).status,200);
 assert.equal((await request('/api/admin/applications/'+animator.id,{status:'rejected',feedback:'Motif privé refusé',revision:1})).status,200);
 assert.equal(directMessages.length,3);assert.equal(calls.length,0);
 assert.equal((await request('/api/admin/applications/results')).body.pending,2);
 assert.equal((await request('/api/admin/applications/results',{})).body.sent,2);
 assert.equal(calls.length,1);assert.equal(calls[0].id,'1568419705893687459');assert.equal(directMessages.length,5);const result=calls[0].payload;
 assert.match(result.content,/CANDIDATURES ACCEPTÉES/);assert.match(result.content,/CANDIDATURES REFUSÉES/);assert.ok(result.content.includes(`<@${ids.candidate}>`));assert.ok(!result.content.includes('Motif privé'));
 assert.deepEqual(result.allowedMentions.users.sort(),[ids.candidate,ids.other].sort());assert.equal(result.content.length<2000,true);
 assert.equal((await request('/api/admin/applications/results',{})).body.sent,0);assert.equal(calls.length,1);
}));
test('closed DMs do not lose an application or decision; notification retry is idempotent',async()=>fixture(async({state,client,request,directMessages})=>{
 const original=client.users.fetch;client.users.fetch=async()=>{const err=new Error('Cannot DM');err.code=50007;throw err;};
 const result=await request('/api/applications',recruitmentBody,ids.candidate);assert.equal(result.status,201);assert.equal(result.body.dmSent,false);
 const entry=state.applications[0];assert.equal(entry.notifications[0].status,'failed');
 assert.equal((await request('/api/admin/applications/'+entry.id,{status:'accepted',feedback:'Bienvenue !',revision:1})).status,200);assert.equal(entry.status,'accepted');
 assert.equal((await request('/api/admin/applications/results',{})).body.dmFailed,1);
 assert.equal((await request('/api/admin/applications/results')).body.pending,1);
 client.users.fetch=original;
 assert.equal((await request('/api/admin/applications/'+entry.id+'/notify',{})).body.dmSent,true);assert.equal(directMessages.length,1);
 assert.equal((await request('/api/admin/applications/'+entry.id+'/notify',{})).body.dmSent,true);assert.equal(directMessages.length,1);
 assert.equal((await request('/api/applications/mine',undefined,ids.candidate)).body[0].notificationStatus,'sent');
}));
test('detailed FiveM and Discord rules replace only the unchanged legacy template',async()=>fixture(async({state,request})=>{
 const {LEGACY_RULES}=require('../src/rules');
 state.communityContent=structuredClone(DEFAULT_CONTENT);state.communityContent.rules=structuredClone(LEGACY_RULES);
 let content=(await request('/api/community')).body.content;assert.ok(content.rules.length>=18);assert.ok(content.rules.some(rule=>rule.title.startsWith('FIVEM')));assert.ok(content.rules.some(rule=>rule.title.startsWith('DISCORD')));
 state.communityContent.rules=[{title:'Notre règle personnalisée',text:'Une règle modifiée par l’équipe.'}];
 content=(await request('/api/community')).body.content;assert.equal(content.rules[0].title,'Notre règle personnalisée');
 assert.ok((await request('/api/admin/content')).body.rulesTemplate.length>=18);
}));
test('manual result publication keeps confirmed groups on partial failure',async()=>fixture(async({state,client,guild,calls,request})=>{
 const {createRecruitmentService}=require('../src/recruitment');
 state.applications=Array.from({length:13},(_,i)=>({id:'candidate-'+i,userId:String(900000000000000000n+BigInt(i)),type:i%2?'animator':'helper',status:i%2?'rejected':'accepted',publicDecisionVersion:1}));
 const baseFetch=guild.channels.fetch;let sends=0;
 guild.channels.fetch=async id=>{const dest=await baseFetch(id);const send=dest.send;dest.send=async payload=>{sends++;if(sends===2)throw Error('Temporary failure');return send(payload);};return dest;};
 const service=createRecruitmentService({state,saveState:()=>{},client,guildId:ids.guild,publicUrl:'http://localhost'});
 await assert.rejects(service.flushResults(),/Temporary failure/);
 assert.equal(state.applications.filter(row=>row.publicResultPublishedVersion===1).length,12);assert.equal(calls.length,1);
 guild.channels.fetch=baseFetch;
 assert.equal((await service.flushResults()).sent,1);assert.equal(calls.length,2);assert.equal((await service.flushResults()).sent,0);
 assert.ok(!state.recruitmentResultsError);
}));
test('closing recruitment still takes effect when Discord announcements fail',async()=>fixture(async({state,guild,request})=>{
 state.recruitmentSettings={types:{helper:true,animator:true},revision:0};
 guild.channels.fetch=async()=>({guildId:ids.guild,type:ChannelType.GuildText,send:async()=>{throw Error('Discord unavailable');}});
 const response=await request('/api/admin/recruitment',{types:{helper:false,animator:false},revision:0});assert.equal(response.status,200);assert.ok(response.body.announcementError);assert.deepEqual(state.recruitmentSettings.types,{helper:false,animator:false});
 assert.equal((await request('/api/applications',recruitmentBody,ids.candidate)).status,409);
}));
test('final decisions are silent, previewed by name, and allow another test application immediately',async()=>fixture(async({state,request,directMessages,calls})=>{
 await request('/api/applications',recruitmentBody,ids.candidate);const entry=state.applications[0];const initialDMs=directMessages.length;
 const decision=await request('/api/admin/applications/'+entry.id,{status:'rejected',feedback:'',revision:1});
 assert.equal(decision.status,200);assert.equal(decision.body.resultsQueued,true);assert.equal(directMessages.length,initialDMs);assert.equal(calls.length,0);
 const preview=(await request('/api/admin/applications/results')).body;
 assert.equal(preview.entries[0].id,entry.id);assert.equal(preview.entries[0].username,entry.username);assert.equal(preview.entries[0].status,'rejected');assert.equal(preview.entries[0].type,'helper');assert.ok(!Object.hasOwn(preview.entries[0],'feedback'));
 const mine=(await request('/api/applications/mine',undefined,ids.candidate)).body[0];assert.equal(mine.status,'pending');assert.equal(mine.feedback,'');
 assert.equal((await request('/api/applications',recruitmentBody,ids.candidate)).status,201); // no 24-hour cooldown
 const publish=await request('/api/admin/applications/results',{selection:preview.entries.map(({id,version})=>({id,version}))});
 assert.equal(publish.body.sent,1);assert.equal(publish.body.dmSent,1);assert.equal(calls[0].id,'1568419705893687459');assert.equal(directMessages.length,initialDMs+2); // new receipt + final result
 assert.match(directMessages.at(-1).payload.content,/refusée/);
}));
test('a preview selection publishes only reviewed rows and rejects obsolete decisions',async()=>fixture(async({state,request,calls,directMessages})=>{
 await request('/api/applications',recruitmentBody,ids.candidate);await request('/api/applications',recruitmentBody,ids.other);
 const a=state.applications.find(row=>row.userId===ids.candidate),b=state.applications.find(row=>row.userId===ids.other);
 await request('/api/admin/applications/'+a.id,{status:'accepted',feedback:'',revision:1});
 const selection=(await request('/api/admin/applications/results')).body.entries.map(({id,version})=>({id,version}));
 await request('/api/admin/applications/'+b.id,{status:'rejected',feedback:'',revision:1});
 const result=await request('/api/admin/applications/results',{selection});assert.equal(result.body.sent,1);assert.equal((await request('/api/admin/applications/results')).body.pending,1);assert.ok(!calls[0].payload.content.includes(b.userId));
 assert.equal((await request('/api/admin/applications/results',{selection})).status,409);assert.equal(calls.length,1);
}));
test('retrying failed final DMs never republishes the public announcement',async()=>fixture(async({state,client,request,calls,directMessages})=>{
 await request('/api/applications',recruitmentBody,ids.candidate);const entry=state.applications[0];await request('/api/admin/applications/'+entry.id,{status:'accepted',feedback:'Bienvenue',revision:1});
 const original=client.users.fetch;client.users.fetch=async()=>{throw Error('DM blocked');};
 const first=await request('/api/admin/applications/results',{});assert.equal(first.body.sent,1);assert.equal(first.body.dmFailed,1);assert.equal(calls.length,1);
 const preview=(await request('/api/admin/applications/results')).body;assert.equal(preview.entries[0].publicSent,true);assert.equal(preview.entries[0].dmStatus,'failed');
 client.users.fetch=original;const retry=await request('/api/admin/applications/results',{});assert.equal(retry.body.sent,0);assert.equal(retry.body.dmSent,1);assert.equal(calls.length,1);assert.equal((await request('/api/admin/applications/results')).body.pending,0);
}));
test('legacy pending final notifications cannot bypass the Publish action',async()=>fixture(async({state,request,directMessages})=>{
 state.applications=[{id:'legacy',userId:ids.candidate,status:'accepted',publicDecisionVersion:1,notifications:[{id:'old',kind:'accepted',status:'pending',content:'Do not send yet'}]}];
 assert.equal((await request('/api/admin/applications/legacy/notify',{})).status,409);assert.equal(directMessages.length,0);
}));
test('new application profile and writing conditions are required, validated and kept private',async()=>fixture(async({state,request})=>{
 for(const change of [{age:0},{age:'19'},{fivemHours:-1},{conditionsAccepted:false},{teamwork:'Court'}])assert.equal((await request('/api/applications',{...recruitmentBody,...change},ids.candidate)).status,400);
 const missing={...recruitmentBody};delete missing.conditionsAccepted;assert.equal((await request('/api/applications',missing,ids.candidate)).status,400);
 assert.equal((await request('/api/applications',{...recruitmentBody,fivemHours:0},ids.candidate)).status,201);
 const entry=state.applications[0];assert.equal(entry.age,19);assert.equal(entry.fivemHours,0);assert.equal(entry.conditionsVersion,'staff-application-v2');assert.ok(entry.conditionsAcceptedAt);assert.equal(entry.teamwork,applicationProfile.teamwork);
 const mine=(await request('/api/applications/mine',undefined,ids.candidate)).body[0];assert.ok(!Object.hasOwn(mine,'age'));assert.ok(!Object.hasOwn(mine,'fivemHours'));
 const staff=(await request('/api/admin/applications')).body[0];assert.equal(staff.age,19);assert.equal(staff.gameExperience,applicationProfile.gameExperience);
 assert.ok(!JSON.stringify((await request('/api/community')).body).includes(applicationProfile.teamwork));
}));
test('AI consent belongs to the applicant and AI reports remain staff-only',async()=>fixture(async({state,request})=>{
 await request('/api/applications',recruitmentBody,ids.candidate);const entry=state.applications[0];assert.equal(entry.aiReview.status,'declined');
 assert.equal((await request('/api/admin/applications/'+entry.id+'/analyze',{revision:1})).status,403);
 assert.equal((await request('/api/applications/'+entry.id+'/ai-consent',{consent:true},ids.other)).status,404);
 assert.equal((await request('/api/applications/'+entry.id+'/ai-consent',{consent:true},ids.candidate)).status,200);assert.equal(entry.aiReviewConsent,true);assert.equal(entry.aiReview.status,'not_configured');
 assert.equal((await request('/api/admin/applications/'+entry.id+'/analyze',{revision:1})).status,503);
 entry.aiReview={status:'completed',report:{summary:'Private AI report'}};
 const mine=(await request('/api/applications/mine',undefined,ids.candidate)).body[0];assert.equal(mine.aiReviewConsent,true);assert.ok(!Object.hasOwn(mine,'aiReview'));assert.ok(!JSON.stringify((await request('/api/community')).body).includes('Private AI report'));
 assert.equal((await request('/api/admin/applications/ai-status')).body.configured,false);
}));
