import { useSyncExternalStore } from 'react';
import { COOKIE_CHOICE_EVENT, hasMeasurementConsent } from '@/lib/measurementConsent';

function subscribe(onChange: () => void) {
  window.addEventListener(COOKIE_CHOICE_EVENT, onChange);
  return () => window.removeEventListener(COOKIE_CHOICE_EVENT, onChange);
}

/** Re-evaluate currently visible content after consent, without replaying history. */
export function useMeasurementConsent(): boolean {
  return useSyncExternalStore(subscribe, hasMeasurementConsent, () => false);
}
