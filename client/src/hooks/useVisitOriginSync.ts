import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { watchCheckoutOrigin } from "@/lib/visitOrigin";

/**
 * Mantém a origem da visita do intent em dia a partir da página de checkout
 * (regras em watchCheckoutOrigin, client/src/lib/visitOrigin.ts): ao abrir e a
 * cada escolha no banner, manda o que a escolha explícita permite. Sem escolha
 * não manda nada, para nunca apagar uma origem recolhida com consentimento
 * noutro aparelho. Fire-and-forget: uma falha nunca aparece ao hóspede.
 */
export function useVisitOriginSync(intentId: string | undefined, ready: boolean, paid: boolean): void {
  const setOrigin = trpc.checkout.setOrigin.useMutation();
  const mutateRef = useRef(setOrigin.mutate);
  mutateRef.current = setOrigin.mutate;

  useEffect(() => {
    if (!intentId || !ready || paid) return;
    return watchCheckoutOrigin(origin => mutateRef.current({ intentId, origin }));
  }, [intentId, ready, paid]);
}
