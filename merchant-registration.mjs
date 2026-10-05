import {db,id,now,required,problem,passwordHash,audit,transaction} from './store.mjs';
export function registrationFields(b){
 const email=required(b.email,'Email').toLowerCase(),name=required(b.name,'Business name',100),password=required(b.password,'Password',128);
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))problem('Enter a valid email address');
 if(password.length<12)problem('Use at least 12 password characters');
 if(db.prepare('SELECT id FROM merchants WHERE email=?').get(email)||db.prepare('SELECT id FROM administrators WHERE email=?').get(email)||email===process.env.NEON_OWNER_EMAIL?.toLowerCase())problem('This email already belongs to an account',409);
 return {email,name,password};
}
export function saveRegistration(fields,{neon=false}={}){
 return transaction(()=>{const mid=id();db.prepare("INSERT INTO merchants(id,name,email,status,providers,destination,registration_source,password_hash,created) VALUES (?,?,?,'pending','[]','','self',?,?)").run(mid,fields.name,fields.email,neon?null:passwordHash(fields.password),now());audit(null,'Merchant registered',mid);return {message:neon?'Registration received. Verify your email; an administrator must approve your business before you can sign in.':'Registration received. An administrator must approve your business before you can sign in.'};});
}
