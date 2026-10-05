import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('Vercel reports missing server configuration as a safe JSON response',()=>{
 const script=`import handler from './api/index.mjs';
 const response={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){console.log(JSON.stringify({status:this.status,headers:this.headers,body:JSON.parse(body)}));}};
 await handler({url:'/api/auth/config',method:'GET'},response);`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:new URL('.',import.meta.url),env:{...process.env,VERCEL:'1',DATABASE_URL:'',NEON_AUTH_BASE_URL:'',KPAY_PGLITE_TEST:''},encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 const response=JSON.parse(result.stdout.trim());
 assert.equal(response.status,503);
 assert.equal(response.headers['Cache-Control'],'no-store');
 assert.equal(response.body.code,'SERVER_INITIALIZATION_FAILED');
 assert.match(response.body.error,/DATABASE_URL is required/);
 assert.match(result.stderr,/kPay server initialization failed/);
});
