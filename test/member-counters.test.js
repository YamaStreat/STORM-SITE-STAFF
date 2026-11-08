const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ChannelType}=require('discord.js');
const {createMemberCounters,HUMAN_CHANNEL,BOT_CHANNEL}=require('../src/member-counters');
function fixture(){
 const calls=[],roster=new Map(),channels=new Map();
 const guild={id:'guild',members:{fetch:async()=>roster,fetchMe:async()=>({id:'bot'})},channels:{fetch:async id=>channels.get(id)}};
 const member=(id,bot=false)=>({id,user:{bot},guild});
 roster.set('human1',member('human1'));roster.set('human2',member('human2'));roster.set('bot',member('bot',true));
 for(const id of [HUMAN_CHANNEL,BOT_CHANNEL]){const channel={id,guildId:guild.id,type:ChannelType.GuildVoice,name:'Ancien compteur',permissionsFor:()=>({has:()=>true}),setName:async name=>{calls.push({id,name});channel.name=name;}};channels.set(id,channel);}
 const client={guilds:{fetch:async()=>guild}},errors=[];
 const service=createMemberCounters({client,guildId:guild.id,onError:error=>errors.push(error)});
 return{service,calls,roster,channels,guild,member,errors};
}
test('startup fetches an authoritative roster and separates people from bots',async()=>{
 const f=fixture();try{await f.service.syncNow();assert.deepEqual(f.calls,[{id:HUMAN_CHANNEL,name:'🌐・Membres : 2'},{id:BOT_CHANNEL,name:'🤖・Bots : 1'}]);await f.service.syncNow();assert.equal(f.calls.length,2);}finally{f.service.stop();}
});
test('arrivals and departures update only the relevant counter, including duplicate events',async()=>{
 const f=fixture();try{await f.service.syncNow();f.calls.length=0;
 const human=f.member('new-human');f.service.onJoin(human);f.service.onJoin(human);await f.service.syncNow();assert.deepEqual(f.calls,[{id:HUMAN_CHANNEL,name:'🌐・Membres : 3'}]);
 f.service.onLeave(human);f.service.onLeave(human);await f.service.syncNow();assert.equal(f.channels.get(HUMAN_CHANNEL).name,'🌐・Membres : 2');
 const bot=f.member('new-bot',true);f.service.onJoin(bot);await f.service.syncNow();assert.equal(f.channels.get(BOT_CHANNEL).name,'🤖・Bots : 2');
 f.service.onLeave(bot);await f.service.syncNow();assert.equal(f.channels.get(BOT_CHANNEL).name,'🤖・Bots : 1');
 }finally{f.service.stop();}
});
test('events received during initial fetching are replayed without losing members',async()=>{
 const f=fixture();let release,entered;const gate=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve);
 f.guild.members.fetch=async()=>{entered();await gate;return f.roster;};
 try{const sync=f.service.syncNow();await started;f.service.onLeave(f.member('human1'));f.service.onJoin(f.member('human3'));f.service.onJoin(f.member('bot2',true));release();await sync;
 assert.equal(f.channels.get(HUMAN_CHANNEL).name,'🌐・Membres : 2');assert.equal(f.channels.get(BOT_CHANNEL).name,'🤖・Bots : 2');
 }finally{f.service.stop();}
});
test('incomplete fetches do not replace real counts with zero; foreign guild events are ignored',async()=>{
 const f=fixture();try{f.guild.members.fetch=async()=>{throw Error('Members intent missing');};await assert.rejects(f.service.syncNow(),/intent/);assert.equal(f.calls.length,0);
 f.guild.members.fetch=async()=>f.roster;await f.service.syncNow();f.calls.length=0;f.service.onJoin({...f.member('foreign'),guild:{id:'other'}});f.service.onLeave({...f.member('human1'),guild:{id:'other'}});await f.service.syncNow();assert.equal(f.calls.length,0);
 }finally{f.service.stop();}
});
test('missing channel permissions are reported without preventing the other counter from updating',async()=>{
 const f=fixture();try{f.channels.get(HUMAN_CHANNEL).permissionsFor=()=>({has:()=>false});await assert.rejects(f.service.syncNow(),/Gérer les salons/);assert.equal(f.channels.get(BOT_CHANNEL).name,'🤖・Bots : 1');f.channels.get(HUMAN_CHANNEL).permissionsFor=()=>({has:()=>true});await f.service.syncNow();assert.equal(f.channels.get(HUMAN_CHANNEL).name,'🌐・Membres : 2');}finally{f.service.stop();}
});
test('a text channel is never renamed as a statistics channel',async()=>{
 const f=fixture();try{f.channels.get(HUMAN_CHANNEL).type=ChannelType.GuildText;await assert.rejects(f.service.syncNow(),/salon vocal/);assert.ok(!f.calls.some(call=>call.id===HUMAN_CHANNEL));}finally{f.service.stop();}
});
