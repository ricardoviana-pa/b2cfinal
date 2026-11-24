import { useEffect, useState } from 'react';

// Public campaign only. Lisbon is on UTC throughout this November window.
// This controls the announcement, never the application of a checkout coupon.
export const BLACK_FRIDAY_HERO_CODE = 'PABF15GERAL26';
export const BLACK_FRIDAY_HERO_START = Date.parse('2026-11-24T00:00:00Z');
export const BLACK_FRIDAY_HERO_END = Date.parse('2026-12-01T00:00:00Z');

export function isBlackFridayHeroActive(now: number = Date.now()): boolean {
  return now >= BLACK_FRIDAY_HERO_START && now < BLACK_FRIDAY_HERO_END;
}

export function useBlackFriday2026(): boolean {
  // Identical server/first client render, including cached HTML. Check the
  // clock after hydration so an old document cannot keep the campaign live.
  const [active, setActive] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      const now = Date.now();
      setActive(isBlackFridayHeroActive(now));
      const nextBoundary = now < BLACK_FRIDAY_HERO_START
        ? BLACK_FRIDAY_HERO_START
        : BLACK_FRIDAY_HERO_END;
      if (now < nextBoundary) {
        timer = setTimeout(update, Math.min(nextBoundary - now, 2_147_483_647));
      }
    };

    update();
    // Browsers may suspend timers while a tab or the device is asleep.
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);

  return active;
}
