const {test}=require('node:test');const assert=require('node:assert/strict');
const {createApplicationAI,reviewInput}=require('../src/application-ai');
const report={summary:'Le candidat donne un exemple utile mais doit préciser ses disponibilités.',completeness:'needs_details',strengths:['Exemple de médiation concret'],concerns:['Disponibilités trop générales'],follow_up_questions:['Quels soirs peux-tu être présent ?']};
const entry=()=>({id:'app',userId:'111111111111111111',username:'PrivateName',age:19,history:'Private sanctions',type:'helper',status:'pending',revision:1,aiReviewConsent:true,motivation:'Mon adresse test@example.com, mon lien https://example.com et mon identifiant 123456789012345678.',scenario:'Je reste calme et j’écoute le joueur.',experience:'Support',availability:'Le soir',fivemHours:300,weeklyHours:8});
const response=value=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}),{headers:{'content-type':'application/json'}});
test('AI receives minimized answers, stores a structured report, caches identical input and never changes decisions',async()=>{
 const state={};const e=entry();let calls=0;const ai=createApplicationAI({state,saveState:()=>{},env:{STORM_AI_API_KEY:'test-only-key'},fetchAI:async(url,opt)=>{calls++;assert.equal(url,'https://api.openai.com/v1/chat/completions');const body=JSON.parse(opt.body);assert.equal(body.store,false);assert.equal(body.response_format.json_schema.strict,true);const input=JSON.parse(body.messages[1].content.split('\n').slice(1).join('\n'));assert.ok(!JSON.stringify(input).includes('PrivateName'));assert.ok(!JSON.stringify(input).includes('Private sanctions'));assert.ok(!Object.hasOwn(input,'age'));assert.ok(!Object.hasOwn(input,'userId'));assert.ok(!input.answers.motivation.includes('test@example.com'));assert.ok(input.answers.motivation.includes('[identifiant retiré]'));return response(report);}});
 assert.equal(ai.request(e,'staff').status,'queued');await ai.whenIdle();assert.equal(e.aiReview.status,'completed');assert.deepEqual(e.aiReview.report,report);assert.equal(e.status,'pending');assert.equal(e.revision,1);assert.ok(e.aiReview.notice.includes('ne constituent pas une preuve'));
 ai.request(e,'staff');await ai.whenIdle();assert.equal(calls,1);ai.request(e,'staff',{force:true});await ai.whenIdle();assert.equal(calls,2);assert.equal(ai.status().usedToday,2);
});
test('consent and configuration are prerequisites and automatic review never blocks submission',async()=>{
 const state={},e=entry();e.aiReviewConsent=false;const ai=createApplicationAI({state,saveState:()=>{},env:{},fetchAI:async()=>{throw Error('Must not call');}});
 ai.schedule(e);assert.equal(e.aiReview.status,'declined');assert.throws(()=>ai.request(e,'staff'),/autorisé/);e.aiReviewConsent=true;ai.schedule(e);assert.equal(e.aiReview.status,'not_configured');assert.throws(()=>ai.request(e,'staff'),/STORM_AI_API_KEY/);
 const disabled=createApplicationAI({state:{},saveState:()=>{},env:{STORM_AI_API_KEY:'test',STORM_AI_AUTO_REVIEW:'false'}});disabled.schedule(e);assert.equal(e.aiReview.status,'manual');
});
test('malformed reports and API failures are recorded safely without storing provider response bodies or secrets',async()=>{
 for(const mode of ['invalid','unauthorized','network']){
 const e=entry(),ai=createApplicationAI({state:{},saveState:()=>{},env:{STORM_AI_API_KEY:'test-only-secret'},fetchAI:async()=>{if(mode==='invalid')return response({summary:'wrong'});if(mode==='unauthorized')return new Response('sensitive provider diagnostic',{status:401});throw Error('test-only-secret private network details');}});
 ai.request(e,'staff');await ai.whenIdle();assert.equal(e.aiReview.status,'failed');assert.ok(!JSON.stringify(e.aiReview).includes('test-only-secret'));assert.ok(!JSON.stringify(e.aiReview).includes('sensitive provider'));assert.equal(e.status,'pending');
 }
});
test('requests for the same application are coalesced and daily limit bounds API calls',async()=>{
 let calls=0;const state={},e=entry(),ai=createApplicationAI({state,saveState:()=>{},env:{STORM_AI_API_KEY:'test',STORM_AI_DAILY_LIMIT:'1'},fetchAI:async()=>{calls++;return response(report);}});
 ai.request(e,'staff');ai.request(e,'staff');await ai.whenIdle();assert.equal(calls,1);const other={...entry(),id:'other'};ai.request(other,'staff');await ai.whenIdle();assert.equal(other.aiReview.status,'failed');assert.match(other.aiReview.error,/Limite quotidienne/);assert.equal(calls,1);
});
test('automatic review runs only with consent and pending work finalized before execution is skipped',async()=>{
 const state={},e=entry();let calls=0;const ai=createApplicationAI({state,saveState:()=>{},env:{STORM_AI_API_KEY:'test'},fetchAI:async()=>{calls++;return response(report);}});
 ai.schedule(e);await ai.whenIdle();assert.equal(e.aiReview.status,'completed');assert.equal(calls,1);
 const closed={...entry(),id:'closed'};ai.request(closed,'staff');closed.status='accepted';await ai.whenIdle();assert.equal(closed.aiReview.status,'cancelled');assert.equal(calls,1);
});
test('an explicitly queued review resumes after restart even when new automatic reviews are disabled',async()=>{
 const e=entry();e.aiReview={status:'queued'};const state={applications:[e]};let calls=0;
 const ai=createApplicationAI({state,saveState:()=>{},env:{STORM_AI_API_KEY:'test',STORM_AI_AUTO_REVIEW:'false'},fetchAI:async()=>{calls++;return response(report);}});
 ai.resume();await ai.whenIdle();assert.equal(calls,1);assert.equal(e.aiReview.status,'completed');assert.equal(e.status,'pending');
});
