import { execSync } from 'child_process';
import { join } from 'path';

process.env.NODE_ENV = 'test';
process.env.ENABLE_QUEUES = 'false';
process.env.DATABASE_URL = process.env.DATABASE_URL?.includes('cyrelle_test')
  ? process.env.DATABASE_URL
  : 'postgresql://cyrelle:cyrelle@127.0.0.1:5432/cyrelle_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-cyrelle';
process.env.JWT_ACCESS_TTL = '15m';
process.env.VERIFICATION_ENCRYPTION_KEY = '4d6c382eba44def051985fd62bb3307883a973aedd78d54e42b65f2d21552e19';
process.env.PAYMENT_PROVIDER = 'test';
process.env.ALLOW_DEV_GOOGLE = 'true';
process.env.WEBHOOK_SECRET = 'test-webhook';
process.env.WEB_ORIGIN = 'http://localhost:5173';

execSync('npx prisma migrate deploy', {
  cwd: join(__dirname, '..'),
  stdio: 'inherit',
  env: process.env,
});
