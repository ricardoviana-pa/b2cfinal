# Bancada local de reserva — primeira etapa

16-09-2026 · WEB-01, WEB-02, WEB-03 e WEB-04 · Sem publicação em produção nesta etapa.

## Reproduzir

```sh
npm run test:checkout:sandbox
```

O processo recebe apenas um conjunto explícito de variáveis locais. Não carrega
ficheiros `.env` nem herda credenciais. As chamadas HTTP, HTTPS, fetch e sockets
são bloqueadas. Os testes recusam configuração operacional presente.

Usa o router real de checkout, validação de inputs, cálculo de extras e serviço
real de finalização. Substitui a base por memória, Stripe/Guesty por adaptadores
simulados e emails por caixas de saída locais em memória. Os identificadores,
a casa e o hóspede são inteiramente fictícios. Nenhuma reserva, pagamento ou
mensagem é enviado para fornecedores.

## Falhas reproduzidas antes da correção

Os dez cenários iniciais tiveram dois sucessos e oito falhas: falha de leitura
do pagamento anterior, falha de cancelamento, cotação expirada, pagamento já
concluído com carrinho alterado, pagamento em processamento com carrinho
alterado, substituição de valor sem cancelar o anterior, referência de outro
checkout e moeda diferente de EUR.

## Proteções implementadas

- Uma leitura ou cancelamento falhado do pagamento anterior bloqueia uma nova
  tentativa; o código deixou de ignorar essas falhas.
- Pagamentos já concluídos são retomados mesmo que o carrinho ou validade da
  cotação tenham mudado. O formulário de cartão reconhece `alreadyPaid`, como
  já acontecia com wallets.
- Pagamentos em processamento/autorizados não são substituídos.
- A validade da cotação, moeda e identidade do checkout são verificadas antes
  de expor um novo pagamento.
- Um pagamento pendente com valor ou formato desatualizado é cancelado antes
  de se disponibilizar o substituto.
- Pedidos de criação para o mesmo checkout são serializados dentro do processo.
- A criação em Stripe recebe uma chave estável para a mesma tentativa. Uma
  falha a guardar o identificador impede devolver o segredo ao browser; uma
  repetição idêntica conserva a chave.

Referências: [Stripe — idempotência](https://docs.stripe.com/api/idempotent_requests)
e [cancelamento de PaymentIntent](https://docs.stripe.com/api/payment_intents/cancel).
A chave cobre repetições idênticas; não é um bloqueio distribuído de todos os
métodos e alterações de carrinho.

## O que esta bancada ainda não prova

- Não é uma compra em browser com o SDK real, 3DS ou uma wallet real.
- Não valida contas sandbox de fornecedores, respostas reais, webhook HTTP
  assinado, base SQL, persistência entre processos ou entrega de email.
- Não cobre ainda o percurso integrado PayPal/Klarna, concorrência de criação
  de reservas entre webhook e browser, nem todos os casos de requote.
- O snapshot da cotação e parte das transições do intent ainda vêm do browser:
  falta fechar a verificação da sua origem no servidor. Esta proteção é uma
  pendência própria; recomputar extras não torna a cotação autenticada.
- As contas de produção continuam totalmente separadas do DEV. A bancada não
  altera o modo visual do serviço DEV.

WEB-01/02/03/04 ficam parcialmente executadas; nenhuma se considera concluída
apenas por os cenários locais passarem.
