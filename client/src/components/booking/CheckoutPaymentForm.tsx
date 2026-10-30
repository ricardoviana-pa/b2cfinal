/**
 * On-site checkout with Stripe PaymentElement (multi-payment-method support).
 * Uses "deferred intent" mode — no server-side PaymentIntent needed.
 * Guesty Booking Engine handles the actual charge; we pass a payment method token.
 *
 * Requires: BE-API + STRIPE_PUBLISHABLE_KEY (from Guesty-connected Stripe account).
 *
 * Checkout 2.0, passo do pagamento (auditoria do funil, out/2026, n.º 1, 4 e 11):
 * - o bloco monta logo que há preço; o formulário do cartão nunca desmonta
 *   enquanto o hóspede edita (nem ao mudar de plano ou de método);
 * - o botão final mostra sempre a ação e o valor e só fica ativo com os
 *   Termos (e, em duas partes, a autorização), que vêm em `consent`, mesmo
 *   acima dele; nome, email e telefone validam-se no clique (`validateGuest`);
 * - Apple Pay / Google Pay à cabeça do bloco, visíveis logo que a Stripe os
 *   reporta (decisão do Ricardo, 29 out 2026). A folha da wallet pede email
 *   e telefone e traz o nome do pagador: o que a página já tem de válido
 *   mantém-se, o resto vem da folha e grava-se no intent antes da cobrança
 *   (walletGuestDetails → onBeforePay(guest)). Debaixo dos botões, uma linha
 *   diz que pagar é aceitar os Termos e a política: a caixa dos Termos só é
 *   obrigatória no cartão, PayPal e Klarna. Só saem em "duas partes";
 * - uma recusa mostra um só aviso traduzido, com até três saídas.
 *
 * Sem <form> (verificação em produção, 29 out 2026): o GA4 (medição avançada,
 * "interações com formulários") manda form_start ao primeiro campo mexido
 * dentro de um <form> e form_submit no submit, e o GTM-TRPCDT3 transforma-os
 * nas conversões 'Start Activity Form' e 'Lead_Site'. Com os Termos dentro do
 * formulário do cartão, cada caixa marcada e cada clique em Pagar contavam
 * como lead. O bloco é um <div>: o botão de pagar é type="button" com onClick,
 * e o resto (ordem do foco, Enter e Espaço no botão, aria) fica igual.
 */

import { useCallback, useEffect, useState, useMemo, useRef, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@/lib/stripeLoader";
import {
  Elements,
  PaymentElement,
  ExpressCheckoutElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { trpc } from "@/lib/trpc";
import { formatQuotedEur } from "@/lib/format";
import { pushDL, pushEcommerce } from "@/lib/datalayer";
import { classifyPaymentError, humanPaymentError, needsPriceRefresh } from "@/lib/paymentErrors";
import { payButtonGate, splitFullName, walletGuestDetails, walletsVisible, type WalletGuest } from "@/lib/checkoutPayment";
import {
  EXPRESS_CHECKOUT_CONTACT_FIELDS,
  EXPRESS_CHECKOUT_ELEMENT_OPTIONS,
  cardElementsOptions,
  expressCheckoutElementsOptions,
  paymentElementOptions,
} from "./stripeElementsOptions";
import { COMPANY_LEGAL_NAME, COMPANY_NIPC, companyAddressLine } from "@shared/company";
import { PayPalCheckoutButton } from "./PayPalCheckoutButton";
import { KlarnaCheckoutButton } from "./KlarnaCheckoutButton";
import PaymentErrorNotice, { type PaymentErrorView, type TwoPartsSwitch } from "./PaymentErrorNotice";
import { klarnaAvailable, klarnaBillingCountry } from "@shared/klarna";

type PaymentMethodId = "card" | "googlepay" | "paypal" | "klarna";

function CardLogo() {
  return (
    <svg width="36" height="25" viewBox="0 0 36 25" fill="none" aria-label="Card" role="img">
      <rect x="0.6" y="0.6" width="34.8" height="23.8" rx="4" fill="#fff" stroke="#d9d9e1" strokeWidth="1.2" />
      <rect x="0.6" y="5" width="34.8" height="5" fill="#3a3a46" />
      <rect x="5" y="15.5" width="11" height="3" rx="1.5" fill="#cfcfd8" />
      <rect x="24" y="15" width="7" height="5" rx="1.2" fill="#f0a92e" />
    </svg>
  );
}

function GooglePayLogo() {
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: "4px", lineHeight: 1 }}
      aria-label="Google Pay"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.182l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.71H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853" />
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.346l2.582-2.582C13.463.892 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
      </svg>
      <span style={{ fontWeight: 500, fontSize: "13px", color: "#5F6368" }}>Pay</span>
    </span>
  );
}

function PayPalLogo() {
  return <img src="/payments/marks/paypal-blue.png" alt="PayPal" className="h-auto w-16" />;
}

function KlarnaLogo() {
  return <img src="/payments/klarna-badge.svg" alt="Klarna" className="h-6 w-auto" />;
}

const PAYMENT_METHODS: Array<{ id: PaymentMethodId; label: string; Logo: () => ReactElement }> = [
  { id: "card",      label: "Card",       Logo: CardLogo },
  { id: "googlepay", label: "Google Pay", Logo: GooglePayLogo },
  { id: "paypal",    label: "PayPal",     Logo: PayPalLogo },
  { id: "klarna",    label: "Klarna",     Logo: KlarnaLogo },
];

function parseApiError(msg: string, t: any): string {
  if (!msg) return t('payment.errors.defaultError');
  if (/Guesty auth failed:\s*429|429|rate limit|Too Many Requests/i.test(msg)) {
    return t('payment.errors.rateLimitError');
  }
  try {
    const parsed = JSON.parse(msg);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const p = parsed[0];
      if (p.path?.includes?.("guestEmail")) return t('payment.errors.invalidEmail');
      if (p.path?.includes?.("guestPhone")) return t('payment.errors.invalidPhone');
      if (p.message) return p.message;
    }
  } catch {
    /* not JSON */
  }
  if (msg.includes("invalid") && msg.toLowerCase().includes("email")) return t('payment.errors.invalidEmail');
  if (msg.includes("invalid") && msg.toLowerCase().includes("phone")) return t('payment.errors.invalidPhone');
  if (msg.length > 120) return t('payment.errors.genericError');
  return msg;
}

