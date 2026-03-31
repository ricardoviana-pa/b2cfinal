#!/bin/bash
# Instala Node.js e pnpm — corre isto primeiro (1x apenas)

set -e
cd "$(dirname "$0")"

echo "=== A instalar Node.js... ==="

# 1. fnm (gestor de Node)
FNM_DIR="$HOME/.fnm"
if [ ! -x "$FNM_DIR/fnm" ]; then
  echo "A descarregar fnm..."
  if [ "$(uname)" = "Darwin" ]; then
    curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir "$FNM_DIR" --skip-shell --force-install
  else
    curl -fsSL https://fnm.vercel.app/install | bash -s -- --install-dir "$FNM_DIR" --skip-shell
  fi
fi

# 2. Carregar fnm
export PATH="$FNM_DIR:$PATH"
eval "$("$FNM_DIR/fnm" env 2>/dev/null)" || true

# 3. Instalar Node
fnm install --lts
fnm use lts-latest

# 4. Ativar pnpm
corepack enable
corepack prepare pnpm@latest --activate

# 5. Instalar dependências do projecto
pnpm install

echo ""
echo "=== Concluído ==="
echo "Abre um NOVO terminal e corre:"
echo "  cd $(pwd)"
echo "  pnpm run sync:guesty"
echo "  pnpm dev"
echo ""
