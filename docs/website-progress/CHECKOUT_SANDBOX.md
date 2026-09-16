# Validação isolada de checkout

Atualizado em 16-09-2026. Os resultados abaixo identificam a branch e a publicação; não substituem uma compra completa com fornecedores de teste.

## Reproduzir

```sh
npm run test:checkout:sandbox
```

O runner não carrega ficheiros `.env`, usa uma lista explícita de variáveis e bloqueia HTTP, HTTPS, fetch e sockets. A base, os fornecedores e a caixa de saída são simulados em memória. Casas, hóspedes e identificadores são sintéticos.

## Resultados por versão

- DEV, PR 73: 20 testes da primeira etapa.
- Produção, PR 75: 57 testes isolados; suite completa de 326 testes aprovados e 6 testes antigos ignorados. TypeScript e builds cliente, SSR e servidor aprovados.
- A suite verifica cotação, tarifa selecionada, montantes, confirmação de pagamento, repetição de pedidos e contratos de cartão/PayPal/Klarna.
- Verificação online após PR 75: entrada anónima no checkout com as mesmas datas, hóspedes, tarifa flexível e total da página da casa. Sem contacto, cobrança ou reserva confirmada.

## Limites

Esta bancada não executa SDKs reais, autenticação 3DS, fornecedores sandbox, entrega de email ou uma compra completa em browser. Essas validações integradas continuam nas tarefas WEB-01 a WEB-04. O serviço DEV permanece um ambiente de revisão visual sem configuração operacional.

[PR 73](https://github.com/ricardoviana-pa/b2cfinal/pull/73) · [PR 75](https://github.com/ricardoviana-pa/b2cfinal/pull/75)
