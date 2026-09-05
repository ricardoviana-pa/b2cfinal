/**
 * Bloco 5 — emails do checkout nas 9 línguas do site.
 *
 * Segue o campo `locale` do intent; qualquer língua fora das 9 cai em EN.
 * Os nomes dos extras vêm dos MESMOS ficheiros i18n do site
 * (client/src/i18n/locales/*.json, checkout.extras.<sku>.name), para o email
 * mostrar exatamente o que o hóspede viu no checkout. As restantes strings
 * são específicas dos emails e vivem aqui.
 *
 * Regras invioláveis respeitadas em TODAS as línguas:
 * - o Flex nunca se chama seguro (insurance/assurance/seguro/Versicherung…);
 * - promete-se o preço, nunca as datas;
 * - voz PT sem travessão a fazer de vírgula; hífenes dentro de palavras ficam.
 * O manifesto do CS não passa por aqui — fica só em PT.
 */
import pt from "../../client/src/i18n/locales/pt.json";
import en from "../../client/src/i18n/locales/en.json";
import fr from "../../client/src/i18n/locales/fr.json";
import es from "../../client/src/i18n/locales/es.json";
import it from "../../client/src/i18n/locales/it.json";
import de from "../../client/src/i18n/locales/de.json";
import nl from "../../client/src/i18n/locales/nl.json";
import sv from "../../client/src/i18n/locales/sv.json";
import fi from "../../client/src/i18n/locales/fi.json";

export type EmailLang = "pt" | "en" | "fr" | "es" | "it" | "de" | "nl" | "sv" | "fi";

export const EMAIL_LANGS: EmailLang[] = ["pt", "en", "fr", "es", "it", "de", "nl", "sv", "fi"];

const SITE_LOCALES: Record<EmailLang, any> = { pt, en, fr, es, it, de, nl, sv, fi };

/** BCP-47 para Intl (datas e moeda no formato local). */
export const INTL_TAG: Record<EmailLang, string> = {
  pt: "pt-PT", en: "en-GB", fr: "fr-FR", es: "es-ES", it: "it-IT",
  de: "de-DE", nl: "nl-NL", sv: "sv-SE", fi: "fi-FI",
};

/** locale do intent → língua dos emails (fallback EN, como o site). */
export function emailLang(locale?: string | null): EmailLang {
  const l = String(locale || "").toLowerCase().slice(0, 2);
  return (EMAIL_LANGS as string[]).includes(l) ? (l as EmailLang) : "en";
}

/** Nome do extra tal como o checkout o mostrou nessa língua. */
export function skuNameFor(sku: string, lang: EmailLang): string | undefined {
  return SITE_LOCALES[lang]?.checkout?.extras?.[sku]?.name
    ?? SITE_LOCALES.en?.checkout?.extras?.[sku]?.name;
}

/* ────────────────────────────────────────────────────────────────
   Strings dos emails. PT e EN são o texto que já estava em produção
   (inalterado); as outras 7 línguas seguem o mesmo tom.
   ──────────────────────────────────────────────────────────────── */

export interface RecoveryStrings {
  subject1: (house: string) => string;
  subject2: (house: string) => string;
  greetingNamed: (name: string) => string;
  greeting: string;
  headline1: string;
  headline2: string;
  body1: (greeting: string, house: string) => string;
  body2: (greeting: string, house: string) => string;
  cta: string;
  closing: string;
  nightsLabel: string;
  guestsLabel: string;
  taxesLabel: string;
  guaranteedUntil: string;
  /** conector entre dia e hora: "sábado, 12 de julho às 21:45" */
  atTime: string;
  preheader1: string;
  preheader2: string;
  whatsappLine: string;
  whatsappMsg: (house: string) => string;
  footerTagline: string;
  optout: string;
}

export interface ConfirmationStrings {
  subject: (house: string) => string;
  yourHome: string;
  headline: (house: string, inShort: string, outShort: string) => string;
  bodyNamed: (name: string) => string;
  body: string;
  personOne: string; personMany: string;
  sessionOne: string; sessionMany: string;
  dayOne: string; dayMany: string;
  nightsLabel: string;
  guestsLabel: string;
  taxesLabel: string;
  hostedArrival: string;
  hostedArrivalLate: string;
  included: string;
  confirm24h: string;
  refund24hNote: string;
  groceriesNote: string;
  flexLine: string;
  confirmationCodeLabel: string;
  selfCheckIn: string;
  conciergeRequestsTitle: string;
  conciergeRequestsBody: string;
  nextTitle: string;
  nextBody: string;
  cta: string;
  whatsappLine: string;
  bestPriceLine: string;
  regards: string;
  yourConcierge: string;
  footerTagline: string;
  preheader: string;
}

