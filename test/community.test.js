const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {installPanel,PERMISSIONS,CHANNELS}=require('../src/panel');
const {DEFAULT_CONTENT,supportStats}=require('../src/community');
const {ChannelType}=require('discord.js');
const ids={owner:'111111111111111111',author:'222222222222222222',reviewer:'333333333333333333',candidate:'444444444444444444',other:'555555555555555555',role:'666666666666666666',reviewRole:'777777777777777777',guild:'888888888888888888'};
async function fixture(fn){
 const state={siteConfig:{development:true},tickets:{},appeals:{},moderation:[]};
 const config={panelRoles:{[ids.role]:['announcements','patchNotes','drafts'],[ids.reviewRole]:['approvePublications','announcements','patchNotes']}};
 const calls=[];let lastPublication;
 const member=id=>({id,user:{username:'User '+id,displayAvatarURL:()=>''},roles:{cache:new Map(id===ids.author?[[ids.role,{id:ids.role,name:'Auteur'}]]:id===ids.reviewer?[[ids.reviewRole,{id:ids.reviewRole,name:'Responsable'}]]:[])},joinedTimestamp:1000});
 const guild={ownerId:ids.owner,members:{fetch:async({user})=>member(user),search:async()=>new Map([[ids.candidate,member(ids.candidate)]])},channels:{fetch:async id=>({id,guildId:ids.guild,type:ChannelType.GuildText,send:async payload=>{calls.push({id,payload});return{id:'999999999999999999'};}})}};
 const client={guilds:{fetch:async()=>guild}};
 const app=express();app.use(express.json());app.use((req,res,next)=>{if(req.headers['x-user'])req.session={user:{id:req.headers['x-user'],username:req.headers['x-user']===ids.owner?'Owner':'User'}};next();});
 installPanel(app,{state,getConfig:()=>config,saveState:()=>{},saveConfig:()=>{},client,guildId:ids.guild,publicUrl:'http://localhost'});
 app.post('/api/admin/announcements',(req,res)=>{lastPublication=req.body;res.json({ok:true});});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,body,user=ids.owner,origin)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(user?{'x-user':user}:{}),...(body?{'content-type':'application/json'}:{}),...(origin?{origin}:{})},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,body:await r.json()};};
 try{await fn({state,config,calls,request,publication:()=>lastPublication,guild});}finally{await new Promise(resolve=>server.close(resolve));}
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
 const body={motivation:'Je souhaite aider la communauté et accompagner les nouveaux joueurs.',experience:'Gestion de communauté',availability:'Les soirs et le week-end',rulesAccepted:true};
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
 assert.equal((await request('/api/applications',{motivation:'Une motivation suffisamment longue pour rejoindre le staff.',experience:'Support',availability:'Soirs',rulesAccepted:true},ids.candidate)).status,403);
 for(const path of ['/api/admin/audit','/api/admin/statistics','/api/admin/applications'])assert.equal((await request(path,undefined,ids.author)).status,403);
}));
