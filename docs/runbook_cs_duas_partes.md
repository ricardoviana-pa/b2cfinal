# Runbook do CS: reservas pagas em duas partes

Uma página para quem atende hóspedes e abre reservas no Guesty. As regras completas e os porquês estão em `docs/pagamento_duas_partes.md`.

## O que é

Nas reservas diretas elegíveis, o hóspede paga metade da estadia (mais os extras) quando reserva. A outra metade é cobrada **automaticamente pela plataforma** dez dias antes do fim do cancelamento gratuito, no mesmo cartão. O Guesty é só um espelho: mostra o que a plataforma cobrou.

## As três regras que nunca se quebram

1. **Nunca cobrar no Guesty uma reserva do site em duas partes.** Nem payment link, nem cartão, nem "collect payment". A reserva aparece como "Partially paid" durante semanas: é normal.
2. **Nunca pedir dados de cartão ao hóspede.** Se ele quer pagar, mudar de cartão ou cancelar, usa o link "Gerir o pagamento" do email de confirmação. O CS só reenvia o link.
3. **Nunca alterar datas, casa ou valor no Guesty** sem falar com a gestão. O motor deteta a mudança, suspende a 2.ª parte e põe a reserva em "a rever".

## Onde se vê

- **Nota da reserva no Guesty**: "Checkout 2.0 em duas partes: 1.a parte … registada; 2.a parte … agendada para DD/MM/AAAA, cobrada AUTOMATICAMENTE pela plataforma. NAO cobrar no Guesty…".
- **Ecrã Saldos** (admin do site → Saldos): cada reserva em duas partes, o estado, as datas, o cartão (só os últimos 4 dígitos), as tentativas e o histórico de ações. É o único sítio onde o CS age.
- **Digest diário** (booking@, 09:00): cobranças de hoje, falhas, reservas a rever, cancelamentos de amanhã, decisões humanas antes de D, reembolsos por resolver, efeitos por fechar. Com o motor desligado (CHECKOUT_BALANCE) abre com "MOTOR DESLIGADO": nada é cobrado nem cancelado sozinho e as linhas abertas são connosco.

## Estados (ecrã Saldos)

| Estado | O que quer dizer | O que fazer |
|---|---|---|
| Agendada | Tudo bem, a 2.ª parte está marcada | Nada |
| A cobrar | Uma tentativa está a correr | Nada |
| Nova tentativa | O banco recusou; o sistema tenta outra vez sozinho | Nada; o hóspede já foi avisado por email e SMS |
| Precisa do hóspede | O banco pede confirmação (3DS) ou o cartão foi recusado de vez | Se o hóspede ligar, reenviar o link; ele paga ou troca de cartão lá |
| Paga | Cobrada | Nada |
| Paga por fora | Recebida por outra via (transferência) | Confirmar que está registada no Guesty |
| **A rever** | Um humano tem de decidir (reserva alterada ou cancelada no Guesty, pagamento parcial por fora, pedido de ajuda, aviso de 7 dias impossível) | **Decidir antes da data indicada** no ecrã |
| A cancelar | Cancelamento em curso | Nada; se ficar mais de 1 h, a gestão recebe alerta |
| Cancelada (sem pagamento / pelo hóspede / pela equipa) | Reserva cancelada e reembolsada | Verificar que a Hostkit emitiu a nota de crédito e registar o número no ecrã. Se o "Estado do reembolso" disser FALHOU, devolver por outra via e usar **Reembolso resolvido à mão** |

## Ações no ecrã Saldos

- **Reenviar link**: manda ao email da reserva um link novo para a página do hóspede. O ecrã diz "Enviado" ou "Não foi possível enviar"; nunca mandar o link à mão por outro canal.
- **Cobrar agora**: tenta a 2.ª parte já, no cartão guardado. Só com o acordo do hóspede.
- **Marcar paga por fora**: quando o hóspede pagou por transferência. Pede referência, valor e data.
- **Pausar até…**: suspende as cobranças automáticas e põe a reserva "a rever" até à data.
- **Retomar**: devolve a reserva à cobrança automática (se ainda houver prazo). Numa reserva "a rever" em que a 2.ª parte já foi paga (o ecrã diz "A 2.ª parte já foi paga pela plataforma"), Retomar é **manter a estadia**: a linha fecha como paga, o pagamento é registado no Guesty e o hóspede recebe o email de pagamento. Nada é cobrado outra vez.
- **Cancelar e devolver**: cancela no Guesty e reembolsa. "Devolver tudo" (inclui Flex e extras) é o cancelamento pela equipa, o normal quando a culpa não é do hóspede: o hóspede recebe "Cancelámos a sua reserva e devolvemos…", sem falar de falta de pagamento nem de pedido dele, e a linha fica "Cancelada pela equipa". "Pela política" é como se o hóspede cancelasse (retém o Flex comprado há mais de 14 dias). O diálogo mostra o valor e os cartões que o sistema vai usar. Pede confirmação dupla. Bloqueado enquanto o hóspede está a pagar na página (menos de 1 hora).
- **Reembolso resolvido à mão**: só aparece quando um reembolso falhou na Stripe (cartão fechado, por exemplo). Depois de devolver por outra via, indicar como (ex.: "transferência 12/11") e escrever RESOLVIDO; a linha sai dos reembolsos por resolver do digest.
- **Registar nota de crédito**: o número que a Hostkit emitiu.

## Quando o hóspede liga

- "Quero pagar já" / "Mudei de cartão" / "O banco pediu uma confirmação": reenviar o link. Tudo se faz lá, em um minuto.
- "Quero cancelar": dentro do cancelamento gratuito, ele cancela no link e recebe o reembolso na hora. Depois do prazo, a política da tarifa aplica-se; registar o pedido e passar à gestão.
- "Não recebi o email": confirmar o email no ecrã Saldos e reenviar o link.
- "Já paguei por transferência": confirmar no banco, depois **Marcar paga por fora**.

## Alertas que chegam ao booking@ (com cópia à gestão)

- **"cancela amanhã às 12:00"**: a 2.ª parte continua por pagar. Uma chamada ao hóspede hoje pode salvar a reserva.
- **"decisão humana antes de …" / "não cancela sozinha"**: os 7 dias de aviso escrito não cabem antes do prazo; a reserva NÃO é cancelada automaticamente. Decidir no ecrã Saldos antes do fim do cancelamento gratuito.
- **"REEMBOLSO FALHOU na Stripe"**: o dinheiro não chegou ao hóspede. Contactar o hóspede, devolver por outra via e marcar **Reembolso resolvido à mão**.
- **"reserva alterada / cancelada no Guesty"**: alguém mexeu na reserva no Guesty. Decidir no ecrã Saldos.
- **"2.ª parte paga com a reserva a rever"**: o hóspede acabou de pagar a 2.ª parte numa reserva que estava a rever por causa do Guesty. O pagamento ficou gravado, mas nada foi registado no Guesty nem enviado ao hóspede. Manter a estadia: **Retomar**. Cancelar: **Devolver tudo**, que devolve as duas partes. Não registar o pagamento à mão no Guesty.
- **"2.ª parte cobrada duas vezes"**: o sistema já devolveu a segunda cobrança; só agir se o alerta disser que o reembolso falhou.
- **"DISPUTA aberta na Stripe"**: responder no Dashboard da Stripe antes do prazo, com o mandato aceite e os emails enviados.
