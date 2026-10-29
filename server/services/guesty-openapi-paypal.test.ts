import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/guesty", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/guesty")>();
  return {
    ...actual,
    guestyClient: {
      request: vi.fn(),
    },
  };
});

// Os alertas ao CS saem por aqui: nada vai para a rede.
const mail = vi.hoisted(() => ({ sendOpsAlert: vi.fn(async (_s: string, _l: string[], _o?: unknown) => true) }));
vi.mock("./transactional-email", () => ({ sendOpsAlert: mail.sendOpsAlert }));

import { createReservationViaOpenApi } from "./guesty-openapi-paypal";
import { guestyClient } from "../lib/guesty";

const baseInput = {
  listingId: "listing-123",
  checkIn: "2026-11-02",
  checkOut: "2026-11-04",
  guestFirstName: "Diogo",
  guestLastName: "Boissel",
  guestEmail: "diogo@example.com",
  numberOfAdults: 2,
  numberOfChildren: 0,
  numberOfInfants: 0,
  stripePaymentIntentId: "pi_test_abc123",
};

describe("createReservationViaOpenApi — reservation ID extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("extracts reservationId from the real reservations-v3 response field", async () => {
    // Guesty POST /v1/reservations-v3 returns the id under `reservationId` (not `_id`)
    vi.mocked(guestyClient.request).mockResolvedValue({
      reservationId: "667bc9e0319654c49fde9aff",
      quoteId: "667bc383b119a5cd5f3bfbf6",
      confirmationCode: "GY-aJ3WEcJU",
      status: "confirmed",
    });

    const result = await createReservationViaOpenApi(baseInput);

    expect(result.reservationId).toBe("667bc9e0319654c49fde9aff");
    expect(result.confirmationCode).toBe("GY-aJ3WEcJU");
  });

  it("extracts reservationId from flat _id field", async () => {
    vi.mocked(guestyClient.request).mockResolvedValue({
      _id: "res_flat_id_abc",
      confirmationCode: "PA-001",
      status: "confirmed",
    });

    const result = await createReservationViaOpenApi(baseInput);

    expect(result.reservationId).toBe("res_flat_id_abc");
  });

  it("extracts reservationId from flat id field when _id is absent", async () => {
    // Guesty API may return `id` instead of `_id` in some response shapes
    vi.mocked(guestyClient.request).mockResolvedValue({
      id: "res_id_field_xyz",
      confirmationCode: "PA-002",
      status: "confirmed",
    });

    const result = await createReservationViaOpenApi(baseInput);

    expect(result.reservationId).toBe("res_id_field_xyz");
  });

  it("extracts reservationId from nested reservation._id", async () => {
    // Some Guesty endpoints wrap the object under a `reservation` key
    vi.mocked(guestyClient.request).mockResolvedValue({
      reservation: {
        _id: "res_nested_id",
        confirmationCode: "PA-003",
        status: "confirmed",
      },
    });

    const result = await createReservationViaOpenApi(baseInput);

    expect(result.reservationId).toBe("res_nested_id");
  });

  it("throws a clear error when no reservation ID is present in the response", async () => {
    vi.mocked(guestyClient.request).mockResolvedValue({
      confirmationCode: "PA-004",
      status: "confirmed",
      // no _id, id, or reservation field
    });

    await expect(createReservationViaOpenApi(baseInput)).rejects.toThrow(
      /reservation ID/i
    );
  });

  it("never returns undefined as the reservationId", async () => {
    vi.mocked(guestyClient.request).mockResolvedValue({
      confirmationCode: "PA-005",
      status: "confirmed",
    });

    await expect(createReservationViaOpenApi(baseInput)).rejects.toThrow();
  });
});

