# Chave Stripe para checkout no site

O Stripe **já está ligado ao Guesty** (era usado no booking.portugalactive.com). Não precisas de configurar de novo no Guesty.

Só falta a **chave pública (publishable key)** para o formulário de pagamento neste website.

## Como obter

1. Entra em [dashboard.stripe.com](https://dashboard.stripe.com)
2. Vai a **Developers** → **API keys**
3. Copia a **Publishable key** (`pk_live_...` para produção ou `pk_test_...` para testes)

## Onde colocar

Adiciona ao ficheiro `.env` (na raiz do projeto):

```
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxx
```

Reinicia o servidor (`pnpm dev` ou `npm run dev`).

---

**Nota:** Usa a conta Stripe que está ligada ao Guesty. A mesma que processava os pagamentos no booking.portugalactive.com.