interface CheckoutPaymentFormProps {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  quoteId: string;
  ratePlanId: string;
  total: number;
  currency: string;
  guestName: string;
  /** Checkout 2.0: nome e apelido tal como estão nos campos (o `guestName` é
   *  a junção dos dois). Servem às wallets para saber o que a página já tem. */
  guestFirstName?: string;
  guestLastName?: string;
  guestEmail: string;
  guestPhone: string;
  propertyName: string;
  destination?: string;
  notes?: string;
  /** Checkout 2.0: intent id carried through redirect flows so return pages can mark it paid */
  intentId?: string;
  /** Promo code applied to the quote — carried through for GA4 purchase attribution */
  couponCode?: string;
  /** Bloco 6: items GA4 dos serviços (extras, receção, Flex) — viajam com o
   *  stash Klarna/PayPal para o purchase da return page incluir tudo */
  purchaseItems?: Array<Record<string, unknown>>;
  /** Analytics only: property and paid extras visible at payment submission. */
  paymentItems?: Array<Record<string, unknown>>;
  onSuccess: (confirmationCode: string, reservationId?: string) => void;
  /** Widget antigo: botão "Cancelar" por baixo do pagamento. O checkout 2.0
   *  não o passa (o "← Voltar" e a barra de passos chegam; auditoria n.º 11). */
  onCancel?: () => void;
  /** Grava já qualquer estado pendente do intent (debounces) ANTES de criar a
   *  cobrança — o servidor cobra o que está na BD, não o que está no ecrã.
   *  Se falhar, o pagamento aborta (auditoria set/2026, H3). As wallets
   *  passam o hóspede que a folha devolveu (nome, email, telefone), para o
   *  intent ficar com ele antes do createCardCharge. */
  onBeforePay?: (guest?: WalletGuest) => Promise<void>;
  /** Servidor recusou por quote expirada — o CheckoutPage acende o banner de refresh */
  onQuoteExpired?: () => void;
  /** Pagamento em duas partes: o plano escolhido no seletor. Só vem quando o
   *  seletor está visível; nesse caso vai SEMPRE no createCardCharge (sem
   *  `plan` o servidor não dá o Flex incluído). */
  plan?: "full" | "two_parts";
  /** Caixa da autorização da 2.ª cobrança (só conta em duas partes). */
  mandateAccepted?: boolean;
  /** "Depois, 1 250 € a 28 de junho." por baixo do botão, em duas partes. */
  payLaterCaption?: string;
  /** Klarna e PayPal cobram sempre tudo e sem o Flex incluído: o total deles. */
  otherMethodsTotal?: number;
  /** Checkout 2.0: Termos aceites. Sem este prop (widget antigo, que só mostra
   *  o formulário depois dos Termos) o botão não depende dele. */
  termsAccepted?: boolean;
  /** Checkout 2.0: autorização da 2.ª parte, Termos e frase de política,
   *  mesmo acima do botão final do método visível (spec 4.1, pontos 4 e 5). */
  consent?: ReactNode;
  /** Checkout 2.0: valida nome, email e telefone no clique em Pagar. false =
   *  o erro fica no campo, que recebe o foco, e nada é criado nem cobrado. */
  validateGuest?: () => boolean;
  /** Aviso de erro: WhatsApp do concierge com a casa e as datas escritas. */
  conciergeHref?: string;
  /** Aviso de erro: "Pagar em duas partes (X hoje)", só numa recusa pelo
   *  limite do cartão, com a oferta do servidor e o plano em "tudo agora". */
  twoPartsSwitch?: TwoPartsSwitch | null;
  /** O servidor deixou de dar as duas partes: voltar a "tudo agora" e reler a oferta. */
  onTwoPartsUnavailable?: () => void;
  /** O servidor pediu a autorização da 2.ª parte: levar o hóspede à caixa. */
  onMandateMissing?: () => void;
  /** /checkout/demo: o bloco completo sem Stripe, sem eventos e sem cobrança possível. */
  demo?: boolean;
  /** Demo (?declined=insufficient_funds): simula uma recusa, para rever o aviso. */
  demoDecline?: string | null;
  /** País de faturação do Klarna (shared/klarna.ts: telefone do hóspede →
   *  língua do site → PT). Decide se o separador da Klarna aparece (país e
   *  tecto) e é o país com que a Klarna confirma. */
  klarnaCountry?: string;
}

const isQuoteExpiredError = (e: unknown) =>
  /quote expired|refresh your dates|refresh the price/i.test(String((e as { message?: unknown })?.message ?? ""));

/** Erro → aviso: a mensagem humana na língua do hóspede e a classificação
 *  (que decide as ações do aviso). */
function errorView(e: unknown, t: any): PaymentErrorView {
  return { message: humanPaymentError(e, t), info: classifyPaymentError(e) };
}

/** Texto do botão do cartão: sempre a ação e o valor. */
function cardPayLabel(t: any, lang: string, total: number, plan: "full" | "two_parts" | undefined, loading: boolean): string {
  if (loading) return plan === "two_parts" ? t("payment.processingFirst", "Processing the first part…") : t("payment.processing");
  return plan === "two_parts"
    ? t("payment.payNowButton", { amountNow: formatQuotedEur(total, lang) })
    : t("payment.payButton", { amount: formatQuotedEur(total, lang) });
}

/** Funil (out/2026): as recusas de pagamento só apareciam no ecrã do hóspede.
 *  Este evento leva para o GA4 o passo e o código do erro (Stripe: type, code,
 *  decline_code), para sabermos quantas pessoas tentam pagar e são recusadas,
 *  e porquê. Só códigos técnicos: nunca a mensagem nem dados do hóspede. */
function trackPaymentFailed(args: {
  stage: "validation" | "confirm" | "server";
  method: string;
  error: unknown;
  listingId: string;
  value: number;
}) {
  const err = (args.error ?? {}) as { type?: unknown; code?: unknown; decline_code?: unknown };
  const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 60) : undefined);
  pushDL({
    event: "payment_failed",
    payment_stage: args.stage,
    payment_type: args.method,
    error_type: str(err.type) ?? (isQuoteExpiredError(args.error) ? "quote_expired" : "unknown"),
    error_code: str(err.code),
    decline_code: str(err.decline_code),
    property_id: args.listingId,
    value: args.value,
    currency: "EUR",
  });
}

