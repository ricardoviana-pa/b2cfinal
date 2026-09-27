import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { COOKIE_CHOICE_EVENT } from "@/lib/measurementConsent";
import { landedOnCheckoutWithNewTouch, visitOriginPayload } from "@/lib/visitOrigin";

/**
 * Mantém a origem da visita do intent em dia a partir da página de checkout:
 * - a página abriu diretamente no checkout com UTM (email de recuperação do
 *   carrinho): a visita nova passa a ser a última;
 * - o consentimento foi dado ou retirado já no checkout: a origem entra ou sai.
 * Fire-and-forget: uma falha nunca aparece ao hóspede.
 */
export function useVisitOriginSync(intentId: string | undefined, ready: boolean, paid: boolean): void {
  const setOrigin = trpc.checkout.setOrigin.useMutation();
  const mutateRef = useRef(setOrigin.mutate);
  mutateRef.current = setOrigin.mutate;
  const sentLandingRef = useRef(false);

  useEffect(() => {
    if (!intentId || !ready || paid) return;
    const send = () => mutateRef.current({ intentId, origin: visitOriginPayload() });
    if (!sentLandingRef.current && landedOnCheckoutWithNewTouch(intentId)) {
      sentLandingRef.current = true;
      send();
    }
    window.addEventListener(COOKIE_CHOICE_EVENT, send);
    return () => window.removeEventListener(COOKIE_CHOICE_EVENT, send);
  }, [intentId, ready, paid]);
}
