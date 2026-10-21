// 일회용 Supabase 프로젝트(.env.disposable)로 고정해 Next dev 서버를 띄운다 (포트 3100).
// process.env 값은 .env.local보다 우선하므로 공유 프로젝트 값이 섞이지 않는다.
import { spawn } from 'node:child_process';
process.loadEnvFile('.env.disposable');
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', process.env.PORT ?? '3100'], {
  stdio: 'inherit',
  env: process.env,
});
child.on('exit', (code) => process.exit(code ?? 0));
