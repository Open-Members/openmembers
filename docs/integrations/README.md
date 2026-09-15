# Integrações

Cada organização usa uma instalação e um projeto Supabase independentes. Auth e banco são obrigatórios; os demais provedores dependem dos recursos habilitados. Configure contas, credenciais e conteúdo próprios.

**Configurado não significa validado.** Esta matriz descreve requisitos e comportamento da aplicação. Testes locais com dependências controladas não comprovam comunicação, entrega ou callbacks do serviço externo; valide os provedores que pretende usar em um ambiente de teste próprio.

| Integração | Requisitos da instalação | Comportamento e limites |
| --- | --- | --- |
| Supabase Auth/DB | URL, anon key, service role; migrations versionadas e administrador inicial | Núcleo obrigatório. Sem configuração, a entrada orienta para setup e as APIs dependentes devolvem 503. |
| Supabase Storage | Buckets das migrations, sessão e regras de acesso | Anexos privados; marca e avatares públicos. Veja limites, URLs assinadas e limpeza no [guia de armazenamento](storage.md). |
| Stripe | `STRIPE_SECRET_KEY`, configuração ativa com segredo de webhook em Admin ou fallback `STRIPE_WEBHOOK_SECRET`, ofertas por Price ID | Cliente inicializado sob demanda. Configure a mesma conta/ambiente das ofertas e valide checkout, renovação, reembolso, disputa e retry na conta de teste. Veja [pagamentos](payments.md). |
| Guru | Configuração ativa, token de URL, identificação de conta conforme o adaptador e produto/pacote em Admin | A URL é credencial; não a publique em logs de acesso. Compare os postbacks com o contrato da conta do provedor. |
| Webhook genérico | Bearer token em Admin e payload de compra com transação, produto ou pacote fallback | Requisição inválida não concede acesso. O endpoint não define protocolo genérico de assinatura, cancelamento ou reembolso. |
| Hotmart | Adaptador de compatibilidade, fora do catálogo administrativo suportado | A existência da rota não certifica compatibilidade operacional. Exige revisão do contrato e teste com a conta do provedor antes de uso. |
| E-mail local | `EMAIL_TRANSPORT=mailpit`, `MAILPIT_URL` em loopback e Supabase | Captura local explícita, sem fallback para entrega externa. Auth local usa SMTP separado. Veja [e-mail e jobs](email-jobs.md). |
| Resend | `RESEND_API_KEY`, remetente próprio verificado em Admin/env e URL da instalação | Suporte e mensagens transacionais usam transporte comum. Sem transporte configurado, o envio retorna indisponibilidade. Aceitação não comprova entrega à caixa de entrada. |
| Hook de e-mail Auth | `SEND_EMAIL_HOOK_SECRET`, origem válida, transporte e hook habilitado no Supabase | Valida assinatura antes de renderizar/enviar. Não substitui SMTP local automaticamente; valide cadastro, recuperação, troca de e-mail e reautenticação. |
| Webhook Resend | `RESEND_WEBHOOK_SECRET` e Supabase administrativo | Entrada assinada e deduplicada por identidade de evento. Valide entrega, bounce e reenvio com eventos da conta do provedor. |
| R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, bucket privado e CORS da origem | Sem configuração, upload desabilitado na UI e APIs indisponíveis. O limite declarado de upload não é quota de bytes recebidos. Veja [armazenamento](storage.md). |
| Jobs | `CRON_SECRET`, Supabase e agendador próprio; e-mail quando o job envia aviso | Rotas protegidas não criam agenda automaticamente. Configure disparos, observação de falhas e recuperação conforme o [guia de operação](../deployment/operations.md). |
| Chat IA | `COURSE_CHAT_ENABLED=true`, Gateway key, DB URL, Supabase e corpus autorizado | Desativado por padrão na UI e nas rotas. Corpus ausente impede geração. Ingestão não distribuída; veja [chat e recursos](../features/overview.md). |
| Google/Apple OAuth | `OAUTH_PROVIDERS=google,apple`, credenciais/providers habilitados no Supabase | Ação do servidor desativada por padrão; interface de entrada social não distribuída. Apenas nomes listados são aceitos; callback usa a origem confiável em `/api/auth/callback`. É necessário implementar a UI e validar sessão/troca de conta. |
| YouTube/Vimeo | Referência de vídeo autorizada pelo administrador | Embed depende de rede e política do vídeo, sem chave de API. Vimeo aceita ID/URL e hash privado, usa `dnt=1`, sem upload/API próprios. Confira origem, retomada e fim no [guia do player](../features/player.md). |
| GA4 | `NEXT_PUBLIC_GA4_MEASUREMENT_ID` próprio no build, formado por `G-` e letras/números maiúsculos | Sem ID válido, nenhum script é renderizado. Quando configurado, carrega após interatividade. Valide eventos e consentimento conforme a política da instalação. |
| Meta Pixel | `NEXT_PUBLIC_META_PIXEL_ID` numérico próprio no build | Sem ID válido, script e rastreador desativados. `PurchaseTracker` lê valor/moeda da query da página de agradecimento; esse evento controlável pelo visitante não comprova pagamento. Valide consentimento e deduplicação. |
| Sentry | DSN público/servidor; token, organização e projeto próprios para upload de sourcemaps | Node/edge preferem `NEXT_PUBLIC_SENTRY_DSN` não vazio a `SENTRY_DSN`; cliente usa somente DSN público, sob demanda em caminhos autenticados. Sem DSN não inicializa. Traces em 10%, replay desativado. Valide recepção, dados pessoais e sourcemaps; nunca publique o token. |
| Push/PWA | Manifesto configurável; worker, registro de UI e emissor não distribuídos | Novas assinaturas push desativadas; retirada autenticada preservada. `NEXT_PUBLIC_VAPID_PUBLIC_KEY` sozinho não habilita entrega. Manifesto não comprova instalação/offline; valide cada plataforma antes de oferecer esses recursos. |

## Configuração e isolamento

Use `.env.example` para os nomes das variáveis e `openmembers.config.json` apenas para apresentação. Configurações de webhook ficam no painel e no banco administrativo da instalação. Segredos de assinatura não são chaves públicas. O núcleo usa as ofertas por Price ID; `STRIPE_PRICE_MONTHLY` e `STRIPE_PRICE_ANNUAL` não configuram o fluxo ativo.

`BREVO_API_KEY` não habilita envio. Aliases antigos de nome/endereço podem continuar como fallback de remetente, mas não representam suporte ao provedor Brevo. Novas configurações devem usar `RESEND_SENDER_EMAIL`/`RESEND_SENDER_NAME` ou o painel.

O runner local remove credenciais herdadas de provedores, força captura Mailpit e desativa IA/OAuth. Habilitar um serviço externo exige configuração explícita fora desse ambiente isolado. Variáveis públicas entram no build do Next.js: mudar URL/anon key do Supabase ou IDs de analytics exige reconstrução. Segredos e flags operacionais de servidor são configuração de runtime. A configuração pública de marca permanece externa ao artefato; consulte [personalização](../customization.md).

O agendamento no host, a entrega externa e o comportamento dos provedores precisam de verificação na infraestrutura que os executa. Um teste local de anexos, captura de e-mail ou execução de job não certifica R2, Resend ou um agendador remoto.