describe("appendReservationNote — acrescenta, nunca apaga", () => {
  beforeEach(() => {
    vi.mocked(guestyClient.request).mockReset();
  });

  it("junta a nota nova às que já lá estão (a do pagamento sobrevive à dos serviços)", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    const pagamento = "Checkout 2.0: pagamento unico 3607.33 EUR na plataforma (estadia 3457.33 registada aqui; servicos 150.00 faturados pela Portugal Active).";
    const servicos = "SERVICOS DO CHECKOUT:\nRececao: self check-in\nFlex: nao\n- pet-fee x2 150 EUR";
    vi.mocked(guestyClient.request)
      .mockResolvedValueOnce({ notes: { other: pagamento } } as any) // GET
      .mockResolvedValueOnce({} as any); // PUT

    expect(await appendReservationNote("res-1", servicos)).toBe(true);

    const put = vi.mocked(guestyClient.request).mock.calls[1];
    expect(put[0]).toBe("PUT");
    const escrito = (put[2] as any).body.notes.other as string;
    expect(escrito).toContain(pagamento);
    expect(escrito).toContain("pet-fee x2 150 EUR");
    expect(escrito.indexOf(pagamento)).toBeLessThan(escrito.indexOf("SERVICOS DO CHECKOUT"));
  });

  it("não repete uma nota que já lá está (settle e webhook podem correr os dois)", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockResolvedValueOnce({ notes: { other: "nota A\n\nnota B" } } as any);

    expect(await appendReservationNote("res-1", "nota B")).toBe(true);
    expect(vi.mocked(guestyClient.request)).toHaveBeenCalledTimes(1); // só o GET, nenhum PUT
  });

  it("numa reserva sem notas escreve só a nova", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockResolvedValueOnce({} as any).mockResolvedValueOnce({} as any);

    await appendReservationNote("res-1", "primeira");
    expect((vi.mocked(guestyClient.request).mock.calls[1][2] as any).body.notes.other).toBe("primeira");
  });

  it("se o Guesty falhar devolve false e não rebenta o settle", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockRejectedValueOnce(new Error("503"));
    expect(await appendReservationNote("res-1", "x")).toBe(false);
  });
});

describe("planReservationNote — topo, fim e nunca cortar", () => {
  it("o topo vai antes do que lá está e a nota nova depois", async () => {
    const { planReservationNote } = await import("./guesty-openapi-paypal");
    const plan = planReservationNote("nota do pagamento", "SERVICOS DO CHECKOUT:\nFlex: nao", "FATURA COM NIF 123456789");
    expect(plan.text).toBe("FATURA COM NIF 123456789\n\nnota do pagamento\n\nSERVICOS DO CHECKOUT:\nFlex: nao");
    expect(plan).toMatchObject({ changed: true, written: ["FATURA COM NIF 123456789", "SERVICOS DO CHECKOUT:\nFlex: nao"], missing: [] });
  });

  it("nada a gravar quando os dois textos já lá estão", async () => {
    const { planReservationNote } = await import("./guesty-openapi-paypal");
    const plan = planReservationNote("FATURA COM NIF 1\n\nnota A", "nota A", "FATURA COM NIF 1");
    expect(plan).toEqual({ text: "FATURA COM NIF 1\n\nnota A", changed: false, written: [], missing: [] });
  });

  it("sem espaço: o que lá está fica inteiro, o topo entra primeiro e a nota que não cabe não entra cortada", async () => {
    const { planReservationNote } = await import("./guesty-openapi-paypal");
    const existing = "x".repeat(80);
    const twoParts = "Checkout 2.0 em duas partes: 2.a parte 1073.00 EUR agendada para 24/10/2099. NAO cobrar no Guesty.";
    const plan = planReservationNote(existing, twoParts, "FATURA COM NIF 9", 100);
    expect(plan.text).toBe("FATURA COM NIF 9\n\n" + existing);
    expect(plan.written).toEqual(["FATURA COM NIF 9"]);
    expect(plan.missing).toEqual([twoParts]);
    expect(plan.text).not.toContain("24/1");
  });

  it("um campo já acima do teto nunca é cortado nem regravado", async () => {
    const { planReservationNote } = await import("./guesty-openapi-paypal");
    const existing = "CS: ".padEnd(150, "y");
    const plan = planReservationNote(existing, "nota nova", "FATURA COM NIF 9", 100);
    expect(plan).toEqual({ text: existing, changed: false, written: [], missing: ["FATURA COM NIF 9", "nota nova"] });
  });
});

