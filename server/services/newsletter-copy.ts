/**
 * Server-side texts of the newsletter capture, in the nine site languages:
 * the double opt-in email (sent by the site's own transactional email, Resend)
 * and the static pages behind the links of that email (confirmation, expired
 * or invalid link, unsubscribe).
 *
 * Portuguese passed the copy review first and goes to Ricardo for approval.
 * The other eight languages were translated from it and reviewed by the copy
 * reviewer; native review is still pending (see docs/newsletter.md).
 */
import { newsletterLang, type NewsletterLang } from "@shared/newsletter";

export { newsletterLang, type NewsletterLang };

/** Days a confirmation link stays valid. The email says it in words. */
export const CONFIRM_LINK_DAYS = 7;

/**
 * Sender identification at the foot of the confirmation email (the shared
 * email footer carries the phone, the email and WhatsApp, not the address).
 * Source: pa-marketing knowledge/facts.md, "Morada legal (rodapé dos emails)".
 */
export const SENDER_ADDRESS = "Portugal Active, Travessa da Estrada Nova 187, 4935-336 Viana do Castelo, Portugal";

export interface ConfirmEmailCopy {
  subject: string;
  preheader: string;
  heading: string;
  intro: string;
  button: string;
  house: (house: string) => string;
  validity: string;
  fallback: string;
  ignore: string;
}

export interface NewsletterPageCopy {
  confirmedTitle: string;
  confirmedBody: string;
  ctaHomes: string;
  exitPrompt: string;
  exitLink: string;
  expiredTitle: string;
  expiredBody: string;
  invalidTitle: string;
  invalidBody: string;
  errorTitle: string;
  errorBody: string;
  unsubscribeTitle: string;
  unsubscribeBody: string;
  unsubscribeButton: string;
  unsubscribedTitle: string;
  unsubscribedBody: string;
}

