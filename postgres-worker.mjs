import {workerData} from 'node:worker_threads';
import {postgresSQL} from './database.mjs';

const {port,pglite,connectionString}=workerData;
let client,initialError;
try{
 if(pglite){const {PGlite}=await import('@electric-sql/pglite');client=new PGlite(connectionString);await client.waitReady;}
 else {
  const {default:pg}=await import('pg');
  const url=new URL(connectionString);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('DATABASE_URL must be a PostgreSQL URL');
  // Verify the server certificate even when the console URL specifies sslmode=require.
  for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
  client=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000,query_timeout:30000,statement_timeout:30000});
  client.on('error',()=>{initialError=new Error('PostgreSQL connection lost; restart the server');});
  await client.connect();
 }
}catch{initialError=new Error('Unable to connect to PostgreSQL. Check DATABASE_URL, network access and TLS configuration.');}
port.on('message',async({sql,params,mode,signal})=>{
 let response;
 try{
  if(initialError)throw initialError;
  if(mode==='close'){await (pglite?client.close():client.end());response={result:null};}
  else {
   const translated=postgresSQL(sql);const values=translated.params||params;
   let result;
   if(mode==='exec'){
    if(pglite)result=await client.exec(translated.sql);
    else result=await client.query(translated.sql);
    // Coordinate financial transactions across application instances.
    if(sql==='BEGIN IMMEDIATE'&&!pglite)await client.query('SELECT pg_advisory_xact_lock(18020701)');
   }else result=await client.query(translated.sql,values);
   if(Array.isArray(result))result=result.at(-1);
   const rows=(result?.rows||[]).map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,typeof v==='bigint'?Number(v):v])));
   // pg returns COUNT/SUM(bigint) as strings; keep application money arithmetic numeric.
   if(!pglite&&result?.fields)for(const row of rows)for(const field of result.fields)if([20,1700].includes(field.dataTypeID)&&row[field.name]!==null){const n=Number(row[field.name]);if(!Number.isSafeInteger(n))throw new Error('Database number exceeds safe integer range');row[field.name]=n;}
   response={result:mode==='get'?rows[0]:mode==='run'?{changes:result?.rowCount??result?.affectedRows??0}:rows};
  }
 }catch(e){response={error:{message:e.code==='23505'?'UNIQUE constraint violation':e.message,code:e.code}};}
 port.postMessage(response);Atomics.store(signal,0,1);Atomics.notify(signal,0);
});