describe("appendReservationNote — falhas e falta de espaço chegam ao CS", () => {
  beforeEach(() => {
    vi.mocked(guestyClient.request).mockReset();
    mail.sendOpsAlert.mockReset();
    mail.sendOpsAlert.mockResolvedValue(true);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.useRealTimers());

  const alertOf = (i = 0) => {
    const [subject, lines, opts] = mail.sendOpsAlert.mock.calls[i] as [string, string[], any];
    return { subject, lines, html: lines.join("\n"), opts };
  };

  it("NIF no topo e serviços no fim, numa só escrita", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request)
      .mockResolvedValueOnce({ notes: { other: "Checkout 2.0: pagamento unico 2147.00 EUR na plataforma." } } as any)
      .mockResolvedValueOnce({} as any);

    expect(await appendReservationNote("res-top", "SERVICOS DO CHECKOUT:\nFlex: nao", { prepend: "FATURA COM NIF 123456789" })).toBe(true);

    const puts = vi.mocked(guestyClient.request).mock.calls.filter((c) => c[0] === "PUT");
    expect(puts).toHaveLength(1);
    const other = (puts[0][2] as any).body.notes.other as string;
    expect(other.startsWith("FATURA COM NIF 123456789\n\n")).toBe(true);
    expect(other.endsWith("SERVICOS DO CHECKOUT:\nFlex: nao")).toBe(true);
    expect(other).toContain("Checkout 2.0: pagamento unico 2147.00 EUR na plataforma.");
    expect(mail.sendOpsAlert).not.toHaveBeenCalled();
  });

  it("leitura falhada: false e alerta com a reserva, o texto inteiro por gravar e o erro", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    const { GuestyClientError } = await import("../lib/guesty");
    vi.mocked(guestyClient.request).mockRejectedValueOnce(
      new GuestyClientError({ message: "Guesty request failed (410)", status: 410, method: "GET", endpoint: "/v1/reservations/res-get", details: { message: "Gone" } }),
    );

    expect(await appendReservationNote("res-get", "SERVICOS DO CHECKOUT:\nRececao: self check-in", { prepend: "FATURA COM NIF 123<456>" })).toBe(false);

    expect(vi.mocked(guestyClient.request)).toHaveBeenCalledTimes(1); // nada de PUT às cegas
    expect(mail.sendOpsAlert).toHaveBeenCalledOnce();
    const { subject, html, opts } = alertOf();
    expect(subject).toBe("NOTA NÃO GRAVADA NO GUESTY — res-get");
    expect(opts).toEqual({ copyToSales: true });
    expect(html).toContain("https://app.guesty.com/reservations/res-get/summary");
    expect(html).toContain("FATURA COM NIF 123&lt;456&gt;<br><br>SERVICOS DO CHECKOUT:<br>Rececao: self check-in");
    expect(html).not.toContain("<456>");
    expect(html).toContain("Leva o NIF para a fatura.");
    expect(html).toContain("Erro: Guesty request failed (410) · GET /v1/reservations/res-get · {&quot;message&quot;:&quot;Gone&quot;}");
  });

  it("escrita falhada nas duas partes: o alerta leva o NÃO cobrar e o código da reserva", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    const note = "Checkout 2.0 em duas partes: 1.a parte 1074.00 EUR registada (PI pi_x); 2.a parte 1073.00 EUR agendada para 24/10/2099, cobrada AUTOMATICAMENTE pela plataforma. NAO cobrar no Guesty, NAO criar payment link, NAO pedir cartao ao hospede.";
    vi.mocked(guestyClient.request)
      .mockResolvedValueOnce({ confirmationCode: "GY-NOTE01", notes: { other: "FATURA COM NIF 999999990 (pedido)" } } as any)
      .mockRejectedValueOnce(new Error("Guesty request failed (500)"));

    expect(await appendReservationNote("res-put", note, { prepend: "FATURA COM NIF 999999990 (pedido)" })).toBe(false);

    const { subject, html } = alertOf();
    expect(subject).toBe("NOTA NÃO GRAVADA NO GUESTY — GY-NOTE01");
    // Só o que faltava gravar: o NIF já lá estava.
    expect(html).toContain("<strong>Texto por gravar:</strong><br>Checkout 2.0 em duas partes:");
    expect(html).not.toContain("Texto por gravar:</strong><br>FATURA COM NIF");
    expect(html).toContain("Leva o aviso de NÃO cobrar o hóspede.");
    expect(html).toContain("Erro: Guesty request failed (500)");
  });

  it("sem espaço (o corte que antes era calado): nada do que lá está se perde, a nota não entra cortada e o CS recebe-a inteira", async () => {
    const { appendReservationNote, RESERVATION_NOTE_MAX } = await import("./guesty-openapi-paypal");
    const csNotes = "Notas do CS: ".padEnd(RESERVATION_NOTE_MAX - 100, "z");
    const note = "Checkout 2.0 em duas partes: 2.a parte 1073.00 EUR agendada para 24/10/2099, cobrada AUTOMATICAMENTE pela plataforma. NAO cobrar no Guesty, NAO criar payment link.";
    vi.mocked(guestyClient.request)
      .mockResolvedValueOnce({ confirmationCode: "GY-FULL01", notes: { other: csNotes } } as any)
      .mockResolvedValueOnce({} as any);

    expect(await appendReservationNote("res-full", note, { prepend: "FATURA COM NIF 123456789" })).toBe(true);

    const put = vi.mocked(guestyClient.request).mock.calls.find((c) => c[0] === "PUT")!;
    const other = (put[2] as any).body.notes.other as string;
    expect(other).toBe("FATURA COM NIF 123456789\n\n" + csNotes); // o NIF coube no topo
    expect(other).not.toContain("duas partes");
    const { subject, html } = alertOf();
    expect(subject).toBe("NOTA SEM ESPAÇO NO GUESTY — GY-FULL01");
    expect(html).toContain("Nada do que lá estava foi apagado.");
    expect(html).toContain("<strong>Texto por gravar:</strong><br>" + note);
    expect(html).toContain("Leva o aviso de NÃO cobrar o hóspede.");
  });

  it("sem espaço e sem alerta entregue devolve false (quem repete volta a tentar e a avisar)", async () => {
    const { appendReservationNote, RESERVATION_NOTE_MAX } = await import("./guesty-openapi-paypal");
    const full = "c".repeat(RESERVATION_NOTE_MAX);
    mail.sendOpsAlert.mockResolvedValueOnce(false);
    vi.mocked(guestyClient.request).mockResolvedValue({ notes: { other: full } } as any);

    expect(await appendReservationNote("res-undelivered", "nota que nao cabe")).toBe(false);
    expect(vi.mocked(guestyClient.request).mock.calls.some((c) => c[0] === "PUT")).toBe(false);
    // A passagem seguinte volta a avisar, e com o email entregue fica resolvido.
    expect(await appendReservationNote("res-undelivered", "nota que nao cabe")).toBe(true);
    expect(mail.sendOpsAlert).toHaveBeenCalledTimes(2);
  });

  it("o mesmo texto por gravar avisa no máximo uma vez por dia (o motor repete de 10 em 10 min)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-10-24T09:00:00Z"));
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockRejectedValue(new Error("Guesty request failed (503)"));
    const note = "Checkout 2.0 em duas partes: 2.a parte 1073.00 EUR cobrada pela plataforma (PI pi_b). NAO cobrar ao hospede.";

    expect(await appendReservationNote("res-repeat", note)).toBe(false);
    vi.setSystemTime(new Date("2099-10-24T09:10:00Z"));
    expect(await appendReservationNote("res-repeat", note)).toBe(false);
    expect(mail.sendOpsAlert).toHaveBeenCalledTimes(1);
    // Outra reserva, outro aviso.
    expect(await appendReservationNote("res-repeat-2", note)).toBe(false);
    expect(mail.sendOpsAlert).toHaveBeenCalledTimes(2);
    // No dia seguinte, se ainda falhar, volta a avisar.
    vi.setSystemTime(new Date("2099-10-25T09:10:00Z"));
    expect(await appendReservationNote("res-repeat", note)).toBe(false);
    expect(mail.sendOpsAlert).toHaveBeenCalledTimes(3);
  });

  it("um alerta que não sai não silencia o seguinte", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockRejectedValue(new Error("Guesty request failed (503)"));
    mail.sendOpsAlert.mockResolvedValueOnce(false);

    await appendReservationNote("res-retry-alert", "nota");
    await appendReservationNote("res-retry-alert", "nota");
    expect(mail.sendOpsAlert).toHaveBeenCalledTimes(2);
  });

  it("um alerta que rebenta não rebenta quem escreve a nota", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockRejectedValue(new Error("Guesty request failed (503)"));
    mail.sendOpsAlert.mockRejectedValueOnce(new Error("resend down"));

    await expect(appendReservationNote("res-alert-throws", "nota")).resolves.toBe(false);
  });

  it("sem texto nenhum não lê nem escreve", async () => {
    const { appendReservationNote } = await import("./guesty-openapi-paypal");
    expect(await appendReservationNote("res-empty", "  ", { prepend: "" })).toBe(true);
    expect(vi.mocked(guestyClient.request)).not.toHaveBeenCalled();
    expect(mail.sendOpsAlert).not.toHaveBeenCalled();
  });
});

