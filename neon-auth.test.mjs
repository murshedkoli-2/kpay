import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';

test('Neon Auth verifies identities, invitations, revocation, cookies and MFA',async()=>{
 let user={id:'neon-owner',email:'owner@example.com',name:'Owner',emailVerified:true},revoked=false;
 const upstream=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  res.setHeader('Content-Type','application/json');
  if(req.url==='/sign-in/email'){if(JSON.parse(body).password!=='valid-password-123'){res.writeHead(401);return res.end('{}');}res.setHeader('Set-Cookie',['neonauth.session_token=test-token; HttpOnly','neonauth.session_token_sig=test-sig; HttpOnly']);return res.end('{}');}
  if(req.url==='/sign-up/email')return res.end('{}');
  if(req.url==='/get-session'){assert.match(req.headers.cookie,/neonauth.session_token=test-token/);return res.end(JSON.stringify(revoked?null:{user,session:{expiresAt:new Date(Date.now()+3600000).toISOString()}}));}
  if(req.url==='/sign-out'){revoked=true;return res.end('{}');}
  res.writeHead(404);res.end('{}');
 });
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 Object.assign(process.env,{DATABASE_URL:'',KPAY_PGLITE_TEST:'',KPAY_DB:':memory:',KPAY_AUTH_TEST:'1',NEON_AUTH_BASE_URL:'http://127.0.0.1:'+upstream.address().port,NEON_OWNER_EMAIL:'owner@example.com',AUTH_ENCRYPTION_KEY:randomBytes(32).toString('hex'),APP_ORIGIN:'http://127.0.0.1:3000'});
 const auth=await import('./neon-auth.mjs'),{db,hash}=await import('./store.mjs'),{login}=await import('./operations.mjs'),{totp,newTotpSecret}=await import('./mfa.mjs');
 const credentials={email:user.email,password:'valid-password-123'};
 try{
  await assert.rejects(auth.neonLogin({...credentials,password:'wrong'}),e=>e.status===401);
  user.emailVerified=false;await assert.rejects(auth.neonLogin(credentials),e=>e.status===403);user.emailVerified=true;
  const result=await auth.neonLogin(credentials);assert.equal(result.admin_role,'owner');assert.equal(result.token_hash,undefined);
  assert.equal((await auth.neonAuthenticate(result.token)).id,'owner');
  assert(!db.prepare('SELECT neon_cookie FROM sessions WHERE hash=?').get(hash(result.token)).neon_cookie.includes('test-token'));
  assert.throws(()=>login({key:'bootstrap'}),e=>e.status===401);
  assert.match(auth.sessionCookie(result.token),/HttpOnly; SameSite=Strict/);
  assert.equal(auth.cookieToken({headers:{cookie:'other=x; kpay_session='+result.token}}),result.token);
  assert.throws(()=>auth.assertBrowserOrigin({headers:{origin:'https://attacker.example'}}),e=>e.status===403);
  await assert.rejects(auth.neonRegister({email:'uninvited@example.com',password:'valid-password-123'}),e=>e.status===403);
  assert.match((await auth.neonRegister(credentials)).message,/Verify your email/);
  const original=user;user={...user,id:'stranger',email:'stranger@example.com'};await assert.rejects(auth.neonLogin(credentials),e=>e.status===403);
  user={...original,id:'replacement-identity'};await assert.rejects(auth.neonLogin(credentials),e=>e.status===403);user=original;
  db.prepare("UPDATE administrators SET status='suspended' WHERE id='owner'").run();assert.equal(await auth.neonAuthenticate(result.token),null);
  db.prepare("UPDATE administrators SET status='active' WHERE id='owner'").run();
  const seed=newTotpSecret();db.prepare("UPDATE administrators SET mfa_enabled=1,mfa_secret=? WHERE id='owner'").run(seed);
  await assert.rejects(auth.neonLogin(credentials),e=>e.status===401);
  const otp=totp(seed);const mfaSession=await auth.neonLogin({...credentials,otp});
  await assert.rejects(auth.neonLogin({...credentials,otp}),e=>e.status===401);
  revoked=true;await assert.rejects(auth.neonAuthenticate(mfaSession.token),e=>e.status===401);revoked=false;
  await auth.neonLogout(mfaSession.token);assert.equal(await auth.neonAuthenticate(mfaSession.token),null);
 }finally{db.close();await new Promise(resolve=>upstream.close(resolve));}
});
