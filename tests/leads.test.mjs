import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handleLead, validateLead } from '../lib/leads.mjs';

const now = 1804800000000;
const valid = (extra = {}) => ({requestId:crypto.randomUUID(),method:'phone',contact:'+7 (900) 000-00-00',name:'Тестовая компания',task:'Резерв, 100 кВт',generator:'В контейнере',consent:true,website:'',startedAt:now-5000,page:'https://energy.test/?utm_source=yandex&private_key=remove',referrer:'https://search.test/?query=remove',utm:{utm_source:'yandex',utm_campaign:'energy'},...extra});
const request = (body, headers = {}) => new Request('https://energy.test/api/leads',{method:'POST',headers:{'content-type':'application/json',origin:'https://energy.test','cf-connecting-ip':'192.0.2.1',...headers},body:typeof body==='string'?body:JSON.stringify(body)});

function environment() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
  const DB = { prepare(sql) { const stmt=sqlite.prepare(sql);let values=[];return {bind(...v){values=v;return this;},async run(){const r=stmt.run(...values);return {meta:{changes:Number(r.changes)}};},async first(){return stmt.get(...values)||null;}}; } };
  return {DB,TELEGRAM_BOT_TOKEN:'test-only-not-a-credential',TELEGRAM_CHAT_ID:'test-chat',sqlite};
}
const confirmed = async () => Response.json({ok:true,result:{message_id:123}});

test('missing configuration returns 503 without sending or fake success',async()=>{
  let calls=0;const r=await handleLead(request(valid()),{},{now,fetchImpl:async()=>{calls++;return confirmed();}});
  assert.equal(r.status,503);assert.equal((await r.json()).ok,false);assert.equal(calls,0);
});
test('confirmed delivery carries contact, generator, UTM and consent; strips unknown URL queries',async()=>{
  const env=environment();let sent;
  const r=await handleLead(request(valid()),env,{now,fetchImpl:async(url,init)=>{assert.match(url,/^https:\/\/api\.telegram\.org\/bot/);sent=JSON.parse(init.body);return confirmed();}});
  assert.equal(r.status,200);assert.equal((await r.json()).ok,true);
  assert.match(sent.text,/В контейнере/);assert.match(sent.text,/utm_source: yandex/);assert.match(sent.text,/Согласие на обработку: получено/);assert.doesNotMatch(sent.text,/private_key|query=remove/);
  const row=env.sqlite.prepare('SELECT * FROM lead_delivery').get();assert.equal(row.status,'sent');assert.doesNotMatch(JSON.stringify(row),/900|Тестовая компания|Резерв/);
});
test('Telegram rejection does not produce success or leak upstream error/token',async()=>{
  const r=await handleLead(request(valid()),environment(),{now,fetchImpl:async()=>Response.json({ok:false,description:'secret upstream error'},{status:403})});
  assert.equal(r.status,502);const j=await r.json();assert.equal(j.ok,false);assert.doesNotMatch(j.message,/secret|test-only/);
});
test('same request is idempotent after delivery',async()=>{
  const env=environment(),body=valid();let calls=0;const options={now,fetchImpl:async()=>{calls++;return confirmed();}};
  assert.equal((await handleLead(request(body),env,options)).status,200);
  const repeat=await handleLead(request(body),env,options);assert.equal((await repeat.json()).duplicate,true);assert.equal(calls,1);
});
test('same content with a fresh request id is deduplicated',async()=>{
  const env=environment(),body=valid();let calls=0;const options={now,fetchImpl:async()=>{calls++;return confirmed();}};
  await handleLead(request(body),env,options);
  const r=await handleLead(request({...body,requestId:crypto.randomUUID()}),env,options);assert.equal((await r.json()).duplicate,true);assert.equal(calls,1);
});
test('changed payload with reused request id cannot falsely acknowledge old contact',async()=>{
  const env=environment(),body=valid();let calls=0;const options={now,fetchImpl:async()=>{calls++;return confirmed();}};
  await handleLead(request(body),env,options);
  const r=await handleLead(request({...body,contact:'+7 900 000 00 01'}),env,options);assert.equal(r.status,409);assert.equal(calls,1);
});
test('concurrent duplicates reserve only one Telegram delivery',async()=>{
  const env=environment(),body=valid();let calls=0;const options={now,fetchImpl:async()=>{calls++;return confirmed();}};
  const rs=await Promise.all([handleLead(request(body),env,options),handleLead(request(body),env,options)]);
  assert.equal(calls,1);assert.ok(rs.every(r=>[200,409].includes(r.status)));
});
test('network failure remains uncertain and does not automatically retry',async()=>{
  const env=environment(),body=valid();let calls=0;const options={now,fetchImpl:async()=>{calls++;throw new Error('timeout');}};
  assert.equal((await handleLead(request(body),env,options)).status,502);
  assert.equal((await handleLead(request(body),env,options)).status,409);assert.equal(calls,1);
  assert.equal(env.sqlite.prepare('SELECT status FROM lead_delivery').get().status,'uncertain');
});
test('fifth distinct request per IP within a minute is rate limited',async()=>{
  const env=environment();for(let i=0;i<4;i++)assert.equal((await handleLead(request(valid({contact:'+7 900 000 00 0'+i})),env,{now,fetchImpl:confirmed})).status,200);
  assert.equal((await handleLead(request(valid({contact:'+7 900 000 00 09'})),env,{now,fetchImpl:confirmed})).status,429);
});
test('expired reservations permit delivery after the deduplication window',async()=>{
  const env=environment(),body=valid();let calls=0;const fetchImpl=async()=>{calls++;return confirmed();};
  await handleLead(request(body),env,{now,fetchImpl});
  assert.equal((await handleLead(request({...body,startedAt:now+700000-5000}),env,{now:now+700000,fetchImpl})).status,200);assert.equal(calls,2);
});
for(const [name,patch] of [['missing consent',{consent:false}],['invalid contact',{contact:'abc'}],['honeypot',{website:'https://spam.test'}],['too quick',{startedAt:now-100}],['invalid generator',{generator:'invented'}],['too long',{task:'x'.repeat(1001)}]]) {
  test('rejects '+name,async()=>{let calls=0;const r=await handleLead(request(valid(patch)),environment(),{now,fetchImpl:async()=>{calls++;return confirmed();}});assert.equal(r.status,400);assert.equal(calls,0);});
}
test('rejects cross-origin request',async()=>assert.equal((await handleLead(request(valid(),{origin:'https://foreign.test'}),environment(),{now})).status,403));
test('rejects invalid JSON',async()=>assert.equal((await handleLead(request('{'),environment(),{now})).status,400));
test('limits actual request body, independent of Content-Length',async()=>assert.equal((await handleLead(request(JSON.stringify({x:'x'.repeat(12001)})),environment(),{now})).status,413));
test('accepts email and Telegram contacts',()=>{assert.equal(validateLead(valid({method:'email',contact:'test@example.com'}),now).method,'email');assert.equal(validateLead(valid({method:'telegram',contact:'@energy_test'}),now).method,'telegram');});
