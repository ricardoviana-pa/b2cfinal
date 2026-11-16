/**
 * A chave dos limites de pedidos por IP: quem é o visitante, para o
 * express-rate-limit contar.
 *
 * O PROBLEMA
 *
 * O servidor corre com `trust proxy` a `true` (server/_core/index.ts), por
 * isso o `req.ip` do Express é o primeiro valor do cabeçalho
 * `X-Forwarded-For`, e esse valor é o cliente que o escreve. O
 * express-rate-limit usa o `req.ip` como chave quando não se lhe dá outra:
 * bastava mandar um `X-Forwarded-For` inventado em cada pedido para ter um
 * contador novo de cada vez, em todos os limites do site (visto em produção
 * a 14 nov 2026).
 *
 * O QUE SE VIU EM PRODUÇÃO (16 nov 2026)
 *
 * Pelos dois caminhos públicos até ao servidor: `www.portugalactive.com`
 * (o Cloudflare da marca à frente do Cloudflare do Render) e
 * `b2cfinal.onrender.com` (só o do Render).
 *
 * - Um `X-Forwarded-For` escrito pelo cliente chega ao servidor e fica em
 *   primeiro na lista. Sem ele, o primeiro valor é o endereço do visitante.
 * - Um pedido que traga um `CF-Connecting-IP` é recusado pelo Cloudflare
 *   (403, "error code: 1000") e não chega ao servidor.
 * - No mesmo pedido em que o `X-Forwarded-For` ia forjado, e em que o
 *   `req.ip` era o valor forjado, o servidor recebeu no `CF-Connecting-IP`
 *   o endereço verdadeiro de quem fez o pedido. Visto a partir de duas
 *   redes diferentes; cada uma ficou com o seu endereço.
 * - Nos endereços que o servidor já guardava a partir deste cabeçalho (os
 *   sinais de anúncios dos últimos 31 dias, ad-signals-store.ts) havia 29
 *   diferentes em 49 registos, IPv4 e IPv6, e nenhum do Cloudflare nem de
 *   uma rede privada.
 *
 * Não se viu a lista completa de saltos do `X-Forwarded-For` tal como chega
 * ao servidor (só código novo em produção a mostraria). A chave não depende
 * dela.
 *
 * A CHAVE
 *
 * O `CF-Connecting-IP`, quando vem e é um endereço IP. É o Cloudflare que o
 * escreve, com o endereço de quem se ligou a ele; o cliente não o consegue
 * mandar. Para um visitante normal é o mesmo valor que o `req.ip` dava, logo
 * ninguém muda de contador: quem partilhava um endereço (a mesma casa, o
 * mesmo escritório) continua a partilhar, e quem não partilhava continua
 * separado. Só muda quem manda um `X-Forwarded-For` seu: passa a contar pelo
 * endereço com que chega ao Cloudflare, e não pelo que escreveu.
 *
 * Sem `CF-Connecting-IP` (desenvolvimento, testes, um pedido feito ao
 * processo sem passar pelo Cloudflare), fica o `req.ip`, como antes. De
 * propósito não se troca aqui o `req.ip` pelo endereço da ligação nem pelo
 * último salto do `X-Forwarded-For`: não se viu em produção o que esses
 * valores são, e se forem os do proxy são iguais para toda a gente, o que
 * punha os hóspedes todos no mesmo contador. Um recurso que se deixa
 * enganar por um cabeçalho forjado é o que havia; um que bloqueia hóspedes
 * verdadeiros no checkout seria pior.
 *
 * O QUE ISTO NÃO FAZ
 *
 * Vale enquanto todo o tráfego público entrar por um Cloudflare, como hoje
 * no Render. Se o servidor passar a ser alcançável sem Cloudflare à frente,
 * o `CF-Connecting-IP` passa a poder ser escrito pelo cliente, como o
 * `X-Forwarded-For` é hoje, e esta função tem de ser revista. Também não
 * trava quem tem muitos endereços verdadeiros (uma rede de máquinas): isso
 * é trabalho para uma regra no Cloudflare.
 *
 * As rotas de proprietários (server/routes/owner-enquiries*.ts) têm a sua
 * própria chave e um limite global por trás; não usam esta.
 */
import { isIP } from "node:net";
import type { Request } from "express";
import { ipKeyGenerator } from "express-rate-limit";

/** O endereço que o Cloudflare indica, ou null se o cabeçalho não vier ou não for um só endereço IP. */
function cloudflareVisitorIp(req: Request): string | null {
  // Repetido, o Node junta os valores com ", ": deixa de ser um endereço e
  // conta como se não viesse (fica o req.ip). Não se escolhe um dos valores:
  // nada diria qual deles é o do Cloudflare.
  const raw = req.headers["cf-connecting-ip"];
  if (typeof raw !== "string") return null;
  const ip = raw.trim();
  return isIP(ip) ? ip : null;
}

/** O endereço do visitante para os limites de pedidos. Nunca rebenta. */
export function visitorIp(req: Request): string {
  return cloudflareVisitorIp(req) ?? req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

/**
 * `keyGenerator` de todos os limites por IP do site. Em IPv6 conta pela
 * rede /56 (o `ipKeyGenerator` do express-rate-limit, como a chave por
 * omissão fazia): um visitante com IPv6 dispõe de uma rede inteira de
 * endereços, não de um só.
 */
export function visitorRateLimitKey(req: Request): string {
  return ipKeyGenerator(visitorIp(req));
}
