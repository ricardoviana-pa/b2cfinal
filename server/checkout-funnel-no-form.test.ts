/**
 * Verificação em produção, 29 out 2026 (Checkout:P1): no passo do pagamento o
 * GA4 (medição avançada, "interações com formulários") mandava form_start ao
 * marcar os Termos e form_submit ao carregar em Pagar, e o GTM-TRPCDT3 fazia
 * deles as conversões 'Start Activity Form' e 'Lead_Site'. Até a demo as
 * disparava. Esses ouvintes só veem campos e submits dentro de um <form>:
 * nenhum passo do funil de reserva tem <form> (o cartão do checkout e do
 * widget antigo, a demo, o pedido das casas parceiras). Os formulários que
 * ficam no site estão listados no fim, com o que são.
 */
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// tRPC e Stripe falsos: os componentes renderizam no servidor sem rede.
vi.mock("@/lib/trpc", () => {
  const DATA: Record<string, unknown> = {
    "booking.getStripeConfig": { publishableKey: "pk_test_synthetic" },
    "booking.getPaymentProvider": { providerAccountId: null },
  };
  const node = (p: string[]): any =>
    new Proxy(() => undefined, {
      get(_t, key) {
        if (key === "useQuery") return () => ({ data: DATA[p.join(".")], isLoading: false, isFetching: false, isError: false });
        if (key === "useMutation") return () => ({ mutateAsync: async () => ({}), isPending: false });
        return node([...p, String(key)]);
      },
    });
  return { trpc: node([]) };
});
vi.mock("@/lib/stripeLoader", () => ({ loadStripe: () => Promise.resolve(null) }));
vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => children,
  PaymentElement: () => React.createElement("div", { "data-stripe-element": "payment" }),
  ExpressCheckoutElement: () => null,
  useStripe: () => ({}),
  useElements: () => ({}),
}));

import i18next from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import en from "../client/src/i18n/locales/en.json";
import CheckoutPaymentForm from "@/components/booking/CheckoutPaymentForm";
import { PartnerBookingPanel } from "@/components/booking/PartnerBookingPanel";
import { isImplicitSubmitKey } from "@/lib/implicitSubmit";

// O site compila JSX com o runtime automático; o vitest usa o clássico do tsconfig.
(globalThis as any).React = React;

const i18n = i18next.createInstance();
await i18n.use(initReactI18next).init({ lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false } });

const ROOT = path.resolve(import.meta.dirname, "..");
const FORM = /<form[\s>]/;

/** Os Termos como o CheckoutPage os passa em `consent` (#checkout-terms). */
const consent = React.createElement(
  "label",
  null,
  React.createElement("input", { id: "checkout-terms", type: "checkbox", readOnly: true, checked: false }),
  "Terms",
);

const baseProps = {
  listingId: "g-1",
  checkIn: "2026-11-28",
  checkOut: "2026-12-05",
  guests: 4,
  quoteId: "q-1",
  ratePlanId: "rp-1",
  total: 2700,
  currency: "EUR",
  guestName: "Synthetic Guest",
  guestEmail: "guest@checkout.invalid",
  guestPhone: "+351912345678",
  propertyName: "Casa Teste",
  onSuccess: () => undefined,
};

const render = (el: React.ReactElement) => renderToStaticMarkup(React.createElement(I18nextProvider, { i18n }, el));
const payButtons = (html: string) => html.match(/<button[^>]*class="btn-primary w-full[^"]*"[^>]*>/g) ?? [];

describe("o passo do pagamento não tem <form>", () => {
  for (const plan of ["full", "two_parts"] as const) {
    it(`demo (/checkout/demo), plano ${plan}: Termos e Pagar sem <form>`, () => {
      const html = render(
        React.createElement(CheckoutPaymentForm, {
          ...baseProps,
          intentId: "demo",
          demo: true,
          plan,
          termsAccepted: true,
          mandateAccepted: true,
          payLaterCaption: "Then €1,350 on 11 November 2026.",
          consent,
        }),
      );
      expect(html).toContain('id="checkout-terms"');
      expect(html).not.toMatch(FORM);
      expect(html).not.toContain('type="submit"');
      const buttons = payButtons(html);
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toContain('type="button"');
      // Os Termos continuam mesmo acima do botão (spec 4.1).
      expect(html.indexOf('id="checkout-terms"')).toBeLessThan(html.indexOf(buttons[0]));
    });
  }

  it("cartão a sério do checkout (Stripe): sem <form> à volta do PaymentElement, dos Termos e de Pagar", () => {
    const html = render(
      React.createElement(CheckoutPaymentForm, { ...baseProps, intentId: "0b6f6c1e-0000-4000-8000-000000000001", termsAccepted: true, consent }),
    );
    expect(html).toContain('data-stripe-element="payment"');
    expect(html).toContain('id="checkout-terms"');
    expect(html).not.toMatch(FORM);
    expect(html).not.toContain('type="submit"');
    expect(payButtons(html).every((b) => b.includes('type="button"'))).toBe(true);
  });

  it("widget antigo da casa (sem intent, com Cancelar): sem <form>", () => {
    const html = render(React.createElement(CheckoutPaymentForm, { ...baseProps, onCancel: () => undefined }));
    expect(html).toContain('data-stripe-element="payment"');
    expect(html).not.toMatch(FORM);
    expect(html).not.toContain('type="submit"');
  });
});

