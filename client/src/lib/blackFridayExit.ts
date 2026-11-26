import {
  BLACK_FRIDAY_HERO_CODE,
  BLACK_FRIDAY_HERO_END,
  BLACK_FRIDAY_HERO_START,
} from '@/hooks/useBlackFriday2026';

/**
 * Black Friday 2026: checkout exit message (pure logic + copy).
 *
 * The offer window is the same one the homepage announcement uses
 * (24 Nov 00:00 to 30 Nov 23:59:59, Lisbon = UTC in November). The code is
 * never applied here: the guest still types or applies it (Ricardo, 24 Nov).
 */
export const BF_EXIT_CODE = BLACK_FRIDAY_HERO_CODE;
export const BF_EXIT_START = BLACK_FRIDAY_HERO_START;
export const BF_EXIT_END = BLACK_FRIDAY_HERO_END;
/** The countdown inside the message appears by itself from 29 Nov 00:00. */
export const BF_EXIT_TIMER_FROM = Date.parse('2026-11-29T00:00:00Z');

export const BF_EXIT_SESSION_KEY = 'pa_bf_exit_seen';
/** Desktop: ignore a mouse that leaves the page in the first seconds. */
export const BF_EXIT_MIN_DWELL_MS = 10_000;
/** Touch screens have no "mouse leaves": offer after this long without interaction. */
export const BF_EXIT_IDLE_MS = 45_000;

export function isBfExitActive(now: number = Date.now()): boolean {
  return now >= BF_EXIT_START && now < BF_EXIT_END;
}

export function isBfExitTimerVisible(now: number = Date.now()): boolean {
  return now >= BF_EXIT_TIMER_FROM && now < BF_EXIT_END;
}

export interface BfTimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Time left until the offer ends, or null outside the timer window. */
export function bfTimeLeft(now: number = Date.now()): BfTimeLeft | null {
  if (!isBfExitTimerVisible(now)) return null;
  const total = Math.max(0, Math.floor((BF_EXIT_END - now) / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3_600),
    minutes: Math.floor((total % 3_600) / 60),
    seconds: total % 60,
  };
}

/** "1d 04:12:30" (the days part is omitted on the last day). */
export function formatBfTimeLeft(left: BfTimeLeft): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = `${pad(left.hours)}:${pad(left.minutes)}:${pad(left.seconds)}`;
  return left.days > 0 ? `${left.days}d ${clock}` : clock;
}

export interface BfExitCopy {
  title: string;
  /** Guest has not applied the code yet. {code} is replaced. */
  body: string;
  /** The 15% is already on the quote. */
  bodyApplied: string;
  /** Primary button when the code is not applied yet. */
  ctaUseCode: string;
  /** Primary button when the code is already applied. */
  ctaContinue: string;
  later: string;
  timeLeft: string;
}

