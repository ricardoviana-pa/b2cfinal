/* ==========================================================================
   A chave dos limites de pedidos por IP (server/lib/rate-limit-key.ts).

   Em produção (14 nov 2026) um X-Forwarded-For inventado dava um contador
   novo a cada pedido, em todos os limites. Estes testes garantem:
   1. um X-Forwarded-For forjado não muda a chave nem dá um contador novo;
   2. dois visitantes diferentes atrás do mesmo nó (a mesma ligação, o mesmo
      resto do X-Forwarded-For) nunca partilham contador;
   3. para um visitante normal a chave é a que já era, e sem Cloudflare
      (desenvolvimento, testes) fica tudo como estava;
   4. todos os limites por IP do site usam esta chave.
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express, { type Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { afterEach, describe, expect, it } from "vitest";
import { visitorIp, visitorRateLimitKey } from "./rate-limit-key";

type Headers = Record<string, string | string[] | undefined>;

/** Um pedido como o Express o entrega: cabeçalhos, req.ip e o endereço da ligação. */
const request = (headers: Headers, ip?: string, remoteAddress?: string) =>
  ({ headers, ip, socket: { remoteAddress } }) as unknown as Request;

/** O que chega ao servidor em produção: o Cloudflare escreve o CF-Connecting-IP
 *  e junta o endereço do visitante ao X-Forwarded-For; o resto vem do proxy.
 *  Com `trust proxy` a true, o req.ip é o primeiro valor da lista. */
function viaCloudflare(visitor: string, opts: { forged?: string; node?: string; extra?: Headers } = {}) {
  const node = opts.node ?? "10.0.0.5";
  const chain = [opts.forged, visitor, "172.70.1.1", node].filter(Boolean).join(", ");
  const reqIp = chain.split(",")[0].trim();
  return request({ "cf-connecting-ip": visitor, "x-forwarded-for": chain, ...opts.extra }, reqIp, node);
}

describe("com Cloudflare à frente (produção)", () => {
  it("a chave é o endereço que o Cloudflare indica", () => {
    expect(visitorIp(viaCloudflare("198.51.100.10"))).toBe("198.51.100.10");
    expect(visitorRateLimitKey(viaCloudflare("198.51.100.10"))).toBe("198.51.100.10");
  });

  it("um X-Forwarded-For forjado não a muda", () => {
    const honest = visitorRateLimitKey(viaCloudflare("198.51.100.10"));
    for (const forged of ["203.0.113.7", "203.0.113.7, 203.0.113.8, 203.0.113.9", "10.0.0.1", "::1", "2001:db8::1", "abc", "198.51.100.11"]) {
      const req = viaCloudflare("198.51.100.10", { forged });
      // O req.ip do Express é o valor forjado: era essa a chave antiga.
      expect(req.ip).toBe(forged.split(",")[0]);
      expect(visitorRateLimitKey(req), forged).toBe(honest);
    }
  });

  it("nem os outros cabeçalhos que o cliente consegue mandar", () => {
    const honest = visitorRateLimitKey(viaCloudflare("198.51.100.10"));
    const extra = {
      "true-client-ip": "203.0.113.11",
      "x-real-ip": "203.0.113.15",
      forwarded: "for=203.0.113.13",
      "cf-connecting-ipv6": "2001:db8::9",
      cf_connecting_ip: "203.0.113.9",
      "x-client-ip": "203.0.113.17",
    };
    expect(visitorRateLimitKey(viaCloudflare("198.51.100.10", { forged: "203.0.113.7", extra }))).toBe(honest);
  });

  it("dois visitantes atrás do mesmo nó têm chaves diferentes", () => {
    // A mesma ligação, o mesmo resto do X-Forwarded-For, até o mesmo valor forjado.
    const a = viaCloudflare("198.51.100.10", { forged: "203.0.113.7" });
    const b = viaCloudflare("198.51.100.11", { forged: "203.0.113.7" });
    expect(a.ip).toBe(b.ip);
    expect(a.socket.remoteAddress).toBe(b.socket.remoteAddress);
    expect(visitorRateLimitKey(a)).not.toBe(visitorRateLimitKey(b));
    expect(visitorRateLimitKey(viaCloudflare("198.51.100.10"))).not.toBe(visitorRateLimitKey(viaCloudflare("198.51.100.11")));
  });

  it("o mesmo visitante por nós diferentes mantém a chave", () => {
    expect(visitorRateLimitKey(viaCloudflare("198.51.100.10", { node: "10.0.0.5" })))
      .toBe(visitorRateLimitKey(viaCloudflare("198.51.100.10", { node: "10.0.9.9" })));
  });

  it("para um visitante normal é a chave que já era (a do req.ip)", () => {
    for (const visitor of ["198.51.100.10", "2001:db8:abcd:12ff:1:2:3:4"]) {
      const req = viaCloudflare(visitor);
      expect(req.ip).toBe(visitor);
      // ipKeyGenerator(req.ip) é o que o express-rate-limit usava sem keyGenerator.
      expect(visitorRateLimitKey(req)).toBe(ipKeyGenerator(req.ip!));
    }
  });

  it("em IPv6 conta pela rede /56, como a chave por omissão", () => {
    const key = (ip: string) => visitorRateLimitKey(viaCloudflare(ip));
    expect(key("2001:db8:abcd:12ff:1:2:3:4")).toBe("2001:db8:abcd:1200::/56");
    expect(key("2001:db8:abcd:1200::9")).toBe(key("2001:db8:abcd:12ff:1:2:3:4"));
    expect(key("2001:db8:abcd:1300::9")).not.toBe(key("2001:db8:abcd:12ff:1:2:3:4"));
    // Um IPv4 escrito como IPv6 conta como o IPv4.
    expect(key("::ffff:198.51.100.10")).toBe("198.51.100.10");
  });
});

