import http from 'node:http';
import {readFileSync} from 'node:fs';
import {db,keyFor,now,audit,problem} from './store.mjs';
import {login,authenticate,dispatch,ingest,enroll,heartbeat,deviceConfig,permit} from './operations.mjs';
import {deliverWebhook} from './webhooks.mjs';
import {authenticateAgent} from './agent-security.mjs';
import {neonAuthEnabled,neonLogin,neonRegister,neonAuthenticate,neonLogout,assertBrowserOrigin,sessionCookie,cookieToken} from './neon-auth.mjs';
const limits=new Map();
function rateLimit(req,path){const k=(req.socket.remoteAddress||'local')+':'+path;const current=limits.get(k)||{count:0,start:Date.now()};if(Date.now()-current.start>60000){current.count=0;current.start=Date.now();}current.count++;limits.set(k,current);if(current.count>30)problem('Too many attempts. Try again in a minute.',429);if(limits.size>1000)limits.clear();}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/favicon.svg':'favicon.svg'};
const staticHeaders={'Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store'};
async function handler(req,res){
 const url=new URL(req.url,'http://localhost');const send=(code,data)=>{res.writeHead(code,{...staticHeaders,'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 try{
  if(req.method==='GET'&&files[url.pathname]){const f=files[url.pathname];res.writeHead(200,{...staticHeaders,'Content-Type':mime[f.slice(f.lastIndexOf('.'))]});res.end(readFileSync(new URL('./public/'+f,import.meta.url)));return;}
  if(!url.pathname.startsWith('/api/'))return send(404,{error:'Not found'});
  const path=url.pathname.slice(5);let b={},raw='';
  if(req.method==='POST'){const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>100000)problem('Request too large',413);chunks.push(c);}raw=Buffer.concat(chunks).toString('utf8');try{b=JSON.parse(raw||'{}');}catch{problem('Malformed JSON',400);}if(!b||typeof b!=='object'||Array.isArray(b))problem('JSON object required',400);}
  if(path==='auth/config'&&req.method==='GET')return send(200,{neon:neonAuthEnabled});
  if(req.method==='POST')assertBrowserOrigin(req);
  if(path==='register'&&req.method==='POST'&&neonAuthEnabled){rateLimit(req,path);return send(201,await neonRegister(b));}
  if(path==='login'&&req.method==='POST'){
   rateLimit(req,path);const result=neonAuthEnabled&&b.role!=='merchant'?await neonLogin(b):login(b);
   delete result.token_hash;
   if(result.role==='admin'){res.setHeader('Set-Cookie',sessionCookie(result.token));if(neonAuthEnabled)delete result.token;}
   else res.setHeader('Set-Cookie',sessionCookie('',true));
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
  if(actor.kind==='admin')res.setHeader('Set-Cookie',sessionCookie(token,path==='logout'));
  if(path.match(/^admin\/webhooks\/[^/]+\/deliver$/)&&req.method==='POST'){permit(actor,'merchant');if(actor.mfa_enabled&&(!actor.step_up_until||actor.step_up_until<now()))problem('Authenticator confirmation required',403);const eid=path.split('/')[2];audit(actor,'Webhook delivery requested',eid,b.reason||'Operator retry');return send(200,await deliverWebhook(eid));}
  return send(200,dispatch(actor,req.method,path,b));
 }catch(e){const unique=e.message?.includes('UNIQUE constraint');send(e.status||(unique?409:422),{error:unique?'A record with these details already exists.':e.message});}
}
const server=http.createServer(handler);server.requestTimeout=15000;
server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>{console.log('kPay admin panel: '+(process.env.APP_ORIGIN||'http://127.0.0.1:'+(process.env.PORT||3000)));console.log('Database: '+(process.env.DATABASE_URL?'Neon PostgreSQL':'local'));if(neonAuthEnabled)console.log('Authentication: Neon Auth');else {console.log('Admin login key: '+keyFor('admin'));console.log('Merchant login key: '+keyFor('merchant'));}});
let deliveryRunning=false;
const timer=setInterval(async()=>{if(deliveryRunning)return;deliveryRunning=true;try{const w=db.prepare("SELECT w.id FROM webhook_events w JOIN webhook_endpoints e ON e.merchant_id=w.merchant_id WHERE w.status='queued' AND w.next_attempt<=? AND e.enabled=1 ORDER BY w.created LIMIT 1").get(now());if(w)await deliverWebhook(w.id);}catch(e){console.error('Webhook worker:',e.message);}finally{deliveryRunning=false;}},10000);timer.unref();
process.on('SIGINT',()=>{clearInterval(timer);server.close(()=>process.exit());});