export const CONFIRM_EMAIL_COPY: Record<NewsletterLang, ConfirmEmailCopy> = {
  pt: {
    subject: "Confirme a sua subscrição da Portugal Active",
    preheader: "Falta um clique para receber as novidades e as promoções das nossas casas.",
    heading: "Confirme a sua subscrição",
    intro: "Pediu para receber as novidades e as promoções das casas da Portugal Active. Para confirmar, carregue no botão.",
    button: "Confirmar subscrição",
    house: (h) => `Registámos o seu interesse nesta casa: ${h}.`,
    validity: `O link é válido durante ${CONFIRM_LINK_DAYS} dias.`,
    fallback: "Se o botão não funcionar, copie este link para o navegador:",
    ignore: "Se não pediu esta subscrição, ignore este email. Sem o clique, a subscrição não fica ativa.",
  },
  es: {
    subject: "Confirme su suscripción a Portugal Active",
    preheader: "Falta un clic para recibir las novedades y las promociones de nuestras casas.",
    heading: "Confirme su suscripción",
    intro: "Ha pedido recibir las novedades y las promociones de las casas de Portugal Active. Para confirmar, pulse el botón.",
    button: "Confirmar suscripción",
    house: (h) => `Hemos registrado su interés en esta casa: ${h}.`,
    validity: `El enlace es válido durante ${CONFIRM_LINK_DAYS} días.`,
    fallback: "Si el botón no funciona, copie este enlace en el navegador:",
    ignore: "Si no ha pedido esta suscripción, ignore este correo. Sin el clic, la suscripción no se activa.",
  },
  en: {
    subject: "Confirm your Portugal Active subscription",
    preheader: "One click left to receive news and offers from our homes.",
    heading: "Confirm your subscription",
    intro: "You asked to receive news and offers from Portugal Active's homes. To confirm, press the button.",
    button: "Confirm subscription",
    house: (h) => `We have noted your interest in this home: ${h}.`,
    validity: `The link is valid for ${CONFIRM_LINK_DAYS} days.`,
    fallback: "If the button does not work, copy this link into your browser:",
    ignore: "If you did not ask for this subscription, ignore this email. Without the click, you are not subscribed.",
  },
  fr: {
    subject: "Confirmez votre abonnement à Portugal Active",
    preheader: "Plus qu'un clic pour recevoir les nouveautés et les offres de nos maisons.",
    heading: "Confirmez votre abonnement",
    intro: "Vous avez demandé à recevoir les nouveautés et les offres des maisons de Portugal Active. Pour confirmer, cliquez sur le bouton.",
    button: "Confirmer l'abonnement",
    house: (h) => `Nous avons noté votre intérêt pour cette maison : ${h}.`,
    validity: `Le lien est valable ${CONFIRM_LINK_DAYS} jours.`,
    fallback: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
    ignore: "Si vous n'avez pas demandé cet abonnement, ignorez cet e-mail. Sans le clic, l'abonnement n'est pas activé.",
  },
  de: {
    subject: "Bitte bestätigen Sie Ihr Abonnement bei Portugal Active",
    preheader: "Nur noch ein Klick, dann erhalten Sie Neuigkeiten und Angebote unserer Häuser.",
    heading: "Bitte bestätigen Sie Ihr Abonnement",
    intro: "Sie möchten Neuigkeiten und Angebote der Häuser von Portugal Active erhalten. Zur Bestätigung klicken Sie bitte auf die Schaltfläche.",
    button: "Abonnement bestätigen",
    house: (h) => `Wir haben Ihr Interesse an diesem Haus vermerkt: ${h}.`,
    validity: `Der Link ist ${CONFIRM_LINK_DAYS} Tage gültig.`,
    fallback: "Falls die Schaltfläche nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:",
    ignore: "Wenn Sie dieses Abonnement nicht angefordert haben, ignorieren Sie diese E-Mail. Ohne Klick wird das Abonnement nicht aktiviert.",
  },
  it: {
    subject: "Confermi la sua iscrizione a Portugal Active",
    preheader: "Manca un clic per ricevere le novità e le offerte delle nostre case.",
    heading: "Confermi la sua iscrizione",
    intro: "Ha chiesto di ricevere le novità e le offerte delle case di Portugal Active. Per confermare, clicchi sul pulsante.",
    button: "Conferma l'iscrizione",
    house: (h) => `Abbiamo registrato il suo interesse per questa casa: ${h}.`,
    validity: `Il link è valido per ${CONFIRM_LINK_DAYS} giorni.`,
    fallback: "Se il pulsante non funziona, copi questo link nel browser:",
    ignore: "Se non ha richiesto questa iscrizione, ignori questa email. Senza il clic, l'iscrizione non viene attivata.",
  },
  nl: {
    subject: "Bevestig uw inschrijving bij Portugal Active",
    preheader: "Nog één klik en u ontvangt het nieuws en de aanbiedingen van onze huizen.",
    heading: "Bevestig uw inschrijving",
    intro: "U heeft gevraagd om het nieuws en de aanbiedingen van de huizen van Portugal Active te ontvangen. Klik op de knop om te bevestigen.",
    button: "Inschrijving bevestigen",
    house: (h) => `We hebben uw interesse in dit huis genoteerd: ${h}.`,
    validity: `De link is ${CONFIRM_LINK_DAYS} dagen geldig.`,
    fallback: "Werkt de knop niet? Kopieer deze link naar uw browser:",
    ignore: "Heeft u deze inschrijving niet aangevraagd? Negeer dan deze e-mail. Zonder klik wordt de inschrijving niet geactiveerd.",
  },
  fi: {
    subject: "Vahvista Portugal Activen uutiskirjeen tilaus",
    preheader: "Enää yksi klikkaus, niin saat talojemme uutiset ja tarjoukset.",
    heading: "Vahvista tilauksesi",
    intro: "Pyysit saada Portugal Activen talojen uutiset ja tarjoukset. Vahvista tilaus painamalla painiketta.",
    button: "Vahvista tilaus",
    house: (h) => `Kirjasimme kiinnostuksesi tähän taloon: ${h}.`,
    validity: `Linkki on voimassa ${CONFIRM_LINK_DAYS} päivää.`,
    fallback: "Jos painike ei toimi, kopioi tämä linkki selaimeesi:",
    ignore: "Jos et pyytänyt tätä tilausta, voit jättää tämän viestin huomiotta. Ilman klikkausta tilaus ei ala.",
  },
  sv: {
    subject: "Bekräfta din prenumeration hos Portugal Active",
    preheader: "Ett klick kvar för att få nyheter och erbjudanden från våra hus.",
    heading: "Bekräfta din prenumeration",
    intro: "Du har bett om att få nyheter och erbjudanden från Portugal Actives hus. Tryck på knappen för att bekräfta.",
    button: "Bekräfta prenumerationen",
    house: (h) => `Vi har noterat ditt intresse för det här huset: ${h}.`,
    validity: `Länken gäller i ${CONFIRM_LINK_DAYS} dagar.`,
    fallback: "Om knappen inte fungerar kan du kopiera den här länken till din webbläsare:",
    ignore: "Om du inte har bett om den här prenumerationen kan du bortse från mejlet. Utan klicket startar ingen prenumeration.",
  },
};

