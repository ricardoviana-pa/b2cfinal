import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { assertGuestContact } from "./checkout-card-charge";

/**
 * Apple Pay / Google Pay à cabeça (29 out 2026): o createCardCharge não exige
 * nome, email nem telefone (a folha da wallet dá-os no confirm e o checkout
 * grava-os antes da cobrança); o settle, que cria a reserva, continua estrito:
 * sem os três não se cria uma reserva "Guest -" sem contacto.
 */
const read = (p: string) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("o que falta ao intent para a reserva", () => {
  it("nada falta com nome, email e telefone", () => {
    expect(assertGuestContact({ firstName: "Ana", email: "ana@example.com", phone: "+351 912 345 678" })).toEqual([]);
  });

  it("assinala cada um em falta, pela ordem nome, email, telefone", () => {
    expect(assertGuestContact({ firstName: "", email: "", phone: "" })).toEqual(["name", "email", "phone"]);
    expect(assertGuestContact({ firstName: "  ", email: "ana@", phone: null })).toEqual(["name", "email", "phone"]);
    expect(assertGuestContact({ firstName: "Ana", email: "ana@example.com", phone: undefined })).toEqual(["phone"]);
    expect(assertGuestContact({ firstName: "Ana", email: null, phone: "912345678" })).toEqual(["email"]);
    expect(assertGuestContact({})).toEqual(["name", "email", "phone"]);
  });
});

describe("o servidor: wallets sem exigências à entrada, estrito a fechar", () => {
  const router = read("server/routers/checkout.ts");
  const settle = read("server/services/checkout-card-charge.ts");

  it("createCardCharge aceita wallet:true só com o intent (os dados chegam da folha, gravados pelo updateIntent)", () => {
    const input = router.slice(router.indexOf("createCardCharge: publicProcedure"), router.indexOf(".mutation(async ({ input, ctx }) => withCheckoutChargeLock(input.intentId"));
    expect(input).toMatch(/wallet: z\.boolean\(\)\.optional\(\)/);
    expect(input).not.toMatch(/guestEmail|guestPhone|guestFirstName/);
    expect(router).toMatch(/guestPhone: z\.string\(\)\.max\(50\)\.optional\(\)/);
  });

  it("o settle verifica nome, email e telefone antes de criar a reserva no Guesty", () => {
    const check = settle.indexOf("assertGuestContact({ firstName, email: (m as any).email, phone: (m as any).guestPhone })");
    const create = settle.indexOf("const res = await createReservationViaOpenApi({");
    expect(check).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(check);
    expect(settle).toMatch(/reserva NÃO criada até o intent ter nome, email e telefone/);
  });
});
