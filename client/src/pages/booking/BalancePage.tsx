/**
 * Pagamento em duas partes, Fase 2b: a página "A segunda parte da sua
 * estadia" (/:lang/booking/balance/:intentId#t=TOKEN). Spec
 * docs/pagamento_duas_partes.md 4.1 (ponto 9), 4.2 (`payPlanPage.*`), 5.1 e 5.9.
 *
 * O token do link é a capacidade: sem ele nada se lê nem se faz. Tudo o que
 * a página pode oferecer (pagar, confirmar, trocar de cartão, cancelar,
 * pedir ajuda), quanto se devolve e o texto exato da autorização de um
 * cartão novo vêm do servidor (balance.view, server/services/checkout-balance.ts);
 * esta página só mostra e chama.
 *
 * O token nunca vai num URL que chegue ao servidor: a vista lê-se com uma
 * mutation (POST, token no corpo), porque uma query tRPC é um GET com o
 * input na query string e acabaria nos logs do Render e da Cloudflare.
 *
 * Stripe sempre na conta de PLATAFORMA (nunca `stripeAccount`): o Customer,
 * o cartão guardado, o PI do "Pagar agora" e o SetupIntent do "Usar outro
 * cartão" vivem lá. Quando a linha é terminal a página não carrega a Stripe
 * nem monta Elements.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useParams, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import type { inferRouterOutputs } from "@trpc/server";
import type { Stripe, StripeElementLocale, StripeError } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { ArrowLeft, CalendarClock, Check, Loader2, Lock, Mail, MessageCircle, XCircle } from "lucide-react";
import type { AppRouter } from "../../../../server/routers";
import { trpc } from "@/lib/trpc";
import { loadStripe } from "@/lib/stripeLoader";
import { formatEurCents, intlLocale, sanitizePropertyName } from "@/lib/format";
import { IMAGES } from "@/lib/images";
import { WHATSAPP_NUMBER } from "@/lib/constants";
import { usePageMeta } from "@/hooks/usePageMeta";
import { cn } from "@/lib/utils";

type BalanceView = inferRouterOutputs<AppRouter>["balance"]["view"];
type OkView = Extract<BalanceView, { kind: "ok" }>;
type T = ReturnType<typeof useTranslation>["t"];

const CONCIERGE_EMAIL = "info@portugalactive.com";
const WHATSAPP_DISPLAY = "+351 927 161 771";
const LISBON = "Europe/Lisbon";
const POLL_MS = 3_000;
const POLL_MAX_MS = 60_000;
/** Ao voltar ao separador, no máximo uma leitura a cada 30 s. */
const VISIBLE_MIN_MS = 30_000;
/** Erros que não sejam de input (link inválido) repetem-se até 2 vezes, como fazia a query. */
const LOAD_RETRIES = 2;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Estados em que o hóspede ainda tem a segunda parte por pagar. */
const OPEN = new Set(["scheduled", "retry", "needs_action"]);
/** Enquanto se espera pelo "succeeded" depois de um pagamento no browser. */
const PAY_WAIT = new Set(["scheduled", "retry", "needs_action", "charging"]);
/** Estados de passagem: a página espera sozinha que terminem. */
const TRANSIENT = new Set(["charging", "cancelling"]);

type Mode = "home" | "changeCard" | "cancel" | "help";
type Busy = null | "pay" | "startChange" | "cancel" | "help" | "resend";
type PollReason = "pay" | "status";

/* ════════════════════════════════════════════════════════════════
   Formatação: datas longas no fuso de Lisboa (onde estão todas as casas),
   prazos sempre com hora e "hora de Lisboa" na língua do hóspede, valores
   com o formatador de euros do checkout.
   ════════════════════════════════════════════════════════════════ */

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  // Datas de calendário (check-in) ao meio-dia UTC: o mesmo dia em Lisboa.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00Z` : v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function longDay(v: string | null | undefined, lang: string, withYear = true): string {
  const d = toDate(v);
  if (!d) return "";
  return new Intl.DateTimeFormat(intlLocale(lang), {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" as const } : {}),
    timeZone: LISBON,
  }).format(d);
}

/** "8 de julho de 2027 às 23:59 (hora de Lisboa)", a mesma forma da autorização do servidor. */
function deadlineText(v: string | null | undefined, lang: string, t: T): string {
  const d = toDate(v);
  if (!d) return "";
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: LISBON }).format(d);
  // pt "à 01:00" / es "a la 01:00": a variante só muda nessas línguas.
  return t(time.startsWith("01:") ? "payPlanPage.deadlineAt1" : "payPlanPage.deadline", { date: longDay(v, lang), time });
}

/** Check-in sem ano quando a estadia não muda de ano: "28 de junho a 5 de julho de 2027". */
function stayDates(checkIn: string, checkOut: string, lang: string): { checkIn: string; checkOut: string } {
  const a = toDate(checkIn);
  const b = toDate(checkOut);
  const sameYear = !!a && !!b && a.getUTCFullYear() === b.getUTCFullYear();
  return { checkIn: longDay(checkIn, lang, !sameYear), checkOut: longDay(checkOut, lang) };
}

const BRANDS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
  cartes_bancaires: "Cartes Bancaires",
};

function cardLabel(brand: string | null | undefined, last4: string | null | undefined): string {
  const b = brand ? (BRANDS[brand.toLowerCase()] ?? brand.charAt(0).toUpperCase() + brand.slice(1)) : "";
  return [b, last4 ? `••••${last4}` : ""].filter(Boolean).join(" ");
}

/**
 * Cartões para onde vai o reembolso (`view.refundCardsLast4`, do servidor):
 * cada pagamento volta ao cartão com que foi feito, que depois de "Usar outro
 * cartão" já não é o da linha (`cardLast4`, o da segunda parte). Nunca se usa
 * `cardLast4` aqui. Mais de dois (não devia acontecer) cai no texto sem dígitos.
 */
function refundCards(list: readonly string[] | null | undefined): { last4: string; last4b?: string } | null {
  const cards = (list ?? []).filter((c) => /^\d{4}$/.test(c));
  if (cards.length === 1) return { last4: cards[0] };
  if (cards.length === 2) return { last4: cards[0], last4b: cards[1] };
  return null;
}

function stripeLocale(lang: string): StripeElementLocale {
  return (["en", "pt", "es", "fr", "de", "it", "nl", "sv", "fi"].includes(lang) ? lang : "auto") as StripeElementLocale;
}

function isNetworkError(e: unknown): boolean {
  return /failed to fetch|network|load failed|fetch/i.test(String((e as { message?: unknown })?.message ?? ""));
}

/**
 * Erros da Stripe em texto claro. As recusas trazem a frase da própria
 * Stripe (localizada, e genérica de propósito para cartões perdidos ou
 * roubados) seguida do caminho de saída; o resto cai numa frase nossa.
 */
