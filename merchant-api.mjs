import {createHmac,timingSafeEqual} from 'node:crypto';
import {db,problem,required,secret,id,hash,now,audit,keyFor} from './store.mjs';
import {createPayment,claimPayment} from './operations.mjs';
import {applicationOrigin} from './auth-config.mjs';
import {isIP} from 'node:net';
import {publicAddress} from './webhooks.mjs';

function merchant(actor){if(actor?.kind!=='merchant')problem('An active merchant account is required',403);return actor.id;}
function tokenFor(pid){return createHmac('sha256',process.env.AUTH_ENCRYPTION_KEY||keyFor('merchant')).update('kpay-checkout-v1:'+pid).digest('hex');}
function owned(actor,pid){const p=db.prepare('SELECT * FROM payments WHERE id=? AND merchant=?').get(pid,merchant(actor));if(!p)problem('Payment not found',404);return p;}
export function paymentResponse(p){const a=db.prepare('SELECT provider FROM accounts WHERE id=?').get(p.account_id);return {id:p.id,order_id:p.order_id,amount:(p.amount/100).toFixed(2),currency:'BDT',provider:a.provider,status:p.status==='pending'&&Date.parse(p.expires)<Date.now()?'expired':p.status,expires_at:p.expires,created_at:p.created,checkout_url:new URL('/checkout.html',applicationOrigin()).href+'#'+new URLSearchParams({payment:p.id,token:tokenFor(p.id)}).toString()};}
export function merchantPayments(actor,method,path,b,url){
 merchant(actor);
 if(path==='v1/payments'&&method==='POST'){if(b.currency&&b.currency!=='BDT')problem('Only BDT is supported');if(typeof b.amount!=='string')problem('Send amount as a decimal string, such as 100.00');return paymentResponse(createPayment(actor,b));}
 if(path==='v1/payments'&&method==='GET'){
  const order=url.searchParams.get('order_id');if(!order)problem('Provide order_id to look up a payment');const p=db.prepare('SELECT * FROM payments WHERE merchant=? AND order_id=?').get(actor.id,order);if(!p)problem('Payment not found',404);return paymentResponse(p);
 }
 const m=path.match(/^v1\/payments\/([^/]+)(\/claim)?$/);if(!m)problem('Not found',404);
 const p=owned(actor,m[1]);
 if(!m[2]&&method==='GET')return paymentResponse(p);
 if(m[2]&&method==='POST')return paymentResponse(claimPayment(actor,p.id,b));
 problem('Method not allowed',405);
}
export function checkout(method,b){
 const pid=required(b.payment_id,'Payment ID',100),provided=required(b.checkout_token,'Checkout token',64),expected=tokenFor(pid);
 if(!/^[a-f0-9]{64}$/.test(provided)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))problem('Invalid checkout link',404);
 const p=db.prepare('SELECT * FROM payments WHERE id=?').get(pid);if(!p)problem('Payment not found',404);
 const m=db.prepare('SELECT name,status FROM merchants WHERE id=?').get(p.merchant),a=db.prepare('SELECT * FROM accounts WHERE id=?').get(p.account_id);
 if(m.status!=='active')problem('This merchant cannot receive payments',409);
 if(method==='claim'){
  if(p.status!=='verified'&&(Date.parse(p.expires)<Date.now()||a.status!=='active'))problem('Checkout expired or collection is unavailable. Contact the merchant.',409);
  claimPayment({kind:'merchant',id:p.merchant},p.id,b);
 }
 const current=db.prepare('SELECT * FROM payments WHERE id=?').get(pid),response=paymentResponse(current);delete response.checkout_url;
 return {...response,claim_submitted:!!current.trx,merchant_name:m.name,receiving_number:a.number,operation:a.operation,instructions:a.instructions,collection_available:a.status==='active'};
}
export function integration(actor,method,path,b){
 const mid=merchant(actor);
 if(method==='GET'&&path==='merchant/integration')return {base_url:new URL('/api/v1',applicationOrigin()).href,keys:db.prepare('SELECT id,prefix,status,created FROM merchant_keys WHERE merchant_id=? ORDER BY created DESC').all(mid),webhook:db.prepare('SELECT url,enabled FROM webhook_endpoints WHERE merchant_id=?').get(mid)||null,deliveries:db.prepare('SELECT id,event,payment_id,status,attempts,last_status,last_error,created FROM webhook_events WHERE merchant_id=? ORDER BY created DESC LIMIT 25').all(mid)};
 if(!actor.token_hash)problem('Sign in to your merchant dashboard to manage integration credentials',403);
 if(method==='POST'&&path==='merchant/integration/keys'){
  const key=secret(),kid=id();db.prepare('INSERT INTO merchant_keys(id,merchant_id,hash,prefix,created) VALUES (?,?,?,?,?)').run(kid,mid,hash(key),key.slice(0,8),now());audit(actor,'Merchant API key issued',kid,'Merchant self-service integration');return {id:kid,key};
 }
 const revoke=path.match(/^merchant\/integration\/keys\/([^/]+)\/revoke$/);
 if(method==='POST'&&revoke){if(db.prepare("UPDATE merchant_keys SET status='revoked' WHERE id=? AND merchant_id=?").run(revoke[1],mid).changes!==1)problem('Key not found',404);audit(actor,'Merchant API key revoked',revoke[1]);return {revoked:true};}
 const retry=path.match(/^merchant\/integration\/webhooks\/([^/]+)\/retry$/);
 if(method==='POST'&&retry){if(db.prepare("UPDATE webhook_events SET status='queued',next_attempt=?,last_error='' WHERE id=? AND merchant_id=? AND status IN ('failed','queued')").run(now(),retry[1],mid).changes!==1)problem('Undelivered webhook not found',404);audit(actor,'Merchant webhook redelivery queued',retry[1]);return {queued:true};}
 if(method==='POST'&&path==='merchant/integration/webhook'){
  let u;try{u=new URL(b.url);}catch{problem('Enter a valid webhook URL');}if(u.protocol!=='https:'||u.username||u.password||u.hash||(u.port&&u.port!=='443'))problem('Use a public HTTPS webhook URL on port 443 without credentials or a fragment');
  const host=u.hostname.replace(/^\[|\]$/g,'');if(host==='localhost'||host.endsWith('.localhost')||(isIP(host)&&!publicAddress(host)))problem('Use a public webhook destination');
  const signing=secret();db.prepare('INSERT INTO webhook_endpoints VALUES (?,?,?,1) ON CONFLICT(merchant_id) DO UPDATE SET url=excluded.url,secret=excluded.secret,enabled=1').run(mid,u.href,signing);audit(actor,'Merchant webhook configured',mid);return {secret:signing};
 }
 problem('Not found',404);
}
