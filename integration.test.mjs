import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {totp} from './mfa.mjs';

test('admin setup, evidence matching, access rules and settlement ledger',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'kpay-admin-test-'));
 const proc=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:'3099',KPAY_DB:join(dir,'test.sqlite')},stdio:['ignore','pipe','pipe']});let output='',stderr='';proc.stderr.on('data',c=>stderr+=c);
 try{
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Server timeout: '+stderr)),10000);proc.stdout.on('data',c=>{output+=c;if(output.includes('Merchant login key:')){clearTimeout(timeout);resolve();}});proc.on('error',reject);proc.on('exit',code=>{if(code)reject(new Error(stderr));});});
  const root=output.match(/Admin login key: (\w+)/)[1],legacyMerchant=output.match(/Merchant login key: (\w+)/)[1];let admin='';
  const req=async(path,b,key=admin)=>{const r=await fetch('http://127.0.0.1:3099/api/'+path,{method:b?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},...(b?{body:JSON.stringify(b)}:{})});return {status:r.status,data:await r.json()};};
  const ok=async(path,b,key=admin)=>{const r=await req(path,b,key);assert([200,201].includes(r.status),JSON.stringify(r.data));return r.data;};
  admin=(await ok('login',{role:'admin',key:root},'')).token;
  assert.equal((await req('state',undefined,root)).status,401,'bootstrap key is not an admin API bearer token');
  const accountBody={provider:'bkash',type:'personal',number:'01712345678',label:'Test collection',operation:'incoming_transfer',instructions:'Synthetic test payment',minimum:'1',maximum:'10000',daily_limit:'100000'};
  assert.equal((await req('admin/accounts',accountBody,legacyMerchant)).status,403);
  const a=await ok('admin/accounts',accountBody);
  assert.equal(a.status,'paused');assert.equal((await req('admin/accounts/'+a.id,{action:'status',version:a.version,status:'active',reason:'Test'})).status,422,'activation requires configured evidence');
  const t=await ok('admin/templates',{name:'Test incoming',provider:'bkash',type:'personal',operation:'incoming_transfer',sms_sender:'bKash',pattern:'Tk {{amount}} from {{sender}} ID {{transaction}}',sample:'Tk 100 from 01812345678 ID ABC123'});
  assert.equal((await req('admin/templates/'+t.id+'/publish',{reason:'Test'})).status,422);
  await ok('admin/templates/'+t.id+'/fixtures',{message:'Tk 200 from 01912345678 ID ABC456',expected:'match'});
  await ok('admin/templates/'+t.id+'/fixtures',{message:'Your balance is Tk 100',expected:'reject'});
  await ok('admin/templates/'+t.id+'/publish',{reason:'Fixtures checked'});
  const pairing=await ok('admin/devices',{name:'Test phone',account_id:a.id,sim:'Collection SIM 1'});
  const enrollment=await ok('admin/simulator/enroll',{code:pairing.code});
  assert.equal((await req('admin/simulator/enroll',{code:pairing.code})).status,401,'pairing codes are single use');
  let s=await ok('state');const d=s.devices[0];
  await ok('admin/devices/'+d.id,{version:d.version,status:'active',reason:'SIM verified'});
  await ok('admin/accounts/'+a.id,{version:a.version,action:'status',status:'active',reason:'Ready for controlled tests'});
  assert.equal((await req('admin/accounts/'+a.id,{version:a.version,action:'status',status:'paused',reason:'Stale edit'})).status,409);
  const paymentBody={provider:'bkash',order_id:'test-1',amount:'100'};
  const p=await ok('payments',paymentBody,legacyMerchant);assert.equal((await ok('payments',paymentBody,legacyMerchant)).id,p.id);
  assert.equal((await req('payments',{...paymentBody,amount:'101'},legacyMerchant)).status,409);
  assert.equal((await req('payments',{...paymentBody,order_id:'own-account',account_id:a.id},legacyMerchant)).status,403);
  assert.equal((await ok('payments/'+p.id+'/claim',{sender:'01812345678',transaction:'ABC123'},legacyMerchant)).status,'pending');
  const receipt={account_id:a.id,client_event_id:'event-1',sms_sender:'bKash',message:'Tk 100 from 01812345678 ID ABC123'};
  assert.equal((await req('agent/receipts',receipt,legacyMerchant)).status,401);
  assert.equal((await req('agent/receipts',receipt,enrollment.key)).status,201);
  assert.equal((await req('agent/receipts',receipt,enrollment.key)).data.duplicate,true);
  assert.equal((await req('agent/receipts',{...receipt,message:'changed'},enrollment.key)).status,409);
  assert.equal((await ok('payments/'+p.id,undefined,legacyMerchant)).status,'verified');
  s=await ok('state');assert.equal(s.ledger.length,1);assert.equal(s.entries.reduce((sum,e)=>sum+e.amount,0),0);assert.equal(s.merchants[0].available,10000);assert.equal(s.webhooks.length,1);
  assert.equal(s.accounts[0].device_key,undefined);assert.equal(s.devices[0].key_hash,undefined);
  const p2=await ok('payments',{...paymentBody,order_id:'test-2'},legacyMerchant);
  assert.equal((await req('payments/'+p2.id+'/claim',{sender:'01812345678',transaction:'ABC123'},legacyMerchant)).status,409,'consumed receipt cannot be reused');
  // Unparsed evidence is persisted for review and raw reveal is audited.
  const unparsed=await req('agent/receipts',{...receipt,client_event_id:'event-2',message:'Unknown incoming format'},enrollment.key);
  assert.equal(unparsed.data.status,'unparsed');s=await ok('state');assert.equal(s.reviews.length,1);
  await ok('admin/detail/sms/'+unparsed.data.id);s=await ok('state');assert(s.audit.some(a=>a.event==='Raw SMS revealed'));
  // Tenant isolation and one-time merchant keys.
  const merchant=await ok('admin/merchants',{name:'Other merchant',email:'other@test.local',destination:'Approved test destination'});
  const key=await ok('admin/merchants/'+merchant.id+'/keys',{reason:'Integration test'});
  assert.equal((await req('payments/'+p.id,undefined,key.key)).status,404);assert.equal((await ok('state',undefined,key.key)).payments.length,0);
  // Support can investigate, but cannot access raw evidence or mutate collection accounts.
  const support=await ok('admin/administrators',{name:'Support test',email:'support@test.local',role:'support',password:'test-password-123',reason:'Test team'});
  const supportToken=(await ok('login',{role:'admin',email:'support@test.local',password:'test-password-123'},'')).token;
  assert.equal((await req('admin/detail/sms/'+unparsed.data.id,undefined,supportToken)).status,403);
  assert.equal((await req('admin/detail/templates/'+t.id,undefined,supportToken)).status,403,'sample evidence remains restricted');
  assert.equal((await req('admin/accounts',accountBody,supportToken)).status,403);
  const masked=await ok('admin/detail/payments/'+p.id,undefined,supportToken);assert(masked.sender.includes('••••'));assert.equal(masked.claims[0].sender,masked.sender);
  // Balanced reserve, maker/checker enforcement, external payout completion.
  await ok('admin/administrators',{name:'Finance test',email:'finance@test.local',role:'finance',password:'test-password-456',reason:'Test finance role'});
  const finance=(await ok('login',{role:'admin',email:'finance@test.local',password:'test-password-456'},'')).token;
  const destination=await ok('admin/merchants/demo_merchant/destination',{destination:'Synthetic approved payout destination',reason:'Test destination'});
  assert.equal((await req('admin/destinations/'+destination.id+'/approve',{reason:'Self approval'})).status,403);
  await ok('admin/destinations/'+destination.id+'/approve',{reason:'Independent destination check'},finance);
  const settlement=await ok('admin/settlements',{merchant_id:'demo_merchant',amount:'40',reason:'Test reservation'});
  assert.equal((await req('admin/settlements/'+settlement.id,{version:settlement.version,action:'approve',reason:'Self approve'})).status,403);
  const approved=await ok('admin/settlements/'+settlement.id,{version:settlement.version,action:'approve',reason:'Independent check'},finance);
  assert.equal((await req('admin/settlements',{merchant_id:'demo_merchant',amount:'70',reason:'Overdraw'})).status,422);
  await ok('admin/settlements/'+settlement.id,{version:approved.version,action:'paid',external_trx:'PAYOUT-TEST',evidence:'Synthetic payout evidence',reason:'Recorded test execution'},finance);
  s=await ok('state');assert.equal(s.merchants.find(m=>m.id==='demo_merchant').available,6000);assert.equal(s.merchants.find(m=>m.id==='demo_merchant').reserved,0);
  for(const posting of s.ledger)assert.equal(s.entries.filter(e=>e.posting_id===posting.id).reduce((n,e)=>n+e.amount,0),0);
  const uncertain=await ok('admin/settlements',{merchant_id:'demo_merchant',amount:'10',reason:'Uncertain execution test'});
  const approved2=await ok('admin/settlements/'+uncertain.id,{version:uncertain.version,action:'approve',reason:'Independent check'},finance);
  const uncertain2=await ok('admin/settlements/'+uncertain.id,{version:approved2.version,action:'uncertain',reason:'External result unavailable'});
  assert.equal((await req('admin/settlements/'+uncertain.id,{version:uncertain2.version,action:'cancel',reason:'Unsafe release'})).status,409);
  assert.equal((await req('admin/settlements/'+uncertain.id,{version:uncertain2.version,action:'resolve_failed',evidence:'Synthetic failure',reason:'Self resolution'})).status,403);
  await ok('admin/settlements/'+uncertain.id,{version:uncertain2.version,action:'resolve_failed',evidence:'Independent synthetic failure statement',reason:'Confirmed no payout'},finance);
  s=await ok('state');assert.equal(s.merchants.find(m=>m.id==='demo_merchant').available,6000);assert.equal(s.merchants.find(m=>m.id==='demo_merchant').reserved,0);
  // Internal webhook destination is blocked without posting sensitive payloads.
  await ok('admin/webhook-endpoints',{merchant_id:'demo_merchant',url:'https://127.0.0.1/callback',reason:'Security test'});
  const delivered=await ok('admin/webhooks/'+s.webhooks[0].id+'/deliver',{reason:'SSRF test'});assert.equal(delivered.delivered,false);assert(delivered.error.includes('public IPv4'));
  // Recharge credits user, not the associated merchant.
  const user=await ok('admin/users',{name:'Recharge test',number:'01612345678'});
  const recharge=await ok('payments',{beneficiary_type:'user',user_id:user.id,account_id:a.id,order_id:'recharge-1',amount:'25'});
  await ok('payments/'+recharge.id+'/claim',{sender:'01812345678',transaction:'RECHARGE1'});
  await req('agent/receipts',{...receipt,client_event_id:'event-3',message:'Tk 25 from 01812345678 ID RECHARGE1'},enrollment.key);
  s=await ok('state');assert.equal(s.users[0].balance,2500);assert.equal(s.merchants.find(m=>m.id==='demo_merchant').available,6000);
  // Device revocation pauses the account and rejects further ingestion.
  const latest=s.devices[0];await ok('admin/devices/'+latest.id,{version:latest.version,status:'revoked',reason:'Test retirement'});
  assert.equal((await req('agent/receipts',{...receipt,client_event_id:'revoked'},enrollment.key)).status,401);
  const policy=(await ok('state')).settings;
  await ok('admin/settings',{...policy,fee_bps:100,reason:'Versioned policy test'});
  assert.equal((await req('admin/settings',{...policy,reason:'Stale settings edit'})).status,409);
  // Authenticator setup, replay prevention, and renewed confirmation for privileged actions.
  const setup=await ok('admin/security/start',{},supportToken);
  const firstTime=Date.now(),firstCode=totp(setup.secret,firstTime);
  await ok('admin/security/confirm',{otp:firstCode},supportToken);
  assert.equal((await req('login',{role:'admin',email:'support@test.local',password:'test-password-123'},'')).status,401);
  assert.equal((await req('login',{role:'admin',email:'support@test.local',password:'test-password-123',otp:firstCode},'')).status,401,'OTP cannot be reused');
  if(!process.env.KPAY_PGLITE_TEST){
  const inspect=new DatabaseSync(join(dir,'test.sqlite'));
  inspect.prepare('UPDATE sessions SET step_up_until=? WHERE admin_id=?').run('2000-01-01T00:00:00.000Z',support.id);inspect.close();
  assert.equal((await req('admin/reviews/'+s.reviews[0].id,{action:'note',reason:'Needs renewed MFA'},supportToken)).status,403);
  await ok('admin/security/step-up',{otp:totp(setup.secret,firstTime+30000)},supportToken);
  await ok('admin/reviews/'+s.reviews[0].id,{action:'note',reason:'Confirmed authenticator'},supportToken);
  }
  await ok('logout',{});assert.equal((await req('state')).status,401);
 }finally{proc.kill();await new Promise(resolve=>proc.once('close',resolve));rmSync(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});