describe("o pedido das casas parceiras não tem <form>", () => {
  it("campos e botão sem <form>; nome e email continuam obrigatórios", () => {
    const html = render(
      React.createElement(PartnerBookingPanel, {
        tripwixUid: "tw-1",
        propertyName: "Casa Parceira",
        propertySlug: "casa-parceira",
        fromPrice: 500,
        maxGuests: 8,
        whatsappUrl: "https://wa.me/351000000000",
      }),
    );
    expect(html).toContain('id="partner-home-request"');
    expect(html).not.toMatch(FORM);
    expect(html).not.toContain('type="submit"');
    expect(html).toMatch(/<input[^>]*type="text"[^>]*required/);
    expect(html).toMatch(/<input[^>]*type="email"[^>]*required/);
  });
});

describe("Enter num campo de texto continua a enviar (isImplicitSubmitKey)", () => {
  const el = (tagName: string, type?: string) => ({ tagName, type });
  it.each([
    ["input text", el("INPUT", "text"), true],
    ["input email", el("INPUT", "email"), true],
    ["input tel (telefone)", el("INPUT", "tel"), true],
    ["input sem tipo", el("INPUT", ""), true],
    ["textarea (muda de linha)", el("TEXTAREA"), false],
    ["botão (trata o seu Enter)", el("BUTTON", "button"), false],
    ["checkbox", el("INPUT", "checkbox"), false],
    ["radio", el("INPUT", "radio"), false],
    ["select", el("SELECT"), false],
    ["lista de países", el("UL"), false],
  ])("%s", (_name, target, expected) => {
    expect(isImplicitSubmitKey({ key: "Enter", target })).toBe(expected);
  });

  it("nem com outra tecla, nem a compor (IME), nem se outro handler já tratou o Enter", () => {
    const target = el("INPUT", "text");
    expect(isImplicitSubmitKey({ key: "a", target })).toBe(false);
    expect(isImplicitSubmitKey({ key: "Enter", isComposing: true, target })).toBe(false);
    expect(isImplicitSubmitKey({ key: "Enter", defaultPrevented: true, target })).toBe(false);
    expect(isImplicitSubmitKey({ key: "Enter", target: null })).toBe(false);
  });
});

/**
 * Inventário dos <form> do site, com o que cada um é. Os leads verdadeiros
 * ficam (contacto, newsletter, pedido sem disponibilidade) e, com eles, o
 * pedido de um serviço para o itinerário; têm um id "lead-…": é por ele (a
 * variável Form ID do GTM) que os acionadores 'Start Activity Form' e
 * 'Lead_Site' se restringem aos formulários certos. O resto não é lead e não
 * pode ter esse prefixo. Um <form> novo tem de entrar aqui, de propósito.
 *
 * pages/Owners.tsx tem um <form>, mas a página não tem rota (revisão do #181):
 * nenhum ficheiro a importa, não vai no bundle e /owners responde 301 para
 * /management/, a app dos proprietários (outro repositório, outro contentor
 * GTM). Fica sem id e fora das instruções do GTM.
 */
const FORMS_LEFT: Record<string, { ids: Array<string | null>; what: string }> = {
  "client/src/pages/Contact.tsx": { ids: ["lead-contact"], what: "lead: contacto e eventos (generate_lead, contact-form)" },
  "client/src/pages/Owners.tsx": { ids: [null], what: "sem rota: página antiga dos proprietários (nunca aparece; os pedidos entram pelo /management/)" },
  "client/src/components/layout/Footer.tsx": { ids: ["lead-newsletter"], what: "lead: newsletter (generate_lead, newsletter-footer)" },
  "client/src/pages/Homes.tsx": { ids: ["lead-availability"], what: "lead: pedido sem disponibilidade (generate_lead, search-no-availability)" },
  "client/src/components/itinerary/AddToItineraryModal.tsx": { ids: ["lead-experience"], what: "experiências: pedido de um serviço para o itinerário" },
  "client/src/components/marketing/HeroSearch.tsx": { ids: [null], what: "pesquisa da home (não é lead)" },
  "client/src/pages/booking/BalancePage.tsx": { ids: [null, null], what: "página do saldo: mensagem ao concierge e cartão novo (não são leads)" },
  "client/src/components/admin/AdminLayout.tsx": { ids: [null], what: "admin: palavra-passe" },
  "client/src/components/admin/FormDialog.tsx": { ids: [null], what: "admin: diálogos do CMS" },
};

