import {createPublicKey,verify} from 'node:crypto';
import {db,hash,problem} from './store.mjs';

export function verifyEnrollment(b) {
 if(!b.public_key)return null;
 try {
  const key=createPublicKey({key:Buffer.from(b.public_key,'base64'),format:'der',type:'spki'});
  if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails.namedCurve!=='prime256v1')throw Error();
  if(!verify('sha256',Buffer.from('kpay-enroll\n'+b.code+'\n'+b.public_key),key,Buffer.from(b.proof||'','base64')))throw Error();
  return b.public_key;
 }catch{problem('Invalid device key proof',401);}
}
export function authenticateAgent(token,headers,method,path,raw='') {
 const d=db.prepare("SELECT * FROM devices WHERE key_hash=? AND status!='revoked'").get(hash(token));
 if(!d)problem('Invalid device credentials',401);
 if(!d.public_key)return d; // Existing local simulator compatibility.
 const timestamp=String(headers['x-kpay-time']||''),nonce=String(headers['x-kpay-nonce']||'');
 if(!/^\d{13}$/.test(timestamp)||Math.abs(Date.now()-Number(timestamp))>300000||! /^[a-f0-9-]{36}$/.test(nonce))problem('Invalid request time or nonce',401);
 const canonical=[method,path,timestamp,nonce,hash(raw)].join('\n');
 let valid=false;try{valid=verify('sha256',Buffer.from(canonical),createPublicKey({key:Buffer.from(d.public_key,'base64'),format:'der',type:'spki'}),Buffer.from(headers['x-kpay-signature']||'','base64'));}catch{}
 if(!valid)problem('Invalid device signature',401);
 db.prepare('DELETE FROM device_nonces WHERE created<?').run(Date.now()-600000);
 if(db.prepare('SELECT 1 FROM device_nonces WHERE device_id=? AND nonce=?').get(d.id,nonce))problem('Request replay rejected',409);
 db.prepare('INSERT INTO device_nonces VALUES (?,?,?)').run(d.id,nonce,Date.now());return d;
}
