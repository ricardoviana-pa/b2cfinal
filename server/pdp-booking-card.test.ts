import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import postcss, { type Rule } from "postcss";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import {
  REVEAL_PAD, footerOnScreen, keepRevealed, revealOnFocus, revealScrollTop, whenFooterOnScreen,
} from "@/lib/bookingCardReveal";
import { isImplicitSubmitKey } from "@/lib/implicitSubmit";

/**
 * Cartão de reserva fixo da página da casa, no computador (verificação em
 * produção de 29 out 2026: Property W1, W3, W4 e Tripwix P3).
 *
 * - W1: o RESERVE era sticky dentro do painel que rolava, com ~640 px de
 *   conteúdo depois dele; com a roda por cima do cartão saía pelo topo em
 *   ecrãs até ~850 px de altura (e o RESERVE do cabeçalho não o trazia).
 * - W3: preso ao fundo, tapava a tarifa escolhida.
 * - W4: o banner dos cookies (z-60) tapava as marcas e "ainda não é cobrado".
 * - P3: nas casas parceiras, o "Pedir estas datas" tapava "Algumas destas
 *   noites já estão ocupadas" a 1280x720.
 *
 * Agora o cartão tem duas partes: a de cima rola, o rodapé (RESERVE, marcas,
 * nota) nunca rola e nada passa por baixo dele; quando chega a cotação, muda a
 * tarifa, aparece um aviso ou o RESERVE recebe o foco do teclado, o cartão
 * rola por dentro até isso ficar à vista junto do RESERVE
 * (lib/bookingCardReveal.ts).
 *
 * Revisão do PR #179 (29 out 2026):
 * - PDP-STICKY-KBD-1: com o RESERVE num portal no fim do cartão, o Tab e o
 *   leitor de ecrã chegavam a ele depois de "Alterar datas", do concierge, da
 *   garantia e do anfitrião (6 Tabs desde a tarifa em vez de 2) e, no foco, a
 *   tarifa já tinha saído de vista. O rodapé fica agora no HTML logo a seguir
 *   às tarifas (ou aos campos do pedido) e é o CSS que o prende ao fundo.
 * - R1: o widget voltou a ser um contentor que o foco rolava (overflow
 *   hidden): abrir a lista dos indicativos fazia saltar o formulário ~50 px.
 *   overflow: clip outra vez, e a lista abre para cima dentro do cartão.
 * - O botão das casas parceiras não depende de <form> (o PR #181 tirou-o):
 *   type="button", envia pelo onClick com a verificação dos obrigatórios, e
 *   Enter num campo de texto continua a enviar.
 */

// O site compila JSX com o runtime automático; o vitest usa o clássico do tsconfig.
(globalThis as any).React = React;

const q = vi.hoisted(() => ({ quote: { data: undefined as unknown, isFetching: false, isError: false } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    booking: {
      partnerCalendar: { useQuery: () => ({ data: undefined, isLoading: false, isError: false, refetch: async () => ({}) }) },
      partnerQuote: { useQuery: () => q.quote },
    },
    leads: { create: { useMutation: () => ({ mutateAsync: async () => ({}), isPending: false }) } },
  },
}));

import { PartnerBookingPanel } from "../client/src/components/booking/PartnerBookingPanel";
import { BookingCardSlotContext, ReserveCtaSlot } from "../client/src/components/booking/bookingCardSlot";

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const en = JSON.parse(read("client/src/i18n/locales/en.json"));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T10:00:00Z"));
  await i18next.use(initReactI18next).init({
    lng: "en", resources: { en: { translation: en } }, interpolation: { escapeValue: false }, showSupportNotice: false,
  } as any);
});
afterAll(() => { vi.useRealTimers(); });

