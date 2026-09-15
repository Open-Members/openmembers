# E-mail e tarefas agendadas

Mensagens transacionais usam um transporte compartilhado. O desenvolvimento local pode capturar mensagens no Mailpit; entrega externa exige provedor e remetente próprios. Configure os jobs e monitore sua execução conforme o [guia de operação](../deployment/operations.md).

## Transportes e configuração

Os endpoints `/api/auth/send-email` e `/api/webhooks/resend` limitam o corpo a **1 MiB (1.048.576 bytes)** durante a leitura, antes de renderizar, enviar ou gravar eventos. Excesso responde `413`, falha de leitura responde `400` e cabeçalhos de assinatura ausentes são recusados antes da leitura. A validação HMAC usa os bytes originais; JSON é decodificado depois. Esses limites da aplicação não configuram o proxy ou a hospedagem.

| Modo | Configuração | Comportamento |
| --- | --- | --- |
| Desabilitado | Sem configuração válida | Retorna falha de configuração, sem requisição ao provedor. O hook Auth responde 503. |
| Resend | `EMAIL_TRANSPORT=resend` ou vazio; `RESEND_API_KEY`, remetente e Supabase | Usa a API HTTPS do Resend. Remetente do painel tem prioridade sobre `RESEND_SENDER_EMAIL/NAME`. O domínio deve ser verificado na conta da organização. |
| Captura de desenvolvimento | `EMAIL_TRANSPORT=mailpit`, `MAILPIT_URL=http://127.0.0.1:55434` | POST JSON `/api/v1/send`; somente HTTP loopback, sem credenciais, caminho, query ou fragmento no endereço base. Sem fallback para Resend e sem seguir redirects. Remetente fictício `openmembers@example.test`. |

`npm run dev:local` injeta Mailpit do projeto Open Members, Supabase local e bloqueia credenciais opcionais herdadas, OAuth e IA. Os aliases `BREVO_SENDER_EMAIL/NAME` ainda são aceitos internamente pelo transporte Resend para instalações antigas; `BREVO_API_KEY` não habilita envio. O suporte usa o mesmo transporte e não faz chamadas diretas à Brevo.

O transporte espera um ID na resposta de sucesso, impõe timeout de 10 segundos e registra tentativas em `email_sends`. `metadata.transport` distingue captura e Resend. `sent` indica aceitação pelo transporte; não comprova entrega à caixa de entrada. Falha de auditoria após aceitação é registrada no log, sem reenviar automaticamente. Respostas públicas e logs do transporte não incluem destinatário nem corpo de erro do provedor.

A configuração administrativa expõe somente `resend`, `mailpit` ou ausência de configuração à UI. Credenciais permanecem no servidor. O teste de e-mail diferencia aceitação pelo provedor de captura local. Notificação de suporte é opcional e nunca impede criar o ticket.

## Auth e eventos assinados

O hook `/api/auth/send-email` valida assinatura HMAC-SHA256 v1 no corpo original e timestamp dentro de cinco minutos. Payload válido é necessário antes de renderizar. Recovery, signup, invite e magiclink apontam para a origem configurada em `NEXT_PUBLIC_SITE_URL`, ignorando origem/redirect externos do payload. Reautenticação envia o OTP recebido, sem transformá-lo em link de login.

Na troca segura de e-mail, uma chamada envia duas mensagens: endereço atual recebe `token_hash_new`; endereço novo recebe `token_hash`. Com apenas um hash, envia ao endereço novo. Esse mapeamento segue a [documentação oficial do hook Supabase](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook). Falha em qualquer destinatário retorna 502 e cada mensagem conserva chave independente em nova tentativa.

Hook Auth, aviso de expiração e notificação de suporte passam chave de idempotência ao Resend. A janela do provedor é de 24 horas, conforme [Resend Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys). Isso não garante exactly-once fora da janela, nem resolve atomicamente o intervalo entre envio e auditoria. Mailpit não promete deduplicação do envio: retries podem criar mais de uma captura. Não há fila independente para todos os e-mails transacionais; suporte é uma tentativa, Auth propaga falha ao chamador, aviso de expiração é retomado pela agenda.

