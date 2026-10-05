import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const {db}=await import('./store.mjs');
try{
 const email=process.env.NEON_OWNER_EMAIL?.trim().toLowerCase();if(!email)throw new Error('Set NEON_OWNER_EMAIL first');
 const existing=db.prepare('SELECT id,"emailVerified" FROM neon_auth."user" WHERE email=?').get(email);
 if(existing){console.log('Owner already has a Neon Auth account. Its password is unchanged. Email verified: '+existing.emailVerified);}
 else{
  mkdirSync('data',{recursive:true});const path='data/admin-credentials.json';
  const credential=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{email,password:randomBytes(24).toString('base64url'),created:new Date().toISOString(),status:'prepared'};
  if(credential.email!==email)throw new Error('Existing credential file belongs to a different email');
  writeFileSync(path,JSON.stringify(credential,null,2)+'\n',{mode:0o600});
  const {neonRegister}=await import('./neon-auth.mjs');await neonRegister({email,password:credential.password,name:'Workspace owner',role:'admin'});
  credential.status='created-awaiting-email-verification';writeFileSync(path,JSON.stringify(credential,null,2)+'\n',{mode:0o600});
  console.log('Owner account created. Credentials saved in '+path+'. Complete the verification email before signing in.');
 }
}finally{db.close();}