/** Props do aviso de erro, iguais para todos os métodos. */
interface ErrorNoticeProps {
  plan?: "full" | "two_parts";
  twoParts: TwoPartsSwitch | null;
  onUseOtherMethod: () => void;
  conciergeHref?: string;
}

/* ════════════════════════════════════════════════════════════════
   Bloco 3 — Apple Pay / Google Pay via ExpressCheckoutElement.
   SÓ no checkout v2 (intentId presente) e SEMPRE na conta de
   PLATAFORMA: mesmo padrão do cartão v2 — createCardCharge lazy no
   confirm (total canónico do servidor), confirmPayment inline,
   finalizeCardCharge cria a reserva Guesty só com a estadia.
   O legacy (sem intentId) nunca monta este bloco.
   ════════════════════════════════════════════════════════════════ */
function ExpressWalletInner({
  intentId,
  listingId,
  total,
  paymentItems,
  onSuccess,
  onBeforePay,
  onQuoteExpired,
  withPlan,
  page,
  validateGuest,
  error,
  setError,
  noticeProps,
}: {
  intentId: string;
  listingId: string;
  total: number;
  /** Seletor visível: as wallets pagam sempre tudo, com plan "full". */
  withPlan?: boolean;
  paymentItems?: Array<Record<string, unknown>>;
  onSuccess: (confirmationCode: string, reservationId?: string) => void;
  onBeforePay?: (guest?: WalletGuest) => Promise<void>;
  onQuoteExpired?: () => void;
  /** O que a página já tem (campos do hóspede); o que for válido mantém-se. */
  page: { firstName: string; lastName: string; email: string; phone: string };
  /** Sem dados nem na folha nem na página: assinala os campos e dá-lhes o foco. */
  validateGuest?: () => boolean;
  error: PaymentErrorView | null;
  setError: (e: PaymentErrorView | null) => void;
  noticeProps: ErrorNoticeProps;
}) {
  const { t, i18n } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const createCardCharge = trpc.checkout.createCardCharge.useMutation();
  const finalizeCardCharge = trpc.checkout.finalizeCardCharge.useMutation();
  const [available, setAvailable] = useState(false);
  const processingRef = useRef(false);
  const paymentInfoFiredRef = useRef(false);
  const pageRef = useRef(page);
  pageRef.current = page;

  /** Fecha a folha da wallet com falha (erro antes do confirmPayment). */
  const closeSheet = (event: { paymentFailed?: (p?: { reason?: "fail" | "invalid_shipping_address" }) => void }) => {
    try { event.paymentFailed?.({ reason: "fail" }); } catch { /* a folha já fechou */ }
  };

  const handleConfirm = async (event: {
    expressPaymentType?: string;
    paymentFailed?: (p?: { reason?: "fail" | "invalid_shipping_address" }) => void;
    billingDetails?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  }) => {
    if (!stripe || !elements || processingRef.current) return;
    // O hóspede da reserva: a página, quando já tem os dados válidos; senão a
    // folha (nome do pagador, email e telefone pedidos pela wallet). Sem tudo,
    // a folha fecha com falha e os campos da página ficam assinalados.
    const { guest, missing } = walletGuestDetails({ page: pageRef.current, sheet: event.billingDetails });
    if (missing.length) {
      closeSheet(event);
      validateGuest?.();
      setError({ message: t("payment.errors.requiredFields") });
      return;
    }
    processingRef.current = true;
    setError(null);

    // M11: fire-once — cada retry de wallet duplicava o add_payment_info
    if (!paymentInfoFiredRef.current) {
      paymentInfoFiredRef.current = true;
    pushEcommerce({
      event: "add_payment_info",
      payment_type: event.expressPaymentType || "wallet",
      property_id: listingId,
      ecommerce: { currency: "EUR", value: total, items: paymentItems },
    });
    }

    // Só depois do confirmPayment ter sucedido é que um erro significa
    // "dinheiro capturado" — antes disso, re-tentar é sempre seguro.
    let paymentCaptured = false;
    let confirming = false;
    try {
      // Deferred flow: validar o elemento antes de criar o PI (regra Stripe)
      const { error: submitError } = await elements.submit();
      if (submitError) {
        trackPaymentFailed({ stage: "validation", method: event.expressPaymentType || "wallet", error: submitError, listingId, value: total });
        setError(errorView(submitError, t));
        closeSheet(event);
        processingRef.current = false;
        return;
      }
      // Estado pendente (debounces de extras/dados) e o hóspede da folha
      // gravados ANTES da cobrança: o servidor cobra e reserva o que está na BD.
      await onBeforePay?.(guest);
      // PI lazy com o total canónico do servidor — nunca o valor do cliente.
      // wallet:true → PI automatic (a sessão do ECE é automatic; um PI types
      // seria recusado no confirm — visto no 1.º toque real de GPay).
      const { clientSecret, paymentIntentId, alreadyPaid } = (await createCardCharge.mutateAsync({ intentId, wallet: true, ...(withPlan ? { plan: "full" as const } : {}) })) as any;
      if (alreadyPaid) {
        // pagamento já capturado numa tentativa anterior — só falta a reserva
        paymentCaptured = true;
        const fin = await finalizeCardCharge.mutateAsync({ intentId, paymentIntentId });
        onSuccess(fin.confirmationCode, fin.reservationId);
        return;
      }
      confirming = true;
      const { error: confirmErr, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });
      if (confirmErr) {
        trackPaymentFailed({ stage: "confirm", method: event.expressPaymentType || "wallet", error: confirmErr, listingId, value: total });
        setError(errorView(confirmErr, t));
        processingRef.current = false;
        return;
      }
      paymentCaptured = true;
      const fin = await finalizeCardCharge.mutateAsync({
        intentId,
        paymentIntentId: paymentIntent?.id ?? paymentIntentId,
      });
      onSuccess(fin.confirmationCode, fin.reservationId);
    } catch (e: any) {
      if (paymentCaptured) {
        // Dinheiro capturado, reserva pendente — o webhook/sweep completam;
        // manter o botão bloqueado e dizer a verdade ao hóspede.
        setError({
          message: t("payment.errors.paidAwaitingConfirmation", "Your payment was received. We are confirming your booking — you will get the confirmation by email in a few minutes. Do not pay again."),
          info: { key: "payment.errors.paidAwaitingConfirmation", kind: "blocked", retrySameCard: false },
        });
      } else {
        // Nada foi cobrado: desbloquear para nova tentativa (antes ficava um
        // botão vivo mas inerte — auditoria set/2026, H5)
        trackPaymentFailed({ stage: "server", method: event.expressPaymentType || "wallet", error: e, listingId, value: total });
        if (isQuoteExpiredError(e)) onQuoteExpired?.();
        setError(errorView(e, t));
        // Antes do confirm a folha fica à espera: fechá-la já, com falha.
        if (!confirming) closeSheet(event);
        processingRef.current = false;
      }
    }
  };

  return (
    <div style={{ display: available ? "block" : "none" }} className="space-y-3" data-testid="checkout-wallets">
      <ExpressCheckoutElement
        options={{
          // Só wallets, com o nome da marca e a morada de faturação pedida
          // (EXPRESS_CHECKOUT_ELEMENT_OPTIONS, revisão do #188); sem handler de
          // clique: a folha abre logo.
          ...EXPRESS_CHECKOUT_ELEMENT_OPTIONS,
          // A folha pede o email e o telefone da reserva (o nome vem com o pagador)
          ...EXPRESS_CHECKOUT_CONTACT_FIELDS,
        }}
        onReady={({ availablePaymentMethods }) => setAvailable(!!availablePaymentMethods)}
        onConfirm={handleConfirm}
      />
      <WalletsAcceptLine lang={i18n.language} total={total} />
      {error && <PaymentErrorNotice error={error} {...noticeProps} plan="full" />}
      <div aria-hidden style={{ borderTop: "1px solid #E8E4DC" }} />
    </div>
  );
}