describe("sem Cloudflare (desenvolvimento, testes)", () => {
  it("fica o req.ip, como antes", () => {
    for (const ip of ["127.0.0.1", "::1", "::ffff:127.0.0.1", "192.168.1.20", "2001:db8::1"]) {
      expect(visitorIp(request({}, ip, ip))).toBe(ip);
      expect(visitorRateLimitKey(request({}, ip, ip))).toBe(ipKeyGenerator(ip));
    }
    // Com X-Forwarded-For e sem Cloudflare, o req.ip continua a mandar.
    expect(visitorRateLimitKey(request({ "x-forwarded-for": "203.0.113.7" }, "203.0.113.7", "127.0.0.1"))).toBe("203.0.113.7");
  });

  it("um CF-Connecting-IP que não é um só endereço IP não vira chave", () => {
    const bad: Array<string | string[] | undefined> = [
      undefined, "", " ", "unknown", "abc", "198.51.100.10, 203.0.113.9", "198.51.100.10:443",
      "[2001:db8::1]", "198.51.100", "198.51.100.10/24", ["198.51.100.10", "203.0.113.9"],
    ];
    for (const value of bad) {
      const req = request({ "cf-connecting-ip": value }, "192.0.2.44", "127.0.0.1");
      expect(visitorIp(req), JSON.stringify(value)).toBe("192.0.2.44");
    }
    // Espaços à volta de um endereço válido não o estragam.
    expect(visitorIp(request({ "cf-connecting-ip": " 198.51.100.10 " }, "192.0.2.44"))).toBe("198.51.100.10");
  });

  it("nunca rebenta: sem req.ip usa o endereço da ligação, e sem nada uma chave fixa", () => {
    expect(visitorRateLimitKey(request({}, undefined, "127.0.0.1"))).toBe("127.0.0.1");
    expect(visitorRateLimitKey(request({}, undefined, undefined))).toBe("unknown");
    expect(visitorRateLimitKey({ headers: {} } as unknown as Request)).toBe("unknown");
  });
});

