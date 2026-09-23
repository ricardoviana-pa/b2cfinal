import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.ts", "server/**/*.spec.ts"],
    // O sandbox de checkout corre SEMPRE pelo runner próprio
    // (npm run test:checkout:sandbox), que constrói um ambiente limpo.
    // No `npm test` estes ficheiros duplicavam a execução num ambiente que
    // não é o deles: no CI o job define APP_ENV=preview e o guard read-only
    // do tRPC matava as mutations dos testes (deploy de 23 set bloqueado);
    // localmente, um .env com VITE_* fazia-os falhar na collection.
    exclude: ["**/node_modules/**", "server/checkout-sandbox/**"],
  },
});