/** Debaixo dos botões das wallets, no lugar da linha dos Termos: os factos
 *  pré-contratuais que a folha da wallet não mostra (quem vende, com o NIPC, e
 *  o total, tudo hoje: as wallets nunca pagam em duas partes) e que pagar é
 *  aceitar os Termos e a política de cancelamento (a caixa dos Termos só é
 *  obrigatória no cartão, PayPal e Klarna). A frase da política e a nota da
 *  livre resolução ficam no bloco pré-contratual, uma vez por ecrã. */
function WalletsAcceptLine({ lang, total }: { lang: string; total: number }) {
  const { t } = useTranslation();
  const link = "text-pa-dark underline hover:text-pa-gold-aa";
  const address = companyAddressLine();
  const amount = formatQuotedEur(total, lang);
  return (
    <div className="space-y-1" data-testid="wallets-accept-line">
      <p className="caption text-pa-stone-aa leading-snug">
        {t("checkout.legal.operator", { company: COMPANY_LEGAL_NAME, nipc: COMPANY_NIPC })}
        {address ? ` · ${address}` : ""}
        {" · "}
        <span className="text-pa-dark tabular-nums">
          {t("checkout.legal.total", { total: amount })} · {t("checkout.legal.payFull", { amount })}
        </span>
      </p>
      <p className="caption text-pa-earth leading-snug">
        {t("payment.walletsAcceptPrefix")}{" "}
        <a href={`/${lang}/legal/terms`} target="_blank" rel="noopener noreferrer" className={link}>{t("bookingWidget.termsLink", "Terms & Conditions")}</a>
        {" "}{t("bookingWidget.termsAnd", "and the")}{" "}
        <a href={`/${lang}/legal/cancellation-policy`} target="_blank" rel="noopener noreferrer" className={link}>{t("bookingWidget.cancellationPolicyLink")}</a>.
      </p>
    </div>
  );
}

/** Policy acceptance object sent to Guesty BE API instant booking */
function buildPolicyPayload() {
  return {
    termsAndConditions: { accepted: true, acceptedAt: new Date().toISOString() },
    cancellationPolicy: { accepted: true, acceptedAt: new Date().toISOString() },
    privacyPolicy: { accepted: true, acceptedAt: new Date().toISOString() },
  };
}

