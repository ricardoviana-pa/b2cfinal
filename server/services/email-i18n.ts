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

/** Rótulo da linha quote.cleaningFee tal como o resumo do checkout a mostrou
 *  nessa língua (property.cleaningFee: "Limpeza final", "Final
 *  cleaning"...). Lido do mesmo ficheiro do site para o email não voltar a
 *  ficar dessincronizado: em agosto o site deixou "Service fee" e o email
 *  ficou com o rótulo antigo, em inglês, nas 9 línguas. */
export function cleaningFeeLabel(lang: EmailLang): string {
  return SITE_LOCALES[lang]?.property?.cleaningFee
    ?? SITE_LOCALES.en.property.cleaningFee;
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
  /** Por baixo de "Portugal Active" na assinatura da marca (sem concierge confirmado). */
  conciergeTeam: string;
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
    footerTagline: "Casas de luxo em Portugal. A privacidade de uma casa, o serviço de um hotel.",
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
    footerTagline: "Luxury villas in Portugal. The privacy of a home, the service of a hotel.",
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
    footerTagline: "Villas de luxe au Portugal. L'intimité d'une maison, le service d'un hôtel.",
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
    footerTagline: "Villas de lujo en Portugal. La privacidad de una casa, el servicio de un hotel.",
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
    footerTagline: "Ville di lusso in Portogallo. La privacy di una casa, il servizio di un hotel.",
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
    footerTagline: "Luxusvillen in Portugal. Die Privatsphäre eines Hauses, der Service eines Hotels.",
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
    footerTagline: "Luxevilla's in Portugal. De privacy van een huis, de service van een hotel.",
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
    footerTagline: "Lyxvillor i Portugal. Ett hems avskildhet, ett hotells service.",
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
    footerTagline: "Luksushuviloita Portugalissa. Kodin yksityisyys, hotellin palvelu.",
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
    conciergeTeam: "Concierge",
    footerTagline: "Casas de luxo em Portugal. A privacidade de uma casa, o serviço de um hotel.",
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
    conciergeTeam: "Concierge",
    footerTagline: "Luxury villas in Portugal. The privacy of a home, the service of a hotel.",
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
    conciergeTeam: "Conciergerie",
    footerTagline: "Villas de luxe au Portugal. L'intimité d'une maison, le service d'un hôtel.",
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
    conciergeTeam: "Concierge",
    footerTagline: "Villas de lujo en Portugal. La privacidad de una casa, el servicio de un hotel.",
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
    conciergeTeam: "Concierge",
    footerTagline: "Ville di lusso in Portogallo. La privacy di una casa, il servizio di un hotel.",
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
    conciergeTeam: "Concierge",
    footerTagline: "Luxusvillen in Portugal. Die Privatsphäre eines Hauses, der Service eines Hotels.",
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
    conciergeTeam: "Concierge",
    footerTagline: "Luxevilla's in Portugal. De privacy van een huis, de service van een hotel.",
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
    conciergeTeam: "Concierge",
    footerTagline: "Lyxvillor i Portugal. Ett hems avskildhet, ett hotells service.",
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
    conciergeTeam: "Concierge",
    footerTagline: "Luksushuviloita Portugalissa. Kodin yksityisyys, hotellin palvelu.",
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

/* ────────────────────────────────────────────────────────────────
   Pagamento em duas partes (spec docs/pagamento_duas_partes.md 4.2).
   PT e EN são as strings da spec, palavra por palavra; as outras 7
   línguas seguem a voz dos blocos acima (tratamento formal onde a
   língua o pede, saudação com vírgula e frase seguida, como no email
   de recuperação). Regras do tradutor, em todas as línguas:
   - o produto chama-se "Pagar em duas partes" e as partes são
     "primeira" e "segunda parte": nunca sinal, depósito, prestações,
     acompte, Anzahlung, caparra, aanbetaling, handpenning, käsiraha;
   - o Flex nunca é seguro (aqui nem aparece);
   - lost/stolen/fraudulent nunca dizem a causa: a variante hard é uma
     recusa genérica com "use outro cartão";
   - valores, datas e horas chegam já formatados (eur() e Intl no fuso
     de Lisboa); os prazos levam sempre a hora e "hora de Lisboa";
   - sem urgência inventada: o único prazo dito é o real.
   ──────────────────────────────────────────────────────────────── */

export interface PayPlanRemindSlots {
  greeting: string; date: string; amount: string; last4: string | null;
  house: string; checkIn: string; checkOut: string;
}
export interface PayPlanFailedSlots { greeting: string; amount: string; last4: string | null }
export interface PayPlanPaidSlots {
  greeting: string; amount: string; last4: string | null;
  house: string; checkIn: string; checkOut: string; invoiceLine: string;
}
export interface PayPlanCancelledSlots {
  greeting: string; house: string;
  /** H com hora; null quando o chamador não o tem (frase sem data). */
  deadline: string | null;
  /** Valor devolvido; null ou omitido quando não houve devolução. */
  refund: string | null;
  /** Últimos 4 dígitos dos cartões que recebem a devolução, por ordem (o da
   *  1.ª parte, depois o da 2.ª se foi outro); [] = "o cartão com que pagou". */
  cards: string[];
  /** Número da nota de crédito, quando já existe. */
  creditNote: string | null;
}
export interface PayPlanGuestCancelledSlots {
  greeting: string; house: string; checkIn: string; checkOut: string;
  refund: string | null; cards: string[]; creditNote: string | null;
}

export interface PayPlanStrings {
  /** Nome do produto voltado ao hóspede. */
  productName: string;
  /** Saudação que abre o corpo ("Olá Ana." / "Hallo Ana,"). */
  hello: (name: string | null) => string;
  /** Prazo completo: dia, hora e fuso de Lisboa. */
  deadline: (day: string, time: string) => string;
  amountLabel: string;
  chargeDateLabel: string;
  cardLabel: string;
  payByLabel: string;
  freeCancelLabel: string;
  totalPaidLabel: string;
  refundLabel: string;
  /* E0, bloco do plano na confirmação */
  planTitle: string;
  planToday: (amount: string, last4: string | null) => string;
  planLater: (date: string, amount: string) => string;
  planDeadline: (deadline: string) => string;
  planNote: string;
  /** Só com o link "Gerir o pagamento" (sem link, a frase seria falsa). */
  planNoteManage: string;
  planCta: string;
  noWithdrawal: string;
  /* E1 (C−7) e E2 (C−1) */
  remind7Subject: (house: string) => string;
  /** E1 que sai fora dos 7 dias exatos (sweep atrasado): sem "daqui a uma semana". */
  remindSubjectDated: (house: string, date: string) => string;
  remind7Headline: (date: string, amount: string) => string;
  remind1Subject: (house: string) => string;
  remind1Headline: (amount: string) => string;
  remindBody: (s: PayPlanRemindSlots) => string;
  cardExpires: (last4: string, date: string) => string;
  /** A "dica de limite diário" do E1 (spec 2.4). */
  limitTip: string;
  /* E3, falha (variantes soft, auth e hard) */
  failedSubject: string;
  failedHeadline: string;
  failedHeadlineAuth: string;
  failedBody: (s: PayPlanFailedSlots) => string;
  failedBodyAuth: (s: PayPlanFailedSlots) => string;
  failedBodyHard: (s: PayPlanFailedSlots) => string;
  /** Só soft e só com retentativas ainda por fazer antes de H. */
  deadlineSoft: (deadline: string, retries: string[]) => string;
  /** Auth, hard, ou soft sem retentativas: nunca promete nova tentativa. */
  deadlineHard: (deadline: string) => string;
  consequence: (amountPaid: string | null) => string;
  failedCta: string;
  failedCtaHard: string;
  failedCtaAuth: (last4: string | null) => string;
  help: string;
  /* E3b, véspera de H */
  lastCallSubject: (house: string) => string;
  lastCallHeadline: string;
  lastCallBody: (greeting: string, amount: string, deadline: string) => string;
  /* E4, paga na totalidade */
  paidSubject: (house: string) => string;
  paidHeadline: (checkIn: string) => string;
  paidBody: (s: PayPlanPaidSlots) => string;
  invoiceAfterStay: string;
  invoiceSeparate: string;
  /* E5, cancelada por falta de pagamento */
  cancelledSubject: (house: string) => string;
  cancelledHeadline: string;
  cancelledBody: (s: PayPlanCancelledSlots) => string;
  rebook: string;
  /* E7, cancelada a pedido do hóspede */
  guestCancelledSubject: (house: string) => string;
  guestCancelledHeadline: string;
  guestCancelledBody: (s: PayPlanGuestCancelledSlots) => string;
  /* E5/E7 da equipa ("Devolver tudo" no admin): assunto e título do E5,
   *  texto neutro (nem "a seu pedido", nem "dentro do prazo", nem falta de
   *  pagamento). */
  teamCancelledBody: (s: PayPlanGuestCancelledSlots) => string;
  /* E6, cartão atualizado */
  cardUpdatedSubject: string;
  cardUpdatedBody: (last4: string, date: string) => string;
}

/** "A e B", "A, B e C" (sem vírgula antes da conjunção, em todas as línguas). */
function joinList(items: string[], and: string): string {
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

/** Junta frases opcionais (as que vêm vazias saem). */
function sentences(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** "às 12:00", mas "à 01:00" (pt) / "a las 12:00", mas "a la 01:00" (es). */
const ptAt = (t: string) => (t.startsWith("01:") ? "à" : "às");
const esAt = (t: string) => (t.startsWith("01:") ? "la" : "las");

/* Cartão por extenso, por língua (sem últimos 4 dígitos, "o cartão que usou"). */
const ptCard = (l: string | null) => (l ? `cartão ••••${l}` : "cartão que usou");
const enCard = (l: string | null) => (l ? `card ••••${l}` : "the card you used");
const frCard = (l: string | null) => (l ? `carte ••••${l}` : "carte utilisée");
const esCard = (l: string | null) => (l ? `tarjeta ••••${l}` : "tarjeta que utilizó");
const itCard = (l: string | null) => (l ? `carta ••••${l}` : "carta che ha utilizzato");
/** de: dativo "von Ihrer Karte" e acusativo "auf Ihre Karte". */
const deFrom = (l: string | null) => (l ? `von Ihrer Karte ••••${l}` : "von der verwendeten Karte");
const nlCard = (l: string | null) => (l ? `kaart ••••${l}` : "de gebruikte kaart");
const svCard = (l: string | null) => (l ? `kort ••••${l}` : "kortet du använde");
/* Para onde vai a devolução (E5, E7 e o da equipa): 0 cartões = sem dígitos
 * ("o cartão com que pagou"), 1 = "o cartão ••••1234", 2 = "os cartões
 * ••••1234 e ••••5678". Já com a preposição de cada língua. */
const refundTo = (none: string, one: (l: string) => string, many: (list: string) => string, and: string) =>
  (cards: string[]) =>
    cards.length === 0 ? none : cards.length === 1 ? one(cards[0]) : many(joinList(cards.map((l) => `••••${l}`), and));
const ptTo = refundTo("ao cartão com que pagou", (l) => `ao cartão ••••${l}`, (x) => `aos cartões ${x}`, "e");
const enTo = refundTo("to the card used for your payment", (l) => `to card ••••${l}`, (x) => `to cards ${x}`, "and");
const frTo = refundTo("sur la carte avec laquelle vous avez payé", (l) => `sur la carte ••••${l}`, (x) => `sur les cartes ${x}`, "et");
const esTo = refundTo("a la tarjeta con la que pagó", (l) => `a la tarjeta ••••${l}`, (x) => `a las tarjetas ${x}`, "y");
const itTo = refundTo("sulla carta con cui ha pagato", (l) => `sulla carta ••••${l}`, (x) => `sulle carte ${x}`, "e");
/** de: acusativo "auf Ihre Karte(n)". */
const deTo = refundTo("auf die für die Zahlung verwendete Karte", (l) => `auf Ihre Karte ••••${l}`, (x) => `auf Ihre Karten ${x}`, "und");
const nlTo = refundTo("naar de kaart waarmee u betaalde", (l) => `naar kaart ••••${l}`, (x) => `naar de kaarten ${x}`, "en");
const svTo = refundTo("till kortet du betalade med", (l) => `till kort ••••${l}`, (x) => `till korten ${x}`, "och");
/** fi: alativo (kortille / korteille). */
const fiTo = refundTo("maksussa käytetylle kortille", (l) => `kortille ••••${l}`, (x) => `korteille ${x}`, "ja");
/** it: artigo/preposição + data, com elisão antes de 8 e 11 ("il 15 luglio",
 *  "l'8 luglio", "dall'11 luglio"); cap = início de frase. */
const IT_ELIDED = { il: "l'", al: "all'", dal: "dall'", del: "dell'" } as const;
export const itArt = (prep: keyof typeof IT_ELIDED, d: string, cap = false) => {
  const s = /^(8|11)\b/.test(d) ? `${IT_ELIDED[prep]}${d}` : `${prep} ${d}`;
  return cap ? s.charAt(0).toUpperCase() + s.slice(1) : s;
};
/** fi: ablativo (kortilta) e alativo (kortille). */
const fiFrom = (l: string | null) => (l ? `kortilta ••••${l}` : "käyttämältäsi kortilta");

export const PAYPLAN_I18N: Record<EmailLang, PayPlanStrings> = {
  pt: {
    productName: "Pagar em duas partes",
    hello: (n) => (n ? `Olá ${n}.` : "Olá."),
    deadline: (d, t) => `${d} ${ptAt(t)} ${t}, hora de Lisboa`,
    amountLabel: "Segunda parte", chargeDateLabel: "Data da cobrança", cardLabel: "Cartão",
    payByLabel: "Pagar até", freeCancelLabel: "Cancelamento gratuito até",
    totalPaidLabel: "Total pago", refundLabel: "Devolução",
    planTitle: "O seu plano de pagamento",
    planToday: (a, l) => (l ? `Hoje, pago: ${a} no cartão ••••${l}` : `Hoje, pago: ${a}`),
    planLater: (d, a) => `A ${d}: ${a}, cobrado automaticamente no mesmo cartão`,
    planDeadline: (dl) => `Pode cancelar sem custos até ${dl}.`,
    planNote: "Nada a fazer até lá. Lembramos uma semana antes e na véspera.",
    planNoteManage: "Se preferir pagar antes, usar outro cartão ou cancelar, basta um clique.",
    planCta: "Gerir o pagamento",
    noWithdrawal: "Reserva de alojamento com datas fixas: não há direito de livre resolução de 14 dias. Aplica-se a política de cancelamento da sua tarifa.",
    remind7Subject: (h) => `A segunda parte da sua estadia em ${h}, daqui a uma semana`,
    remindSubjectDated: (h, d) => `A segunda parte da sua estadia em ${h}, a ${d}`,
    remind7Headline: (d, a) => `A ${d}, ${a}.`,
    remind1Subject: (h) => `Amanhã cobramos a segunda parte da sua estadia em ${h}`,
    remind1Headline: (a) => `Amanhã, ${a}.`,
    remindBody: (s) => `${s.greeting} Tal como combinado, a ${s.date} cobramos ${s.amount} no ${ptCard(s.last4)}, a segunda e última parte da sua estadia em ${s.house}, de ${s.checkIn} a ${s.checkOut}. Não precisa de fazer nada. Se preferir usar outro cartão, ou pagar já, basta um clique.`,
    cardExpires: (l, d) => `O cartão ••••${l} expira antes de ${d}. Atualize-o num minuto para a cobrança correr sem sobressaltos.`,
    limitTip: "Se o cartão tiver um limite diário, confirme que cobre este valor nesse dia.",
    failedSubject: "Não conseguimos cobrar a segunda parte da sua estadia",
    failedHeadline: "O banco não aceitou a segunda parte.",
    failedHeadlineAuth: "O seu banco pede uma confirmação.",
    failedBody: (s) => `${s.greeting} Hoje tentámos cobrar ${s.amount} no ${ptCard(s.last4)} e o banco não aceitou. Acontece com frequência por limite do cartão, validade ou um pedido de confirmação do banco. Pode pagar com o mesmo cartão ou com outro no botão abaixo, sem precisar de iniciar sessão.`,
    failedBodyAuth: (s) => `${s.greeting} O seu banco pede-lhe uma confirmação para a cobrança de ${s.amount} no ${ptCard(s.last4)}. Basta confirmar com o mesmo cartão no botão abaixo. Demora um minuto.`,
    failedBodyHard: (s) => `${s.greeting} Hoje tentámos cobrar ${s.amount} no ${ptCard(s.last4)} e o banco não aceitou. Para concluir, use outro cartão no botão abaixo, sem precisar de iniciar sessão.`,
    deadlineSoft: (dl, r) => `Para manter a reserva, o pagamento tem de estar feito até ${dl}. Vamos também tentar de novo ${joinList(r.map((x) => `a ${x}`), "e")}.`,
    deadlineHard: (dl) => `Para manter a reserva, o pagamento tem de estar feito até ${dl}. Neste caso só o seu clique resolve: não vamos tentar de novo sozinhos.`,
    consequence: (p) => p
      ? `Se até lá não for possível, a reserva é cancelada e devolvemos os ${p} que já pagou, porque ainda está dentro do prazo de cancelamento gratuito.`
      : "Se até lá não for possível, a reserva é cancelada e devolvemos o que já pagou, porque ainda está dentro do prazo de cancelamento gratuito.",
    failedCta: "Pagar ou mudar de cartão",
    failedCtaHard: "Usar outro cartão",
    failedCtaAuth: (l) => (l ? `Confirmar com o cartão ••••${l}` : "Confirmar com o mesmo cartão"),
    help: "Se precisar de ajuda, use o botão “Preciso de ajuda” na mesma página. Por segurança, nunca envie dados do cartão por email ou mensagem.",
    lastCallSubject: (h) => `Amanhã termina o prazo da segunda parte da sua estadia em ${h}`,
    lastCallHeadline: "O prazo termina amanhã.",
    lastCallBody: (g, a, dl) => `${g} Ainda não recebemos ${a} e o prazo termina amanhã, ${dl}. Pagar demora dois minutos. Se já não puder vir, não precisa de fazer nada: a reserva é cancelada e devolvemos o que pagou.`,
    paidSubject: (h) => `A sua estadia em ${h} está paga na totalidade`,
    paidHeadline: (ci) => `Está tudo pago. Até ${ci}.`,
    paidBody: (s) => `${s.greeting} Recebemos a segunda parte, ${s.amount}, no ${ptCard(s.last4)}. A sua estadia em ${s.house}, de ${s.checkIn} a ${s.checkOut}, está paga na totalidade. ${s.invoiceLine} Até lá, o seu concierge está a uma mensagem de distância.`,
    invoiceAfterStay: "A fatura é emitida após a estadia.",
    invoiceSeparate: "A fatura segue em email separado.",
    cancelledSubject: (h) => `A sua reserva em ${h} foi cancelada`,
    cancelledHeadline: "A sua reserva foi cancelada.",
    cancelledBody: (s) => sentences(
      `${s.greeting} Não recebemos a segunda parte da sua estadia em ${s.house} ${s.deadline ? `até ${s.deadline}` : "dentro do prazo"}, por isso a reserva foi cancelada, como explicámos.`,
      s.refund && `Os ${s.refund} que pagou voltam ${ptTo(s.cards)} dentro de 5 a 10 dias úteis, conforme o banco.`,
      s.creditNote && `Referência da nota de crédito: ${s.creditNote}.`,
      "Não há mais nada a pagar.",
    ),
    rebook: "Se ainda quiser vir, as datas podem continuar livres. Reserve de novo ou fale com o seu concierge.",
    guestCancelledSubject: (h) => `Cancelamento confirmado: ${h}`,
    guestCancelledHeadline: "Cancelamento confirmado.",
    guestCancelledBody: (s) => sentences(
      `${s.greeting} Cancelámos a sua reserva em ${s.house}, de ${s.checkIn} a ${s.checkOut}, como pediu, dentro do prazo de cancelamento gratuito.`,
      s.refund && `Devolvemos ${s.refund} ${ptTo(s.cards)} em 5 a 10 dias úteis.`,
      s.creditNote && `Referência da nota de crédito: ${s.creditNote}.`,
      "Não há mais nada a pagar e nenhuma outra cobrança será feita.",
    ),
    teamCancelledBody: (s) => sentences(
      s.refund
        ? `${s.greeting} Cancelámos a sua reserva em ${s.house}, de ${s.checkIn} a ${s.checkOut}, e devolvemos ${s.refund} ${ptTo(s.cards)}, em 5 a 10 dias úteis, conforme o banco.`
        : `${s.greeting} Cancelámos a sua reserva em ${s.house}, de ${s.checkIn} a ${s.checkOut}.`,
      s.creditNote && `Referência da nota de crédito: ${s.creditNote}.`,
      "Não há mais nada a pagar e nenhuma outra cobrança será feita. Se tiver alguma dúvida, fale com o seu concierge.",
    ),
    cardUpdatedSubject: "Cartão atualizado para a segunda parte",
    cardUpdatedBody: (l, d) => `Cartão atualizado. A segunda parte será cobrada no cartão ••••${l} a ${d}.`,
  },
  en: {
    productName: "Pay in two parts",
    hello: (n) => (n ? `Hello ${n}.` : "Hello."),
    deadline: (d, t) => `${d} at ${t}, Lisbon time`,
    amountLabel: "Second part", chargeDateLabel: "Charge date", cardLabel: "Card",
    payByLabel: "Pay by", freeCancelLabel: "Free cancellation until",
    totalPaidLabel: "Total paid", refundLabel: "Refund",
    planTitle: "Your payment plan",
    planToday: (a, l) => (l ? `Paid today: ${a} on card ••••${l}` : `Paid today: ${a}`),
    planLater: (d, a) => `On ${d}: ${a}, charged automatically to the same card`,
    planDeadline: (dl) => `You can cancel at no cost until ${dl}.`,
    planNote: "Nothing to do until then. We will remind you a week before and the day before.",
    planNoteManage: "If you would rather pay earlier, use another card or cancel, it takes one click.",
    planCta: "Manage payment",
    noWithdrawal: "Accommodation booking with fixed dates: the 14-day right of withdrawal does not apply. Your rate's cancellation policy applies.",
    remind7Subject: (h) => `The second part of your stay at ${h}, one week from now`,
    remindSubjectDated: (h, d) => `The second part of your stay at ${h}, on ${d}`,
    remind7Headline: (d, a) => `On ${d}, ${a}.`,
    remind1Subject: (h) => `Tomorrow we charge the second part of your stay at ${h}`,
    remind1Headline: (a) => `Tomorrow, ${a}.`,
    remindBody: (s) => `${s.greeting} As agreed, on ${s.date} we will charge ${s.amount} to ${enCard(s.last4)}, the second and final part of your stay at ${s.house}, from ${s.checkIn} to ${s.checkOut}. There is nothing you need to do. If you would rather use another card, or pay now, it takes one click.`,
    cardExpires: (l, d) => `Card ••••${l} expires before ${d}. Update it in a minute so the charge goes through smoothly.`,
    limitTip: "If your card has a daily limit, check that it covers this amount on that day.",
    failedSubject: "We could not charge the second part of your stay",
    failedHeadline: "Your bank did not accept the second part.",
    failedHeadlineAuth: "Your bank is asking for a confirmation.",
    failedBody: (s) => `${s.greeting} Today we tried to charge ${s.amount} to ${enCard(s.last4)} and your bank did not accept it. This often happens because of a card limit, an expiry date or a confirmation your bank wants from you. You can pay with the same card or another one using the button below, no sign-in needed.`,
    failedBodyAuth: (s) => `${s.greeting} Your bank is asking you to confirm the charge of ${s.amount} on ${enCard(s.last4)}. Just confirm with the same card using the button below. It takes a minute.`,
    failedBodyHard: (s) => `${s.greeting} Today we tried to charge ${s.amount} to ${enCard(s.last4)} and your bank did not accept it. To complete it, use another card with the button below, no sign-in needed.`,
    deadlineSoft: (dl, r) => `To keep your booking, the payment needs to be made by ${dl}. We will also try again on ${joinList(r, "and")}.`,
    deadlineHard: (dl) => `To keep your booking, the payment needs to be made by ${dl}. In this case only your click fixes it: we will not retry on our own.`,
    consequence: (p) => p
      ? `If it is not possible by then, the booking is cancelled and we refund the ${p} you already paid, because you are still within the free cancellation period.`
      : "If it is not possible by then, the booking is cancelled and we refund what you already paid, because you are still within the free cancellation period.",
    failedCta: "Pay or change card",
    failedCtaHard: "Use another card",
    failedCtaAuth: (l) => (l ? `Confirm with card ••••${l}` : "Confirm with the same card"),
    help: "If you need help, use the “I need help” button on the same page. For your safety, never send card details by email or message.",
    lastCallSubject: (h) => `Tomorrow is the deadline for the second part of your stay at ${h}`,
    lastCallHeadline: "The deadline is tomorrow.",
    lastCallBody: (g, a, dl) => `${g} We have not yet received ${a} and the deadline is tomorrow, ${dl}. Paying takes two minutes. If you can no longer come, there is nothing you need to do: the booking is cancelled and we refund what you paid.`,
    paidSubject: (h) => `Your stay at ${h} is paid in full`,
    paidHeadline: (ci) => `All paid. See you on ${ci}.`,
    paidBody: (s) => `${s.greeting} We received the second part, ${s.amount}, on ${enCard(s.last4)}. Your stay at ${s.house}, from ${s.checkIn} to ${s.checkOut}, is paid in full. ${s.invoiceLine} Until then, your concierge is one message away.`,
    invoiceAfterStay: "The invoice is issued after your stay.",
    invoiceSeparate: "The invoice follows in a separate email.",
    cancelledSubject: (h) => `Your booking at ${h} has been cancelled`,
    cancelledHeadline: "Your booking has been cancelled.",
    cancelledBody: (s) => sentences(
      `${s.greeting} We did not receive the second part of your stay at ${s.house} ${s.deadline ? `by ${s.deadline}` : "in time"}, so the booking was cancelled, as we explained.`,
      s.refund && `The ${s.refund} you paid goes back ${enTo(s.cards)} within 5 to 10 working days, depending on your bank.`,
      s.creditNote && `Credit note reference: ${s.creditNote}.`,
      "There is nothing more to pay.",
    ),
    rebook: "If you still want to come, the dates may still be free. Book again or talk to your concierge.",
    guestCancelledSubject: (h) => `Cancellation confirmed: ${h}`,
    guestCancelledHeadline: "Cancellation confirmed.",
    guestCancelledBody: (s) => sentences(
      `${s.greeting} We cancelled your booking at ${s.house}, from ${s.checkIn} to ${s.checkOut}, as requested, within the free cancellation period.`,
      s.refund && `We are refunding ${s.refund} ${enTo(s.cards)} within 5 to 10 working days.`,
      s.creditNote && `Credit note reference: ${s.creditNote}.`,
      "There is nothing more to pay and no further charge will be made.",
    ),
    teamCancelledBody: (s) => sentences(
      s.refund
        ? `${s.greeting} We have cancelled your booking at ${s.house}, from ${s.checkIn} to ${s.checkOut}, and are refunding ${s.refund} ${enTo(s.cards)} within 5 to 10 working days, depending on your bank.`
        : `${s.greeting} We have cancelled your booking at ${s.house}, from ${s.checkIn} to ${s.checkOut}.`,
      s.creditNote && `Credit note reference: ${s.creditNote}.`,
      "There is nothing more to pay and no further charge will be made. If you have any questions, talk to your concierge.",
    ),
    cardUpdatedSubject: "Card updated for the second part",
    cardUpdatedBody: (l, d) => `Card updated. The second part will be charged to card ••••${l} on ${d}.`,
  },
  fr: {
    productName: "Payer en deux parties",
    hello: (n) => (n ? `Bonjour ${n},` : "Bonjour,"),
    deadline: (d, t) => `${d} à ${t}, heure de Lisbonne`,
    amountLabel: "Seconde partie", chargeDateLabel: "Date du débit", cardLabel: "Carte",
    payByLabel: "À payer au plus tard le", freeCancelLabel: "Annulation gratuite jusqu'au",
    totalPaidLabel: "Total payé", refundLabel: "Remboursement",
    planTitle: "Votre plan de paiement",
    planToday: (a, l) => (l ? `Payé aujourd'hui : ${a} sur la carte ••••${l}` : `Payé aujourd'hui : ${a}`),
    planLater: (d, a) => `Le ${d} : ${a}, débités automatiquement sur la même carte`,
    planDeadline: (dl) => `Vous pouvez annuler sans frais jusqu'au ${dl}.`,
    planNote: "Rien à faire d'ici là. Nous vous le rappelons une semaine avant et la veille.",
    planNoteManage: "Si vous préférez payer plus tôt, utiliser une autre carte ou annuler, un clic suffit.",
    planCta: "Gérer le paiement",
    noWithdrawal: "Réservation d'hébergement à dates fixes : le droit de rétractation de 14 jours ne s'applique pas. La politique d'annulation de votre tarif s'applique.",
    remind7Subject: (h) => `La seconde partie de votre séjour à ${h}, dans une semaine`,
    remindSubjectDated: (h, d) => `La seconde partie de votre séjour à ${h}, le ${d}`,
    remind7Headline: (d, a) => `Le ${d}, ${a}.`,
    remind1Subject: (h) => `Demain, nous débitons la seconde partie de votre séjour à ${h}`,
    remind1Headline: (a) => `Demain, ${a}.`,
    remindBody: (s) => `${s.greeting} comme convenu, le ${s.date} nous débiterons ${s.amount} sur la ${frCard(s.last4)}, la seconde et dernière partie de votre séjour à ${s.house}, du ${s.checkIn} au ${s.checkOut}. Vous n'avez rien à faire. Si vous préférez utiliser une autre carte, ou payer dès maintenant, un clic suffit.`,
    cardExpires: (l, d) => `La carte ••••${l} expire avant le ${d}. Mettez-la à jour en une minute pour que le débit se fasse sans souci.`,
    limitTip: "Si votre carte a un plafond journalier, vérifiez qu'il couvre ce montant ce jour-là.",
    failedSubject: "Nous n'avons pas pu débiter la seconde partie de votre séjour",
    failedHeadline: "Votre banque n'a pas accepté la seconde partie.",
    failedHeadlineAuth: "Votre banque demande une confirmation.",
    failedBody: (s) => `${s.greeting} aujourd'hui, nous avons tenté de débiter ${s.amount} sur la ${frCard(s.last4)} et votre banque ne l'a pas accepté. Cela arrive souvent à cause d'un plafond de carte, d'une date d'expiration ou d'une confirmation demandée par la banque. Vous pouvez payer avec la même carte ou une autre grâce au bouton ci-dessous, sans vous connecter.`,
    failedBodyAuth: (s) => `${s.greeting} votre banque vous demande de confirmer le débit de ${s.amount} sur la ${frCard(s.last4)}. Il suffit de confirmer avec la même carte grâce au bouton ci-dessous. Cela prend une minute.`,
    failedBodyHard: (s) => `${s.greeting} aujourd'hui, nous avons tenté de débiter ${s.amount} sur la ${frCard(s.last4)} et votre banque ne l'a pas accepté. Pour finaliser, utilisez une autre carte grâce au bouton ci-dessous, sans vous connecter.`,
    deadlineSoft: (dl, r) => `Pour conserver votre réservation, le paiement doit être effectué au plus tard le ${dl}. Nous réessaierons aussi ${joinList(r.map((x) => `le ${x}`), "et")}.`,
    deadlineHard: (dl) => `Pour conserver votre réservation, le paiement doit être effectué au plus tard le ${dl}. Dans ce cas, seul votre clic règle la situation : nous ne réessaierons pas de nous-mêmes.`,
    consequence: (p) => p
      ? `Si ce n'est pas possible d'ici là, la réservation est annulée et nous vous remboursons les ${p} déjà payés, car vous êtes encore dans la période d'annulation gratuite.`
      : "Si ce n'est pas possible d'ici là, la réservation est annulée et nous vous remboursons ce que vous avez déjà payé, car vous êtes encore dans la période d'annulation gratuite.",
    failedCta: "Payer ou changer de carte",
    failedCtaHard: "Utiliser une autre carte",
    failedCtaAuth: (l) => (l ? `Confirmer avec la carte ••••${l}` : "Confirmer avec la même carte"),
    help: "Si vous avez besoin d'aide, utilisez le bouton « J'ai besoin d'aide » sur la même page. Pour votre sécurité, n'envoyez jamais les données de votre carte par email ou message.",
    lastCallSubject: (h) => `Demain, fin du délai pour la seconde partie de votre séjour à ${h}`,
    lastCallHeadline: "Le délai se termine demain.",
    lastCallBody: (g, a, dl) => `${g} nous n'avons pas encore reçu ${a} et le délai se termine demain, le ${dl}. Payer prend deux minutes. Si vous ne pouvez plus venir, vous n'avez rien à faire : la réservation est annulée et nous vous remboursons ce que vous avez payé.`,
    paidSubject: (h) => `Votre séjour à ${h} est entièrement payé`,
    paidHeadline: (ci) => `Tout est réglé. Rendez-vous le ${ci}.`,
    paidBody: (s) => `${s.greeting} nous avons reçu la seconde partie, ${s.amount}, sur la ${frCard(s.last4)}. Votre séjour à ${s.house}, du ${s.checkIn} au ${s.checkOut}, est entièrement payé. ${s.invoiceLine} D'ici là, votre concierge est à un message de vous.`,
    invoiceAfterStay: "La facture est émise après le séjour.",
    invoiceSeparate: "La facture suit dans un email séparé.",
    cancelledSubject: (h) => `Votre réservation à ${h} a été annulée`,
    cancelledHeadline: "Votre réservation a été annulée.",
    cancelledBody: (s) => sentences(
      `${s.greeting} nous n'avons pas reçu la seconde partie de votre séjour à ${s.house} ${s.deadline ? `avant le ${s.deadline}` : "dans le délai prévu"}, la réservation a donc été annulée, comme nous l'avions expliqué.`,
      s.refund && `Les ${s.refund} que vous avez payés reviennent ${frTo(s.cards)} sous 5 à 10 jours ouvrés, selon votre banque.`,
      s.creditNote && `Référence de l'avoir : ${s.creditNote}.`,
      "Il n'y a plus rien à payer.",
    ),
    rebook: "Si vous souhaitez toujours venir, les dates sont peut-être encore libres. Réservez à nouveau ou parlez à votre concierge.",
    guestCancelledSubject: (h) => `Annulation confirmée : ${h}`,
    guestCancelledHeadline: "Annulation confirmée.",
    guestCancelledBody: (s) => sentences(
      `${s.greeting} nous avons annulé votre réservation à ${s.house}, du ${s.checkIn} au ${s.checkOut}, comme demandé, dans la période d'annulation gratuite.`,
      s.refund && `Nous remboursons ${s.refund} ${frTo(s.cards)} sous 5 à 10 jours ouvrés.`,
      s.creditNote && `Référence de l'avoir : ${s.creditNote}.`,
      "Il n'y a plus rien à payer et aucun autre débit ne sera effectué.",
    ),
    teamCancelledBody: (s) => sentences(
      s.refund
        ? `${s.greeting} nous avons annulé votre réservation à ${s.house}, du ${s.checkIn} au ${s.checkOut}, et nous remboursons ${s.refund} ${frTo(s.cards)} sous 5 à 10 jours ouvrés, selon votre banque.`
        : `${s.greeting} nous avons annulé votre réservation à ${s.house}, du ${s.checkIn} au ${s.checkOut}.`,
      s.creditNote && `Référence de l'avoir : ${s.creditNote}.`,
      "Il n'y a plus rien à payer et aucun autre débit ne sera effectué. Pour toute question, parlez à votre concierge.",
    ),
    cardUpdatedSubject: "Carte mise à jour pour la seconde partie",
    cardUpdatedBody: (l, d) => `Carte mise à jour. La seconde partie sera débitée sur la carte ••••${l} le ${d}.`,
  },
  es: {
    productName: "Pagar en dos partes",
    hello: (n) => (n ? `Hola ${n}:` : "Hola:"),
    deadline: (d, t) => `${d} a ${esAt(t)} ${t}, hora de Lisboa`,
    amountLabel: "Segunda parte", chargeDateLabel: "Fecha del cargo", cardLabel: "Tarjeta",
    payByLabel: "Pagar a más tardar el", freeCancelLabel: "Cancelación gratuita hasta el",
    totalPaidLabel: "Total pagado", refundLabel: "Reembolso",
    planTitle: "Su plan de pago",
    planToday: (a, l) => (l ? `Pagado hoy: ${a} con la tarjeta ••••${l}` : `Pagado hoy: ${a}`),
    planLater: (d, a) => `El ${d}: ${a}, cargados automáticamente en la misma tarjeta`,
    planDeadline: (dl) => `Puede cancelar sin coste hasta el ${dl}.`,
    planNote: "Nada que hacer hasta entonces. Se lo recordamos una semana antes y la víspera.",
    planNoteManage: "Si prefiere pagar antes, usar otra tarjeta o cancelar, basta un clic.",
    planCta: "Gestionar el pago",
    noWithdrawal: "Reserva de alojamiento con fechas fijas: no se aplica el derecho de desistimiento de 14 días. Se aplica la política de cancelación de su tarifa.",
    remind7Subject: (h) => `La segunda parte de su estancia en ${h}, dentro de una semana`,
    remindSubjectDated: (h, d) => `La segunda parte de su estancia en ${h}, el ${d}`,
    remind7Headline: (d, a) => `El ${d}, ${a}.`,
    remind1Subject: (h) => `Mañana cargamos la segunda parte de su estancia en ${h}`,
    remind1Headline: (a) => `Mañana, ${a}.`,
    remindBody: (s) => `${s.greeting} tal como acordamos, el ${s.date} cargaremos ${s.amount} en la ${esCard(s.last4)}, la segunda y última parte de su estancia en ${s.house}, del ${s.checkIn} al ${s.checkOut}. No tiene que hacer nada. Si prefiere usar otra tarjeta, o pagar ya, basta un clic.`,
    cardExpires: (l, d) => `La tarjeta ••••${l} caduca antes del ${d}. Actualícela en un minuto para que el cargo se haga sin contratiempos.`,
    limitTip: "Si su tarjeta tiene un límite diario, compruebe que cubre este importe ese día.",
    failedSubject: "No hemos podido cargar la segunda parte de su estancia",
    failedHeadline: "Su banco no ha aceptado la segunda parte.",
    failedHeadlineAuth: "Su banco pide una confirmación.",
    failedBody: (s) => `${s.greeting} hoy hemos intentado cargar ${s.amount} en la ${esCard(s.last4)} y el banco no lo ha aceptado. Suele ocurrir por el límite de la tarjeta, la fecha de caducidad o una confirmación que pide el banco. Puede pagar con la misma tarjeta o con otra en el botón de abajo, sin necesidad de iniciar sesión.`,
    failedBodyAuth: (s) => `${s.greeting} su banco le pide una confirmación para el cargo de ${s.amount} en la ${esCard(s.last4)}. Basta con confirmar con la misma tarjeta en el botón de abajo. Tarda un minuto.`,
    failedBodyHard: (s) => `${s.greeting} hoy hemos intentado cargar ${s.amount} en la ${esCard(s.last4)} y el banco no lo ha aceptado. Para completarlo, use otra tarjeta en el botón de abajo, sin necesidad de iniciar sesión.`,
    deadlineSoft: (dl, r) => `Para mantener la reserva, el pago debe realizarse a más tardar el ${dl}. También volveremos a intentarlo ${joinList(r.map((x) => `el ${x}`), "y")}.`,
    deadlineHard: (dl) => `Para mantener la reserva, el pago debe realizarse a más tardar el ${dl}. En este caso solo su clic lo resuelve: no volveremos a intentarlo por nuestra cuenta.`,
    consequence: (p) => p
      ? `Si para entonces no es posible, la reserva se cancela y le devolvemos los ${p} que ya pagó, porque todavía está dentro del plazo de cancelación gratuita.`
      : "Si para entonces no es posible, la reserva se cancela y le devolvemos lo que ya pagó, porque todavía está dentro del plazo de cancelación gratuita.",
    failedCta: "Pagar o cambiar de tarjeta",
    failedCtaHard: "Usar otra tarjeta",
    failedCtaAuth: (l) => (l ? `Confirmar con la tarjeta ••••${l}` : "Confirmar con la misma tarjeta"),
    help: "Si necesita ayuda, use el botón «Necesito ayuda» en la misma página. Por su seguridad, nunca envíe datos de la tarjeta por email o mensaje.",
    lastCallSubject: (h) => `Mañana termina el plazo de la segunda parte de su estancia en ${h}`,
    lastCallHeadline: "El plazo termina mañana.",
    lastCallBody: (g, a, dl) => `${g} todavía no hemos recibido ${a} y el plazo termina mañana, el ${dl}. Pagar lleva dos minutos. Si ya no puede venir, no tiene que hacer nada: la reserva se cancela y le devolvemos lo que pagó.`,
    paidSubject: (h) => `Su estancia en ${h} está pagada por completo`,
    paidHeadline: (ci) => `Todo pagado. Hasta el ${ci}.`,
    paidBody: (s) => `${s.greeting} hemos recibido la segunda parte, ${s.amount}, en la ${esCard(s.last4)}. Su estancia en ${s.house}, del ${s.checkIn} al ${s.checkOut}, está pagada por completo. ${s.invoiceLine} Hasta entonces, su concierge está a un mensaje de distancia.`,
    invoiceAfterStay: "La factura se emite después de la estancia.",
    invoiceSeparate: "La factura le llegará en un email aparte.",
    cancelledSubject: (h) => `Su reserva en ${h} ha sido cancelada`,
    cancelledHeadline: "Su reserva ha sido cancelada.",
    cancelledBody: (s) => sentences(
      `${s.greeting} no hemos recibido la segunda parte de su estancia en ${s.house} ${s.deadline ? `antes del ${s.deadline}` : "dentro del plazo"}, por lo que la reserva se ha cancelado, como le explicamos.`,
      s.refund && `Los ${s.refund} que pagó vuelven ${esTo(s.cards)} en un plazo de 5 a 10 días hábiles, según su banco.`,
      s.creditNote && `Referencia de la factura rectificativa: ${s.creditNote}.`,
      "No hay nada más que pagar.",
    ),
    rebook: "Si todavía quiere venir, puede que las fechas sigan libres. Reserve de nuevo o hable con su concierge.",
    guestCancelledSubject: (h) => `Cancelación confirmada: ${h}`,
    guestCancelledHeadline: "Cancelación confirmada.",
    guestCancelledBody: (s) => sentences(
      `${s.greeting} hemos cancelado su reserva en ${s.house}, del ${s.checkIn} al ${s.checkOut}, tal como pidió, dentro del plazo de cancelación gratuita.`,
      s.refund && `Le devolvemos ${s.refund} ${esTo(s.cards)} en un plazo de 5 a 10 días hábiles.`,
      s.creditNote && `Referencia de la factura rectificativa: ${s.creditNote}.`,
      "No hay nada más que pagar y no se hará ningún otro cargo.",
    ),
    teamCancelledBody: (s) => sentences(
      s.refund
        ? `${s.greeting} hemos cancelado su reserva en ${s.house}, del ${s.checkIn} al ${s.checkOut}, y le devolvemos ${s.refund} ${esTo(s.cards)} en un plazo de 5 a 10 días hábiles, según su banco.`
        : `${s.greeting} hemos cancelado su reserva en ${s.house}, del ${s.checkIn} al ${s.checkOut}.`,
      s.creditNote && `Referencia de la factura rectificativa: ${s.creditNote}.`,
      "No hay nada más que pagar y no se hará ningún otro cargo. Si tiene alguna pregunta, hable con su concierge.",
    ),
    cardUpdatedSubject: "Tarjeta actualizada para la segunda parte",
    cardUpdatedBody: (l, d) => `Tarjeta actualizada. La segunda parte se cargará en la tarjeta ••••${l} el ${d}.`,
  },
  it: {
    productName: "Pagare in due parti",
    hello: (n) => (n ? `Buongiorno ${n},` : "Buongiorno,"),
    deadline: (d, t) => `${d} alle ${t}, ora di Lisbona`,
    amountLabel: "Seconda parte", chargeDateLabel: "Data dell'addebito", cardLabel: "Carta",
    payByLabel: "Termine di pagamento", freeCancelLabel: "Termine della cancellazione gratuita",
    totalPaidLabel: "Totale pagato", refundLabel: "Rimborso",
    planTitle: "Il suo piano di pagamento",
    planToday: (a, l) => (l ? `Pagato oggi: ${a} sulla carta ••••${l}` : `Pagato oggi: ${a}`),
    planLater: (d, a) => `${itArt("il", d, true)}: ${a}, addebitati automaticamente sulla stessa carta`,
    planDeadline: (dl) => `Può cancellare senza costi fino ${itArt("al", dl)}.`,
    planNote: "Niente da fare fino ad allora. Glielo ricordiamo una settimana prima e il giorno prima.",
    planNoteManage: "Se preferisce pagare prima, usare un'altra carta o cancellare, basta un clic.",
    planCta: "Gestire il pagamento",
    noWithdrawal: "Prenotazione di alloggio a date fisse: il diritto di recesso di 14 giorni non si applica. Si applica la politica di cancellazione della sua tariffa.",
    remind7Subject: (h) => `La seconda parte del suo soggiorno a ${h}, tra una settimana`,
    remindSubjectDated: (h, d) => `La seconda parte del suo soggiorno a ${h}, ${itArt("il", d)}`,
    remind7Headline: (d, a) => `${itArt("il", d, true)}, ${a}.`,
    remind1Subject: (h) => `Domani addebitiamo la seconda parte del suo soggiorno a ${h}`,
    remind1Headline: (a) => `Domani, ${a}.`,
    remindBody: (s) => `${s.greeting} come concordato, ${itArt("il", s.date)} addebiteremo ${s.amount} sulla ${itCard(s.last4)}, la seconda e ultima parte del suo soggiorno a ${s.house}, ${itArt("dal", s.checkIn)} ${itArt("al", s.checkOut)}. Non deve fare nulla. Se preferisce usare un'altra carta, o pagare subito, basta un clic.`,
    cardExpires: (l, d) => `La carta ••••${l} scade prima ${itArt("del", d)}. La aggiorni in un minuto perché l'addebito vada a buon fine senza intoppi.`,
    limitTip: "Se la sua carta ha un limite giornaliero, verifichi che copra questo importo quel giorno.",
    failedSubject: "Non siamo riusciti ad addebitare la seconda parte del suo soggiorno",
    failedHeadline: "La sua banca non ha accettato la seconda parte.",
    failedHeadlineAuth: "La sua banca chiede una conferma.",
    failedBody: (s) => `${s.greeting} oggi abbiamo provato ad addebitare ${s.amount} sulla ${itCard(s.last4)} e la banca non l'ha accettato. Succede spesso per il limite della carta, la scadenza o una conferma richiesta dalla banca. Può pagare con la stessa carta o con un'altra dal pulsante qui sotto, senza dover accedere.`,
    failedBodyAuth: (s) => `${s.greeting} la sua banca le chiede una conferma per l'addebito di ${s.amount} sulla ${itCard(s.last4)}. Basta confermare con la stessa carta dal pulsante qui sotto. Ci vuole un minuto.`,
    failedBodyHard: (s) => `${s.greeting} oggi abbiamo provato ad addebitare ${s.amount} sulla ${itCard(s.last4)} e la banca non l'ha accettato. Per completare, usi un'altra carta dal pulsante qui sotto, senza dover accedere.`,
    deadlineSoft: (dl, r) => `Per mantenere la prenotazione, il pagamento deve essere effettuato entro ${itArt("il", dl)}. Proveremo anche di nuovo ${joinList(r.map((x) => itArt("il", x)), "e")}.`,
    deadlineHard: (dl) => `Per mantenere la prenotazione, il pagamento deve essere effettuato entro ${itArt("il", dl)}. In questo caso solo il suo clic risolve: non riproveremo da soli.`,
    consequence: (p) => p
      ? `Se entro allora non sarà possibile, la prenotazione viene cancellata e le rimborsiamo i ${p} già pagati, perché è ancora nel periodo di cancellazione gratuita.`
      : "Se entro allora non sarà possibile, la prenotazione viene cancellata e le rimborsiamo quanto ha già pagato, perché è ancora nel periodo di cancellazione gratuita.",
    failedCta: "Pagare o cambiare carta",
    failedCtaHard: "Usare un'altra carta",
    failedCtaAuth: (l) => (l ? `Confermare con la carta ••••${l}` : "Confermare con la stessa carta"),
    help: "Se ha bisogno di aiuto, usi il pulsante «Ho bisogno di aiuto» nella stessa pagina. Per la sua sicurezza, non invii mai i dati della carta via email o messaggio.",
    lastCallSubject: (h) => `Domani scade il termine per la seconda parte del suo soggiorno a ${h}`,
    lastCallHeadline: "Il termine scade domani.",
    lastCallBody: (g, a, dl) => `${g} non abbiamo ancora ricevuto ${a} e il termine scade domani, ${itArt("il", dl)}. Pagare richiede due minuti. Se non può più venire, non deve fare nulla: la prenotazione viene cancellata e le rimborsiamo quanto ha pagato.`,
    paidSubject: (h) => `Il suo soggiorno a ${h} è interamente pagato`,
    paidHeadline: (ci) => `Tutto pagato. Ci vediamo ${itArt("il", ci)}.`,
    paidBody: (s) => `${s.greeting} abbiamo ricevuto la seconda parte, ${s.amount}, sulla ${itCard(s.last4)}. Il suo soggiorno a ${s.house}, ${itArt("dal", s.checkIn)} ${itArt("al", s.checkOut)}, è interamente pagato. ${s.invoiceLine} Fino ad allora, il suo concierge è a un messaggio di distanza.`,
    invoiceAfterStay: "La fattura viene emessa dopo il soggiorno.",
    invoiceSeparate: "La fattura arriva in un'email separata.",
    cancelledSubject: (h) => `La sua prenotazione a ${h} è stata cancellata`,
    cancelledHeadline: "La sua prenotazione è stata cancellata.",
    cancelledBody: (s) => sentences(
      `${s.greeting} non abbiamo ricevuto la seconda parte del suo soggiorno a ${s.house} ${s.deadline ? `entro ${itArt("il", s.deadline)}` : "entro il termine"}, quindi la prenotazione è stata cancellata, come le avevamo spiegato.`,
      s.refund && `I ${s.refund} che ha pagato tornano ${itTo(s.cards)} entro 5-10 giorni lavorativi, a seconda della banca.`,
      s.creditNote && `Riferimento della nota di credito: ${s.creditNote}.`,
      "Non c'è altro da pagare.",
    ),
    rebook: "Se desidera ancora venire, le date potrebbero essere ancora libere. Prenoti di nuovo o parli con il suo concierge.",
    guestCancelledSubject: (h) => `Cancellazione confermata: ${h}`,
    guestCancelledHeadline: "Cancellazione confermata.",
    guestCancelledBody: (s) => sentences(
      `${s.greeting} abbiamo cancellato la sua prenotazione a ${s.house}, ${itArt("dal", s.checkIn)} ${itArt("al", s.checkOut)}, come richiesto, nel periodo di cancellazione gratuita.`,
      s.refund && `Le rimborsiamo ${s.refund} ${itTo(s.cards)} entro 5-10 giorni lavorativi.`,
      s.creditNote && `Riferimento della nota di credito: ${s.creditNote}.`,
      "Non c'è altro da pagare e non verrà effettuato nessun altro addebito.",
    ),
    teamCancelledBody: (s) => sentences(
      s.refund
        ? `${s.greeting} abbiamo cancellato la sua prenotazione a ${s.house}, ${itArt("dal", s.checkIn)} ${itArt("al", s.checkOut)}, e le rimborsiamo ${s.refund} ${itTo(s.cards)} entro 5-10 giorni lavorativi, a seconda della banca.`
        : `${s.greeting} abbiamo cancellato la sua prenotazione a ${s.house}, ${itArt("dal", s.checkIn)} ${itArt("al", s.checkOut)}.`,
      s.creditNote && `Riferimento della nota di credito: ${s.creditNote}.`,
      "Non c'è altro da pagare e non verrà effettuato nessun altro addebito. Per qualsiasi domanda, parli con il suo concierge.",
    ),
    cardUpdatedSubject: "Carta aggiornata per la seconda parte",
    cardUpdatedBody: (l, d) => `Carta aggiornata. La seconda parte sarà addebitata sulla carta ••••${l} ${itArt("il", d)}.`,
  },
  de: {
    productName: "In zwei Teilen zahlen",
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    deadline: (d, t) => `${d} um ${t} Uhr (Lissabonner Zeit)`,
    amountLabel: "Zweiter Teil", chargeDateLabel: "Abbuchung am", cardLabel: "Karte",
    payByLabel: "Zahlen bis zum", freeCancelLabel: "Kostenlose Stornierung bis zum",
    totalPaidLabel: "Insgesamt bezahlt", refundLabel: "Erstattung",
    planTitle: "Ihr Zahlungsplan",
    planToday: (a, l) => (l ? `Heute bezahlt: ${a} mit der Karte ••••${l}` : `Heute bezahlt: ${a}`),
    planLater: (d, a) => `Am ${d}: ${a}, automatisch von derselben Karte abgebucht`,
    planDeadline: (dl) => `Sie können bis zum ${dl} kostenlos stornieren.`,
    planNote: "Bis dahin ist nichts zu tun. Wir erinnern Sie eine Woche vorher und am Vortag.",
    planNoteManage: "Wenn Sie lieber früher zahlen, eine andere Karte verwenden oder stornieren möchten, genügt ein Klick.",
    planCta: "Zahlung verwalten",
    noWithdrawal: "Unterkunftsbuchung mit festen Daten: Das 14-tägige Widerrufsrecht gilt nicht. Es gelten die Stornobedingungen Ihres Tarifs.",
    remind7Subject: (h) => `Der zweite Teil Ihres Aufenthalts in ${h}, in einer Woche`,
    remindSubjectDated: (h, d) => `Der zweite Teil Ihres Aufenthalts in ${h}, am ${d}`,
    remind7Headline: (d, a) => `Am ${d}: ${a}.`,
    remind1Subject: (h) => `Morgen buchen wir den zweiten Teil Ihres Aufenthalts in ${h} ab`,
    remind1Headline: (a) => `Morgen: ${a}.`,
    remindBody: (s) => `${s.greeting} wie vereinbart buchen wir ${s.amount} am ${s.date} ${deFrom(s.last4)} ab, den zweiten und letzten Teil Ihres Aufenthalts in ${s.house} vom ${s.checkIn} bis ${s.checkOut}. Sie müssen nichts tun. Wenn Sie lieber eine andere Karte verwenden oder jetzt schon zahlen möchten, genügt ein Klick.`,
    cardExpires: (l, d) => `Die Karte ••••${l} läuft vor dem ${d} ab. Aktualisieren Sie sie in einer Minute, damit die Abbuchung reibungslos klappt.`,
    limitTip: "Falls Ihre Karte ein Tageslimit hat, prüfen Sie bitte, ob es diesen Betrag an diesem Tag abdeckt.",
    failedSubject: "Wir konnten den zweiten Teil Ihres Aufenthalts nicht abbuchen",
    failedHeadline: "Ihre Bank hat den zweiten Teil nicht akzeptiert.",
    failedHeadlineAuth: "Ihre Bank bittet um eine Bestätigung.",
    failedBody: (s) => `${s.greeting} heute haben wir versucht, ${s.amount} ${deFrom(s.last4)} abzubuchen, und Ihre Bank hat die Zahlung nicht akzeptiert. Das passiert häufig wegen eines Kartenlimits, des Ablaufdatums oder einer Bestätigung, die Ihre Bank verlangt. Sie können über die Schaltfläche unten mit derselben oder einer anderen Karte zahlen, ohne Anmeldung.`,
    failedBodyAuth: (s) => `${s.greeting} Ihre Bank bittet Sie, die Abbuchung von ${s.amount} ${deFrom(s.last4)} zu bestätigen. Bestätigen Sie einfach über die Schaltfläche unten mit derselben Karte. Das dauert eine Minute.`,
    failedBodyHard: (s) => `${s.greeting} heute haben wir versucht, ${s.amount} ${deFrom(s.last4)} abzubuchen, und Ihre Bank hat die Zahlung nicht akzeptiert. Um abzuschließen, verwenden Sie bitte über die Schaltfläche unten eine andere Karte, ohne Anmeldung.`,
    deadlineSoft: (dl, r) => `Damit Ihre Buchung bestehen bleibt, muss die Zahlung bis zum ${dl} erfolgt sein. Wir versuchen es außerdem ${joinList(r.map((x) => `am ${x}`), "und")} erneut.`,
    deadlineHard: (dl) => `Damit Ihre Buchung bestehen bleibt, muss die Zahlung bis zum ${dl} erfolgt sein. In diesem Fall hilft nur Ihr Klick: Wir versuchen es nicht von selbst erneut.`,
    consequence: (p) => p
      ? `Ist das bis dahin nicht möglich, wird die Buchung storniert und wir erstatten Ihnen die bereits bezahlten ${p}, da Sie sich noch im Zeitraum der kostenlosen Stornierung befinden.`
      : "Ist das bis dahin nicht möglich, wird die Buchung storniert und wir erstatten Ihnen den bereits bezahlten Betrag, da Sie sich noch im Zeitraum der kostenlosen Stornierung befinden.",
    failedCta: "Zahlen oder Karte wechseln",
    failedCtaHard: "Andere Karte verwenden",
    failedCtaAuth: (l) => (l ? `Mit Karte ••••${l} bestätigen` : "Mit derselben Karte bestätigen"),
    help: "Wenn Sie Hilfe brauchen, nutzen Sie die Schaltfläche „Ich brauche Hilfe“ auf derselben Seite. Senden Sie zu Ihrer Sicherheit niemals Kartendaten per E-Mail oder Nachricht.",
    lastCallSubject: (h) => `Morgen endet die Frist für den zweiten Teil Ihres Aufenthalts in ${h}`,
    lastCallHeadline: "Die Frist endet morgen.",
    lastCallBody: (g, a, dl) => `${g} wir haben ${a} noch nicht erhalten, und die Frist endet morgen, am ${dl}. Die Zahlung dauert zwei Minuten. Wenn Sie nicht mehr kommen können, müssen Sie nichts tun: Die Buchung wird storniert und wir erstatten Ihnen, was Sie bezahlt haben.`,
    paidSubject: (h) => `Ihr Aufenthalt in ${h} ist vollständig bezahlt`,
    paidHeadline: (ci) => `Alles bezahlt. Bis zum ${ci}.`,
    paidBody: (s) => `${s.greeting} wir haben den zweiten Teil in Höhe von ${s.amount} ${deFrom(s.last4)} erhalten. Ihr Aufenthalt in ${s.house} vom ${s.checkIn} bis ${s.checkOut} ist vollständig bezahlt. ${s.invoiceLine} Bis dahin ist Ihr Concierge nur eine Nachricht entfernt.`,
    invoiceAfterStay: "Die Rechnung wird nach dem Aufenthalt ausgestellt.",
    invoiceSeparate: "Die Rechnung folgt in einer separaten E-Mail.",
    cancelledSubject: (h) => `Ihre Buchung in ${h} wurde storniert`,
    cancelledHeadline: "Ihre Buchung wurde storniert.",
    cancelledBody: (s) => sentences(
      `${s.greeting} wir haben den zweiten Teil Ihres Aufenthalts in ${s.house} ${s.deadline ? `nicht bis zum ${s.deadline}` : "nicht fristgerecht"} erhalten, daher wurde die Buchung wie angekündigt storniert.`,
      s.refund && `Die bezahlten ${s.refund} gehen innerhalb von 5 bis 10 Werktagen, je nach Bank, ${deTo(s.cards)} zurück.`,
      s.creditNote && `Referenz der Gutschrift: ${s.creditNote}.`,
      "Es ist nichts mehr zu zahlen.",
    ),
    rebook: "Wenn Sie trotzdem kommen möchten, sind die Daten vielleicht noch frei. Buchen Sie erneut oder sprechen Sie mit Ihrem Concierge.",
    guestCancelledSubject: (h) => `Stornierung bestätigt: ${h}`,
    guestCancelledHeadline: "Stornierung bestätigt.",
    guestCancelledBody: (s) => sentences(
      `${s.greeting} wir haben Ihre Buchung in ${s.house} vom ${s.checkIn} bis ${s.checkOut} wie gewünscht innerhalb der kostenlosen Stornierungsfrist storniert.`,
      s.refund && `Wir erstatten ${s.refund} innerhalb von 5 bis 10 Werktagen ${deTo(s.cards)}.`,
      s.creditNote && `Referenz der Gutschrift: ${s.creditNote}.`,
      "Es ist nichts mehr zu zahlen, und es erfolgt keine weitere Abbuchung.",
    ),
    teamCancelledBody: (s) => sentences(
      s.refund
        ? `${s.greeting} wir haben Ihre Buchung in ${s.house} vom ${s.checkIn} bis ${s.checkOut} storniert und erstatten ${s.refund} innerhalb von 5 bis 10 Werktagen, je nach Bank, ${deTo(s.cards)}.`
        : `${s.greeting} wir haben Ihre Buchung in ${s.house} vom ${s.checkIn} bis ${s.checkOut} storniert.`,
      s.creditNote && `Referenz der Gutschrift: ${s.creditNote}.`,
      "Es ist nichts mehr zu zahlen, und es erfolgt keine weitere Abbuchung. Bei Fragen sprechen Sie mit Ihrem Concierge.",
    ),
    cardUpdatedSubject: "Karte für den zweiten Teil aktualisiert",
    cardUpdatedBody: (l, d) => `Karte aktualisiert. Der zweite Teil wird am ${d} von der Karte ••••${l} abgebucht.`,
  },
  nl: {
    productName: "Betalen in twee delen",
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    deadline: (d, t) => `${d} om ${t} uur (Lissabonse tijd)`,
    amountLabel: "Tweede deel", chargeDateLabel: "Datum afschrijving", cardLabel: "Kaart",
    payByLabel: "Uiterlijk betalen op", freeCancelLabel: "Gratis annuleren tot",
    totalPaidLabel: "Totaal betaald", refundLabel: "Terugbetaling",
    planTitle: "Uw betaalplan",
    planToday: (a, l) => (l ? `Vandaag betaald: ${a} met kaart ••••${l}` : `Vandaag betaald: ${a}`),
    planLater: (d, a) => `Op ${d}: ${a}, automatisch afgeschreven van dezelfde kaart`,
    planDeadline: (dl) => `U kunt kosteloos annuleren tot ${dl}.`,
    planNote: "Tot dan hoeft u niets te doen. We herinneren u een week van tevoren en de dag ervoor.",
    planNoteManage: "Wilt u liever eerder betalen, een andere kaart gebruiken of annuleren? Eén klik is genoeg.",
    planCta: "Betaling beheren",
    noWithdrawal: "Boeking van accommodatie op vaste data: het herroepingsrecht van 14 dagen geldt niet. Het annuleringsbeleid van uw tarief is van toepassing.",
    remind7Subject: (h) => `Het tweede deel van uw verblijf in ${h}, over een week`,
    remindSubjectDated: (h, d) => `Het tweede deel van uw verblijf in ${h}, op ${d}`,
    remind7Headline: (d, a) => `Op ${d}: ${a}.`,
    remind1Subject: (h) => `Morgen schrijven we het tweede deel van uw verblijf in ${h} af`,
    remind1Headline: (a) => `Morgen: ${a}.`,
    remindBody: (s) => `${s.greeting} zoals afgesproken schrijven we ${s.amount} op ${s.date} af van ${nlCard(s.last4)}, het tweede en laatste deel van uw verblijf in ${s.house}, van ${s.checkIn} tot ${s.checkOut}. U hoeft niets te doen. Wilt u liever een andere kaart gebruiken of nu al betalen? Eén klik is genoeg.`,
    cardExpires: (l, d) => `Kaart ••••${l} verloopt vóór ${d}. Werk hem in een minuut bij, zodat de afschrijving vlot verloopt.`,
    limitTip: "Heeft uw kaart een daglimiet? Controleer dan of die dit bedrag op die dag dekt.",
    failedSubject: "We konden het tweede deel van uw verblijf niet afschrijven",
    failedHeadline: "Uw bank heeft het tweede deel niet geaccepteerd.",
    failedHeadlineAuth: "Uw bank vraagt om een bevestiging.",
    failedBody: (s) => `${s.greeting} vandaag probeerden we ${s.amount} af te schrijven van ${nlCard(s.last4)} en uw bank heeft dit niet geaccepteerd. Dat gebeurt vaak door een kaartlimiet, de vervaldatum of een bevestiging die uw bank vraagt. U kunt met dezelfde of een andere kaart betalen via de knop hieronder, zonder in te loggen.`,
    failedBodyAuth: (s) => `${s.greeting} uw bank vraagt u de afschrijving van ${s.amount} van ${nlCard(s.last4)} te bevestigen. Bevestig gewoon met dezelfde kaart via de knop hieronder. Het duurt een minuut.`,
    failedBodyHard: (s) => `${s.greeting} vandaag probeerden we ${s.amount} af te schrijven van ${nlCard(s.last4)} en uw bank heeft dit niet geaccepteerd. Gebruik om af te ronden een andere kaart via de knop hieronder, zonder in te loggen.`,
    deadlineSoft: (dl, r) => `Om uw boeking te behouden, moet de betaling uiterlijk ${dl} gedaan zijn. We proberen het ook opnieuw ${joinList(r.map((x) => `op ${x}`), "en")}.`,
    deadlineHard: (dl) => `Om uw boeking te behouden, moet de betaling uiterlijk ${dl} gedaan zijn. In dit geval lost alleen uw klik het op: we proberen het niet zelf opnieuw.`,
    consequence: (p) => p
      ? `Lukt dat tot dan niet, dan wordt de boeking geannuleerd en betalen we de ${p} die u al betaalde terug, omdat u nog binnen de periode van gratis annuleren valt.`
      : "Lukt dat tot dan niet, dan wordt de boeking geannuleerd en betalen we terug wat u al betaalde, omdat u nog binnen de periode van gratis annuleren valt.",
    failedCta: "Betalen of kaart wijzigen",
    failedCtaHard: "Andere kaart gebruiken",
    failedCtaAuth: (l) => (l ? `Bevestigen met kaart ••••${l}` : "Bevestigen met dezelfde kaart"),
    help: "Hulp nodig? Gebruik de knop ‘Ik heb hulp nodig’ op dezelfde pagina. Stuur voor uw veiligheid nooit kaartgegevens per e-mail of bericht.",
    lastCallSubject: (h) => `Morgen verloopt de deadline voor het tweede deel van uw verblijf in ${h}`,
    lastCallHeadline: "De deadline is morgen.",
    lastCallBody: (g, a, dl) => `${g} we hebben ${a} nog niet ontvangen en de deadline is morgen, ${dl}. Betalen duurt twee minuten. Kunt u niet meer komen? Dan hoeft u niets te doen: de boeking wordt geannuleerd en we betalen terug wat u betaalde.`,
    paidSubject: (h) => `Uw verblijf in ${h} is volledig betaald`,
    paidHeadline: (ci) => `Alles betaald. Tot ${ci}.`,
    paidBody: (s) => `${s.greeting} we hebben het tweede deel, ${s.amount}, ontvangen via ${nlCard(s.last4)}. Uw verblijf in ${s.house}, van ${s.checkIn} tot ${s.checkOut}, is volledig betaald. ${s.invoiceLine} Tot dan is uw concierge maar één bericht verwijderd.`,
    invoiceAfterStay: "De factuur wordt na het verblijf opgemaakt.",
    invoiceSeparate: "De factuur volgt in een aparte e-mail.",
    cancelledSubject: (h) => `Uw boeking in ${h} is geannuleerd`,
    cancelledHeadline: "Uw boeking is geannuleerd.",
    cancelledBody: (s) => sentences(
      `${s.greeting} we hebben het tweede deel van uw verblijf in ${s.house} ${s.deadline ? `niet uiterlijk ${s.deadline}` : "niet op tijd"} ontvangen, daarom is de boeking geannuleerd, zoals we hadden uitgelegd.`,
      s.refund && `De ${s.refund} die u betaalde, gaan binnen 5 tot 10 werkdagen terug ${nlTo(s.cards)}, afhankelijk van uw bank.`,
      s.creditNote && `Referentie van de creditnota: ${s.creditNote}.`,
      "Er hoeft niets meer betaald te worden.",
    ),
    rebook: "Wilt u toch nog komen? De data zijn misschien nog vrij. Boek opnieuw of praat met uw concierge.",
    guestCancelledSubject: (h) => `Annulering bevestigd: ${h}`,
    guestCancelledHeadline: "Annulering bevestigd.",
    guestCancelledBody: (s) => sentences(
      `${s.greeting} we hebben uw boeking in ${s.house}, van ${s.checkIn} tot ${s.checkOut}, op uw verzoek geannuleerd, binnen de periode van gratis annuleren.`,
      s.refund && `We betalen ${s.refund} binnen 5 tot 10 werkdagen terug ${nlTo(s.cards)}.`,
      s.creditNote && `Referentie van de creditnota: ${s.creditNote}.`,
      "Er hoeft niets meer betaald te worden en er volgt geen andere afschrijving.",
    ),
    teamCancelledBody: (s) => sentences(
      s.refund
        ? `${s.greeting} we hebben uw boeking in ${s.house}, van ${s.checkIn} tot ${s.checkOut}, geannuleerd en betalen ${s.refund} binnen 5 tot 10 werkdagen terug ${nlTo(s.cards)}, afhankelijk van uw bank.`
        : `${s.greeting} we hebben uw boeking in ${s.house}, van ${s.checkIn} tot ${s.checkOut}, geannuleerd.`,
      s.creditNote && `Referentie van de creditnota: ${s.creditNote}.`,
      "Er hoeft niets meer betaald te worden en er volgt geen andere afschrijving. Hebt u vragen? Praat met uw concierge.",
    ),
    cardUpdatedSubject: "Kaart bijgewerkt voor het tweede deel",
    cardUpdatedBody: (l, d) => `Kaart bijgewerkt. Het tweede deel wordt op ${d} afgeschreven van kaart ••••${l}.`,
  },
  sv: {
    productName: "Betala i två delar",
    hello: (n) => (n ? `Hej ${n},` : "Hej,"),
    deadline: (d, t) => `${d} kl. ${t} (Lissabontid)`,
    amountLabel: "Andra delen", chargeDateLabel: "Dragningsdatum", cardLabel: "Kort",
    payByLabel: "Betala senast", freeCancelLabel: "Gratis avbokning fram till",
    totalPaidLabel: "Totalt betalt", refundLabel: "Återbetalning",
    planTitle: "Din betalningsplan",
    planToday: (a, l) => (l ? `Betalt i dag: ${a} med kort ••••${l}` : `Betalt i dag: ${a}`),
    planLater: (d, a) => `Den ${d}: ${a}, dras automatiskt från samma kort`,
    planDeadline: (dl) => `Du kan avboka utan kostnad fram till ${dl}.`,
    planNote: "Inget att göra fram till dess. Vi påminner dig en vecka innan och dagen före.",
    planNoteManage: "Vill du hellre betala tidigare, använda ett annat kort eller avboka räcker ett klick.",
    planCta: "Hantera betalningen",
    noWithdrawal: "Bokning av boende med fasta datum: ångerrätten på 14 dagar gäller inte. Avbokningsvillkoren för ditt pris gäller.",
    remind7Subject: (h) => `Andra delen av din vistelse på ${h}, om en vecka`,
    remindSubjectDated: (h, d) => `Andra delen av din vistelse på ${h}, den ${d}`,
    remind7Headline: (d, a) => `Den ${d}: ${a}.`,
    remind1Subject: (h) => `I morgon drar vi andra delen av din vistelse på ${h}`,
    remind1Headline: (a) => `I morgon: ${a}.`,
    remindBody: (s) => `${s.greeting} som vi kommit överens om drar vi ${s.amount} från ${svCard(s.last4)} den ${s.date}, den andra och sista delen av din vistelse på ${s.house}, från ${s.checkIn} till ${s.checkOut}. Du behöver inte göra något. Vill du hellre använda ett annat kort, eller betala nu, räcker ett klick.`,
    cardExpires: (l, d) => `Kort ••••${l} går ut före den ${d}. Uppdatera det på en minut så att dragningen går smidigt.`,
    limitTip: "Om ditt kort har en daglig gräns, kontrollera att den täcker beloppet den dagen.",
    failedSubject: "Vi kunde inte dra andra delen av din vistelse",
    failedHeadline: "Din bank godkände inte andra delen.",
    failedHeadlineAuth: "Din bank ber om en bekräftelse.",
    failedBody: (s) => `${s.greeting} i dag försökte vi dra ${s.amount} från ${svCard(s.last4)} och banken godkände det inte. Det händer ofta på grund av en kortgräns, ett utgångsdatum eller en bekräftelse som banken vill ha. Du kan betala med samma kort eller ett annat via knappen nedan, utan att logga in.`,
    failedBodyAuth: (s) => `${s.greeting} din bank ber dig bekräfta dragningen på ${s.amount} från ${svCard(s.last4)}. Bekräfta bara med samma kort via knappen nedan. Det tar en minut.`,
    failedBodyHard: (s) => `${s.greeting} i dag försökte vi dra ${s.amount} från ${svCard(s.last4)} och banken godkände det inte. Använd ett annat kort via knappen nedan för att slutföra, utan att logga in.`,
    deadlineSoft: (dl, r) => `För att behålla bokningen måste betalningen vara gjord senast den ${dl}. Vi försöker också igen ${joinList(r.map((x) => `den ${x}`), "och")}.`,
    deadlineHard: (dl) => `För att behålla bokningen måste betalningen vara gjord senast den ${dl}. I det här fallet är det bara ditt klick som löser det: vi försöker inte igen på egen hand.`,
    consequence: (p) => p
      ? `Om det inte går till dess avbokas bokningen och vi betalar tillbaka de ${p} du redan har betalat, eftersom du fortfarande är inom perioden för gratis avbokning.`
      : "Om det inte går till dess avbokas bokningen och vi betalar tillbaka det du redan har betalat, eftersom du fortfarande är inom perioden för gratis avbokning.",
    failedCta: "Betala eller byt kort",
    failedCtaHard: "Använd ett annat kort",
    failedCtaAuth: (l) => (l ? `Bekräfta med kort ••••${l}` : "Bekräfta med samma kort"),
    help: "Behöver du hjälp? Använd knappen ”Jag behöver hjälp” på samma sida. Skicka för din säkerhet aldrig kortuppgifter via mejl eller meddelande.",
    lastCallSubject: (h) => `I morgon går tidsfristen ut för andra delen av din vistelse på ${h}`,
    lastCallHeadline: "Tidsfristen går ut i morgon.",
    lastCallBody: (g, a, dl) => `${g} vi har ännu inte fått ${a} och tidsfristen går ut i morgon, den ${dl}. Att betala tar två minuter. Om du inte längre kan komma behöver du inte göra något: bokningen avbokas och vi betalar tillbaka det du har betalat.`,
    paidSubject: (h) => `Din vistelse på ${h} är fullt betald`,
    paidHeadline: (ci) => `Allt är betalt. Vi ses den ${ci}.`,
    paidBody: (s) => `${s.greeting} vi har fått andra delen, ${s.amount}, från ${svCard(s.last4)}. Din vistelse på ${s.house}, från ${s.checkIn} till ${s.checkOut}, är fullt betald. ${s.invoiceLine} Fram till dess är din concierge bara ett meddelande bort.`,
    invoiceAfterStay: "Fakturan utfärdas efter vistelsen.",
    invoiceSeparate: "Fakturan kommer i ett separat mejl.",
    cancelledSubject: (h) => `Din bokning på ${h} har avbokats`,
    cancelledHeadline: "Din bokning har avbokats.",
    cancelledBody: (s) => sentences(
      `${s.greeting} vi fick inte andra delen av din vistelse på ${s.house} ${s.deadline ? `senast den ${s.deadline}` : "i tid"}, så bokningen har avbokats, som vi förklarade.`,
      s.refund && `De ${s.refund} du betalade går tillbaka ${svTo(s.cards)} inom 5 till 10 bankdagar, beroende på din bank.`,
      s.creditNote && `Kreditfakturans referens: ${s.creditNote}.`,
      "Det finns inget mer att betala.",
    ),
    rebook: "Om du fortfarande vill komma kan datumen fortfarande vara lediga. Boka igen eller prata med din concierge.",
    guestCancelledSubject: (h) => `Avbokning bekräftad: ${h}`,
    guestCancelledHeadline: "Avbokning bekräftad.",
    guestCancelledBody: (s) => sentences(
      `${s.greeting} vi har avbokat din bokning på ${s.house}, från ${s.checkIn} till ${s.checkOut}, enligt din begäran, inom perioden för gratis avbokning.`,
      s.refund && `Vi betalar tillbaka ${s.refund} ${svTo(s.cards)} inom 5 till 10 bankdagar.`,
      s.creditNote && `Kreditfakturans referens: ${s.creditNote}.`,
      "Det finns inget mer att betala och ingen ytterligare dragning kommer att göras.",
    ),
    teamCancelledBody: (s) => sentences(
      s.refund
        ? `${s.greeting} vi har avbokat din bokning på ${s.house}, från ${s.checkIn} till ${s.checkOut}, och betalar tillbaka ${s.refund} ${svTo(s.cards)} inom 5 till 10 bankdagar, beroende på din bank.`
        : `${s.greeting} vi har avbokat din bokning på ${s.house}, från ${s.checkIn} till ${s.checkOut}.`,
      s.creditNote && `Kreditfakturans referens: ${s.creditNote}.`,
      "Det finns inget mer att betala och ingen ytterligare dragning kommer att göras. Har du frågor? Prata med din concierge.",
    ),
    cardUpdatedSubject: "Kortet uppdaterat för andra delen",
    cardUpdatedBody: (l, d) => `Kortet är uppdaterat. Andra delen dras från kort ••••${l} den ${d}.`,
  },
  fi: {
    productName: "Maksa kahdessa osassa",
    hello: (n) => (n ? `Hei ${n},` : "Hei,"),
    deadline: (d, t) => `${d} klo ${t} Lissabonin aikaa`,
    amountLabel: "Toinen osa", chargeDateLabel: "Veloituspäivä", cardLabel: "Kortti",
    payByLabel: "Maksettava viimeistään", freeCancelLabel: "Maksuton peruutus päättyy",
    totalPaidLabel: "Maksettu yhteensä", refundLabel: "Hyvitys",
    planTitle: "Maksusuunnitelmasi",
    planToday: (a, l) => (l ? `Maksettu tänään: ${a} kortilla ••••${l}` : `Maksettu tänään: ${a}`),
    planLater: (d, a) => `${d}: ${a}, veloitetaan automaattisesti samalta kortilta`,
    planDeadline: (dl) => `Voit perua maksutta ${dl} asti.`,
    planNote: "Siihen asti sinun ei tarvitse tehdä mitään. Muistutamme viikkoa ennen ja edellisenä päivänä.",
    planNoteManage: "Jos haluat maksaa aiemmin, käyttää toista korttia tai perua, se onnistuu yhdellä klikkauksella.",
    planCta: "Hallinnoi maksua",
    noWithdrawal: "Majoitusvaraus kiinteillä päivillä: 14 päivän peruuttamisoikeus ei koske sitä. Hintasi peruutusehdot ovat voimassa.",
    remind7Subject: (h) => `Majoituksesi toinen osa kohteessa ${h}, viikon kuluttua`,
    remindSubjectDated: (h, d) => `Majoituksesi toinen osa kohteessa ${h}, ${d}`,
    remind7Headline: (d, a) => `${d}: ${a}.`,
    remind1Subject: (h) => `Huomenna veloitamme majoituksesi toisen osan kohteessa ${h}`,
    remind1Headline: (a) => `Huomenna: ${a}.`,
    remindBody: (s) => `${s.greeting} kuten sovittiin, ${s.date} veloitamme ${s.amount} ${fiFrom(s.last4)}, majoituksesi toisen ja viimeisen osan kohteessa ${s.house} ajalle ${s.checkIn}–${s.checkOut}. Sinun ei tarvitse tehdä mitään. Jos haluat käyttää toista korttia tai maksaa heti, se onnistuu yhdellä klikkauksella.`,
    cardExpires: (l, d) => `Kortti ••••${l} vanhenee ennen ${d}. Päivitä se minuutissa, jotta veloitus sujuu ongelmitta.`,
    limitTip: "Jos kortillasi on päiväraja, tarkista, että se kattaa tämän summan sinä päivänä.",
    failedSubject: "Emme pystyneet veloittamaan majoituksesi toista osaa",
    failedHeadline: "Pankkisi ei hyväksynyt toista osaa.",
    failedHeadlineAuth: "Pankkisi pyytää vahvistusta.",
    failedBody: (s) => `${s.greeting} yritimme tänään veloittaa ${s.amount} ${fiFrom(s.last4)}, mutta pankkisi ei hyväksynyt sitä. Näin käy usein kortin rajan, voimassaolon tai pankin pyytämän vahvistuksen vuoksi. Voit maksaa samalla tai toisella kortilla alla olevasta painikkeesta ilman kirjautumista.`,
    failedBodyAuth: (s) => `${s.greeting} pankkisi pyytää sinua vahvistamaan ${s.amount} veloituksen ${fiFrom(s.last4)}. Vahvista vain samalla kortilla alla olevasta painikkeesta. Se vie minuutin.`,
    failedBodyHard: (s) => `${s.greeting} yritimme tänään veloittaa ${s.amount} ${fiFrom(s.last4)}, mutta pankkisi ei hyväksynyt sitä. Viimeistele maksu toisella kortilla alla olevasta painikkeesta ilman kirjautumista.`,
    deadlineSoft: (dl, r) => `Jotta varauksesi säilyy, maksun on oltava tehty viimeistään ${dl}. Yritämme myös uudelleen ${joinList(r, "ja")}.`,
    deadlineHard: (dl) => `Jotta varauksesi säilyy, maksun on oltava tehty viimeistään ${dl}. Tässä tapauksessa vain sinun klikkauksesi ratkaisee asian: emme yritä uudelleen itse.`,
    consequence: (p) => p
      ? `Jos se ei onnistu siihen mennessä, varaus perutaan ja palautamme jo maksamasi ${p}, koska olet yhä maksuttoman peruutuksen ajassa.`
      : "Jos se ei onnistu siihen mennessä, varaus perutaan ja palautamme sen, minkä olet jo maksanut, koska olet yhä maksuttoman peruutuksen ajassa.",
    failedCta: "Maksa tai vaihda korttia",
    failedCtaHard: "Käytä toista korttia",
    failedCtaAuth: (l) => (l ? `Vahvista kortilla ••••${l}` : "Vahvista samalla kortilla"),
    help: "Jos tarvitset apua, käytä samalla sivulla olevaa ”Tarvitsen apua” -painiketta. Älä turvallisuutesi vuoksi koskaan lähetä korttitietoja sähköpostilla tai viestillä.",
    lastCallSubject: (h) => `Huomenna päättyy majoituksesi toisen osan määräaika kohteessa ${h}`,
    lastCallHeadline: "Määräaika päättyy huomenna.",
    lastCallBody: (g, a, dl) => `${g} emme ole vielä saaneet summaa ${a}, ja määräaika päättyy huomenna, ${dl}. Maksaminen vie kaksi minuuttia. Jos et enää pääse tulemaan, sinun ei tarvitse tehdä mitään: varaus perutaan ja palautamme maksamasi summan.`,
    paidSubject: (h) => `Majoituksesi kohteessa ${h} on maksettu kokonaan`,
    paidHeadline: (ci) => `Kaikki on maksettu. Nähdään ${ci}.`,
    paidBody: (s) => `${s.greeting} saimme toisen osan, ${s.amount}, ${fiFrom(s.last4)}. Majoituksesi kohteessa ${s.house} ajalle ${s.checkIn}–${s.checkOut} on maksettu kokonaan. ${s.invoiceLine} Siihen asti conciergesi on vain viestin päässä.`,
    invoiceAfterStay: "Lasku laaditaan majoituksen jälkeen.",
    invoiceSeparate: "Lasku tulee erillisessä sähköpostissa.",
    cancelledSubject: (h) => `Varauksesi kohteessa ${h} on peruttu`,
    cancelledHeadline: "Varauksesi on peruttu.",
    cancelledBody: (s) => sentences(
      `${s.greeting} emme saaneet majoituksesi toista osaa kohteessa ${s.house} ${s.deadline ? `viimeistään ${s.deadline}` : "määräajassa"}, joten varaus on peruttu, kuten kerroimme.`,
      s.refund && `Maksamasi ${s.refund} palautetaan ${fiTo(s.cards)} 5–10 pankkipäivän kuluessa pankistasi riippuen.`,
      s.creditNote && `Hyvityslaskun viite: ${s.creditNote}.`,
      "Sinun ei tarvitse maksaa enempää.",
    ),
    rebook: "Jos haluat yhä tulla, päivät voivat olla vielä vapaina. Varaa uudelleen tai keskustele conciergesi kanssa.",
    guestCancelledSubject: (h) => `Peruutus vahvistettu: ${h}`,
    guestCancelledHeadline: "Peruutus vahvistettu.",
    guestCancelledBody: (s) => sentences(
      `${s.greeting} perusimme varauksesi kohteessa ${s.house} ajalle ${s.checkIn}–${s.checkOut} pyyntösi mukaisesti maksuttoman peruutuksen aikana.`,
      s.refund && `Palautamme ${s.refund} ${fiTo(s.cards)} 5–10 pankkipäivän kuluessa.`,
      s.creditNote && `Hyvityslaskun viite: ${s.creditNote}.`,
      "Sinun ei tarvitse maksaa enempää, eikä muita veloituksia tehdä.",
    ),
    teamCancelledBody: (s) => sentences(
      s.refund
        ? `${s.greeting} perusimme varauksesi kohteessa ${s.house} ajalle ${s.checkIn}–${s.checkOut} ja palautamme ${s.refund} ${fiTo(s.cards)} 5–10 pankkipäivän kuluessa pankistasi riippuen.`
        : `${s.greeting} perusimme varauksesi kohteessa ${s.house} ajalle ${s.checkIn}–${s.checkOut}.`,
      s.creditNote && `Hyvityslaskun viite: ${s.creditNote}.`,
      "Sinun ei tarvitse maksaa enempää, eikä muita veloituksia tehdä. Jos sinulla on kysyttävää, keskustele conciergesi kanssa.",
    ),
    cardUpdatedSubject: "Kortti päivitetty toista osaa varten",
    cardUpdatedBody: (l, d) => `Kortti päivitetty. Toinen osa veloitetaan kortilta ••••${l} ${d}.`,
  },
};

/** SMS S1 (falha) e S2 (véspera de H). Curtos: o link conta para o tamanho.
 *  A casa é opcional: sem ela a frase fica "da sua estadia", nunca "em a sua casa". */
export interface PayPlanSmsStrings {
  /** Prazo compacto do SMS: dia sem ano, hora e "(Lisboa)". */
  deadline: (day: string, time: string) => string;
  failed: (house: string | null, deadline: string, link: string) => string;
  lastCall: (house: string | null, time: string, link: string) => string;
}

export const PAYPLAN_SMS_I18N: Record<EmailLang, PayPlanSmsStrings> = {
  pt: {
    deadline: (d, t) => `${d} ${ptAt(t)} ${t} (Lisboa)`,
    failed: (h, dl, l) => `Portugal Active: não conseguimos cobrar a 2.ª parte da sua estadia${h ? ` em ${h}` : ""}. Pague ou mude de cartão até ${dl}: ${l}`,
    lastCall: (h, t, l) => `Portugal Active: amanhã ${ptAt(t)} ${t} (Lisboa) termina o prazo da 2.ª parte da sua estadia${h ? ` em ${h}` : ""}. Pagar demora 2 minutos: ${l}`,
  },
  en: {
    deadline: (d, t) => `${d} at ${t} (Lisbon)`,
    failed: (h, dl, l) => `Portugal Active: we could not charge the 2nd part of your stay${h ? ` at ${h}` : ""}. Pay or change card by ${dl}: ${l}`,
    lastCall: (h, t, l) => `Portugal Active: tomorrow at ${t} (Lisbon) the deadline for the 2nd part of your stay${h ? ` at ${h}` : ""} ends. Paying takes 2 minutes: ${l}`,
  },
  fr: {
    deadline: (d, t) => `${d} à ${t} (Lisbonne)`,
    failed: (h, dl, l) => `Portugal Active : nous n'avons pas pu débiter la 2e partie de votre séjour${h ? ` à ${h}` : ""}. Payez ou changez de carte au plus tard le ${dl} : ${l}`,
    lastCall: (h, t, l) => `Portugal Active : demain à ${t} (Lisbonne), le délai pour la 2e partie de votre séjour${h ? ` à ${h}` : ""} se termine. Payer prend 2 minutes : ${l}`,
  },
  es: {
    deadline: (d, t) => `${d} a ${esAt(t)} ${t} (Lisboa)`,
    failed: (h, dl, l) => `Portugal Active: no hemos podido cargar la 2.ª parte de su estancia${h ? ` en ${h}` : ""}. Pague o cambie de tarjeta a más tardar el ${dl}: ${l}`,
    lastCall: (h, t, l) => `Portugal Active: mañana a ${esAt(t)} ${t} (Lisboa) termina el plazo de la 2.ª parte de su estancia${h ? ` en ${h}` : ""}. Pagar lleva 2 minutos: ${l}`,
  },
  it: {
    deadline: (d, t) => `${d} alle ${t} (Lisbona)`,
    failed: (h, dl, l) => `Portugal Active: non siamo riusciti ad addebitare la 2ª parte del suo soggiorno${h ? ` a ${h}` : ""}. Paghi o cambi carta entro ${itArt("il", dl)}: ${l}`,
    lastCall: (h, t, l) => `Portugal Active: domani alle ${t} (Lisbona) scade il termine per la 2ª parte del suo soggiorno${h ? ` a ${h}` : ""}. Pagare richiede 2 minuti: ${l}`,
  },
  de: {
    deadline: (d, t) => `${d} um ${t} Uhr (Lissabon)`,
    failed: (h, dl, l) => `Portugal Active: Wir konnten den 2. Teil Ihres Aufenthalts${h ? ` in ${h}` : ""} nicht abbuchen. Bitte zahlen oder Karte wechseln bis zum ${dl}: ${l}`,
    lastCall: (h, t, l) => `Portugal Active: Morgen um ${t} Uhr (Lissabon) endet die Frist für den 2. Teil Ihres Aufenthalts${h ? ` in ${h}` : ""}. Die Zahlung dauert 2 Minuten: ${l}`,
  },
  nl: {
    deadline: (d, t) => `${d} om ${t} uur (Lissabon)`,
    failed: (h, dl, l) => `Portugal Active: we konden het 2e deel van uw verblijf${h ? ` in ${h}` : ""} niet afschrijven. Betaal of wijzig uw kaart uiterlijk ${dl}: ${l}`,
    lastCall: (h, t, l) => `Portugal Active: morgen om ${t} uur (Lissabon) verloopt de deadline voor het 2e deel van uw verblijf${h ? ` in ${h}` : ""}. Betalen duurt 2 minuten: ${l}`,
  },
  sv: {
    deadline: (d, t) => `${d} kl. ${t} (Lissabon)`,
    failed: (h, dl, l) => `Portugal Active: vi kunde inte dra 2:a delen av din vistelse${h ? ` på ${h}` : ""}. Betala eller byt kort senast den ${dl}: ${l}`,
    lastCall: (h, t, l) => `Portugal Active: i morgon kl. ${t} (Lissabon) går tidsfristen ut för 2:a delen av din vistelse${h ? ` på ${h}` : ""}. Att betala tar 2 minuter: ${l}`,
  },
  fi: {
    deadline: (d, t) => `${d} klo ${t} (Lissabonin aikaa)`,
    failed: (h, dl, l) => `Portugal Active: emme pystyneet veloittamaan majoituksesi 2. osaa${h ? ` kohteessa ${h}` : ""}. Maksa tai vaihda korttia viimeistään ${dl}: ${l}`,
    lastCall: (h, t, l) => `Portugal Active: huomenna klo ${t} (Lissabonin aikaa) päättyy majoituksesi 2. osan määräaika${h ? ` kohteessa ${h}` : ""}. Maksaminen vie 2 minuuttia: ${l}`,
  },
};

/* ── Datas no calendário de Lisboa, onde estão todas as casas ──
   Partilhadas pelos emails (transactional-email.ts) e pelos SMS (sms.ts):
   o prazo que o SMS diz tem de ser exatamente o do email. */

const LISBON_TZ = "Europe/Lisbon";

/** "28 de junho de 2027" / "28 June 2027" (sem ano: "28 de junho"). O dia 1
 *  leva o ordinal onde a língua o escreve sempre ("1er juillet", "1º luglio"). */
export function formatLisbonDay(at: Date, lang: EmailLang, withYear = true): string {
  const s = new Intl.DateTimeFormat(INTL_TAG[lang] ?? "en-GB", {
    day: "numeric",
    month: "long",
    ...(withYear ? { year: "numeric" as const } : {}),
    timeZone: LISBON_TZ,
  }).format(at);
  if (lang === "fr") return s.replace(/^1(?=[\s\u00a0])/, "1er");
  if (lang === "it") return s.replace(/^1(?=[\s\u00a0])/, "1º");
  return s;
}

/** "12:00" (fi: "12.00"), 24 horas, hora de Lisboa. */
export function formatLisbonTime(at: Date, lang: EmailLang): string {
  return new Intl.DateTimeFormat(INTL_TAG[lang] ?? "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: LISBON_TZ,
  }).format(at);
}

/** Data de calendário de Lisboa, YYYY-MM-DD. */
export function lisbonYmd(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: LISBON_TZ }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Dias de calendário de Lisboa de `now` até `at` (0 = hoje, 1 = amanhã). */
export function lisbonDaysUntil(at: Date, now: Date): number {
  return Math.round((Date.parse(`${lisbonYmd(at)}T12:00:00Z`) - Date.parse(`${lisbonYmd(now)}T12:00:00Z`)) / 86_400_000);
}
