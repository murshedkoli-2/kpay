import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newTotpSecret,totp,validTotp} from './mfa.mjs';
test('TOTP matches RFC 6238 SHA-1 vector truncated to six digits',()=>{const s='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';assert.equal(totp(s,59000),'287082');assert(validTotp(s,'287082',59000));assert(!validTotp(s,'123456',59000));});
test('generated authenticator secrets produce valid codes',()=>{const s=newTotpSecret();assert.match(s,/^[A-Z2-7]{32}$/);const time=Date.now();assert(validTotp(s,totp(s,time),time));assert(!validTotp(s,totp(s,time),time+120000));});