O endpoint `/api/webhooks/resend` valida Svix v1/timestamp e o formato de data, destinatário e ID. Deriva UUID estável do `svix-id` e utiliza a chave primária de `email_events`: repetição retorna 200 sem outra linha; falha de persistência retorna 500 para permitir retry. Evento atrasado de entrega não é classificado como falha definitiva. Corpo bruto é preservado no banco da organização e pode conter dados pessoais; não há retenção automática desses eventos.

## Agenda de referência

Configure a agenda na infraestrutura da organização; as rotas não criam um agendador automaticamente. Todas as chamadas são GET, com `Authorization: Bearer <CRON_SECRET>` no cabeçalho. Segredo ausente ou Supabase não configurado responde 503; token inválido responde 401 antes de criar o cliente privilegiado. Datas e exemplos abaixo usam UTC.

| Rota | Frequência inicial | Trabalho, repetição e falhas |
| --- | --- | --- |
| `/api/cron/expire-enrollments` | A cada hora | Desativa somente matrículas ainda ativas com expiração anterior ao instante atual. Repetição não altera outras linhas. A autorização já bloqueia acesso expirado antes do job. Erro SQL responde 500. |
| `/api/cron/expiration-warning-7d` | A cada hora | Seleciona expirações entre agora + 6 dias (inclusive) e + 7 dias (exclusivo). Usa cooldown de oito dias por usuário e chave matrícula/expiração. Só envia a perfis ativos; pagina consultas em lotes de 500 com ordem por ID. Falha na consulta de cooldown impede envio; falha parcial responde 503 com contadores. Repetir durante essa janela. Não há backfill de expirações que já saíram dela. |
| `/api/cron/drip-check` | A cada hora | Avalia instante exato, cobre liberações nos últimos sete dias e matrículas ativas não expiradas de perfis ativos. Usa matrícula válida mais antiga, regra canônica por alvo em ordem `created_at,id`, curso publicado fora de coming-soon e alvo publicado. Pagina leituras e escreve lotes de até 500. |
| `/api/cron/webhook-retry` | A cada minuto | Até 20 itens de trabalho normalizado e autenticado. Claim otimista move deadline por cinco minutos; o processamento de pagamentos também utiliza lease persistente. Confere configuração ativa/provedor e retorna item ao backoff em falha. Payload legado ou configuração inválida exige revisão manual. Erro ao salvar estado responde 500. |
| `/api/cron/webhook-cleanup` | A cada cinco minutos | Apaga hits de rate limit com mais de cinco minutos e limpa segredo anterior cuja janela de rotação expirou. Reexecução é segura. Não remove logs, recibos, eventos de deduplicação ou fila. Falha responde 500. |

O aviso drip usa `notifications.dedupe_key=drip/<regra>/<instante>` e índice único por usuário/chave da migration `20260911000600_email_jobs.sql`. Conflito é ignorado atomicamente; falha de lote responde 500 e a reexecução preserva os já gravados. Chave nula mantém notificações normais independentes. Avisos gerais de curso/módulo não substituem regras mais específicas de aula; acesso continua calculado pelas políticas/RPCs.

Execuções de drip perdidas há mais de sete dias e avisos de expiração fora da janela precisam de decisão operacional. Um job muito grande pode ultrapassar o limite da hospedagem: não há worker/fila geral ou garantia de escala ilimitada. Monitorar status HTTP, duração e contadores; erro exige retry/inspeção. O retry de pagamentos e sua cadência estão detalhados no [guia de pagamentos](payments.md).

## Verificação da instalação

Use o ambiente local para verificar captura de HTML/texto, auditoria, repetição e falhas dos jobs com dados fictícios. Confirmação e recuperação nativas usam o SMTP de desenvolvimento. `dev:local` mantém `SEND_EMAIL_HOOK_SECRET` vazio; esse fluxo não testa a conexão do hook hospedado.

Antes de operar externamente, valide assinatura, cadastro, recuperação, troca segura de e-mail, OTP, entrega e eventos na conta do provedor. A aceitação pelo Resend e a captura no Mailpit não comprovam entrega à caixa de entrada. Verifique também os cinco disparos agendados, falhas e recuperação no host; o [roteiro do piloto](../deployment/validation.md) ajuda a organizar essa validação.
