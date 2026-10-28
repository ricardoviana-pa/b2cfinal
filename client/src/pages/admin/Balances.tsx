/**
 * Ecrã "Saldos" do CS (/admin/balances): as segundas partes das reservas em
 * duas partes. docs/pagamento_duas_partes.md 3.2, 3.4 e 5.12; o servidor é
 * server/routers/balance-admin.ts.
 *
 * Porquê assim:
 * - Interno, em pt-PT, com o vocabulário do runbook (AGENDADO / A RESOLVER
 *   PELO HÓSPEDE / A RESOLVER POR NÓS), para o CS reconhecer o que lê no digest.
 * - As datas C, H e D aparecem sempre em hora de Lisboa e com a hora: é assim
 *   que o hóspede as recebe nos emails, e um "dia" sem hora já gerou dúvidas.
 * - Cada ação abre um modal (nunca window.confirm) que diz primeiro o que
 *   acontece ao dinheiro do hóspede; as que mexem nele pedem que se escreva a
 *   palavra de confirmação. O servidor volta a validar tudo e regista quem fez.
 * - O que cada botão pode fazer vem do servidor (as mesmas regras que as
 *   ações aplicam): um botão desligado diz porquê, em vez de falhar depois.
 * - Do cartão só a marca e os últimos 4 dígitos; o servidor nunca envia mais.
 */
import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CreditCard,
  FileText,
  Link2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../../server/routers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Outputs = inferRouterOutputs<AppRouter>;
type ListOut = Outputs["balanceAdmin"]["list"];
type ListRow = ListOut["rows"][number];
type DetailOut = Outputs["balanceAdmin"]["detail"];
type Status = ListRow["status"];
type ActionKind =
  | "resendLink" | "chargeNow" | "markPaidExternally" | "pause" | "resume"
  | "cancel" | "continueCancellation" | "markCreditNote" | "markRefundResolved";

/* ════════════════════════════════════════════════════════════════
   Formatação
   ════════════════════════════════════════════════════════════════ */

const EUR = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
const money = (cents: number | null | undefined) => (cents == null ? "—" : EUR.format(cents / 100));

