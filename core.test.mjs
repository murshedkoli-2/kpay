import {test} from 'node:test';
import assert from 'node:assert/strict';
import {phone,money,parseSMS} from './core.mjs';
test('money uses exact integer minor units',()=>{assert.equal(money('1,234.56'),123456);assert.equal(money('1,00,000.00'),10000000);assert.throws(()=>money('1,,234'));assert.throws(()=>money('12,34'));assert.throws(()=>money('1.234'));assert.throws(()=>money('-1'));});
test('numbers must be full and normalize country prefix',()=>{assert.equal(phone('+8801712345678'),'01712345678');assert.throws(()=>phone('017****5678'));});
test('admin templates extract literal SMS fields',()=>{assert.deepEqual(parseSMS('Paid Tk {{amount}} from {{sender}}. TrxID {{transaction}}','Paid Tk 500.00 from 01712345678. TrxID ABC123'),{sender:'01712345678',transaction:'ABC123',amount:50000});});
test('malformed and mismatched templates fail closed',()=>{assert.throws(()=>parseSMS('{{sender}} {{sender}} {{amount}} {{transaction}}','anything'));assert.throws(()=>parseSMS('{{amount}} {{transaction}}','1 ABC'));assert.throws(()=>parseSMS('{{sender}} {{amount}} {{transaction}}','017****5678 1 ABC'));});
test('Nagad receipts allow changing reference, balance and timestamp without broad matching',()=>{
 const pattern='Money Received. Amount: Tk {{amount}} Sender: {{sender}} Ref: {{reference}} TxnID: {{transaction}} Balance: Tk {{balance}} {{date}} {{time}}';
 const message='Money Received. Amount: Tk 750.25 Sender: 01712345678 Ref: 5678 TxnID: NEW123 Balance: Tk 2,881.85 06/10/2026 22:15';
 assert.deepEqual(parseSMS(pattern,message),{sender:'01712345678',transaction:'NEW123',amount:75025});
 assert.throws(()=>parseSMS(pattern,message.replace('Money Received','Cash In')));
 assert.throws(()=>parseSMS(pattern,message+' OTP 123456'));
 assert.throws(()=>parseSMS(pattern,message.replace('2,881.85','anything')));
});
