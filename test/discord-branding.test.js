const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {brandedMessage}=require('../src/discord-branding');
test('Discord branding attaches valid local logos and references each without duplicates',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'storm-discord-'));
 try{
  await fs.mkdir(path.join(dir,'assets'));
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7S8AAAAASUVORK5CYII=','base64');
  for(const name of ['round','wordmark'])await fs.writeFile(path.join(dir,'assets','storm-'+name+'.png'),png);
  const payload=brandedMessage({title:'STØRM'},{publicDir:dir,links:[{label:'Candidater',url:'https://example.com/candidatures'}]});
  assert.equal(payload.files.length,2);assert.equal(payload.embeds[0].thumbnail.url,'attachment://storm-round.png');assert.equal(payload.embeds[0].author.icon_url,'attachment://storm-round.png');assert.equal(payload.embeds[0].image.url,'attachment://storm-wordmark.png');assert.equal(payload.components[0].components[0].style,5);assert.deepEqual(payload.allowedMentions,{parse:[]});
  await fs.writeFile(path.join(dir,'assets/storm-round.png'),'invalid');
  const fallback=brandedMessage({title:'STØRM'},{publicDir:dir});assert.ok(fallback.embeds[0].thumbnail.url.startsWith('https://cdn.discordapp.com/'));assert.equal(fallback.files.length,1);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
