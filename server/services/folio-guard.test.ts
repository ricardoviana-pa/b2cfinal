import { describe, expect, it, vi } from "vitest";
import {
  baselineFromSnapshot,
  canRunFolioGuard,
  captureSettleBaseline,
  checkReservationFolio,
  evaluateFolio,
  isDirectSource,
  issueKey,
  runFolioSweep,
  sitePlanFromNote,
  snapshotFromReservation,
  type FolioGuardDeps,
  type FolioSnapshot,
  type StoredBaseline,
} from "./folio-guard";

const NOW = new Date("2026-11-20T15:00:00Z");

function reservation(over: Record<string, any> = {}, money: Record<string, any> = {}) {
  return {
    _id: "res1",
    confirmationCode: "GY-TEST",
    source: "website-checkout",
    status: "confirmed",
    listingId: "L1",
    checkInDateLocalized: "2026-11-20",
    checkOutDateLocalized: "2026-11-26",
    createdAt: "2026-09-28T12:38:00.000Z",
    ...over,
    money: {
      fareAccommodation: 2421,
      fareCleaning: 345.17,
      hostPayout: 2766.17,
      totalPaid: 2766.17,
      balanceDue: 0,
      payments: [{ amount: 2766.17, status: "SUCCEEDED", note: "Stripe external payment (EUR) — PaymentIntent: pi_abc" }],
      ...money,
    },
  };
}

function snap(over: Record<string, any> = {}, money: Record<string, any> = {}): FolioSnapshot {
  return snapshotFromReservation(reservation(over, money))!;
}

function base(s: FolioSnapshot, via: "settle" | "observed" = "settle"): StoredBaseline {
  return baselineFromSnapshot(s, via, new Date("2026-09-28T12:40:00Z"));
}

describe("snapshotFromReservation", () => {
  it("usa o hostPayout como total e soma só os pagamentos do checkout do site", () => {
    const s = snapshotFromReservation(
      reservation({}, {
        payments: [
          { amount: 2524.07, status: "SUCCEEDED", note: "Stripe external payment (EUR) — PaymentIntent: pi_1" },
          { amount: 2524.07, status: "FAILED", note: "PaymentIntent: pi_2" },
          { amount: 100, status: "SUCCEEDED", note: "caução" },
        ],
      }),
    )!;
    expect(s.folioTotal).toBe(2766.17);
    expect(s.sitePaid).toBe(2524.07);
    expect(s.checkIn).toBe("2026-11-20");
  });

  it("sem hostPayout cai para totalPrice e depois para alojamento + limpeza", () => {
    expect(snapshotFromReservation(reservation({}, { hostPayout: undefined, totalPrice: 900 }))!.folioTotal).toBe(900);
    expect(snapshotFromReservation(reservation({}, { hostPayout: undefined }))!.folioTotal).toBe(2766.17);
  });
});