function stripeErrorText(err: StripeError | undefined, t: T, flow: "pay" | "setup"): string {
  if (!err) return t("payPlanPage.errors.generic");
  if (err.code === "payment_intent_authentication_failure" || err.code === "setup_intent_authentication_failure") {
    return t("payPlanPage.errors.authFailed");
  }
  if (err.type === "card_error") {
    const head = err.message || t("payPlanPage.errors.declined");
    return flow === "pay" ? `${head} ${t("payPlanPage.errors.declinedHint")}` : head;
  }
  if (err.type === "validation_error" && err.message) return err.message;
  return t("payPlanPage.errors.generic");
}

const elementsAppearance = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#1A1A18",
    colorBackground: "#ffffff",
    colorText: "#1A1A18",
    fontFamily: "var(--font-body), Arial, sans-serif",
    borderRadius: "4px",
  },
};

/* ════════════════════════════════════════════════════════════════
   Página
   ════════════════════════════════════════════════════════════════ */

export default function BalancePage() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || "en").slice(0, 2);
  usePageMeta({ title: t("payPlanPage.title"), noindex: true });

  const { intentId = "" } = useParams<{ intentId: string }>();
  const search = useSearch();
  const validId = UUID_RE.test(intentId);

  // undefined = ainda a resolver; null = a página abriu sem token.
  // O token chega no fragmento (#t=…), que o browser nunca envia ao servidor
  // nem à analítica; ?t= continua aceite para links antigos.
  const [token, setToken] = useState<string | null | undefined>(() => {
    const fromHash =
      typeof window !== "undefined" ? new URLSearchParams(window.location.hash.replace(/^#/, "")).get("t")?.trim() : undefined;
    return fromHash || new URLSearchParams(search).get("t")?.trim() || undefined;
  });

  // O token fica na sessão do separador e sai da barra de endereço: não vai
  // parar a capturas de ecrã, a URLs copiados nem ao page_location da
  // analítica. Um recarregamento no mesmo separador continua a funcionar.
  useEffect(() => {
    if (typeof window === "undefined" || !intentId) return;
    const key = `pa-balance-link:${intentId}`;
    if (token) {
      try {
        window.sessionStorage.setItem(key, token);
      } catch {
        /* sessão indisponível: o token fica só em memória */
      }
      try {
        const url = new URL(window.location.href);
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
        if (url.searchParams.has("t") || hashParams.has("t")) {
          url.searchParams.delete("t");
          hashParams.delete("t");
          const hash = hashParams.toString();
          window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${hash ? `#${hash}` : ""}`);
        }
      } catch {
        /* sem history: o URL fica como está */
      }
      return;
    }
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(key);
    } catch {
      stored = null;
    }
    setToken(stored || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentId]);

  const tokenStr = token ?? "";
  const [poll, setPoll] = useState<{ reason: PollReason; until: number } | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState<PollReason | null>(null);

  /* ── Vista: POST com o token no corpo, nunca dois pedidos ao mesmo tempo ── */
  const viewM = trpc.balance.view.useMutation();
  const viewMutateRef = useRef(viewM.mutateAsync);
  viewMutateRef.current = viewM.mutateAsync;
  const [view, setView] = useState<BalanceView | undefined>(undefined);
  const [loadError, setLoadError] = useState<{ code?: string } | null>(null);
  const [fetching, setFetching] = useState(false);
  const inflightRef = useRef<Promise<void> | null>(null);
  /** Uma leitura pedida a meio de outra: corre logo a seguir, com o estado já depois da ação. */
  const queuedRef = useRef(false);
  const lastLoadAtRef = useRef(0);
  const linkRef = useRef({ intentId, token: tokenStr, enabled: validId && !!token });
  linkRef.current = { intentId, token: tokenStr, enabled: validId && !!token };

  /**
   * `queue`: depois de uma ação do hóspede a página tem de ver o estado novo,
   * por isso uma leitura em curso não chega e outra fica marcada para a seguir.
   * O polling e o regresso ao separador só leem se nada estiver a correr.
   */
  const loadView = useCallback((opts: { queue: boolean }): Promise<void> => {
    if (!linkRef.current.enabled) return Promise.resolve();
    if (inflightRef.current) {
      if (opts.queue) queuedRef.current = true;
      return inflightRef.current;
    }
    const p = (async () => {
      do {
        queuedRef.current = false;
        for (let attempt = 0; ; attempt++) {
          const { intentId: id, token: tk } = linkRef.current;
          lastLoadAtRef.current = Date.now();
          try {
            const data = await viewMutateRef.current({ intentId: id, token: tk });
            setView(data);
            setLoadError(null);
            break;
          } catch (e) {
            const code = (e as { data?: { code?: string } | null })?.data?.code;
            if (code !== "BAD_REQUEST" && attempt < LOAD_RETRIES) {
              await new Promise((r) => window.setTimeout(r, 1_000 * 2 ** attempt));
              continue;
            }
            setLoadError({ code });
            break;
          }
        }
      } while (queuedRef.current);
    })().finally(() => {
      inflightRef.current = null;
      setFetching(false);
    });
    inflightRef.current = p;
    setFetching(true);
    return p;
  }, []);

  // Primeira leitura (e outra se o link mudar).
  useEffect(() => {
    if (validId && token) void loadView({ queue: true });
  }, [validId, token, intentId, loadView]);

  // De volta ao separador: estado fresco, no máximo uma vez a cada 30 s.
  useEffect(() => {
    if (!validId || !token) return;
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoadAtRef.current >= VISIBLE_MIN_MS) {
        void loadView({ queue: false });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [validId, token, loadView]);

  // Polling de 3 em 3 s enquanto se espera (o fim aos 60 s é tratado abaixo).
  useEffect(() => {
    if (!poll) return;
    const id = window.setInterval(() => void loadView({ queue: false }), POLL_MS);
    return () => window.clearInterval(id);
  }, [poll, loadView]);

  const ok: OkView | null = view?.kind === "ok" ? view : null;
  const status = ok?.status ?? null;
  const actionable = !!ok && OPEN.has(ok.status);

  // Chave pública só quando há alguma ação possível (linha terminal: nada de Stripe).
  const stripeCfg = trpc.booking.getStripeConfig.useQuery(undefined, { enabled: actionable, staleTime: Infinity });

  const prepare = trpc.balance.preparePayment.useMutation();
  const startChange = trpc.balance.startCardChange.useMutation();
  const finishChange = trpc.balance.finishCardChange.useMutation();
  const cancelM = trpc.balance.cancel.useMutation();
  const helpM = trpc.balance.help.useMutation();
  const resendM = trpc.balance.resendLink.useMutation();

  const [mode, setMode] = useState<Mode>("home");
  const [busy, setBusy] = useState<Busy>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [cardUpdated, setCardUpdated] = useState<{ last4: string; brand: string } | null>(null);
  const [paidLocally, setPaidLocally] = useState(false);
  const [helpResult, setHelpResult] = useState<{ pausedUntil: string | null } | null>(null);
  const [resent, setResent] = useState(false);
  const stripeRef = useRef<Promise<Stripe | null> | null>(null);

  /* ── Polling: até 60 s, de 3 em 3 s ── */
  useEffect(() => {
    if (!poll) return;
    const id = window.setTimeout(() => {
      setPoll(null);
      setPollTimedOut(poll.reason);
    }, Math.max(0, poll.until - Date.now()));
    return () => window.clearTimeout(id);
  }, [poll]);

  useEffect(() => {
    if (!view) return;
    if (!ok) {
      if (poll) setPoll(null);
      return;
    }
    if (poll?.reason === "pay" && !PAY_WAIT.has(ok.status)) setPoll(null);
    else if (poll?.reason === "status" && !TRANSIENT.has(ok.status)) setPoll(null);
    else if (!poll && TRANSIENT.has(ok.status) && pollTimedOut !== "status" && !paidLocally) {
      setPoll({ reason: "status", until: Date.now() + POLL_MAX_MS });
    }
  }, [view, ok, poll, pollTimedOut, paidLocally]);

  // Um erro de uma ação não segue para outro ecrã (ex.: o link expirou entretanto).
  const viewKind = view?.kind;
  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [viewKind]);

  // Uma linha que deixa de estar aberta fecha qualquer painel a meio.
  useEffect(() => {
    if (status && !OPEN.has(status) && !(status === "succeeded" && mode === "cancel")) {
      setMode("home");
      setSetupSecret(null);
    }
  }, [status, mode]);

  const run = useCallback(
    async (kind: Exclude<Busy, null>, fn: () => Promise<void>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(kind);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(isNetworkError(e) ? t("payPlanPage.errors.network") : t("payPlanPage.errors.generic"));
      } finally {
        busyRef.current = false;
        setBusy(null);
      }
    },
    [t],
  );

  /** Stripe da PLATAFORMA, carregada só quando o hóspede pede uma ação. */
  const ensureStripe = async (): Promise<Stripe | null> => {
    const cfg = stripeCfg.data ?? (await stripeCfg.refetch()).data;
    const key = cfg?.publishableKey;
    if (!key) return null;
    if (!stripeRef.current) stripeRef.current = loadStripe(key, { locale: stripeLocale(lang) });
    return stripeRef.current;
  };

  const refetch = () => loadView({ queue: true });

  /* ── Pagar agora / Confirmar com o mesmo cartão ── */
  const payNow = () =>
    run("pay", async () => {
      setNotice(null);
      const stripe = await ensureStripe();
      if (!stripe) {
        setError(t("payPlanPage.errors.stripeUnavailable"));
        return;
      }
      const r = await prepare.mutateAsync({ intentId, token: tokenStr });
      if (!r.ok) {
        switch (r.reason) {
          case "paid":
          case "expired":
            await refetch();
            return;
          case "processing":
            // Um pagamento anterior ainda está a correr: esperar por ele, nunca pagar de novo.
            setNotice(t("payPlanPage.errors.processing"));
            setPollTimedOut(null);
            setPoll({ reason: "pay", until: Date.now() + POLL_MAX_MS });
            return;
          case "not_payable":
            setError(t("payPlanPage.errors.notPayable"));
            await refetch();
            return;
          case "guesty":
            setError(t("payPlanPage.errors.guesty"));
            return;
          default:
            setError(t("payPlanPage.errors.generic"));
            return;
        }
      }
      // Cartão guardado: sem o voltar a escrever; a Stripe só abre o 3DS se o banco o pedir.
      const { error: err, paymentIntent } = await stripe.confirmCardPayment(r.clientSecret, {
        payment_method: r.paymentMethodId,
      });
      const pi = paymentIntent ?? err?.payment_intent ?? null;
      if (pi && (pi.status === "succeeded" || pi.status === "processing")) {
        setPaidLocally(true);
        setPollTimedOut(null);
        setMode("home");
        setPoll({ reason: "pay", until: Date.now() + POLL_MAX_MS });
        void refetch();
        return;
      }
      setError(stripeErrorText(err, t, "pay"));
    });

  /* ── Usar outro cartão ── */
  const openChangeCard = () =>
    run("startChange", async () => {
      setNotice(null);
      const stripe = await ensureStripe();
      if (!stripe) {
        setError(t("payPlanPage.errors.stripeUnavailable"));
        return;
      }
      const r = await startChange.mutateAsync({ intentId, token: tokenStr });
      if (!r.ok) {
        if (r.reason === "expired") {
          await refetch();
          return;
        }
        setError(t(r.reason === "not_changeable" ? "payPlanPage.errors.notChangeable" : "payPlanPage.errors.generic"));
        if (r.reason === "not_changeable") await refetch();
        return;
      }
      setSetupSecret(r.clientSecret);
      setMode("changeCard");
    });

  /**
   * `consentRenderedAt` é o instante do render do texto que o formulário
   * mostrava ao submeter (vem com o próprio texto): o servidor volta a gerar
   * esse texto e grava o hash do que o hóspede viu, não o de agora.
   */
  const finishCardChange = async (
    setupIntentId: string,
    consentRenderedAt: string,
  ): Promise<{ error: string | null; resetSetup?: boolean }> => {
    const r = await finishChange.mutateAsync({ intentId, token: tokenStr, setupIntentId, consent: true, consentRenderedAt });
    if (r.ok) {
      setCardUpdated({ last4: r.cardLast4, brand: r.cardBrand });
      setSetupSecret(null);
      setMode("home");
      setError(null);
      setNotice(null);
      // A linha passa a ter o novo cartão; a página relê antes de oferecer "Pagar agora".
      await refetch();
      return { error: null };
    }
    switch (r.reason) {
      case "expired":
        await refetch();
        return { error: null };
      case "not_changeable":
        await refetch();
        return { error: t("payPlanPage.errors.notChangeable") };
      case "setup_mismatch":
        return { error: t("payPlanPage.errors.cardChangeFailed"), resetSetup: true };
      default:
        // O cartão já foi validado pela Stripe: tentar de novo só repete o registo.
        return { error: t("payPlanPage.errors.cardChangeFailed") };
    }
  };

  /* ── Cancelar (dentro do prazo) ── */
  const confirmCancel = () =>
    run("cancel", async () => {
      const r = await cancelM.mutateAsync({ intentId, token: tokenStr });
      if (r.ok) {
        setMode("home");
        await refetch();
        return;
      }
      switch (r.reason) {
        case "late":
        case "expired":
          // O painel passa sozinho à política depois do prazo (ou ao link expirado).
          await refetch();
          return;
        case "not_cancellable":
          setError(t("payPlanPage.errors.notCancellable"));
          await refetch();
          return;
        default:
          setError(t("payPlanPage.errors.cancelFailed"));
          await refetch();
      }
    });

  /* ── Preciso de ajuda / mensagem depois do prazo ── */
  const sendHelp = (message: string) =>
    run("help", async () => {
      const r = await helpM.mutateAsync({ intentId, token: tokenStr, message });
      if (!r.ok) {
        if (r.reason === "expired") {
          await refetch();
          return;
        }
        setError(t("payPlanPage.errors.helpFailed"));
        return;
      }
      setHelpResult({ pausedUntil: r.pausedUntil });
      setMode("home");
      await refetch();
    });

  const resend = () =>
    run("resend", async () => {
      await resendM.mutateAsync({ intentId });
      setResent(true);
    });

  /* ── Estado → ecrã ── */
  let content: ReactNode;
  if (!validId) {
    content = <NotFoundState t={t} />;
  } else if (token === undefined || (token && !view && !loadError)) {
    content = <LoadingState t={t} />;
  } else if (token === null) {
    content = <ExpiredState t={t} emailMasked={null} resent={resent} busy={busy === "resend"} error={error} onResend={resend} />;
  } else if (!view) {
    content =
      loadError?.code === "BAD_REQUEST" ? (
        <ExpiredState t={t} emailMasked={null} resent={resent} busy={busy === "resend"} error={error} onResend={resend} />
      ) : (
        <LoadErrorState t={t} onRetry={() => void refetch()} retrying={fetching} />
      );
  } else if (view.kind === "expired") {
    content = <ExpiredState t={t} emailMasked={view.emailMasked} resent={resent} busy={busy === "resend"} error={error} onResend={resend} />;
  } else if (view.kind === "not_found") {
    content = <NotFoundState t={t} />;
  } else {
    content = (
      <OkState
        t={t}
        lang={lang}
        view={view}
        mode={mode}
        setMode={(m) => {
          setError(null);
          setNotice(null);
          setMode(m);
        }}
        busy={busy}
        error={error}
        notice={notice}
        polling={poll}
        pollTimedOut={pollTimedOut}
        paidLocally={paidLocally}
        cardUpdated={cardUpdated}
        helpResult={helpResult}
        setupSecret={setupSecret}
        stripePromise={stripeRef.current}
        token={tokenStr}
        onPay={payNow}
        onOpenChangeCard={openChangeCard}
        onFinishCardChange={finishCardChange}
        onCancelChangeCard={() => {
          setSetupSecret(null);
          setMode("home");
        }}
        onConfirmCancel={confirmCancel}
        onSendHelp={sendHelp}
        onRefresh={() => {
          setPollTimedOut(null);
          void refetch();
        }}
      />
    );
  }

  return (
    <div className="balance-page min-h-screen bg-pa-cream">
      <style>{`
        /* The global 44px touch-target rule inflates checkboxes; the label is the target. */
        .balance-page input[type="checkbox"] { min-height: 18px; min-width: 18px; height: 18px; width: 18px; }
        @keyframes balanceIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .balance-in { animation: balanceIn 220ms ease-out; }
        @media (prefers-reduced-motion: reduce) { .balance-in { animation: none; } }
      `}</style>
      <header className="bg-white border-b border-pa-sand">
        <div className="max-w-[640px] mx-auto px-4 h-[60px] flex items-center justify-between gap-4">
          <Link href="/" className="shrink-0" aria-label="Portugal Active">
            <img src={IMAGES.logoColor} alt="Portugal Active" className="h-[26px] w-auto" />
          </Link>
          <span className="caption text-pa-stone-aa inline-flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5" strokeWidth={1.8} aria-hidden />
            {t("payPlanPage.secure")}
          </span>
        </div>
      </header>
      <main className="max-w-[640px] mx-auto px-4 py-8 sm:py-12">
        <div className="rounded-lg border border-pa-sand bg-white px-5 py-7 sm:px-8 sm:py-9 shadow-[0_4px_24px_rgba(26,26,24,0.06)]">
          {content}
        </div>
        <ConciergeBlock t={t} />
      </main>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Estados simples
   ════════════════════════════════════════════════════════════════ */

function LoadingState({ t }: { t: T }) {
  return (
    <div aria-busy="true">
      <div className="skeleton-shimmer h-3 w-32 rounded" />
      <div className="skeleton-shimmer h-8 w-72 max-w-full rounded mt-4" />
      <div className="skeleton-shimmer h-4 w-full rounded mt-5" />
      <div className="skeleton-shimmer h-4 w-2/3 rounded mt-2" />
      <div className="skeleton-shimmer h-[150px] w-full rounded-lg mt-7" />
      <div className="skeleton-shimmer h-12 w-full rounded-full mt-7" />
      <p className="sr-only" role="status">{t("payPlanPage.loading")}</p>
    </div>
  );
}

function NotFoundState({ t }: { t: T }) {
  return (
    <div className="text-center space-y-4 balance-in">
      <h1 className="headline-md text-pa-dark">{t("payPlanPage.notFoundTitle")}</h1>
      <p className="body-md text-pa-earth">{t("payPlanPage.notFoundBody")}</p>
    </div>
  );
}

function LoadErrorState({ t, onRetry, retrying }: { t: T; onRetry: () => void; retrying: boolean }) {
  return (
    <div className="text-center space-y-4 balance-in">
      <h1 className="headline-md text-pa-dark">{t("payPlanPage.loadErrorTitle")}</h1>
      <p className="body-md text-pa-earth">{t("payPlanPage.loadErrorBody")}</p>
      <button type="button" onClick={onRetry} disabled={retrying} className="btn-primary inline-flex">
        {retrying ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
        {t("payPlanPage.tryAgain")}
      </button>
    </div>
  );
}

function ExpiredState({
  t,
  emailMasked,
  resent,
  busy,
  error,
  onResend,
}: {
  t: T;
  emailMasked: string | null;
  resent: boolean;
  busy: boolean;
  error: string | null;
  onResend: () => void;
}) {
  return (
    <div className="space-y-5 balance-in">
      <h1 className="headline-md text-pa-dark">{t("payPlanPage.title")}</h1>
      {resent ? (
        <div role="status" className="space-y-3">
          <p className="body-md text-pa-dark">
            {emailMasked ? t("payPlanPage.expired", { email: emailMasked }) : t("payPlanPage.expiredNoEmail")}
          </p>
          <p className="caption text-pa-stone-aa">{t("payPlanPage.resendHint")}</p>
        </div>
      ) : (
        <>
          <p className="body-md text-pa-earth">{t("payPlanPage.expiredAsk")}</p>
          {error && <ErrorBox>{error}</ErrorBox>}
          <button type="button" onClick={onResend} disabled={busy} className="btn-primary w-full sm:w-auto">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
            {busy ? t("payPlanPage.sending") : t("payPlanPage.resend")}
          </button>
        </>
      )}
    </div>
  );
}

function ConciergeBlock({ t }: { t: T }) {
  return (
    <section aria-labelledby="balance-concierge" className="mt-6 px-1 text-center">
      <h2 id="balance-concierge" className="eyebrow text-pa-gold-aa">
        {t("payPlanPage.concierge")}
      </h2>
      <div className="mt-2 flex flex-col sm:flex-row items-center justify-center gap-x-6">
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 body-sm text-pa-dark underline-offset-4 hover:underline"
        >
          <MessageCircle className="w-4 h-4 text-pa-gold-aa" strokeWidth={1.8} aria-hidden />
          {t("payPlanPage.whatsapp", { number: WHATSAPP_DISPLAY })}
        </a>
        <a
          href={`mailto:${CONCIERGE_EMAIL}`}
          className="inline-flex items-center gap-2 body-sm text-pa-dark underline-offset-4 hover:underline"
        >
          <Mail className="w-4 h-4 text-pa-gold-aa" strokeWidth={1.8} aria-hidden />
          {CONCIERGE_EMAIL}
        </a>
      </div>
      <p className="caption text-pa-stone-aa mt-1">{t("payPlanPage.neverCardDetails")}</p>
    </section>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-2 p-3 bg-pa-warm border border-[#DC2626] rounded-md">
      <span className="text-[#DC2626] mt-0.5 shrink-0" aria-hidden>
        &#9888;
      </span>
      <p className="text-[#B91C1C] text-sm leading-snug">{children}</p>
    </div>
  );
}

function NoticeBox({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" }) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 p-3 rounded-md border",
        tone === "success" ? "bg-pa-warm border-pa-gold-aa" : "bg-pa-warm border-pa-sand",
      )}
    >
      {tone === "success" && <Check className="w-4 h-4 mt-0.5 shrink-0 text-pa-gold-aa" strokeWidth={2.2} aria-hidden />}
      <p className="text-sm leading-snug text-pa-dark">{children}</p>
    </div>
  );
}

function StateIcon({ kind }: { kind: "paid" | "cancelled" | "review" }) {
  const Icon = kind === "paid" ? Check : kind === "cancelled" ? XCircle : CalendarClock;
  return (
    <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", kind === "paid" ? "bg-pa-dark" : "bg-pa-warm border border-pa-sand")}>
      <Icon className={cn("w-6 h-6", kind === "paid" ? "text-white" : "text-pa-earth")} strokeWidth={1.8} aria-hidden />
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-start gap-3 p-4 rounded-lg bg-pa-warm border border-pa-sand">
      <Loader2 className="w-5 h-5 mt-0.5 shrink-0 animate-spin text-pa-earth" aria-hidden />
      <p className="body-md text-pa-dark">{label}</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Linha válida
   ════════════════════════════════════════════════════════════════ */

interface OkStateProps {
  t: T;
  lang: string;
  view: OkView;
  mode: Mode;
  setMode: (m: Mode) => void;
  busy: Busy;
  error: string | null;
  notice: string | null;
  polling: { reason: PollReason; until: number } | null;
  pollTimedOut: PollReason | null;
  paidLocally: boolean;
  cardUpdated: { last4: string; brand: string } | null;
  helpResult: { pausedUntil: string | null } | null;
  setupSecret: string | null;
  stripePromise: Promise<Stripe | null> | null;
  token: string;
  onPay: () => void;
  onOpenChangeCard: () => void;
  onFinishCardChange: (setupIntentId: string, consentRenderedAt: string) => Promise<{ error: string | null; resetSetup?: boolean }>;
  onCancelChangeCard: () => void;
  onConfirmCancel: () => void;
  onSendHelp: (message: string) => void;
  onRefresh: () => void;
}

function OkState(p: OkStateProps) {
  const { t, lang, view } = p;
  const house = sanitizePropertyName(view.propertyName || "") || t("payPlanPage.houseFallback");
  const dates = stayDates(view.checkIn, view.checkOut, lang);
  const stayLine = t("payPlanPage.stay", { house, checkIn: dates.checkIn, checkOut: dates.checkOut });
  const s = view.status;

  if (s === "succeeded" || s === "paid_externally") {
    return (
      <div className="space-y-5 balance-in">
        <StateIcon kind="paid" />
        <h1 className="headline-md text-pa-dark">{t("payPlanPage.title")}</h1>
        <p className="headline-sm text-pa-dark" role="status">
          {t("payPlanPage.paid", { checkIn: longDay(view.checkIn, lang) })}
        </p>
        <p className="body-md text-pa-earth">{stayLine}</p>
        <p className="body-sm text-pa-earth">{t("payPlanPage.paidNote")}</p>
        {view.canCancelFree && <CancelArea {...p} house={house} />}
      </div>
    );
  }

  if (s === "cancelled_unpaid" || s === "cancelled_by_guest") {
    const refund = view.refundCents != null && view.refundCents > 0 ? formatEurCents(view.refundCents, lang) : null;
    const date = longDay(view.cancelledAt, lang);
    const cards = refundCards(view.refundCardsLast4);
    const text = !date
      ? t("payPlanPage.cancelledNoDate")
      : !refund
        ? t("payPlanPage.cancelledNoRefund", { date })
        : cards?.last4b
          ? t("payPlanPage.cancelledTwoCards", { date, refund, ...cards })
          : cards
            ? t("payPlanPage.cancelled", { date, refund, last4: cards.last4 })
            : t("payPlanPage.cancelledNoCard", { date, refund });
    return (
      <div className="space-y-5 balance-in">
        <StateIcon kind="cancelled" />
        <h1 className="headline-md text-pa-dark">{t("payPlanPage.title")}</h1>
        <p className="body-md text-pa-earth">{stayLine}</p>
        <p className="body-md text-pa-dark" role="status">{text}</p>
        {refund && (
          <p className="body-sm text-pa-earth">{t(cards?.last4b ? "payPlanPage.refundTimingTwoCards" : "payPlanPage.refundTiming")}</p>
        )}
      </div>
    );
  }

  if (s === "cancelling") {
    return (
      <div className="space-y-5 balance-in">
        <h1 className="headline-md text-pa-dark">{t("payPlanPage.title")}</h1>
        <p className="body-md text-pa-earth">{stayLine}</p>
        <Spinner label={t("payPlanPage.cancelling")} />
      </div>
    );
  }

  if (s === "charging") {
    return (
      <div className="space-y-5 balance-in">
        <h1 className="headline-md text-pa-dark">{t("payPlanPage.title")}</h1>
        <p className="body-md text-pa-earth">{stayLine}</p>
        {p.polling ? (
          <Spinner label={t(p.polling.reason === "pay" ? "payPlanPage.processing" : "payPlanPage.charging")} />
        ) : (
          <>
            <NoticeBox>{t(p.paidLocally ? "payPlanPage.processingSlow" : "payPlanPage.chargingSlow")}</NoticeBox>
            <button type="button" onClick={p.onRefresh} className="btn-ghost w-full sm:w-auto">
              {t("payPlanPage.refresh")}
            </button>
          </>
        )}
      </div>
    );
  }

  if (!OPEN.has(s)) {
    // needs_review (e qualquer estado novo que o servidor venha a ter): um humano decide.
    const pause = p.helpResult?.pausedUntil ?? view.helpPausedUntil;
    return (
      <div className="space-y-5 balance-in">
        <StateIcon kind="review" />
        <h1 className="headline-md text-pa-dark">{t("payPlanPage.title")}</h1>
        <p className="body-md text-pa-earth">{stayLine}</p>
        <div role="status" className="space-y-2">
          {p.helpResult ? (
            <p className="body-md text-pa-dark">
              {pause ? t("payPlanPage.helpNote", { pauseUntil: deadlineText(pause, lang, t) }) : t("payPlanPage.helpNoteNoPause")}
            </p>
          ) : (
            <>
              <p className="body-md text-pa-dark">{t("payPlanPage.review")}</p>
              {pause && <p className="body-sm text-pa-earth">{t("payPlanPage.reviewPaused", { pauseUntil: deadlineText(pause, lang, t) })}</p>}
            </>
          )}
        </div>
      </div>
    );
  }

  return <OpenState {...p} house={house} stayDatesText={dates} />;
}

/* ── scheduled / retry / needs_action ── */

function OpenState(p: OkStateProps & { house: string; stayDatesText: { checkIn: string; checkOut: string } }) {
  const { t, lang, view, house } = p;
  const amountLater = formatEurCents(view.amountLaterCents, lang);
  const failed = view.status === "retry" || view.status === "needs_action";
  const chargeFuture = (toDate(view.chargeAt)?.getTime() ?? 0) > Date.now();
  const last4 = view.cardLast4;

  // Depois de trocar de cartão nesta visita, a recusa antiga já não é deste cartão.
  const declineKind = p.cardUpdated ? null : view.lastDeclineKind;
  const showAuth = declineKind === "auth" && view.canConfirmSameCard;
  const canPay = view.canPayNow && declineKind !== "hard";
  const deadline = deadlineText(view.hardStopAt, lang, t);

  if (p.polling?.reason === "pay") {
    return (
      <div className="space-y-5 balance-in">
        <h1 className="headline-md text-pa-dark">{t("payPlanPage.title")}</h1>
        {p.notice && <NoticeBox>{p.notice}</NoticeBox>}
        <Spinner label={t("payPlanPage.processing")} />
      </div>
    );
  }
  if (p.paidLocally && p.pollTimedOut === "pay") {
    // O banco aceitou mas o registo ainda não chegou: nunca voltar a mostrar "Pagar".
    return (
      <div className="space-y-5 balance-in">
        <h1 className="headline-md text-pa-dark">{t("payPlanPage.title")}</h1>
        <NoticeBox>{t("payPlanPage.processingSlow")}</NoticeBox>
        <button type="button" onClick={p.onRefresh} className="btn-ghost w-full sm:w-auto">
          {t("payPlanPage.refresh")}
        </button>
      </div>
    );
  }

  const intro = failed
    ? t("payPlanPage.introDue", { house, checkIn: p.stayDatesText.checkIn, checkOut: p.stayDatesText.checkOut, amountLater })
    : t(last4 ? "payPlanPage.intro" : "payPlanPage.introNoCard", {
        house,
        checkIn: p.stayDatesText.checkIn,
        checkOut: p.stayDatesText.checkOut,
        amountLater,
        date: longDay(view.chargeAt, lang),
        last4,
      });

  const banner = showAuth
    ? t("payPlanPage.authBanner")
    : failed && (declineKind === "soft" || declineKind === "hard")
      ? t("payPlanPage.failedBanner", { date: longDay(view.chargeAt, lang), deadline })
      : failed
        ? t("payPlanPage.actionBanner", { deadline })
        : null;

  const cardUpdatedText = p.cardUpdated
    ? !p.cardUpdated.last4
      ? t("payPlanPage.cardUpdatedShort")
      : chargeFuture && !failed
        ? t("payPlanPage.cardUpdated", { last4: p.cardUpdated.last4, date: longDay(view.chargeAt, lang) })
        : t("payPlanPage.cardUpdatedNow", { last4: p.cardUpdated.last4 })
    : null;

  if (p.mode === "changeCard") {
    return <ChangeCardPanel {...p} amountLater={amountLater} />;
  }
  if (p.mode === "cancel") {
    return (
      <div className="space-y-5 balance-in">
        <h1 className="headline-md text-pa-dark">{t("payPlanPage.title")}</h1>
        <CancelArea {...p} house={house} />
      </div>
    );
  }
  if (p.mode === "help") {
    return (
      <div className="space-y-5 balance-in">
        <h1 className="headline-md text-pa-dark">{t("payPlanPage.title")}</h1>
        <MessagePanel
          {...p}
          titleKey="payPlanPage.help"
          bodyText={t("payPlanPage.helpIntro")}
          onSubmit={p.onSendHelp}
          onBack={() => p.setMode("home")}
        />
      </div>
    );
  }

  const busyAny = p.busy !== null;
  const primaryIsPay = showAuth || canPay;

  return (
    <div className="space-y-6 balance-in">
      <div className="space-y-3">
        <h1 className="headline-md text-pa-dark">{t("payPlanPage.title")}</h1>
        <p className="body-md text-pa-earth">{intro}</p>
      </div>

      {banner && (
        <div className="p-4 rounded-lg border border-pa-gold-aa bg-pa-warm" role={failed ? "alert" : "status"}>
          <p className="body-sm text-pa-dark leading-relaxed">{banner}</p>
          {declineKind === "hard" && <p className="body-sm text-pa-dark leading-relaxed mt-1">{t("payPlanPage.hardHint")}</p>}
        </div>
      )}

      <dl className="divide-y divide-pa-sand border-y border-pa-sand">
        <SummaryRow label={t("payPlanPage.labels.amountLater")} value={amountLater} strong />
        {failed ? (
          <SummaryRow label={t("payPlanPage.labels.payBy")} value={deadline} />
        ) : (
          <SummaryRow label={t("payPlanPage.labels.chargeDate")} value={longDay(view.chargeAt, lang)} />
        )}
        {(view.cardLast4 || view.cardBrand) && (
          <SummaryRow label={t("payPlanPage.labels.card")} value={cardLabel(view.cardBrand, view.cardLast4)} />
        )}
        <SummaryRow label={t("payPlanPage.labels.freeCancel")} value={deadlineText(view.freeCancelDeadlineAt, lang, t)} />
        <SummaryRow label={t("payPlanPage.labels.amountPaid")} value={formatEurCents(view.amountPaidCents, lang)} />
      </dl>

      <div className="space-y-3">
        {cardUpdatedText && <NoticeBox tone="success">{cardUpdatedText}</NoticeBox>}
        {p.notice && <NoticeBox>{p.notice}</NoticeBox>}
        {p.error && <ErrorBox>{p.error}</ErrorBox>}

        {primaryIsPay && (
          <button type="button" onClick={p.onPay} disabled={busyAny} className="btn-primary w-full">
            {p.busy === "pay" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
            {p.busy === "pay"
              ? t("payPlanPage.working")
              : showAuth
                ? last4
                  ? t("payPlanPage.confirmSameCard", { last4 })
                  : t("payPlanPage.confirmSameCardNoLast4")
                : t("payPlanPage.payNow", { amountLater })}
          </button>
        )}
        {primaryIsPay && last4 && (
          <p className="caption text-pa-stone-aa text-center">{t("payPlanPage.payNowNote", { last4 })}</p>
        )}
        {view.canChangeCard && view.cardChangeConsent && (
          <button
            type="button"
            onClick={p.onOpenChangeCard}
            disabled={busyAny}
            className={primaryIsPay ? "btn-ghost w-full" : "btn-primary w-full"}
          >
            {p.busy === "startChange" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
            {p.busy === "startChange" ? t("payPlanPage.preparing") : t("payPlanPage.changeCard")}
          </button>
        )}
      </div>

      <div className="pt-5 border-t border-pa-sand flex flex-col sm:flex-row sm:items-center gap-x-8 gap-y-1">
        <button
          type="button"
          onClick={() => p.setMode("cancel")}
          disabled={busyAny}
          className="body-sm text-pa-dark underline underline-offset-4 hover:text-pa-gold-aa text-left disabled:opacity-50"
        >
          {t("payPlanPage.cancel")}
        </button>
        {view.canRequestHelp && (
          <button
            type="button"
            onClick={() => p.setMode("help")}
            disabled={busyAny}
            className="body-sm text-pa-dark underline underline-offset-4 hover:text-pa-gold-aa text-left disabled:opacity-50"
          >
            {t("payPlanPage.help")}
          </button>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="body-sm text-pa-earth shrink-0">{label}</dt>
      <dd className={cn("text-right tabular-nums text-pa-dark", strong ? "text-[17px] font-medium" : "text-[14px] font-medium")}>{value}</dd>
    </div>
  );
}

/** Foco no título do painel que acabou de abrir (leitores de ecrã e teclado). */
function useFocusOnMount<E extends HTMLElement>() {
  const ref = useRef<E>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}

/* ── Cancelar a reserva ── */

function CancelArea(p: OkStateProps & { house: string }) {
  if (p.mode !== "cancel") {
    // Estado pago: o cancelamento gratuito ainda está aberto, à distância de um clique.
    return (
      <div className="pt-5 border-t border-pa-sand">
        <button
          type="button"
          onClick={() => p.setMode("cancel")}
          className="body-sm text-pa-dark underline underline-offset-4 hover:text-pa-gold-aa text-left"
        >
          {p.t("payPlanPage.cancel")}
        </button>
      </div>
    );
  }
  return <CancelPanel {...p} />;
}

function CancelPanel(p: OkStateProps & { house: string }) {
  const { t, lang, view } = p;
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  const back = () => p.setMode("home");

  if (!view.canCancelFree) {
    return (
      <MessagePanel
        {...p}
        titleKey="payPlanPage.cancel"
        bodyText={t("payPlanPage.cancelLate", { deadline: deadlineText(view.freeCancelDeadlineAt, lang, t) })}
        onSubmit={p.onSendHelp}
        onBack={back}
      />
    );
  }

  const refund = view.refundIfCancelCents != null ? formatEurCents(view.refundIfCancelCents, lang) : null;
  // Para onde vai cada pagamento, não o cartão da segunda parte.
  const cards = refundCards(view.refundCardsLast4);
  const freeText = cards?.last4b
    ? refund
      ? t("payPlanPage.cancelFreeTwoCards", { refund, ...cards })
      : t("payPlanPage.cancelFreeNoAmountTwoCards", cards)
    : cards
      ? refund
        ? t("payPlanPage.cancelFree", { refund, last4: cards.last4 })
        : t("payPlanPage.cancelFreeNoAmount", { last4: cards.last4 })
      : refund
        ? t("payPlanPage.cancelFreeNoCard", { refund })
        : t("payPlanPage.cancelFreeMinimal");

  return (
    <section aria-labelledby="balance-cancel-title" className="space-y-5">
      <BackButton t={t} onClick={back} disabled={p.busy !== null} />
      <h2 id="balance-cancel-title" ref={headingRef} tabIndex={-1} className="headline-sm text-pa-dark outline-none">
        {t("payPlanPage.cancel")}
      </h2>
      <p className="body-md text-pa-dark">{freeText}</p>
      <div className="p-4 rounded-lg bg-pa-warm border border-pa-sand space-y-1">
        <p className="body-sm font-medium text-pa-dark">{t("payPlanPage.cancelConfirmTitle")}</p>
        <p className="body-sm text-pa-earth">{t("payPlanPage.cancelConfirmBody", { house: p.house })}</p>
      </div>
      {p.error && <ErrorBox>{p.error}</ErrorBox>}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          type="button"
          onClick={p.onConfirmCancel}
          disabled={p.busy !== null}
          className="btn-primary w-full sm:w-auto bg-[#B91C1C] border-[#B91C1C] hover:bg-[#991B1B] hover:border-[#991B1B]"
        >
          {p.busy === "cancel" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
          {p.busy === "cancel" ? t("payPlanPage.working") : t("payPlanPage.cancelConfirmYes")}
        </button>
        <button type="button" onClick={back} disabled={p.busy !== null} className="btn-ghost w-full sm:w-auto">
          {t("payPlanPage.cancelConfirmNo")}
        </button>
      </div>
    </section>
  );
}

/* ── Mensagem ao concierge ("Preciso de ajuda" e cancelamento depois do prazo) ── */

function MessagePanel(
  p: OkStateProps & { titleKey: string; bodyText: string; onSubmit: (message: string) => void; onBack: () => void },
) {
  const { t } = p;
  const [message, setMessage] = useState("");
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (p.busy !== null) return;
    p.onSubmit(message.trim());
  };
  return (
    <section aria-labelledby="balance-message-title" className="space-y-5">
      <BackButton t={t} onClick={p.onBack} disabled={p.busy !== null} />
      <h2 id="balance-message-title" ref={headingRef} tabIndex={-1} className="headline-sm text-pa-dark outline-none">
        {t(p.titleKey)}
      </h2>
      <p className="body-md text-pa-dark">{p.bodyText}</p>
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="balance-message" className="block body-sm font-medium text-pa-dark">
          {t("payPlanPage.messageLabel")}
        </label>
        <textarea
          id="balance-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={1000}
          rows={4}
          aria-describedby="balance-message-safety"
          placeholder={t("payPlanPage.messagePlaceholder")}
          className="w-full rounded-md border border-pa-sand bg-white px-3 py-2.5 text-pa-dark placeholder:text-pa-stone-aa focus:outline-none focus:border-pa-dark focus:ring-1 focus:ring-pa-dark"
        />
        <p id="balance-message-safety" className="caption text-pa-stone-aa">
          {t("payPlanPage.messageSafety")}
        </p>
        {p.error && <ErrorBox>{p.error}</ErrorBox>}
        <button type="submit" disabled={p.busy !== null} className="btn-primary w-full sm:w-auto">
          {p.busy === "help" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
          {p.busy === "help" ? t("payPlanPage.sending") : t("payPlanPage.sendMessage")}
        </button>
      </form>
    </section>
  );
}

function BackButton({ t, onClick, disabled }: { t: T; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 caption text-pa-dark hover:text-pa-gold-aa disabled:opacity-50"
    >
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
      {t("payPlanPage.back")}
    </button>
  );
}

/* ── Usar outro cartão: SetupIntent da plataforma + autorização nova ── */

function ChangeCardPanel(p: OkStateProps & { amountLater: string }) {
  const { t, lang, view } = p;
  const headingRef = useFocusOnMount<HTMLHeadingElement>();
  const consent = view.cardChangeConsent;
  const ready = !!p.setupSecret && !!p.stripePromise && !!consent;
  return (
    <section aria-labelledby="balance-change-title" className="space-y-5 balance-in">
      <BackButton t={t} onClick={p.onCancelChangeCard} />
      <h1 id="balance-change-title" ref={headingRef} tabIndex={-1} className="headline-md text-pa-dark outline-none">
        {t("payPlanPage.changeCard")}
      </h1>
      <p className="body-md text-pa-earth">{t("payPlanPage.changeCardIntro", { amountLater: p.amountLater })}</p>
      {ready ? (
        <Elements
          stripe={p.stripePromise}
          options={{ clientSecret: p.setupSecret!, locale: stripeLocale(lang), appearance: elementsAppearance }}
        >
          <CardChangeForm
            t={t}
            token={p.token}
            consentText={consent!.text}
            consentRenderedAt={consent!.renderedAt}
            onFinish={p.onFinishCardChange}
          />
        </Elements>
      ) : (
        <ErrorBox>{t("payPlanPage.errors.generic")}</ErrorBox>
      )}
    </section>
  );
}

function CardChangeForm({
  t,
  token,
  consentText,
  consentRenderedAt,
  onFinish,
}: {
  t: T;
  token: string;
  /** Texto EXATO do servidor: é o que fica com hash no registo da autorização. */
  consentText: string;
  /** Instante com que o servidor gerou `consentText`; viaja sempre junto com ele. */
  consentRenderedAt: string;
  onFinish: (setupIntentId: string, consentRenderedAt: string) => Promise<{ error: string | null; resetSetup?: boolean }>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [consent, setConsent] = useState(false);
  const [elementReady, setElementReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  /** SetupIntent já confirmado na Stripe mas ainda por registar no servidor. */
  const setupIdRef = useRef<string | null>(null);

  // Se uma releitura da página trouxer outro texto (ex.: "a 28 de junho" passa
  // a "hoje"), a caixa volta a ficar por marcar: a autorização é a do texto à vista.
  const shownTextRef = useRef(consentText);
  useEffect(() => {
    if (shownTextRef.current === consentText) return;
    shownTextRef.current = consentText;
    setConsent(false);
  }, [consentText]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !consent || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      let setupIntentId = setupIdRef.current;
      if (!setupIntentId) {
        // Token no fragmento: o browser não o envia ao servidor no regresso de um redirect.
        const returnUrl = `${window.location.origin}${window.location.pathname}#t=${encodeURIComponent(token)}`;
        const { error: err, setupIntent } = await stripe.confirmSetup({
          elements,
          redirect: "if_required",
          confirmParams: { return_url: returnUrl },
        });
        if (err) {
          setError(stripeErrorText(err, t, "setup"));
          return;
        }
        if (!setupIntent || setupIntent.status !== "succeeded") {
          setError(t("payPlanPage.errors.cardChangeFailed"));
          return;
        }
        setupIntentId = setupIntent.id;
        setupIdRef.current = setupIntentId;
      }
      const r = await onFinish(setupIntentId, consentRenderedAt);
      if (r.resetSetup) setupIdRef.current = null;
      if (r.error) setError(r.error);
    } catch (err) {
      setError(isNetworkError(err) ? t("payPlanPage.errors.network") : t("payPlanPage.errors.cardChangeFailed"));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="p-4 bg-white border border-pa-sand rounded">
        <PaymentElement
          options={{
            layout: "tabs",
            // Só cartão: a autorização é para "este novo cartão".
            wallets: { applePay: "never", googlePay: "never" },
            // A autorização é a nossa caixa, logo abaixo; sem o texto genérico da Stripe.
            terms: { card: "never" },
          }}
          onReady={() => setElementReady(true)}
        />
        {!elementReady && (
          <div className="flex items-center justify-center py-6 gap-2 caption text-pa-stone-aa" role="status">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            {t("payPlanPage.preparing")}
          </div>
        )}
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 shrink-0 accent-pa-dark"
          aria-describedby={consent ? undefined : "balance-consent-hint"}
        />
        <span className="body-sm text-pa-dark leading-relaxed">{consentText}</span>
      </label>

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="space-y-2">
        <button type="submit" disabled={!stripe || !elementReady || !consent || submitting} className="btn-primary w-full">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : null}
          {submitting ? t("payPlanPage.saving") : t("payPlanPage.changeCardSubmit")}
        </button>
        {!consent && (
          <p id="balance-consent-hint" className="caption text-pa-stone-aa text-center">
            {t("payPlanPage.consentHint")}
          </p>
        )}
      </div>
    </form>
  );
}