const COPY: Record<string, BfExitCopy> = {
  en: {
    title: 'Before you go: your Black Friday offer ends soon',
    body: '15% off with code {code} until November 30. After that the offer is gone, and availability for your dates can change.',
    bodyApplied: 'Your 15% is applied. Finish your booking before November 30 to keep it.',
    ctaUseCode: 'Use my code',
    ctaContinue: 'Continue my booking',
    later: 'Not now',
    timeLeft: 'Time left',
  },
  pt: {
    title: 'Antes de sair: a sua oferta de Black Friday termina em breve',
    body: '15% de desconto com o código {code} até 30 de novembro. Depois disso a oferta termina e a disponibilidade para as suas datas pode mudar.',
    bodyApplied: 'Os seus 15% já estão aplicados. Conclua a reserva antes de 30 de novembro para os manter.',
    ctaUseCode: 'Usar o meu código',
    ctaContinue: 'Continuar a minha reserva',
    later: 'Agora não',
    timeLeft: 'Tempo restante',
  },
  es: {
    title: 'Antes de irte: tu oferta de Black Friday termina pronto',
    body: '15% de descuento con el código {code} hasta el 30 de noviembre. Después la oferta termina y la disponibilidad para tus fechas puede cambiar.',
    bodyApplied: 'Tu 15% ya está aplicado. Completa tu reserva antes del 30 de noviembre para mantenerlo.',
    ctaUseCode: 'Usar mi código',
    ctaContinue: 'Continuar mi reserva',
    later: 'Ahora no',
    timeLeft: 'Tiempo restante',
  },
  fr: {
    title: 'Avant de partir : votre offre Black Friday se termine bientôt',
    body: "15 % de réduction avec le code {code} jusqu'au 30 novembre. Ensuite l'offre disparaît et la disponibilité de vos dates peut changer.",
    bodyApplied: "Vos 15 % sont appliqués. Terminez votre réservation avant le 30 novembre pour les conserver.",
    ctaUseCode: 'Utiliser mon code',
    ctaContinue: 'Poursuivre ma réservation',
    later: 'Pas maintenant',
    timeLeft: 'Temps restant',
  },
  de: {
    title: 'Bevor Sie gehen: Ihr Black-Friday-Angebot endet bald',
    body: '15 % Rabatt mit dem Code {code} bis zum 30. November. Danach endet das Angebot, und die Verfügbarkeit für Ihre Daten kann sich ändern.',
    bodyApplied: 'Ihre 15 % sind angewendet. Schließen Sie Ihre Buchung vor dem 30. November ab, um sie zu behalten.',
    ctaUseCode: 'Meinen Code verwenden',
    ctaContinue: 'Buchung fortsetzen',
    later: 'Jetzt nicht',
    timeLeft: 'Verbleibende Zeit',
  },
  it: {
    title: 'Prima di andare: la tua offerta Black Friday sta per finire',
    body: "15% di sconto con il codice {code} fino al 30 novembre. Dopo, l'offerta termina e la disponibilità per le tue date può cambiare.",
    bodyApplied: 'Il tuo 15% è applicato. Completa la prenotazione prima del 30 novembre per mantenerlo.',
    ctaUseCode: 'Usa il mio codice',
    ctaContinue: 'Continua la mia prenotazione',
    later: 'Non ora',
    timeLeft: 'Tempo rimasto',
  },
  nl: {
    title: 'Voordat u gaat: uw Black Friday-aanbieding loopt bijna af',
    body: '15% korting met code {code} tot en met 30 november. Daarna vervalt de aanbieding en kan de beschikbaarheid voor uw data veranderen.',
    bodyApplied: 'Uw 15% is toegepast. Rond uw boeking vóór 30 november af om de korting te behouden.',
    ctaUseCode: 'Mijn code gebruiken',
    ctaContinue: 'Mijn boeking voortzetten',
    later: 'Niet nu',
    timeLeft: 'Resterende tijd',
  },
  sv: {
    title: 'Innan du går: ditt Black Friday-erbjudande tar snart slut',
    body: '15 % rabatt med koden {code} till och med 30 november. Därefter upphör erbjudandet och tillgängligheten för dina datum kan ändras.',
    bodyApplied: 'Dina 15 % är tillagda. Slutför din bokning före den 30 november för att behålla rabatten.',
    ctaUseCode: 'Använd min kod',
    ctaContinue: 'Fortsätt min bokning',
    later: 'Inte nu',
    timeLeft: 'Tid kvar',
  },
  fi: {
    title: 'Ennen kuin lähdet: Black Friday -tarjouksesi päättyy pian',
    body: '15 % alennus koodilla {code} 30. marraskuuta asti. Sen jälkeen tarjous päättyy, ja valitsemiesi päivien saatavuus voi muuttua.',
    bodyApplied: 'Alennuksesi 15 % on käytössä. Viimeistele varaus ennen 30. marraskuuta säilyttääksesi sen.',
    ctaUseCode: 'Käytä koodiani',
    ctaContinue: 'Jatka varaustani',
    later: 'Ei nyt',
    timeLeft: 'Aikaa jäljellä',
  },
};

export function bfExitCopy(language: string | undefined): BfExitCopy {
  const key = (language || 'en').slice(0, 2).toLowerCase();
  return COPY[key] ?? COPY.en;
}

export const BF_EXIT_LANGUAGES = Object.keys(COPY);