type Decls = Record<string, string>;
/** Uma regra de index.css: o seletor, as declarações e os @layer/@media à volta. */
interface CssRule { selector: string; decls: Decls; layer: string | null; desktop: boolean }
function cssRules(): CssRule[] {
  const out: CssRule[] = [];
  postcss.parse(read("client/src/index.css")).walkRules((rule: Rule) => {
    const decls: Decls = {};
    rule.walkDecls((d) => { decls[d.prop] = d.value; });
    let layer: string | null = null;
    let desktop = false;
    for (let p = rule.parent; p && p.type !== "root"; p = p.parent as typeof p) {
      if (p.type === "atrule" && (p as any).name === "layer" && layer === null) layer = (p as any).params;
      if (p.type === "atrule" && (p as any).name === "media" && /min-width:\s*1024px/.test((p as any).params)) desktop = true;
    }
    out.push({ selector: rule.selector, decls, layer, desktop });
  });
  return out;
}
/** A regra de computador (min-width: 1024px) com este seletor. */
function desktopRule(selector: string): CssRule | undefined {
  return cssRules().find((r) => r.desktop && r.selector === selector);
}

describe("o cartão do computador: o RESERVE num rodapé que não rola (W1, W4)", () => {
  it("o cartão tem a altura do ecrã menos o banner dos cookies, guarda em baixo a altura do rodapé e já não rola ele próprio", () => {
    const card = desktopRule(".property-sticky-card");
    expect(card).toBeDefined();
    expect(card!.decls["max-height"]).toBe("calc(100vh - 116px - var(--cookie-banner-h, 0px))");
    expect(card!.decls.display).toBe("flex");
    expect(card!.decls["flex-direction"]).toBe("column");
    expect(card!.decls["padding-bottom"]).toBe("var(--pa-booking-footer-h, 0px)");
    expect(card!.decls["overflow-y"]).toBeUndefined();
    expect(card!.decls.overflow).toBeUndefined();
    // o banner publica a altura nesta variável (0px quando fecha)
    expect(read("client/src/components/layout/CookieBanner.tsx")).toMatch(/setProperty\('--cookie-banner-h', `\$\{el\.offsetHeight\}px`\)/);
    // e o rodapé publica a sua no cartão (ReserveCtaSlot)
    expect(read("client/src/components/booking/bookingCardSlot.tsx")).toMatch(/BOOKING_FOOTER_HEIGHT_VAR = '--pa-booking-footer-h'/);
  });

  it("só a parte de cima rola; o rodapé fica preso ao fundo do cartão, fora dela, sem as margens do space-y", () => {
    expect(desktopRule(".property-sticky-card > .pa-booking-scroll")?.decls).toMatchObject({ "overflow-y": "auto", "min-height": "0", flex: "0 1 auto" });
    const footer = desktopRule(".property-sticky-card .pa-booking-footer");
    expect(footer?.decls).toMatchObject({ position: "absolute", left: "0", right: "0", bottom: "0", margin: "0" });
    // em utilities, para ganhar à margem que o space-y-3 do widget põe nos filhos
    expect(footer?.layer).toBe("utilities");
    // e nada entre o rodapé e o cartão é posicionado: o cartão (sticky) é o seu bloco de contenção
    expect(desktopRule(".property-sticky-card > .pa-booking-scroll")?.decls.position).toBeUndefined();
    expect(cssRules().some((r) => r.desktop && /\.booking-widget/.test(r.selector) && r.decls.position)).toBe(false);
  });

  it("o rodapé publica a sua altura em <html> enquanto está no cartão, e tira-a quando sai", () => {
    const slot = read("client/src/components/booking/bookingCardSlot.tsx");
    expect(slot).toMatch(/const root = document\.documentElement;\s*const publish = \(\) => root\.style\.setProperty\(BOOKING_FOOTER_HEIGHT_VAR, `\$\{footer\.getBoundingClientRect\(\)\.height\}px`\);/);
    expect(slot).toMatch(/root\.style\.removeProperty\(BOOKING_FOOTER_HEIGHT_VAR\);/);
  });

  it("nenhuma regra volta a prender o RESERVE com sticky dentro do que rola", () => {
    for (const { selector, decls } of cssRules()) {
      if (selector.includes("pa-reserve-cta") || selector.includes("pa-booking-footer")) {
        expect(decls.position, selector).not.toBe("sticky");
      }
    }
  });

  it("a página tem o cartão e a parte que rola; o rodapé não é um elemento da página (é o do widget); a gaveta do telemóvel fica igual", () => {
    const page = read("client/src/pages/PropertyDetail.tsx");
    const aside = page.slice(page.indexOf('<aside id="property-booking"'), page.indexOf("</aside>"));
    expect(aside).toMatch(
      /<div ref=\{setBookingCardEl\} className="property-sticky-card[^"]*">\s*<div ref=\{setBookingScroller\} className="pa-booking-scroll">\s*<BookingCardSlotContext\.Provider value=\{bookingCardSlot\}>\s*\{desktopBooking && bookingPanel\}\s*<\/BookingCardSlotContext\.Provider>\s*<\/div>\s*<\/div>/,
    );
    expect(page).not.toMatch(/pa-booking-footer/);
    expect(page).toMatch(/bookingCardEl && bookingScroller \? \{ card: bookingCardEl, scroller: bookingScroller \} : null/);
    // só o cartão do computador tem rodapé: a gaveta continua sem ele
    const drawer = page.slice(page.indexOf("<Drawer open={bookingOpen}"), page.indexOf("</Drawer>"));
    expect(drawer).toMatch(/\{!desktopBooking && bookingPanel\}/);
    expect(drawer).not.toMatch(/BookingCardSlotContext/);
    expect(page.match(/BookingCardSlotContext\.Provider/g)).toHaveLength(2);
  });
});

