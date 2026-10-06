import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

test('merchant registration requires approval and preserves tenant isolation',async()=>{
 Object.assign(process.env,{DATABASE_URL:'',KPAY_DB:':memory:',NEON_AUTH_BASE_URL:'',VERCEL:''});
 const {handler}=await import('./server.mjs'),{db,keyFor,passwordHash}=await import('./store.mjs');
 const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(path,body,token='')=>{const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};};
 try{
  const fields={role:'merchant',name:'Registered business',email:'merchant@example.com',password:' merchant-test-password-123 ',status:'active',providers:['bkash'],admin_role:'owner'};
  assert.equal((await request('register',{...fields,password:'short'})).status,422);
  assert.equal((await request('register',fields)).status,201);
  assert.equal((await request('register',fields)).status,409);
  const row=db.prepare('SELECT * FROM merchants WHERE email=?').get(fields.email);assert.equal(row.status,'pending');assert.equal(row.providers,'[]');assert(!row.password_hash.includes(fields.password));
  assert.equal((await request('login',fields)).status,401);
  db.prepare('UPDATE administrators SET password_hash=? WHERE id=?').run(passwordHash('test-admin-password-123'),'owner');
  assert.equal((await request('login',{key:keyFor('admin')})).status,422);
  assert.equal((await request('login',{role:'merchant',key:keyFor('merchant')})).status,422);
  const admin=(await request('login',{email:'owner@kpay.local',password:'test-admin-password-123',role:'merchant'})).data.token;
  let state=(await request('state',undefined,admin)).data;assert(!JSON.stringify(state).includes('password_hash'));
  const approved=await request('admin/merchants/'+row.id,{version:row.version,status:'active',providers:['bkash'],reason:'Business reviewed'},admin);assert.equal(approved.status,200);assert(!('password_hash' in approved.data));
  const logged=await request('login',{...fields,role:'admin'});assert.equal(logged.status,200);assert.equal(logged.data.role,'merchant');assert.equal((await request('login',{email:fields.email,password:'wrong-password',role:'admin'})).status,401);assert.match(logged.cookie,/HttpOnly/);
  const token=logged.data.token;state=(await request('state',undefined,token)).data;assert.equal(state.actor.kind,'merchant');assert.deepEqual(state.merchants.map(x=>x.id),[row.id]);assert(!JSON.stringify(state).includes('password_hash'));
  assert.equal((await request('admin/settings',{},token)).status,403);
  assert.equal((await request('admin/detail/merchants/'+row.id,undefined,admin)).data.password_hash,undefined);
  await request('admin/merchants/'+row.id,{version:approved.data.version,status:'suspended',providers:['bkash'],reason:'Suspended'},admin);
  assert.equal((await request('state',undefined,token)).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));db.close();}
});
