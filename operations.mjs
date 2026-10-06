import {db,id,now,secret,hash,equal,passwordHash,passwordValid,keyFor,settings,defaults,transaction,audit,problem,required,version,posting,balance} from './store.mjs';
import {phone,money,parseSMS} from './core.mjs';
import {newTotpSecret,totpStep} from './mfa.mjs';
import {verifyEnrollment} from './agent-security.mjs';

const providers=['bkash','nagad','rocket'],types=['personal','merchant','agent'];
const operations=['incoming_transfer','merchant_payment','agent_collection'];
if(!process.env.VERCEL||process.env.KPAY_MIGRATE) db.exec(`CREATE TABLE IF NOT EXISTS parse_attempts(id TEXT PRIMARY KEY,event_id TEXT,template_id TEXT,result TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS decisions(id TEXT PRIMARY KEY,payment_id TEXT,receipt_id TEXT,outcome TEXT,reason TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS claims(id TEXT PRIMARY KEY,payment_id TEXT,sender TEXT,trx TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS adjustments(id TEXT PRIMARY KEY,merchant_id TEXT REFERENCES merchants(id),amount INTEGER,reason TEXT,evidence TEXT,maker TEXT,checker TEXT,status TEXT DEFAULT 'requested',created TEXT);
CREATE TABLE IF NOT EXISTS destination_requests(id TEXT PRIMARY KEY,merchant_id TEXT REFERENCES merchants(id),destination TEXT,maker TEXT,checker TEXT,status TEXT DEFAULT 'requested',reason TEXT,created TEXT);`);
export function permit(actor,action){if(!actor||actor.kind!=='admin'||actor.role!=='admin')problem('Your role cannot perform this action',403);}
export function login(b){
 if(process.env.NEON_AUTH_BASE_URL)problem('Use your email and password to sign in',401);
 const email=required(b.email,'Email').toLowerCase();required(b.password,'Password',200);const password=b.password;
 const admin=db.prepare('SELECT * FROM administrators WHERE LOWER(email)=?').get(email);
 const merchant=db.prepare('SELECT * FROM merchants WHERE LOWER(email)=?').get(email);
 if(admin&&merchant)problem('Account email conflict. Contact an administrator.',403);
 if(admin){if(admin.status!=='active'||!passwordValid(password,admin.password_hash))problem('Invalid credentials',401);return createSession(admin);}
 if(!merchant||merchant.status!=='active'||!passwordValid(password,merchant.password_hash))problem('Invalid credentials or merchant awaiting approval',401);
 return createMerchantSession(merchant);
}
export function createSession(admin){
 const token=secret();db.prepare('INSERT INTO sessions(hash,admin_id,expires,step_up_until) VALUES (?,?,?,?)').run(hash(token),admin.id,new Date(Date.now()+1800000).toISOString(),null);audit({...admin,role:'admin'},'Signed in','session');
 return {role:'admin',token,token_hash:hash(token),name:admin.name,admin_role:'admin',expires_in:1800};
}
export function createMerchantSession(merchant){const token=secret();db.prepare('INSERT INTO sessions(hash,merchant_id,expires) VALUES (?,?,?)').run(hash(token),merchant.id,new Date(Date.now()+1800000).toISOString());return {role:'merchant',token,token_hash:hash(token),name:merchant.name,expires_in:1800};}
export function authenticate(token){
 const session=db.prepare("SELECT a.*,s.expires,s.step_up_until FROM sessions s JOIN administrators a ON a.id=s.admin_id WHERE s.hash=? AND s.expires>? AND a.status='active'").get(hash(token),now());
 if(session){db.prepare('UPDATE sessions SET expires=? WHERE hash=?').run(new Date(Date.now()+1800000).toISOString(),hash(token));return {...session,role:'admin',kind:'admin',token_hash:hash(token)};}
 const merchantSession=db.prepare("SELECT m.id,m.name,m.neon_user_id,s.expires FROM sessions s JOIN merchants m ON m.id=s.merchant_id WHERE s.hash=? AND s.expires>? AND m.status='active'").get(hash(token),now());if(merchantSession){db.prepare('UPDATE sessions SET expires=? WHERE hash=?').run(new Date(Date.now()+1800000).toISOString(),hash(token));return {...merchantSession,kind:'merchant',role:'merchant',token_hash:hash(token)};}
 const key=db.prepare("SELECT k.merchant_id,m.name FROM merchant_keys k JOIN merchants m ON m.id=k.merchant_id WHERE k.hash=? AND k.status='active' AND m.status='active'").get(hash(token));
 return key?{id:key.merchant_id,kind:'merchant',role:'merchant',name:key.name}:null;
}
function enumValue(v,values,name){if(!values.includes(v))problem('Invalid '+name);return v;}
const reason=b=>required(b.reason,'Reason',1000);
const row=(table,key)=>{const value=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(key);if(!value)problem('Record not found',404);return value;};
const review=(entity_type,entity_id,category)=>db.prepare('INSERT OR IGNORE INTO reviews(id,entity_type,entity_id,category,created) VALUES (?,?,?,?,?)').run(id(),entity_type,entity_id,category,now());
function snapshot(actor){
 const admin=actor.kind==='admin';
 const totals=Object.fromEntries(db.prepare(admin?'SELECT account,SUM(amount) amount FROM entries GROUP BY account':'SELECT account,SUM(amount) amount FROM entries WHERE account IN (?,?) GROUP BY account').all(...(admin?[]:['merchant:'+actor.id+':available','merchant:'+actor.id+':reserved'])).map(row=>[row.account,row.amount]));
 const accountBalance=key=>totals[key]||0;
 const payments=db.prepare(admin?'SELECT * FROM payments ORDER BY created DESC':'SELECT * FROM payments WHERE merchant=? ORDER BY created DESC').all(...(admin?[]:[actor.id]));
 const merchants=admin?db.prepare('SELECT * FROM merchants ORDER BY created DESC').all():[row('merchants',actor.id)];
 const accounts=db.prepare('SELECT id,provider,type,number,label,status,enabled,operation,instructions,minimum,maximum,daily_limit,version,created FROM accounts ORDER BY created DESC').all();
 const data={actor:{id:actor.id,name:actor.name,role:actor.role,kind:actor.kind,mfa_enabled:!!actor.mfa_enabled},accounts:admin?accounts:accounts.filter(a=>a.status==='active'),payments,merchants:merchants.map(({password_hash,neon_user_id,...m})=>({...m,available:accountBalance('merchant:'+m.id+':available'),reserved:accountBalance('merchant:'+m.id+':reserved')})),settings:admin?settings():{},ledger:admin?db.prepare('SELECT * FROM postings ORDER BY created DESC').all():[],entries:admin?db.prepare('SELECT * FROM entries').all():[],settlements:db.prepare(admin?'SELECT * FROM settlements ORDER BY created DESC':'SELECT * FROM settlements WHERE merchant_id=? ORDER BY created DESC').all(...(admin?[]:[actor.id]))};
 if(!admin){data.keys=db.prepare('SELECT id,prefix,status,created FROM merchant_keys WHERE merchant_id=? ORDER BY created DESC').all(actor.id);data.endpoints=db.prepare('SELECT url,enabled FROM webhook_endpoints WHERE merchant_id=?').all(actor.id);data.webhooks=db.prepare('SELECT id,event,payment_id,status,attempts,last_status,last_error,created FROM webhook_events WHERE merchant_id=? ORDER BY created DESC LIMIT 25').all(actor.id);return data;}
 data.destination_requests=db.prepare('SELECT * FROM destination_requests ORDER BY created DESC').all();
 Object.assign(data,{templates:db.prepare('SELECT * FROM templates ORDER BY created DESC').all(),fixtures:db.prepare('SELECT * FROM template_fixtures').all(),devices:db.prepare('SELECT id,name,account_id,status,sim,app_version,android_version,last_seen,queue_depth,permission,version,created,public_key,proposed_subscription,approved_subscription,binding_health,capture_paused FROM devices ORDER BY created DESC').all(),sms:db.prepare('SELECT id,device_id,account_id,sms_sender,status,reason,template_id,receipt_id,created FROM sms_events ORDER BY created DESC').all(),receipts:db.prepare('SELECT * FROM receipts ORDER BY created DESC').all(),reviews:db.prepare('SELECT * FROM reviews ORDER BY created DESC').all(),notes:db.prepare('SELECT * FROM review_notes ORDER BY created DESC').all(),users:db.prepare('SELECT * FROM users ORDER BY created DESC').all().map(u=>({...u,balance:accountBalance('user:'+u.id+':available')})),audit:db.prepare('SELECT * FROM audit ORDER BY created DESC').all(),administrators:actor.role==='admin'?db.prepare('SELECT id,name,email,role,status,created FROM administrators').all():[],webhooks:db.prepare('SELECT * FROM webhook_events ORDER BY created DESC').all(),webhook_attempts:db.prepare('SELECT * FROM webhook_attempts ORDER BY created DESC').all(),endpoints:db.prepare('SELECT merchant_id,url,enabled FROM webhook_endpoints').all(),reconciliation:db.prepare('SELECT * FROM reconciliation ORDER BY created DESC').all(),adjustments:db.prepare('SELECT * FROM adjustments ORDER BY created DESC').all(),keys:actor.role==='admin'?db.prepare('SELECT id,merchant_id,prefix,status,created FROM merchant_keys').all():[]});
 return data;
}
function templateBody(b){enumValue(b.provider,providers,'provider');enumValue(b.type,types,'account type');enumValue(b.operation,operations,'payment operation');required(b.name,'Template name');required(b.sms_sender,'SMS sender');parseSMS(b.pattern,b.sample);}
function fixtureResults(t){return db.prepare('SELECT * FROM template_fixtures WHERE template_id=?').all(t.id).map(f=>{let parsed,error;try{parsed=parseSMS(t.pattern,f.message);}catch(e){error=e.message;}return {...f,passed:f.expected==='match'?!!parsed:!parsed,parsed,error};});}
function accountEligible(a){
 if(!db.prepare("SELECT id FROM templates WHERE provider=? AND type=? AND operation=? AND status='published' AND enabled=1").get(a.provider,a.type,a.operation))problem('Publish an eligible SMS template before activating this account');
 const d=db.prepare("SELECT * FROM devices WHERE account_id=? AND status='active'").get(a.id);
 if(!d||d.capture_paused|| (d.public_key&&(d.binding_health!=='healthy'||d.approved_subscription===null)) ||d.permission!=='granted'||!d.last_seen||Date.now()-Date.parse(d.last_seen)>settings().offline_minutes*60000)problem('An approved, healthy device with SMS permission is required');
}
export function matchPayments(){
 return transaction(()=>{
  for(const r of db.prepare("SELECT r.* FROM receipts r JOIN accounts a ON a.id=r.account_id WHERE r.payment_id IS NULL AND r.status='unmatched' AND a.status NOT IN ('quarantined','retired')").all()){
   const possible=db.prepare("SELECT * FROM payments WHERE account_id=? AND trx=? AND status IN ('pending','review_required')").all(r.account_id,r.trx);
   if(possible.length>1){for(const p of possible){db.prepare("UPDATE payments SET status='review_required',version=version+1 WHERE id=?").run(p.id);review('payment',p.id,'Competing transaction claims');}continue;}
   const p=possible[0];if(!p)continue;
   if(p.amount!==r.amount||p.sender!==r.sender){review('payment',p.id,'Sender or amount mismatch');continue;}
   if(p.expires&&Date.now()>Date.parse(p.expires)){db.prepare("UPDATE payments SET status='review_required' WHERE id=?").run(p.id);review('payment',p.id,'Expired payment requires review');continue;}
   const beneficiary=p.beneficiary_type==='user'?row('users',p.beneficiary_id):row('merchants',p.merchant);
   if(beneficiary.status!=='active'){review('payment',p.id,'Beneficiary suspended');continue;}
   if(db.prepare('UPDATE receipts SET payment_id=?,status=\'matched\' WHERE id=? AND payment_id IS NULL').run(p.id,r.id).changes!==1)continue;
   const acct=p.beneficiary_type==='user'?'user:'+p.beneficiary_id+':available':'merchant:'+p.merchant+':available';
   const lines=[['collection',-p.amount],[acct,p.amount-p.fee]];if(p.fee)lines.push(['fees',p.fee]);
   posting('payment:'+p.id,p.beneficiary_type==='user'?'recharge':'payment','Verified '+p.order_id,lines);
   db.prepare('INSERT INTO ledger VALUES (?,?,?,?,?)').run(id(),p.id,p.merchant,p.amount-p.fee,now());
   db.prepare("UPDATE payments SET status='verified',version=version+1 WHERE id=?").run(p.id);
   db.prepare('INSERT INTO decisions VALUES (?,?,?,?,?,?)').run(id(),p.id,r.id,'verified','Exact sender, transaction and amount match',now());
   db.prepare("UPDATE reviews SET status='resolved' WHERE entity_type='payment' AND entity_id=?").run(p.id);
   if(p.beneficiary_type!=='user'){
    const eid=id(),payload=JSON.stringify({id:eid,type:'payment.verified',created:now(),payment_id:p.id,order_id:p.order_id,amount:(p.amount/100).toFixed(2),currency:'BDT',status:'verified'});
    db.prepare('INSERT INTO webhook_events(id,merchant_id,payment_id,event,payload,next_attempt,created) VALUES (?,?,?,?,?,?,?)').run(eid,p.merchant,p.id,'payment.verified',payload,now(),now());
   }
   audit(null,'Payment verified',p.id,'Exact receipt evidence match');
  }
 });
}
export function createPayment(actor,b){
 return transaction(()=>createPaymentInside(actor,b));
}
function createPaymentInside(actor,b){
 const merchant=actor.kind==='merchant'?row('merchants',actor.id):row('merchants',b.merchant_id||'demo_merchant');
 // Serialize retries for the same merchant across PostgreSQL function instances.
 db.prepare('UPDATE merchants SET version=version WHERE id=?').run(merchant.id);Object.assign(merchant,row('merchants',merchant.id));
 if(merchant.status!=='active')problem('Merchant is suspended');
 const amount=money(b.amount),order=required(b.order_id,'Order ID',100);
 const old=db.prepare('SELECT * FROM payments WHERE merchant=? AND order_id=?').get(merchant.id,order);
 if(old){const previous=db.prepare('SELECT provider FROM accounts WHERE id=?').get(old.account_id);if(old.amount!==amount||(b.provider&&previous.provider!==b.provider)||(b.account_id&&old.account_id!==b.account_id))problem('Order ID already used with different details',409);return old;}
 const user=b.beneficiary_type==='user'&&actor.kind==='admin'?row('users',b.user_id):null;
 if(user&&user.status!=='active')problem('User is suspended');
 let a;
 if(actor.kind==='admin'&&b.account_id)a=row('accounts',b.account_id);
 else{
   if(b.account_id||b.receiving_number)problem('Merchants cannot select or configure receiving numbers',403);
   enumValue(b.provider,JSON.parse(merchant.providers),'enabled provider');
   a=db.prepare("SELECT * FROM accounts WHERE provider=? AND status='active' ORDER BY created").all(b.provider).find(x=>{try{accountEligible(x);return amount>=x.minimum&&amount<=x.maximum;}catch{return false;}});
 }
 if(!a||a.status!=='active')problem('No eligible central receiving account');
 db.prepare('UPDATE accounts SET version=version WHERE id=?').run(a.id);a=row('accounts',a.id);
 if(a.status!=='active')problem('No eligible central receiving account');accountEligible(a);
 if(amount<a.minimum||amount>a.maximum)problem('Amount exceeds receiving account limits');
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Dhaka'});
 const allocated=db.prepare("SELECT amount,created FROM payments WHERE account_id=? AND status NOT IN ('cancelled','rejected')").all(a.id).filter(p=>new Date(p.created).toLocaleDateString('en-CA',{timeZone:'Asia/Dhaka'})===day).reduce((s,p)=>s+p.amount,0);
 if(allocated+amount>a.daily_limit)problem('Receiving account daily allocation limit reached');
 const s=settings(),fee=user?0:Math.min(amount,Math.floor((amount*s.fee_bps+5000)/10000)+s.fee_fixed),pid=id();
 db.prepare('INSERT INTO payments(id,merchant,account_id,amount,created,order_id,beneficiary_type,beneficiary_id,expires,fee) VALUES (?,?,?,?,?,?,?,?,?,?)').run(pid,merchant.id,a.id,amount,now(),order,user?'user':'merchant',user?.id||merchant.id,new Date(Date.now()+s.expiry_minutes*60000).toISOString(),fee);
 audit(actor,'Payment request created',pid);return row('payments',pid);
}
export function claimPayment(actor,pid,b){
 const p=row('payments',pid);if(actor.kind==='merchant'&&p.merchant!==actor.id)problem('Payment not found',404);
 if(p.status==='verified')return p;
 if(['rejected','cancelled','expired'].includes(p.status))problem('Payment cannot accept a claim',409);
 const sender=phone(b.sender),trx=required(b.transaction,'Transaction ID',80).toUpperCase();if(!/^[A-Z0-9-]{3,80}$/.test(trx))problem('Invalid transaction ID');
 const consumed=db.prepare('SELECT payment_id FROM receipts WHERE provider=(SELECT provider FROM accounts WHERE id=?) AND trx=? AND payment_id IS NOT NULL').get(p.account_id,trx);
 if(consumed)problem('Transaction has already been used',409);
 transaction(()=>{db.prepare('INSERT INTO claims VALUES (?,?,?,?,?)').run(id(),pid,sender,trx,now());const late=p.expires&&Date.now()>Date.parse(p.expires);db.prepare('UPDATE payments SET sender=?,trx=?,status=?,version=version+1 WHERE id=?').run(sender,trx,late?'review_required':'pending',pid);if(late)review('payment',pid,'Expired payment requires review');audit(actor,'Payment details submitted',pid);});
 matchPayments();return row('payments',pid);
}
function parseEvent(e){
 const a=row('accounts',e.account_id);
 if(a.status==='quarantined'||a.status==='retired'){db.prepare("UPDATE sms_events SET status='quarantined',reason=? WHERE id=?").run('Receiving account is quarantined or retired',e.id);review('sms',e.id,'Account quarantined');return;}
 const candidates=db.prepare("SELECT * FROM templates WHERE provider=? AND type=? AND operation=? AND LOWER(sms_sender)=LOWER(?) AND status='published' AND enabled=1").all(a.provider,a.type,a.operation,e.sms_sender);
 const parsed=[];
 for(const t of candidates){try{const p=parseSMS(t.pattern,e.message);parsed.push({t,p});db.prepare('INSERT INTO parse_attempts VALUES (?,?,?,?,?)').run(id(),e.id,t.id,JSON.stringify(p),now());}catch(error){db.prepare('INSERT INTO parse_attempts VALUES (?,?,?,?,?)').run(id(),e.id,t.id,JSON.stringify({error:error.message}),now());}}
 if(!parsed.length){db.prepare("UPDATE sms_events SET status='unparsed',reason='No eligible template matched' WHERE id=?").run(e.id);review('sms',e.id,'Unrecognized payment SMS');return;}
 if(new Set(parsed.map(x=>JSON.stringify(x.p))).size!==1){db.prepare("UPDATE sms_events SET status='ambiguous',reason='Templates extracted conflicting fields' WHERE id=?").run(e.id);review('sms',e.id,'Ambiguous templates');return;}
 const {t,p}=parsed[0],old=db.prepare('SELECT * FROM receipts WHERE provider=? AND trx=?').get(a.provider,p.transaction);
 if(old){
   if(old.account_id!==a.id||old.sender!==p.sender||old.amount!==p.amount){db.prepare("UPDATE sms_events SET status='conflict',reason='Transaction details conflict with existing receipt' WHERE id=?").run(e.id);db.prepare("UPDATE receipts SET status='conflict' WHERE id=?").run(old.id);review('sms',e.id,'Conflicting transaction evidence');return;}
   db.prepare("UPDATE sms_events SET status='duplicate',template_id=?,receipt_id=?,reason='' WHERE id=?").run(t.id,old.id,e.id);return;
 }
 const rid=id();db.prepare('INSERT INTO receipts(id,account_id,provider,trx,sender,amount,created,event_id) VALUES (?,?,?,?,?,?,?,?)').run(rid,a.id,a.provider,p.transaction,p.sender,p.amount,now(),e.id);
 db.prepare("UPDATE sms_events SET status='parsed',template_id=?,receipt_id=?,reason='' WHERE id=?").run(t.id,rid,e.id);db.prepare("UPDATE reviews SET status='resolved' WHERE entity_type='sms' AND entity_id=?").run(e.id);
}
export function ingest(b,token,actor=null){
 const a=row('accounts',b.account_id),device=db.prepare('SELECT * FROM devices WHERE account_id=?').get(a.id);
 if(!device||device.status!=='active'||(!actor&&!equal(hash(token),device.key_hash)))problem('Invalid or inactive device credentials',401);
 if(device.public_key&&(Number(b.subscription_id)!==device.approved_subscription||device.approved_subscription===null||device.binding_health!=='healthy'))problem('Approved physical SIM binding required',409);
 if(actor)permit(actor,'collection');
 if(b.sim&&b.sim!==device.sim)problem('SIM binding mismatch',409);
 const cid=required(b.client_event_id,'Client event ID',100),message=required(b.message,'SMS body',4000),origin=required(b.sms_sender,'SMS sender',100);
 const old=db.prepare('SELECT * FROM sms_events WHERE device_id=? AND client_event_id=?').get(device.id,cid);
 if(old){if(old.message!==message||old.account_id!==a.id||old.sms_sender!==origin)problem('Event ID reused with different content',409);return {...old,duplicate:true,message:undefined};}
 const eid=id();transaction(()=>{db.prepare('INSERT INTO sms_events(id,device_id,client_event_id,account_id,sms_sender,message,status,created) VALUES (?,?,?,?,?,?,?,?)').run(eid,device.id,cid,a.id,origin,message,'accepted',now());parseEvent(row('sms_events',eid));db.prepare('UPDATE devices SET last_seen=? WHERE id=?').run(now(),device.id);});
 matchPayments();return {...row('sms_events',eid),message:undefined};
}
function settlementAction(actor,sid,b){
 permit(actor,'finance');return transaction(()=>{
  const s=row('settlements',sid);version(s,b);const why=reason(b);
  if(b.action==='approve'){
   if(s.status!=='reserved')problem('Only reserved settlements can be approved',409);if(s.maker===actor.id)problem('A different administrator must approve this payout',403);
   db.prepare("UPDATE settlements SET status='approved',checker=?,reason=?,version=version+1,updated=? WHERE id=?").run(actor.id,why,now(),sid);
  }else if(['paid','resolve_paid'].includes(b.action)){
   if(b.action==='paid'&&s.status!=='approved'||b.action==='resolve_paid'&&s.status!=='uncertain')problem('Settlement is not eligible for this completion action',409);
   if(b.action==='resolve_paid'&&s.maker===actor.id)problem('A different administrator must resolve payout uncertainty',403);
   const trx=required(b.external_trx,'External payout transaction ID',100).toUpperCase(),evidence=required(b.evidence,'Payout evidence',2000);
   posting('settlement-paid:'+sid,'settlement','Paid settlement '+sid,[['merchant:'+s.merchant_id+':reserved',-s.amount],['collection',s.amount]]);
   db.prepare("UPDATE settlements SET status='paid',external_trx=?,evidence=?,reason=?,version=version+1,updated=? WHERE id=?").run(trx,evidence,why,now(),sid);
  }else if(b.action==='uncertain'){
   if(s.status!=='approved')problem('Only approved payouts can enter uncertainty review',409);db.prepare("UPDATE settlements SET status='uncertain',reason=?,version=version+1,updated=? WHERE id=?").run(why,now(),sid);
  }else if(['cancel','resolve_failed'].includes(b.action)){
   if(b.action==='cancel'&&!['reserved','approved'].includes(s.status))problem('Cannot release completed or uncertain payout',409);
   if(b.action==='resolve_failed'){if(s.status!=='uncertain')problem('Payout is not uncertain',409);if(s.maker===actor.id)problem('A different administrator must confirm failed execution',403);required(b.evidence,'Independent failed-payout evidence',2000);}
   posting('settlement-release:'+sid,'settlement','Release cancelled reservation',[['merchant:'+s.merchant_id+':reserved',-s.amount],['merchant:'+s.merchant_id+':available',s.amount]]);
   db.prepare("UPDATE settlements SET status=?,reason=?,evidence=?,version=version+1,updated=? WHERE id=?").run(b.action==='resolve_failed'?'failed':'cancelled',why,b.evidence||'',now(),sid);
  }else problem('Invalid settlement action');
  audit(actor,'Settlement '+b.action,sid,why);return row('settlements',sid);
 });
}

