process.env.KPAY_MIGRATE='1';
const {db}=await import('./store.mjs');
try{await import('./operations.mjs');console.log('Database schema is up to date');}finally{db.close();}
