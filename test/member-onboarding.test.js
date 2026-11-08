const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ChannelType}=require('discord.js');
const {createMemberOnboarding,rulesMessages,WELCOME_CHANNEL,RULES_CHANNEL,PENDING_ROLE,MEMBER_ROLE,ACCEPT_ID}=require('../src/member-onboarding');
function fixture(){
 const state={},calls=[],messages=new Map(),roles=new Set();let serial=0;
 const guild={id:'111111111111111111',channels:{fetch:async id=>({id,guildId:guild.id,type:ChannelType.GuildText,messages:{fetch:async id=>{if(!messages.has(id)){const e=new Error('Unknown message');e.code=10008;throw e;}return messages.get(id);}},send:async payload=>{const message={id:String(++serial),author:{id:'bot'},edit:async value=>{calls.push({action:'edit',channel:id,payload:value});return message;}};messages.set(message.id,message);calls.push({action:'send',channel:id,payload});return message;}})},roles:{fetch:async id=>({id,managed:false,position:1})},members:{fetchMe:async()=>({permissions:{has:()=>true},roles:{highest:{comparePositionTo:()=>1}}}),fetch:async()=>member}};
 const member={id:'222222222222222222',guild,user:{bot:false},roles:{add:async role=>{calls.push({action:'add',role:role.id});roles.add(role.id);},remove:async role=>{calls.push({action:'remove',role:role.id});roles.delete(role.id);}}};
 const client={user:{id:'bot'},guilds:{fetch:async()=>guild}};
 const service=createMemberOnboarding({client,state,saveState:()=>{},guildId:guild.id,publicUrl:'https://storm.example'});
 const interaction=()=>{const replies=[];return{customId:ACCEPT_ID,guildId:guild.id,channelId:RULES_CHANNEL,message:{id:state.memberOnboarding?.rulesMessageIds.at(-1)},user:{id:member.id},reply:async value=>replies.push(value),deferReply:async value=>replies.push(value),editReply:async value=>replies.push(value),replies};};
 return{service,state,calls,messages,roles,guild,member,interaction};
}
test('welcome assigns only the waiting role and mentions only the joining member',async()=>{
 const f=fixture();await f.service.onJoin(f.member);
 assert.deepEqual([...f.roles],[PENDING_ROLE]);assert.equal(f.calls[0].action,'add');
 const sent=f.calls.find(call=>call.action==='send');assert.equal(sent.channel,WELCOME_CHANNEL);assert.deepEqual(sent.payload.allowedMentions,{parse:[],users:[f.member.id]});assert.ok(sent.payload.embeds[0].description.includes(f.member.id));assert.ok(sent.payload.embeds[0].fields[0].value.includes(RULES_CHANNEL));
});
test('all rules fit Discord limits and acceptance appears only at the end',()=>{
 const payloads=rulesMessages('https://storm.example');assert.ok(payloads.length>2);
 let count=0;
 payloads.forEach((payload,index)=>{for(const embed of payload.embeds){const size=(embed.title||'').length+(embed.description||'').length+(embed.author?.name||'').length+(embed.footer?.text||'').length+(embed.fields||[]).reduce((sum,field)=>sum+field.name.length+field.value.length,0);assert.ok(size<=6000);for(const field of embed.fields||[]){assert.ok(field.value.length<=1024);if(/^(COMMUN|DISCORD|FIVEM|STAFF) — /.test(field.name))count++;}}const buttons=payload.components.flatMap(row=>row.components).filter(button=>button.custom_id===ACCEPT_ID);assert.equal(buttons.length,index===payloads.length-1?1:0);});
 assert.equal(count,18);
});
test('publication updates existing welcome/rules messages instead of duplicating them',async()=>{
 const f=fixture();const result=await f.service.publish();assert.ok(result.rulesMessages>2);const count=f.messages.size,ids=[...f.state.memberOnboarding.rulesMessageIds];
 await f.service.publish();assert.equal(f.messages.size,count);assert.deepEqual(f.state.memberOnboarding.rulesMessageIds,ids);assert.equal(f.calls.filter(call=>call.action==='send'&&call.channel===WELCOME_CHANNEL).length,1);assert.ok(f.calls.some(call=>call.action==='edit'&&call.payload.attachments.length===0));
});
test('accepting the canonical rules grants membership before removing the waiting role',async()=>{
 const f=fixture();await f.service.publish();f.roles.add(PENDING_ROLE);const interaction=f.interaction();
 assert.equal(await f.service.accept(interaction),true);assert.deepEqual([...f.roles],[MEMBER_ROLE]);
 const actions=f.calls.filter(call=>['add','remove'].includes(call.action));assert.deepEqual(actions,[{action:'add',role:MEMBER_ROLE},{action:'remove',role:PENDING_ROLE}]);assert.ok(interaction.replies[0].ephemeral);assert.match(interaction.replies.at(-1),/Règlement accepté/);
});
test('foreign guilds, wrong channels and old messages cannot grant roles',async()=>{
 const f=fixture();await f.service.publish();
 for(const override of [{guildId:'another-guild'},{channelId:WELCOME_CHANNEL},{message:{id:'forged'}}]){const interaction=Object.assign(f.interaction(),override);await f.service.accept(interaction);assert.match(interaction.replies[0].content,/plus actif/);}
 assert.equal(f.calls.filter(call=>['add','remove'].includes(call.action)).length,0);
});
test('failed grants never remove the waiting role; partial removal failures can be retried',async()=>{
 const f=fixture();await f.service.publish();f.roles.add(PENDING_ROLE);const add=f.member.roles.add,remove=f.member.roles.remove;
 f.member.roles.add=async()=>{throw Error('Missing permission');};await f.service.accept(f.interaction());assert.deepEqual([...f.roles],[PENDING_ROLE]);assert.equal(f.calls.filter(call=>call.action==='remove').length,0);
 f.member.roles.add=add;f.member.roles.remove=async()=>{throw Error('Temporary failure');};await f.service.accept(f.interaction());assert.ok(f.roles.has(PENDING_ROLE));assert.ok(f.roles.has(MEMBER_ROLE));
 f.member.roles.remove=remove;await f.service.accept(f.interaction());assert.deepEqual([...f.roles],[MEMBER_ROLE]);
});
test('bot permissions and hierarchy are checked before publishing or assigning access',async()=>{
 const f=fixture();f.guild.members.fetchMe=async()=>({permissions:{has:()=>false},roles:{highest:{comparePositionTo:()=>1}}});
 await assert.rejects(f.service.publish(),/gérer les rôles/);assert.equal(f.calls.length,0);
 f.guild.members.fetchMe=async()=>({permissions:{has:()=>true},roles:{highest:{comparePositionTo:()=>0}}});await assert.rejects(f.service.publish(),/au-dessus/);
});
test('published rules use the saved site text and bots or other guilds are ignored',async()=>{
 const f=fixture();f.state.communityContent={rules:[{title:'Notre règlement',text:'Une règle spécifique enregistrée sur le site.'}]};await f.service.publish();
 assert.ok(f.calls.some(call=>call.channel===RULES_CHANNEL&&call.payload.embeds[0].fields?.some(field=>field.value.includes('règle spécifique'))));
 const before=f.calls.length;await f.service.onJoin({...f.member,user:{bot:true}});await f.service.onJoin({...f.member,guild:{id:'other'}});assert.equal(f.calls.length,before);
});
