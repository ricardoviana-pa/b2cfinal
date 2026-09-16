import { loadStripe as loadStripeOnDemand } from "@stripe/stripe-js/pure";
import { isLiveSiteHostname } from "@shared/deployment";

/** No eager Stripe script injection when a preview imports checkout components. */
export function loadStripe(...args: Parameters<typeof loadStripeOnDemand>): ReturnType<typeof loadStripeOnDemand> {
  if (typeof window === "undefined" || !isLiveSiteHostname(window.location.hostname)) {
    return Promise.resolve(null);
  }
  return loadStripeOnDemand(...args);
}
