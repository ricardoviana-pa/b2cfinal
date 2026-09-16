import { defineConfig } from 'vitest/config';
import base from './vitest.config';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['server/checkout-sandbox/**/*.test.ts'],
    setupFiles: ['server/checkout-sandbox/setup.ts'],
  },
});
