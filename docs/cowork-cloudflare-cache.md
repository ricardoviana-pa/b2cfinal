# Prompt para o Cowork — regra de cache HTML no Cloudflare

> Copia tudo abaixo da linha para o Cowork (numa sessão com acesso ao Cloudflare
> do portugalactive.com, ou com um API token com as permissões indicadas).

---

Preciso de ativar cache de HTML no edge do Cloudflare para **portugalactive.com**.

## Contexto (já feito, não é preciso mexer no código)

O servidor já envia os headers corretos — verifica com:

```
curl -sI https://www.portugalactive.com/en | grep -i cache-control
# esperado: public, max-age=0, s-maxage=60, stale-while-revalidate=120
curl -sI https://www.portugalactive.com/en/account | grep -i cache-control
# esperado: private, no-store
```

Páginas públicas são cacheáveis; `/account`, `/login`, `/admin`, `/owners-portal`,
`/checkout` e `/booking` enviam `no-store`, tal como qualquer resposta que não seja 200.
O HTML **não** tem `Set-Cookie` (confirmado), por isso é seguro partilhar a mesma cópia
entre visitantes.

O que falta é só a **Cache Rule** — o Cloudflare não cacheia HTML por omissão, por isso
hoje todas as páginas saem como `cf-cache-status: DYNAMIC`.

## O que preciso que faças

**1. Criar a Cache Rule**

Caching → Cache Rules → Create rule
- Nome: `Cache public HTML`
- Expressão personalizada:

```
(http.request.method eq "GET" and not starts_with(http.request.uri.path, "/api/") and not starts_with(http.request.uri.path, "/admin") and not starts_with(http.request.uri.path, "/owners-portal") and not http.request.uri.path contains "/account" and not http.request.uri.path contains "/login" and not http.request.uri.path contains "/checkout" and not http.request.uri.path contains "/booking")
```

- Then:
  - Cache eligibility → **Eligible for cache**
  - Edge TTL → **Use cache-control header if present**  ← importante: respeita o s-maxage=60 da origem
  - Browser TTL → **Respect origin**

⚠️ **Não** uses "Ignore cache-control header and use this TTL" — isso ignorava a proteção
de `no-store` das páginas privadas.

Se preferires fazer por API, o repositório tem um script pronto que **preserva as regras
existentes** (um `PUT` no ruleset substitui todas — o script lê as atuais e reenvia-as com
a nova acrescentada):

```
CLOUDFLARE_API_TOKEN=xxx node scripts/cf-cache-rule.mjs --dry-run   # mostra o payload
CLOUDFLARE_API_TOKEN=xxx node scripts/cf-cache-rule.mjs             # aplica
```
Token: Zone → Cache Rules → Edit + Zone → Zone → Read.

**2. Purge**

Caching → Configuration → **Purge Everything** (ou `node scripts/cf-purge.mjs`,
token com Zone → Cache Purge → Purge).

**3. Confirmar que funcionou**

```
# 2x seguidas: a segunda deve dar HIT
for i in 1 2; do curl -sI https://www.portugalactive.com/en | grep -i cf-cache-status; done
# esperado: DYNAMIC/MISS → HIT

# privadas TÊM de continuar a não ser cacheadas
curl -sI https://www.portugalactive.com/en/account | grep -i "cf-cache-status\|cache-control"
# esperado: cache-control: private, no-store  e  cf-cache-status: DYNAMIC (ou BYPASS)
```

E mede o ganho:
```
for i in 1 2 3; do curl -s -o /dev/null -w "TTFB=%{time_starttransfer}s\n" https://www.portugalactive.com/en; done
# antes: ~0,3–0,9s   |   esperado depois: ~0,02–0,05s
```

**4. Reporta-me**: o `cf-cache-status` antes/depois, o TTFB antes/depois, e confirmação de
que `/account` continua `no-store`.

## Nota importante sobre deploys

O `s-maxage` está deliberadamente baixo (60s) porque, depois de cada deploy, HTML em cache
aponta para ficheiros `/assets/<hash>.js` que já foram substituídos — o que daria página em
branco. **Se ligares um purge automático no deploy** (Render deploy hook → `scripts/cf-purge.mjs`),
avisa-me: aí posso subir o `s-maxage` bastante e o cache fica muito mais profundo.
