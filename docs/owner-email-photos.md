# Respostas e fotografias recebidas de proprietários

Pedido de Ricardo, 04–05/11/2026. O proprietário pode responder ao email com fotografias ou usar o botão existente. Ambos os caminhos atualizam o mesmo pedido e o mesmo negócio Pipedrive. Não criam uma nova conversão.

## Receção e associação

O worker independente do PA Core lê apenas a etiqueta Management da conta Google já ligada, com permissão de leitura. Não altera etiquetas nem envia mensagens Gmail. O B2C recebe primeiro metadados autenticados por HMAC; só pede os anexos depois de confirmar o remetente e uma referência ao pedido. Referências aceites: identificador completo, ligação privada existente ou Message-ID original confirmado pelo Resend. O webhook `/api/webhooks/owner-email-events` valida a assinatura Svix e guarda apenas os dois identificadores de correlação, sem destinatários ou conteúdo.

O endereço do remetente, o contacto atual e o negócio atual são reconfirmados. Referências contraditórias, negócio fechado ou identidade incerta originam revisão; não se escolhe uma propriedade apenas porque tem o mesmo email. Respostas que chegam antes do registo CRM/webhook aguardam até quinze minutos antes de serem classificadas como sem referência. Emails automáticos, mensagens internas, assinaturas e anexos citados são excluídos; testes internos exigem allowlist exata de pedido.

## Persistência e repetição

As tabelas `owner_email_messages`, `owner_email_files`, `owner_email_outbound_ids` e `owner_email_state` são aditivas, criadas pelo inicializador existente. Mailbox + ID Gmail identificam cada mensagem. Cada anexo tem recibo permanente e digest SHA-256. O sincronizador CRM usa o mesmo digest e journal do formulário, incluindo a reconciliação de um upload cuja resposta se perdeu. Receber novamente a mensagem ou os mesmos bytes não cria outro ficheiro, contacto, negócio ou conversão.

Aceitam-se JPEG, PNG, WebP, HEIC/HEIF e PDF com conteúdo validado; PDFs não contam como fotografias. Limites: 15 MiB por anexo, 75 MiB e 30 anexos por mensagem. O transporte é sequencial e partilha o limite de memória de uploads sem ocupar a via de captação de contactos. Ficheiros recusados recebem um estado final, sem tentativas infinitas. Os originais permanecem no Gmail. Os bytes de transporte são removidos apenas após sincronização integral confirmada no negócio correto; ficam digest, nome, ID Pipedrive e data.

Fotografias confirmadas aparecem como recebidas no link de seguimento. Qualquer resposta humana associada com segurança, mesmo sem anexos ou apenas com um link, suspende os pedidos automáticos de fotografias para a equipa comercial avaliar o conteúdo. Um PDF ou texto não é apresentado como fotografia recebida. A validação é repetida imediatamente antes de entregar um lembrete que já estava em fila.

Cada resposta fica numa nota própria no histórico do negócio, com remetente, assunto, data e apenas o texto novo. Links públicos ficam clicáveis; ligações privadas de continuação, HTML executável e histórico citado são removidos. Não é uma ligação à caixa de correio nativa do Pipedrive. A nota principal do formulário mantém-se e as respostas não ficam fixadas no topo. O marcador permanente por mensagem, a lease do sincronizador e a reconciliação de POST incerto impedem repetir a nota quando a mesma mensagem é reprocessada. Mensagens diferentes podem ter notas diferentes, mesmo quando reenviam as mesmas fotografias; os ficheiros continuam deduplicados por conteúdo.

Não é enviado outro aviso de sucesso para Management: a resposta original já chegou a essa caixa. Uma associação de fotografias duvidosa gera apenas um aviso de revisão. Se um novo formulário encontra um negócio aberto preexistente sem uma associação segura, os dados ficam guardados e Management recebe um aviso único com a ligação ao contacto. Responder a esse aviso mantém a conversa na equipa interna. Não se cria um negócio duplicado nem se altera a etapa ou decisão comercial para desbloquear a integração.

Atualização de 05/11/2026: a tabela de mensagens recebe quatro colunas aditivas para texto saneado, ID da nota e estado de nova tentativa. Publicar primeiro o B2C compatível e só depois o Core que inclui `replyText`. Os históricos com o formato antigo só podem ser enriquecidos se todos os restantes metadados mantiverem o hash original e o vínculo atual for novamente confirmado. A saúde CRM sinaliza notas de resposta em erro ou atrasadas.

## Ativação e controlo

- B2C produção: `OWNER_EMAIL_PHOTOS_ENABLED=true` e `OWNER_EMAIL_INGEST_SECRET` (64 hex).
- Core produção: `OWNER_EMAIL_PHOTOS_ENABLED=1` e o mesmo segredo, após a sua migration dedicada. Preservar todas as outras flags e `MAIL_SOURCES`.
- Webhook Resend `email.sent`: URL acima e `OWNER_EMAIL_RESEND_WEBHOOK_SECRET`; manter plano gratuito. A chave de envio não ganha acesso de leitura.
- `/api/internal/owner-email-photos/health` expõe apenas disponibilidade, heartbeat e necessidade de revisão. Um problema nesta integração não bloqueia o formulário público. O Core envia heartbeat assinado após cada leitura concluída.
- Desligar a flag Core interrompe novas importações. Conservar tabelas e recibos para manter a deduplicação. Nunca reabrir todas as mensagens em revisão; resolver cada associação explicitamente.

Todos os testes locais usam dados fictícios. A verificação operacional controlada deve identificar o pedido QA, comprovar a receção Gmail, conferir os bytes no negócio existente e repetir a mensagem/fotografia para demonstrar zero duplicados. Não usar contactos reais como testes. A quota transacional gratuita continua a limitar emails enviados; esta receção Gmail não a consome.
