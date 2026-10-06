import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applicationOrigin} from './auth-config.mjs';

test('auth links use the configured origin or the trusted Vercel production domain',()=>{
 assert.equal(applicationOrigin({APP_ORIGIN:' https://kpay-six.vercel.app/ '}),'https://kpay-six.vercel.app');
 assert.equal(applicationOrigin({VERCEL:'1',APP_ORIGIN:'[broken URL]',VERCEL_PROJECT_PRODUCTION_URL:'kpay-six.vercel.app'}),'https://kpay-six.vercel.app');
 assert.equal(applicationOrigin({VERCEL:'1',VERCEL_PROJECT_PRODUCTION_URL:'kpay-six.vercel.app'}),'https://kpay-six.vercel.app');
 assert.equal(applicationOrigin({VERCEL:'1',APP_ORIGIN:'https://payments.example.com',VERCEL_PROJECT_PRODUCTION_URL:'kpay-six.vercel.app'}),'https://payments.example.com');
 assert.throws(()=>applicationOrigin({APP_ORIGIN:'invalid'}),/APP_ORIGIN/);
 assert.throws(()=>applicationOrigin({VERCEL:'1',APP_ORIGIN:'invalid',VERCEL_PROJECT_PRODUCTION_URL:'attacker.invalid/path'}),/APP_ORIGIN/);
 assert.throws(()=>applicationOrigin({APP_ORIGIN:'https://user:secret@example.com'}),/APP_ORIGIN/);
 assert.equal(applicationOrigin({}),'http://127.0.0.1:3000');
});