const LISBON_DT = new Intl.DateTimeFormat("pt-PT", {
  timeZone: "Europe/Lisbon",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
/** Instante em hora de Lisboa, com a hora (C, H, D e tudo o resto). */
const lisbon = (iso: string | null | undefined) => (iso ? LISBON_DT.format(new Date(iso)) : "—");

const LISBON_YMD = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit" });
const lisbonYmd = (d: Date) => LISBON_YMD.format(d);

/** Datas de estadia (AAAA-MM-DD, sem hora) em DD/MM/AAAA. */
const stayDay = (ymd: string | null | undefined) => {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
};

function daysBetween(fromIso: string | null | undefined, toIso: string): number | null {
  if (!fromIso) return null;
  return Math.floor((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);
}

function cardLabel(brand: string | null, last4: string | null): string {
  if (!last4) return "—";
  const b = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : "Cartão";
  return `${b} ••••${last4}`;
}

/** Para onde vai o reembolso, pelos cartões que o servidor leu dos
 *  pagamentos (1.ª parte e, se paga, 2.ª), nunca pelo cartão atual da linha:
 *  depois de "Usar outro cartão" são cartões diferentes. */
function refundCardsText(cards: string[]): string {
  if (cards.length === 0) return "para o cartão com que o hóspede pagou";
  if (cards.length === 1) return `para o cartão ••••${cards[0]}`;
  const head = cards.slice(0, -1).map((c) => `••••${c}`).join(", ");
  return `para os cartões ${head} e ••••${cards[cards.length - 1]}`;
}

/** "1.200,50" ou "1200.50" → cêntimos; null se não for um valor positivo. */
function parseEuros(text: string): number | null {
  let s = text.replace(/[\s€]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "");
  s = s.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return cents > 0 ? cents : null;
}

/* ════════════════════════════════════════════════════════════════
   Vocabulário (o mesmo do runbook e do digest)
   ════════════════════════════════════════════════════════════════ */

type GroupKey = "agendado" | "hospede" | "nos" | "fechado";

const STATUS_INFO: Record<Status, { label: string; group: GroupKey; tone: string }> = {
  scheduled: { label: "Agendada", group: "agendado", tone: "bg-sky-50 text-sky-800 border-sky-200" },
  charging: { label: "A cobrar agora", group: "agendado", tone: "bg-violet-50 text-violet-800 border-violet-200" },
  retry: { label: "Nova tentativa marcada", group: "hospede", tone: "bg-amber-50 text-amber-900 border-amber-200" },
  needs_action: { label: "À espera do hóspede", group: "hospede", tone: "bg-amber-50 text-amber-900 border-amber-200" },
  needs_review: { label: "A rever", group: "nos", tone: "bg-red-50 text-red-800 border-red-200" },
  cancelling: { label: "A cancelar", group: "nos", tone: "bg-violet-50 text-violet-800 border-violet-200" },
  succeeded: { label: "Paga pela plataforma", group: "fechado", tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  paid_externally: { label: "Paga fora da plataforma", group: "fechado", tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  cancelled_unpaid: { label: "Cancelada por falta de pagamento", group: "fechado", tone: "bg-stone-100 text-stone-700 border-stone-200" },
  cancelled_by_guest: { label: "Cancelada pelo hóspede", group: "fechado", tone: "bg-stone-100 text-stone-700 border-stone-200" },
};

const GROUPS: Array<{ key: GroupKey; label: string; hint: string; statuses: Status[] }> = [
  { key: "agendado", label: "AGENDADO", hint: "Nada falhou: o sistema cobra na data.", statuses: ["scheduled", "charging"] },
  { key: "hospede", label: "A RESOLVER PELO HÓSPEDE", hint: "O banco recusou; o hóspede tem o link para resolver.", statuses: ["retry", "needs_action"] },
  { key: "nos", label: "A RESOLVER POR NÓS", hint: "Precisa de uma decisão aqui, com prazo.", statuses: ["needs_review", "cancelling"] },
  { key: "fechado", label: "FECHADAS", hint: "Pagas ou canceladas.", statuses: ["succeeded", "paid_externally", "cancelled_unpaid", "cancelled_by_guest"] },
];

const DECLINE_KIND: Record<string, string> = {
  soft: "recusa temporária",
  hard: "recusa definitiva (outro cartão)",
  auth: "o banco pede confirmação (3DS)",
};

const DECLINE_CODE: Record<string, string> = {
  insufficient_funds: "saldo insuficiente",
  card_velocity_exceeded: "limite do cartão atingido",
  try_again_later: "banco indisponível",
  generic_decline: "recusa do banco",
  do_not_honor: "recusa do banco",
  processing_error: "erro de processamento",
  authentication_required: "confirmação 3DS pedida",
  expired_card: "cartão expirado",
  lost_card: "cartão bloqueado",
  stolen_card: "cartão bloqueado",
  pickup_card: "cartão bloqueado",
  fraudulent: "cartão bloqueado",
  card_not_supported: "cartão não aceite",
};

/** O que o servidor gravou em refund_status (Stripe, ou "manual" quando a
 *  equipa resolveu por outra via). Fora destes, o reembolso falhou. */
const REFUND_STATUS: Record<string, string> = {
  succeeded: "feito",
  pending: "em curso na Stripe",
  nothing: "nada a devolver",
  manual: "falhou na Stripe, resolvido à mão",
};

const ACTION_LABEL: Record<string, string> = {
  resend_link: "Reenviou o link",
  charge_now: "Cobrar agora",
  mark_paid_externally: "Marcou pago fora da plataforma",
  pause: "Pausou",
  resume: "Retomou",
  cancel_and_refund: "Cancelar e devolver",
  continue_cancellation: "Continuou o cancelamento",
  mark_credit_note: "Registou a nota de crédito",
  mark_refund_resolved: "Marcou o reembolso como resolvido à mão",
};

/** Porque é que a véspera de H fechou sem o E3b (estágio 3), pelo que a
 *  linha mostra: o motor não grava o motivo. */
function stage3Reason(email: string | null | undefined, noticeSentAt: string | null | undefined, hardStopAt: string): string {
  if (!email) return "a reserva não tem email do hóspede";
  const sent = noticeSentAt ? Date.parse(noticeSentAt) : NaN;
  if (Number.isFinite(sent) && sent + 7 * 86_400_000 > Date.parse(hardStopAt)) {
    return "os 7 dias de aviso não cabem antes de H (em H vai para decisão humana, nada cancela sozinho)";
  }
  return "a véspera passou sem o aviso sair (sistema parado ou link por gerar); ver o alerta de ops desse dia";
}

function reviewReasonLabel(reason: string | null): string | null {
  if (!reason) return null;
  if (reason === "cancel:guest") return "cancelamento pela política do hóspede";
  if (reason === "cancel:admin") return "cancelamento pela equipa (devolve tudo)";
  if (reason === "cancel:unpaid") return "cancelamento por falta de pagamento (devolve tudo)";
  return reason;
}

/** O cancelamento pela equipa ("Devolver tudo") fecha em cancelled_by_guest
 *  com o motivo cancel:admin: no ecrã diz quem cancelou de verdade. */
function statusLabel(status: Status, reviewReason?: string | null): string {
  if (status === "cancelled_by_guest" && reviewReason === "cancel:admin") return "Cancelada pela equipa";
  return STATUS_INFO[status]?.label ?? status;
}

function StatusBadge({ status, reviewReason }: { status: Status; reviewReason?: string | null }) {
  const info = STATUS_INFO[status];
  return <Badge variant="outline" className={`text-xs ${info?.tone ?? ""}`}>{statusLabel(status, reviewReason)}</Badge>;
}

/* ════════════════════════════════════════════════════════════════
   Página
   ════════════════════════════════════════════════════════════════ */

export default function AdminBalances() {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const statuses = useMemo<Status[] | undefined>(() => {
    if (filter === "all") return undefined;
    if (filter.startsWith("group:")) return GROUPS.find((g) => `group:${g.key}` === filter)?.statuses;
    return [filter as Status];
  }, [filter]);

  const listQ = trpc.balanceAdmin.list.useQuery({ statuses, limit: 500 });
  const data = listQ.data;
  const counts = data?.counts;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const groupCount = (g: (typeof GROUPS)[number]) => g.statuses.reduce((n, s) => n + (counts?.[s] ?? 0), 0);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) =>
      [r.confirmationCode, r.reservationId, r.guestEmail, r.propertyName, r.cardLast4]
        .some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [data?.rows, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Saldos</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Segundas partes das reservas pagas em duas partes. Tudo o que precisa de ação está aqui, nunca no Guesty:
            nunca "Charge now", nunca payment link do Guesty, nunca dividir pagamentos à mão, nunca aceitar cartão por
            telefone, WhatsApp ou email (reenvia-se o link).
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => listQ.refetch()} disabled={listQ.isFetching}>
          <RefreshCw className={`h-4 w-4 ${listQ.isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {data && !data.livemode && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Modo de teste: este servidor usa a Stripe de teste. Estas linhas não são reservas reais.
        </div>
      )}
      {data && !data.chargesEnabled && (
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          Cobranças desligadas neste servidor (CHECKOUT_BALANCE): nada é cobrado automaticamente nem pelo botão
          "Cobrar agora". Cancelar, devolver, pausar e marcar pago continuam disponíveis.
        </div>
      )}

      {/* Grupos do runbook, com contagens de todas as linhas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {GROUPS.map((g) => {
          const active = filter === `group:${g.key}`;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => setFilter(active ? "all" : `group:${g.key}`)}
              className={`rounded-lg border p-4 text-left transition-colors ${active ? "border-[#1A1A18] bg-muted/40" : "hover:bg-muted/30"}`}
            >
              <p className="text-[11px] font-semibold tracking-wide text-muted-foreground">{g.label}</p>
              <p className={`text-2xl font-semibold ${g.key === "nos" && groupCount(g) > 0 ? "text-red-700" : ""}`}>
                {counts ? groupCount(g) : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{g.hint}</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[280px] h-9">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados ({total})</SelectItem>
            {GROUPS.map((g) => (
              <SelectItem key={g.key} value={`group:${g.key}`}>{g.label} ({groupCount(g)})</SelectItem>
            ))}
            {(Object.keys(STATUS_INFO) as Status[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_INFO[s].label} ({counts?.[s] ?? 0})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Código, email, casa ou ••••1234"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      <div className="rounded-lg border border-border/50 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead>Estado</TableHead>
              <TableHead>Reserva</TableHead>
              <TableHead>Hóspede</TableHead>
              <TableHead className="text-right">2.ª parte</TableHead>
              <TableHead>Cobrança (C)</TableHead>
              <TableHead>Prazo (H)</TableHead>
              <TableHead>Tentativas</TableHead>
              <TableHead>Idade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full max-w-[160px]" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : listQ.error ? (
              <TableRow>
                <TableCell colSpan={8} className="text-sm text-red-700 py-8 text-center">
                  Não foi possível ler os saldos: {listQ.error.message}
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-sm text-muted-foreground py-10 text-center">
                  {total === 0 ? "Ainda não há reservas em duas partes." : "Nenhuma linha com este filtro."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <ListLine key={r.id} row={r} now={data!.now} onOpen={() => setSelectedId(r.id)} />
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {data && data.rows.length >= 500 && (
        <p className="text-xs text-muted-foreground">Mostram-se as primeiras 500 linhas deste filtro.</p>
      )}

      <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selectedId && <BalanceDetail id={selectedId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ListLine({ row, now, onOpen }: { row: ListRow; now: string; onOpen: () => void }) {
  const age = daysBetween(row.createdAt, now);
  const review = row.status === "needs_review";
  return (
    <TableRow className="cursor-pointer hover:bg-muted/30" onClick={onOpen}>
      <TableCell><StatusBadge status={row.status} reviewReason={row.reviewReason} /></TableCell>
      <TableCell>
        <p className="font-medium text-sm">{row.confirmationCode || row.reservationId}</p>
        <p className="text-xs text-muted-foreground">{row.propertyName || row.listingId}</p>
        <p className="text-xs text-muted-foreground">{stayDay(row.checkIn)} → {stayDay(row.checkOut)}</p>
      </TableCell>
      <TableCell className="text-sm">{row.guestEmail || "—"}</TableCell>
      <TableCell className="text-right">
        <p className="text-sm font-medium">{money(row.balanceCents)}</p>
        <p className="text-xs text-muted-foreground">{cardLabel(row.cardBrand, row.cardLast4)}</p>
      </TableCell>
      <TableCell className="text-sm whitespace-nowrap">{lisbon(row.chargeAt)}</TableCell>
      <TableCell className="text-sm whitespace-nowrap">{lisbon(row.hardStopAt)}</TableCell>
      <TableCell className="text-xs">
        <p>{row.attempts}</p>
        {row.lastDeclineKind && <p className="text-muted-foreground">{DECLINE_KIND[row.lastDeclineKind]}</p>}
      </TableCell>
      <TableCell className="text-xs">
        <p>{age == null ? "—" : age === 0 ? "reservada hoje" : `reservada há ${age} d`}</p>
        {review && row.reviewDueAt && <p className="text-red-700">decidir até {lisbon(row.reviewDueAt)}</p>}
        {review && row.reviewReason && <p className="text-muted-foreground max-w-[220px]">{reviewReasonLabel(row.reviewReason)}</p>}
      </TableCell>
    </TableRow>
  );
}

/* ════════════════════════════════════════════════════════════════
   Detalhe
   ════════════════════════════════════════════════════════════════ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      <div className="rounded-lg border p-3 text-sm space-y-1.5">{children}</div>
    </section>
  );
}

function Field({ label, children, warn }: { label: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right ${warn ? "text-red-700 font-medium" : ""}`}>{children}</span>
    </div>
  );
}

function yesNo(v: boolean) {
  return v ? "sim" : "não";
}

function BalanceDetail({ id }: { id: string }) {
  const detailQ = trpc.balanceAdmin.detail.useQuery({ id });
  const [action, setAction] = useState<ActionKind | null>(null);
  const d = detailQ.data;

  if (detailQ.isLoading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (detailQ.error || !d) {
    return <div className="p-6 text-sm text-red-700">Não foi possível abrir a linha: {detailQ.error?.message ?? "sem dados"}</div>;
  }

  const r = d.row;
  const g = d.gates;
  const notices = d.notices;
  const reminder = notices.reminderStage;

  return (
    <div className="p-6 space-y-5">
      <SheetHeader className="p-0">
        <SheetTitle className="flex items-center gap-3 flex-wrap">
          <span>{r.confirmationCode || r.reservationId}</span>
          <StatusBadge status={r.status} reviewReason={r.reviewReason} />
        </SheetTitle>
        <SheetDescription>
          {r.propertyName || r.listingId} · {stayDay(r.checkIn)} → {stayDay(r.checkOut)}
        </SheetDescription>
      </SheetHeader>

      {r.status === "needs_review" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">A rever: {reviewReasonLabel(r.reviewReason) ?? "sem motivo"}</p>
            <p>Decidir até {lisbon(r.reviewDueAt)}. Em revisão nada é cobrado nem cancelado automaticamente.</p>
          </div>
        </div>
      )}

      <Section title="Hóspede">
        <Field label="Nome">{d.guestName ?? "—"}</Field>
        <Field label="Email">{r.guestEmail ?? "—"}</Field>
        <Field label="Telefone">{r.guestPhone ?? "—"}</Field>
        <Field label="Língua">{r.locale ?? "—"}</Field>
      </Section>

      <Section title="Valores">
        <Field label="Pago na 1.ª parte">{money(r.depositCents)}</Field>
        <Field label="· metade da estadia">{money(r.depositStayCents)}</Field>
        <Field label="· receção, extras e Flex">{money(r.servicesCents)}</Field>
        <Field label="2.ª parte (saldo)"><strong>{money(r.balanceCents)}</strong></Field>
        <Field label="Cartão (para a 2.ª parte)">{cardLabel(r.cardBrand, r.cardLast4)}</Field>
        {r.cardExpiresBeforeCharge && <Field label="Validade" warn>o cartão expira antes da data da cobrança</Field>}
        <Field label="Política">{r.policyCode}</Field>
        {r.paidExternallyRef && <Field label="Pago fora (ref.)">{r.paidExternallyRef}</Field>}
        {r.refundCents != null && <Field label="Reembolsado">{money(r.refundCents)}</Field>}
        {r.refundStatus && (
          <Field label="Estado do reembolso" warn={r.refundFailed}>
            {r.refundFailed ? `FALHOU na Stripe (${r.refundStatus}): devolver por outra via e marcar resolvido` : (REFUND_STATUS[r.refundStatus] ?? r.refundStatus)}
          </Field>
        )}
        {r.creditNoteRef && <Field label="Nota de crédito">{r.creditNoteRef}</Field>}
      </Section>

      <Section title="Datas (hora de Lisboa)">
        <Field label="C · 2.ª cobrança">{lisbon(r.chargeAt)}</Field>
        <Field label="H · cancela e devolve se não pago">{lisbon(r.hardStopAt)}</Field>
        <Field label="D · fim do cancelamento gratuito">{lisbon(r.freeCancelDeadlineAt)}</Field>
        <Field label="Próxima ação do sistema">{lisbon(r.nextAttemptAt)}</Field>
        {r.helpPausedUntil && <Field label="Pausada até">{lisbon(r.helpPausedUntil)}</Field>}
        {r.succeededAt && <Field label="Paga a">{lisbon(r.succeededAt)}</Field>}
        {r.cancelledAt && <Field label="Cancelada a">{lisbon(r.cancelledAt)}</Field>}
        <Field label="Reservada a">{lisbon(r.createdAt)}</Field>
      </Section>

      <Section title="Tentativas de cobrança">
        <Field label="Tentativas">{r.attempts}</Field>
        <Field label="Última recusa">
          {r.lastDeclineCode
            ? `${DECLINE_CODE[r.lastDeclineCode] ?? r.lastDeclineCode}${r.lastDeclineKind ? ` · ${DECLINE_KIND[r.lastDeclineKind]}` : ""}`
            : "—"}
        </Field>
        <Field label="Último erro">{r.lastError ?? "—"}</Field>
        <Field label="Última tentativa por">{r.claimSource ? `${r.claimSource} · ${lisbon(r.claimedAt)}` : "—"}</Field>
        {r.guestActive && <Field label="Hóspede na página" warn>a pagar ou a trocar de cartão (há menos de 1 hora)</Field>}
      </Section>

      <Section title="Avisos enviados ao hóspede">
        <Field label="E1 · falta uma semana (C−7)">{reminder >= 1 ? "tratado (enviado, ou saltado numa reserva recente)" : "ainda não"}</Field>
        <Field label="E2 · amanhã (C−1)">{reminder >= 2 ? "tratado" : "ainda não"}</Field>
        <Field label="E3 · a cobrança falhou">{notices.failureNoticeSentAt ? `enviado a ${lisbon(notices.failureNoticeSentAt)}` : notices.failureNoticeStage >= 1 ? "a enviar" : "não"}</Field>
        <Field label="E3b · véspera do prazo H" warn={notices.failureNoticeStage === 3}>
          {notices.failureNoticeStage === 2
            ? "enviado"
            : notices.failureNoticeStage === 3
              ? `véspera fechada sem email: ${stage3Reason(r.guestEmail, notices.failureNoticeSentAt, r.hardStopAt)}`
              : "não"}
        </Field>
        <Field label="E4 · paga na totalidade">{notices.paidEmailAt ? lisbon(notices.paidEmailAt) : "não"}</Field>
        <Field label="E5/E7 · reserva cancelada">{notices.cancelEmailAt ? lisbon(notices.cancelEmailAt) : "não"}</Field>
      </Section>

      <Section title="Guesty (última leitura gravada)">
        <Field label="Estado">{d.guesty.status ?? "—"}</Field>
        <Field label="Datas no Guesty" warn={d.guesty.datesDiffer}>
          {d.guesty.checkIn ? `${stayDay(d.guesty.checkIn)} → ${stayDay(d.guesty.checkOut)}` : "—"}
          {d.guesty.datesDiffer && " (diferentes das da reserva)"}
        </Field>
        {d.guesty.listingDiffers && <Field label="Casa no Guesty" warn>{d.guesty.listingId} (diferente)</Field>}
        <Field label="Total no Guesty">{money(d.guesty.totalCents)}</Field>
        <Field label="Pago no Guesty">{money(d.guesty.totalPaidCents)}</Field>
        <Field label="Pendentes de terceiros" warn={(d.guesty.pendingForeignCents ?? 0) > 0}>{money(d.guesty.pendingForeignCents)}</Field>
        <Field label="Lida a">{lisbon(d.guesty.lastReconciledAt)}</Field>
        {d.guesty.lastReconcileError && <Field label="Última leitura falhada" warn>{d.guesty.lastReconcileError}</Field>}
        <Field label="2.ª parte registada no Guesty">{d.effects.guestyBalanceRecordedAt ? lisbon(d.effects.guestyBalanceRecordedAt) : "não"}</Field>
        {d.effects.guestyCancelledAt && <Field label="Cancelada no Guesty">{lisbon(d.effects.guestyCancelledAt)}</Field>}
      </Section>

      <Section title="O que o hóspede vê na página do saldo">
        <Field label="Pode pagar já">{yesNo(d.guestView.canPayNow)}</Field>
        <Field label="Pode confirmar no mesmo cartão (3DS)">{yesNo(d.guestView.canConfirmSameCard)}</Field>
        <Field label="Pode usar outro cartão">{yesNo(d.guestView.canChangeCard)}</Field>
        <Field label="Pode cancelar grátis">{yesNo(d.guestView.canCancelFree)}</Field>
        <Field label="Pode pedir ajuda">{yesNo(d.guestView.canRequestHelp)}</Field>
      </Section>

      <Section title="Stripe (para procurar)">
        <Field label="PI da 1.ª parte"><code className="text-xs">{r.depositPaymentIntentId}</code></Field>
        {r.balancePaymentIntentId && <Field label="PI da 2.ª parte"><code className="text-xs">{r.balancePaymentIntentId}</code></Field>}
        {r.guestPaymentIntentId && <Field label="PI do hóspede (página)"><code className="text-xs">{r.guestPaymentIntentId}</code></Field>}
        {r.refundId && <Field label="Reembolso"><code className="text-xs">{r.refundId}</code></Field>}
      </Section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ações</h3>
        <div className="rounded-lg border divide-y">
          <ActionLine icon={Link2} label="Reenviar link" gate={g.resendLink} onClick={() => setAction("resendLink")}
            what="Email ao hóspede com o link da página do saldo. Não mexe no dinheiro." />
          <ActionLine icon={CreditCard} label="Cobrar agora" gate={g.chargeNow} onClick={() => setAction("chargeNow")}
            what={`Cobra ${money(r.balanceCents)} já, no ${cardLabel(r.cardBrand, r.cardLast4)}.`} />
          <ActionLine icon={Wallet} label="Marcar pago fora da plataforma" gate={g.markPaidExternally} onClick={() => setAction("markPaidExternally")}
            what="O hóspede pagou por outra via (transferência): a plataforma deixa de cobrar." />
          <ActionLine icon={Pause} label="Pausar até…" gate={g.pause} onClick={() => setAction("pause")}
            what="Nada é cobrado nem cancelado até uma data; depois alguém decide." />
          <ActionLine icon={Play} label="Retomar" gate={g.resume} onClick={() => setAction("resume")}
            what="Volta a pôr a linha na automação." />
          <ActionLine icon={Ban} label="Cancelar e devolver" danger
            gate={g.cancelFull.allowed || g.cancelPolicy.allowed ? { allowed: true, reason: null } : g.cancelPolicy}
            onClick={() => setAction("cancel")}
            what="Cancela a reserva no Guesty e devolve o dinheiro ao cartão." />
          {g.continueCancellation.allowed && (
            <ActionLine icon={RefreshCw} label="Continuar cancelamento" gate={g.continueCancellation} onClick={() => setAction("continueCancellation")}
              what="Repete os passos do cancelamento que ficaram por fazer." />
          )}
          {g.markRefundResolved.allowed && (
            <ActionLine icon={Wallet} label="Reembolso resolvido à mão" gate={g.markRefundResolved} onClick={() => setAction("markRefundResolved")}
              what="O reembolso falhou na Stripe e foi devolvido por outra via (transferência, por exemplo)." />
          )}
          {g.markCreditNote.allowed && (
            <ActionLine icon={FileText} label="Registar nota de crédito" gate={g.markCreditNote} onClick={() => setAction("markCreditNote")}
              what="Número da nota de crédito emitida pela Hostkit." />
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Histórico de ações</h3>
        {d.actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém agiu nesta linha pelo ecrã Saldos.</p>
        ) : (
          <ul className="rounded-lg border divide-y text-sm">
            {d.actions.map((a) => {
              const result = (a.details as any)?.result;
              return (
                <li key={a.id} className="p-3 space-y-1">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium">{ACTION_LABEL[a.action] ?? a.action}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{lisbon(a.createdAt)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.userEmail ?? (a.userId != null ? `utilizador #${a.userId}` : "—")}
                    {result?.outcome ? ` · resultado: ${result.outcome}` : " · sem resultado registado"}
                  </p>
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">Dados</summary>
                    <pre className="mt-1 whitespace-pre-wrap break-all bg-muted/40 rounded p-2">{JSON.stringify(a.details, null, 2)}</pre>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {action && <ActionDialog kind={action} detail={d} onClose={() => setAction(null)} />}
    </div>
  );
}

function ActionLine({
  icon: Icon,
  label,
  what,
  gate,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  what: string;
  gate: { allowed: boolean; reason: string | null };
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-3">
      <Button
        size="sm"
        variant={danger ? "destructive" : "outline"}
        className="gap-2 min-w-[210px] justify-start"
        disabled={!gate.allowed}
        onClick={onClick}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Button>
      <p className={`text-xs pt-1.5 ${gate.allowed ? "text-muted-foreground" : "text-stone-600"}`}>
        {gate.allowed ? what : `Indisponível: ${gate.reason}`}
      </p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Modais das ações: o que acontece ao dinheiro, e a confirmação
   ════════════════════════════════════════════════════════════════ */

const WORDS = {
  chargeNow: "COBRAR", markPaidExternally: "PAGO", cancel: "CANCELAR", continueCancellation: "CANCELAR", markRefundResolved: "RESOLVIDO",
} as const;

function ActionDialog({ kind, detail, onClose }: { kind: ActionKind; detail: DetailOut; onClose: () => void }) {
  const utils = trpc.useUtils();
  const r = detail.row;
  const g = detail.gates;
  const now = detail.now;

  const [word, setWord] = useState("");
  const [guestRequested, setGuestRequested] = useState(false);
  const [amount, setAmount] = useState(((r.balanceCents ?? 0) / 100).toFixed(2).replace(".", ","));
  const [paidOn, setPaidOn] = useState(lisbonYmd(new Date(now)));
  const [ref, setRef] = useState("");
  const [acceptShortfall, setAcceptShortfall] = useState(false);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"full" | "policy" | null>(
    g.cancelPolicy.allowed && !g.cancelFull.allowed ? "policy" : g.cancelFull.allowed && !g.cancelPolicy.allowed ? "full" : null,
  );
  const [creditRef, setCreditRef] = useState(r.creditNoteRef ?? "");
  const [refundRef, setRefundRef] = useState("");

  const done = (res: { message?: string; ok?: boolean }) => {
    if (res.ok === false) toast.warning(res.message ?? "Ação feita com aviso.", { duration: 12_000 });
    else toast.success(res.message ?? "Feito.", { duration: 8_000 });
    void utils.balanceAdmin.list.invalidate();
    void utils.balanceAdmin.detail.invalidate({ id: r.id });
    onClose();
  };
  const fail = (err: { message: string }) => {
    toast.error(err.message, { duration: 12_000 });
    void utils.balanceAdmin.detail.invalidate({ id: r.id });
  };

  const resendM = trpc.balanceAdmin.resendLink.useMutation({ onSuccess: done, onError: fail });
  const chargeM = trpc.balanceAdmin.chargeNow.useMutation({ onSuccess: done, onError: fail });
  const paidM = trpc.balanceAdmin.markPaidExternally.useMutation({ onSuccess: done, onError: fail });
  const pauseM = trpc.balanceAdmin.pause.useMutation({ onSuccess: done, onError: fail });
  const resumeM = trpc.balanceAdmin.resume.useMutation({ onSuccess: done, onError: fail });
  const cancelM = trpc.balanceAdmin.cancelAndRefund.useMutation({ onSuccess: done, onError: fail });
  const continueM = trpc.balanceAdmin.continueCancellation.useMutation({ onSuccess: done, onError: fail });
  const creditM = trpc.balanceAdmin.markCreditNote.useMutation({ onSuccess: done, onError: fail });
  const refundM = trpc.balanceAdmin.markRefundResolved.useMutation({ onSuccess: done, onError: fail });
  const pending = [resendM, chargeM, paidM, pauseM, resumeM, cancelM, continueM, creditM, refundM].some((m) => m.isPending);

  const needWord = kind in WORDS ? WORDS[kind as keyof typeof WORDS] : null;
  const wordOk = !needWord || word.trim().toUpperCase() === needWord;

  const amountCents = parseEuros(amount);
  const shortfall = amountCents != null ? r.balanceCents - amountCents : 0;
  const todayYmd = lisbonYmd(new Date(now));
  const maxPauseYmd = lisbonYmd(new Date(r.freeCancelDeadlineAt));
  const beforeC = Date.parse(now) < Date.parse(r.chargeAt);
  const holdForGuest = r.lastDeclineKind === "hard" || r.lastDeclineKind === "auth";

  let title = "";
  let body: React.ReactNode = null;
  let valid = wordOk;
  let submit: () => void = () => {};

  switch (kind) {
    case "resendLink":
      title = "Reenviar o link ao hóspede";
      body = (
        <p>
          Envia para <strong>{r.guestEmail}</strong> um email com o link da página do saldo, onde o hóspede pode pagar,
          usar outro cartão, cancelar dentro do prazo ou pedir ajuda. <strong>Não mexe no dinheiro.</strong> Sai mesmo
          que tenha saído outro há pouco; o resultado diz se o email foi aceite ou não.
        </p>
      );
      submit = () => resendM.mutate({ id: r.id });
      break;

    case "chargeNow":
      title = `Cobrar ${money(r.balanceCents)} agora`;
      body = (
        <>
          <p>
            Cobra <strong>{money(r.balanceCents)}</strong> já, no <strong>{cardLabel(r.cardBrand, r.cardLast4)}</strong>,
            sem o hóspede presente. Antes de cobrar, o sistema confirma no Guesty que a reserva está confirmada e que
            ninguém pagou por fora; se não estiver, não cobra.
          </p>
          <p>
            Se o banco recusar, <strong>nada é cobrado</strong>. Numa recusa temporária (por exemplo, saldo insuficiente)
            as novas tentativas automáticas mantêm-se, como o hóspede foi avisado. Numa recusa definitiva, num pedido de
            confirmação (3DS), ou sem nova tentativa marcada, a linha passa a "à espera do hóspede", que recebe o aviso
            com o link, e não há mais tentativas automáticas. O prazo H ({lisbon(r.hardStopAt)}) mantém-se.
          </p>
          {detail.chargeNeedsGuestRequest && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2 text-amber-900">
              <p>{detail.chargeNeedsGuestRequest}</p>
              <label className="flex items-center gap-2">
                <Checkbox checked={guestRequested} onCheckedChange={(v) => setGuestRequested(v === true)} />
                <span>O hóspede pediu esta cobrança (por escrito)</span>
              </label>
            </div>
          )}
        </>
      );
      valid = wordOk && (!detail.chargeNeedsGuestRequest || guestRequested);
      submit = () => chargeM.mutate({ id: r.id, confirm: WORDS.chargeNow, guestRequested, expectedStatus: r.status });
      break;

    case "markPaidExternally":
      title = "Marcar a 2.ª parte como paga fora da plataforma";
      body = (
        <>
          <p>
            Para quando o hóspede pagou a 2.ª parte ({money(r.balanceCents)}) por outra via, por exemplo transferência.
            A plataforma <strong>deixa de cobrar</strong> e o prazo H deixa de valer. Nada é cobrado nem devolvido. Um
            pagamento do saldo que esteja aberto na Stripe é cancelado antes; se a plataforma já tiver cobrado, a linha
            não é marcada e o aviso diz o que fazer.
          </p>
          <p className="text-muted-foreground">
            O pagamento não é registado no Guesty por aqui: fica só uma nota na reserva.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="paid-amount">Valor recebido (€)</Label>
              <Input id="paid-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="paid-on">Recebido a</Label>
              <Input id="paid-on" type="date" max={todayYmd} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="paid-ref">Referência (transferência, recibo…)</Label>
            <Input id="paid-ref" maxLength={80} value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          {amountCents != null && shortfall > 100 && (
            <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
              <Checkbox className="mt-0.5" checked={acceptShortfall} onCheckedChange={(v) => setAcceptShortfall(v === true)} />
              <span>
                O valor recebido é {money(shortfall)} abaixo do saldo. Aceito a diferença (por exemplo, comissões da
                transferência) e a plataforma não cobra o resto.
              </span>
            </label>
          )}
        </>
      );
      valid = wordOk && amountCents != null && !!paidOn && paidOn <= todayYmd && ref.trim().length >= 2 && (shortfall <= 100 || acceptShortfall);
      submit = () => paidM.mutate({
        id: r.id, ref: ref.trim(), amountCents: amountCents!, paidOn, acceptShortfall, confirm: WORDS.markPaidExternally, expectedStatus: r.status,
      });
      break;

    case "pause":
      title = "Pausar até uma data";
      body = (
        <>
          <p>
            Até ao fim do dia escolhido (23:59, hora de Lisboa) <strong>nada é cobrado nem cancelado</strong>
            automaticamente, incluindo o prazo H. No fim da pausa a linha <strong>não volta sozinha</strong>: fica "a
            rever" e alguém tem de Retomar, Marcar pago ou Cancelar e devolver. Nunca para lá do fim do cancelamento
            gratuito ({lisbon(r.freeCancelDeadlineAt)}).
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pause-until">Pausar até</Label>
              <Input id="pause-until" type="date" min={todayYmd} max={maxPauseYmd} value={until} onChange={(e) => setUntil(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pause-reason">Motivo</Label>
              <Input id="pause-reason" maxLength={100} placeholder="ex.: transferência prometida" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          </div>
        </>
      );
      valid = !!until && until >= todayYmd && until <= maxPauseYmd;
      submit = () => pauseM.mutate({ id: r.id, until, reason: reason.trim() || undefined });
      break;

    case "resume":
      title = "Retomar a automação";
      body = holdForGuest ? (
        <p>
          O banco recusou este cartão ({r.lastDeclineKind ? DECLINE_KIND[r.lastDeclineKind] : "recusa"}), por isso a linha
          volta a <strong>"à espera do hóspede"</strong>: não há cobrança automática; o hóspede paga ou troca de cartão
          pelo link. Se não pagar, a reserva é cancelada e devolvida no prazo H ({lisbon(r.hardStopAt)}).
        </p>
      ) : beforeC ? (
        <p>
          Volta a <strong>agendada</strong>: cobra {money(r.balanceCents)} no {cardLabel(r.cardBrand, r.cardLast4)} a{" "}
          {lisbon(r.chargeAt)}, como o hóspede autorizou.
        </p>
      ) : (
        <p>
          A data da cobrança já passou: a próxima passagem do sistema (até 10 minutos) tenta cobrar{" "}
          <strong>{money(r.balanceCents)}</strong> no {cardLabel(r.cardBrand, r.cardLast4)}. O prazo H ({lisbon(r.hardStopAt)}) mantém-se.
        </p>
      );
      submit = () => resumeM.mutate({ id: r.id });
      break;

    case "cancel": {
      title = "Cancelar a reserva e devolver";
      // Valores e cartões calculados no servidor com as regras do reembolso
      // real (refundRemaining / guestRefundPlan): o browser nunca recalcula.
      const p = detail.refundPreview;
      const cards = p ? refundCardsText(p.refundCardsLast4) : null;
      const afterD = Date.parse(now) > Date.parse(r.freeCancelDeadlineAt);
      const flex = p?.policy.flexCents ?? 0;
      const withheld = p?.policy.flexWithheldCents ?? 0;
      body = (
        <>
          <p>
            <strong>Irreversível:</strong> cancela a reserva no Guesty (a casa fica livre para revenda) e devolve o
            dinheiro pela Stripe{cards ? <>, {cards}</> : null}. Se a 2.ª parte for paga nesse mesmo instante, nada é
            cancelado.
          </p>
          {p ? (
            <p className="text-xs text-muted-foreground">Valores calculados a {lisbon(now)} a partir dos pagamentos na Stripe.</p>
          ) : (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
              Não foi possível ler agora os pagamentos na Stripe: o valor exato e os cartões saem no resultado.
            </p>
          )}
          <div className="space-y-2">
            <ModeOption
              selected={mode === "full"}
              gate={g.cancelFull}
              onSelect={() => setMode("full")}
              title="Devolver tudo (cancelamento pela equipa)"
              text={
                <>
                  Devolve tudo o que o hóspede pagou pela plataforma, sem retenção:{" "}
                  <strong>{money(p ? p.full.totalCents : r.depositCents)}</strong>
                  {p ? <> {cards}</> : <> (1.ª parte: estadia, receção, extras e Flex)</>}. O hóspede recebe o email
                  "Cancelámos a sua reserva e devolvemos {money(p ? p.full.totalCents : r.depositCents)}{" "}
                  {cards ?? "para o cartão com que pagou"}", sem dizer que foi a pedido dele nem por falta de pagamento.
                  {afterD && <> O cancelamento gratuito já terminou: devolver tudo é uma decisão da gestão.</>}
                  {/por fora/i.test(r.reviewReason ?? "") && (
                    <span className="mt-1 block font-medium text-amber-900">
                      O Guesty mostra também um pagamento por outra via ({reviewReasonLabel(r.reviewReason)}). Esse valor não
                      sai por aqui: devolvê-lo à mão (transferência ou link do Guesty) e dizê-lo ao hóspede.
                    </span>
                  )}
                </>
              }
            />
            <ModeOption
              selected={mode === "policy"}
              gate={g.cancelPolicy}
              onSelect={() => setMode("policy")}
              title="Pela política do hóspede (dentro do cancelamento gratuito)"
              text={
                p ? (
                  <>
                    Devolve <strong>{money(p.policy.totalCents)}</strong> {cards}
                    {flex > 0 && (withheld > 0
                      ? <>: fica retido o Flex ({money(withheld)}), porque passaram mais de 14 dias desde o pagamento da 1.ª parte</>
                      : <>, com o Flex ({money(flex)}) incluído, porque ainda não passaram 14 dias desde o pagamento da 1.ª parte</>)}
                    . O hóspede recebe o email de cancelamento a pedido dele.
                  </>
                ) : (
                  <>
                    Devolve a 1.ª parte{r.succeededAt ? " e a 2.ª parte já cobrada" : ""}, menos o Flex (se o houver)
                    quando passaram mais de 14 dias desde o pagamento da 1.ª parte. O valor exato sai dos pagamentos na
                    Stripe e aparece no resultado. O hóspede recebe o email de cancelamento a pedido dele.
                  </>
                )
              }
            />
          </div>
        </>
      );
      valid = wordOk && !!mode && (mode === "full" ? g.cancelFull.allowed : g.cancelPolicy.allowed);
      submit = () => mode && cancelM.mutate({ id: r.id, mode, confirm: WORDS.cancel, expectedStatus: r.status });
      break;
    }

    case "continueCancellation":
      title = "Continuar o cancelamento";
      body = (
        <p>
          Repete os passos que ficaram por fazer: fechar pagamentos abertos, cancelar no Guesty, reembolso e email ao
          hóspede. Cada passo só corre uma vez; o que já foi feito não se repete.
          {r.reviewReason && <> Tipo: {reviewReasonLabel(r.reviewReason)}.</>}
        </p>
      );
      submit = () => continueM.mutate({ id: r.id, confirm: WORDS.continueCancellation });
      break;

    case "markRefundResolved":
      title = "Marcar o reembolso como resolvido à mão";
      body = (
        <>
          <p>
            O reembolso de {money(r.refundCents)} falhou na Stripe ({r.refundStatus ?? "?"}). Usar só depois de o dinheiro
            ter sido devolvido ao hóspede por outra via (por exemplo, transferência). <strong>Não mexe no dinheiro:</strong>{" "}
            regista quem resolveu e como, e a linha sai dos reembolsos por resolver do digest.
          </p>
          <div className="space-y-1">
            <Label htmlFor="refund-ref">Como foi devolvido</Label>
            <Input id="refund-ref" maxLength={120} placeholder="ex.: transferência 12/11, ref. 123" value={refundRef} onChange={(e) => setRefundRef(e.target.value)} />
          </div>
        </>
      );
      valid = wordOk && refundRef.trim().length >= 2;
      submit = () => refundM.mutate({ id: r.id, ref: refundRef.trim(), confirm: WORDS.markRefundResolved });
      break;

    case "markCreditNote":
      title = "Registar a nota de crédito";
      body = (
        <>
          <p>
            Número da nota de crédito emitida pela Hostkit para o reembolso. Não mexe no dinheiro.
            {r.status === "cancelling" && " Se o email de cancelamento ainda não saiu, o número vai nele."}
          </p>
          <div className="space-y-1">
            <Label htmlFor="credit-ref">Número</Label>
            <Input id="credit-ref" maxLength={64} value={creditRef} onChange={(e) => setCreditRef(e.target.value)} />
          </div>
        </>
      );
      valid = creditRef.trim().length >= 2;
      submit = () => creditM.mutate({ id: r.id, ref: creditRef.trim() });
      break;
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {r.confirmationCode || r.reservationId} · {r.propertyName || r.listingId} · {r.guestEmail ?? "sem email"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" /> O que acontece ao dinheiro do hóspede
          </p>
          {body}
          {needWord && (
            <div className="space-y-1 pt-1">
              <Label htmlFor="confirm-word">
                Para confirmar, escreva <strong>{needWord}</strong>
              </Label>
              <Input id="confirm-word" autoComplete="off" value={word} onChange={(e) => setWord(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Voltar</Button>
          <Button
            variant={kind === "cancel" || kind === "chargeNow" ? "destructive" : "default"}
            disabled={!valid || pending}
            onClick={submit}
          >
            {pending ? "A tratar…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeOption({
  selected,
  gate,
  onSelect,
  title,
  text,
}: {
  selected: boolean;
  gate: { allowed: boolean; reason: string | null };
  onSelect: () => void;
  title: string;
  text: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={!gate.allowed}
      onClick={onSelect}
      className={`w-full text-left rounded-md border p-3 space-y-1 transition-colors ${
        selected ? "border-[#1A1A18] bg-muted/40" : "hover:bg-muted/30"
      } disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      <p className="font-medium">{selected ? "● " : "○ "}{title}</p>
      <p className="text-xs text-muted-foreground">{gate.allowed ? text : `Indisponível: ${gate.reason}`}</p>
    </button>
  );
}