export const RECOVERY_I18N: Record<EmailLang, RecoveryStrings> = {
  pt: {
    subject1: (h) => `A sua estadia em ${h} está a um passo`,
    subject2: (h) => `O preço garantido para ${h} termina em breve`,
    greetingNamed: (n) => `Olá ${n},`,
    greeting: "Olá,",
    headline1: "O seu preço está garantido.",
    headline2: "O seu preço garantido termina em breve.",
    body1: (g, h) => `${g} guardámos tudo tal como deixou. Pode retomar a sua reserva em ${h} a qualquer momento, no mesmo dispositivo ou noutro, exatamente onde parou.`,
    body2: (g, h) => `${g} o preço garantido da sua estadia em ${h} termina dentro de algumas horas. Depois disso teremos de calcular um novo valor, e as datas continuam abertas a outros hóspedes até ao pagamento.`,
    cta: "Retomar a minha reserva",
    closing: "Se tiver alguma dúvida, basta responder a este email. A nossa equipa ajuda com todo o gosto.",
    nightsLabel: "noites", guestsLabel: "hóspedes", taxesLabel: "Taxas",
    guaranteedUntil: "Preço garantido até", atTime: "às",
    preheader1: "Guardámos tudo tal como deixou. Retome quando quiser, em qualquer dispositivo.",
    preheader2: "Depois desta hora o valor é recalculado. As datas seguem abertas a outros hóspedes.",
    whatsappLine: "Prefere WhatsApp? Fale com o seu concierge.",
    whatsappMsg: (h) => `Olá! Estava a reservar ${h} e tenho uma questão.`,
    footerTagline: "Hotéis privados em Portugal. A privacidade de uma casa, o serviço de um hotel.",
    optout: "Não quero receber estes lembretes",
  },
  en: {
    subject1: (h) => `Your stay at ${h} is one step away`,
    subject2: (h) => `Your guaranteed price for ${h} ends soon`,
    greetingNamed: (n) => `Hello ${n},`,
    greeting: "Hello,",
    headline1: "Your price is guaranteed.",
    headline2: "Your guaranteed price ends soon.",
    body1: (g, h) => `${g} we kept everything exactly as you left it. You can pick up your booking at ${h} anytime, on this device or another, right where you stopped.`,
    body2: (g, h) => `${g} your booking at ${h} is still saved, but the guaranteed price ends in a few hours. After that we will need to work out a new rate for your dates.`,
    cta: "Resume my booking",
    closing: "If you have any questions, just reply to this email. Our team is happy to help.",
    nightsLabel: "nights", guestsLabel: "guests", taxesLabel: "Taxes & fees",
    guaranteedUntil: "Price guaranteed until", atTime: "at",
    preheader1: "We saved everything just as you left it. Pick up whenever you like, on any device.",
    preheader2: "After this window the price is recalculated. The dates remain open to other guests.",
    whatsappLine: "Prefer WhatsApp? Talk to your concierge.",
    whatsappMsg: (h) => `Hello! I was booking ${h} and have a question.`,
    footerTagline: "Private hotels in Portugal. The privacy of a home, the service of a hotel.",
    optout: "I don't want to receive these reminders",
  },
  fr: {
    subject1: (h) => `Votre séjour à ${h} est à un pas`,
    subject2: (h) => `Votre prix garanti pour ${h} expire bientôt`,
    greetingNamed: (n) => `Bonjour ${n},`,
    greeting: "Bonjour,",
    headline1: "Votre prix est garanti.",
    headline2: "Votre prix garanti expire bientôt.",
    body1: (g, h) => `${g} nous avons tout conservé tel que vous l'avez laissé. Vous pouvez reprendre votre réservation à ${h} à tout moment, sur cet appareil ou un autre, exactement là où vous vous étiez arrêté.`,
    body2: (g, h) => `${g} votre réservation à ${h} est toujours enregistrée, mais le prix garanti expire dans quelques heures. Passé ce délai, nous devrons recalculer le tarif de vos dates.`,
    cta: "Reprendre ma réservation",
    closing: "Pour toute question, répondez simplement à cet email. Notre équipe se fera un plaisir de vous aider.",
    nightsLabel: "nuits", guestsLabel: "voyageurs", taxesLabel: "Taxes et frais",
    guaranteedUntil: "Prix garanti jusqu'au", atTime: "à",
    preheader1: "Nous avons tout conservé tel quel. Reprenez quand vous voulez, sur n'importe quel appareil.",
    preheader2: "Passé ce délai, le prix est recalculé. Les dates restent ouvertes aux autres voyageurs.",
    whatsappLine: "Vous préférez WhatsApp ? Parlez à votre concierge.",
    whatsappMsg: (h) => `Bonjour ! Je réservais ${h} et j'ai une question.`,
    footerTagline: "Hôtels privés au Portugal. L'intimité d'une maison, le service d'un hôtel.",
    optout: "Je ne souhaite plus recevoir ces rappels",
  },
  es: {
    subject1: (h) => `Su estancia en ${h} está a un paso`,
    subject2: (h) => `Su precio garantizado para ${h} termina pronto`,
    greetingNamed: (n) => `Hola ${n}:`,
    greeting: "Hola:",
    headline1: "Su precio está garantizado.",
    headline2: "Su precio garantizado termina pronto.",
    body1: (g, h) => `${g} lo hemos guardado todo tal como lo dejó. Puede retomar su reserva en ${h} cuando quiera, en este dispositivo o en otro, justo donde lo dejó.`,
    body2: (g, h) => `${g} su reserva en ${h} sigue guardada, pero el precio garantizado termina en unas horas. Después tendremos que calcular una nueva tarifa para sus fechas.`,
    cta: "Retomar mi reserva",
    closing: "Si tiene alguna duda, basta con responder a este email. Nuestro equipo le ayudará encantado.",
    nightsLabel: "noches", guestsLabel: "huéspedes", taxesLabel: "Tasas y cargos",
    guaranteedUntil: "Precio garantizado hasta", atTime: "a las",
    preheader1: "Lo guardamos todo tal como lo dejó. Retómelo cuando quiera, en cualquier dispositivo.",
    preheader2: "Pasado este plazo, el precio se recalcula. Las fechas siguen abiertas a otros huéspedes.",
    whatsappLine: "¿Prefiere WhatsApp? Hable con su concierge.",
    whatsappMsg: (h) => `¡Hola! Estaba reservando ${h} y tengo una pregunta.`,
    footerTagline: "Hoteles privados en Portugal. La privacidad de una casa, el servicio de un hotel.",
    optout: "No quiero recibir estos recordatorios",
  },
  it: {
    subject1: (h) => `Il suo soggiorno a ${h} è a un passo`,
    subject2: (h) => `Il suo prezzo garantito per ${h} scade a breve`,
    greetingNamed: (n) => `Buongiorno ${n},`,
    greeting: "Buongiorno,",
    headline1: "Il suo prezzo è garantito.",
    headline2: "Il suo prezzo garantito scade a breve.",
    body1: (g, h) => `${g} abbiamo conservato tutto esattamente come l'ha lasciato. Può riprendere la sua prenotazione a ${h} in qualsiasi momento, su questo dispositivo o su un altro, proprio da dove si era fermato.`,
    body2: (g, h) => `${g} la sua prenotazione a ${h} è ancora salvata, ma il prezzo garantito scade tra poche ore. Dopo dovremo ricalcolare la tariffa per le sue date.`,
    cta: "Riprendere la mia prenotazione",
    closing: "Per qualsiasi domanda, basta rispondere a questa email. Il nostro team sarà felice di aiutarla.",
    nightsLabel: "notti", guestsLabel: "ospiti", taxesLabel: "Tasse e costi",
    guaranteedUntil: "Prezzo garantito fino a", atTime: "alle",
    preheader1: "Abbiamo conservato tutto così com'era. Riprenda quando vuole, da qualsiasi dispositivo.",
    preheader2: "Oltre questo termine il prezzo viene ricalcolato. Le date restano aperte ad altri ospiti.",
    whatsappLine: "Preferisce WhatsApp? Parli con il suo concierge.",
    whatsappMsg: (h) => `Buongiorno! Stavo prenotando ${h} e ho una domanda.`,
    footerTagline: "Hotel privati in Portogallo. La privacy di una casa, il servizio di un hotel.",
    optout: "Non voglio ricevere questi promemoria",
  },
  de: {
    subject1: (h) => `Ihr Aufenthalt in ${h} ist nur einen Schritt entfernt`,
    subject2: (h) => `Ihr garantierter Preis für ${h} läuft bald ab`,
    greetingNamed: (n) => `Hallo ${n},`,
    greeting: "Hallo,",
    headline1: "Ihr Preis ist garantiert.",
    headline2: "Ihr garantierter Preis läuft bald ab.",
    body1: (g, h) => `${g} wir haben alles genau so aufbewahrt, wie Sie es hinterlassen haben. Sie können Ihre Buchung in ${h} jederzeit fortsetzen, auf diesem oder einem anderen Gerät, genau dort, wo Sie aufgehört haben.`,
    body2: (g, h) => `${g} Ihre Buchung in ${h} ist weiterhin gespeichert, aber der garantierte Preis läuft in wenigen Stunden ab. Danach müssen wir den Preis für Ihre Daten neu berechnen.`,
    cta: "Meine Buchung fortsetzen",
    closing: "Bei Fragen antworten Sie einfach auf diese E-Mail. Unser Team hilft Ihnen gerne weiter.",
    nightsLabel: "Nächte", guestsLabel: "Gäste", taxesLabel: "Steuern und Gebühren",
    guaranteedUntil: "Preis garantiert bis", atTime: "um",
    preheader1: "Wir haben alles so aufbewahrt, wie Sie es hinterlassen haben. Setzen Sie jederzeit fort, auf jedem Gerät.",
    preheader2: "Nach Ablauf wird der Preis neu berechnet. Die Daten bleiben für andere Gäste offen.",
    whatsappLine: "Lieber WhatsApp? Sprechen Sie mit Ihrem Concierge.",
    whatsappMsg: (h) => `Hallo! Ich war dabei, ${h} zu buchen, und habe eine Frage.`,
    footerTagline: "Private Hotels in Portugal. Die Privatsphäre eines Hauses, der Service eines Hotels.",
    optout: "Ich möchte diese Erinnerungen nicht mehr erhalten",
  },
  nl: {
    subject1: (h) => `Uw verblijf in ${h} is één stap verwijderd`,
    subject2: (h) => `Uw gegarandeerde prijs voor ${h} verloopt binnenkort`,
    greetingNamed: (n) => `Hallo ${n},`,
    greeting: "Hallo,",
    headline1: "Uw prijs is gegarandeerd.",
    headline2: "Uw gegarandeerde prijs verloopt binnenkort.",
    body1: (g, h) => `${g} we hebben alles bewaard precies zoals u het achterliet. U kunt uw boeking bij ${h} op elk moment hervatten, op dit apparaat of een ander, precies waar u was gebleven.`,
    body2: (g, h) => `${g} uw boeking bij ${h} is nog steeds bewaard, maar de gegarandeerde prijs verloopt over enkele uren. Daarna moeten we een nieuw tarief voor uw data berekenen.`,
    cta: "Mijn boeking hervatten",
    closing: "Heeft u vragen? Beantwoord dan gewoon deze e-mail. Ons team helpt u graag.",
    nightsLabel: "nachten", guestsLabel: "gasten", taxesLabel: "Belastingen en kosten",
    guaranteedUntil: "Prijs gegarandeerd tot", atTime: "om",
    preheader1: "We hebben alles bewaard zoals u het achterliet. Hervat wanneer u wilt, op elk apparaat.",
    preheader2: "Daarna wordt de prijs opnieuw berekend. De data blijven open voor andere gasten.",
    whatsappLine: "Liever WhatsApp? Praat met uw concierge.",
    whatsappMsg: (h) => `Hallo! Ik was ${h} aan het boeken en heb een vraag.`,
    footerTagline: "Privéhotels in Portugal. De privacy van een huis, de service van een hotel.",
    optout: "Ik wil deze herinneringen niet meer ontvangen",
  },
  sv: {
    subject1: (h) => `Din vistelse på ${h} är ett steg bort`,
    subject2: (h) => `Ditt garanterade pris för ${h} går snart ut`,
    greetingNamed: (n) => `Hej ${n},`,
    greeting: "Hej,",
    headline1: "Ditt pris är garanterat.",
    headline2: "Ditt garanterade pris går snart ut.",
    body1: (g, h) => `${g} vi har sparat allt precis som du lämnade det. Du kan återuppta din bokning på ${h} när som helst, på den här enheten eller en annan, precis där du slutade.`,
    body2: (g, h) => `${g} din bokning på ${h} är fortfarande sparad, men det garanterade priset går ut om några timmar. Därefter behöver vi räkna fram ett nytt pris för dina datum.`,
    cta: "Återuppta min bokning",
    closing: "Om du har frågor är det bara att svara på det här mejlet. Vårt team hjälper dig gärna.",
    nightsLabel: "nätter", guestsLabel: "gäster", taxesLabel: "Skatter och avgifter",
    guaranteedUntil: "Priset garanteras till", atTime: "kl.",
    preheader1: "Vi har sparat allt precis som du lämnade det. Återuppta när du vill, på valfri enhet.",
    preheader2: "Därefter räknas priset om. Datumen är fortsatt öppna för andra gäster.",
    whatsappLine: "Föredrar du WhatsApp? Prata med din concierge.",
    whatsappMsg: (h) => `Hej! Jag höll på att boka ${h} och har en fråga.`,
    footerTagline: "Privata hotell i Portugal. Ett hems avskildhet, ett hotells service.",
    optout: "Jag vill inte få de här påminnelserna",
  },
  fi: {
    subject1: (h) => `Majoituksesi kohteessa ${h} on askeleen päässä`,
    subject2: (h) => `Taattu hintasi kohteeseen ${h} päättyy pian`,
    greetingNamed: (n) => `Hei ${n},`,
    greeting: "Hei,",
    headline1: "Hintasi on taattu.",
    headline2: "Taattu hintasi päättyy pian.",
    body1: (g, h) => `${g} säilytimme kaiken juuri niin kuin sen jätit. Voit jatkaa varaustasi kohteessa ${h} milloin tahansa, tällä tai toisella laitteella, juuri siitä mihin jäit.`,
    body2: (g, h) => `${g} varauksesi kohteessa ${h} on yhä tallessa, mutta taattu hinta päättyy muutaman tunnin kuluttua. Sen jälkeen joudumme laskemaan päivillesi uuden hinnan.`,
    cta: "Jatka varaustani",
    closing: "Jos sinulla on kysyttävää, vastaa tähän sähköpostiin. Tiimimme auttaa mielellään.",
    nightsLabel: "yötä", guestsLabel: "vierasta", taxesLabel: "Verot ja maksut",
    guaranteedUntil: "Hinta taattu", atTime: "klo",
    preheader1: "Säilytimme kaiken juuri niin kuin sen jätit. Jatka milloin haluat, millä tahansa laitteella.",
    preheader2: "Tämän jälkeen hinta lasketaan uudelleen. Päivät pysyvät avoinna muille vieraille.",
    whatsappLine: "Käytätkö mieluummin WhatsAppia? Keskustele conciergesi kanssa.",
    whatsappMsg: (h) => `Hei! Olin varaamassa kohdetta ${h} ja minulla on kysymys.`,
    footerTagline: "Yksityishotelleja Portugalissa. Kodin yksityisyys, hotellin palvelu.",
    optout: "En halua näitä muistutuksia",
  },
};

