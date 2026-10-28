# Pagamento em duas partes: pacote de revisão para o André Feiteiro

Portugal Active · 28 de outubro de 2026 · preparado a partir de `docs/pagamento_duas_partes.md` (secção 6)

## O que mudou desde a validação de 25 de outubro

1. **Não há incentivo a pagar tudo.** O desconto de 1% foi abandonado e a alternativa (o Flex incluído para quem paga tudo) foi desligada a 28 de outubro: o hóspede escolhe só quando paga, sempre ao mesmo preço. A frase do 1% sai das CGV e não entra nenhuma outra (cláusula A abaixo). O Flex continua a ser um extra pago, que o hóspede escolhe.
2. **Sem SMS.** Os avisos de falha de pagamento são só por email. Tirámos "e SMS" do texto da autorização que validou e da cláusula "Se o segundo pagamento falhar" (cláusulas C e D).
3. **A autorização existe agora nas 9 línguas do site.** A tradução PT e EN é a validada; FR, ES, IT, DE, NL, SV e FI são traduções nossas, **por rever por nativos** (obrigatório em DE, FR e NL). Estão no anexo, com uma reserva de exemplo.
4. **O hóspede fica a saber antes do checkout.** Na página da casa e no 1.º passo aparece uma frase como "Pode pagar em duas partes: metade hoje, metade a 7 de dezembro." Não é uma oferta com prazo nem uma promoção: é a modalidade de pagamento disponível para aquela estadia.

## O que precisamos que valide

- [ ] Cláusula A (Preço e pagamento), sem a frase do 1%.
- [ ] Cláusulas B a F (texto validado, com as alterações assinaladas).
- [ ] O bloco pré-contratual junto ao botão de pagar (secção "Bloco pré-contratual").
- [ ] A remoção de "e SMS" no texto da autorização (PT e EN).
- [ ] Quem revê as traduções FR/ES/IT/DE/NL/SV/FI do anexo.
- [ ] Se a declaração do Flex ("execução imediata") deve cobrir também os extras com data (chef, transfers).
- [ ] O texto da secção nova da Política de Privacidade (resumo no fim).

## Cláusulas das CGV (pt-PT)

**A. Preço e pagamento** *(alterada: sai a frase do 1%)*
"O preço da estadia pode ser pago numa só vez ou em duas partes, conforme a opção escolhida na reserva. Na opção em duas partes, paga metade do valor da estadia e a totalidade dos serviços escolhidos no momento da reserva, e a outra metade da estadia na data indicada no resumo da reserva e no email de confirmação, sempre antes do fim do prazo de cancelamento gratuito. Ambos os pagamentos são pagamentos parciais do preço e não têm natureza de sinal. A opção em duas partes é ao preço apresentado, sem qualquer acréscimo."

**B. Autorização do segundo pagamento** *(sem alterações)*
"Ao escolher pagar em duas partes, autoriza a Portugal Active a enviar instruções à instituição emissora do seu cartão para cobrar o segundo pagamento, no valor exato e na data indicados no resumo da reserva, no mesmo cartão usado no primeiro pagamento e, se essa cobrança for recusada, a tentar de novo o mesmo valor nas datas indicadas no aviso, até ao prazo aí fixado. Os dados do cartão ficam guardados pelo nosso prestador de pagamentos (Stripe) apenas para este pagamento; a Portugal Active não tem acesso ao número completo e não usa este cartão para qualquer outra cobrança sem a sua intervenção. Enviamos um aviso por email 7 dias antes da cobrança e um recibo depois. Pode a qualquer momento pagar antecipadamente, trocar de cartão (com nova autorização) ou cancelar a reserva através do link do email de confirmação; se cancelar, aplica-se a política de cancelamento da reserva."

**C. Se o segundo pagamento falhar** *(alterada: "por email e SMS" passa a "por email")*
"Se não conseguirmos cobrar o segundo pagamento na data prevista, avisamos por email com um link para pagar por outro meio e damos 7 dias, contados desse aviso, para o fazer. A data da cobrança é fixada de modo a que este prazo termine antes do fim do prazo de cancelamento gratuito. Se o pagamento não for concluído nesse prazo, a reserva é cancelada e devolvemos integralmente o primeiro pagamento para o meio de pagamento original, sem qualquer custo, com confirmação escrita."

