# Mapa de tracking: Meta, Google Ads e GA4

Estado a 10/10/2026. Contentor `GTM-TRPCDT3` (versão publicada v30), pixel e conjunto
de dados Meta "B2C Pixel" `1428229772653572`, Google Ads `AW-11205004193`, GA4
`G-5DHEE0V85C`. Este documento substitui a tabela de mapeamento Meta de
[marketing-tracking.md](marketing-tracking.md). As regras de consentimento estão em
[measurement-consent.md](measurement-consent.md).

## 1. De onde nasce cada evento

Todos os eventos do browser passam por `client/src/lib/datalayer.ts` (`pushDL`,
`pushEcommerce`, `pushPurchaseOnce`). Só entram no `dataLayer` com "Aceitar tudo"
no site live. A exceção é o `purchase`, que também segue sem consentimento para o
ping sem cookies da Google. O GTM só carrega em `www.portugalactive.com` e
`portugalactive.com`.

| dataLayer | Onde | Campos principais | GA4 | Google Ads | Meta (pixel, tag GTM) | Meta CAPI (servidor) |
|---|---|---|---|---|---|---|
| `view_item_list` | `Homes.tsx`, `Home.tsx`, casas relacionadas em `PropertyDetail.tsx` | `items[].item_id = PROP-<guestyId>` | view_item_list | — | `ViewCategory` (tag "2 - Facebook - PLP") | cópia alojada pela Meta |
| `select_item` | `PropertyCard.tsx` | item da casa | select_item | — | — | — |
| `view_item` | `PropertyDetail.tsx`, uma vez por casa e por montagem | `property_id` (guestyId), `items[0].price` = preço desde | view_item | — | `ViewContent` (tag "2 - Facebook - PDP"), uma vez por página | cópia alojada pela Meta |
| `quote_viewed` | `BookingWidget.tsx`, preço vivo no ecrã | `property_id`, `ecommerce.value` | quote_viewed | — | — (deixou de ser ViewContent em 16/09) | — |
| `begin_checkout` | `BookingWidget.tsx`, clique em Reservar | `event_id` (`ic-<uuid>`), `property_id`, `ecommerce.value` = estadia | begin_checkout | "Iniciar pagamento" (tag "2 - Google Ads - Start Check Out") | `InitiateCheckout` (tag "2 - Facebook - Begining Checkout"), `eventID = event_id` | `InitiateCheckout` em `checkout.createIntent`, mesmo `event_id` |
| `add_contact_info`, `add_to_cart`, `add_payment_info`, … | `CheckoutPage.tsx` e componentes do checkout | ver marketing-tracking.md | sim | `add_to_cart` → "Adicionar ao carrinho" | — | — |
| `purchase` | obrigado (`PaymentThankYouPage.tsx`), regresso PayPal/Klarna, widget legacy. Uma vez por `transaction_id` | `transaction_id` = código Guesty, `value` = **só a estadia**, `property_id`, `user_data` (com consentimento) | purchase | "Reserva B2C" (tag "2 - Google Ads - Booking B2C", Enhanced Conversions) | `Purchase` (tag "2 - Facebook Pixel - Transaction"), `eventID = order_id = transaction_id` | `Purchase` em `fireCheckoutPaidEmails`, `event_id = confirmationCode` |
| `purchase_extras` | logo a seguir ao `purchase`, com consentimento | `transaction_id`, `value` = extras + receção + Flex, `items[]` | evento novo (tag a criar) | — | — | — |

Fontes server-side no Meta:

- **API de Conversões alojada pela Meta** (ativa desde 16/05/2026, "a partir da criação
  do píxel"): copia os eventos do pixel no servidor da Meta, com o mesmo `eventID`. É a
  origem dos eventos "API de Conversões" que se veem hoje (`metaHostedCapiProcessedCount`).
  Não recupera eventos bloqueados no browser.
- **CAPI direta** (`server/services/meta-capi.ts`): estava no código mas não enviava (sem
  `META_CAPI_TOKEN` no Render). Agora envia Purchase e InitiateCheckout, só para intents
  com sinais gravados, ou seja, com "Aceitar tudo" (ver §4).

O Meta deduplica os três canais pelo par `event_name` + `event_id`.

## 2. O que estava errado (auditoria de 10/10/2026)

1. **Purchase "valor igual" (`pixel_placeholder_value_single_event_actions`)**. A tag
   Purchase do GTM lê bem `ecommerce.value`, e o site envia valores reais (é a mesma fonte
   do Google Ads). O pixel B2C recebia eventos de 10 domínios: `www` (41,8 mil),
   `booking.portugalactive.com` (348), `dev` (290), `localhost` (223),
   `portugalactive.guestybookings.com` (34, ativo há 8 dias), `bookings.bokun.io`
   (21, ativo há 5 dias), previews onrender, `gtm-msr.appspot.com` e `127.0.0.1`. O Meta
   registou 18 compras em 28 dias, contra 15 do Google em 90. As compras a mais vêm dos
   motores Guesty e Bokun e dos testes em dev/localhost (casa demo, valor fixo). Além
   disso, a tag enviava `value: 0` quando faltava o valor.
   **Correção**: lista de permissões no Gestor de Eventos (`portugalactive.com` e
   subdomínios, feita a 10/10), a tag Purchase nova não envia 0, e o valor passa a ser só
   a estadia.
2. **InitiateCheckout e ViewContent sem valor**. As tags leem a variável de dataLayer
   `value` (nível de topo), que o site nunca envia: o site usa `ecommerce.value`.
3. **content_ids fora do catálogo**. O catálogo Meta usa o guestyId (`scripts/meta-catalog.mjs`).
   O ViewContent enviava `PROP-guesty-<id>` e o InitiateCheckout e o Purchase `PROP-<id>`.
   Nenhum batia com o catálogo.
4. **ViewContent a mais** (33,6 mil contra 27,2 mil PageView). Até 16/09 o `quote_viewed`
   (cada mudança de datas) era mapeado para ViewContent, e a janela de 28 dias ainda o
   apanha. Para garantir uma vez por página, a tag nova tem guarda por URL + casa e só
   aceita casas (`PROP-`).
5. **`begin_checkout` custom no Meta**: era a tag 90 antiga (`fbq('track','begin_checkout')`),
   corrigida para InitiateCheckout no contentor v25. Sem atividade há 24 dias. Nada no
   código chama `fbq` diretamente.
6. **"Iniciar pagamento" a 0 no Google Ads**: a tag "2 - Google Ads - Start Check Out"
   (rótulo `eXznCM7Dy6cYEKGX-94p`) está **em pausa e sem acionador**.
7. **CAPI direta parada**: `meta-capi.ts` nunca enviou, e mesmo configurada seria recusada,
   porque a Meta exige `client_user_agent` nos eventos de website e o payload não o levava.

## 3. Valor das conversões

Decisão de 10/10/2026: o `purchase` leva **só a estadia** (alojamento, limpeza e taxas,
já com o desconto do código), em EUR, no GA4, no Google Ads e no Meta. Extras, receção
e Flex vão no `purchase_extras`. Os valores do Google Ads descem a partir do deploy. Não
é uma queda de vendas.

- Cartão: `stayTotalCents` = total do plano escolhido (`effective.total`), guardado no stash do obrigado.
- PayPal/Klarna: total pago − soma dos `purchaseItems`.
- Servidor (CAPI): `breakdownFromIntent(...).stayCents`.
- Helper: `stayValue()` em `datalayer.ts`. Sem total válido não envia valor; nunca envia 0.

## 4. CAPI direta e consentimento

- O browser só manda `adSignals` (`_fbp`, `_fbc`) com "Aceitar tudo" no live
  (`client/src/lib/adSignals.ts`), em `createIntent` e em cada `setOrigin` do checkout.
- O servidor junta o user agent e o IP do pedido e grava em `booking_intent_ad_signals`
  (criada no arranque e apagada 31 dias depois da última atualização). "Apenas
  essenciais" no checkout apaga o registo.
- Sem registo, nada sai para a Meta. A origem da visita (`booking_intent_origins`)
  continua a nunca sair para terceiros.
- Envs no Render: `META_PIXEL_ID=1428229772653572`, `META_CAPI_TOKEN` (gerar em Gestor de
  Eventos → B2C Pixel → Definições → API de Conversões → Gerar token de acesso), e
  `META_CAPI_TEST_CODE` só durante o teste (retirar depois).
- **Pendente legal**: a política de privacidade deve dizer que, com autorização, os dados
  da reserva (email e telefone em hash, cookies do pixel, IP, browser) seguem para a Meta
  pelo servidor.

## 5. Alterações no GTM (workspace por publicar)

O agente não conseguiu guardar no GTM por falta de permissão nesta sessão. Fazer à mão
no workspace "Default", **pré-visualizar no Tag Assistant e só publicar depois da
aprovação**. Antes de publicar, exportar a v30 para reposição.

### 5.1 "2 - Facebook Pixel - Transaction" (Purchase)

Manter o acionador `purchase`, a exceção "Block - Management", a sequência com
"2 - Facebook Pixel Geral" e o consentimento `ad_storage`. Substituir o HTML por:

```html
<script>
/* Meta Purchase (docs/tracking-map.md, b2cfinal). value = estadia em EUR;
   content_ids = id do catálogo; eventID = order_id = código da reserva Guesty
   (o mesmo event_id da CAPI). Sem valor válido não envia value (nunca 0). */
(function () {
  if (!/^(www\.)?portugalactive\.com$/.test(window.location.hostname)) return;
  if (typeof window.fbq !== 'function') return;
  var dl = window.dataLayer || [], top = null;
  for (var i = dl.length - 1; i >= 0; i--) {
    if (dl[i] && dl[i].event === 'purchase' && dl[i].ecommerce) { top = dl[i]; break; }
  }
  if (!top) return;
  var c = top.ecommerce, ids = [];
  if (top.property_id) ids.push(String(top.property_id));
  else if (c.items) {
    for (var j = 0; j < c.items.length; j++) {
      var id = String(c.items[j].item_id || '');
      if (id.indexOf('PROP-') === 0) ids.push(id.slice(5).replace(/^guesty-/, ''));
    }
  }
  var data = { content_ids: ids, content_type: 'product', currency: String(c.currency || 'EUR').toUpperCase(), num_items: 1 };
  if (c.transaction_id) data.order_id = String(c.transaction_id);
  var v = Number(c.value);
  if (isFinite(v) && v > 0) data.value = Math.round(v * 100) / 100;
  if (c.transaction_id) fbq('track', 'Purchase', data, { eventID: String(c.transaction_id) });
  else fbq('track', 'Purchase', data);
})();
</script>
```

### 5.2 "2 - Facebook - Begining Checkout" (InitiateCheckout)

Manter o acionador, a exceção, a sequência e o consentimento. Substituir o HTML por:

```html
<script>
/* Meta InitiateCheckout: value = estadia (ecommerce.value), eventID = event_id
   do begin_checkout (o mesmo que a CAPI recebe no createIntent). */
(function () {
  if (!/^(www\.)?portugalactive\.com$/.test(window.location.hostname)) return;
  if (typeof window.fbq !== 'function') return;
  var dl = window.dataLayer || [], e = null;
  for (var i = dl.length - 1; i >= 0; i--) {
    if (dl[i] && dl[i].event === 'begin_checkout' && dl[i].ecommerce) { e = dl[i]; break; }
  }
  if (!e) return;
  var c = e.ecommerce, it = (c.items && c.items[0]) || {};
  var id = e.property_id ? String(e.property_id) : String(it.item_id || '').replace(/^(PROP|EXP)-/, '').replace(/^guesty-/, '');
  var data = { content_ids: id ? [id] : [], content_type: 'product', currency: String(c.currency || 'EUR').toUpperCase(), num_items: 1 };
  if (it.item_name) data.content_name = String(it.item_name);
  if (it.checkin_date) data.checkin_date = String(it.checkin_date);
  if (it.checkout_date) data.checkout_date = String(it.checkout_date);
  var v = Number(c.value);
  if (isFinite(v) && v > 0) data.value = Math.round(v * 100) / 100;
  if (e.event_id) fbq('track', 'InitiateCheckout', data, { eventID: String(e.event_id) });
  else fbq('track', 'InitiateCheckout', data);
})();
</script>
```

### 5.3 "2 - Facebook - PDP" (ViewContent)

Manter o acionador `view_item`, a exceção, a sequência e o consentimento. Substituir o HTML por:

```html
<script>
/* Meta ViewContent: só páginas de casa, uma vez por página (URL + casa);
   content_ids = id do catálogo; value = preço desde. */
(function () {
  if (!/^(www\.)?portugalactive\.com$/.test(window.location.hostname)) return;
  if (typeof window.fbq !== 'function') return;
  var dl = window.dataLayer || [], e = null;
  for (var i = dl.length - 1; i >= 0; i--) {
    if (dl[i] && dl[i].event === 'view_item' && dl[i].ecommerce) { e = dl[i]; break; }
  }
  if (!e) return;
  var it = (e.ecommerce.items && e.ecommerce.items[0]) || {};
  var raw = String(it.item_id || '');
  if (raw.indexOf('PROP-') !== 0) return;
  var id = e.property_id ? String(e.property_id) : raw.slice(5).replace(/^guesty-/, '');
  var key = window.location.pathname + '|' + id;
  if (window.__paViewContentKey === key) return;
  window.__paViewContentKey = key;
  var data = { content_ids: [id], content_type: 'product', currency: 'EUR' };
  if (it.item_name) data.content_name = String(it.item_name);
  if (it.item_category2) data.location_city = String(it.item_category2);
  var v = Number(it.price);
  if (isFinite(v) && v > 0) data.value = v;
  fbq('track', 'ViewContent', data);
})();
</script>
```

### 5.4 "2 - Facebook - PLP" (ViewCategory)

Só uma mudança no HTML atual: `d.item_id&&b.push(d.item_id)` passa a
`d.item_id&&b.push(String(d.item_id).replace(/^PROP-/,"").replace(/^guesty-/,""))`.

### 5.5 Google Ads "Iniciar pagamento"

Tag "2 - Google Ads - Start Check Out" (ID `11205004193`, rótulo `eXznCM7Dy6cYEKGX-94p`):
retomar (está em pausa), acionador `begin_checkout`, exceção "Block - Management",
valor = a variável de dataLayer de `ecommerce.value` que a tag "2 - Google Ads - Booking B2C"
já usa, moeda = a de `ecommerce.currency`.

### 5.6 GA4 `purchase_extras` (nova)

Tag "Google Analytics: evento do GA4", ID de medição `G-5DHEE0V85C`, nome do evento
`purchase_extras`, parâmetros `transaction_id`, `value`, `currency`, `items` (mesmas
variáveis DLV `ecommerce.*` da tag "1 - GA4 - Reservation"). Acionador: evento personalizado
`purchase_extras` com a condição de hostname das outras tags "PA - GA4".

## 6. Consolas (fora do código)

- **Gestor de Eventos**: lista de permissões `portugalactive.com` + subdomínios, **feita a
  10/10/2026**. Bloqueia Guesty (guestybookings.com), Bokun, localhost, 127.0.0.1 e os previews
  onrender. As experiências reservadas no Bokun deixam de contar como compra no Meta.
- **Business Manager → Domínios**: `portugalactive.com` adicionado a 10/10 (id 2346717209378286).
  A meta tag `facebook-domain-verification` está no `<head>` (`client/index.html`). Depois
  do deploy, carregar em "Verificar domínio" (a Meta pode demorar até 72 h a ler a tag).
- **Google Ads → Conversões** (verificado a 10/10): "Adicionar ao carrinho" e "Iniciar
  pagamento" já são secundárias (0 ações principais) e a Compra é principal. As Enhanced
  Conversions estão ativas ("Geridas através do Gestor de Etiquetas"). **Por decidir**:
  "Contacto" e "Fazer marcação" também têm uma ação principal cada. O brief pede a compra
  como única principal, mas o Contacto inclui o WhatsApp, que é o canal principal de
  conversão. Mudar isto altera os lances de 12 a 18 campanhas.
- **Render**: `META_PIXEL_ID`, `META_CAPI_TOKEN` e, durante o teste, `META_CAPI_TEST_CODE`
  (o Ricardo cola o token: o agente não introduz tokens).
- **Política de privacidade**: parágrafo `privacy.s3AdsBody` em PT (10/10). As outras oito
  línguas omitem-no até serem traduzidas, como o `s2OriginBody`.

## 7. Como testar

1. **Preview / local** (sem dinheiro e sem enviar nada): num host que não seja o live,
   `localStorage.setItem('pa-dl-debug','1')` e recarregar. Os eventos entram no
   `window.dataLayer` e aparecem na consola como `[dataLayer] …`. O GTM não carrega. Na
   página de casa deve aparecer um `view_item` com `property_id` = guestyId e
   `item_id = PROP-<guestyId>`. Para desligar: `localStorage.removeItem('pa-dl-debug')`.
2. **Live**, depois do deploy e com as tags do §5 no workspace: GTM → Pré-visualizar em
   `www.portugalactive.com`, e no Gestor de Eventos → Testar eventos o código de teste
   (o mesmo em `META_CAPI_TEST_CODE`). Duas reservas reais baratas, uma em `/pt` e outra
   em `/es`, com "Aceitar tudo". Reembolsar e cancelar a seguir.
   - Purchase com `value` = estadia (bate com o total da reserva sem serviços), `currency`
     EUR, recebido por browser e servidor e marcado como deduplicado; as duas reservas com
     valores diferentes.
   - InitiateCheckout com valor e o mesmo `event_id` no browser e no servidor.
   - Um ViewContent por página de casa.
   - Tag Assistant: `begin_checkout` e `purchase` com valor; a tag "Start Check Out" dispara.
3. Publicar o GTM e tirar `META_CAPI_TEST_CODE`. Em 24–48 h "Iniciar pagamento" passa a
   "A registar conversões"; o diagnóstico de valor deve desaparecer em até 72 h.

## 8. Reposição

- Código: reverter o PR. A tabela `booking_intent_ad_signals` pode ficar (fica vazia em 31 dias).
- GTM: republicar a versão 30.
- CAPI: apagar `META_CAPI_TOKEN` no Render para parar o envio sem deploy.
- Lista de permissões: Gestor de Eventos → B2C Pixel → Definições → Permissões de tráfego.
