# Pagamentos, entrega e retry

Os adaptadores recebem eventos autenticados e aplicam acesso no banco da instalação. Configure contas e ofertas próprias e valide os contratos na conta de teste de cada provedor antes de receber pagamentos reais. Testes locais não certificam uma integração externa.

## Integrações e eventos

| Entrada | Autenticação/configuração | Contrato implementado |
| --- | --- | --- |
| Stripe `/api/webhooks/stripe` | `STRIPE_SECRET_KEY` e configuração ativa com signing secret; `STRIPE_WEBHOOK_SECRET` é apenas fallback do segredo nessa configuração | Checkout pago ou `no_payment_required`, aprovação assíncrona, renovação, cancelamento com período, reembolso integral e disputa. Um item por Checkout, mapeado por **Price ID**. |
| Guru `/api/webhooks/guru/<token>` | Token base64url de 16–128 caracteres; token anterior somente no prazo de rotação; produtor esperado opcional | Compra aprovada/concluída/paga, refund/chargeback e cancelamento com data válida. Payloads de assinatura devem identificar `last_transaction.id` ou `transaction_id`, não somente o ID da assinatura. |
| Genérico `/api/webhooks/generic` | `Authorization: Bearer <segredo>`; pelo menos 16 caracteres | Compra com `email`, `transaction_id`, `name` opcional, `product_id` opcional. Não presume suporte a cancelamento/reembolso genérico. |
| Hotmart `/api/webhooks/hotmart` | Configuração existente e hottok no header ou campo legado do corpo | Adaptador de compatibilidade, fora do catálogo de setup suportado. Aprovação/completo, refund/chargeback/protesto e cancelamento com data válida. Sem certificação de compatibilidade com a conta do provedor. |

Cada instalação usa seu próprio banco e suas próprias contas. Stripe, genérico e Hotmart permitem **uma configuração ativa por endpoint**; duas linhas ativas causam 503 para impedir escolha arbitrária de segredo/oferta. Guru seleciona configuração pelo token e também rejeita duplicação ambígua desse token. Configure um único vendedor por provedor: os identificadores externos são únicos por provedor na instalação.

A consulta do catálogo de oferta falha se o banco falhar, sem cair silenciosamente no nível padrão. Uma oferta ausente ainda usa o fallback configurado pelo administrador; sem oferta nem fallback a entrega é reagendada. E-mail inválido, envelope que não seja objeto JSON e campos obrigatórios inválidos resultam em 400, sem matrícula. IDs numéricos de produto são convertidos em texto.

## Stripe: decisões e limites

