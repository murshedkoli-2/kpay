let initialization;

export default async function handler(req,res){
 let application;
 try{
  initialization ||= import('../server.mjs');
  application=await initialization;
 }catch(error){
  initialization=undefined;
  console.error('kPay server initialization failed:',error);
  const configurationErrors=[
   'DATABASE_URL is required on Vercel; SQLite is local development only',
   'NEON_AUTH_BASE_URL is required on Vercel',
   'NEON_AUTH_BASE_URL requires HTTPS',
   'AUTH_ENCRYPTION_KEY must be a random 32-byte hex key',
   'APP_ORIGIN requires HTTPS in production'
  ];
  res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({error:configurationErrors.includes(error.message)?error.message:'Server initialization failed. Check the Vercel runtime logs.',code:'SERVER_INITIALIZATION_FAILED'}));
  return;
 }
 return application.default(req,res);
}
