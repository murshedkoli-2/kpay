import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {db,problem,required,audit,transaction,now} from './store.mjs';
import {createSession,createMerchantSession,authenticate} from './operations.mjs';
import {registrationFields,saveRegistration} from './merchant-registration.mjs';
import {applicationOrigin} from './auth-config.mjs';

export const neonAuthEnabled=!!process.env.NEON_AUTH_BASE_URL;
if(process.env.VERCEL&&!neonAuthEnabled)throw new Error('NEON_AUTH_BASE_URL is required on Vercel');
const base=process.env.NEON_AUTH_BASE_URL?.trim().replace(/\/$/,'');
const ownerEmail=process.env.NEON_OWNER_EMAIL?.trim().toLowerCase();
const origin=applicationOrigin();
function configuredURL(value,name){try{return new URL(value);}catch{throw new Error(name+' must be a valid absolute URL');}}
if(neonAuthEnabled){
 if(configuredURL(base,'NEON_AUTH_BASE_URL').protocol!=='https:'&&!process.env.KPAY_AUTH_TEST)throw new Error('NEON_AUTH_BASE_URL requires HTTPS');
 if(!/^[a-f\d]{64}$/i.test(process.env.AUTH_ENCRYPTION_KEY||''))throw new Error('AUTH_ENCRYPTION_KEY must be a random 32-byte hex key');
 if((process.env.NODE_ENV==='production'||process.env.VERCEL)&&configuredURL(origin,'APP_ORIGIN').protocol!=='https:')throw new Error('APP_ORIGIN requires HTTPS in production');
}
function seal(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.AUTH_ENCRYPTION_KEY,'hex'),iv);const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');}
function unseal(value){const data=Buffer.from(value,'base64'),cipher=createDecipheriv('aes-256-gcm',Buffer.from(process.env.AUTH_ENCRYPTION_KEY,'hex'),data.subarray(0,12));cipher.setAuthTag(data.subarray(12,28));return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]).toString('utf8');}
async function upstream(path,{body,cookie,reset=false,otp=false}={}){
 let response;
 try{response=await fetch(base+'/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)});}catch{problem('Neon Auth is temporarily unavailable. Please try again.',503);}
 let data;try{data=await response.json();}catch{problem('Neon Auth returned an invalid response',502);}
 if(!response.ok){
  if(data?.code==='INVALID_ORIGIN'||data?.code==='INVALID_CALLBACK_URL')problem('Add '+origin+' to trusted domains in your Neon Auth settings.',503);
  if(data?.code==='EMAIL_NOT_VERIFIED')problem('Verify your email with Neon Auth before signing in.',403);
  if(otp&&response.status===429)problem('Too many code attempts. Please try again later.',429);
  if(otp&&response.status<500)problem('The verification code is invalid or expired. Request a new code.',400);
  if(reset&&response.status===429)problem('Too many reset attempts. Please try again later.',429);
  if(reset&&response.status<500)problem('This reset link is invalid or expired. Request a new link.',400);
  problem(response.status>=500?'Neon Auth is temporarily unavailable.':'Invalid credentials or unverified email',response.status>=500?503:401);
 }
 return {data,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
}
export async function neonForgotPassword(b){
 if(!neonAuthEnabled)problem('Password recovery requires Neon Auth. Contact your administrator.',503);
 const email=required(b.email,'Email',254).toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))problem('Enter a valid email address');
 if(b.method==='otp'){
  await upstream('email-otp/send-verification-otp',{body:{email,type:'forget-password'},otp:true});
  return {verification:'otp',message:'If an account exists for this email, a reset code will be sent. Check your inbox and spam folder.'};
 }
 await upstream('request-password-reset',{body:{email,redirectTo:new URL('/?reset-password=1',origin).href}});
 return {message:'If an account exists for this email, a password reset link will be sent. Check your inbox and spam folder.'};
}
export async function neonResetPassword(b){
 if(!neonAuthEnabled)problem('Password recovery requires Neon Auth. Contact your administrator.',503);
 const token=b.method==='otp'?null:required(b.token,'Reset token',1024);
 required(b.password,'Password',128);
 if(b.password.length<12)problem('Use at least 12 password characters');
 if(b.method==='otp')await upstream('email-otp/reset-password',{body:{email:otpEmail(b.email),otp:otpCode(b.otp),password:b.password},otp:true});
 else await upstream('reset-password',{body:{token,newPassword:b.password},reset:true});
 return {message:'Your password has been reset. Sign in with your new password.'};
}
function otpEmail(value){const email=required(value,'Email',254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))problem('Enter a valid email address');return email;}
function otpCode(value){const code=required(value,'Verification code',6);if(!/^\d{6}$/.test(code))problem('Enter the six-digit code from your email');return code;}
export async function neonSendVerification(b){
 if(!neonAuthEnabled)problem('Email verification requires Neon Auth.',503);
 await upstream('email-otp/send-verification-otp',{body:{email:otpEmail(b.email),type:'email-verification'},otp:true});
 return {message:'If your account needs verification, a code will be sent. Check your inbox and spam folder.'};
}
export async function neonVerifyEmail(b){
 if(!neonAuthEnabled)problem('Email verification requires Neon Auth.',503);
 const result=await upstream('email-otp/verify-email',{body:{email:otpEmail(b.email),otp:otpCode(b.otp)},otp:true});
 // Verification must never bypass local merchant approval or create workspace access.
 if(result.cookie)try{await upstream('sign-out',{body:{},cookie:result.cookie});}catch{}
 return {message:'Email verified. Merchants need administrator approval before signing in.'};
}
async function identity(cookie){const {data}=await upstream('get-session',{cookie});if(!data?.user?.id||!data?.session||new Date(data.session.expiresAt).getTime()<=Date.now())problem('Your Neon session expired. Please sign in.',401);if(data.user.emailVerified!==true)problem('Verify your email with Neon Auth before signing in.',403);return data.user;}
export async function neonLogin(b){
 required(b.email,'Email');required(b.password,'Password',200);
 const result=await upstream('sign-in/email',{body:{email:b.email.trim().toLowerCase(),password:b.password,rememberMe:false}});
 if(!result.cookie)problem('Neon Auth did not return a session',502);
 const user=await identity(result.cookie),email=user.email?.toLowerCase();
 return transaction(()=>{
  const matchingAdmin=db.prepare('SELECT id FROM administrators WHERE neon_user_id=? OR LOWER(email)=?').get(user.id,email);
  const matchingMerchant=db.prepare('SELECT id FROM merchants WHERE neon_user_id=? OR LOWER(email)=?').get(user.id,email);
  if(matchingAdmin&&matchingMerchant)problem('Account email conflict. Contact an administrator.',403);
  if(!matchingAdmin&&email!==ownerEmail){
   let merchant=db.prepare('SELECT * FROM merchants WHERE neon_user_id=?').get(user.id);
   if(!merchant){merchant=db.prepare('SELECT * FROM merchants WHERE email=?').get(email);if(!merchant||merchant.neon_user_id||merchant.registration_source!=='self')problem('No registered merchant account matches this identity',403);if(merchant.status!=='active')problem('Your merchant account is awaiting approval or suspended',403);db.prepare('UPDATE merchants SET neon_user_id=? WHERE id=?').run(user.id,merchant.id);}
   if(merchant.status!=='active')problem('Your merchant account is awaiting approval or suspended',403);
   const session=createMerchantSession(merchant);db.prepare('UPDATE sessions SET neon_cookie=? WHERE hash=?').run(seal(result.cookie),session.token_hash);delete session.token_hash;return session;
  }
  let admin=db.prepare('SELECT * FROM administrators WHERE neon_user_id=?').get(user.id);
  if(!admin){
   admin=db.prepare('SELECT * FROM administrators WHERE email=?').get(email);
   if(!admin&&ownerEmail&&email===ownerEmail){admin=db.prepare("SELECT * FROM administrators WHERE id='owner'").get();if(!admin.neon_user_id){db.prepare('UPDATE administrators SET email=?,name=? WHERE id=?').run(email,user.name||'Workspace owner',admin.id);admin.email=email;}}
   if(!admin||admin.neon_user_id||admin.status!=='active')problem('An active workspace administrator invitation is required.',403);
   db.prepare('UPDATE administrators SET neon_user_id=? WHERE id=?').run(user.id,admin.id);
   audit(admin,'Neon identity linked',admin.id);
  }
  if(admin.status!=='active')problem('Workspace access is suspended.',403);
  const session=createSession(admin);
  db.prepare('UPDATE sessions SET neon_cookie=? WHERE hash=?').run(seal(result.cookie),session.token_hash);
  delete session.token_hash;return session;
 });
}
export async function neonRegister(b){
 if(b.role==='merchant'){const fields=registrationFields(b);await upstream('sign-up/email',{body:{...fields,callbackURL:origin}});return {...saveRegistration(fields,{neon:true}),verification:'otp',email:fields.email};}
 const email=required(b.email,'Email').toLowerCase();required(b.password,'Password',128);const password=b.password;
 if(password.length<12)problem('Use at least 12 password characters');
 const admin=db.prepare("SELECT id FROM administrators WHERE email=? AND status='active'").get(email);
 if(!admin&&email!==ownerEmail)problem('An active workspace administrator invitation is required.',403);
 await upstream('sign-up/email',{body:{email,password,name:typeof b.name==='string'&&b.name.trim()?b.name.trim():email.split('@')[0],callbackURL:origin}});
 return {verification:'otp',email,message:'Account created. Verify your email, then sign in to the workspace.'};
}
export async function neonAuthenticate(token){
 const actor=authenticate(token);if(!actor||!actor.token_hash)return actor;
 const session=db.prepare('SELECT neon_cookie FROM sessions WHERE hash=?').get(actor.token_hash);
 if(!session?.neon_cookie)return null;
 const user=await identity(unseal(session.neon_cookie));
 return user.id===actor.neon_user_id?actor:null;
}
export async function neonLogout(token){
 const actor=authenticate(token);if(!actor||!actor.token_hash)return;
 const row=db.prepare('SELECT neon_cookie FROM sessions WHERE hash=?').get(actor.token_hash);
 // Local revocation must succeed even if Neon is unavailable.
 db.prepare('DELETE FROM sessions WHERE hash=?').run(actor.token_hash);audit(actor,'Signed out','session');
 if(row?.neon_cookie)try{await upstream('sign-out',{body:{},cookie:unseal(row.neon_cookie)});}catch{}
}
export function assertBrowserOrigin(req){
 if(req.headers.origin&&req.headers.origin!==origin)problem('Request origin is not allowed',403);
 if(req.headers['sec-fetch-site']==='cross-site')problem('Cross-site request is not allowed',403);
}
export function sessionCookie(token,clear=false){return `kpay_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear?0:1800}${new URL(origin).protocol==='https:'?'; Secure':''}`;}
export function cookieToken(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('kpay_session='))?.slice(13)||'';}