O handler verifica a assinatura do corpo original, aplica rate limit e só então normaliza/processa. Busca Checkout no provedor e verifica seu estado; `unpaid` não concede acesso. `checkout.session.async_payment_succeeded` pode concluir o pagamento posterior. Essa decisão segue o contrato oficial de [fulfillment](https://docs.stripe.com/checkout/fulfillment).

A primeira matrícula de assinatura usa o término do período da assinatura. Renovações aceitam `invoice.parent.subscription_details.subscription` e a referência legada. Reembolso/disputa resolve o Checkout pelo PaymentIntent; para cobranças de assinatura, usa Invoice Payments → invoice → subscription → Checkout, conforme a [API de Invoice Payments](https://docs.stripe.com/api/invoice-payment/list). Associação ambígua ou indisponível retorna 503 para retry do provedor e revisão.

Reembolso **parcial** não revoga automaticamente: o operador decide o efeito no acesso. Refund integral e disputa revogam imediatamente. Um cancelamento com período conhecido mantém o maior período já concedido. Reativar após chargeback, fraude ou reembolso exige intervenção explícita; um evento de renovação não remove esses motivos. Checkout com vários itens exige revisão: não se concede somente o primeiro em silêncio.

## Entrega durável e idempotência

1. Autenticar e validar sem registrar um evento concluído. Ping de teste autentica e audita, sem claim nem efeitos de acesso.
2. `claim_webhook_event` obtém posse com token aleatório e lease de cinco minutos. Entrega concluída retorna replay 200; claim em uso ou banco indisponível retorna 503. Uma entrega interrompida pode ser retomada após o lease.
3. O processador encontra/cria a conta e resolve a oferta. `apply_payment_enrollment` aplica matrícula, turmas e recibo por `(provider, transaction_id)` em uma transação. Chamadas concorrentes retornam o mesmo recibo; repetição não renova datas, reativa matrícula nem repete notificações. Matrículas anteriores com a mesma transação são adotadas sem renovar acesso.
4. `mutate_payment_enrollment` trava a matrícula ao revogar, renovar ou marcar expiração. Reembolso grava motivo mesmo se o cron já a deixou inativa. Renovações e cancelamentos antigos não encurtam uma data posterior. Matrícula ainda ausente é falha recuperável para eventos fora de ordem.
5. `finish_webhook_event` só conclui a posse correta depois do efeito. Em falha, a fila recebe trabalho normalizado versionado; 202 significa que a fila foi persistida. Sem persistência, 503 mantém a responsabilidade de retry no remetente. Nunca é devolvido sucesso apenas por ter tentado enfileirar.

A fila contém somente o contrato necessário à execução, incluindo e-mail do comprador; não contém assinatura, token Guru/Hotmart, signing secret ou senha. O acesso administrativo à fila continua sujeito às políticas da instalação. Não copiar seus payloads para repositórios/logs públicos.

O cron `webhook-retry` usa o mesmo executor para compra, revogação, expiração e renovação. Verifica provedor, versão e configuração ativa. Trabalhos antigos sem contrato normalizado ficam abandonados para revisão, sem inferir efeitos. Falhas já no lookup Stripe, antes de existir trabalho normalizado, retornam 503 e dependem do retry do provedor.

| Tentativa interna | Atraso após a falha anterior |
| --- | --- |
| 1 | 1 minuto |
| 2 | 5 minutos |
| 3 | 15 minutos |
| 4 | 1 hora |
| 5 | 6 horas |
| 6 | 24 horas |

Depois de falhar a sexta tentativa, a fila fica `abandoned`; exige diagnóstico/correção e replay explícito. O tempo real depende da frequência de execução do cron. Eventos e recibos de pagamento são mantidos pelo cleanup, preservando deduplicação; retenção/anonimização de histórico é decisão operacional separada.

## Limites importantes para operação

- Os quatro endpoints de pagamento limitam o corpo a **1 MiB (1.048.576 bytes)** durante a leitura. Excesso responde `413` e cancela o restante, inclusive sem `Content-Length`; o tamanho declarado é apenas uma recusa antecipada adicional. Tokens que podem ser verificados sem o corpo são conferidos antes de lê-lo. A assinatura Stripe usa os bytes originais. Esses controles não configuram os limites do proxy/hospedagem.
- A estrutura mantém **uma matrícula por aluno/nível de acesso**. Nova compra desse nível substitui a transação corrente. Reembolso de transação anterior que já foi substituída exige revisão; não revoga automaticamente uma compra mais recente.
- Entrega de e-mail e notificação é independente da concessão de acesso e não tem promessa de exatamente uma vez. Uma interrupção entre Auth e inicialização do perfil, ou após o recibo e antes do aviso, pode exigir recuperação de senha ou reenvio pelo administrador. Senhas não são gravadas no recibo/fila para tentar repetir onboarding.
- Producer ID do Guru é verificação de consistência, não uma segunda credencial; a URL inteira continua secreta. Rotação e prazo devem ser alinhados com a origem.
- Sem data válida no cancelamento, o adaptador retorna 400 para correção/reenvio; não presume revogação imediata de um período pago. Eventos desconhecidos são ignorados sem matrícula.
- Limite de taxa por configuração é proteção simples com janela de 60 segundos; não é quota exata sob concorrência. O claim e o recibo controlam os efeitos independentemente desse limite.

## Verificação da instalação

Aplique todas as migrations versionadas antes de usar os adaptadores. Os testes em `lib/webhooks` cobrem autenticação, normalização, claim, fila e falhas com dependências controladas. [payments.test.mjs](../../tests/database/payments.test.mjs) verifica concorrência de claim/lease, recibos, revogação, períodos e permissões com PostgreSQL local por meio de `npm run db:test`; consulte [desenvolvimento local](../development/local-database.md) para preparar o ambiente.

Valide o percurso HTTP → banco → matrícula/acesso → captura de e-mail, incluindo replay, retry, revogação e cancelamento com dados fictícios. Depois compare os payloads e callbacks nas contas de teste dos provedores configurados. Assinatura e API simuladas não equivalem à comunicação com o provedor real. Configure e monitore o [job de retry](email-jobs.md) no host da instalação.