describe("Tab e leitor de ecrã: o RESERVE logo a seguir às tarifas (revisão do PR #179, PDP-STICKY-KBD-1)", () => {
  it("o RESERVE nunca sai do sítio no HTML: sem portal", () => {
    const slot = read("client/src/components/booking/bookingCardSlot.tsx");
    expect(slot).not.toMatch(/createPortal/);
  });

  it("no cartão, o rodapé envolve o bloco no sítio dele; fora do cartão (gaveta, servidor) fica tal e qual", () => {
    const fake = { card: {} as HTMLElement, scroller: {} as HTMLElement };
    const cta = React.createElement("button", { type: "button" }, "Reserve");
    const inCard = renderToStaticMarkup(
      React.createElement("div", null,
        React.createElement("span", null, "tarifas"),
        React.createElement(BookingCardSlotContext.Provider, { value: fake }, React.createElement(ReserveCtaSlot, null, cta)),
        React.createElement("a", { href: "#" }, "Alterar datas")),
    );
    expect(inCard).toMatch(/^<div><span>tarifas<\/span><div class="pa-booking-footer[^"]*"><button type="button">Reserve<\/button><\/div><a href="#">Alterar datas<\/a><\/div>$/);
    const outside = renderToStaticMarkup(React.createElement("div", null, React.createElement(ReserveCtaSlot, null, cta)));
    expect(outside).toBe('<div><button type="button">Reserve</button></div>');
  });

  it("widget: entre as tarifas e o RESERVE não há nada que receba o foco; o resto (Alterar datas, concierge) vem depois", () => {
    const widget = read("client/src/components/booking/BookingWidget.tsx");
    const plans = widget.indexOf("<div ref={ratePlansRef}");
    const plansEnd = widget.indexOf("})()}", plans);
    const open = widget.indexOf("<ReserveCtaSlot footerRef={reserveFooterRef}>");
    const block = widget.indexOf('<div className="pa-reserve-cta bg-white space-y-2.5">');
    const note = widget.indexOf('<PaymentMethodsNote align="center" total={effectiveQuote?.total} />');
    const err = widget.indexOf("{beQuoteError}");
    const close = widget.indexOf("</ReserveCtaSlot>");
    const changeDates = widget.indexOf('{t("bookingWidget.changeDates")}', close);
    const concierge = widget.indexOf('t("property.needHelpConcierge"', close);
    expect(plans).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(-1);
    const order = [plans, plansEnd, open, block, note, err, close, changeDates, concierge];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(widget.indexOf("<ReserveCtaSlot", open + 1)).toBe(-1);
    // só os serviços do fluxo antigo (sem checkout v2) podem ficar entre os dois
    const between = widget.slice(plansEnd, open).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(between).not.toMatch(/<(button|a|input|select|textarea|Link)\b/);
    expect(between.replace(/\s+/g, " ")).toMatch(/^\}\)\(\)\} \{!checkoutV2Active && upsellItems\.length > 0 && \( <EnhanceYourStay[^]*?\/> \)\} $/);
  });
});