export const NEWSLETTER_PAGE_COPY: Record<NewsletterLang, NewsletterPageCopy> = {
  pt: {
    confirmedTitle: "Subscrição confirmada",
    confirmedBody: "Obrigado. A partir de agora recebe as novidades e as promoções das nossas casas.",
    ctaHomes: "Ver as casas",
    exitPrompt: "Mudou de ideias?",
    exitLink: "Cancelar a subscrição",
    expiredTitle: "O link expirou",
    expiredBody: "Este link de confirmação já não é válido. Volte ao site e deixe o seu email outra vez. Enviamos um link novo.",
    invalidTitle: "Link inválido",
    invalidBody: "Este link já não é válido. Se quiser subscrever, volte ao site e deixe o seu email outra vez.",
    errorTitle: "Algo falhou",
    errorBody: "Não conseguimos concluir o pedido agora. Tente outra vez daqui a instantes ou escreva para info@portugalactive.com.",
    unsubscribeTitle: "Cancelar a subscrição",
    unsubscribeBody: "Deixa de receber as novidades e as promoções da Portugal Active neste email.",
    unsubscribeButton: "Cancelar subscrição",
    unsubscribedTitle: "Subscrição cancelada",
    unsubscribedBody: "Deixamos de enviar novidades e promoções para este email. Um email que já esteja agendado ainda pode chegar nos próximos dias. Se tiver uma reserva connosco, os emails dessa reserva continuam a chegar.",
  },
  es: {
    confirmedTitle: "Suscripción confirmada",
    confirmedBody: "Gracias. A partir de ahora recibirá las novedades y las promociones de nuestras casas.",
    ctaHomes: "Ver las casas",
    exitPrompt: "¿Ha cambiado de opinión?",
    exitLink: "Cancelar la suscripción",
    expiredTitle: "El enlace ha caducado",
    expiredBody: "Este enlace de confirmación ya no es válido. Vuelva a la web y deje su correo otra vez. Le enviaremos un enlace nuevo.",
    invalidTitle: "Enlace no válido",
    invalidBody: "Este enlace ya no es válido. Si quiere suscribirse, vuelva a la web y deje su correo otra vez.",
    errorTitle: "Algo ha fallado",
    errorBody: "No hemos podido completar la solicitud. Inténtelo de nuevo en unos instantes o escriba a info@portugalactive.com.",
    unsubscribeTitle: "Cancelar la suscripción",
    unsubscribeBody: "Dejará de recibir las novedades y las promociones de Portugal Active en este correo.",
    unsubscribeButton: "Cancelar suscripción",
    unsubscribedTitle: "Suscripción cancelada",
    unsubscribedBody: "Dejamos de enviar novedades y promociones a este correo. Un correo que ya esté programado aún puede llegar en los próximos días. Si tiene una reserva con nosotros, los correos de esa reserva seguirán llegando.",
  },
  en: {
    confirmedTitle: "Subscription confirmed",
    confirmedBody: "Thank you. From now on you will receive news and offers from our homes.",
    ctaHomes: "See the homes",
    exitPrompt: "Changed your mind?",
    exitLink: "Unsubscribe",
    expiredTitle: "This link has expired",
    expiredBody: "This confirmation link is no longer valid. Go back to the site and leave your email again. We will send you a new link.",
    invalidTitle: "Invalid link",
    invalidBody: "This link is no longer valid. If you would like to subscribe, go back to the site and leave your email again.",
    errorTitle: "Something went wrong",
    errorBody: "We could not complete your request right now. Please try again in a moment or write to info@portugalactive.com.",
    unsubscribeTitle: "Unsubscribe",
    unsubscribeBody: "You will stop receiving news and offers from Portugal Active at this email address.",
    unsubscribeButton: "Unsubscribe",
    unsubscribedTitle: "You have unsubscribed",
    unsubscribedBody: "We will stop sending news and offers to this email address. An email that is already scheduled may still arrive in the next few days. If you have a booking with us, the emails about that booking will still arrive.",
  },
  fr: {
    confirmedTitle: "Abonnement confirmé",
    confirmedBody: "Merci. Vous recevrez désormais les nouveautés et les offres de nos maisons.",
    ctaHomes: "Voir les maisons",
    exitPrompt: "Vous avez changé d'avis ?",
    exitLink: "Se désabonner",
    expiredTitle: "Le lien a expiré",
    expiredBody: "Ce lien de confirmation n'est plus valable. Revenez sur le site et laissez à nouveau votre e-mail. Nous vous enverrons un nouveau lien.",
    invalidTitle: "Lien non valable",
    invalidBody: "Ce lien n'est plus valable. Pour vous abonner, revenez sur le site et laissez à nouveau votre e-mail.",
    errorTitle: "Une erreur s'est produite",
    errorBody: "Nous n'avons pas pu traiter votre demande pour le moment. Réessayez dans quelques instants ou écrivez à info@portugalactive.com.",
    unsubscribeTitle: "Se désabonner",
    unsubscribeBody: "Vous ne recevrez plus les nouveautés et les offres de Portugal Active à cette adresse e-mail.",
    unsubscribeButton: "Se désabonner",
    unsubscribedTitle: "Désabonnement confirmé",
    unsubscribedBody: "Nous cessons d'envoyer des nouveautés et des offres à cette adresse. Un e-mail déjà programmé peut encore arriver dans les prochains jours. Si vous avez une réservation chez nous, les e-mails liés à cette réservation continueront d'arriver.",
  },
  de: {
    confirmedTitle: "Abonnement bestätigt",
    confirmedBody: "Vielen Dank. Ab jetzt erhalten Sie Neuigkeiten und Angebote unserer Häuser.",
    ctaHomes: "Zu den Häusern",
    exitPrompt: "Haben Sie es sich anders überlegt?",
    exitLink: "Abonnement kündigen",
    expiredTitle: "Der Link ist abgelaufen",
    expiredBody: "Dieser Bestätigungslink ist nicht mehr gültig. Gehen Sie zurück auf die Website und geben Sie Ihre E-Mail erneut ein. Wir senden Ihnen einen neuen Link.",
    invalidTitle: "Ungültiger Link",
    invalidBody: "Dieser Link ist nicht mehr gültig. Wenn Sie sich anmelden möchten, gehen Sie zurück auf die Website und geben Sie Ihre E-Mail erneut ein.",
    errorTitle: "Etwas ist schiefgelaufen",
    errorBody: "Wir konnten Ihre Anfrage gerade nicht abschließen. Bitte versuchen Sie es gleich noch einmal oder schreiben Sie an info@portugalactive.com.",
    unsubscribeTitle: "Abonnement kündigen",
    unsubscribeBody: "Sie erhalten dann keine Neuigkeiten und Angebote von Portugal Active mehr an diese E-Mail-Adresse.",
    unsubscribeButton: "Abonnement kündigen",
    unsubscribedTitle: "Abonnement gekündigt",
    unsubscribedBody: "Wir senden keine Neuigkeiten und Angebote mehr an diese E-Mail-Adresse. Eine bereits geplante E-Mail kann in den nächsten Tagen noch ankommen. Wenn Sie bei uns gebucht haben, erhalten Sie die E-Mails zu dieser Buchung weiterhin.",
  },
  it: {
    confirmedTitle: "Iscrizione confermata",
    confirmedBody: "Grazie. D'ora in poi riceverà le novità e le offerte delle nostre case.",
    ctaHomes: "Vedi le case",
    exitPrompt: "Ha cambiato idea?",
    exitLink: "Annulla l'iscrizione",
    expiredTitle: "Il link è scaduto",
    expiredBody: "Questo link di conferma non è più valido. Torni sul sito e lasci di nuovo la sua email. Le invieremo un nuovo link.",
    invalidTitle: "Link non valido",
    invalidBody: "Questo link non è più valido. Se desidera iscriversi, torni sul sito e lasci di nuovo la sua email.",
    errorTitle: "Qualcosa non ha funzionato",
    errorBody: "Non siamo riusciti a completare la richiesta. Riprovi tra qualche istante o scriva a info@portugalactive.com.",
    unsubscribeTitle: "Annulla l'iscrizione",
    unsubscribeBody: "Non riceverà più le novità e le offerte di Portugal Active a questo indirizzo email.",
    unsubscribeButton: "Annulla l'iscrizione",
    unsubscribedTitle: "Iscrizione annullata",
    unsubscribedBody: "Smettiamo di inviare novità e offerte a questo indirizzo email. Un'email già programmata potrebbe ancora arrivare nei prossimi giorni. Se ha una prenotazione con noi, le email di quella prenotazione continueranno ad arrivare.",
  },
  nl: {
    confirmedTitle: "Inschrijving bevestigd",
    confirmedBody: "Bedankt. Vanaf nu ontvangt u het nieuws en de aanbiedingen van onze huizen.",
    ctaHomes: "Bekijk de huizen",
    exitPrompt: "Van gedachten veranderd?",
    exitLink: "Uitschrijven",
    expiredTitle: "De link is verlopen",
    expiredBody: "Deze bevestigingslink is niet meer geldig. Ga terug naar de website en laat uw e-mailadres opnieuw achter. We sturen u een nieuwe link.",
    invalidTitle: "Ongeldige link",
    invalidBody: "Deze link is niet meer geldig. Wilt u zich inschrijven? Ga dan terug naar de website en laat uw e-mailadres opnieuw achter.",
    errorTitle: "Er ging iets mis",
    errorBody: "We konden uw verzoek nu niet afronden. Probeer het zo meteen opnieuw of schrijf naar info@portugalactive.com.",
    unsubscribeTitle: "Uitschrijven",
    unsubscribeBody: "U ontvangt dan geen nieuws en aanbiedingen van Portugal Active meer op dit e-mailadres.",
    unsubscribeButton: "Uitschrijven",
    unsubscribedTitle: "U bent uitgeschreven",
    unsubscribedBody: "We sturen geen nieuws of aanbiedingen meer naar dit e-mailadres. Een e-mail die al gepland staat, kan de komende dagen nog aankomen. Heeft u een boeking bij ons, dan blijft u de e-mails over die boeking ontvangen.",
  },
  fi: {
    confirmedTitle: "Tilaus vahvistettu",
    confirmedBody: "Kiitos. Saat tästä lähtien talojemme uutiset ja tarjoukset.",
    ctaHomes: "Katso talot",
    exitPrompt: "Muutitko mielesi?",
    exitLink: "Peru tilaus",
    expiredTitle: "Linkki on vanhentunut",
    expiredBody: "Tämä vahvistuslinkki ei ole enää voimassa. Palaa sivustolle ja jätä sähköpostiosoitteesi uudelleen. Lähetämme uuden linkin.",
    invalidTitle: "Virheellinen linkki",
    invalidBody: "Tämä linkki ei ole enää voimassa. Jos haluat tilata, palaa sivustolle ja jätä sähköpostiosoitteesi uudelleen.",
    errorTitle: "Jokin meni vikaan",
    errorBody: "Emme pystyneet käsittelemään pyyntöäsi juuri nyt. Yritä hetken kuluttua uudelleen tai kirjoita osoitteeseen info@portugalactive.com.",
    unsubscribeTitle: "Peru tilaus",
    unsubscribeBody: "Et enää saa Portugal Activen uutisia ja tarjouksia tähän sähköpostiosoitteeseen.",
    unsubscribeButton: "Peru tilaus",
    unsubscribedTitle: "Tilaus peruttu",
    unsubscribedBody: "Lopetamme uutisten ja tarjousten lähettämisen tähän osoitteeseen. Jo ajastettu viesti voi vielä saapua lähipäivinä. Jos sinulla on varaus meillä, sitä koskevat viestit tulevat edelleen.",
  },
  sv: {
    confirmedTitle: "Prenumerationen är bekräftad",
    confirmedBody: "Tack. Från och med nu får du nyheter och erbjudanden från våra hus.",
    ctaHomes: "Se husen",
    exitPrompt: "Har du ändrat dig?",
    exitLink: "Avsluta prenumerationen",
    expiredTitle: "Länken har gått ut",
    expiredBody: "Den här bekräftelselänken gäller inte längre. Gå tillbaka till webbplatsen och lämna din e-postadress igen. Vi skickar en ny länk.",
    invalidTitle: "Ogiltig länk",
    invalidBody: "Den här länken gäller inte längre. Om du vill prenumerera kan du gå tillbaka till webbplatsen och lämna din e-postadress igen.",
    errorTitle: "Något gick fel",
    errorBody: "Vi kunde inte slutföra din begäran just nu. Försök igen om en stund eller skriv till info@portugalactive.com.",
    unsubscribeTitle: "Avsluta prenumerationen",
    unsubscribeBody: "Du slutar få nyheter och erbjudanden från Portugal Active till den här e-postadressen.",
    unsubscribeButton: "Avsluta prenumerationen",
    unsubscribedTitle: "Prenumerationen är avslutad",
    unsubscribedBody: "Vi slutar skicka nyheter och erbjudanden till den här adressen. Ett mejl som redan är schemalagt kan fortfarande komma de närmaste dagarna. Om du har en bokning hos oss får du fortfarande mejlen om den bokningen.",
  },
};
