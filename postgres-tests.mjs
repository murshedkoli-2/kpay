import {spawn} from 'node:child_process';
// Isolated PostgreSQL engine; never point automated fixtures at the live Neon database.
const child=spawn(process.execPath,['--test','integration.test.mjs','agent.test.mjs','database.test.mjs','registration.test.mjs','merchant-api.test.mjs'],{stdio:'inherit',env:{...process.env,DATABASE_URL:'',NEON_AUTH_BASE_URL:'',KPAY_PGLITE_TEST:'memory://'}});
child.on('exit',code=>{process.exitCode=code??1;});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