/** Casa de Caiz em produção (29 out): noites 21 e 22 de junho de 2027 ocupadas. */
const CAIZ_QUOTE = {
  available: false, nights: 4,
  perNight: [
    { date: "2027-06-19", price: 912.66, status: "available" }, { date: "2027-06-20", price: 912.66, status: "available" },
    { date: "2027-06-21", price: 912.66, status: "booked" }, { date: "2027-06-22", price: 912.66, status: "booked" },
  ],
  accommodation: 3650.64, cleaningFee: 0, securityDeposit: 0, total: 3650.64, feesKnown: false,
  unavailable: ["2027-06-21", "2027-06-22"], currency: "EUR", source: "cached",
};

function partnerPanel(slot: { card: HTMLElement; scroller: HTMLElement } | null) {
  q.quote = { data: CAIZ_QUOTE, isFetching: false, isError: false };
  const panel = React.createElement(PartnerBookingPanel, {
    tripwixUid: "71776293-1e7f-4eb9-bd2c-d9733621716f", propertyName: "Casa de Caiz", propertySlug: "casa-de-caiz",
    fromPrice: 795, maxGuests: 10, minNights: 1, initialCheckIn: "2027-06-19", initialCheckOut: "2027-06-23", initialGuests: 2,
    whatsappUrl: "https://wa.me/000",
  });
  return renderToStaticMarkup(slot ? React.createElement(BookingCardSlotContext.Provider, { value: slot }, panel) : panel);
}
/** O que recebe o foco, pela ordem do HTML (a do Tab e do leitor de ecrã). */
function tabStops(html: string): string[] {
  return [...html.matchAll(/<(a|button|input|textarea|select)\b([^>]*)>/g)]
    .filter((m) => !/\bdisabled=""/.test(m[2]) && !/tabindex="-1"/.test(m[2]))
    .map((m) => {
      const attr = (name: string) => m[2].match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
      if (m[1] === "a") return `a:${attr("href")}`;
      if (m[1] === "button") return `button:${attr("aria-label") ?? attr("class")?.split(" ").find((c) => c.startsWith("pa-reserve-cta") || c.startsWith("react-international")) ?? "?"}`;
      return `${m[1]}:${attr("type") ?? ""}:${attr("placeholder") ?? ""}`;
    });
}