describe("evaluateFolio", () => {
  it("GY-Huf4Lp8L: alojamento em dobro depois do check-in do Hostkit", () => {
    const paid = snap();
    const cur = snap({}, { fareAccommodation: 4842, hostPayout: 5187.17, balanceDue: 2421 });
    const ev = evaluateFolio(cur, base(paid), NOW);
    expect(ev.baseline).toBe("keep");
    expect(ev.issues.map((i) => [i.kind, i.amount])).toEqual([
      ["fare_changed", 2421],
      ["open_after_checkin", 2421],
    ]);
  });

  it("GY-kFGjqPnm: hóspedes 14→11 baixam o folio abaixo do pago", () => {
    const paid = snap({}, { fareAccommodation: 582, fareCleaning: 190, hostPayout: 772, totalPaid: 772 });
    const cur = snap({}, { fareAccommodation: 482, fareCleaning: 190, hostPayout: 672, totalPaid: 772, balanceDue: -100 });
    const ev = evaluateFolio(cur, base(paid, "observed"), NOW);
    expect(ev.issues.map((i) => [i.kind, i.amount])).toEqual([
      ["fare_changed", -100],
      ["overpaid", -100],
    ]);
  });

  it("linha negativa nova (Host channel fee −10%) com tarifas iguais", () => {
    const paid = snap({ source: "BE-API" }, { fareAccommodation: 889.9, fareCleaning: 110, hostPayout: 999.9, totalPaid: 999.9 });
    const cur = snap({ source: "BE-API" }, { fareAccommodation: 889.9, fareCleaning: 110, hostPayout: 899.91, totalPaid: 999.9, balanceDue: -99.99 });
    const kinds = evaluateFolio(cur, base(paid, "observed"), NOW).issues.map((i) => i.kind);
    expect(kinds).toEqual(["total_dropped", "overpaid"]);
  });

  it("extras lançados pelo CS (total sobe, tarifas iguais) não são problema", () => {
    const paid = snap({ checkInDateLocalized: "2026-12-20", checkOutDateLocalized: "2026-12-26" });
    const cur = snap(
      { checkInDateLocalized: "2026-12-20", checkOutDateLocalized: "2026-12-26" },
      { hostPayout: 3186.17, balanceDue: 420 },
    );
    expect(evaluateFolio(cur, base(paid), NOW).issues).toEqual([]);
  });

  it("mudança de datas renova a base sem alerta de recálculo", () => {
    const paid = snap();
    const cur = snap({ checkOutDateLocalized: "2026-11-27" }, { fareAccommodation: 2824.5, hostPayout: 3169.67, totalPaid: 3169.67 });
    const ev = evaluateFolio(cur, base(paid), NOW);
    expect(ev.baseline).toBe("replace");
    expect(ev.issues).toEqual([]);
  });

  it("base sem pagamento acompanha o folio (o CS ainda está a fazer o preço)", () => {
    const unpaid = snap({ source: "manual", checkInDateLocalized: "2027-01-10" }, { totalPaid: 0, balanceDue: 2766.17, payments: [] });
    const cur = snap({ source: "manual", checkInDateLocalized: "2027-01-10" }, { fareAccommodation: 2000, hostPayout: 2345.17, totalPaid: 0, balanceDue: 2345.17, payments: [] });
    const ev = evaluateFolio(cur, base(unpaid, "observed"), NOW);
    expect(ev.baseline).toBe("replace");
    expect(ev.issues).toEqual([]);
  });

  it("base de settle fica congelada mesmo que a leitura do settle ainda não visse o pagamento", () => {
    const atSettle = snap({}, { totalPaid: 0, balanceDue: 2766.17 });
    const cur = snap({}, { fareAccommodation: 4842, hostPayout: 5187.17, balanceDue: 2421 });
    expect(evaluateFolio(cur, base(atSettle, "settle"), NOW).issues[0].kind).toBe("fare_changed");
  });

  it("reserva cancelada não é verificada", () => {
    const cur = snap({ status: "canceled" }, { fareAccommodation: 1 });
    expect(evaluateFolio(cur, base(snap()), NOW)).toEqual({ issues: [], baseline: "keep" });
  });

  it("reserva do site sem pagamento ao fim de 2 horas", () => {
    const cur = snap({ createdAt: "2026-11-16T13:15:00.000Z", checkInDateLocalized: "2027-01-29" }, { totalPaid: 0, balanceDue: 1517.64, hostPayout: 1517.64, payments: [] });
    expect(evaluateFolio(cur, null, NOW).issues.map((i) => i.kind)).toEqual(["site_unpaid"]);
    const fresh = snap({ createdAt: "2026-11-20T14:30:00.000Z" }, { totalPaid: 0, payments: [] });
    expect(evaluateFolio(fresh, null, NOW).issues).toEqual([]);
  });

  it("primeira leitura sem base: só os controlos de coerência", () => {
    const cur = snap({}, { fareAccommodation: 4842, hostPayout: 5187.17, balanceDue: 2421 });
    const ev = evaluateFolio(cur, null, NOW);
    expect(ev.baseline).toBe("insert");
    expect(ev.issues.map((i) => i.kind)).toEqual(["open_after_checkin"]);
  });
});

