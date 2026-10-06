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
   'APP_ORIGIN requires HTTPS in production',
   'APP_ORIGIN must be a valid absolute URL',
   'NEON_AUTH_BASE_URL must be a valid absolute URL'
  ];
  res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
  const diagnosticCodes=['ERR_MODULE_NOT_FOUND','MODULE_NOT_FOUND','ERR_UNKNOWN_BUILTIN_MODULE','ERR_INVALID_URL','ERR_WORKER_INIT_FAILED'];
  const diagnostic=diagnosticCodes.includes(error.code)?error.code:'INITIALIZATION_ERROR';
  const packageName=error.message?.match(/Cannot find package '([@a-zA-Z0-9_./-]+)'/)?.[1];
  const dependency=packageName&&packageName.length<100?packageName:undefined;
  res.end(JSON.stringify({error:configurationErrors.includes(error.message)?error.message:'Server initialization failed. Check the Vercel runtime logs.',code:'SERVER_INITIALIZATION_FAILED',diagnostic,...(dependency?{dependency}:{})}));
  return;
 }
 return application.default(req,res);
}