/** Ficheiros do funil de reserva: nunca um <form>. */
const FUNNEL = [
  "client/src/components/booking/CheckoutPaymentForm.tsx",
  "client/src/components/booking/PartnerBookingPanel.tsx",
  "client/src/components/booking/BookingWidget.tsx",
  "client/src/components/booking/PayPalCheckoutButton.tsx",
  "client/src/components/booking/KlarnaCheckoutButton.tsx",
  "client/src/pages/checkout/CheckoutPage.tsx",
  "client/src/pages/checkout/PaymentPlanSelector.tsx",
];

/** O id de cada <form> do ficheiro, por ordem (null = sem id); comentários fora. */
function formsIn(file: string): Array<string | null> {
  const src = fs
    .readFileSync(path.join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  const tags = [...src.matchAll(/<form[\s>][^>]*>?/g)].map((m) => m[0].match(/\bid="([^"]+)"/)?.[1] ?? null);
  const created = (src.match(/createElement\(\s*["']form["']/g) ?? []).map(() => null);
  return [...tags, ...created];
}

/** Os <form> de cada ficheiro do cliente, como estão no código. */
function formsFound(): Record<string, Array<string | null>> {
  const found: Record<string, Array<string | null>> = {};
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(tsx|ts)$/.test(e.name)) {
        const ids = formsIn(rel);
        if (ids.length) found[rel] = ids;
      }
    }
  };
  walk("client/src");
  return found;
}

describe("os <form> que ficam no site", () => {
  it("o funil de reserva não tem nenhum", () => {
    expect(FUNNEL.filter((f) => formsIn(f).length > 0)).toEqual([]);
  });

  it("são exatamente os do inventário, e só os leads têm id lead-…", () => {
    const found = formsFound();
    expect(found).toEqual(Object.fromEntries(Object.entries(FORMS_LEFT).map(([f, v]) => [f, v.ids])));
    for (const [file, { ids, what }] of Object.entries(FORMS_LEFT)) {
      for (const id of ids) expect(id?.startsWith("lead-") ?? false, `${file} (${what})`).toBe(what.startsWith("lead") || what.startsWith("experiências"));
    }
  });

  /**
   * Revisão do #181 (R1): o inventário e as instruções do GTM davam
   * `lead-owners` (pages/Owners.tsx) como um lead do site, mas a página não
   * tem rota nem vai no bundle. Um id lead-… só vale num ficheiro que algum
   * outro importa (import ou lazy import), e o tracking-map só pode mandar o
   * Ricardo filtrar por ids que existem.
   */
  const LEAD_IDS = Object.values(FORMS_LEFT).flatMap((v) => v.ids).filter((id): id is string => !!id?.startsWith("lead-"));

  function importedModules(): Set<string> {
    const out = new Set<string>();
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { walk(rel); continue; }
        if (!/\.(tsx|ts)$/.test(e.name)) continue;
        const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
        for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g)) {
          const spec = m[1];
          const base = spec.startsWith("@/") ? `client/src/${spec.slice(2)}` : spec.startsWith(".") ? path.posix.join(path.posix.dirname(rel), spec) : null;
          if (base) out.add(path.posix.normalize(base).replace(/\.(tsx?|jsx?)$/, ""));
        }
      }
    };
    walk("client/src");
    return out;
  }

  it("cada <form> com id lead-… chega ao site: o ficheiro é importado (não é uma página sem rota)", () => {
    const imported = importedModules();
    const leadFiles = Object.entries(formsFound()).filter(([, ids]) => ids.some((id) => id?.startsWith("lead-"))).map(([f]) => f);
    expect(leadFiles.length).toBeGreaterThan(0);
    expect(leadFiles.filter((f) => !imported.has(f.replace(/\.tsx?$/, "")))).toEqual([]);
  });

  it("pages/Owners.tsx não tem rota: ninguém a importa e /owners vai para o /management/", () => {
    expect(importedModules().has("client/src/pages/Owners")).toBe(false);
    const app = fs.readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf8");
    expect(app).toMatch(/<Route path="\/owners" component=\{OwnersRedirect\} \/>/);
  });

  it("o tracking-map (§10) só fala de Form IDs que existem, também dentro das regex", () => {
    const doc = fs.readFileSync(path.join(ROOT, "docs/tracking-map.md"), "utf8");
    const s10 = doc.slice(doc.indexOf("## 10."));
    expect(s10.length).toBeGreaterThan(100);
    const literal = [...s10.matchAll(/\blead-[a-z]+(?:-[a-z]+)*/g)].map((m) => m[0]);
    const inRegex = [...s10.matchAll(/\^lead-\(([a-z|]+)\)\$/g)].flatMap((m) => m[1].split("|").map((x) => `lead-${x}`));
    expect(inRegex.length).toBeGreaterThan(0);
    const unknown = [...new Set([...literal, ...inRegex])].filter((id) => !LEAD_IDS.includes(id));
    expect(unknown).toEqual([]);
    // Lead_Site sem o acionador generate_lead: só os formulários que gravam um lead.
    expect(s10).toContain("`^lead-(contact|newsletter|availability)$`");
  });
});
