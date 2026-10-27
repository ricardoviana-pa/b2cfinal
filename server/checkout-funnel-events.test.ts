import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

// Funil do checkout (out/2026). begin_checkout chega ao Meta como
// InitiateCheckout e é a base do funil das casas. Só o botão "Reservar" do
// widget da casa o pode disparar: as páginas de experiências disparavam-no ao
// abrir a página e nos cliques de WhatsApp, o que inflacionava os inícios de
// checkout e fazia parecer que quase toda a gente desistia.

const read = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('checkout funnel events', () => {
  it('experience components never fire begin_checkout', () => {
    for (const file of [
      'client/src/components/experience/ExperienceBookingCard.tsx',
      'client/src/components/experience/ExperienceMobileBookingBar.tsx',
    ]) {
      expect(read(file), file).not.toMatch(/event:\s*['"]begin_checkout['"]/);
    }
  });

  it('experience WhatsApp CTAs count as whatsapp_click', () => {
    expect(read('client/src/components/experience/ExperienceBookingCard.tsx')).toMatch(/event:\s*'whatsapp_click',\s*source:\s*'experience_card'/);
    expect(read('client/src/components/experience/ExperienceMobileBookingBar.tsx')).toMatch(/event:\s*'whatsapp_click',\s*source:\s*'experience_mobile_bar'/);
  });

  it('the villa booking widget still fires begin_checkout', () => {
    expect(read('client/src/components/booking/BookingWidget.tsx')).toMatch(/event:\s*'begin_checkout'/);
  });

  it('every payment failure path reports payment_failed', () => {
    const src = read('client/src/components/booking/CheckoutPaymentForm.tsx');
    const calls = src.match(/trackPaymentFailed\(\{/g) ?? [];
    // wallet (3), cartão v2 (3), cartão legacy (2)
    expect(calls.length).toBe(8);
    // nunca a mensagem nem dados do hóspede no evento
    const helper = src.slice(src.indexOf('function trackPaymentFailed'), src.indexOf('function ExpressWalletInner'));
    expect(helper).not.toMatch(/guestEmail|guestName|guestPhone|message:/);
  });
});