**D. Direito de livre resolução** *(sem alterações; aplica-se a todas as reservas)*
"As reservas de alojamento com datas determinadas estão excluídas do direito de livre resolução previsto no artigo 17.º, n.º 1, alínea k), do Decreto-Lei n.º 24/2014. Pode, no entanto, cancelar nos termos da política de cancelamento da sua reserva, indicada antes do pagamento e no email de confirmação, com a data e hora limite do cancelamento gratuito (23:59, hora de Lisboa)."

**E. Faturas** *(sem alterações)*
"Emitimos fatura por cada pagamento recebido, na data em que o recebemos, discriminada por taxa de IVA, e uma fatura final após a estadia que considera os pagamentos já feitos e pode ter valor a pagar zero. Se pretende fatura com número de contribuinte, indique-o no momento da reserva; depois de emitida, a fatura só pode ser corrigida por anulação e nova emissão."

**F. Caução de danos** *(por redigir)*
Cláusula própria, separada do plano de pagamento. Nas reservas em duas partes não há cartão na carteira do gestor até existir uma autorização própria para a caução.

**Higiene das CGV e do rodapé:**
- identificação completa (denominação, NIPC, sede, RNAL por casa);
- retirar o link à plataforma ODR (extinta pelo Reg. (UE) 2024/3228);
- RAL só se a Portugal Active estiver vinculada a alguma entidade;
- acrescentar o link ao Livro de Reclamações Eletrónico (hoje ausente do site);
- retirar a frase "os preços apresentados no nosso website são indicativos e podem variar", que contradiz o checkout de preço fechado.

## Bloco pré-contratual junto ao botão de pagar

Em todas as reservas, com qualquer método de pagamento:

> **{{denominação}}**, NIPC {{nipc}}, {{sede}}.
> Total: {{total}}. Pagamento: {{"tudo hoje" ou "{{hoje}} hoje e {{depois}} a {{data}}, no mesmo cartão"}}.
> Cancelamento gratuito até {{data}} às 23:59 (hora de Lisboa) *(ou: "Tarifa não reembolsável")*.
> Reserva de alojamento com datas fixas: não há direito de livre resolução de 14 dias. Aplica-se a política de cancelamento da sua tarifa.

**Falta-nos:** a denominação, o NIPC e a sede exatos, e saber quem é o prestador do alojamento em cada casa (a Portugal Active ou o proprietário, "em nome e por conta de"). Isto decide o texto e quem emite as faturas.

## Flex: execução imediata

Ao adicionar o Flex, o hóspede marca: "Ao adicionar o Flex concordo que a proteção começa de imediato e reconheço que, por isso, não há direito de livre resolução." Fica registado com a data e a versão. Pergunta: esta declaração deve cobrir também os extras com data (chef, transfers)?

## Política de Privacidade: secção nova "Pagamentos e cartão guardado"

- **Dados:** marca e últimos 4 dígitos do cartão, validade, identificador na Stripe, IP e texto da autorização aceite.
- **Finalidade e base legal:** cobrar o 2.º pagamento acordado; execução do contrato (art. 6.º n.º 1 b) RGPD).
- **Stripe:** subcontratante para a cobrança e responsável autónomo para prevenção de fraude e obrigações AML.
- **Prazos:**
  - cartão removido 120 dias após o check-out;
  - prova da autorização guardada 10 anos com o processo da reserva;
  - IP pseudonimizado aos 180 dias.
- **Direitos:** os direitos do titular e a reclamação à CNPD.

## Anexo: textos da autorização nas 9 línguas

Exemplo: 2.ª parte de 1 262,00 €, cobrada a 28 de junho de 2027, novas tentativas a 29 de junho e 1 de julho, cancelamento gratuito até 8 de julho de 2027 às 23:59 de Lisboa. No site, os valores e as datas são os de cada reserva.

### PT

**Caixa (não pré-marcada):** Autorizo a Portugal Active a cobrar 1 262,00 € a 28 de junho de 2027 no cartão que uso agora, como segunda e última parte desta estadia, e, se essa cobrança for recusada, a tentar de novo o mesmo valor até 8 de julho de 2027 às 23:59 (hora de Lisboa).

