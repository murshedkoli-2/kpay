import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('native device signatures, replay protection and physical SIM approval',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'kpay-agent-test-'));
 const proc=spawn(process.execPath,['test-support/server-fixture.mjs'],{env:{...process.env,PORT:'3101',KPAY_DB:join(dir,'test.sqlite')},stdio:['ignore','pipe','pipe']});let output='',errors='';proc.stderr.on('data',c=>errors+=c);
 try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(errors||'Server timeout')),30000);proc.stdout.on('data',c=>{output+=c;if(output.includes('Merchant API key:')){clearTimeout(timer);resolve();}});proc.on('error',reject);});
  const req=async(path,b,key='',headers={})=>{const response=await fetch('http://127.0.0.1:3101/api/'+path,{method:b?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+key,...headers},...(b?{body:JSON.stringify(b)}:{})});return {status:response.status,data:await response.json()};};
  const admin=(await req('login',{email:'owner@kpay.local',password:'test-admin-password-123'})).data.token;
  const a=(await req('admin/accounts',{provider:'bkash',type:'personal',number:'01712345678',label:'Native test',operation:'incoming_transfer',instructions:'Test',minimum:'1',maximum:'10000',daily_limit:'100000'},admin)).data;
  const pairing=(await req('admin/devices',{name:'Native phone',account_id:a.id,sim:'Physical SIM 1'},admin)).data;
  const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),publicKey=keys.publicKey.export({format:'der',type:'spki'}).toString('base64');
  const b={code:pairing.code,public_key:publicKey,proof:sign('sha256',Buffer.from('kpay-enroll\n'+pairing.code+'\n'+publicKey),keys.privateKey).toString('base64'),app_version:'android-1.0'};
  assert.equal((await req('agent/enroll',{...b,proof:'invalid'})).status,401);
  const enrollment=await req('agent/enroll',b);assert.equal(enrollment.status,201);const token=enrollment.data.key;
  assert.equal((await req('agent/config',null,token)).status,401,'Bearer alone is insufficient for native devices');
  const headers=(path,body,nonce=randomUUID(),timestamp=String(Date.now()))=>{
   const canonical=[body?'POST':'GET','/api/'+path,timestamp,nonce,createHash('sha256').update(body?JSON.stringify(body):'').digest('hex')].join('\n');
   return {'X-Kpay-Time':timestamp,'X-Kpay-Nonce':nonce,'X-Kpay-Signature':sign('sha256',Buffer.from(canonical),keys.privateKey).toString('base64')};
  };
  const signed=(path,body)=>req(path,body,token,headers(path,body));
  const h=headers('agent/config',null);assert.equal((await req('agent/config',null,token,h)).status,200);assert.equal((await req('agent/config',null,token,h)).status,409,'Nonce replay is rejected');
  assert.equal((await req('agent/config',null,token,headers('agent/config',null,randomUUID(),String(Date.now()-600000)))).status,401,'Old requests are rejected');
  const hb={queue_depth:0,permission:'granted',subscription_id:7,binding_health:'healthy',capture_paused:false};
  assert.equal((await req('agent/heartbeat',{...hb,queue_depth:10},token,headers('agent/heartbeat',hb))).status,401,'Payload tampering is rejected');
  assert.equal((await signed('agent/heartbeat',hb)).status,200);
  let device=(await req('state',null,admin)).data.devices[0];assert.equal(device.proposed_subscription,7);
  assert.equal((await req('admin/devices/'+device.id,{version:device.version,status:'active',subscription_id:8,reason:'Wrong SIM'},admin)).status,422);
  assert.equal((await req('admin/devices/'+device.id,{version:device.version,status:'active',subscription_id:7,reason:'Physical SIM checked'},admin)).status,200);
  const receipt={account_id:a.id,client_event_id:randomUUID(),sms_sender:'bKash',message:'Synthetic native evidence বাংলা',subscription_id:8};
  assert.equal((await signed('agent/receipts',receipt)).status,409,'Wrong SIM cannot submit evidence');
  receipt.subscription_id=7;assert.equal((await signed('agent/receipts',receipt)).status,201);assert.equal((await signed('agent/receipts',receipt)).data.duplicate,true,'Stable receipt ID makes retry idempotent');
  await signed('agent/heartbeat',{...hb,subscription_id:9});device=(await req('state',null,admin)).data.devices[0];assert.equal(device.status,'paused');assert.equal(device.approved_subscription,null,'Changing subscription invalidates approval');
  assert.equal((await signed('agent/receipts',receipt)).status,401);
 }finally{proc.kill();await new Promise(resolve=>proc.once('exit',resolve));rmSync(dir,{recursive:true,force:true});}
});
