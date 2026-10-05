import {openDatabase} from './database.mjs';
import {randomUUID,randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';

export const db=openDatabase();
export const now=()=>new Date().toISOString();
export const id=()=>randomUUID();
export const secret=()=>randomBytes(32).toString('hex');
export const hash=v=>createHash('sha256').update(String(v)).digest('hex');
export const equal=(a,b)=>{const x=Buffer.from(String(a??'')),y=Buffer.from(String(b??''));return x.length===y.length&&timingSafeEqual(x,y);};
export function passwordHash(value){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(value,salt,64).toString('hex');}
export function passwordValid(value,stored){const [salt,result]=(stored||'').split(':');return !!salt&&equal(scryptSync(String(value),salt,64).toString('hex'),result);}
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,provider TEXT,type TEXT,number TEXT,device_key TEXT,enabled INTEGER DEFAULT 1,UNIQUE(provider,number));
CREATE TABLE IF NOT EXISTS templates(id TEXT PRIMARY KEY,name TEXT,provider TEXT,type TEXT,sms_sender TEXT,pattern TEXT,sample TEXT,enabled INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,merchant TEXT,account_id TEXT REFERENCES accounts(id),amount INTEGER,sender TEXT,trx TEXT,status TEXT DEFAULT 'pending',created TEXT,order_id TEXT,UNIQUE(merchant,order_id));
CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,account_id TEXT REFERENCES accounts(id),provider TEXT,trx TEXT,sender TEXT,amount INTEGER,payment_id TEXT UNIQUE REFERENCES payments(id),created TEXT,UNIQUE(provider,trx));
CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,payment_id TEXT UNIQUE REFERENCES payments(id),merchant TEXT,amount INTEGER,created TEXT);
CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,event TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS administrators(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,role TEXT,status TEXT DEFAULT 'active',password_hash TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,admin_id TEXT REFERENCES administrators(id),expires TEXT);
CREATE TABLE IF NOT EXISTS merchants(id TEXT PRIMARY KEY,name TEXT,email TEXT,status TEXT DEFAULT 'active',providers TEXT DEFAULT '["bkash","nagad","rocket"]',destination TEXT DEFAULT '',version INTEGER DEFAULT 1,created TEXT);
CREATE TABLE IF NOT EXISTS merchant_keys(id TEXT PRIMARY KEY,merchant_id TEXT REFERENCES merchants(id),hash TEXT UNIQUE,prefix TEXT,status TEXT DEFAULT 'active',created TEXT);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT,number TEXT UNIQUE,status TEXT DEFAULT 'active',created TEXT);
CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,name TEXT,account_id TEXT UNIQUE REFERENCES accounts(id),status TEXT DEFAULT 'pending',key_hash TEXT,sim TEXT,app_version TEXT DEFAULT '',android_version TEXT DEFAULT '',last_seen TEXT,queue_depth INTEGER DEFAULT 0,permission TEXT DEFAULT 'unknown',version INTEGER DEFAULT 1,created TEXT);
CREATE TABLE IF NOT EXISTS pairings(id TEXT PRIMARY KEY,code_hash TEXT UNIQUE,device_id TEXT REFERENCES devices(id),expires TEXT,used INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS sms_events(id TEXT PRIMARY KEY,device_id TEXT REFERENCES devices(id),client_event_id TEXT,account_id TEXT REFERENCES accounts(id),sms_sender TEXT,message TEXT,status TEXT,reason TEXT DEFAULT '',template_id TEXT,receipt_id TEXT,created TEXT,UNIQUE(device_id,client_event_id));
CREATE TABLE IF NOT EXISTS template_fixtures(id TEXT PRIMARY KEY,template_id TEXT REFERENCES templates(id),message TEXT,expected TEXT);
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,entity_type TEXT,entity_id TEXT,category TEXT,status TEXT DEFAULT 'open',assignee TEXT DEFAULT '',created TEXT,UNIQUE(entity_type,entity_id,category));
CREATE TABLE IF NOT EXISTS review_notes(id TEXT PRIMARY KEY,review_id TEXT REFERENCES reviews(id),actor TEXT,note TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS postings(id TEXT PRIMARY KEY,source TEXT UNIQUE,kind TEXT,description TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,posting_id TEXT REFERENCES postings(id),account TEXT,amount INTEGER);
CREATE TABLE IF NOT EXISTS settlements(id TEXT PRIMARY KEY,merchant_id TEXT REFERENCES merchants(id),amount INTEGER,destination TEXT,status TEXT,maker TEXT,checker TEXT,external_trx TEXT UNIQUE,evidence TEXT DEFAULT '',reason TEXT DEFAULT '',version INTEGER DEFAULT 1,created TEXT,updated TEXT);
CREATE TABLE IF NOT EXISTS webhook_endpoints(merchant_id TEXT PRIMARY KEY REFERENCES merchants(id),url TEXT,secret TEXT,enabled INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS webhook_events(id TEXT PRIMARY KEY,merchant_id TEXT REFERENCES merchants(id),payment_id TEXT,event TEXT,payload TEXT,status TEXT DEFAULT 'queued',attempts INTEGER DEFAULT 0,last_status INTEGER,last_error TEXT DEFAULT '',next_attempt TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS webhook_attempts(id TEXT PRIMARY KEY,event_id TEXT REFERENCES webhook_events(id),status INTEGER,error TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS reconciliation(id TEXT PRIMARY KEY,account_id TEXT REFERENCES accounts(id),day TEXT,statement_amount INTEGER,receipt_amount INTEGER,variance INTEGER,note TEXT,actor TEXT,created TEXT);
`);
function columns(table,defs){const present=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name));for(const [name,type]of Object.entries(defs))if(!present.has(name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);}
columns('accounts',{label:"TEXT DEFAULT ''",status:"TEXT DEFAULT 'paused'",operation:"TEXT DEFAULT 'incoming_transfer'",instructions:"TEXT DEFAULT ''",minimum:'INTEGER DEFAULT 100',maximum:'INTEGER DEFAULT 100000000',daily_limit:'INTEGER DEFAULT 100000000',version:'INTEGER DEFAULT 1',created:'TEXT'});
columns('templates',{status:"TEXT DEFAULT 'draft'",operation:"TEXT DEFAULT 'incoming_transfer'",version:'INTEGER DEFAULT 1',family:'TEXT',created:'TEXT'});
columns('payments',{beneficiary_type:"TEXT DEFAULT 'merchant'",beneficiary_id:'TEXT',expires:'TEXT',fee:'INTEGER DEFAULT 0',version:'INTEGER DEFAULT 1'});
columns('receipts',{status:"TEXT DEFAULT 'unmatched'",event_id:'TEXT'});
columns('audit',{actor:"TEXT DEFAULT 'system'",role:"TEXT DEFAULT 'system'",entity:"TEXT DEFAULT ''",reason:"TEXT DEFAULT ''",changes:"TEXT DEFAULT '{}'"});
columns('administrators',{mfa_secret:'TEXT',mfa_pending:'TEXT',mfa_enabled:'INTEGER DEFAULT 0',last_totp_step:'INTEGER DEFAULT -1',neon_user_id:'TEXT'});
columns('sessions',{step_up_until:'TEXT',neon_cookie:'TEXT'});
columns('devices',{public_key:'TEXT',proposed_subscription:'INTEGER',approved_subscription:'INTEGER',binding_health:"TEXT DEFAULT 'unknown'",capture_paused:'INTEGER DEFAULT 0'});
db.exec('CREATE TABLE IF NOT EXISTS device_nonces(device_id TEXT,nonce TEXT,created BIGINT,PRIMARY KEY(device_id,nonce));');
if(process.env.DATABASE_URL)db.exec('ALTER TABLE device_nonces ALTER COLUMN created TYPE BIGINT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS administrator_neon_identity ON administrators(neon_user_id);');
db.exec('CREATE INDEX IF NOT EXISTS payments_match ON payments(account_id,trx,sender,amount,status); CREATE INDEX IF NOT EXISTS audit_time ON audit(created); CREATE INDEX IF NOT EXISTS sms_created ON sms_events(created);');
for(const key of ['admin','merchant'])if(!db.prepare('SELECT value FROM config WHERE key=?').get(key))db.prepare('INSERT INTO config VALUES (?,?)').run(key,secret());
export const keyFor=k=>db.prepare('SELECT value FROM config WHERE key=?').get(k)?.value;
export const defaults={version:1,expiry_minutes:30,review_days:7,offline_minutes:30,raw_retention_days:90,fee_bps:0,fee_fixed:0,organization:'kPay',timezone:'Asia/Dhaka'};
if(!keyFor('settings'))db.prepare('INSERT INTO config VALUES (?,?)').run('settings',JSON.stringify(defaults));
export const settings=()=>({...defaults,...JSON.parse(keyFor('settings'))});
db.prepare("INSERT OR IGNORE INTO administrators(id,name,email,role,created) VALUES ('owner','Workspace owner','owner@kpay.local','owner',?)").run(now());
db.prepare("INSERT OR IGNORE INTO merchants(id,name,email,created) VALUES ('demo_merchant','Demo merchant','demo@kpay.local',?)").run(now());
db.prepare('INSERT OR IGNORE INTO merchant_keys(id,merchant_id,hash,prefix,created) VALUES (?,?,?,?,?)').run('legacy-demo','demo_merchant',hash(keyFor('merchant')),keyFor('merchant').slice(0,8),now());
db.exec("UPDATE payments SET beneficiary_id=merchant WHERE beneficiary_id IS NULL; UPDATE templates SET family=id WHERE family IS NULL;");
export function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
export function audit(actor,event,entity='',reason='',changes={}){db.prepare('INSERT INTO audit(id,event,created,actor,role,entity,reason,changes) VALUES (?,?,?,?,?,?,?,?)').run(id(),event,now(),actor?.id||'system',actor?.role||'system',entity,reason,JSON.stringify(changes));}
export function problem(message,status=422){const e=new Error(message);e.status=status;throw e;}
export function required(value,name,max=200){if(typeof value!=='string'||!value.trim()||value.length>max)problem(`${name} is required (maximum ${max} characters)`);return value.trim();}
export function version(row,b){if(Number(b.version)!==row.version)problem('This record changed. Refresh before saving.',409);}
export function posting(source,kind,description,lines){if(lines.reduce((s,l)=>s+l[1],0)!==0||lines.some(l=>!Number.isSafeInteger(l[1])))problem('Unbalanced ledger posting',500);const existing=db.prepare('SELECT id FROM postings WHERE source=?').get(source);if(existing)return existing.id;const pid=id();db.prepare('INSERT INTO postings VALUES (?,?,?,?,?)').run(pid,source,kind,description,now());for(const [account,amount]of lines)db.prepare('INSERT INTO entries VALUES (?,?,?,?)').run(id(),pid,account,amount);return pid;}
export const balance=account=>db.prepare('SELECT COALESCE(SUM(amount),0) amount FROM entries WHERE account=?').get(account).amount;
// Reconstruct balanced postings for old prototype credits, without changing the old history.
transaction(()=>{for(const l of db.prepare('SELECT * FROM ledger').all())posting('payment:'+l.payment_id,'payment','Imported verified prototype payment',[['collection',-l.amount],['merchant:'+l.merchant+':available',l.amount]]);});