/* ── O limitador verdadeiro (express-rate-limit), com o `trust proxy` do servidor ── */
let server: import("node:http").Server | undefined;
afterEach(() => { server?.close(); server = undefined; });

const MAX = 3;

async function boot() {
  const app = express();
  app.set("trust proxy", true); // como server/_core/index.ts
  const opts = { windowMs: 60 * 1000, max: MAX, standardHeaders: true, legacyHeaders: false } as const;
  const ok: express.RequestHandler = (_req, res) => { res.json({ ok: true }); };
  // "/novo": como o servidor monta os limites agora.
  app.use("/novo", rateLimit({ ...opts, keyGenerator: visitorRateLimitKey }), ok);
  // "/antigo": a chave por omissão (req.ip), como estavam até 16 nov 2026. O
  // aviso do express-rate-limit sobre o `trust proxy` é exatamente o problema
  // que este ficheiro testa; desliga-se para não encher a saída dos testes.
  app.use("/antigo", rateLimit({ ...opts, validate: { trustProxy: false } }), ok);
  server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (route: "/novo" | "/antigo", headers: Record<string, string> = {}) => {
    const res = await fetch(base + route, { method: "POST", headers });
    return { status: res.status, remaining: Number(res.headers.get("ratelimit-remaining")) };
  };
  return { call };
}

/** Os cabeçalhos de um pedido que passou pelo Cloudflare, com ou sem X-Forwarded-For forjado. */
const cloudflareHeaders = (visitor: string, forged?: string) => ({
  "cf-connecting-ip": visitor,
  "x-forwarded-for": [forged, visitor, "172.70.1.1"].filter(Boolean).join(", "),
});

describe("o limitador verdadeiro, com Cloudflare à frente", () => {
  it("a chave antiga: cada X-Forwarded-For inventado dava um contador novo", async () => {
    const { call } = await boot();
    for (let i = 0; i < MAX * 4; i++) {
      const r = await call("/antigo", cloudflareHeaders("198.51.100.10", `203.0.113.${i + 1}`));
      expect(r).toEqual({ status: 200, remaining: MAX - 1 });
    }
  });

  it("a chave nova: o mesmo ataque esgota o limite e pára", async () => {
    const { call } = await boot();
    const seen: Array<{ status: number; remaining: number }> = [];
    for (let i = 0; i < MAX + 2; i++) seen.push(await call("/novo", cloudflareHeaders("198.51.100.10", `203.0.113.${i + 1}`)));
    expect(seen.map((r) => r.status)).toEqual([200, 200, 200, 429, 429]);
    expect(seen.map((r) => r.remaining)).toEqual([2, 1, 0, 0, 0]);
    // Sem forjar nada, o mesmo visitante continua no mesmo contador.
    expect((await call("/novo", cloudflareHeaders("198.51.100.10"))).status).toBe(429);
  });

  it("um visitante esgotado não bloqueia outro atrás do mesmo nó", async () => {
    const { call } = await boot();
    // Todos os pedidos deste teste chegam pela mesma ligação (127.0.0.1) e
    // com o mesmo resto de X-Forwarded-For: é o "mesmo nó".
    for (let i = 0; i < MAX; i++) expect((await call("/novo", cloudflareHeaders("198.51.100.10"))).status).toBe(200);
    expect((await call("/novo", cloudflareHeaders("198.51.100.10"))).status).toBe(429);
    // O segundo visitante tem o contador dele inteiro, mesmo com o mesmo X-Forwarded-For forjado.
    expect(await call("/novo", cloudflareHeaders("198.51.100.11"))).toEqual({ status: 200, remaining: MAX - 1 });
    expect(await call("/novo", cloudflareHeaders("198.51.100.11", "203.0.113.7"))).toEqual({ status: 200, remaining: MAX - 2 });
    expect((await call("/novo", cloudflareHeaders("198.51.100.10", "203.0.113.7"))).status).toBe(429);
    // E um terceiro, em IPv6.
    expect(await call("/novo", cloudflareHeaders("2001:db8:abcd:1200::9"))).toEqual({ status: 200, remaining: MAX - 1 });
  });

  it("um visitante normal gasta o mesmo nas duas chaves", async () => {
    const { call } = await boot();
    for (let i = 0; i < MAX + 1; i++) {
      const headers = cloudflareHeaders("198.51.100.10");
      expect(await call("/novo", headers)).toEqual(await call("/antigo", headers));
    }
  });
});

