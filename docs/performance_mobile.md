# Performance no telemóvel (Core Web Vitals)

Projeto aberto a 24 set 2026. Objetivo: passar os 135 URLs de "Necessitam de
melhorias" para "Bom" no relatório Core Web Vitals do Search Console
(telemóvel). No computador já está tudo bom.

O Google avalia o percentil 75 das visitas reais em 28 dias. Para passar:
**LCP ≤ 2,5 s, INP ≤ 200 ms, CLS ≤ 0,1**. Hoje falham o LCP e o INP.

## Diagnóstico (24 set 2026)

Lighthouse, telemóvel, produção:

| Página | Nota | FCP | LCP | TBT |
|---|---|---|---|---|
| Homepage | 65 | 4,3 s | 7,6 s | 40 ms |
| /homes | 64 | 4,3 s | 8,6 s | 70 ms |
| Página de casa | 68 | 3,8 s | 6,5 s | 60 ms |

Onde se perde o tempo, por ordem de peso:

1. **Tracking injetado pelo Cloudflare.** A funcionalidade *Google tag
   gateway* insere o GTM no topo do `<head>` (`/f3nl/`, ~335 KB comprimidos:
   GA4, Google Ads, Meta, Clarity) em todas as páginas e para todos os
   visitantes. Começa a descarregar antes da foto principal e ocupa o
   processador do telemóvel. Passa também por cima da regra do site
   (`client/src/lib/measurementConsent.ts`): o GTM só devia carregar com
   consentimento e depois de a página abrir.
2. **HTML pesado.** A homepage e /homes embebiam o catálogo inteiro (110
   casas, 247 KB), 45% dos quais eram listas de comodidades.
3. **Imagens no arranque.** Logótipo de 2048 px (34 KB) pré-carregado antes da
   foto principal, e a foto principal pouco comprimida.
4. **JavaScript da aplicação.** ~290 KB comprimidos no arranque (React,
   tRPC, react-query, UI) mais 36 KB de traduções.

O INP (tempo de resposta a um toque) não se mede em laboratório: o TBT é
baixo (40-70 ms), por isso a lentidão aparece em telemóveis reais,
provavelmente com o tracking a correr. Para saber qual toque e qual script,
o site passou a medir no campo (ver abaixo).

## Feito

- **PR #109**: catálogo só com as comodidades usadas pelos filtros; logótipo
  211×120 (5 KB); foto principal recomprimida a partir do original; medição
  real de Core Web Vitals.
- **Cache do HTML no Cloudflare** já estava ativo (`cf-cache-status:
  REVALIDATED`, `s-maxage=60`).

## Medição real (RUM)

`client/src/lib/vitals.ts` envia, de cada visita, LCP/INP/CLS/FCP/TTFB com a
atribuição do `web-vitals`: o elemento, a fase lenta e o script mais longo.
Os dados vão para `POST /api/vitals` e ficam na tabela `web_vitals` durante
90 dias. São anónimos (sem cookies, ids ou query string) e só são enviados em
www.

```
npm run report:vitals                  # Render → serviço de produção → Shell; 7 dias, telemóvel
DAYS=28 DEVICE=desktop npm run report:vitals
```

O relatório mostra o p75 por métrica e por página, o LCP decomposto (TTFB,
atraso, descarga, render), as interações mais lentas por elemento e os
scripts por trás dos toques acima de 200 ms.

## Próximos passos, por ordem

1. **Cloudflare: desligar a injeção automática do Google tag gateway**
   (Tag management / Google tag gateway → desligar "inject"). O site já
   carrega o GTM sozinho, com consentimento. Se quiserem manter o domínio
   próprio para as tags, trocar o `src` em `measurementConsent.ts` para
   `/f3nl/` sem injeção automática. É a maior melhoria isolada, no LCP e no
   INP.
2. **Esperar 7 dias de dados** e correr `npm run report:vitals`. Atacar as 3
   interações com pior INP. Se os scripts forem de terceiros (Clarity, Meta),
   rever quais tags são mesmo precisas em todas as páginas. Se forem nossos,
   partir o handler (`startTransition`, `scheduler.yield`).
3. **Hidratação por partes na homepage.** As secções abaixo da dobra
   (avaliações, jornal, mapa) podem hidratar só quando ficam visíveis.
4. **JavaScript inicial.** Ver o que o `index-*.js` (82 KB) e o `ui-*.js`
   (36 KB) levam que não é preciso no primeiro ecrã, e passar para `lazy()`.
5. **Fontes.** 98 KB de Google Fonts. Alojar e fazer subset (só latim e só os
   pesos usados) poupa ~40 KB e um domínio extra.

## Como verificar

- Lighthouse local: `npx lighthouse https://www.portugalactive.com/en --only-categories=performance --chrome-flags="--headless=new"`.
- Search Console → Core Web Vitals → "Validar correção" depois de 28 dias de
  dados bons (o Google usa uma janela de 28 dias).