export const CONFIRMATION_I18N: Record<EmailLang, ConfirmationStrings> = {
  pt: {
    subject: (h) => `A sua estadia na ${h} está confirmada`,
    yourHome: "a sua casa",
    headline: (h, i, o) => `Está confirmada. A ${h} é sua de ${i} a ${o}.`,
    bodyNamed: (n) => `Olá ${n}. A casa começa hoje a preparar-se para a sua chegada, e o seu concierge acompanha-o a partir deste momento — um desejo, uma mensagem, está tratado. O código abaixo é a sua referência para tudo.`,
    body: "Boas-vindas à Portugal Active. A nossa equipa já está a preparar a casa para a sua chegada e o seu concierge acompanha tudo a partir de agora. Guarde o código abaixo, é a sua referência para qualquer pedido.",
    personOne: "pessoa", personMany: "pessoas",
    sessionOne: "sessão", sessionMany: "sessões",
    dayOne: "dia", dayMany: "dias",
    nightsLabel: "noites", guestsLabel: "hóspedes", taxesLabel: "Taxas",
    hostedArrival: "Receção presencial", hostedArrivalLate: "Receção presencial após as 21h",
    included: "Incluído",
    confirm24h: "confirmação em 2 horas",
    refund24hNote: "Se não conseguirmos garantir um serviço com confirmação em 24 horas, devolvemos essa linha automaticamente.",
    groceriesNote: "Compras: a conta do supermercado é apresentada à parte, ao custo.",
    flexLine: "Flex, remarcação garantida",
    confirmationCodeLabel: "Código de confirmação",
    selfCheckIn: "Self check-in, incluído na estadia",
    conciergeRequestsTitle: "Pedidos ao concierge",
    conciergeRequestsBody: "O seu concierge envia-lhe um orçamento personalizado nas próximas 24 horas. Estes pedidos só são confirmados depois da sua aprovação.",
    nextTitle: "Próximos passos",
    nextBody: "Na véspera da chegada recebe por email as instruções de check-in, com todos os detalhes de acesso à casa. Até lá, o seu concierge está disponível para qualquer pedido, de reservas de restaurante a transferes.",
    cta: "Ver a minha reserva",
    whatsappLine: "Falar com o seu concierge no WhatsApp",
    bestPriceLine: "Reservou diretamente com a Portugal Active, com o melhor preço garantido.",
    regards: "Com os melhores cumprimentos,",
    yourConcierge: "a sua concierge",
    footerTagline: "Hotéis privados em Portugal. A privacidade de uma casa, o serviço de um hotel.",
    preheader: "A casa já está a ser preparada. O seu concierge acompanha tudo a partir de agora.",
  },
  en: {
    subject: (h) => `Your stay at ${h} is confirmed`,
    yourHome: "your home",
    headline: (h, i, o) => `It's confirmed. ${h} is yours from ${i} to ${o}.`,
    bodyNamed: (n) => `Hello ${n}. The house begins preparing for your arrival today, and your concierge is by your side from this moment on — one wish, one message, done. The code below is your reference for everything.`,
    body: "Welcome to Portugal Active. Our team is already preparing the house for your arrival and your concierge is with you from here on. Keep the code below, it is your reference for any request.",
    personOne: "person", personMany: "people",
    sessionOne: "session", sessionMany: "sessions",
    dayOne: "day", dayMany: "days",
    nightsLabel: "nights", guestsLabel: "guests", taxesLabel: "Taxes & fees",
    hostedArrival: "Hosted arrival", hostedArrivalLate: "Hosted arrival after 9pm",
    included: "Included",
    confirm24h: "confirmed within 2 hours",
    refund24hNote: "If we cannot secure a service marked for 24-hour confirmation, that line is refunded automatically.",
    groceriesNote: "Groceries: the supermarket bill is presented separately, at cost.",
    flexLine: "Flex, guaranteed rebooking",
    confirmationCodeLabel: "Confirmation code",
    selfCheckIn: "Self check-in, included in your stay",
    conciergeRequestsTitle: "Concierge requests",
    conciergeRequestsBody: "Your concierge will send you a tailored quote within the next 24 hours. These requests are only confirmed after your approval.",
    nextTitle: "What happens next",
    nextBody: "The day before arrival you will receive your check-in instructions by email, with every detail you need to reach the house. Until then, your concierge is available for any request, from restaurant reservations to transfers.",
    cta: "View my booking",
    whatsappLine: "Chat with your concierge on WhatsApp",
    bestPriceLine: "You booked directly with Portugal Active, with our best price guaranteed.",
    regards: "Warm regards,",
    yourConcierge: "your concierge",
    footerTagline: "Private hotels in Portugal. The privacy of a home, the service of a hotel.",
    preheader: "The house is already being prepared. Your concierge takes it from here.",
  },
  fr: {
    subject: (h) => `Votre séjour à ${h} est confirmé`,
    yourHome: "votre maison",
    headline: (h, i, o) => `C'est confirmé. ${h} est à vous du ${i} au ${o}.`,
    bodyNamed: (n) => `Bonjour ${n}. La maison commence dès aujourd'hui à se préparer pour votre arrivée, et votre concierge vous accompagne à partir de cet instant — une envie, un message, c'est réglé. Le code ci-dessous est votre référence pour tout.`,
    body: "Bienvenue chez Portugal Active. Notre équipe prépare déjà la maison pour votre arrivée et votre concierge vous accompagne à partir de maintenant. Conservez le code ci-dessous, c'est votre référence pour toute demande.",
    personOne: "personne", personMany: "personnes",
    sessionOne: "séance", sessionMany: "séances",
    dayOne: "jour", dayMany: "jours",
    nightsLabel: "nuits", guestsLabel: "voyageurs", taxesLabel: "Taxes et frais",
    hostedArrival: "Accueil en personne", hostedArrivalLate: "Accueil en personne après 21h",
    included: "Inclus",
    confirm24h: "confirmation sous 2 heures",
    refund24hNote: "Si nous ne pouvons pas garantir un service à confirmer sous 24 heures, cette ligne est remboursée automatiquement.",
    groceriesNote: "Courses : la note du supermarché est présentée à part, au prix coûtant.",
    flexLine: "Flex, nouvelle date garantie",
    confirmationCodeLabel: "Code de confirmation",
    selfCheckIn: "Self check-in, inclus dans votre séjour",
    conciergeRequestsTitle: "Demandes au concierge",
    conciergeRequestsBody: "Votre concierge vous enverra un devis personnalisé dans les prochaines 24 heures. Ces demandes ne sont confirmées qu'après votre accord.",
    nextTitle: "Et maintenant",
    nextBody: "La veille de votre arrivée, vous recevrez par email les instructions de check-in, avec tous les détails d'accès à la maison. D'ici là, votre concierge est disponible pour toute demande, des réservations de restaurant aux transferts.",
    cta: "Voir ma réservation",
    whatsappLine: "Échanger avec votre concierge sur WhatsApp",
    bestPriceLine: "Vous avez réservé directement auprès de Portugal Active, au meilleur prix garanti.",
    regards: "Bien cordialement,",
    yourConcierge: "votre concierge",
    footerTagline: "Hôtels privés au Portugal. L'intimité d'une maison, le service d'un hôtel.",
    preheader: "La maison est déjà en préparation. Votre concierge s'occupe de tout à partir de maintenant.",
  },
  es: {
    subject: (h) => `Su estancia en ${h} está confirmada`,
    yourHome: "su casa",
    headline: (h, i, o) => `Está confirmada. ${h} es suya del ${i} al ${o}.`,
    bodyNamed: (n) => `Hola ${n}. La casa empieza hoy a prepararse para su llegada, y su concierge le acompaña desde este momento — un deseo, un mensaje, y está resuelto. El código de abajo es su referencia para todo.`,
    body: "Bienvenido a Portugal Active. Nuestro equipo ya está preparando la casa para su llegada y su concierge le acompaña a partir de ahora. Guarde el código de abajo, es su referencia para cualquier petición.",
    personOne: "persona", personMany: "personas",
    sessionOne: "sesión", sessionMany: "sesiones",
    dayOne: "día", dayMany: "días",
    nightsLabel: "noches", guestsLabel: "huéspedes", taxesLabel: "Tasas y cargos",
    hostedArrival: "Recepción presencial", hostedArrivalLate: "Recepción presencial después de las 21h",
    included: "Incluido",
    confirm24h: "confirmación en 2 horas",
    refund24hNote: "Si no podemos garantizar un servicio con confirmación en 24 horas, esa línea se reembolsa automáticamente.",
    groceriesNote: "Compras: la cuenta del supermercado se presenta aparte, a precio de coste.",
    flexLine: "Flex, cambio de fechas garantizado",
    confirmationCodeLabel: "Código de confirmación",
    selfCheckIn: "Self check-in, incluido en su estancia",
    conciergeRequestsTitle: "Peticiones al concierge",
    conciergeRequestsBody: "Su concierge le enviará un presupuesto personalizado en las próximas 24 horas. Estas peticiones solo se confirman tras su aprobación.",
    nextTitle: "Próximos pasos",
    nextBody: "La víspera de su llegada recibirá por email las instrucciones de check-in, con todos los detalles de acceso a la casa. Hasta entonces, su concierge está disponible para cualquier petición, desde reservas de restaurante hasta traslados.",
    cta: "Ver mi reserva",
    whatsappLine: "Hablar con su concierge por WhatsApp",
    bestPriceLine: "Ha reservado directamente con Portugal Active, con el mejor precio garantizado.",
    regards: "Un cordial saludo,",
    yourConcierge: "su concierge",
    footerTagline: "Hoteles privados en Portugal. La privacidad de una casa, el servicio de un hotel.",
    preheader: "La casa ya se está preparando. Su concierge se encarga de todo a partir de ahora.",
  },
  it: {
    subject: (h) => `Il suo soggiorno a ${h} è confermato`,
    yourHome: "la sua casa",
    headline: (h, i, o) => `È confermato. ${h} è sua dal ${i} al ${o}.`,
    bodyNamed: (n) => `Buongiorno ${n}. La casa inizia oggi a prepararsi per il suo arrivo, e il suo concierge la accompagna da questo momento — un desiderio, un messaggio, ed è fatto. Il codice qui sotto è il suo riferimento per tutto.`,
    body: "Benvenuto in Portugal Active. Il nostro team sta già preparando la casa per il suo arrivo e il suo concierge la accompagna da questo momento. Conservi il codice qui sotto, è il suo riferimento per qualsiasi richiesta.",
    personOne: "persona", personMany: "persone",
    sessionOne: "sessione", sessionMany: "sessioni",
    dayOne: "giorno", dayMany: "giorni",
    nightsLabel: "notti", guestsLabel: "ospiti", taxesLabel: "Tasse e costi",
    hostedArrival: "Accoglienza di persona", hostedArrivalLate: "Accoglienza di persona dopo le 21",
    included: "Incluso",
    confirm24h: "conferma entro 2 ore",
    refund24hNote: "Se non riusciamo a garantire un servizio con conferma entro 24 ore, quella voce viene rimborsata automaticamente.",
    groceriesNote: "Spesa: il conto del supermercato viene presentato a parte, al costo.",
    flexLine: "Flex, nuova data garantita",
    confirmationCodeLabel: "Codice di conferma",
    selfCheckIn: "Self check-in, incluso nel soggiorno",
    conciergeRequestsTitle: "Richieste al concierge",
    conciergeRequestsBody: "Il suo concierge le invierà un preventivo su misura entro le prossime 24 ore. Queste richieste vengono confermate solo dopo la sua approvazione.",
    nextTitle: "I prossimi passi",
    nextBody: "Il giorno prima dell'arrivo riceverà via email le istruzioni per il check-in, con tutti i dettagli per raggiungere la casa. Fino ad allora, il suo concierge è disponibile per qualsiasi richiesta, dalle prenotazioni al ristorante ai transfer.",
    cta: "Vedere la mia prenotazione",
    whatsappLine: "Parlare con il suo concierge su WhatsApp",
    bestPriceLine: "Ha prenotato direttamente con Portugal Active, con il miglior prezzo garantito.",
    regards: "Cordiali saluti,",
    yourConcierge: "la sua concierge",
    footerTagline: "Hotel privati in Portogallo. La privacy di una casa, il servizio di un hotel.",
    preheader: "La casa è già in preparazione. Il suo concierge si occupa di tutto da questo momento.",
  },
  de: {
    subject: (h) => `Ihr Aufenthalt in ${h} ist bestätigt`,
    yourHome: "Ihr Zuhause",
    headline: (h, i, o) => `Es ist bestätigt. ${h} gehört Ihnen vom ${i} bis ${o}.`,
    bodyNamed: (n) => `Hallo ${n}. Das Haus beginnt heute, sich auf Ihre Ankunft vorzubereiten, und Ihr Concierge ist von diesem Moment an an Ihrer Seite — ein Wunsch, eine Nachricht, erledigt. Der Code unten ist Ihre Referenz für alles.`,
    body: "Willkommen bei Portugal Active. Unser Team bereitet das Haus bereits für Ihre Ankunft vor und Ihr Concierge begleitet Sie ab jetzt. Bewahren Sie den Code unten auf, er ist Ihre Referenz für jedes Anliegen.",
    personOne: "Person", personMany: "Personen",
    sessionOne: "Einheit", sessionMany: "Einheiten",
    dayOne: "Tag", dayMany: "Tage",
    nightsLabel: "Nächte", guestsLabel: "Gäste", taxesLabel: "Steuern und Gebühren",
    hostedArrival: "Persönlicher Empfang", hostedArrivalLate: "Persönlicher Empfang nach 21 Uhr",
    included: "Inklusive",
    confirm24h: "Bestätigung innerhalb von 2 Stunden",
    refund24hNote: "Können wir eine Leistung mit 24-Stunden-Bestätigung nicht sichern, wird diese Position automatisch erstattet.",
    groceriesNote: "Einkäufe: die Supermarktrechnung wird separat ausgewiesen, zum Selbstkostenpreis.",
    flexLine: "Flex, garantierte Umbuchung",
    confirmationCodeLabel: "Bestätigungscode",
    selfCheckIn: "Self Check-in, im Aufenthalt inbegriffen",
    conciergeRequestsTitle: "Concierge-Anfragen",
    conciergeRequestsBody: "Ihr Concierge sendet Ihnen innerhalb der nächsten 24 Stunden ein maßgeschneidertes Angebot. Diese Anfragen werden erst nach Ihrer Zustimmung bestätigt.",
    nextTitle: "So geht es weiter",
    nextBody: "Am Tag vor der Anreise erhalten Sie Ihre Check-in-Anweisungen per E-Mail, mit allen Details für den Zugang zum Haus. Bis dahin steht Ihr Concierge für jedes Anliegen bereit, von Restaurantreservierungen bis zu Transfers.",
    cta: "Meine Buchung ansehen",
    whatsappLine: "Mit Ihrem Concierge über WhatsApp sprechen",
    bestPriceLine: "Sie haben direkt bei Portugal Active gebucht, mit garantiert bestem Preis.",
    regards: "Herzliche Grüße,",
    yourConcierge: "Ihre Concierge",
    footerTagline: "Private Hotels in Portugal. Die Privatsphäre eines Hauses, der Service eines Hotels.",
    preheader: "Das Haus wird bereits vorbereitet. Ihr Concierge kümmert sich ab jetzt um alles.",
  },
  nl: {
    subject: (h) => `Uw verblijf in ${h} is bevestigd`,
    yourHome: "uw huis",
    headline: (h, i, o) => `Het is bevestigd. ${h} is van u van ${i} tot ${o}.`,
    bodyNamed: (n) => `Hallo ${n}. Het huis begint vandaag met de voorbereidingen voor uw aankomst, en uw concierge staat vanaf dit moment aan uw zijde — één wens, één bericht, geregeld. De code hieronder is uw referentie voor alles.`,
    body: "Welkom bij Portugal Active. Ons team bereidt het huis al voor op uw aankomst en uw concierge begeleidt u vanaf nu. Bewaar de code hieronder, het is uw referentie voor elk verzoek.",
    personOne: "persoon", personMany: "personen",
    sessionOne: "sessie", sessionMany: "sessies",
    dayOne: "dag", dayMany: "dagen",
    nightsLabel: "nachten", guestsLabel: "gasten", taxesLabel: "Belastingen en kosten",
    hostedArrival: "Persoonlijke ontvangst", hostedArrivalLate: "Persoonlijke ontvangst na 21u",
    included: "Inbegrepen",
    confirm24h: "bevestiging binnen 2 uur",
    refund24hNote: "Kunnen we een dienst met bevestiging binnen 24 uur niet garanderen, dan wordt die regel automatisch terugbetaald.",
    groceriesNote: "Boodschappen: de supermarktrekening wordt apart gepresenteerd, tegen kostprijs.",
    flexLine: "Flex, gegarandeerd omboeken",
    confirmationCodeLabel: "Bevestigingscode",
    selfCheckIn: "Self check-in, inbegrepen bij uw verblijf",
    conciergeRequestsTitle: "Verzoeken aan de concierge",
    conciergeRequestsBody: "Uw concierge stuurt u binnen 24 uur een offerte op maat. Deze verzoeken worden pas bevestigd na uw akkoord.",
    nextTitle: "Wat volgt",
    nextBody: "De dag vóór aankomst ontvangt u per e-mail de check-in-instructies, met alle details om het huis te bereiken. Tot die tijd staat uw concierge klaar voor elk verzoek, van restaurantreserveringen tot transfers.",
    cta: "Mijn boeking bekijken",
    whatsappLine: "Chat met uw concierge op WhatsApp",
    bestPriceLine: "U boekte rechtstreeks bij Portugal Active, met de beste prijs gegarandeerd.",
    regards: "Met vriendelijke groet,",
    yourConcierge: "uw concierge",
    footerTagline: "Privéhotels in Portugal. De privacy van een huis, de service van een hotel.",
    preheader: "Het huis wordt al voorbereid. Uw concierge regelt vanaf nu alles.",
  },
  sv: {
    subject: (h) => `Din vistelse på ${h} är bekräftad`,
    yourHome: "ditt hus",
    headline: (h, i, o) => `Det är bekräftat. ${h} är ditt från ${i} till ${o}.`,
    bodyNamed: (n) => `Hej ${n}. Huset börjar redan idag förberedas inför din ankomst, och din concierge finns vid din sida från och med nu — en önskan, ett meddelande, ordnat. Koden nedan är din referens för allt.`,
    body: "Välkommen till Portugal Active. Vårt team förbereder redan huset inför din ankomst och din concierge följer dig från och med nu. Spara koden nedan, den är din referens för alla önskemål.",
    personOne: "person", personMany: "personer",
    sessionOne: "pass", sessionMany: "pass",
    dayOne: "dag", dayMany: "dagar",
    nightsLabel: "nätter", guestsLabel: "gäster", taxesLabel: "Skatter och avgifter",
    hostedArrival: "Personligt mottagande", hostedArrivalLate: "Personligt mottagande efter kl. 21",
    included: "Ingår",
    confirm24h: "bekräftas inom 2 timmar",
    refund24hNote: "Om vi inte kan säkra en tjänst som ska bekräftas inom 24 timmar återbetalas den raden automatiskt.",
    groceriesNote: "Matinköp: butikskvittot redovisas separat, till självkostnadspris.",
    flexLine: "Flex, garanterad ombokning",
    confirmationCodeLabel: "Bekräftelsekod",
    selfCheckIn: "Self check-in, ingår i vistelsen",
    conciergeRequestsTitle: "Önskemål till conciergen",
    conciergeRequestsBody: "Din concierge skickar en skräddarsydd offert inom 24 timmar. Dessa önskemål bekräftas först efter ditt godkännande.",
    nextTitle: "Vad händer nu",
    nextBody: "Dagen före ankomst får du incheckningsinstruktionerna via mejl, med alla detaljer för att nå huset. Fram till dess finns din concierge tillgänglig för alla önskemål, från restaurangbokningar till transfer.",
    cta: "Se min bokning",
    whatsappLine: "Chatta med din concierge på WhatsApp",
    bestPriceLine: "Du bokade direkt hos Portugal Active, med bästa pris garanterat.",
    regards: "Varma hälsningar,",
    yourConcierge: "din concierge",
    footerTagline: "Privata hotell i Portugal. Ett hems avskildhet, ett hotells service.",
    preheader: "Huset förbereds redan. Din concierge tar hand om allt från och med nu.",
  },
  fi: {
    subject: (h) => `Majoituksesi kohteessa ${h} on vahvistettu`,
    yourHome: "kotisi",
    headline: (h, i, o) => `Vahvistettu. ${h} on sinun ${i} alkaen ${o} asti.`,
    bodyNamed: (n) => `Hei ${n}. Talo alkaa tänään valmistautua saapumistasi varten, ja conciergesi on rinnallasi tästä hetkestä alkaen — yksi toive, yksi viesti, ja asia on hoidettu. Alla oleva koodi on viitteesi kaikkeen.`,
    body: "Tervetuloa Portugal Activeen. Tiimimme valmistelee jo taloa saapumistasi varten ja conciergesi on tukenasi tästä eteenpäin. Säilytä alla oleva koodi, se on viitteesi kaikkiin pyyntöihin.",
    personOne: "henkilö", personMany: "henkilöä",
    sessionOne: "kerta", sessionMany: "kertaa",
    dayOne: "päivä", dayMany: "päivää",
    nightsLabel: "yötä", guestsLabel: "vierasta", taxesLabel: "Verot ja maksut",
    hostedArrival: "Henkilökohtainen vastaanotto", hostedArrivalLate: "Henkilökohtainen vastaanotto klo 21 jälkeen",
    included: "Sisältyy",
    confirm24h: "vahvistus 2 tunnin kuluessa",
    refund24hNote: "Jos emme voi taata palvelua, joka vahvistetaan 24 tunnin kuluessa, kyseinen rivi hyvitetään automaattisesti.",
    groceriesNote: "Ostokset: ruokakaupan lasku esitetään erikseen, omakustannehintaan.",
    flexLine: "Flex, taattu uudelleenvaraus",
    confirmationCodeLabel: "Vahvistuskoodi",
    selfCheckIn: "Self check-in, sisältyy majoitukseen",
    conciergeRequestsTitle: "Pyynnöt conciergelle",
    conciergeRequestsBody: "Conciergesi lähettää sinulle räätälöidyn tarjouksen seuraavan 24 tunnin kuluessa. Nämä pyynnöt vahvistetaan vasta hyväksyntäsi jälkeen.",
    nextTitle: "Mitä seuraavaksi",
    nextBody: "Saapumista edeltävänä päivänä saat check-in-ohjeet sähköpostitse, kaikkine yksityiskohtineen talolle pääsyä varten. Siihen asti conciergesi on käytettävissäsi kaikkiin pyyntöihin, ravintolavarauksista kuljetuksiin.",
    cta: "Katso varaukseni",
    whatsappLine: "Keskustele conciergesi kanssa WhatsAppissa",
    bestPriceLine: "Varasit suoraan Portugal Activelta, paras hinta taattuna.",
    regards: "Lämpimin terveisin,",
    yourConcierge: "conciergesi",
    footerTagline: "Yksityishotelleja Portugalissa. Kodin yksityisyys, hotellin palvelu.",
    preheader: "Taloa valmistellaan jo. Conciergesi hoitaa kaiken tästä eteenpäin.",
  },
};

