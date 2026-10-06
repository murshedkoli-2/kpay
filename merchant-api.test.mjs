import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {randomBytes} from 'node:crypto';
test('merchant API checkout verifies receipt evidence once and isolates keys, payments and webhooks',async()=>{
 Object.assign(process.env,{DATABASE_URL:'',KPAY_DB:':memory:',NEON_AUTH_BASE_URL:'',VERCEL:'',APP_ORIGIN:'http://127.0.0.1:3000',AUTH_ENCRYPTION_KEY:randomBytes(32).toString('hex')});
 const {db,keyFor}=await import('./store.mjs'),{dispatch,createMerchantSession,ingest}=await import('./operations.mjs'),{handler}=await import('./server.mjs');
 const owner={id:'owner',kind:'admin',role:'admin'},call=(path,b)=>dispatch(owner,'POST','admin/'+path,b);
 const a=call('accounts',{provider:'nagad',type:'personal',number:'01712345678',label:'Test',operation:'incoming_transfer',instructions:'Send money',minimum:'1',maximum:'10000',daily_limit:'100000'});
 const t=call('templates',{name:'Synthetic',provider:'nagad',type:'personal',operation:'incoming_transfer',sms_sender:'NAGAD',pattern:'Received {{amount}} from {{sender}} ID {{transaction}}',sample:'Received 100 from 01812345678 ID TEST001'});
 call(`templates/${t.id}/fixtures`,{message:'Received 200 from 01812345678 ID TEST002',expected:'match'});call(`templates/${t.id}/fixtures`,{message:'OTP 123456',expected:'reject'});call(`templates/${t.id}/publish`,{reason:'Test fixtures'});
 const d=call('devices',{name:'Synthetic device',account_id:a.id,sim:'Test SIM'}),enrolled=call('simulator/enroll',{code:d.code});call(`devices/${d.id}`,{version:db.prepare("SELECT version FROM devices WHERE id=?").get(d.id).version,status:'active',reason:'Test'});call(`accounts/${a.id}`,{version:1,action:'status',status:'active',reason:'Test'});
 const app=http.createServer(handler);await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const req=async(path,b,key=keyFor('merchant'))=>{const r=await fetch(`http://127.0.0.1:${app.address().port}/api/${path}`,{method:b?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key,Origin:'http://127.0.0.1:3000'},...(b?{body:JSON.stringify(b)}:{})});return {status:r.status,data:await r.json()};};
 try{
  assert.equal((await req('merchant/integration/keys',{})).status,403,'API key cannot mint new credentials');
  const session=createMerchantSession(db.prepare('SELECT * FROM merchants WHERE id=?').get('demo_merchant'));
  const issued=await req('merchant/integration/keys',{},session.token);assert.equal(issued.status,200);assert.ok(issued.data.key);
  const key=issued.data.key,body={amount:'100.00',currency:'BDT',provider:'nagad',order_id:'site-order-1'};
  assert.equal((await req('merchant/integration/webhook',{url:'https://127.0.0.1/webhook'},session.token)).status,422);
  const webhook=await req('merchant/integration/webhook',{url:'https://merchant.example/webhooks/kpay'},session.token);assert.equal(webhook.status,200);assert.ok(webhook.data.secret);
  const info=await req('merchant/integration',undefined,key);assert.equal(info.data.webhook.secret,undefined);assert.ok(info.data.keys.every(k=>!k.hash&&!k.key));
  assert.equal((await req('v1/payments',{...body,currency:'USD'},key)).status,422);
  assert.equal((await req('v1/payments',{...body,amount:100},key)).status,422);
  const created=await req('v1/payments',body,key);assert.equal(created.status,201);const p=created.data;assert.equal(p.amount,'100.00');assert.ok(p.checkout_url);assert.equal(p.currency,'BDT');
  assert.equal((await req('v1/payments',body,key)).data.id,p.id);
  assert.equal((await req('v1/payments',{...body,provider:'bkash'},key)).status,409);
  assert.equal((await req('v1/payments?order_id=site-order-1',undefined,key)).data.id,p.id);
  const fragment=new URLSearchParams(new URL(p.checkout_url).hash.slice(1)),credential={payment_id:p.id,checkout_token:fragment.get('token')};
  assert.equal((await req('checkout/status',{...credential,checkout_token:'0'.repeat(64)},'')).status,404);
  const viewed=await req('checkout/status',credential,'');assert.equal(viewed.status,200);assert.equal(viewed.data.receiving_number,'01712345678');assert.equal(viewed.data.trx,undefined);
  assert.equal((await req('checkout/claim',{...credential,sender:'01812345678',transaction:'TEST001'},'')).data.status,'pending');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ledger').get().n,0,'a customer claim alone never credits payment');
  const evidence={account_id:a.id,client_event_id:'synthetic-1',sms_sender:'nagad',message:'Received 100 from 01812345678 ID TEST001'};
  assert.equal(ingest(evidence,enrolled.key).status,'parsed');assert.equal((await req(`v1/payments/${p.id}`,undefined,key)).data.status,'verified');
  ingest(evidence,enrolled.key);assert.equal(db.prepare('SELECT COUNT(*) n FROM ledger').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM webhook_events').get().n,1);assert.equal((await req('checkout/status',credential,'')).data.status,'verified');
  const event=db.prepare('SELECT id FROM webhook_events').get();db.prepare("UPDATE webhook_events SET status='failed' WHERE id=?").run(event.id);
  assert.equal((await req(`merchant/integration/webhooks/${event.id}/retry`,{},key)).status,403);
  assert.equal((await req(`merchant/integration/webhooks/${event.id}/retry`,{},session.token)).status,200);
  const other=call('merchants',{name:'Other',email:'other@example.invalid',destination:'Test destination'}),otherKey=call(`merchants/${other.id}/keys`,{reason:'Test'}).key;
  assert.equal((await req(`v1/payments/${p.id}`,undefined,otherKey)).status,404);
  assert.equal((await req('v1/payments?order_id=site-order-1',undefined,otherKey)).status,404);
  const otherSession=createMerchantSession(db.prepare('SELECT * FROM merchants WHERE id=?').get(other.id));
  assert.equal((await req(`merchant/integration/webhooks/${event.id}/retry`,{},otherSession.token)).status,404);
  const expire=await req('v1/payments',{...body,order_id:'site-order-2'},key);db.prepare('UPDATE payments SET expires=? WHERE id=?').run('2000-01-01T00:00:00Z',expire.data.id);
  const expFragment=new URLSearchParams(new URL(expire.data.checkout_url).hash.slice(1)),expCred={payment_id:expire.data.id,checkout_token:expFragment.get('token')};
  assert.equal((await req('checkout/claim',{...expCred,sender:'01812345678',transaction:'TEST002'},'')).status,409);
  assert.equal((await req(`v1/payments/${expire.data.id}`,undefined,key)).data.status,'expired');
  assert.equal((await req(`merchant/integration/keys/${issued.data.id}/revoke`,{},session.token)).status,200);
  assert.equal((await req(`v1/payments/${p.id}`,undefined,key)).status,401);
 }finally{await new Promise(r=>app.close(r));db.close();}
});