describe("casas parceiras: o pedido, renderizado, no cartão do computador", () => {
  it("o botão fica no HTML logo a seguir aos campos, dentro do rodapé, e o concierge depois dele (KBD-1)", () => {
    const html = partnerPanel({ card: {} as HTMLElement, scroller: {} as HTMLElement });
    const footer = html.match(/<div class="pa-booking-footer[^"]*">([\s\S]*?)<\/div><a /)?.[1] ?? "";
    expect(footer).toContain(en.partnerBooking.submit);
    expect(footer).toContain(en.partnerBooking.noCharge);
    const stops = tabStops(html);
    const message = stops.indexOf(`textarea::${en.partnerBooking.message}`);
    const request = stops.indexOf("button:pa-reserve-cta");
    expect(message).toBeGreaterThan(-1);
    expect(request).toBe(message + 1);
    expect(stops[request + 1]).toBe("a:https://wa.me/000");
    // os campos vêm antes, pela ordem de sempre
    expect(stops.slice(message - 4, message)).toEqual([
      `input:text:${en.partnerBooking.name}`, `input:email:${en.partnerBooking.email}`,
      "button:Country selector", `input:tel:${en.partnerBooking.phone}`,
    ]);
    // sem tabindex positivos a forçar a ordem
    expect(html).not.toMatch(/tabindex="[1-9]/);
  });

  it("o botão não depende de <form>: type=\"button\", sem atributo form, sem <form> à volta (PR #181)", () => {
    for (const slot of [{ card: {} as HTMLElement, scroller: {} as HTMLElement }, null]) {
      const html = partnerPanel(slot);
      const button = html.match(/<button[^>]*class="[^"]*pa-reserve-cta[^"]*"[^>]*>/)?.[0] ?? "";
      expect(button).toContain('type="button"');
      expect(button).not.toMatch(/\sform="/);
      expect(html).not.toContain('type="submit"');
      expect(html).not.toMatch(/<form[\s>]/);
      // nome e email continuam obrigatórios
      expect(html).toMatch(/<input[^>]*type="text"[^>]*required/);
      expect(html).toMatch(/<input[^>]*type="email"[^>]*required/);
    }
  });

  it("fora do cartão (gaveta do telemóvel) o botão fica no mesmo sítio, sem rodapé", () => {
    const html = partnerPanel(null);
    expect(html).not.toContain("pa-booking-footer");
    const stops = tabStops(html);
    expect(stops.indexOf("button:pa-reserve-cta")).toBe(stops.indexOf(`textarea::${en.partnerBooking.message}`) + 1);
  });

  it("o aviso das noites ocupadas está marcado para ficar à vista junto do botão (P3)", () => {
    const html = partnerPanel({ card: {} as HTMLElement, scroller: {} as HTMLElement });
    expect(html).toMatch(new RegExp(`<div data-booking-notice=""[^>]*>[\\s\\S]*?${en.partnerBooking.someUnavailable.slice(0, 30)}`));
  });

  it("envia pelo onClick com a verificação dos obrigatórios; Enter num campo de texto continua a enviar; o aviso observa o painel", () => {
    const src = read("client/src/components/booking/PartnerBookingPanel.tsx");
    const button = src.slice(src.indexOf("<button", src.indexOf("<ReserveCtaSlot footerRef={requestFooterRef}>")));
    expect(button).toMatch(/^<button\s+type="button"\s+onClick=\{submit\}/);
    expect(src).not.toMatch(/form=\{/);
    // a mesma verificação que o <form> fazia: a mensagem do browser no 1.º obrigatório em falta
    const submit = src.slice(src.indexOf("async function submit("), src.indexOf("submitting.current = true;"));
    expect(submit).toMatch(/for \(const field of \[nameRef\.current, emailRef\.current\]\) \{\s*if \(field && !field\.reportValidity\(\)\) return;\s*\}/);
    expect(src).toMatch(/if \(!isImplicitSubmitKey\(\{[^}]*\}\)\) return;\s*e\.preventDefault\(\);\s*void submit\(\);/);
    expect(src).not.toMatch(/formRef/);
    expect(src).toMatch(/<div ref=\{panelRef\} className="booking-widget /);
    expect(src).toMatch(/watch: \[panel\]/);
    // Enter: campos de texto sim; área de texto, botões e a lista de países não
    const el = (tagName: string, type?: string) => ({ tagName, type });
    expect(isImplicitSubmitKey({ key: "Enter", target: el("INPUT", "text") })).toBe(true);
    expect(isImplicitSubmitKey({ key: "Enter", target: el("INPUT", "email") })).toBe(true);
    expect(isImplicitSubmitKey({ key: "Enter", target: el("INPUT", "tel") })).toBe(true);
    expect(isImplicitSubmitKey({ key: "Enter", target: el("TEXTAREA") })).toBe(false);
    expect(isImplicitSubmitKey({ key: "Enter", target: el("BUTTON", "button") })).toBe(false);
    expect(isImplicitSubmitKey({ key: "Enter", target: el("UL") })).toBe(false);
    expect(isImplicitSubmitKey({ key: "Enter", isComposing: true, target: el("INPUT", "text") })).toBe(false);
  });
});

/**
 * O "voltar ao topo" (App.tsx) fixo a 5rem + 56px do fundo, à direita. Até
 * ~1300 px de largura cai sobre a ponta direita do cartão; com o rodapé mais
 * alto (marcas de pagamento em duas linhas, com a Klarna) tapava o RESERVE,
 * com ou sem o banner dos cookies, mesmo com o PR #178 (revisão do PR #179,
 * BTT-1 / R2). Alturas do rodapé medidas no build local: Carcavelos 125,5 px,
 * Alvarinho (pt, 1024 px, Klarna) 149,5 px, Casa de Caiz 117,5 px; com o erro
 * do envio, ~180 px.
 */
describe("o voltar ao topo fica acima do rodapé do RESERVE (BTT-1 / R2)", () => {
  const rem = 16;
  /** O translate do [data-back-to-top] (index.css), em px, para um rodapé desta altura. */
  function lift(footerH: number): number {
    const rule = desktopRule("[data-back-to-top]");
    expect(rule, "regra [data-back-to-top] no computador").toBeDefined();
    const value = rule!.decls.translate.trim();
    const x = value.slice(0, value.indexOf(" "));
    const y = value.slice(value.indexOf(" ") + 1);
    expect(x).toBe("0");
    const js = y
      .replace("var(--pa-booking-footer-h, 0px)", `${footerH}px`)
      .replace(/(\d+(?:\.\d+)?)rem/g, (_m, n) => `${Number(n) * rem}px`)
      .replace(/(-?\d+(?:\.\d+)?)px/g, "$1")
      .replace(/calc\(/g, "(")
      .replace(/max\(/g, "Math.max(");
    return -Function(`return ${js};`)();
  }
  // O que o App.tsx diz do botão: 5rem + 56px acima do fundo, 40 px de altura.
  const app = read("client/src/App.tsx");
  const backToTop = app.slice(app.indexOf("function BackToTop()"), app.indexOf("function OfflineBanner()"));
  const BTT_BOTTOM = 5 * rem + 56;
  /** Folga entre o fundo do botão e o topo do rodapé (px), com o cartão fixo. */
  const clearance = (footerH: number, banner = 0, bannerLift = 0) => {
    const cardBottomFromScreenBottom = 116 - 100 + banner; // max-height calc(100vh - 116px - banner), top 100px
    const footerTop = cardBottomFromScreenBottom + footerH;
    const buttonBottom = BTT_BOTTOM + bannerLift + lift(footerH);
    return buttonBottom - footerTop;
  };

  it("o botão tem o gancho e a posição que o CSS supõe", () => {
    expect(backToTop).toMatch(/data-back-to-top=""/);
    // O `bottom` vive em index.css (.back-to-top; verificação final de 29 out,
    // P6: a 640–1023 px sobe 8 px): no computador vale a regra base, 5rem + 56px.
    expect(backToTop).not.toMatch(/bottom:/);
    const base = cssRules().find((r) => r.selector === ".back-to-top" && r.decls.bottom);
    expect(base?.decls.bottom).toBe("calc(5rem + 56px + env(safe-area-inset-bottom, 0px))");
    expect(base?.layer).toBe("utilities");
  });

  it("sem o banner: o fundo do botão fica pelo menos 8 px acima do rodapé, com uma ou duas linhas de marcas", () => {
    for (const h of [117.5, 125.5, 149.5, 180]) expect(clearance(h), `rodapé de ${h} px`).toBeGreaterThanOrEqual(8);
  });

  it("com o banner aberto e o botão subido por ele (PR #178: a altura do banner menos 1 px), também", () => {
    for (const h of [117.5, 125.5, 149.5, 180]) expect(clearance(h, 77, 76), `rodapé de ${h} px`).toBeGreaterThanOrEqual(8);
  });

  it("fora da página da casa (sem rodapé) o botão fica onde estava", () => {
    expect(lift(0)).toBe(0);
  });
});

describe("a lista dos indicativos do telefone no cartão (revisão do PR #179, R1)", () => {
  it("o widget recorta (clip) em vez de esconder (hidden): não é um contentor que o foco faça rolar", () => {
    const rule = desktopRule(".property-sticky-card .booking-widget");
    expect(rule?.decls.overflow).toBe("clip");
    // em utilities, para ganhar ao overflow-hidden do widget
    expect(rule?.layer).toBe("utilities");
  });

  it("abre para cima dentro do cartão: por baixo do campo o rodapé deixa pouco espaço", () => {
    expect(desktopRule(".property-sticky-card")?.decls["--react-international-phone-dropdown-top"]).toBe("-204px");
    // -204px = a lista (200 px no máximo, PhoneInput) mais 4 px de ar por cima do campo
    expect(read("client/src/components/booking/PhoneInput.tsx")).toMatch(/!max-h-\[200px\]/);
    // a biblioteca lê a variável para o top da lista (o valor por omissão abre para baixo)
    const lib = fs.readFileSync(new URL("../node_modules/react-international-phone/dist/index.css", import.meta.url), "utf8");
    expect(lib).toMatch(/\.react-international-phone-country-selector-dropdown\{position:absolute;[^}]*top:var\(--react-international-phone-dropdown-top, 44px\)/);
  });
});

describe("a tarifa escolhida e os avisos à vista junto do RESERVE (W3, P3)", () => {
  // 1366x768 com a cotação da Stars View (produção, 29 out): cartão 100–752,
  // rodapé de ~126 px → a parte que rola mostra 100–626; a tarifa escolhida
  // (Não reembolsável) estava em 743–873, 0 px à vista.
  const view = { viewTop: 100, viewBottom: 626, maxScrollTop: 1200 };

  it("rola o cartão o mínimo para a tarifa escolhida ficar inteira, com folga, por cima do RESERVE", () => {
    const next = revealScrollTop({ ...view, scrollTop: 0, top: 743.4, bottom: 873.4 });
    expect(next).toBe(260);
    expect(873.4 - next).toBeLessThanOrEqual(view.viewBottom - REVEAL_PAD);
    expect(743.4 - next).toBeGreaterThanOrEqual(view.viewTop + REVEAL_PAD);
  });

  it("as duas tarifas cabem: a lista inteira fica à vista, a escolhida incluída", () => {
    // da tarifa escolhida (a 1.ª) ao fim da lista (a 2.ª)
    const next = revealScrollTop({ ...view, scrollTop: 0, top: 612, bottom: 873.4 });
    expect(612 - next).toBeGreaterThanOrEqual(view.viewTop);
    expect(873.4 - next).toBeLessThanOrEqual(view.viewBottom - REVEAL_PAD);
  });

  it("já à vista: não mexe", () => {
    expect(revealScrollTop({ ...view, scrollTop: 140, top: 300, bottom: 430 })).toBe(140);
  });

  it("acima da área visível (o hóspede rolou até ao fim): sobe o mínimo", () => {
    expect(revealScrollTop({ ...view, scrollTop: 600, top: 40, bottom: 170 })).toBe(600 - (100 + REVEAL_PAD - 40));
  });

  it("maior do que a área visível: guarda o topo (tarifa) ou o fundo (aviso, total)", () => {
    const tall = { ...view, scrollTop: 0, top: 200, bottom: 1000 };
    expect(revealScrollTop({ ...tall, anchor: "start" })).toBe(200 - (100 + REVEAL_PAD));
    expect(revealScrollTop({ ...tall, anchor: "end" })).toBe(1000 - (626 - REVEAL_PAD));
  });

  it("nunca sai de 0..máximo", () => {
    expect(revealScrollTop({ ...view, scrollTop: 0, top: 2000, bottom: 2100 })).toBe(1200);
    expect(revealScrollTop({ ...view, scrollTop: 20, top: -500, bottom: -400 })).toBe(0);
  });

  it("casa parceira a 1280x720: o aviso das noites ocupadas (631–690) passa a ficar inteiro por cima do botão", () => {
    // cartão 100–704, rodapé de ~118 px → a parte que rola mostra 100–586
    const next = revealScrollTop({ viewTop: 100, viewBottom: 586, maxScrollTop: 900, scrollTop: 0, top: 630.6, bottom: 689.6, anchor: "end" });
    expect(689.6 - next).toBeLessThanOrEqual(586 - REVEAL_PAD);
    expect(630.6 - next).toBeGreaterThanOrEqual(100);
  });

  it("no topo da página o RESERVE está abaixo da dobra: o cartão espera (continua a abrir no preço)", () => {
    // 1366x768, scrollY 0: cartão a partir de 524, rodapé em 1050–1176
    expect(footerOnScreen({ top: 1050, bottom: 1176, height: 126 }, 768)).toBe(false);
    // cartão fixo: rodapé em 626–752
    expect(footerOnScreen({ top: 626, bottom: 752, height: 126 }, 768)).toBe(true);
    // sem RESERVE (rodapé vazio, escondido): nada por que esperar
    expect(footerOnScreen({ top: 0, bottom: 0, height: 0 }, 768)).toBe(true);
    // sem rodapé de todo (sem preço): também não
    expect(whenFooterOnScreen(() => null)()).toBe(true);
  });
});

/** Um contentor que rola, falso: o suficiente para keepRevealed (sem DOM no vitest). */
function fakeScroller() {
  const listeners = new Map<string, Set<(e: Event) => void>>();
  return {
    scrollTop: 0, scrollHeight: 1800, clientHeight: 526, clientTop: 0, isConnected: true,
    getBoundingClientRect: () => ({ top: 100, bottom: 626, height: 526 }),
    scrollTo({ top }: { top: number }) { this.scrollTop = top; },
    addEventListener(name: string, fn: (e: Event) => void) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); },
    removeEventListener(name: string, fn: (e: Event) => void) { listeners.get(name)?.delete(fn); },
    fire(name: string, e: Partial<Event> = {}) { for (const fn of listeners.get(name) ?? []) fn(e as Event); },
    count(name: string) { return listeners.get(name)?.size ?? 0; },
  };
}

describe("o RESERVE recebe o foco do teclado: a tarifa (ou o aviso) volta à vista (KBD-1)", () => {
  // a tarifa escolhida a 743–873 com o cartão no topo (scrollTop 0)
  const planAt = (s: { scrollTop: number }) => ({ top: 743.4 - s.scrollTop, bottom: 873.4 - s.scrollTop });

  it("só pelo teclado (:focus-visible); um clique não mexe", () => {
    const el = (focusVisible: boolean) => ({ matches: (sel: string) => sel === ":focus-visible" && focusVisible });
    expect(revealOnFocus(el(true) as unknown as EventTarget)).toBe(true);
    expect(revealOnFocus(el(false) as unknown as EventTarget)).toBe(false);
    expect(revealOnFocus(null)).toBe(false);
    // browser sem :focus-visible: conta como teclado
    expect(revealOnFocus({ matches: () => { throw new SyntaxError("x"); } } as unknown as EventTarget)).toBe(true);
  });

  it("depois de o hóspede rolar o cartão, o Tab até ao RESERVE traz a tarifa de volta; o clique não", () => {
    const scroller = fakeScroller();
    const footer = fakeScroller();
    const stop = keepRevealed(scroller as unknown as HTMLElement, () => planAt(scroller), { focusWithin: footer as unknown as Element });
    expect(scroller.scrollTop).toBe(260); // a cotação chegou: a tarifa à vista
    // o hóspede usa a roda e lê o anfitrião no fim do cartão
    scroller.fire("wheel");
    scroller.scrollTop = 1274;
    // um clique no RESERVE (foco sem :focus-visible): nada
    footer.fire("focusin", { target: { matches: () => false } as unknown as EventTarget });
    expect(scroller.scrollTop).toBe(1274);
    // Tab / Shift+Tab até ao RESERVE: a tarifa volta, inteira, por cima dele
    footer.fire("focusin", { target: { matches: (s: string) => s === ":focus-visible" } as unknown as EventTarget });
    const plan = planAt(scroller);
    expect(plan.top).toBeGreaterThanOrEqual(100 + REVEAL_PAD);
    expect(plan.bottom).toBeLessThanOrEqual(626 - REVEAL_PAD);
    stop();
    expect(footer.count("focusin")).toBe(0);
    expect(scroller.count("wheel")).toBe(0);
  });

  it("com o RESERVE fora do ecrã (topo da página) o foco não mexe no cartão", () => {
    const scroller = fakeScroller();
    const footer = fakeScroller();
    (globalThis as any).window = { addEventListener() {}, removeEventListener() {} };
    let onScreen = false;
    const stop = keepRevealed(scroller as unknown as HTMLElement, () => planAt(scroller), { focusWithin: footer as unknown as Element, ready: () => onScreen });
    expect(scroller.scrollTop).toBe(0);
    footer.fire("focusin", { target: { matches: (s: string) => s === ":focus-visible" } as unknown as EventTarget });
    expect(scroller.scrollTop).toBe(0);
    onScreen = true;
    footer.fire("focusin", { target: { matches: (s: string) => s === ":focus-visible" } as unknown as EventTarget });
    expect(scroller.scrollTop).toBe(260);
    stop();
    delete (globalThis as any).window;
  });
});
