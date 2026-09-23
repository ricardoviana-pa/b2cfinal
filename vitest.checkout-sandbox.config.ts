import { defineConfig } from 'vitest/config';
import base from './vitest.config';

export default defineConfig({
  ...base,
  // O Vite carrega .env/.env.local por conta própria e injeta as VITE_* em
  // process.env, furando o DOTENV_CONFIG_PATH=/dev/null do runner. Apontar o
  // envDir a uma pasta sem dotenvs mantém o sandbox sem config operacional
  // em máquinas de dev com .env local.
  envDir: '/var/empty',
  test: {
    ...base.test,
    include: ['server/checkout-sandbox/**/*.test.ts'],
    // O base exclui server/checkout-sandbox do npm test (corre por este
    // runner); aqui o exclude tem de voltar ao normal ou exclui-se a si mesmo.
    exclude: ['**/node_modules/**'],
    setupFiles: ['server/checkout-sandbox/setup.ts'],
  },
});
