import {fileURLToPath} from 'node:url';
import {db,passwordHash} from '../store.mjs';

// Seed an isolated test account through the active database adapter.
db.prepare('UPDATE administrators SET password_hash=? WHERE id=?').run(passwordHash('test-admin-password-123'),'owner');
process.argv[1]=fileURLToPath(new URL('../server.mjs',import.meta.url));
await import('../server.mjs');
