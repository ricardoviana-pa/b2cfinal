# Deploy — o que está no `main` tem de estar no ar

Produção: serviço **Production** no Render, auto-deploy a partir de `main`
(sem `render.yaml`; build/start configurados no dashboard). Em frente está o
Cloudflare, que guarda o HTML público (`s-maxage=60`, regra
`scripts/cf-cache-rule.mjs`) e os estáticos de `client/public` (1 h).

## Depois de cada push para `main`

1. **Purga automática da CDN** — o servidor, em produção e com
   `CLOUDFLARE_API_TOKEN` definido, purga o edge 90 s depois de arrancar
   (`server/services/cdn-purge.ts`; log `[CDN] purga por host`). O cache de
   render SSR é em memória e nasce limpo com o processo.
   Manual: `npm run cdn:purge`.
   **Estado a 29 out 2026: não está a correr.** Um bundle antigo
   (`/assets/index-DY9JtB7m.js`) continuava HIT na edge de Lisboa com
   `age: 11011`, quatro deploys depois; com a purga ativa teria saído. Por
   isso o HTML fica com 60 s na edge e sem stale-while-revalidate
   (`server/lib/htmlCache.ts`): os ficheiros de um build antigo deixam de
   existir na origem (404) e HTML guardado mais tempo apontaria para eles.
   Para verificar depois de definir o token: no log de arranque
   `[CDN] purga agendada…` e, 90 s depois, `[CDN] purga por host (boot)`.
2. **Smoke pós-deploy** — com o `dist/` acabado de construir localmente
   (`npm run build`), corre:

   ```bash
   npm run smoke:deploy
   ```

   Compara `robots.txt`, `llms.txt`, `sitemap.xml` e o HTML de `/en/`,
   `/en/homes`, `/en/blog` e um PDP com o build (mesmo bundle de entrada,
   SSR presente, sem noindex) e falha se divergirem. Repete até 5 min para
   absorver o TTL do edge. `--base https://dev.portugalactive.com` para o dev.

## Se o smoke falhar com "bundle X ≠ build Y"

O Render está a servir um build antigo (foi isto a 4 set 2026: o deploy de
31 ago–2 set nunca chegou ao ar até um redeploy manual às 18:04). Abrir o
serviço no Render → Events, confirmar que o último deploy é o commit de
`main` e, se não for, **Manual Deploy → Deploy latest commit**.

## Variáveis relevantes

| Env | Efeito |
|---|---|
| `CLOUDFLARE_API_TOKEN` | permite a purga no boot (Zone → Cache Purge → Purge) |
| `CLOUDFLARE_ZONE_ID` | opcional; senão resolve-se por `CLOUDFLARE_ZONE_NAME` |
| `SITE_URL` | hosts a purgar (www + apex); dev purga só o seu |
