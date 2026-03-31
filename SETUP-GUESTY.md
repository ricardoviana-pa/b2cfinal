# Setup Guesty Sync

## Sem base de dados

O site funciona **sem DB** para as propriedades. Fotos e textos vêm do sync Guesty.

## 1. Configurar credenciais Guesty

Cria um ficheiro `.env` na raiz (ou copia de `.env.example`):

```env
GUESTY_CLIENT_ID=teu_client_id
GUESTY_CLIENT_SECRET=teu_client_secret
```

**Onde obter:** Guesty Dashboard → Integrations → API & Webhooks → Cria aplicação API → copia Client ID e Client Secret.

## 2. Correr o sync (1x por dia)

```bash
pnpm run sync:guesty
```

Isto:
- Conecta à API Guesty
- Obtém todas as listings (fotos, textos, preços base)
- Grava em `data/properties-synced.json`

## 3. O site usa

- **Se existir** `data/properties-synced.json` → mostra os dados do Guesty
- **Se não existir** → usa `client/src/data/properties.json` (fallback estático)

## 4. Automatizar (opcional)

Para sync diário, configura um cron no servidor ou um job no teu host:

```bash
# Exemplo: todos os dias às 6h
0 6 * * * cd /path/to/b2cfinal && pnpm run sync:guesty
```

## Live (sempre em tempo real)

- **Disponibilidade** → Guesty API quando o utilizador escolhe datas
- **Preço** → Guesty API quando o utilizador pede quote
- **Reserva** → Guesty API no momento do checkout

Estes não usam cache; são sempre live.
