import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';

test('password recovery protects tokens, callbacks, account privacy and rate limits',async()=>{
 let consumed=false,resetRequests=[];
 const provider=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw||'{}');res.setHeader('Content-Type','application/json');
  if(req.url==='/request-password-reset'){resetRequests.push(body);return res.end('{"status":true}');}
  if(req.url==='/reset-password'){
   if(body.token!=='valid-reset-token'||consumed){res.writeHead(400);return res.end('{"code":"INVALID_TOKEN"}');}
   assert.equal(body.newPassword,'replacement-password-123');consumed=true;return res.end('{"status":true}');
  }
  res.writeHead(404);res.end('{}');
 });
 await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
 Object.assign(process.env,{DATABASE_URL:'',KPAY_DB:':memory:',VERCEL:'',KPAY_AUTH_TEST:'1',NEON_AUTH_BASE_URL:'http://127.0.0.1:'+provider.address().port,AUTH_ENCRYPTION_KEY:randomBytes(32).toString('hex'),APP_ORIGIN:'http://127.0.0.1:3000'});
 const {handler}=await import('./server.mjs'),{db}=await import('./store.mjs');
 const app=http.createServer(handler);await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
 const request=async(path,body,origin='http://127.0.0.1:3000')=>{
  const response=await fetch('http://127.0.0.1:'+app.address().port+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};
 };
 try{
  const known=await request('forgot-password',{email:' ADMIN@example.com ',redirectTo:'https://attacker.invalid',role:'admin'});
  const unknown=await request('forgot-password',{email:'unknown@example.com'});
  assert.equal(known.status,200);assert.deepEqual(known.body,unknown.body);
  assert.deepEqual(resetRequests[0],{email:'admin@example.com',redirectTo:'http://127.0.0.1:3000/?reset-password=1'});
  assert.equal((await request('forgot-password',{email:'invalid'})).status,422);
  assert.equal((await request('forgot-password',{email:'admin@example.com'},'https://attacker.invalid')).status,403);
  assert.equal((await request('reset-password',{token:'valid-reset-token',password:'short'})).status,422);assert.equal(consumed,false);
  assert.equal((await request('reset-password',{password:'replacement-password-123'})).status,422);
  const expired=await request('reset-password',{token:'expired-token',password:'replacement-password-123'});
  assert.equal(expired.status,400);assert.match(expired.body.error,/invalid or expired/);
  const reset=await request('reset-password',{token:'valid-reset-token',password:'replacement-password-123',role:'admin'});
  assert.equal(reset.status,200);assert.match(reset.cookie,/Max-Age=0/);assert.equal(reset.body.token,undefined);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0);
  assert.equal((await request('reset-password',{token:'valid-reset-token',password:'replacement-password-123'})).status,400,'reset links are single-use');
  let limited;for(let i=0;i<30;i++)limited=await request('forgot-password',{email:'unknown@example.com'});
  assert.equal(limited.status,429);
 }finally{await new Promise(resolve=>app.close(resolve));await new Promise(resolve=>provider.close(resolve));db.close();}
});