describe("recordExternalPayment — espera que o Guesty precifique a reserva", () => {
  beforeEach(() => {
    vi.mocked(guestyClient.request).mockReset();
  });

  it("uma reserva acabada de criar ainda sem balanceDue não faz desistir (GY-tNwxeWRA)", async () => {
    vi.useFakeTimers();
    try {
      const { recordExternalPayment } = await import("./guesty-openapi-paypal");
      vi.mocked(guestyClient.request)
        .mockResolvedValueOnce({ money: {} } as any) // 200, folio ainda por precificar
        .mockResolvedValueOnce({ money: { balanceDue: 378.36 } } as any)
        .mockResolvedValueOnce({} as any); // POST payment

      const done = recordExternalPayment("res-1", 378.36, "EUR", "pi_klarna");
      await vi.runAllTimersAsync();
      await done;

      const post = vi.mocked(guestyClient.request).mock.calls[2];
      expect(post[0]).toBe("POST");
      expect((post[2] as any).body.amount).toBe(378.36);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("recordExternalPayment — idempotente pela nota com o id do PaymentIntent", () => {
  beforeEach(() => {
    vi.mocked(guestyClient.request).mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  const ourNote = "Stripe external payment (EUR) — PaymentIntent: pi_abc";

  it("não regista de novo quando o folio já tem um pagamento deste PI, mesmo com saldo por pagar", async () => {
    const { recordExternalPayment } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockResolvedValueOnce({
      money: { balanceDue: 242.1, totalPaid: 2524.07, payments: [{ _id: "p1", amount: 2524.07, status: "SUCCEEDED", note: ourNote }] },
    } as any);

    await expect(recordExternalPayment("res-1", 2524.07, "EUR", "pi_abc")).resolves.toBe("already-recorded");
    expect(vi.mocked(guestyClient.request)).toHaveBeenCalledTimes(1); // só o GET
  });

  it("encontra o PI noutro campo do pagamento quando o nome do campo da nota muda", async () => {
    const { recordExternalPayment } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockResolvedValueOnce({
      money: { balanceDue: 100, totalPaid: 900, payments: [{ _id: "p1", amount: 900, status: "SUCCEEDED", meta: { text: ourNote } }] },
    } as any);
    await expect(recordExternalPayment("res-1", 900, "EUR", "pi_abc")).resolves.toBe("already-recorded");
  });

  it("um registo anulado no Guesty não conta: volta a registar", async () => {
    const { recordExternalPayment } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request)
      .mockResolvedValueOnce({
        money: { balanceDue: 500, totalPaid: 0, payments: [{ _id: "p1", amount: 500, status: "CANCELED", note: ourNote }] },
      } as any)
      .mockResolvedValueOnce({} as any);
    await expect(recordExternalPayment("res-1", 500, "EUR", "pi_abc")).resolves.toBe("recorded");
  });

  it("o POST do pagamento sai marcado como não repetível", async () => {
    const { recordExternalPayment } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request)
      .mockResolvedValueOnce({ money: { balanceDue: 500 } } as any)
      .mockResolvedValueOnce({} as any);
    await recordExternalPayment("res-1", 500, "EUR", "pi_abc");
    const post = vi.mocked(guestyClient.request).mock.calls[1];
    expect(post[0]).toBe("POST");
    expect((post[2] as any).nonIdempotent).toBe(true);
  });

  it("saldo a zero sem registo deste PI: não regista e diz que a reserva já estava liquidada", async () => {
    const { recordExternalPayment } = await import("./guesty-openapi-paypal");
    vi.mocked(guestyClient.request).mockResolvedValueOnce({ money: { balanceDue: 0, totalPaid: 500, payments: [] } } as any);
    await expect(recordExternalPayment("res-1", 500, "EUR", "pi_abc")).resolves.toBe("settled");
    expect(vi.mocked(guestyClient.request)).toHaveBeenCalledTimes(1);
  });
});

describe("addReservationServiceFee — o invoice item não se repete às cegas", () => {
  beforeEach(() => {
    vi.mocked(guestyClient.request).mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("o POST sai marcado como não repetível e devolve 'added'", async () => {
    vi.mocked(guestyClient.request).mockResolvedValueOnce({} as any);
    const { addReservationServiceFee } = await import("./guesty-openapi-paypal");
    expect(await addReservationServiceFee("res-1", 224.07)).toBe("added");
    expect((vi.mocked(guestyClient.request).mock.calls[0][2] as any).nonIdempotent).toBe(true);
  });

  it("um 4xx é 'refused' e um 5xx sem repetição é 'unknown'", async () => {
    const { addReservationServiceFee } = await import("./guesty-openapi-paypal");
    const { GuestyClientError } = await import("../lib/guesty");
    vi.mocked(guestyClient.request).mockRejectedValueOnce(
      new GuestyClientError({ message: "bad", status: 400, method: "POST", endpoint: "/x" }),
    );
    expect(await addReservationServiceFee("res-1", 1)).toBe("refused");
    vi.mocked(guestyClient.request).mockRejectedValueOnce(
      new GuestyClientError({ message: "boom", status: 502, method: "POST", endpoint: "/x", details: { outcome: "unknown" } }),
    );
    expect(await addReservationServiceFee("res-1", 1)).toBe("unknown");
  });
});

describe("recordExternalPayment — repetição segura depois de um POST ambíguo", () => {
  beforeEach(() => {
    vi.mocked(guestyClient.request).mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  async function ambiguous() {
    const { GuestyClientError } = await import("../lib/guesty");
    return new GuestyClientError({ message: "502", status: 502, method: "POST", endpoint: "/x", details: { outcome: "unknown" } });
  }

  it("se o POST ambíguo ficou gravado, relê, encontra a nota e não envia segundo", async () => {
    vi.useFakeTimers();
    try {
      const { recordExternalPayment } = await import("./guesty-openapi-paypal");
      vi.mocked(guestyClient.request)
        .mockResolvedValueOnce({ money: { balanceDue: 500, totalPaid: 0, payments: [] } } as any)
        .mockRejectedValueOnce(await ambiguous())
        .mockResolvedValueOnce({
          money: { balanceDue: 0, totalPaid: 500, payments: [{ _id: "p1", amount: 500, status: "SUCCEEDED", note: "PaymentIntent: pi_k" }] },
        } as any);
      const run = recordExternalPayment("res-1", 500, "EUR", "pi_k");
      await vi.runAllTimersAsync();
      await expect(run).resolves.toBe("recorded");
      const posts = vi.mocked(guestyClient.request).mock.calls.filter((c) => c[0] === "POST");
      expect(posts).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("se não ficou gravado, volta a enviar uma vez (Klarna e PayPal recuperam como antes)", async () => {
    vi.useFakeTimers();
    try {
      const { recordExternalPayment } = await import("./guesty-openapi-paypal");
      vi.mocked(guestyClient.request)
        .mockResolvedValueOnce({ money: { balanceDue: 500, totalPaid: 0, payments: [] } } as any)
        .mockRejectedValueOnce(await ambiguous())
        .mockResolvedValueOnce({ money: { balanceDue: 500, totalPaid: 0, payments: [] } } as any)
        .mockResolvedValueOnce({} as any);
      const run = recordExternalPayment("res-1", 500, "EUR", "pi_k");
      await vi.runAllTimersAsync();
      await expect(run).resolves.toBe("recorded");
      const posts = vi.mocked(guestyClient.request).mock.calls.filter((c) => c[0] === "POST");
      expect(posts).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("um 4xx não é repetido", async () => {
    const { recordExternalPayment } = await import("./guesty-openapi-paypal");
    const { GuestyClientError } = await import("../lib/guesty");
    vi.mocked(guestyClient.request)
      .mockResolvedValueOnce({ money: { balanceDue: 500 } } as any)
      .mockRejectedValueOnce(new GuestyClientError({ message: "exceeds", status: 400, method: "POST", endpoint: "/x" }));
    await expect(recordExternalPayment("res-1", 500, "EUR", "pi_k")).rejects.toThrow();
    expect(vi.mocked(guestyClient.request).mock.calls.filter((c) => c[0] === "POST")).toHaveLength(1);
  });
});
