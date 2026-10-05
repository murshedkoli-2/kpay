import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {db,transaction} from './store.mjs';
import './operations.mjs';

if(!process.env.DATABASE_URL)throw new Error('Set DATABASE_URL before importing SQLite data');
if(!process.argv[2])throw new Error('Usage: node --env-file=.env migrate-sqlite.mjs PATH_TO_SQLITE');
const source=new DatabaseSync(resolve(process.argv[2]),{readOnly:true});
try{
 const tables=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid").all().map(x=>x.name).filter(x=>x!=='sessions');
 if(tables.some(x=>!/^\w+$/.test(x)))throw new Error('Unsupported SQLite table name');
 const targetTables=db.prepare("SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema()").all().map(x=>x.table_name);
 if(tables.some(x=>!targetTables.includes(x)))throw new Error('SQLite contains unsupported tables');
 let count=0;
 transaction(()=>{
  // Only allow importing into a freshly initialized workspace; never overwrite live operations.
  for(const table of targetTables){
   if(['config','administrators','merchants','merchant_keys'].includes(table))continue;
   if(db.prepare(`SELECT COUNT(*) n FROM "${table}"`).get().n)throw new Error('Target is not empty: '+table);
  }
  if(db.prepare("SELECT COUNT(*) n FROM administrators WHERE id!='owner'").get().n||db.prepare("SELECT COUNT(*) n FROM merchants WHERE id!='demo_merchant'").get().n||db.prepare("SELECT COUNT(*) n FROM merchant_keys WHERE id!='legacy-demo'").get().n||db.prepare('SELECT COUNT(*) n FROM administrators WHERE neon_user_id IS NOT NULL').get().n)throw new Error('Target already has workspace identities');
  db.exec('DELETE FROM merchant_keys; DELETE FROM merchants; DELETE FROM administrators; DELETE FROM config;');
  for(const table of tables){
   const rows=source.prepare(`SELECT * FROM "${table}"`).all();
   for(const row of rows){const columns=Object.keys(row);if(columns.some(x=>!/^\w+$/.test(x)))throw new Error('Unsupported column name');db.prepare(`INSERT INTO "${table}" (${columns.map(x=>'"'+x+'"').join(',')}) VALUES (${columns.map(()=>'?').join(',')})`).run(...Object.values(row));count++;}
  }
 });
 console.log(`Imported ${count} records. Sessions were excluded; sign in with Neon Auth.`);
}finally{source.close();db.close();}