**Texto por baixo:** Ao pagar, autoriza a Portugal Active a cobrar 1 262,00 € a 28 de junho de 2027, no cartão que usar agora, como segunda e última parte desta estadia. Se a cobrança for recusada, avisamos por email, tentamos de novo o mesmo valor em 29 de junho de 2027 e 1 de julho de 2027, e tem 7 dias, contados do aviso, para pagar por outro meio; caso contrário a reserva é cancelada e devolvemos tudo o que pagou. Pode pagar antes, mudar de cartão ou cancelar a qualquer momento, no link da sua confirmação. Cancelamento gratuito até 8 de julho de 2027 às 23:59 (hora de Lisboa).

**Troca de cartão (página do saldo):** Autorizo a Portugal Active a cobrar 1 262,00 € a 28 de junho de 2027 neste novo cartão, como segunda e última parte desta estadia, com novas tentativas do mesmo valor até 8 de julho de 2027 às 23:59 (hora de Lisboa) se for recusada.

### EN

**Caixa (não pré-marcada):** I authorise Portugal Active to charge €1,262.00 on 28 June 2027 to the card I am using now, as the second and final part of this stay, and, if that charge is declined, to retry the same amount until 8 July 2027 at 23:59 (Lisbon time).

**Texto por baixo:** By paying, you authorise Portugal Active to charge €1,262.00 on 28 June 2027 to the card you are using now, as the second and final part of this stay. If the charge is declined, we will let you know by email, retry the same amount on 29 June 2027 and 1 July 2027, and you will have 7 days from that notice to pay by another method; otherwise the booking is cancelled and we refund everything you paid. You can pay early, change your card or cancel at any time, using the link in your confirmation. Free cancellation until 8 July 2027 at 23:59 (Lisbon time).

**Troca de cartão (página do saldo):** I authorise Portugal Active to charge €1,262.00 on 28 June 2027 to this new card, as the second and final part of this stay, with retries of the same amount until 8 July 2027 at 23:59 (Lisbon time) if it is declined.

### FR

**Caixa (não pré-marcada):** J'autorise Portugal Active à débiter 1 262,00 € le 28 juin 2027 sur la carte que j'utilise maintenant, comme deuxième et dernière partie de ce séjour, et, si ce débit est refusé, à retenter le même montant jusqu'au 8 juillet 2027 à 23:59 (heure de Lisbonne).

**Texto por baixo:** En payant, vous autorisez Portugal Active à débiter 1 262,00 € le 28 juin 2027 sur la carte que vous utilisez maintenant, comme deuxième et dernière partie de ce séjour. Si le débit est refusé, nous vous prévenons par e-mail, nous retentons le même montant le 29 juin 2027 et 1 juillet 2027, et vous disposez de 7 jours à compter de cet avis pour payer par un autre moyen ; à défaut, la réservation est annulée et nous remboursons tout ce que vous avez payé. Vous pouvez payer plus tôt, changer de carte ou annuler à tout moment, via le lien de votre confirmation. Annulation gratuite jusqu'au 8 juillet 2027 à 23:59 (heure de Lisbonne).

**Troca de cartão (página do saldo):** J'autorise Portugal Active à débiter 1 262,00 € le 28 juin 2027 sur cette nouvelle carte, comme deuxième et dernière partie de ce séjour, avec de nouvelles tentatives du même montant jusqu'au 8 juillet 2027 à 23:59 (heure de Lisbonne) en cas de refus.

### ES

**Caixa (não pré-marcada):** Autorizo a Portugal Active a cobrar 1.262,00 € el 28 de junio de 2027 en la tarjeta que uso ahora, como segunda y última parte de esta estancia y, si ese cobro es rechazado, a intentar de nuevo el mismo importe hasta el 8 de julio de 2027 a las 23:59 (hora de Lisboa).