describe("isDirectSource", () => {
  it("venda direta sim, OTA não", () => {
    for (const s of ["website-checkout", "website", "BE-API", "manual", "PORTUGAL ACTIVE", "Website Direct", "website-paypal"]) {
      expect(isDirectSource(s)).toBe(true);
    }
    for (const s of ["airbnb2", "Booking.com", "VRBO", "holidu", ""]) expect(isDirectSource(s)).toBe(false);
  });
});

function fakeDeps(reservations: Record<string, any>, stored: StoredBaseline[] = []) {
  const db = new Map(stored.map((b) => [b.reservationId, b]));
  const sent: Array<{ subject: string; lines: string[] }> = [];
  const deps: FolioGuardDeps = {
    fetchReservation: vi.fn(async (id: string) => reservations[id] ?? null),
    listReservations: vi.fn(async () => Object.values(reservations)),
    loadBaselines: vi.fn(async (ids: string[]) => new Map(ids.filter((id) => db.has(id)).map((id) => [id, db.get(id)!]))),
    saveBaseline: vi.fn(async (b: StoredBaseline) => {
      db.set(b.reservationId, b);
    }),
    sendAlert: vi.fn(async (subject: string, lines: string[]) => {
      sent.push({ subject, lines });
      return true;
    }),
    now: () => NOW,
  };
  return { deps, db, sent };
}

describe("checkReservationFolio", () => {
  it("alerta uma vez e não repete o mesmo problema", async () => {
    const paid = snap();
    const { deps, sent, db } = fakeDeps(
      { res1: reservation({}, { fareAccommodation: 4842, hostPayout: 5187.17, balanceDue: 2421 }) },
      [base(paid)],
    );
    await checkReservationFolio("res1", deps);
    await checkReservationFolio("res1", deps);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("GY-TEST");
    expect(sent[0].lines.join(" ")).toContain("2.421,00 → 4.842,00");
    expect(db.get("res1")!.alertedKeys).toEqual(["fare_changed:2421", "open_after_checkin:2421"]);
    // A base não muda: o próximo recálculo continua a ser medido contra o pago.
    expect(db.get("res1")!.fareAccommodation).toBe(2421);
  });

  it("volta a alertar se o valor mudar outra vez", async () => {
    const paid = snap();
    const b = { ...base(paid), alertedKeys: [issueKey({ kind: "fare_changed", amount: 2421, message: "" })] };
    const { deps, sent } = fakeDeps({ res1: reservation({ checkInDateLocalized: "2026-12-01", checkOutDateLocalized: "2026-12-07" }, { fareAccommodation: 3000, hostPayout: 3345.17, balanceDue: 579 }) }, [
      { ...b, checkIn: "2026-12-01", checkOut: "2026-12-07" },
    ]);
    await checkReservationFolio("res1", deps);
    expect(sent).toHaveLength(1);
  });

  it("ignora OTA e grava base na primeira leitura de uma reserva direta", async () => {
    const { deps, sent, db } = fakeDeps({
      ota: reservation({ _id: "ota", source: "airbnb2" }, { fareAccommodation: 9999 }),
      d1: reservation({ _id: "d1", checkInDateLocalized: "2026-12-20", checkOutDateLocalized: "2026-12-22" }),
    });
    expect(await checkReservationFolio("ota", deps)).toEqual([]);
    await checkReservationFolio("d1", deps);
    expect(sent).toHaveLength(0);
    expect(db.has("ota")).toBe(false);
    expect(db.get("d1")!.via).toBe("observed");
  });

  it("um email que não sai não fica marcado como enviado", async () => {
    const { deps, db } = fakeDeps({ res1: reservation({}, { fareAccommodation: 4842, hostPayout: 5187.17, balanceDue: 2421 }) }, [base(snap())]);
    (deps.sendAlert as any).mockResolvedValue(false);
    await checkReservationFolio("res1", deps);
    expect(deps.sendAlert).toHaveBeenCalledTimes(1);
    expect(db.get("res1")!.alertedKeys).toEqual([]);
  });
});

