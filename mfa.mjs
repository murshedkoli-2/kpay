import {createHmac,randomBytes} from 'node:crypto';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newTotpSecret(){let value=0,bits=0,result='';for(const byte of randomBytes(20)){value=(value<<8)|byte;bits+=8;while(bits>=5){result+=alphabet[(value>>>(bits-5))&31];bits-=5;}}return result;}
function decode(s){let value=0,bits=0;const bytes=[];for(const c of s){const n=alphabet.indexOf(c);if(n<0)throw new Error('Invalid authenticator secret');value=(value<<5)|n;bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(bytes);}
export function totp(secret,time=Date.now()){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(time/30000)));const mac=createHmac('sha1',decode(secret)).update(counter).digest();const o=mac[19]&15;return String((mac.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0');}
export function totpStep(secret,code,time=Date.now()){if(!/^\d{6}$/.test(String(code)))return null;for(const offset of [-1,0,1])if(totp(secret,time+offset*30000)===String(code))return Math.floor(time/30000)+offset;return null;}
export function validTotp(secret,code,time=Date.now()){return totpStep(secret,code,time)!==null;}
