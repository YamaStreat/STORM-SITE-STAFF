const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const express = require('express');
const discord = require('discord.js');
const { CHANNELS } = require('../src/panel');

test('complete application starts offline and serves public API, assets and fixed publication destinations', async () => {
  const filename = path.join(__dirname, '../src/index.js');
  const nativeRequire = createRequire(filename);
  let app; const sent = [];
  const guildId = '111111111111111111', ownerId = '222222222222222222';
  const guild = { ownerId, members: {fetch: async () => ({id:ownerId,roles:{cache:new Map()}})} };
  class TestClient extends discord.Client {
    constructor(options) { super(options); this.guilds.fetch = async () => guild; this.channels.fetch = async id => ({guildId, isTextBased:()=>true, send:async payload => {sent.push({id,payload});return {id:'777777777777777777',react:async()=>{}};}}); }
    login() { return Promise.resolve(); }
  }
  const fakeExpress = () => {
    app = express();
    app.use((req,res,next) => { if(req.headers['x-test-owner']) req.session = {user:{id:ownerId,username:'Owner'}}; next(); });
    app.listen = () => {};
    return app;
  };
  Object.assign(fakeExpress, express);
  const context = { require: name => name === 'express' ? fakeExpress : name === 'discord.js' ? {...discord,Client:TestClient} : name === 'dotenv' ? {config:()=>{}} : name === 'fs' ? {...fs,existsSync:()=>false,mkdirSync:()=>{},writeFileSync:()=>{}} : nativeRequire(name), __dirname:path.dirname(filename), console, URLSearchParams, setTimeout, clearTimeout, setInterval:()=>{}, process: { env:{DISCORD_TOKEN:'offline-test-token',CLIENT_ID:'333333333333333333',GUILD_ID:guildId}, on:()=>{}, exit:()=>{throw Error('Unexpected process exit');} } };
  // No real Discord login, filesystem writes, timers or external fetches are permitted in this harness.
  vm.runInNewContext(fs.readFileSync(filename,'utf8'),context,{filename});
  const server = express.application.listen.call(app,0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for(const asset of ['/','/admin.html','/app.js','/admin.js','/styles.css']) assert.equal((await fetch(base+asset)).status,200,asset);
    const data = await (await fetch(base+'/api/public')).json();
    assert.equal(data.server.mode,'development'); assert.deepEqual(data.patchNotes,[]);
    assert.equal((await (await fetch(base+'/api/me')).json()).user,null);
    assert.equal((await fetch(base+'/api/admin/summary')).status,401);
    for(const [route,body,expected] of [ ['announcements',{channelId:'attacker-destination',title:'Annonce',message:'Bonjour'},CHANNELS.announcements], ['giveaways',{channelId:'attacker-destination',prize:'VIP',duration:'1h',winners:1},CHANNELS.giveaways] ]) {
      const response = await fetch(base+'/api/admin/'+route,{method:'POST',headers:{'content-type':'application/json','x-test-owner':'yes'},body:JSON.stringify(body)});
      assert.equal(response.status,200,await response.text()); assert.equal(sent.at(-1).id,expected);
    }
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
