import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';

test('email OTP verifies without workspace access and resets passwords with purpose-bound single-use codes',async()=>{
 const calls=[];let used=false;
 const provider=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const b=JSON.parse(raw||'{}');calls.push({path:req.url,body:b});res.setHeader('Content-Type','application/json');
  if(req.url==='/email-otp/send-verification-otp')return res.end('{"success":true}');
  if(req.url==='/email-otp/verify-email'){
   if(b.otp!=='123456'){res.writeHead(400);return res.end('{"code":"INVALID_OTP"}');}
   res.setHeader('Set-Cookie','neon_session=verification-only; HttpOnly');return res.end('{"status":true}');
  }
  if(req.url==='/sign-out')return res.end('{"success":true}');
  if(req.url==='/email-otp/reset-password'){
   if(b.otp!=='654321'||used){res.writeHead(400);return res.end('{"code":"INVALID_OTP"}');}
   assert.equal(b.password,'  preserved-password-123  ');used=true;return res.end('{"success":true}');
  }
  res.writeHead(404);res.end('{}');
 });
 await new Promise(r=>provider.listen(0,'127.0.0.1',r));
 Object.assign(process.env,{DATABASE_URL:'',KPAY_DB:':memory:',VERCEL:'',KPAY_AUTH_TEST:'1',NEON_AUTH_BASE_URL:'http://127.0.0.1:'+provider.address().port,AUTH_ENCRYPTION_KEY:randomBytes(32).toString('hex'),APP_ORIGIN:'http://127.0.0.1:3000'});
 const {handler}=await import('./server.mjs'),{db}=await import('./store.mjs');const app=http.createServer(handler);await new Promise(r=>app.listen(0,'127.0.0.1',r));
 const request=async(path,body,origin='http://127.0.0.1:3000')=>{const r=await fetch(`http://127.0.0.1:${app.address().port}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')};};
 try{
  assert.equal((await request('auth/send-verification',{email:' MERCHANT@example.com ',type:'sign-in'})).status,200);
  assert.deepEqual(calls.at(-1).body,{email:'merchant@example.com',type:'email-verification'});
  assert.equal((await request('auth/send-verification',{email:'invalid'})).status,422);
  assert.equal((await request('auth/verify-email',{email:'merchant@example.com',otp:'abc123'})).status,422);
  assert.equal((await request('auth/verify-email',{email:'merchant@example.com',otp:'000000'})).status,400);
  const verified=await request('auth/verify-email',{email:'merchant@example.com',otp:'123456',role:'admin'});
  assert.equal(verified.status,200);assert.equal(verified.cookie,null);assert.equal(calls.at(-1).path,'/sign-out');assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);
  const sent=await request('forgot-password',{email:'merchant@example.com',method:'otp'});
  const unknown=await request('forgot-password',{email:'unknown@example.com',method:'otp'});assert.deepEqual(sent.body,unknown.body);
  assert.equal(calls.at(-1).body.type,'forget-password');
  const reset={email:'merchant@example.com',method:'otp',otp:'123456',password:'  preserved-password-123  '};
  assert.equal((await request('reset-password',reset)).status,400,'verification code cannot reset password');
  reset.otp='654321';assert.equal((await request('reset-password',{...reset,password:'short'})).status,422);
  const done=await request('reset-password',reset);assert.equal(done.status,200);assert.match(done.cookie,/Max-Age=0/);
  assert.equal((await request('reset-password',reset)).status,400,'code cannot be reused');
  assert.equal((await request('auth/verify-email',{email:'merchant@example.com',otp:'123456'},'https://attacker.invalid')).status,403);
 }finally{await new Promise(r=>app.close(r));await new Promise(r=>provider.close(r));db.close();}
});
