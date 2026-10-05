import {request} from 'node:https';
import {lookup} from 'node:dns/promises';
import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {db,id,now,problem} from './store.mjs';
export function publicAddress(ip){if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0))||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19||b===51))||(a===203&&b===0));}return false;}
const running=new Set();
export async function deliverWebhook(eid){
 if(running.has(eid))problem('Delivery already in progress',409);running.add(eid);
 const lease=id();
 try{
  if(db.prepare('UPDATE webhook_events SET lease_token=?,lease_until=? WHERE id=? AND (lease_until IS NULL OR lease_until<?)').run(lease,new Date(Date.now()+60000).toISOString(),eid,now()).changes!==1)problem('Delivery is leased by another worker or missing',409);
  const w=db.prepare('SELECT * FROM webhook_events WHERE id=?').get(eid);if(!w)problem('Event not found',404);
  const endpoint=db.prepare('SELECT * FROM webhook_endpoints WHERE merchant_id=? AND enabled=1').get(w.merchant_id);if(!endpoint)problem('Configure a merchant webhook endpoint first');
  let status=0,error='';
  try{
   const u=new URL(endpoint.url);if(u.protocol!=='https:'||u.port&&u.port!=='443'||u.username||u.password)throw new Error('Only public HTTPS on port 443 is supported');
   const host=u.hostname.replace(/^\[|\]$/g,'');const addresses=await lookup(host,{all:true});if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Webhook destination must resolve only to public IPv4 addresses');
   const address=addresses[0].address,timestamp=String(Math.floor(Date.now()/1000)),signature=createHmac('sha256',endpoint.secret).update(timestamp+'.'+w.payload).digest('hex');
   status=await new Promise((resolve,reject)=>{const r=request(u,{method:'POST',lookup:(_h,options,cb)=>options.all?cb(null,[{address,family:4}]):cb(null,address,4),headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(w.payload),'X-KPay-Event':w.id,'X-KPay-Timestamp':timestamp,'X-KPay-Signature':'v1='+signature}},response=>{let size=0;response.on('data',chunk=>{size+=chunk.length;if(size>64000)response.destroy();});response.on('end',()=>resolve(response.statusCode));response.on('error',reject);});r.setTimeout(8000,()=>r.destroy(new Error('Delivery timed out')));r.on('error',reject);r.end(w.payload);});
   if(status<200||status>=300)error='Endpoint returned HTTP '+status;
  }catch(e){error=e.message;}
  const attempts=w.attempts+1,success=status>=200&&status<300,dead=!success&&(attempts>=12||Date.now()-Date.parse(w.created)>72*3600000);
  db.prepare('INSERT INTO webhook_attempts VALUES (?,?,?,?,?)').run(id(),eid,status,error,now());db.prepare('UPDATE webhook_events SET status=?,attempts=?,last_status=?,last_error=?,next_attempt=? WHERE id=?').run(success?'delivered':dead?'failed':'queued',attempts,status,error,new Date(Date.now()+Math.min(6*3600000,30000*2**Math.min(attempts,10))).toISOString(),eid);return {delivered:success,status,error};
 }finally{db.prepare('UPDATE webhook_events SET lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?').run(eid,lease);running.delete(eid);}
}
export async function runWebhookBatch(limit=10){
 db.prepare('DELETE FROM rate_limits WHERE window_start<?').run(Date.now()-86400000);
 const rows=db.prepare("SELECT w.id FROM webhook_events w JOIN webhook_endpoints e ON e.merchant_id=w.merchant_id WHERE w.status='queued' AND w.next_attempt<=? AND e.enabled=1 AND (w.lease_until IS NULL OR w.lease_until<?) ORDER BY w.created LIMIT ?").all(now(),now(),Math.min(limit,10));
 let processed=0;for(const row of rows){try{await deliverWebhook(row.id);processed++;}catch(e){if(e.status!==409)throw e;}}
 return {processed};
}
