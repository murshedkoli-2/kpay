import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PostgresDatabase,postgresSQL} from './database.mjs';

test('PostgreSQL adapter preserves transactions, constraints, placeholders and integer sums',()=>{
 const db=new PostgresDatabase('memory://',{pglite:true});
 try{
  db.exec('CREATE TABLE balances(id TEXT PRIMARY KEY,amount INTEGER);');
  db.prepare('INSERT OR IGNORE INTO balances VALUES (?,?)').run('a',100);
  assert.equal(db.prepare('INSERT OR IGNORE INTO balances VALUES (?,?)').run('a',999).changes,0);
  assert.throws(()=>db.prepare('INSERT INTO balances VALUES (?,?)').run('a',100),/UNIQUE/);
  db.exec('BEGIN IMMEDIATE');db.prepare('UPDATE balances SET amount=? WHERE id=?').run(25,'a');db.exec('ROLLBACK');
  assert.equal(db.prepare('SELECT amount FROM balances').get().amount,100);
  db.exec('BEGIN IMMEDIATE');db.prepare('UPDATE balances SET amount=? WHERE id=?').run(30,'a');db.exec('COMMIT');
  assert.equal(db.prepare('SELECT SUM(amount) amount FROM balances').get().amount,30);
  assert.equal(db.prepare("SELECT '?' literal,amount FROM balances WHERE id=?").get('a').literal,'?');
  assert(db.prepare('PRAGMA table_info(balances)').all().some(c=>c.name==='amount'));
  db.exec('CREATE TABLE nonces(created BIGINT)');db.prepare('INSERT INTO nonces VALUES (?)').run(Date.now());
  assert.equal(typeof db.prepare('SELECT created FROM nonces').get().created,'number');
  assert.equal(postgresSQL("SELECT 'it''s ?' WHERE id=?").sql,"SELECT 'it''s ?' WHERE id=$1");
 }finally{db.close();}
});
