import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {Worker,MessageChannel,receiveMessageOnPort} from 'node:worker_threads';

// Keep the existing synchronous business transactions on one PostgreSQL connection.
// Network I/O lives in a worker; never emulate a transaction with separate HTTP queries.
export class PostgresDatabase {
 constructor(connectionString,{pglite=false}={}){
  const {port1,port2}=new MessageChannel();this.port=port1;
  this.worker=new Worker(new URL('./postgres-worker.mjs',import.meta.url),{execArgv:[],workerData:{connectionString,pglite,port:port2},transferList:[port2]});
  this.worker.unref();this.port.unref();this.closed=false;
 }
 query(sql,params=[],mode='all'){
  if(this.closed)throw new Error('Database connection is closed');
  const signal=new Int32Array(new SharedArrayBuffer(4));
  this.port.postMessage({sql,params,mode,signal});
  if(Atomics.wait(signal,0,0,45000)==='timed-out'){
   this.closed=true;this.worker.terminate();throw new Error('Database request timed out; restart the server before retrying');
  }
  const message=receiveMessageOnPort(this.port)?.message;
  if(!message)throw new Error('Database worker returned no response');
  if(message.error){const e=new Error(message.error.message);e.code=message.error.code;throw e;}
  return message.result;
 }
 exec(sql){this.query(sql,[],'exec');}
 prepare(sql){return {all:(...args)=>this.query(sql,args),get:(...args)=>this.query(sql,args,'get'),run:(...args)=>this.query(sql,args,'run')};}
 close(){if(!this.closed){try{this.query('',[],'close');}finally{this.closed=true;this.port.close();this.worker.terminate();}}}
}

export function postgresSQL(sql){
 if(/^PRAGMA table_info\((\w+)\)$/i.test(sql))return {sql:'SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1',params:[sql.match(/\((\w+)\)/)[1]]};
 sql=sql.replace(/PRAGMA[^;]+;/g,'').replace(/BEGIN IMMEDIATE/g,'BEGIN');
 const ignore=/^INSERT OR IGNORE/i.test(sql);
 sql=sql.replace(/^INSERT OR IGNORE/i,'INSERT');
 if(ignore)sql=sql.replace(/;?\s*$/,' ON CONFLICT DO NOTHING');
 // Replace placeholders only outside SQL strings (including escaped single quotes).
 let index=0;sql=sql.replace(/'(?:''|[^'])*'|\?/g,value=>value==='?'?'$'+(++index):value);
 return {sql};
}

export const databaseKind=process.env.DATABASE_URL?'postgres':'sqlite';
export function openDatabase(){
 if(process.env.DATABASE_URL)return new PostgresDatabase(process.env.DATABASE_URL);
 if(process.env.KPAY_PGLITE_TEST)return new PostgresDatabase(process.env.KPAY_PGLITE_TEST,{pglite:true});
 mkdirSync('data',{recursive:true});return new DatabaseSync(process.env.KPAY_DB||'data/kpay.sqlite');
}
