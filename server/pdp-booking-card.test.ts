import { describe, expect, it } from "vitest";
import fs from "node:fs";
import postcss from "postcss";
import { REVEAL_PAD, footerOnScreen, revealScrollTop } from "@/lib/bookingCardReveal";

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
 * tarifa ou aparece um aviso, o cartão rola por dentro até isso ficar à vista
 * junto do RESERVE (lib/bookingCardReveal.ts).
 */

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

type Decls = Record<string, string>;
/** Regras de index.css dentro de @media (min-width: 1024px): seletor → declarações. */
function desktopRules(): Map<string, Decls> {
  const out = new Map<string, Decls>();
  postcss.parse(read("client/src/index.css")).walkAtRules("media", (at) => {
    if (!/min-width:\s*1024px/.test(at.params)) return;
    at.walkRules((rule) => {
      const decls = out.get(rule.selector) ?? {};
      rule.walkDecls((d) => { decls[d.prop] = d.value; });
      out.set(rule.selector, decls);
    });
  });
  return out;
}
/** Todas as regras de index.css (qualquer media), para procurar o que não pode voltar. */
function everyRule(): { selector: string; decls: Decls }[] {
  const out: { selector: string; decls: Decls }[] = [];
  postcss.parse(read("client/src/index.css")).walkRules((rule) => {
    const decls: Decls = {};
    rule.walkDecls((d) => { decls[d.prop] = d.value; });
    out.push({ selector: rule.selector, decls });
  });
  return out;
}

describe("o cartão do computador: o RESERVE num rodapé que não rola (W1, W4)", () => {
  const rules = desktopRules();

  it("o cartão tem a altura do ecrã menos o banner dos cookies e já não rola ele próprio", () => {
    const card = rules.get(".property-sticky-card");
    expect(card).toBeDefined();
    expect(card!["max-height"]).toBe("calc(100vh - 116px - var(--cookie-banner-h, 0px))");
    expect(card!.display).toBe("flex");
    expect(card!["flex-direction"]).toBe("column");
    expect(card!["overflow-y"]).toBeUndefined();
    expect(card!.overflow).toBeUndefined();
    // o banner publica a altura nesta variável (0px quando fecha)
    expect(read("client/src/components/layout/CookieBanner.tsx")).toMatch(/setProperty\('--cookie-banner-h', `\$\{el\.offsetHeight\}px`\)/);
  });

  it("só a parte de cima rola; o rodapé não encolhe e, vazio, desaparece", () => {
    const scroller = rules.get(".property-sticky-card > .pa-booking-scroll");
    expect(scroller).toMatchObject({ "overflow-y": "auto", "min-height": "0", flex: "0 1 auto" });
    expect(rules.get(".property-sticky-card > .pa-booking-footer")).toMatchObject({ flex: "none" });
    expect(rules.get(".property-sticky-card > .pa-booking-footer:empty")).toMatchObject({ display: "none" });
  });

  it("nenhuma regra volta a prender o RESERVE com sticky dentro do que rola", () => {
    for (const { selector, decls } of everyRule()) {
      if (selector.includes("pa-reserve-cta") || selector.includes("pa-booking-footer")) {
        expect(decls.position, selector).not.toBe("sticky");
      }
    }
    // o overflow: clip do widget só existia para esse sticky
    expect(everyRule().some((r) => r.selector.includes(".property-sticky-card .booking-widget"))).toBe(false);
  });

  it("a página põe o rodapé a seguir à parte que rola, dentro do cartão fixo; a gaveta do telemóvel fica igual", () => {
    const page = read("client/src/pages/PropertyDetail.tsx");
    const aside = page.slice(page.indexOf('<aside id="property-booking"'), page.indexOf("</aside>"));
    expect(aside).toMatch(
      /<div className="property-sticky-card[^"]*">\s*<div ref=\{setBookingScroller\} className="pa-booking-scroll">\s*<BookingCardSlotContext\.Provider value=\{bookingCardSlot\}>\s*\{desktopBooking && bookingPanel\}\s*<\/BookingCardSlotContext\.Provider>\s*<\/div>\s*<div ref=\{setBookingFooter\} className="pa-booking-footer[^"]*" \/>\s*<\/div>/,
    );
    // só o cartão do computador tem rodapé: a gaveta continua sem ele
    const drawer = page.slice(page.indexOf("<Drawer open={bookingOpen}"), page.indexOf("</Drawer>"));
    expect(drawer).toMatch(/\{!desktopBooking && bookingPanel\}/);
    expect(drawer).not.toMatch(/BookingCardSlotContext/);
    expect(page.match(/BookingCardSlotContext\.Provider/g)).toHaveLength(2);
  });

  it("o widget manda para o rodapé o RESERVE, as marcas, a nota e o erro da cotação; o resto continua a rolar", () => {
    const widget = read("client/src/components/booking/BookingWidget.tsx");
    const open = widget.indexOf("<ReserveCtaSlot>");
    const block = widget.indexOf('<div className="pa-reserve-cta bg-white space-y-2.5">');
    const note = widget.indexOf('<PaymentMethodsNote align="center" total={effectiveQuote?.total} />');
    const err = widget.indexOf("{beQuoteError}");
    const close = widget.indexOf("</ReserveCtaSlot>");
    const changeDates = widget.indexOf('{t("bookingWidget.changeDates")}', close);
    expect(open).toBeGreaterThan(-1);
    expect([open, block, note, err, close, changeDates]).toEqual([...[open, block, note, err, close, changeDates]].sort((a, b) => a - b));
    expect(widget.indexOf("<ReserveCtaSlot>", open + 1)).toBe(-1);
  });

  it("nas casas parceiras vão para o rodapé o botão (ligado ao formulário), o erro do envio e a nota; o aviso das noites ocupadas fica por cima", () => {
    const panel = read("client/src/components/booking/PartnerBookingPanel.tsx");
    const open = panel.indexOf("<ReserveCtaSlot>");
    const close = panel.indexOf("</ReserveCtaSlot>");
    const slot = panel.slice(open, close);
    expect(open).toBeGreaterThan(-1);
    expect(slot).toMatch(/\{submitError && \(/);
    expect(slot).toMatch(/type="submit"\s*form=\{bookingCard \? 'partner-home-request' : undefined\}/);
    expect(slot).toMatch(/partnerBooking\.noCharge/);
    expect(panel).toMatch(/<form ref=\{formRef\} id="partner-home-request"/);
    const notice = panel.indexOf("partnerBooking.someUnavailable");
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(open);
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
  });
});
