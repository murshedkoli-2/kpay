export function applicationOrigin(env=process.env){
 const value=env.APP_ORIGIN?.trim();
 if(value){
  try{
   const url=new URL(value);
   if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash&&(!env.VERCEL||url.protocol==='https:'))return url.origin;
  }catch{}
 }
 // Use only the deployment platform's configured domain, never request headers.
 const domain=env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
 if(env.VERCEL&&domain&&/^[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,}$/i.test(domain))return new URL('https://'+domain).origin;
 if(value)throw new Error('APP_ORIGIN must be a valid absolute URL');
 return 'http://127.0.0.1:3000';
}
