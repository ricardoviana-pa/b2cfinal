import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Never inherit operational credentials, NODE_OPTIONS, dotenv files or provider
// configuration. This runner exercises the real checkout router with synthetic
// in-memory adapters. It is not a Stripe/Guesty sandbox certification.
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const child = spawnSync(process.execPath, [
  'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.checkout-sandbox.config.ts', ...args,
], {
  cwd: root,
  stdio: 'inherit',
  env: {
    PATH: process.env.PATH || '',
    TMPDIR: process.env.TMPDIR || '/tmp',
    NODE_ENV: 'test',
    CHECKOUT_RECOVERY: 'false',
    DOTENV_CONFIG_PATH: '/dev/null',
    JWT_SECRET: 'synthetic-local-checkout-test-only',
    PA_CHECKOUT_SANDBOX: '1',
  },
});
if (child.error) throw child.error;
process.exit(child.status ?? 1);
