import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('authentication configuration failure shows recovery information instead of a misleading login form',async()=>{
 const elements=new Map([['#app',{}],['#modal',{}],['#retry-auth',{}]]);
 runInNewContext(readFileSync(new URL('./public/app.js',import.meta.url),'utf8'),{
  document:{querySelector:selector=>elements.get(selector)},
  sessionStorage:{getItem:()=>null},
  location:{hash:'',search:'',pathname:'/'},
  window:{addEventListener:()=>{}},URLSearchParams,
  fetch:async()=>({ok:false,status:503,json:async()=>({error:'APP_ORIGIN must be a valid absolute URL'})})
 });
 await new Promise(resolve=>setImmediate(resolve));
 const rendered=elements.get('#app').innerHTML;
 assert.match(rendered,/Sign-in is temporarily unavailable/);
 assert.match(rendered,/APP_ORIGIN must be a valid absolute URL/);
 assert.doesNotMatch(rendered,/id="login-form"/);
 assert.equal(typeof elements.get('#retry-auth').onclick,'function');
});