**Texto por baixo:** Al pagar, autoriza a Portugal Active a cobrar 1.262,00 € el 28 de junio de 2027 en la tarjeta que usa ahora, como segunda y última parte de esta estancia. Si el cobro es rechazado, le avisamos por email, intentamos de nuevo el mismo importe el 29 de junio de 2027 y 1 de julio de 2027, y tiene 7 días, contados desde el aviso, para pagar por otro medio; de lo contrario, la reserva se cancela y le devolvemos todo lo que pagó. Puede pagar antes, cambiar de tarjeta o cancelar en cualquier momento, en el enlace de su confirmación. Cancelación gratuita hasta el 8 de julio de 2027 a las 23:59 (hora de Lisboa).

**Troca de cartão (página do saldo):** Autorizo a Portugal Active a cobrar 1.262,00 € el 28 de junio de 2027 en esta nueva tarjeta, como segunda y última parte de esta estancia, con nuevos intentos del mismo importe hasta el 8 de julio de 2027 a las 23:59 (hora de Lisboa) si es rechazado.

### IT

**Caixa (não pré-marcada):** Autorizzo Portugal Active ad addebitare 1.262,00 € il 28 giugno 2027 sulla carta che uso ora, come seconda e ultima parte di questo soggiorno e, se l'addebito viene rifiutato, a riprovare lo stesso importo fino al giorno 8 luglio 2027 alle 23:59 (ora di Lisbona).

**Texto por baixo:** Pagando, autorizza Portugal Active ad addebitare 1.262,00 € il 28 giugno 2027 sulla carta che usa ora, come seconda e ultima parte di questo soggiorno. Se l'addebito viene rifiutato, la avvisiamo via email, riproviamo lo stesso importo il 29 giugno 2027 e 1 luglio 2027, e ha 7 giorni dall'avviso per pagare con un altro metodo; altrimenti la prenotazione viene annullata e le rimborsiamo tutto quanto pagato. Può pagare prima, cambiare carta o annullare in qualsiasi momento, dal link nella sua conferma. Cancellazione gratuita fino al giorno 8 luglio 2027 alle 23:59 (ora di Lisbona).

**Troca de cartão (página do saldo):** Autorizzo Portugal Active ad addebitare 1.262,00 € il 28 giugno 2027 su questa nuova carta, come seconda e ultima parte di questo soggiorno, con nuovi tentativi dello stesso importo fino al giorno 8 luglio 2027 alle 23:59 (ora di Lisbona) se viene rifiutato.

### DE

**Caixa (não pré-marcada):** Ich ermächtige Portugal Active, am 28. Juni 2027 1.262,00 € von der Karte abzubuchen, die ich jetzt verwende, als zweiten und letzten Teil dieses Aufenthalts, und, falls diese Abbuchung abgelehnt wird, denselben Betrag bis 8. Juli 2027 um 23:59 Uhr (Lissabonner Zeit) erneut zu versuchen.

**Texto por baixo:** Mit Ihrer Zahlung ermächtigen Sie Portugal Active, am 28. Juni 2027 1.262,00 € von der Karte abzubuchen, die Sie jetzt verwenden, als zweiten und letzten Teil dieses Aufenthalts. Wird die Abbuchung abgelehnt, informieren wir Sie per E-Mail, versuchen denselben Betrag am 29. Juni 2027 und 1. Juli 2027 erneut, und Sie haben ab dieser Mitteilung 7 Tage Zeit, auf anderem Weg zu zahlen; andernfalls wird die Buchung storniert und wir erstatten alles, was Sie gezahlt haben. Sie können jederzeit früher zahlen, die Karte wechseln oder stornieren, über den Link in Ihrer Bestätigung. Kostenlose Stornierung bis 8. Juli 2027 um 23:59 Uhr (Lissabonner Zeit).

**Troca de cartão (página do saldo):** Ich ermächtige Portugal Active, am 28. Juni 2027 1.262,00 € von dieser neuen Karte abzubuchen, als zweiten und letzten Teil dieses Aufenthalts, mit erneuten Versuchen desselben Betrags bis 8. Juli 2027 um 23:59 Uhr (Lissabonner Zeit), falls sie abgelehnt wird.

### NL

**Caixa (não pré-marcada):** Ik machtig Portugal Active om op 28 juni 2027 € 1.262,00 af te schrijven van de kaart die ik nu gebruik, als tweede en laatste deel van dit verblijf, en, als die afschrijving wordt geweigerd, hetzelfde bedrag opnieuw te proberen tot 8 juli 2027 om 23:59 (Lissabonse tijd).