describe("captureSettleBaseline", () => {
  it("grava a base do settle e não a substitui num settle retomado", async () => {
    const { deps, db } = fakeDeps({ res1: reservation() });
    expect(await captureSettleBaseline("res1", deps)).toBe(true);
    expect(db.get("res1")!.via).toBe("settle");
    (deps.fetchReservation as any).mockResolvedValue(reservation({}, { fareAccommodation: 4842 }));
    expect(await captureSettleBaseline("res1", deps)).toBe(false);
    expect(db.get("res1")!.fareAccommodation).toBe(2421);
  });

  it("substitui uma base observada (o settle é o momento certo)", async () => {
    const { deps, db } = fakeDeps({ res1: reservation() }, [base(snap({}, { fareAccommodation: 10 }), "observed")]);
    expect(await captureSettleBaseline("res1", deps)).toBe(true);
    expect(db.get("res1")!.fareAccommodation).toBe(2421);
  });
});

describe("runFolioSweep", () => {
  const reservations = {
    a: reservation({ _id: "a", confirmationCode: "GY-A" }, { fareAccommodation: 4842, hostPayout: 5187.17, balanceDue: 2421 }),
    b: reservation({ _id: "b", confirmationCode: "GY-B", source: "BE-API" }, { hostPayout: 2489.55, balanceDue: -276.62 }),
    ok: reservation({ _id: "ok", confirmationCode: "GY-OK", checkInDateLocalized: "2026-12-20", checkOutDateLocalized: "2026-12-22" }),
    ota: reservation({ _id: "ota", source: "Booking.com" }, { totalPaid: 0, balanceDue: 900 }),
  };

  it("um só email com as reservas com problemas novos", async () => {
    const { deps, sent } = fakeDeps(reservations, [base(snapshotFromReservation(reservation({ _id: "a", confirmationCode: "GY-A" }))!)]);
    const r = await runFolioSweep(deps);
    expect(r.direct).toBe(3);
    expect(r.withIssues).toBe(2);
    expect(r.alerted).toBe(2);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toBe("FOLIOS DO GUESTY A VERIFICAR — 2 reserva(s)");
    // Segunda ronda: nada de novo.
    const again = await runFolioSweep(deps);
    expect(again.alerted).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("relatório (dryRun) não grava nem envia", async () => {
    const { deps, sent, db } = fakeDeps(reservations);
    const r = await runFolioSweep(deps, { dryRun: true, includeOk: true, checkOutFrom: "2026-01-01" });
    expect(r.checkedFrom).toBe("2026-01-01");
    expect(r.rows.map((x) => x.confirmationCode).sort()).toEqual(["GY-A", "GY-B", "GY-OK"]);
    expect(sent).toHaveLength(0);
    expect(db.size).toBe(0);
  });
});

describe("canRunFolioGuard", () => {
  const prod = { NODE_ENV: "production", RENDER_SERVICE_ID: "srv-d700n5fgi27c73f9bse0" } as NodeJS.ProcessEnv;
  it("só no serviço de produção", () => {
    expect(canRunFolioGuard(prod)).toBe(true);
    expect(canRunFolioGuard({ ...prod, FOLIO_GUARD: "false" })).toBe(false);
    expect(canRunFolioGuard({ ...prod, RENDER_SERVICE_ID: "srv-outro" })).toBe(false);
    expect(canRunFolioGuard({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(canRunFolioGuard({ ...prod, NODE_ENV: "test" })).toBe(false);
  });
});

const FULL_NOTE = "Checkout 2.0: pagamento unico 5074.37 EUR na plataforma (estadia 5074.37 registada aqui; servicos 0.00 faturados pela Portugal Active). PI pi_x.";
const TWO_NOTE = "Checkout 2.0 em duas partes: 1.a parte 1000.00 EUR registada (PI pi_y); 2.a parte 1000.00 EUR agendada para 10/12/2026, cobrada AUTOMATICAMENTE pela plataforma.";

describe("reservas do site acima do pago (Black Friday, plano tarifário)", () => {
  const future = { checkInDateLocalized: "2027-09-22", checkOutDateLocalized: "2027-09-27" };

  it("lê o plano da nota do settle", () => {
    expect(sitePlanFromNote({ other: FULL_NOTE })).toEqual({ sitePlan: "full", siteScheduledBalance: 0, settleAlerted: false });
    expect(sitePlanFromNote({ other: TWO_NOTE })).toEqual({ sitePlan: "two_parts", siteScheduledBalance: 1000, settleAlerted: false });
    expect(sitePlanFromNote({ other: FULL_NOTE + " Cupao PABF15GERAL26 recusado pelo Guesty: acertar em Guest folio > Adjust line item > Accommodation fare, menos 798.38 EUR." }).settleAlerted).toBe(true);
    expect(sitePlanFromNote(undefined).sitePlan).toBeNull();
  });

  it("GY-K8buDVJW: paga por inteiro, folio 798,38 acima — alerta logo, antes do check-in", () => {
    const cur = snap({ ...future, notes: { other: FULL_NOTE } }, { fareAccommodation: 5322.5, fareCleaning: 550.25, hostPayout: 5872.75, totalPaid: 5074.37, balanceDue: 798.38 });
    const ev = evaluateFolio(cur, null, NOW);
    expect(ev.issues.map((i) => [i.kind, i.amount])).toEqual([["site_above_paid", 798.38]]);
    expect(ev.issues[0].message).toContain("Accommodation fare → menos 798,38 EUR");
  });

  it("duas partes: o saldo da 2.ª parte agendada é normal; só o excesso conta", () => {
    const ok = snap({ ...future, notes: { other: TWO_NOTE } }, { totalPaid: 1000, balanceDue: 1000, hostPayout: 2000 });
    expect(evaluateFolio(ok, null, NOW).issues).toEqual([]);
    const above = snap({ ...future, notes: { other: TWO_NOTE } }, { totalPaid: 1000, balanceDue: 1150, hostPayout: 2150 });
    expect(evaluateFolio(above, null, NOW).issues.map((i) => [i.kind, i.amount])).toEqual([["site_above_paid", 150]]);
  });

  it("depois de o CS acertar o folio (igual ao pago) não há alerta de recálculo", () => {
    const atSettle = snap({ ...future, notes: { other: FULL_NOTE } }, { fareAccommodation: 5322.5, fareCleaning: 550.25, hostPayout: 5872.75, totalPaid: 5074.37, balanceDue: 798.38 });
    const fixed = snap({ ...future, notes: { other: FULL_NOTE } }, { fareAccommodation: 4524.12, fareCleaning: 550.25, hostPayout: 5074.37, totalPaid: 5074.37, balanceDue: 0 });
    const ev = evaluateFolio(fixed, base(atSettle, "settle"), NOW);
    expect(ev).toEqual({ issues: [], baseline: "replace" });
  });

  it("não repete o email quando o settle já mandou o acerto ao CS", async () => {
    const note = FULL_NOTE + " Cupao PABF15GERAL26 recusado pelo Guesty: acertar em Guest folio > Adjust line item > Accommodation fare, menos 798.38 EUR.";
    const { deps, sent } = fakeDeps({ res1: reservation({ ...future, notes: { other: note } }, { fareAccommodation: 5322.5, hostPayout: 5872.75, totalPaid: 5074.37, balanceDue: 798.38 }) });
    const issues = await checkReservationFolio("res1", deps);
    expect(issues.map((i) => i.kind)).toEqual(["site_above_paid"]);
    expect(sent).toHaveLength(0);
  });

  it("sem nota do site (BE-API, manual) não se aplica", () => {
    const cur = snap({ ...future, source: "manual" }, { totalPaid: 500, balanceDue: 300 });
    expect(evaluateFolio(cur, null, NOW).issues).toEqual([]);
  });
});