describe("o limitador verdadeiro, sem Cloudflare", () => {
  it("fica como estava: as duas chaves dão sempre a mesma resposta", async () => {
    const { call } = await boot();
    const sequence: Array<Record<string, string>> = [
      {}, {}, {},                                   // o mesmo IP local até ao limite
      {},                                           // … e o pedido a mais
      { "x-forwarded-for": "203.0.113.7" },         // atrás de um proxy local
      { "x-forwarded-for": "203.0.113.7" },
      { "x-forwarded-for": "203.0.113.8, 10.0.0.1" },
      { "x-real-ip": "203.0.113.15" },              // nunca contou, continua sem contar
    ];
    const novo: unknown[] = [];
    const antigo: unknown[] = [];
    for (const headers of sequence) {
      novo.push(await call("/novo", headers));
      antigo.push(await call("/antigo", headers));
    }
    expect(novo).toEqual(antigo);
    expect(novo.map((r: any) => r.status)).toEqual([200, 200, 200, 429, 200, 200, 200, 429]);
  });

  it("um CF-Connecting-IP inválido não dá contadores novos", async () => {
    const { call } = await boot();
    const statuses: number[] = [];
    for (const value of ["abc", "198.51.100.10, 203.0.113.9", "198.51.100.10:443", "unknown", "x"]) {
      statuses.push((await call("/novo", { "cf-connecting-ip": value })).status);
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });
});

describe("como o servidor a usa", () => {
  const read = (file: string) => fs.readFileSync(file, "utf8");
  const limiters = (source: string) => source.match(/\brateLimit\(\{[^\n]*/g) ?? [];

  it("todos os limites de server/_core/index.ts contam por esta chave", () => {
    const index = read("server/_core/index.ts");
    const found = limiters(index);
    for (const name of ["authLimiter", "apiLimiter", "leadLimiter", "checkoutChargeLimiter", "checkoutSaveLimiter", "balanceLimiter", "partnerPayLimiter"]) {
      expect(index, name).toContain(`const ${name} = rateLimit({ keyGenerator: visitorRateLimitKey,`);
    }
    expect(found.length).toBeGreaterThanOrEqual(7);
    // Um limite novo neste ficheiro sem a chave aparece aqui.
    expect(found.filter((line) => !line.includes("keyGenerator: visitorRateLimitKey"))).toEqual([]);
    expect(index.match(/\brateLimit\(/g)?.length).toBe(found.length);
  });

  it("e o das métricas de página (server/routes/vitals.ts) também", () => {
    const vitals = read("server/routes/vitals.ts");
    expect(limiters(vitals)).toHaveLength(1);
    expect(limiters(vitals)[0]).toContain("keyGenerator: visitorRateLimitKey");
  });

  it("não há outro limite por IP no servidor sem alguém decidir a chave dele", () => {
    const withLimiter: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.posix.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.ts$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name) && /\brateLimit\(/.test(read(full))) withLimiter.push(full);
      }
    };
    walk("server");
    // As rotas de proprietários têm chave própria e um limite global por trás.
    // Um ficheiro novo nesta lista: usar visitorRateLimitKey, ou justificar outra chave.
    expect(withLimiter.sort()).toEqual([
      "server/_core/index.ts",
      "server/routes/owner-enquiries-v4.ts",
      "server/routes/owner-enquiries.ts",
      "server/routes/vitals.ts",
    ]);
  });
});
