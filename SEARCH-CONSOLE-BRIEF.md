# Search Console — diagnóstico de canibalização www vs booking

Cola isto numa sessão do Cowork com o conector do Google Search Console ligado,
ou usa como guião se fores fazer à mão.

## ESTADO DO CÓDIGO — ler primeiro

Tudo o que este documento descreve como corrigido está na branch
`seo/crawlability-and-indexing` e **NÃO ESTÁ EM PRODUÇÃO**. Não foi feito push
nem deploy. Ao verificares o site ao vivo vais encontrar o comportamento
ANTIGO, e isso é esperado:

| | em produção agora | na branch |
|---|---|---|
| links para casas em /homes | 0 | 48 |
| links para casas nos artigos | 0 | 4–7 por artigo |
| blog/serviços/experiências no sitemap | 0 | 351 / 72 / 72 |
| X-Robots-Tag no dev | não existe | noindex, nofollow |

O que **já está em produção** e foi verificado a 2026-08-24 com `curl`:

- `https://www.portugalactive.com/sitemap.xml` → HTTP 200, **1.112.812 bytes,
  729 URLs, das quais 495 são páginas de casa** (55 casas × 9 idiomas).
  ATENÇÃO: o ficheiro tem 1,1 MB e as primeiras 234 URLs são todas estáticas —
  a primeira casa é a URL nº 235, no byte 291.709. Uma ferramenta que trunque
  a resposta vê só páginas estáticas e conclui, erradamente, que não há casas
  nenhumas no sitemap. Conta as URLs a partir do ficheiro completo.
- O slug antigo da Villa Aura devolve **301** (cabeçalho cru, sem seguir):
  `location: /en/homes/villa-aura-sauna-gym-5min-beach-city-738c68`.
  As variantes sem prefixo de idioma também devolvem 301 para a mesma URL —
  não são duplicados, são redirecionamentos.

## Contexto

O site www.portugalactive.com e o motor de reservas booking.portugalactive.com
servem as mesmas casas, com as mesmas fotos e a mesma descrição vinda do Guesty.
Para pesquisas pelo nome de uma casa ("Villa Aura"), aparece o motor de reservas
e não o site. As reservas directas vêm de hóspedes que descobrem a casa numa OTA
e depois pesquisam o nome — por isso esta é a query que paga.

Duas propriedades no Search Console:
- `sc-domain:portugalactive.com` (cobre os dois hosts), ou
- `https://www.portugalactive.com/` e `https://booking.portugalactive.com/`

## O que preciso de saber

### 1. As páginas de casa do www estão indexadas?

Em **Indexação → Páginas**, filtra por URLs que contenham `/homes/`.

Devolve:
- quantas estão **indexadas**
- quantas estão **"Detetada — atualmente não indexada"** ou **"Rastreada — atualmente não indexada"**
- quantas estão em **"Página alternativa com tag canónica adequada"** — e, para essas,
  **qual foi o canónico escolhido pelo Google**. Se apontar para
  `booking.portugalactive.com`, está confirmada a canibalização.

O sitemap tem 55 casas × 9 idiomas. Quero o número real de indexadas, não o
número submetido.

### 2. Inspeção do URL da Villa Aura

Inspeciona:
```
https://www.portugalactive.com/en/homes/villa-aura-sauna-gym-5min-beach-city-738c68
```

Regista:
- estado de indexação
- data do último rastreio
- **canónico declarado pelo utilizador** vs **canónico selecionado pelo Google**
- se foi descoberto por sitemap, por link, ou por ambos

Contexto: o slug foi renomeado a 2026-08-10. O URL antigo era
`/homes/connected-premium-lodge-cowork-and-5min-beach-738c68` e devolve 301
correcto. Inspeciona também o antigo, para ver se o Google já processou a mudança.

### 3. Quem ganha as queries de marca

Em **Desempenho**, últimos 3 meses, compara os dois hosts:
- consultas que contenham nomes de casas ("villa aura", "eben lodge", "abreu retreat")
- impressões, cliques e **posição média** de cada host para essas queries
- lista as queries em que `booking.` tem melhor posição do que `www.`

É esta lista que diz quanto é que a canibalização custa.

### 4. dev.portugalactive.com está indexado?

Pesquisa `site:dev.portugalactive.com`. Se houver URLs indexados, diz quantos.

Estado real hoje: o dev **não** tem `X-Robots-Tag` e serve
`<meta name="robots" content="index, follow">`. O cabeçalho existe na branch
mas não foi deployado. O canónico já aponta para o www, o que está certo, mas
sozinho não impede o rastreio.

### 5. As 18 casas retiradas do www

Estas foram removidas do site principal em 2026-06-28 por posicionamento de
marca, mas continuam rastreáveis no motor de reservas: Calejo House,
Ocean view Cabedelo Beach Duplex, Seabreeze Duplex, Tide Terrace Duplex,
Douro Garden, Atlas Hideaway, Coastal Horizon, Seaside Urban Retreat,
Slow Living Countryside House, Countryside House near the Beach, e mais 8.

Diz se estão a receber impressões através de `booking.` — quanto tráfego está
a existir em páginas que decidimos não mostrar no site principal.

## Formato da resposta

Uma tabela por secção e, no fim, uma recomendação directa a esta pergunta:

> Já podemos pôr `noindex` no booking.portugalactive.com sem perder reservas,
> ou as páginas do www ainda não estão indexadas o suficiente para aguentar?

A ordem importa: fechar o motor antes de o www estar indexado abre uma janela
em que nenhum dos dois aparece.