function PaymentFormInner({
  intentId,
  listingId,
  checkIn,
  checkOut,
  guests,
  quoteId,
  ratePlanId,
  total,
  guestName,
  guestEmail,
  guestPhone,
  onSuccess,
  onCancel,
  notes,
  propertyName,
  destination,
  paymentItems,
  onBeforePay,
  onQuoteExpired,
  plan,
  mandateAccepted,
  payLaterCaption,
  termsAccepted,
  consent,
  validateGuest,
  onTwoPartsUnavailable,
  onMandateMissing,
  visible,
  error,
  setError,
  noticeProps,
}: Omit<CheckoutPaymentFormProps, "currency"> & {
  /** O cartão fica montado (e o que já foi escrito) mesmo com PayPal/Klarna escolhidos. */
  visible: boolean;
  error: PaymentErrorView | null;
  setError: (e: PaymentErrorView | null) => void;
  noticeProps: ErrorNoticeProps;
}) {
  const { t, i18n } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const createCardCharge = trpc.checkout.createCardCharge.useMutation();
  const finalizeCardCharge = trpc.checkout.finalizeCardCharge.useMutation();
  const [loading, setLoading] = useState(false);
  const submittedRef = useRef(false);
  const paymentInfoFiredRef = useRef(false);
  const createReservation = trpc.booking.createBEInstantReservation.useMutation();
  const gate = payButtonGate({ termsAccepted: termsAccepted ?? true, plan, mandateAccepted });
  // Legacy (sem intentId): o Apple Pay aparece como aba do PaymentElement.
  const paymentOptions = useMemo(() => paymentElementOptions({ legacyApplePay: !intentId }), [intentId]);
  const setErrorText = (message: string) => setError(message ? { message } : null);

  const handleSubmit = async (e?: React.SyntheticEvent) => {
    e?.preventDefault();
    if (submittedRef.current) return;
    // Checkout 2.0: nome, email e telefone validam-se aqui. Se faltar algo, o
    // erro fica no campo (que recebe o foco) e nada é criado nem cobrado.
    if (validateGuest && !validateGuest()) return;
    // Termos (e a autorização, em duas partes): o botão já está inativo sem eles.
    if (!gate.enabled) return;
    if (!stripe || !elements || !guestName.trim() || !guestEmail.trim() || !guestPhone.trim()) {
      setErrorText(t('payment.errors.requiredFields'));
      return;
    }

    // GA4: add_payment_info — guest submitted payment details (card flow)
    if (!paymentInfoFiredRef.current) {
      paymentInfoFiredRef.current = true;
      pushEcommerce({
        event: "add_payment_info",
        payment_type: "card",
        property_id: listingId,
        ecommerce: { currency: "EUR", value: total, items: paymentItems },
      });
    }

    submittedRef.current = true;
    setLoading(true);
    setError(null);

    // Step 1: Validate the PaymentElement form (safe to retry — no charge yet)
    const { error: submitError } = await elements.submit();
    if (submitError) {
      trackPaymentFailed({ stage: "validation", method: "card", error: submitError, listingId, value: total });
      setError(intentId ? errorView(submitError, t) : { message: submitError.message || t('payment.errors.cardValidationFailed') });
      setLoading(false);
      submittedRef.current = false; // Safe: no payment method created yet
      return;
    }

    // ═══ Checkout 2.0 (2b): cobrança única na PLATAFORMA ═══
    // PI criado lazy AGORA (total canónico do servidor); confirmPayment inline;
    // finalize cria a reserva Guesty só com a estadia. Legacy segue em baixo.
    if (intentId) {
      // Só depois do confirmPayment ter sucedido é que um erro significa
      // "dinheiro capturado" — antes disso, re-tentar é sempre seguro.
      let paymentCaptured = false;
      try {
        // Estado pendente (debounces de extras/dados) gravado ANTES da cobrança
        await onBeforePay?.();
        const { clientSecret, paymentIntentId, alreadyPaid } = await createCardCharge.mutateAsync({
          intentId,
          ...(plan ? { plan, ...(plan === "two_parts" ? { mandateAccepted: mandateAccepted === true } : {}) } : {}),
        });
        if (alreadyPaid) {
          paymentCaptured = true;
          const fin = await finalizeCardCharge.mutateAsync({ intentId, paymentIntentId });
          onSuccess(fin.confirmationCode, fin.reservationId);
          return;
        }
        if (!clientSecret) throw new Error("createCardCharge returned no clientSecret");
        const { error: confirmErr, paymentIntent } = await stripe.confirmPayment({
          elements,
          clientSecret,
          confirmParams: {
            return_url: window.location.href,
            // O Element esconde país/código postal (fields: never, herdado do
            // legacy) — o Stripe EXIGE que venham no confirm (teste 12 ago)
            payment_method_data: { billing_details: { address: { country: "PT", postal_code: "" } } },
          },
          redirect: "if_required",
        });
        if (confirmErr) {
          trackPaymentFailed({ stage: "confirm", method: "card", error: confirmErr, listingId, value: total });
          setError(errorView(confirmErr, t));
          setLoading(false);
          submittedRef.current = false;
          return;
        }
        paymentCaptured = true;
        const fin = await finalizeCardCharge.mutateAsync({
          intentId,
          paymentIntentId: paymentIntent?.id ?? paymentIntentId,
        });
        onSuccess(fin.confirmationCode, fin.reservationId);
      } catch (e: any) {
        if (paymentCaptured) {
          // Dinheiro capturado, reserva pendente — o webhook/sweep completam;
          // manter o botão bloqueado e dizer a verdade ao hóspede.
          setError({
            message: t("payment.errors.paidAwaitingConfirmation", "Your payment was received. We are confirming your booking — you will get the confirmation by email in a few minutes. Do not pay again."),
            info: { key: "payment.errors.paidAwaitingConfirmation", kind: "blocked", retrySameCard: false },
          });
          setLoading(false);
        } else {
          // Nada foi cobrado: desbloquear para nova tentativa (antes ficava
          // um botão vivo mas inerte — auditoria set/2026, H5)
          trackPaymentFailed({ stage: "server", method: "card", error: e, listingId, value: total });
          if (isQuoteExpiredError(e)) onQuoteExpired?.();
          const view = errorView(e, t);
          // Duas partes deixaram de existir: volta a "tudo agora" e relê a oferta.
          if (view.info?.kind === "two_parts_unavailable") onTwoPartsUnavailable?.();
          if (view.info?.kind === "mandate_missing") onMandateMissing?.();
          setError(view);
          setLoading(false);
          submittedRef.current = false;
        }
      }
      return;
    }

    // Step 2: Create payment method from PaymentElement (safe to retry — no charge yet)
    let paymentMethod;
    try {
      const { error: stripeError, paymentMethod: pm } = await stripe.createPaymentMethod({
        elements,
        params: {
          billing_details: {
            address: { country: "PT", postal_code: "" },
          },
        },
      });

      if (stripeError) {
        trackPaymentFailed({ stage: "validation", method: "card_legacy", error: stripeError, listingId, value: total });
        setErrorText(stripeError.message || t('payment.errors.cardValidationFailed'));
        setLoading(false);
        submittedRef.current = false;
        return;
      }

      if (!pm?.id) {
        setErrorText(t('payment.errors.couldNotCreatePaymentMethod'));
        setLoading(false);
        submittedRef.current = false;
        return;
      }

      paymentMethod = pm;
    } catch (stripeException: any) {
      setErrorText(stripeException?.message || t('payment.errors.cardValidationFailed'));
      setLoading(false);
      submittedRef.current = false;
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // Step 3: POINT OF NO RETURN — Send PM to Guesty for charging
    // After this point, the card MAY be charged. We NEVER reset
    // submittedRef unless the error clearly indicates no charge.
    // ═══════════════════════════════════════════════════════════════
    try {
      const response = await Promise.race([
        createReservation.mutateAsync({
          quoteId,
          ratePlanId,
          ccToken: paymentMethod.id,
          guestName,
          guestEmail,
          guestPhone,
          policy: buildPolicyPayload(),
          listingId,
          propertyName,
          destination,
          checkIn,
          checkOut,
          guests,
          totalPrice: total,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Payment provider timeout")), 45000);
        }),
      ]);
      onSuccess(response.confirmationCode, (response as any).reservationId || undefined);
    } catch (err: any) {
      trackPaymentFailed({ stage: "server", method: "card_legacy", error: err, listingId, value: total });
      const message = parseApiError(err?.message || t('payment.errors.defaultError'), t);
      const rawMsg = String(err?.message || "").toLowerCase();

      // Only allow retry if we're confident the card was NOT charged:
      // - Validation errors (email, phone, dates)
      // - Rate limiting (request didn't reach Guesty's payment processor)
      // - Dates already booked by someone else
      const safeToRetry =
        rawMsg.includes("invalid") ||
        rawMsg.includes("email") ||
        rawMsg.includes("phone") ||
        rawMsg.includes("429") ||
        rawMsg.includes("rate limit") ||
        rawMsg.includes("just been booked") ||
        rawMsg.includes("not available") ||
        rawMsg.includes("check your details");

      if (safeToRetry) {
        submittedRef.current = false;
        setErrorText(message);
      } else {
        // Potentially charged — do NOT allow retry.
        // Show error with contact info so guest can verify.
        setErrorText(
          message + "\n\n" +
          t('payment.errors.contactSupport', {
            defaultValue: "If you were charged, please contact us at reservations@portugalactive.com or WhatsApp +351 927 161 771. Do not attempt to pay again."
          })
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Sem <form>: ver o cabeçalho do ficheiro (conversões falsas no GTM).
  return (
    <div className="space-y-4" style={visible ? undefined : { display: "none" }}>
      <div className="p-4 bg-white border border-[#E8E4DC] rounded">
        {/* Opções em paymentElementOptions (stripeElementsOptions.ts): wallets
            desligadas, só o Apple Pay do legacy (sem intentId), e o nome da marca
            no texto da Stripe. */}
        <PaymentElement options={paymentOptions} />
      </div>

      {error && <PaymentErrorNotice error={error} {...noticeProps} />}

      {/* Autorização (duas partes), Termos e política, mesmo acima do botão */}
      {visible && consent}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!stripe || loading || !gate.enabled}
          className="btn-primary w-full disabled:opacity-50"
        >
          {cardPayLabel(t, i18n.language, total, plan, loading)}
        </button>
        {plan === "two_parts" && payLaterCaption && (
          <p className="caption text-pa-earth text-center -mt-1">{payLaterCaption}</p>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost">
            {t('payment.cancelButton')}
          </button>
        )}
      </div>
    </div>
  );
}

/** /checkout/demo: o mesmo bloco, sem Stripe (os campos do cartão são uma
 *  imagem) — para rever o percurso e o aviso de erro sem cobrança possível.
 *  Também sem <form>: a demo não pode disparar nenhum evento nem conversão. */
function DemoCardForm({
  visible,
  plan,
  total,
  payLaterCaption,
  enabled,
  consent,
  error,
  noticeProps,
  onPay,
}: {
  visible: boolean;
  plan?: "full" | "two_parts";
  total: number;
  payLaterCaption?: string;
  enabled: boolean;
  consent?: ReactNode;
  error: PaymentErrorView | null;
  noticeProps: ErrorNoticeProps;
  onPay: () => void;
}) {
  const { t, i18n } = useTranslation();
  const field = "h-[44px] rounded border border-[#E8E4DC] px-3 flex items-center caption text-pa-stone-aa";
  return (
    <div className="space-y-4" style={visible ? undefined : { display: "none" }}>
      <div className="p-4 bg-white border border-[#E8E4DC] rounded space-y-2" aria-hidden>
        <div className={field}>1234 1234 1234 1234</div>
        <div className="grid grid-cols-2 gap-2">
          <div className={field}>MM / YY</div>
          <div className={field}>CVC</div>
        </div>
      </div>
      {error && <PaymentErrorNotice error={error} {...noticeProps} />}
      {visible && consent}
      <div className="flex flex-col gap-3">
        <button type="button" onClick={onPay} disabled={!enabled} className="btn-primary w-full disabled:opacity-50">
          {cardPayLabel(t, i18n.language, total, plan, false)}
        </button>
        {plan === "two_parts" && payLaterCaption && (
          <p className="caption text-pa-earth text-center -mt-1">{payLaterCaption}</p>
        )}
      </div>
    </div>
  );
}

export default function CheckoutPaymentForm(props: CheckoutPaymentFormProps) {
  const { t, i18n } = useTranslation();
  const demo = !!props.demo;
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("card");
  const [hoveredMethod, setHoveredMethod] = useState<PaymentMethodId | null>(null);
  // Um aviso por método; ficam aqui para o cartão manter o que foi escrito
  // (e o seu aviso) quando o hóspede espreita outro método.
  const [cardError, setCardError] = useState<PaymentErrorView | null>(null);
  const [walletError, setWalletError] = useState<PaymentErrorView | null>(null);
  const [paypalError, setPaypalError] = useState<PaymentErrorView | null>(null);
  const [klarnaError, setKlarnaError] = useState<PaymentErrorView | null>(null);
  const [demoNotice, setDemoNotice] = useState(false);
  const methodsRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // Em duas partes só há cartão: volta ao cartão se estava noutro método.
  useEffect(() => {
    if (props.plan === "two_parts" && paymentMethod !== "card") setPaymentMethod("card");
  }, [props.plan, paymentMethod]);
  // As wallets saem em duas partes: um aviso delas não pode reaparecer ao voltar.
  useEffect(() => {
    if (props.plan === "two_parts") setWalletError(null);
  }, [props.plan]);
  // Klarna só no país de faturação e até ao tecto que a Klarna aceita
  // (shared/klarna.ts). Se deixar de estar disponível (telefone de outro país,
  // um extra que passa o tecto), volta ao cartão em vez de um separador morto.
  const klarnaCountry = props.klarnaCountry ?? klarnaBillingCountry({ siteLang: i18n.language });
  const klarnaOk = klarnaAvailable(klarnaCountry, Math.round((props.otherMethodsTotal ?? props.total) * 100));
  useEffect(() => {
    if (!klarnaOk && paymentMethod === "klarna") setPaymentMethod("card");
  }, [klarnaOk, paymentMethod]);
  const { data: stripeConfig, isLoading: stripeConfigLoading } = trpc.booking.getStripeConfig.useQuery(undefined, {
    enabled: !demo,
  });
  // Per-listing payment provider: fetch the Stripe connected account for this property.
  // Checkout 2.0: o PI vive na conta de PLATAFORMA e o resultado desta chamada
  // (ao Guesty) era deitado fora — esperar por ela só atrasava o cartão.
  const { data: paymentProvider, isLoading: providerLoading } = trpc.booking.getPaymentProvider.useQuery(
    { listingId: props.listingId },
    { enabled: !!props.listingId && !props.intentId && !demo },
  );

  // Per-listing Stripe connected account is the ONLY source of truth.
  // Never fall back to stripeConfig.stripeAccountId (env var may be wrong/stale).
  // 2b: no checkout v2 o PI vive na conta de PLATAFORMA — nunca ligar a conectada
  const stripeAccountId = props.intentId ? null : (paymentProvider?.providerAccountId || null);

  // Hooks must be called unconditionally before any early returns.
  const stripePromise = useMemo(
    () => {
      if (!stripeConfig?.publishableKey) return null;
      return loadStripe(
        stripeConfig.publishableKey,
        stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
      );
    },
    [stripeConfig?.publishableKey, stripeAccountId],
  );

  // Deferred intent mode: PaymentElement without a client secret
  // (cardElementsOptions: setupFutureUsage, só cartão e a letra do site, com
  // `fonts` fixo desde a primeira vez). Uma só instância para o cartão (sem
  // key por plano ou método): mudar de plano atualiza o valor
  // (elements.update) e o cartão escrito fica.
  const elementsOptions = useMemo(
    () => cardElementsOptions(props.total, props.currency, i18n.language),
    [props.total, props.currency, i18n.language],
  );

  // Bloco 3: opções do Elements para o ExpressCheckoutElement (wallets), com o
  // mesmo setupFutureUsage do PaymentIntent (sem ele a Stripe recusava o
  // confirm das wallets desde 29 ago 2026).
  const expressElementsOptions = useMemo(
    () => expressCheckoutElementsOptions(props.total, props.currency, i18n.language),
    [props.total, props.currency, i18n.language],
  );

  const clearErrors = useCallback(() => {
    setCardError(null);
    setWalletError(null);
    setPaypalError(null);
    setKlarnaError(null);
  }, []);

  /** "Usar outro cartão ou método": leva ao seletor (ou, em duas partes, ao cartão). */
  const goToOtherMethod = useCallback(() => {
    clearErrors();
    const target = props.plan === "two_parts" ? cardRef.current : (methodsRef.current ?? cardRef.current);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus({ preventScroll: true });
  }, [clearErrors, props.plan]);

  const twoPartsSwitch = props.twoPartsSwitch;
  const noticeProps: ErrorNoticeProps = useMemo(
    () => ({
      plan: props.plan,
      twoParts: twoPartsSwitch
        ? { amountNow: twoPartsSwitch.amountNow, onSelect: () => { clearErrors(); twoPartsSwitch.onSelect(); } }
        : null,
      onUseOtherMethod: goToOtherMethod,
      conciergeHref: props.conciergeHref,
    }),
    [props.plan, twoPartsSwitch, clearErrors, goToOtherMethod, props.conciergeHref],
  );

  const gate = payButtonGate({ termsAccepted: props.termsAccepted ?? true, plan: props.plan, mandateAccepted: props.mandateAccepted });
  const otherMethodsAmount = props.otherMethodsTotal ?? props.total;

  /** PayPal/Klarna falharam antes do redirect: o mesmo aviso traduzido do cartão.
   *  "O preço ou os dados mudaram" (wallet-price-validation.ts) acende, como o
   *  preço expirado, o "Atualizar preço": tentar outra vez dava o mesmo erro. */
  const onRedirectMethodError = (method: "paypal" | "klarna") => (err: unknown, stage: "server" | "confirm") => {
    trackPaymentFailed({ stage, method, error: err, listingId: props.listingId, value: otherMethodsAmount });
    const view = errorView(err, t);
    if (isQuoteExpiredError(err) || needsPriceRefresh(view.info)) props.onQuoteExpired?.();
    (method === "paypal" ? setPaypalError : setKlarnaError)(view);
  };

  /** Demo: o mesmo percurso até ao clique, depois uma recusa simulada ou o aviso de demo. */
  const demoPay = (setError: (e: PaymentErrorView | null) => void) => {
    if (props.validateGuest && !props.validateGuest()) return;
    if (!gate.enabled) return;
    setDemoNotice(false);
    if (props.demoDecline) {
      setError(errorView({ type: "card_error", code: "card_declined", decline_code: props.demoDecline, message: "Your card was declined." }, t));
    } else {
      setError(null);
      setDemoNotice(true);
    }
  };

  // CRITICAL: Wait for BOTH queries to settle before rendering Stripe Elements.
  // Without this, the component renders with the wrong Stripe account (from env var)
  // and then re-mounts when the per-listing account loads, breaking the PaymentElement.
  // (No checkout v2 a conta é sempre a de plataforma: só falta a chave.)
  if (!demo && (stripeConfigLoading || providerLoading)) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-sm text-black/40">
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        {t('payment.preparingSecure')}
      </div>
    );
  }

  if (!demo && (!stripeConfig?.publishableKey || !stripePromise)) {
    // M6 (auditoria set/2026): antes isto era `null` — área de pagamento em
    // branco, sem explicação. O hóspede merece saber e ter uma saída.
    return (
      <div className="flex items-start gap-2 p-4 bg-[#F5F1EB] border border-[#E8E4DC] rounded-md">
        <span className="text-pa-gold-aa mt-0.5 shrink-0" aria-hidden>&#9888;</span>
        <p className="text-sm leading-relaxed text-[#1A1A18]">
          {t("payment.unavailableFallback", "Online payment is temporarily unavailable. Please try again in a few minutes, or contact our concierge and we will complete your booking personally.")}
        </p>
      </div>
    );
  }

  const nameParts = props.guestName.trim().split(/\s+/);
  const guestFirstName = nameParts[0] || props.guestName;
  const guestLastName = nameParts.slice(1).join(" ") || guestFirstName;
  const twoParts = props.plan === "two_parts";
  const cardVisible = twoParts || (paymentMethod !== "paypal" && paymentMethod !== "klarna");
  // Apple Pay / Google Pay à cabeça; só saem em duas partes (pagam tudo hoje).
  const showWallets = !!props.intentId && walletsVisible({ plan: props.plan });
  const pageGuest = {
    firstName: props.guestFirstName ?? splitFullName(props.guestName).firstName,
    lastName: props.guestLastName ?? (props.guestName.trim().includes(" ") ? splitFullName(props.guestName).lastName : ""),
    email: props.guestEmail,
    phone: props.guestPhone,
  };
  const publishableKey = stripeConfig?.publishableKey ?? "";

  const redirectGuest = {
    firstName: guestFirstName,
    lastName: guestLastName,
    email: props.guestEmail,
    phone: props.guestPhone || undefined,
  };
  const redirectCommon = {
    amount: otherMethodsAmount,
    currency: props.currency || "eur",
    listingId: props.listingId,
    checkIn: props.checkIn,
    checkOut: props.checkOut,
    guestDetails: redirectGuest,
    numberOfGuests: { adults: props.guests || 2, children: 0, infants: 0 },
    propertyName: props.propertyName,
    destination: props.destination,
    ratePlanId: props.ratePlanId,
    intentId: props.intentId,
    couponCode: props.couponCode,
    purchaseItems: props.purchaseItems,
    paymentItems: props.paymentItems,
    stripePublishableKey: publishableKey,
    disabled: !gate.enabled,
    onBeforeStart: props.validateGuest,
    onBeforePay: props.onBeforePay,
    demo,
  };

  return (
    <div className="space-y-4">
      {/* Bloco 3: Apple Pay / Google Pay (Express Checkout, conta de plataforma)
          à cabeça do bloco — só no checkout v2; o legacy nunca monta este bloco */}
      {showWallets && (demo ? (
        <div className="space-y-3" data-testid="checkout-wallets">
          {/* Demo: os botões das wallets como a Stripe os desenha (pretos, lado a lado) */}
          <div aria-hidden className="grid grid-cols-2 gap-2">
            <div className="h-[44px] rounded-md bg-pa-dark flex items-center justify-center text-white text-[15px] font-medium tracking-tight">
              Apple Pay
            </div>
            <div className="h-[44px] rounded-md bg-pa-dark flex items-center justify-center text-white text-[15px] font-medium tracking-tight">
              Google Pay
            </div>
          </div>
          <WalletsAcceptLine lang={i18n.language} total={props.total} />
          <div aria-hidden style={{ borderTop: "1px solid #E8E4DC" }} />
        </div>
      ) : (
        <Elements stripe={stripePromise} options={expressElementsOptions}>
          <ExpressWalletInner
            withPlan={!!props.plan}
            intentId={props.intentId!}
            listingId={props.listingId}
            total={props.total}
            paymentItems={props.paymentItems}
            onSuccess={props.onSuccess}
            onBeforePay={props.onBeforePay}
            onQuoteExpired={props.onQuoteExpired}
            page={pageGuest}
            validateGuest={props.validateGuest}
            error={walletError}
            setError={setWalletError}
            noticeProps={noticeProps}
          />
        </Elements>
      ))}

      {/* Payment method selector — icon cards (Google Pay hidden; Klarna só
          quando o país e o valor cabem no que ela aceita). Em duas partes só
          há cartão: Klarna e PayPal cobram tudo hoje. */}
      {!twoParts && (
      <div ref={methodsRef} tabIndex={-1} className="outline-none" style={{ display: "grid", gridTemplateColumns: `repeat(${klarnaOk ? 3 : 2}, 1fr)`, gap: "9px" }}>
        {PAYMENT_METHODS.filter(({ id }) => id !== "googlepay" && (id !== "klarna" || klarnaOk)).map(({ id, label, Logo }) => (
          <button
            key={id}
            type="button"
            aria-pressed={paymentMethod === id}
            onClick={() => { setPaymentMethod(id); clearErrors(); setDemoNotice(false); }}
            onMouseEnter={() => setHoveredMethod(id)}
            onMouseLeave={() => setHoveredMethod(null)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "11px",
              padding: "18px 8px 15px",
              borderRadius: "12px",
              cursor: "pointer",
              background: paymentMethod === id ? "#F5F1EB" : "#ffffff",
              border: `1.5px solid ${
                paymentMethod === id
                  ? "#1A1A18"
                  : hoveredMethod === id
                  ? "#D4D4DC"
                  : "#E8E4DC"
              }`,
              boxShadow: hoveredMethod === id && paymentMethod !== id
                ? "0 4px 14px rgba(20,20,40,.08)"
                : "none",
              transition: "all .16s ease",
              fontFamily: "inherit",
            }}
          >
            <div style={{ height: "26px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Logo />
            </div>
            <span
              className={paymentMethod === id ? "text-pa-dark" : undefined}
              style={{
                fontSize: "12.5px",
                fontWeight: paymentMethod === id ? 600 : 500,
                color: paymentMethod === id ? undefined : "#45433d",
                textAlign: "center",
              }}
            >
              {id === "card" ? t('payment.methodCard') : label}
            </span>
          </button>
        ))}
      </div>
      )}

      {/* Cartão: sempre montado (escondido com PayPal/Klarna) — o que o
          hóspede escreveu sobrevive a edições, à troca de plano e de método. */}
      <div ref={cardRef} tabIndex={-1} className="outline-none" style={cardVisible ? undefined : { display: "none" }}>
        {demo ? (
          <DemoCardForm
            visible={cardVisible}
            plan={props.plan}
            total={props.total}
            payLaterCaption={props.payLaterCaption}
            enabled={gate.enabled}
            consent={props.consent}
            error={cardError}
            noticeProps={noticeProps}
            onPay={() => demoPay(setCardError)}
          />
        ) : (
          <Elements stripe={stripePromise} options={elementsOptions}>
            <PaymentFormInner
              {...props}
              visible={cardVisible}
              error={cardError}
              setError={setCardError}
              noticeProps={noticeProps}
            />
          </Elements>
        )}
      </div>

      {paymentMethod === "paypal" && !twoParts && (
        <div className="space-y-3">
          {paypalError && <PaymentErrorNotice error={paypalError} {...noticeProps} />}
          {props.consent}
          <PayPalCheckoutButton
            {...redirectCommon}
            onError={onRedirectMethodError("paypal")}
            onDemo={() => demoPay(setPaypalError)}
          />
          {props.onCancel && (
            <button type="button" onClick={props.onCancel} className="btn-ghost w-full">
              {t('payment.cancelButton')}
            </button>
          )}
        </div>
      )}

      {paymentMethod === "klarna" && !twoParts && klarnaOk && (
        <div className="space-y-3">
          {klarnaError && <PaymentErrorNotice error={klarnaError} {...noticeProps} />}
          {props.consent}
          <KlarnaCheckoutButton
            {...redirectCommon}
            billingCountry={klarnaCountry}
            onError={onRedirectMethodError("klarna")}
            onDemo={() => demoPay(setKlarnaError)}
          />
          {props.onCancel && (
            <button type="button" onClick={props.onCancel} className="btn-ghost w-full">
              {t('payment.cancelButton')}
            </button>
          )}
        </div>
      )}

      {demo && demoNotice && (
        <p role="status" className="rounded-lg border border-pa-gold bg-pa-warm p-3 body-sm text-pa-dark">{t("conversion.demoNotice")}</p>
      )}
    </div>
  );
}