export function dispatch(actor,method,path,b){
 if(method==='GET'&&path==='state')return snapshot(actor);
 if(path==='logout'){if(actor.token_hash)db.prepare('DELETE FROM sessions WHERE hash=?').run(actor.token_hash);return {signed_out:true};}
 if(method==='POST'&&path==='payments')return createPayment(actor,b);
 let m=path.match(/^payments\/([^/]+)\/claim$/);if(method==='POST'&&m)return claimPayment(actor,m[1],b);
 m=path.match(/^payments\/([^/]+)$/);if(method==='GET'&&m){const p=row('payments',m[1]);if(actor.kind==='merchant'&&p.merchant!==actor.id)problem('Payment not found',404);return p;}
 if(!path.startsWith('admin/'))problem('Not found',404);permit(actor,'read');const route=path.slice(6);
 if(method==='POST'&&route==='security/start'){
  if(actor.mfa_enabled)problem('Authenticator is already enabled');const seed=newTotpSecret();db.prepare('UPDATE administrators SET mfa_pending=? WHERE id=?').run(seed,actor.id);audit(actor,'Authenticator setup started',actor.id);return {secret:seed};
 }
 if(method==='POST'&&['security/confirm','security/step-up'].includes(route)){
  const a=row('administrators',actor.id),seed=route==='security/confirm'?a.mfa_pending:a.mfa_secret,step=seed?totpStep(seed,b.otp):null;if(step===null)problem('Invalid authenticator code',401);
  if(a.last_totp_step>=step)problem('Wait for the next authenticator code',401);
  db.prepare('UPDATE administrators SET mfa_secret=?,mfa_pending=NULL,mfa_enabled=1,last_totp_step=? WHERE id=?').run(seed,step,a.id);
  db.prepare('UPDATE sessions SET step_up_until=? WHERE hash=?').run(new Date(Date.now()+300000).toISOString(),actor.token_hash);audit(actor,'Authenticator verified',a.id);return {enabled:true};
 }
 if(method==='POST'&&actor.mfa_enabled&&(!actor.step_up_until||actor.step_up_until<now()))problem('Confirm your authenticator code from Account security before making changes',403);
 if(method==='GET'&&route.startsWith('detail/')){
  const [,type,rid]=route.split('/');const allowed={payments:'payments',accounts:'accounts',devices:'devices',templates:'templates',reviews:'reviews',settlements:'settlements',merchants:'merchants',users:'users',ledger:'postings',sms:'sms_events'};
  if(!allowed[type])problem('Not found',404);const data=row(allowed[type],rid);
  if(type==='templates')permit(actor,'evidence');
  if(type==='sms'){permit(actor,'evidence');if(actor.mfa_enabled&&(!actor.step_up_until||actor.step_up_until<now()))problem('Confirm authenticator before revealing evidence',403);audit(actor,'Raw SMS revealed',rid,'Operator investigation');data.attempts=db.prepare('SELECT * FROM parse_attempts WHERE event_id=?').all(rid);}
  delete data.device_key;delete data.key_hash;delete data.password_hash;delete data.neon_user_id;
  if(type==='payments'){data.claims=db.prepare('SELECT * FROM claims WHERE payment_id=?').all(rid);data.decisions=db.prepare('SELECT * FROM decisions WHERE payment_id=?').all(rid);data.receipt=db.prepare('SELECT * FROM receipts WHERE payment_id=?').get(rid);}
  if(type==='ledger')data.entries=db.prepare('SELECT * FROM entries WHERE posting_id=?').all(rid);
  return data;
 }
 if(method!=='POST')problem('Not found',404);
 if(route==='accounts'){
  permit(actor,'collection');enumValue(b.provider,providers,'provider');enumValue(b.type,types,'account type');enumValue(b.operation,operations,'operation');
  const minimum=money(b.minimum||'1'),maximum=money(b.maximum||'1000000'),daily=money(b.daily_limit||'1000000');if(minimum>maximum||maximum>daily)problem('Minimum ≤ maximum ≤ daily limit is required');
  const aid=id();db.prepare('INSERT INTO accounts(id,provider,type,number,device_key,enabled,label,status,operation,instructions,minimum,maximum,daily_limit,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(aid,b.provider,b.type,phone(b.number),'',0,required(b.label,'Account label'),'paused',b.operation,required(b.instructions,'Checkout instructions',2000),minimum,maximum,daily,now());audit(actor,'Central account created',aid);return row('accounts',aid);
 }
 m=route.match(/^accounts\/([^/]+)$/);if(m){permit(actor,'collection');const a=row('accounts',m[1]);version(a,b);const why=reason(b);
  if(b.action==='status'){enumValue(b.status,['active','paused','quarantined','retired'],'status');if(a.status==='retired')problem('Retired accounts cannot be changed');if(b.status==='active')accountEligible(a);db.prepare('UPDATE accounts SET status=?,enabled=?,version=version+1 WHERE id=?').run(b.status,b.status==='active'?1:0,a.id);}
  else{const min=money(b.minimum),max=money(b.maximum),daily=money(b.daily_limit);if(min>max||max>daily)problem('Invalid account limits');db.prepare('UPDATE accounts SET label=?,instructions=?,minimum=?,maximum=?,daily_limit=?,version=version+1 WHERE id=?').run(required(b.label,'Label'),required(b.instructions,'Instructions',2000),min,max,daily,a.id);}
  audit(actor,'Central account updated',a.id,why,{status:b.status||a.status});return row('accounts',a.id);
 }
 if(route==='templates/test'){permit(actor,'collection');return parseSMS(b.pattern,b.sample);}
 if(route==='templates'){
  permit(actor,'collection');templateBody(b);const tid=id(),parent=b.parent_id?row('templates',b.parent_id):null;
  const nextVersion=parent?db.prepare('SELECT MAX(version)+1 n FROM templates WHERE family=?').get(parent.family).n:1;
  db.prepare('INSERT INTO templates(id,name,provider,type,sms_sender,pattern,sample,enabled,status,operation,version,family,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(tid,b.name,b.provider,b.type,b.sms_sender,b.pattern,b.sample,0,'draft',b.operation,nextVersion,parent?.family||tid,now());
  db.prepare('INSERT INTO template_fixtures VALUES (?,?,?,?)').run(id(),tid,b.sample,'match');audit(actor,'SMS template draft created',tid);return row('templates',tid);
 }
 m=route.match(/^templates\/([^/]+)\/(fixtures|publish|pause)$/);if(m){permit(actor,'collection');const t=row('templates',m[1]);
  if(m[2]==='fixtures'){if(t.status!=='draft')problem('Only drafts accept new fixtures');enumValue(b.expected,['match','reject'],'fixture expectation');db.prepare('INSERT INTO template_fixtures VALUES (?,?,?,?)').run(id(),t.id,required(b.message,'Fixture message',4000),b.expected);return fixtureResults(t);}
  const why=reason(b);if(m[2]==='publish'){
   const results=fixtureResults(t);if(new Set(results.filter(x=>x.expected==='match').map(x=>x.message)).size<2||!results.some(x=>x.expected==='reject')||results.some(x=>!x.passed))problem('Publication needs two distinct passing positive samples and one passing negative sample');
   const other=db.prepare("SELECT * FROM templates WHERE provider=? AND type=? AND operation=? AND sms_sender=? AND status='published' AND family!=?").all(t.provider,t.type,t.operation,t.sms_sender,t.family);
   for(const f of results.filter(x=>x.expected==='match'))for(const o of other){let parsed;try{parsed=parseSMS(o.pattern,f.message);}catch{}if(parsed&&JSON.stringify(parsed)!==JSON.stringify(f.parsed))problem('Publication conflicts with another active template');}
   transaction(()=>{db.prepare("UPDATE templates SET status='paused',enabled=0 WHERE family=? AND status='published'").run(t.family);db.prepare("UPDATE templates SET status='published',enabled=1 WHERE id=?").run(t.id);});
  }else db.prepare("UPDATE templates SET status='paused',enabled=0 WHERE id=?").run(t.id);
  audit(actor,'SMS template '+m[2],t.id,why);return {...row('templates',t.id),fixtures:fixtureResults(t)};
 }
 if(route==='devices'){
  permit(actor,'collection');row('accounts',b.account_id);const did=id(),code=secret().slice(0,12);
  db.prepare('INSERT INTO devices(id,name,account_id,sim,created) VALUES (?,?,?,?,?)').run(did,required(b.name,'Device name'),b.account_id,required(b.sim,'SIM binding label'),now());
  db.prepare('INSERT INTO pairings VALUES (?,?,?,?,0)').run(id(),hash(code),did,new Date(Date.now()+600000).toISOString());audit(actor,'Device pairing created',did);return {id:did,code,expires_in:600};
 }
 m=route.match(/^devices\/([^/]+)$/);if(m){permit(actor,'collection');const d=row('devices',m[1]);version(d,b);const why=reason(b);
  if(b.action==='refresh'){audit(actor,'Device configuration refresh requested',d.id,why);db.prepare('UPDATE devices SET version=version+1 WHERE id=?').run(d.id);return row('devices',d.id);}
  if(b.action==='pair'){if(d.status==='active')problem('Pause the device before re-pairing');const code=secret().slice(0,12);transaction(()=>{db.prepare('UPDATE pairings SET used=1 WHERE device_id=?').run(d.id);db.prepare('INSERT INTO pairings VALUES (?,?,?,?,0)').run(id(),hash(code),d.id,new Date(Date.now()+600000).toISOString());db.prepare("UPDATE devices SET status='pending',key_hash=NULL,public_key=NULL,approved_subscription=NULL,proposed_subscription=NULL,binding_health='unknown',version=version+1 WHERE id=?").run(d.id);});audit(actor,'Device re-pair requested',d.id,why);return {code,expires_in:600};}
  enumValue(b.status,['active','paused','revoked'],'device status');if(b.status==='active'&&(!d.key_hash||d.permission!=='granted'))problem('Enroll device and confirm SMS permission before approval');
  if(b.status==='active'&&d.public_key){if(d.proposed_subscription===null||Number(b.subscription_id)!==d.proposed_subscription||d.binding_health!=='healthy')problem('Confirm the physical subscription ID reported by the phone');db.prepare('UPDATE devices SET approved_subscription=? WHERE id=?').run(d.proposed_subscription,d.id);}
  db.prepare('UPDATE devices SET status=?,key_hash=?,version=version+1 WHERE id=?').run(b.status,b.status==='revoked'?null:d.key_hash,d.id);
  if(b.status!=='active')db.prepare("UPDATE accounts SET status='paused',enabled=0,version=version+1 WHERE id=? AND status='active'").run(d.account_id);
  audit(actor,'Device '+b.status,d.id,why);return {updated:true};
 }
 if(route==='simulator/enroll'){permit(actor,'collection');return enroll(b);}
 if(route==='simulator/receipts')return ingest(b,'',actor);
 if(route==='merchants'){permit(actor,'merchant');const mid=id(),destination=required(b.destination,'Settlement destination',500);transaction(()=>{db.prepare('INSERT INTO merchants(id,name,email,created) VALUES (?,?,?,?)').run(mid,required(b.name,'Merchant name'),required(b.email,'Email'),now());db.prepare('INSERT INTO destination_requests(id,merchant_id,destination,maker,reason,created) VALUES (?,?,?,?,?,?)').run(id(),mid,destination,actor.id,'Initial destination pending independent approval',now());audit(actor,'Merchant onboarded',mid);});return row('merchants',mid);}
 m=route.match(/^merchants\/([^/]+)\/destination$/);if(m){permit(actor,'merchant');row('merchants',m[1]);const did=id();db.prepare('INSERT INTO destination_requests(id,merchant_id,destination,maker,reason,created) VALUES (?,?,?,?,?,?)').run(did,m[1],required(b.destination,'Destination',500),actor.id,reason(b),now());audit(actor,'Destination approval requested',did,b.reason);return {id:did};}
 m=route.match(/^destinations\/([^/]+)\/approve$/);if(m){permit(actor,'merchant');return transaction(()=>{const d=row('destination_requests',m[1]);if(d.status!=='requested')problem('Destination already processed',409);if(d.maker===actor.id)problem('A different administrator must approve the destination',403);if(db.prepare("SELECT id FROM settlements WHERE merchant_id=? AND status IN ('reserved','approved','uncertain')").get(d.merchant_id))problem('Resolve outstanding settlements before changing destination');db.prepare('UPDATE merchants SET destination=?,version=version+1 WHERE id=?').run(d.destination,d.merchant_id);db.prepare("UPDATE destination_requests SET status='approved',checker=? WHERE id=?").run(actor.id,d.id);db.prepare("UPDATE destination_requests SET status='superseded' WHERE merchant_id=? AND status='requested' AND id!=?").run(d.merchant_id,d.id);audit(actor,'Destination approved',d.id,reason(b));return {approved:true};});}
 m=route.match(/^merchants\/([^/]+)$/);if(m){permit(actor,'merchant');const r=row('merchants',m[1]);version(r,b);const why=reason(b);const enabled=Array.isArray(b.providers)?b.providers:JSON.parse(r.providers);if((b.status==='active'&&!enabled.length)||enabled.some(p=>!providers.includes(p)))problem('Choose supported providers');enumValue(b.status,['active','suspended','pending'],'merchant status');db.prepare('UPDATE merchants SET status=?,providers=?,version=version+1 WHERE id=?').run(b.status,JSON.stringify(enabled),r.id);if(b.status==='suspended')db.prepare('DELETE FROM sessions WHERE merchant_id=?').run(r.id);audit(actor,'Merchant updated',r.id,why);const {password_hash,neon_user_id,...safe}=row('merchants',r.id);return safe;}
 m=route.match(/^merchants\/([^/]+)\/keys$/);if(m){permit(actor,'*');row('merchants',m[1]);const key=secret(),kid=id();db.prepare('INSERT INTO merchant_keys(id,merchant_id,hash,prefix,created) VALUES (?,?,?,?,?)').run(kid,m[1],hash(key),key.slice(0,8),now());audit(actor,'Merchant API key issued',kid,reason(b));return {id:kid,key};}
 m=route.match(/^keys\/([^/]+)\/revoke$/);if(m){permit(actor,'*');row('merchant_keys',m[1]);db.prepare("UPDATE merchant_keys SET status='revoked' WHERE id=?").run(m[1]);audit(actor,'Merchant key revoked',m[1],reason(b));return {revoked:true};}
 if(route==='users'){permit(actor,'merchant');const uid=id();db.prepare('INSERT INTO users(id,name,number,created) VALUES (?,?,?,?)').run(uid,required(b.name,'User name'),phone(b.number),now());audit(actor,'Recharge user created',uid);return row('users',uid);}
 m=route.match(/^users\/([^/]+)$/);if(m){permit(actor,'merchant');row('users',m[1]);enumValue(b.status,['active','suspended'],'user status');db.prepare('UPDATE users SET status=? WHERE id=?').run(b.status,m[1]);audit(actor,'User status updated',m[1],reason(b));return {updated:true};}
 m=route.match(/^reviews\/([^/]+)$/);if(m){permit(actor,'review');const r=row('reviews',m[1]),note=reason(b);
  if(b.action==='retry'){permit(actor,'collection');if(r.entity_type==='sms'){const e=row('sms_events',r.entity_id);if(e.receipt_id&&row('receipts',e.receipt_id).payment_id)problem('Consumed receipts cannot be reinterpreted');transaction(()=>parseEvent(e));}matchPayments();}
  if(b.action==='reject'){permit(actor,'collection');if(r.entity_type!=='payment')problem('Only payment claims can be rejected');const p=row('payments',r.entity_id);if(p.status==='verified')problem('Verified payments cannot be rejected');db.prepare("UPDATE payments SET status='rejected',version=version+1 WHERE id=?").run(p.id);db.prepare("UPDATE reviews SET status='resolved' WHERE id=?").run(r.id);}
  if(b.action==='assign'){row('administrators',b.assignee);db.prepare('UPDATE reviews SET assignee=? WHERE id=?').run(b.assignee,r.id);}
  db.prepare('INSERT INTO review_notes VALUES (?,?,?,?,?)').run(id(),r.id,actor.id,note,now());audit(actor,'Review '+(b.action||'note'),r.id,note);return row('reviews',r.id);
 }
 if(route==='match'){permit(actor,'collection');matchPayments();audit(actor,'Matching retried','payments',reason(b));return {matched:true};}
 if(route==='settlements'){
  permit(actor,'finance');return transaction(()=>{const m=row('merchants',b.merchant_id),amount=money(b.amount);if(m.status!=='active'||!m.destination)problem('Merchant needs active status and approved destination');if(balance('merchant:'+m.id+':available')<amount)problem('Insufficient available merchant balance');const sid=id();posting('settlement-reserve:'+sid,'reservation','Reserve merchant payout',[['merchant:'+m.id+':available',-amount],['merchant:'+m.id+':reserved',amount]]);db.prepare('INSERT INTO settlements(id,merchant_id,amount,destination,status,maker,reason,created,updated) VALUES (?,?,?,?,?,?,?,?,?)').run(sid,m.id,amount,m.destination,'reserved',actor.id,reason(b),now(),now());audit(actor,'Settlement reserved',sid,b.reason);return row('settlements',sid);});
 }
 m=route.match(/^settlements\/([^/]+)$/);if(m)return settlementAction(actor,m[1],b);
 if(route==='adjustments'){permit(actor,'finance');const mid=row('merchants',b.merchant_id).id,amount=money(b.amount),aid=id();db.prepare('INSERT INTO adjustments(id,merchant_id,amount,reason,evidence,maker,created) VALUES (?,?,?,?,?,?,?)').run(aid,mid,b.direction==='debit'?-amount:amount,reason(b),required(b.evidence,'Evidence',2000),actor.id,now());audit(actor,'Finance adjustment requested',aid,b.reason);return {id:aid};}
 m=route.match(/^adjustments\/([^/]+)\/approve$/);if(m){permit(actor,'finance');return transaction(()=>{const a=row('adjustments',m[1]);if(a.status!=='requested')problem('Adjustment already processed',409);if(a.maker===actor.id)problem('Another administrator must approve',403);if(a.amount<0&&balance('merchant:'+a.merchant_id+':available')<-a.amount)problem('Insufficient balance');posting('adjustment:'+a.id,'adjustment',a.reason,[['adjustment-control',-a.amount],['merchant:'+a.merchant_id+':available',a.amount]]);db.prepare("UPDATE adjustments SET status='approved',checker=? WHERE id=?").run(actor.id,a.id);audit(actor,'Finance adjustment approved',a.id,reason(b));return {approved:true};});}
 if(route==='reconciliation'){permit(actor,'finance');row('accounts',b.account_id);if(!/^\d{4}-\d{2}-\d{2}$/.test(b.day)||Number.isNaN(Date.parse(b.day)))problem('Valid reconciliation date required');const amount=b.statement_amount==='0'?0:money(b.statement_amount);const receipts=db.prepare('SELECT amount,created FROM receipts WHERE account_id=?').all(b.account_id).filter(r=>new Date(r.created).toLocaleDateString('en-CA',{timeZone:'Asia/Dhaka'})===b.day).reduce((s,r)=>s+r.amount,0);const rid=id();db.prepare('INSERT INTO reconciliation VALUES (?,?,?,?,?,?,?,?,?)').run(rid,b.account_id,b.day,amount,receipts,amount-receipts,required(b.note,'Evidence / note',2000),actor.id,now());audit(actor,'Reconciliation recorded',rid);return {id:rid,variance:amount-receipts};}
 if(route==='administrators'){permit(actor,'*');if(b.role&&b.role!=='admin')problem('Only the admin role is supported');if(db.prepare('SELECT id FROM merchants WHERE LOWER(email)=?').get(required(b.email,'Email').toLowerCase()))problem('This email already belongs to a merchant',409);if(!process.env.NEON_AUTH_BASE_URL)required(b.password,'Password',128);const pw=process.env.NEON_AUTH_BASE_URL?null:b.password;if(pw&&pw.length<12)problem('Use at least 12 password characters');const aid=id();db.prepare('INSERT INTO administrators(id,name,email,role,password_hash,created) VALUES (?,?,?,?,?,?)').run(aid,required(b.name,'Name'),required(b.email,'Email').toLowerCase(),'admin',pw?passwordHash(pw):null,now());audit(actor,'Administrator created',aid,reason(b));return {id:aid};}
 m=route.match(/^administrators\/([^/]+)$/);if(m){permit(actor,'*');const a=row('administrators',m[1]);if(a.id===actor.id)problem('Cannot suspend your own session');enumValue(b.status,['active','suspended'],'status');if(b.status==='suspended'&&db.prepare("SELECT COUNT(*) n FROM administrators WHERE status='active'").get().n<=1)problem('Keep an active administrator');db.prepare('UPDATE administrators SET status=? WHERE id=?').run(b.status,a.id);if(b.status==='suspended')db.prepare('DELETE FROM sessions WHERE admin_id=?').run(a.id);audit(actor,'Administrator status changed',a.id,reason(b));return {updated:true};}
 if(route==='settings'){
  permit(actor,'*');const s={...settings()};version(s,b);for(const [k,min,max]of [['expiry_minutes',5,1440],['review_days',1,90],['offline_minutes',5,1440],['raw_retention_days',7,3650],['fee_bps',0,10000],['fee_fixed',0,10000000]]){const n=Number(b[k]);if(!Number.isSafeInteger(n)||n<min||n>max)problem('Invalid '+k);s[k]=n;}s.organization=required(b.organization,'Organization',100);s.version++;db.prepare('UPDATE config SET value=? WHERE key=?').run(JSON.stringify(s),'settings');audit(actor,'Settings changed','settings',reason(b),s);return s;
 }
 if(route==='webhook-endpoints'){permit(actor,'merchant');row('merchants',b.merchant_id);let u;try{u=new URL(b.url);}catch{problem('Invalid webhook URL');}if(u.protocol!=='https:'||u.username||u.password)problem('Use a public HTTPS URL without credentials');const key=secret();db.prepare('INSERT INTO webhook_endpoints VALUES (?,?,?,1) ON CONFLICT(merchant_id) DO UPDATE SET url=excluded.url,secret=excluded.secret,enabled=1').run(b.merchant_id,u.toString(),key);audit(actor,'Webhook endpoint configured',b.merchant_id,reason(b));return {secret:key};}
 m=route.match(/^webhooks\/([^/]+)\/retry$/);if(m){permit(actor,'merchant');const w=row('webhook_events',m[1]);db.prepare("UPDATE webhook_events SET status='queued',next_attempt=?,last_error='' WHERE id=?").run(now(),w.id);audit(actor,'Webhook redelivery queued',w.id,reason(b));return {queued:true};}
 if(route==='export'){permit(actor,'export');audit(actor,'Ledger export generated','ledger',reason(b));return {rows:db.prepare('SELECT p.created,p.kind,p.source,e.account,e.amount FROM postings p JOIN entries e ON e.posting_id=p.id ORDER BY p.created DESC').all()};}
 problem('Not found',404);
}
export function enroll(b){
 return transaction(()=>{const p=db.prepare('SELECT * FROM pairings WHERE code_hash=? AND used=0 AND expires>?').get(hash(b.code),now());if(!p)problem('Pairing code expired or already used',401);const publicKey=verifyEnrollment(b),key=secret();db.prepare('UPDATE pairings SET used=1 WHERE id=?').run(p.id);db.prepare("UPDATE devices SET key_hash=?,status='pending',permission='granted',app_version=?,android_version=?,last_seen=?,version=version+1 WHERE id=?").run(hash(key),String(b.app_version||'simulator'),String(b.android_version||'simulator'),now(),p.device_id);db.prepare("UPDATE devices SET public_key=?,permission=?,proposed_subscription=NULL,approved_subscription=NULL,binding_health='unknown' WHERE id=?").run(publicKey,publicKey?'unknown':'granted',p.device_id);audit(null,'Device enrolled',p.device_id);return {device_id:p.device_id,key};});
}
export function heartbeat(token,b){const d=db.prepare('SELECT * FROM devices WHERE key_hash=? AND status!=\'revoked\'').get(hash(token));if(!d)problem('Invalid device credentials',401);const depth=Number(b.queue_depth||0);if(!Number.isSafeInteger(depth)||depth<0||depth>1000000)problem('Invalid queue count');enumValue(b.permission,['granted','denied'],'permission');db.prepare('UPDATE devices SET last_seen=?,queue_depth=?,permission=? WHERE id=?').run(now(),depth,b.permission,d.id);if(d.public_key){const sub=Number(b.subscription_id);if(!Number.isSafeInteger(sub)||sub<0)problem('Select a real active SIM subscription');const health=b.binding_health==='healthy'?'healthy':'missing';if(d.proposed_subscription!==null&&d.proposed_subscription!==sub){db.prepare("UPDATE devices SET status='paused',approved_subscription=NULL,version=version+1 WHERE id=?").run(d.id);db.prepare("UPDATE accounts SET status='paused',enabled=0,version=version+1 WHERE id=?").run(d.account_id);}db.prepare('UPDATE devices SET proposed_subscription=?,binding_health=?,capture_paused=? WHERE id=?').run(sub,health,b.capture_paused?1:0,d.id);}return {id:d.id,status:d.status,version:d.version};}
export function deviceConfig(token){const d=db.prepare("SELECT * FROM devices WHERE key_hash=? AND status!='revoked'").get(hash(token));if(!d)problem('Invalid device credentials',401);const a=row('accounts',d.account_id);const senders=db.prepare("SELECT DISTINCT sms_sender FROM templates WHERE provider=? AND type=? AND operation=? AND status='published' AND enabled=1").all(a.provider,a.type,a.operation).map(t=>t.sms_sender);return {device_id:d.id,status:d.status,version:d.version,account:{id:a.id,provider:a.provider,type:a.type,number:a.number,status:a.status,sim:d.sim},sms_senders:senders,approved_subscription:d.approved_subscription,proposed_subscription:d.proposed_subscription,binding_health:d.binding_health,max_message_length:4000};}