**Texto por baixo:** Door te betalen machtigt u Portugal Active om op 28 juni 2027 € 1.262,00 af te schrijven van de kaart die u nu gebruikt, als tweede en laatste deel van dit verblijf. Wordt de afschrijving geweigerd, dan laten we het u per e-mail weten, proberen we hetzelfde bedrag opnieuw op 29 juni 2027 en 1 juli 2027, en heeft u 7 dagen vanaf dat bericht om op een andere manier te betalen; anders wordt de boeking geannuleerd en betalen we alles terug wat u heeft betaald. U kunt op elk moment eerder betalen, van kaart wisselen of annuleren, via de link in uw bevestiging. Gratis annuleren tot 8 juli 2027 om 23:59 (Lissabonse tijd).

**Troca de cartão (página do saldo):** Ik machtig Portugal Active om op 28 juni 2027 € 1.262,00 af te schrijven van deze nieuwe kaart, als tweede en laatste deel van dit verblijf, met nieuwe pogingen voor hetzelfde bedrag tot 8 juli 2027 om 23:59 (Lissabonse tijd) als die wordt geweigerd.

### SV

**Caixa (não pré-marcada):** Jag godkänner att Portugal Active debiterar 1 262,00 € den 28 juni 2027 på det kort jag använder nu, som andra och sista delen av denna vistelse, och, om den debiteringen nekas, försöker igen med samma belopp fram till 8 juli 2027 kl. 23:59 (Lissabontid).

**Texto por baixo:** Genom att betala godkänner du att Portugal Active debiterar 1 262,00 € den 28 juni 2027 på det kort du använder nu, som andra och sista delen av denna vistelse. Om debiteringen nekas meddelar vi dig via e-post, försöker igen med samma belopp den 29 juni 2027 och 1 juli 2027, och du har 7 dagar från meddelandet att betala på annat sätt; annars avbokas bokningen och vi återbetalar allt du har betalat. Du kan när som helst betala tidigare, byta kort eller avboka via länken i din bekräftelse. Kostnadsfri avbokning fram till 8 juli 2027 kl. 23:59 (Lissabontid).

**Troca de cartão (página do saldo):** Jag godkänner att Portugal Active debiterar 1 262,00 € den 28 juni 2027 på detta nya kort, som andra och sista delen av denna vistelse, med nya försök med samma belopp fram till 8 juli 2027 kl. 23:59 (Lissabontid) om den nekas.

### FI

**Caixa (não pré-marcada):** Valtuutan Portugal Activen veloittamaan 1 262,00 € 28. kesäkuuta 2027 kortilta, jota käytän nyt, tämän majoituksen toisena ja viimeisenä osana, ja jos veloitus hylätään, yrittämään samaa summaa uudelleen 8. heinäkuuta 2027 klo 23:59 (Lissabonin aikaa) asti.

**Texto por baixo:** Maksamalla valtuutat Portugal Activen veloittamaan 1 262,00 € 28. kesäkuuta 2027 kortilta, jota käytät nyt, tämän majoituksen toisena ja viimeisenä osana. Jos veloitus hylätään, ilmoitamme sinulle sähköpostitse, yritämme samaa summaa uudelleen 29. kesäkuuta 2027 ja 1. heinäkuuta 2027, ja sinulla on 7 päivää ilmoituksesta maksaa muulla tavalla; muuten varaus perutaan ja palautamme kaiken maksamasi. Voit milloin tahansa maksaa aiemmin, vaihtaa korttia tai peruuttaa vahvistuksesi linkin kautta. Maksuton peruutus 8. heinäkuuta 2027 klo 23:59 (Lissabonin aikaa) asti.

**Troca de cartão (página do saldo):** Valtuutan Portugal Activen veloittamaan 1 262,00 € 28. kesäkuuta 2027 tältä uudelta kortilta tämän majoituksen toisena ja viimeisenä osana, ja yrittämään samaa summaa uudelleen 8. heinäkuuta 2027 klo 23:59 (Lissabonin aikaa) asti, jos veloitus hylätään.