/* ── Legacy transactional emails (confirmation, pre-arrival, post-stay) ──
   They were English-only, with the raw Guesty title and a "LEAVE A REVIEW"
   button in capitals (auditoria set/2026). Same tone as the checkout v2
   emails, nine languages, sentence case. ───────────────────────────────── */
export interface LegacyStrings {
  confirmSubject: (house: string) => string;
  confirmHeadline: string;
  confirmIntro: (name: string) => string;
  checkInLabel: string;
  checkOutLabel: string;
  guestsLabel: string;
  totalLabel: string;
  codeLabel: string;
  conciergeLine: string;
  whatsappCta: string;
  whatsappMsg: (house: string, code: string) => string;
  arrivalSubject: (house: string) => string;
  arrivalHeadline: string;
  arrivalIntro: (name: string, house: string, date: string) => string;
  addressLabel: string;
  conciergeLabel: string;
  arrivalHelp: string;
  postSubject: (house: string) => string;
  postHeadline: string;
  postIntro: (name: string, house: string) => string;
  postFeedback: string;
  reviewCta: string;
  exploreCta: string;
}

export const LEGACY_I18N: Record<EmailLang, LegacyStrings> = {
  en: {
    confirmSubject: (h) => `Your stay at ${h} is confirmed`,
    confirmHeadline: "Your stay is confirmed.",
    confirmIntro: (n) => `${n ? `Dear ${n}, thank` : "Thank"} you for choosing Portugal Active. We are already preparing everything for your arrival.`,
    checkInLabel: "Check-in", checkOutLabel: "Check-out", guestsLabel: "Guests", totalLabel: "Total", codeLabel: "Confirmation",
    conciergeLine: "Your concierge will be in touch within 2 hours to help plan your stay, arrange services and answer any question.",
    whatsappCta: "Message your concierge",
    whatsappMsg: (h, c) => `Hi, I just booked ${h} (${c}). Looking forward to my stay!`,
    arrivalSubject: (h) => `Your stay at ${h} begins in 3 days`,
    arrivalHeadline: "Your home is being prepared.",
    arrivalIntro: (n, h, d) => `${n ? `Dear ${n}, your` : "Your"} stay at ${h} begins on ${d}. Our team is preparing everything for your arrival.`,
    addressLabel: "Address", conciergeLabel: "Concierge",
    arrivalHelp: "If you need anything before you arrive — groceries, an airport transfer, a restaurant table — reply to this email or message your concierge.",
    postSubject: (h) => `How was your stay at ${h}?`,
    postHeadline: "Thank you for staying with us.",
    postIntro: (n, h) => `${n ? `Dear ${n}, we` : "We"} hope you had a wonderful time at ${h}. It was a pleasure to host you.`,
    postFeedback: "Your feedback matters to us, and to the guests who will come after you.",
    reviewCta: "Leave a review", exploreCta: "Discover our other homes",
  },
  pt: {
    confirmSubject: (h) => `A sua estadia em ${h} está confirmada`,
    confirmHeadline: "A sua estadia está confirmada.",
    confirmIntro: (n) => `${n ? `${n}, obrigado` : "Obrigado"} por escolher a Portugal Active. Já estamos a preparar tudo para a sua chegada.`,
    checkInLabel: "Check-in", checkOutLabel: "Check-out", guestsLabel: "Hóspedes", totalLabel: "Total", codeLabel: "Confirmação",
    conciergeLine: "O seu concierge entra em contacto em 2 horas para ajudar a planear a estadia, organizar serviços e responder a qualquer questão.",
    whatsappCta: "Falar com o concierge",
    whatsappMsg: (h, c) => `Olá, acabei de reservar ${h} (${c}). Ansioso pela estadia!`,
    arrivalSubject: (h) => `A sua estadia em ${h} começa daqui a 3 dias`,
    arrivalHeadline: "A sua casa está a ser preparada.",
    arrivalIntro: (n, h, d) => `${n ? `${n}, a` : "A"} sua estadia em ${h} começa a ${d}. A nossa equipa está a preparar tudo para a sua chegada.`,
    addressLabel: "Morada", conciergeLabel: "Concierge",
    arrivalHelp: "Se precisar de alguma coisa antes de chegar — compras, transfer do aeroporto, mesa num restaurante — responda a este email ou fale com o seu concierge.",
    postSubject: (h) => `Como correu a sua estadia em ${h}?`,
    postHeadline: "Obrigado por ficar connosco.",
    postIntro: (n, h) => `${n ? `${n}, esperamos` : "Esperamos"} que tenha passado momentos maravilhosos em ${h}. Foi um prazer recebê-lo.`,
    postFeedback: "A sua opinião conta para nós, e para os hóspedes que vierem a seguir.",
    reviewCta: "Deixar uma avaliação", exploreCta: "Descobrir as nossas outras casas",
  },
  es: {
    confirmSubject: (h) => `Su estancia en ${h} está confirmada`,
    confirmHeadline: "Su estancia está confirmada.",
    confirmIntro: (n) => `${n ? `${n}, gracias` : "Gracias"} por elegir Portugal Active. Ya estamos preparando todo para su llegada.`,
    checkInLabel: "Check-in", checkOutLabel: "Check-out", guestsLabel: "Huéspedes", totalLabel: "Total", codeLabel: "Confirmación",
    conciergeLine: "Su concierge se pondrá en contacto en 2 horas para ayudarle a planificar la estancia, organizar servicios y responder a cualquier pregunta.",
    whatsappCta: "Escribir al concierge",
    whatsappMsg: (h, c) => `Hola, acabo de reservar ${h} (${c}). ¡Con ganas de la estancia!`,
    arrivalSubject: (h) => `Su estancia en ${h} empieza en 3 días`,
    arrivalHeadline: "Su casa se está preparando.",
    arrivalIntro: (n, h, d) => `${n ? `${n}, su` : "Su"} estancia en ${h} empieza el ${d}. Nuestro equipo está preparando todo para su llegada.`,
    addressLabel: "Dirección", conciergeLabel: "Concierge",
    arrivalHelp: "Si necesita algo antes de llegar — la compra, un traslado desde el aeropuerto, una mesa en un restaurante — responda a este correo o escriba a su concierge.",
    postSubject: (h) => `¿Qué tal su estancia en ${h}?`,
    postHeadline: "Gracias por alojarse con nosotros.",
    postIntro: (n, h) => `${n ? `${n}, esperamos` : "Esperamos"} que haya disfrutado de ${h}. Ha sido un placer recibirle.`,
    postFeedback: "Su opinión nos importa, a nosotros y a los huéspedes que vendrán después.",
    reviewCta: "Dejar una reseña", exploreCta: "Descubrir nuestras otras casas",
  },
  fr: {
    confirmSubject: (h) => `Votre séjour à ${h} est confirmé`,
    confirmHeadline: "Votre séjour est confirmé.",
    confirmIntro: (n) => `${n ? `${n}, merci` : "Merci"} d'avoir choisi Portugal Active. Nous préparons déjà tout pour votre arrivée.`,
    checkInLabel: "Arrivée", checkOutLabel: "Départ", guestsLabel: "Voyageurs", totalLabel: "Total", codeLabel: "Confirmation",
    conciergeLine: "Votre concierge vous contactera sous 2 heures pour vous aider à préparer votre séjour, organiser les services et répondre à vos questions.",
    whatsappCta: "Écrire au concierge",
    whatsappMsg: (h, c) => `Bonjour, je viens de réserver ${h} (${c}). Hâte d'y être !`,
    arrivalSubject: (h) => `Votre séjour à ${h} commence dans 3 jours`,
    arrivalHeadline: "Votre maison se prépare.",
    arrivalIntro: (n, h, d) => `${n ? `${n}, votre` : "Votre"} séjour à ${h} commence le ${d}. Notre équipe prépare tout pour votre arrivée.`,
    addressLabel: "Adresse", conciergeLabel: "Concierge",
    arrivalHelp: "S'il vous faut quoi que ce soit avant d'arriver — courses, transfert depuis l'aéroport, table au restaurant — répondez à cet e-mail ou écrivez à votre concierge.",
    postSubject: (h) => `Comment s'est passé votre séjour à ${h} ?`,
    postHeadline: "Merci d'avoir séjourné chez nous.",
    postIntro: (n, h) => `${n ? `${n}, nous` : "Nous"} espérons que vous avez passé de merveilleux moments à ${h}. Ce fut un plaisir de vous accueillir.`,
    postFeedback: "Votre avis compte pour nous, et pour les voyageurs qui viendront après vous.",
    reviewCta: "Laisser un avis", exploreCta: "Découvrir nos autres maisons",
  },
  it: {
    confirmSubject: (h) => `Il suo soggiorno a ${h} è confermato`,
    confirmHeadline: "Il suo soggiorno è confermato.",
    confirmIntro: (n) => `${n ? `${n}, grazie` : "Grazie"} per aver scelto Portugal Active. Stiamo già preparando tutto per il suo arrivo.`,
    checkInLabel: "Check-in", checkOutLabel: "Check-out", guestsLabel: "Ospiti", totalLabel: "Totale", codeLabel: "Conferma",
    conciergeLine: "Il suo concierge la contatterà entro 2 ore per aiutarla a organizzare il soggiorno, prenotare i servizi e rispondere a ogni domanda.",
    whatsappCta: "Scrivere al concierge",
    whatsappMsg: (h, c) => `Salve, ho appena prenotato ${h} (${c}). Non vedo l'ora!`,
    arrivalSubject: (h) => `Il suo soggiorno a ${h} inizia tra 3 giorni`,
    arrivalHeadline: "La sua casa si sta preparando.",
    arrivalIntro: (n, h, d) => `${n ? `${n}, il` : "Il"} suo soggiorno a ${h} inizia il ${d}. Il nostro team sta preparando tutto per il suo arrivo.`,
    addressLabel: "Indirizzo", conciergeLabel: "Concierge",
    arrivalHelp: "Se le serve qualcosa prima di arrivare — la spesa, un transfer dall'aeroporto, un tavolo al ristorante — risponda a questa email o scriva al suo concierge.",
    postSubject: (h) => `Com'è andato il suo soggiorno a ${h}?`,
    postHeadline: "Grazie per aver soggiornato con noi.",
    postIntro: (n, h) => `${n ? `${n}, speriamo` : "Speriamo"} che abbia trascorso momenti meravigliosi a ${h}. È stato un piacere averla ospite.`,
    postFeedback: "La sua opinione conta per noi, e per gli ospiti che verranno dopo di lei.",
    reviewCta: "Lasciare una recensione", exploreCta: "Scoprire le nostre altre case",
  },
  de: {
    confirmSubject: (h) => `Ihr Aufenthalt in ${h} ist bestätigt`,
    confirmHeadline: "Ihr Aufenthalt ist bestätigt.",
    confirmIntro: (n) => `${n ? `${n}, vielen` : "Vielen"} Dank, dass Sie sich für Portugal Active entschieden haben. Wir bereiten bereits alles für Ihre Ankunft vor.`,
    checkInLabel: "Check-in", checkOutLabel: "Check-out", guestsLabel: "Gäste", totalLabel: "Gesamt", codeLabel: "Bestätigung",
    conciergeLine: "Ihr Concierge meldet sich innerhalb von 2 Stunden, um Ihren Aufenthalt zu planen, Leistungen zu organisieren und Ihre Fragen zu beantworten.",
    whatsappCta: "Concierge anschreiben",
    whatsappMsg: (h, c) => `Hallo, ich habe gerade ${h} gebucht (${c}). Ich freue mich auf den Aufenthalt!`,
    arrivalSubject: (h) => `Ihr Aufenthalt in ${h} beginnt in 3 Tagen`,
    arrivalHeadline: "Ihr Haus wird vorbereitet.",
    arrivalIntro: (n, h, d) => `${n ? `${n}, Ihr` : "Ihr"} Aufenthalt in ${h} beginnt am ${d}. Unser Team bereitet alles für Ihre Ankunft vor.`,
    addressLabel: "Adresse", conciergeLabel: "Concierge",
    arrivalHelp: "Wenn Sie vor der Anreise etwas brauchen — Einkäufe, einen Flughafentransfer, einen Tisch im Restaurant — antworten Sie auf diese E-Mail oder schreiben Sie Ihrem Concierge.",
    postSubject: (h) => `Wie war Ihr Aufenthalt in ${h}?`,
    postHeadline: "Danke, dass Sie bei uns waren.",
    postIntro: (n, h) => `${n ? `${n}, wir` : "Wir"} hoffen, Sie hatten eine wunderbare Zeit in ${h}. Es war uns eine Freude, Sie zu Gast zu haben.`,
    postFeedback: "Ihre Meinung ist uns wichtig — und den Gästen, die nach Ihnen kommen.",
    reviewCta: "Bewertung schreiben", exploreCta: "Unsere anderen Häuser entdecken",
  },
  nl: {
    confirmSubject: (h) => `Uw verblijf in ${h} is bevestigd`,
    confirmHeadline: "Uw verblijf is bevestigd.",
    confirmIntro: (n) => `${n ? `${n}, bedankt` : "Bedankt"} dat u voor Portugal Active heeft gekozen. We bereiden alles al voor op uw aankomst.`,
    checkInLabel: "Check-in", checkOutLabel: "Check-out", guestsLabel: "Gasten", totalLabel: "Totaal", codeLabel: "Bevestiging",
    conciergeLine: "Uw concierge neemt binnen 2 uur contact op om uw verblijf te plannen, diensten te regelen en al uw vragen te beantwoorden.",
    whatsappCta: "Stuur uw concierge een bericht",
    whatsappMsg: (h, c) => `Hallo, ik heb zojuist ${h} geboekt (${c}). Ik kijk uit naar het verblijf!`,
    arrivalSubject: (h) => `Uw verblijf in ${h} begint over 3 dagen`,
    arrivalHeadline: "Uw huis wordt klaargemaakt.",
    arrivalIntro: (n, h, d) => `${n ? `${n}, uw` : "Uw"} verblijf in ${h} begint op ${d}. Ons team maakt alles klaar voor uw aankomst.`,
    addressLabel: "Adres", conciergeLabel: "Concierge",
    arrivalHelp: "Heeft u vóór aankomst iets nodig — boodschappen, een luchthaventransfer, een tafel in een restaurant — beantwoord dan deze e-mail of stuur uw concierge een bericht.",
    postSubject: (h) => `Hoe was uw verblijf in ${h}?`,
    postHeadline: "Bedankt dat u bij ons verbleef.",
    postIntro: (n, h) => `${n ? `${n}, we` : "We"} hopen dat u een prachtige tijd had in ${h}. Het was een genoegen u te ontvangen.`,
    postFeedback: "Uw mening telt voor ons, en voor de gasten die na u komen.",
    reviewCta: "Een beoordeling achterlaten", exploreCta: "Onze andere huizen ontdekken",
  },
  sv: {
    confirmSubject: (h) => `Din vistelse på ${h} är bekräftad`,
    confirmHeadline: "Din vistelse är bekräftad.",
    confirmIntro: (n) => `${n ? `${n}, tack` : "Tack"} för att du valde Portugal Active. Vi förbereder redan allt inför din ankomst.`,
    checkInLabel: "Incheckning", checkOutLabel: "Utcheckning", guestsLabel: "Gäster", totalLabel: "Totalt", codeLabel: "Bekräftelse",
    conciergeLine: "Din concierge hör av sig inom 2 timmar för att hjälpa dig planera vistelsen, ordna tjänster och svara på alla frågor.",
    whatsappCta: "Skriv till din concierge",
    whatsappMsg: (h, c) => `Hej, jag har precis bokat ${h} (${c}). Ser fram emot vistelsen!`,
    arrivalSubject: (h) => `Din vistelse på ${h} börjar om 3 dagar`,
    arrivalHeadline: "Ditt hem förbereds.",
    arrivalIntro: (n, h, d) => `${n ? `${n}, din` : "Din"} vistelse på ${h} börjar den ${d}. Vårt team förbereder allt inför din ankomst.`,
    addressLabel: "Adress", conciergeLabel: "Concierge",
    arrivalHelp: "Behöver du något innan du anländer — matvaror, flygplatstransfer, ett restaurangbord — svara på det här mejlet eller skriv till din concierge.",
    postSubject: (h) => `Hur var din vistelse på ${h}?`,
    postHeadline: "Tack för att du bodde hos oss.",
    postIntro: (n, h) => `${n ? `${n}, vi` : "Vi"} hoppas att du hade en underbar tid på ${h}. Det var ett nöje att ha dig som gäst.`,
    postFeedback: "Din åsikt betyder mycket för oss, och för gästerna som kommer efter dig.",
    reviewCta: "Lämna ett omdöme", exploreCta: "Upptäck våra andra hem",
  },
  fi: {
    confirmSubject: (h) => `Oleskelusi kohteessa ${h} on vahvistettu`,
    confirmHeadline: "Oleskelusi on vahvistettu.",
    confirmIntro: (n) => `${n ? `${n}, kiitos` : "Kiitos"}, että valitsit Portugal Activen. Valmistelemme jo kaiken saapumistasi varten.`,
    checkInLabel: "Sisäänkirjautuminen", checkOutLabel: "Uloskirjautuminen", guestsLabel: "Vieraat", totalLabel: "Yhteensä", codeLabel: "Vahvistus",
    conciergeLine: "Conciergesi ottaa yhteyttä 2 tunnin kuluessa auttaakseen oleskelun suunnittelussa, palveluiden järjestämisessä ja kysymyksissä.",
    whatsappCta: "Viesti conciergelle",
    whatsappMsg: (h, c) => `Hei, varasin juuri kohteen ${h} (${c}). Odotan innolla!`,
    arrivalSubject: (h) => `Oleskelusi kohteessa ${h} alkaa 3 päivän kuluttua`,
    arrivalHeadline: "Kotiasi valmistellaan.",
    arrivalIntro: (n, h, d) => `${n ? `${n}, oleskelusi` : "Oleskelusi"} kohteessa ${h} alkaa ${d}. Tiimimme valmistelee kaiken saapumistasi varten.`,
    addressLabel: "Osoite", conciergeLabel: "Concierge",
    arrivalHelp: "Jos tarvitset jotain ennen saapumista — ostoksia, lentokenttäkuljetuksen, ravintolapöydän — vastaa tähän sähköpostiin tai lähetä viesti conciergellesi.",
    postSubject: (h) => `Millainen oleskelusi kohteessa ${h} oli?`,
    postHeadline: "Kiitos, että majoituit meillä.",
    postIntro: (n, h) => `${n ? `${n}, toivomme` : "Toivomme"}, että vietit ihania hetkiä kohteessa ${h}. Oli ilo saada sinut vieraaksemme.`,
    postFeedback: "Mielipiteesi on meille tärkeä, ja niille vieraille, jotka tulevat sinun jälkeesi.",
    reviewCta: "Jätä arvostelu", exploreCta: "Tutustu muihin koteihimme",
  },
};
