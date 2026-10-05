import http from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {registrationFields,saveRegistration} from './merchant-registration.mjs';
import {runWebhookBatch} from './webhooks.mjs';
import {waitUntil} from '@vercel/functions';
import {db,keyFor,now,audit,problem,hash} from './store.mjs';
import {login,authenticate,dispatch,ingest,enroll,heartbeat,deviceConfig,permit} from './operations.mjs';
import {deliverWebhook} from './webhooks.mjs';
import {authenticateAgent} from './agent-security.mjs';
import {neonAuthEnabled,neonForgotPassword,neonResetPassword,neonLogin,neonRegister,neonAuthenticate,neonLogout,assertBrowserOrigin,sessionCookie,cookieToken} from './neon-auth.mjs';
function rateLimit(req,path){
 const ip=process.env.VERCEL?String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim():req.socket.remoteAddress||'local';
 const key=hash(ip+':'+path),start=Math.floor(Date.now()/60000)*60000;
 const row=db.prepare('INSERT INTO rate_limits(key,count,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.window_start=excluded.window_start THEN rate_limits.count+1 ELSE 1 END,window_start=excluded.window_start RETURNING count').get(key,start);
 if(row.count>30)problem('Too many attempts. Try again in a minute.',429);
}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/favicon.svg':'favicon.svg'};
const staticHeaders={'Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store'};
export async function handler(req,res){
 const url=new URL(req.url,'http://localhost');const send=(code,data)=>{res.writeHead(code,{...staticHeaders,'Content-Type':'application/json'});res.end(JSON.stringify(data));if(process.env.VERCEL&&code<300&&req.method==='POST'&&(url.pathname.startsWith('/api/payments')||url.pathname==='/api/agent/receipts'))waitUntil(runWebhookBatch(3).catch(e=>console.error('Webhook batch failed:',e.message)));};
 try{
  if(req.method==='GET'&&files[url.pathname]){const f=files[url.pathname];res.writeHead(200,{...staticHeaders,'Content-Type':mime[f.slice(f.lastIndexOf('.'))]});res.end(readFileSync(new URL('./public/'+f,import.meta.url)));return;}
  if(!url.pathname.startsWith('/api/'))return send(404,{error:'Not found'});
  const path=url.pathname.slice(5);let b={},raw='';
  if(req.method==='POST'){const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>100000)problem('Request too large',413);chunks.push(c);}raw=Buffer.concat(chunks).toString('utf8');try{b=JSON.parse(raw||'{}');}catch{problem('Malformed JSON',400);}if(!b||typeof b!=='object'||Array.isArray(b))problem('JSON object required',400);}
  if(path==='cron/webhooks'&&req.method==='GET'){if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)problem('Unauthorized',401);return send(200,await runWebhookBatch());}
  if(path==='auth/config'&&req.method==='GET')return send(200,{neon:neonAuthEnabled,registration:'merchant'});
  if(req.method==='POST')assertBrowserOrigin(req);
  if(path==='forgot-password'&&req.method==='POST'){rateLimit(req,path);return send(200,await neonForgotPassword(b));}
  if(path==='reset-password'&&req.method==='POST'){rateLimit(req,path);const result=await neonResetPassword(b);res.setHeader('Set-Cookie',sessionCookie('',true));return send(200,result);}
  if(path==='register'&&req.method==='POST'){rateLimit(req,path);if(neonAuthEnabled)return send(201,await neonRegister(b));if(b.role!=='merchant')problem('Use an administrator invitation',403);return send(201,saveRegistration(registrationFields(b)));}
  if(path==='login'&&req.method==='POST'){
   rateLimit(req,path);const result=neonAuthEnabled?await neonLogin(b):login(b);
   delete result.token_hash;
   res.setHeader('Set-Cookie',sessionCookie(result.token));if(neonAuthEnabled)delete result.token;
   return send(200,result);
  }
  const bearer=(req.headers.authorization||'').replace(/^Bearer /,'');
  const token=cookieToken(req)||bearer;
  if(path==='agent/enroll'&&req.method==='POST'){rateLimit(req,path);if(!b.public_key)problem('Android Keystore public key proof required');return send(201,enroll(b));}
  if(path.startsWith('agent/'))authenticateAgent(bearer,req.headers,req.method,url.pathname,raw);
  if(path==='agent/heartbeat'&&req.method==='POST')return send(200,heartbeat(bearer,b));
  if(path==='agent/config'&&req.method==='GET')return send(200,deviceConfig(bearer));
  if(path==='agent/receipts'&&req.method==='POST')return send(201,ingest(b,bearer));
  if(path==='logout'&&req.method==='POST'&&neonAuthEnabled){await neonLogout(token);res.setHeader('Set-Cookie',sessionCookie('',true));return send(200,{ok:true});}
  const actor=neonAuthEnabled?await neonAuthenticate(token):authenticate(token);if(!actor)return send(401,{error:'Your session expired. Please sign in.'});
  if(actor.token_hash)res.setHeader('Set-Cookie',sessionCookie(token,path==='logout'));
  if(path.match(/^admin\/webhooks\/[^/]+\/deliver$/)&&req.method==='POST'){permit(actor,'merchant');if(actor.mfa_enabled&&(!actor.step_up_until||actor.step_up_until<now()))problem('Authenticator confirmation required',403);const eid=path.split('/')[2];audit(actor,'Webhook delivery requested',eid,b.reason||'Operator retry');return send(200,await deliverWebhook(eid));}
  return send(200,dispatch(actor,req.method,path,b));
 }catch(e){const unique=e.message?.includes('UNIQUE constraint');send(e.status||(unique?409:422),{error:unique?'A record with these details already exists.':e.message});}
}
export default handler;
if(!process.env.VERCEL&&process.argv[1]===fileURLToPath(import.meta.url)){
 const server=http.createServer(handler);server.requestTimeout=15000;
 server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>{console.log('kPay admin panel: '+(process.env.APP_ORIGIN||'http://127.0.0.1:'+(process.env.PORT||3000)));console.log('Database: '+(process.env.DATABASE_URL?'Neon PostgreSQL':'local'));if(neonAuthEnabled)console.log('Authentication: Neon Auth');else{console.log('Merchant API key: '+keyFor('merchant'));}});
 let deliveryRunning=false;
 const timer=setInterval(async()=>{if(deliveryRunning)return;deliveryRunning=true;try{await runWebhookBatch(1);}catch(e){console.error('Webhook worker:',e.message);}finally{deliveryRunning=false;}},10000);timer.unref();
 process.on('SIGINT',()=>{clearInterval(timer);server.close(()=>{db.close();process.exit();});});
}
