# Instalação independente — Docker em Linux

Este guia prepara **uma aplicação e um projeto Supabase exclusivos por organização**. O percurso de referência usa Docker em Linux, com banco, conteúdo e credenciais próprios da instalação.

O núcleo passou por verificações em Supabase local, incluindo migrations, Auth, administrador, matrícula, arquivos e navegador. O percurso hospedado em Linux/VPS descrito abaixo ainda não foi validado de ponta a ponta. Host, domínio, e-mail, agenda e Supabase hospedado precisam ser testados na instalação escolhida antes de receber dados reais. Consulte o [guia do pacote de fonte](source-package.md) e as [limitações conhecidas](../known-limitations.md).

## 1. Escolher o percurso

| Objetivo | Percurso |
| --- | --- |
| Desenvolver ou conhecer a demonstração | [Guia local](../development/local-database.md): `db:start`, `db:seed` e `dev:local` |
| Instalar para uma organização | Novo Supabase hospedado, aplicação Docker e configuração própria, conforme este guia |
| Validar instalação independente | Máquina/VM/daemon separado, pacote de fonte e revisor seguindo [o guia do pacote de fonte](source-package.md) |

Os scripts `db:*`, `dev:local`, `build:local` e `admin:create` verificam o Supabase local `openmembers`, portas fixas e ausência de vínculo remoto. Mantenha esses guards. Um segundo checkout no mesmo Docker usa a mesma pilha local e não comprova isolamento entre instalações.

## 2. Requisitos e preparação

- Host Linux com systemd (`systemctl`, `timedatectl`, `journalctl`, `systemd-analyze`), Docker Engine, plugin Docker Compose e proxy HTTPS. Outro gerenciador de serviços exige adaptação e validação da agenda. A aplicação de referência usa um único processo/container.
- Uma revisão identificada do Open Members, em checkout Git ou pacote de fonte conferido. Registre o commit efetivamente recebido; a versão `0.1.0` de `package.json` sozinha não identifica a revisão instalada.
- Para administrar as migrations fora do container: Node.js 22.23.2, npm 10.9.2 e dependências do lockfile. A CLI Supabase 2.117.0 está no projeto; não depende de uma CLI global.
- Projeto Supabase novo, domínio da organização, responsável pela instalação e acesso administrativo aos serviços próprios.
- Espaço para checkout, dependências, imagem e logs. Verifique o disco antes do build; dimensionamento e carga ainda precisam do piloto.

Os exemplos consideram o checkout em `/opt/openmembers`, segredos em `/etc/openmembers/application.env` e apresentação pública em `/etc/openmembers/installation.json`. O usuário que opera Docker precisa ler o arquivo de ambiente; restringir essa leitura não substitui restringir acesso ao daemon Docker. Execute a preparação de diretórios/permissões com a conta administradora do host, conforme a política desse host.

Na cópia destinada à instalação, depois de selecionar a revisão escolhida:

```sh
cd /opt/openmembers
npm ci --ignore-scripts --no-audit --no-fund
```

Em checkout Git, registre `git rev-parse HEAD` e confira árvore limpa. Em pacote `git archive` sem `.git`, confira o hash do arquivo recebido e registre o SHA fornecido pelo mantenedor, conforme [identificação do pacote](source-package.md#preparar-ou-conferir-um-pacote); não execute comandos Git nesse pacote. Se o pacote ainda não estiver extraído, siga a [extração conferida no Linux](source-package.md#extrair-um-pacote-conferido-no-linux). Os passos seguintes pressupõem que a revisão já ocupa `/opt/openmembers`.

Não use `git pull` como atualização automática de uma instalação ativa. O [guia operacional](operations.md) descreve seleção de revisão, backup e retorno à imagem anterior.

## 3. Preparar o Supabase e aplicar migrations

Crie um projeto na conta da organização. Ele deve estar sem tabelas da aplicação, sem usuários Auth e sem dados de outra instalação. As migrations dependem dos serviços, schemas e papéis do Supabase; um PostgreSQL genérico vazio não os fornece. A sequência também cria `pgcrypto` no schema `extensions` e `vector` no schema `public`.

Use uma cópia de implantação separada da demonstração local. Autentique a CLI pelo prompt e confira no painel que o identificador pertence ao projeto **novo**. O fluxo oficial é vincular, visualizar migrations pendentes e aplicá-las; a CLI registra o histórico e ignora versões já aplicadas. [Referência Supabase: migrations](https://supabase.com/docs/guides/deployment/database-migrations) e [CLI: `db push`](https://supabase.com/docs/reference/cli/supabase-db-push).

```sh
cd /opt/openmembers
npx supabase login
npx supabase link --project-ref IDENTIFICADOR_DO_PROJETO_NOVO
npx supabase migration list
npx supabase db push --dry-run
```

O primeiro dry-run deve listar estas dez migrations, nesta ordem:

1. `20260911000100_schema.sql`
2. `20260911000200_access.sql`
3. `20260911000300_storage.sql`
4. `20260911000400_integrity.sql`
5. `20260911000500_payment_delivery.sql`
6. `20260911000600_email_jobs.sql`
7. `20260911000700_manual_enrollment.sql`
8. `20260911000800_profile_locale.sql`
9. `20260912000900_notification_descriptors.sql`
10. `20260912001000_quiz_attempt_transaction.sql`

Se houver histórico inesperado, tabelas existentes ou uma extensão no schema incompatível, interrompa a instalação nesse projeto e investigue. Não repare o histórico, remova tabelas ou altere migrations para forçar uma instalação sobre dados desconhecidos.

Com projeto e lista conferidos pelo operador:

```sh
npx supabase db push
npx supabase migration list
```

Confirme as dez versões no histórico remoto e os três buckets: `avatars` e `platform-assets` públicos; `lesson-materials` privado. Não use `--include-seed`, `db reset --linked`, `db:reset` nem `db:verify` neste percurso. As fixtures e a senha demo pertencem exclusivamente ao ambiente local.

O arquivo `supabase/config.toml` configura a pilha **local**. Aplicar migrations não transfere automaticamente suas opções de Auth, SMTP, redirect ou limites ao projeto hospedado. Configure essas opções no serviço hospedado. Crie a primeira conta somente depois das migrations, pois o trigger de criação do perfil não faz backfill de usuários anteriores.

## 4. Configurar Auth e e-mail

No projeto Supabase, habilite e-mail/senha e confirmação de e-mail. Use a origem HTTPS real como **Site URL**, por exemplo `https://members.example.org`. Em Redirect URLs, cadastre o callback desta aplicação: `https://members.example.org/api/auth/callback`. Mantenha callback e Site URL na mesma origem. Não libere domínios de terceiros ou previews indiscriminadamente. [Referência Supabase: redirects](https://supabase.com/docs/guides/auth/redirect-urls).

Cadastro e recuperação acrescentam `next` à query do callback, por exemplo `?next=%2Fdashboard` e `?next=/reset-password`. A implementação atual do Supabase Auth permite destinos na mesma origem da Site URL; confirme esse comportamento no projeto do piloto, inclusive cadastro iniciado por um link de curso. O callback do Open Members restringe `next` a destinos internos. Essa leitura da [implementação Supabase](https://github.com/supabase/auth/blob/master/internal/utilities/request.go) não substitui o teste de confirmação/recuperação através do serviço hospedado.

Configure SMTP próprio no Supabase para confirmação e recuperação nativas. O SMTP padrão hospedado tem restrições de destinatários e não é o transporte recomendado para usuários de produção. O hook HTTP de Auth é uma alternativa separada, ainda sem homologação externa nesta versão. [Referência Supabase: SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

Há duas configurações de e-mail independentes:

- **Auth do Supabase:** SMTP ou hook, configurado no próprio projeto, para confirmação e recuperação.
- **Aplicação:** `EMAIL_TRANSPORT=resend`, credenciais/remetente próprios e teste de entrega para convite, suporte e avisos. Configurar SMTP no Supabase não habilita esses envios.

Leia [e-mail e jobs](../integrations/email-jobs.md) antes de habilitar hook ou eventos assinados. Não aponte um container hospedado para `MAILPIT_URL=http://127.0.0.1:55434`: dentro dele esse endereço é o próprio container. Mailpit de desenvolvimento não é um serviço de entrega externo.

OAuth, pagamentos, IA, R2 e telemetria podem continuar desabilitados. Cada integração ativada precisa de conta própria e do seu ensaio; consulte [a matriz](../integrations/README.md).

## 5. Preparar ambiente e apresentação

Crie os dois arquivos fora do Git com propriedade do operador que executa Compose. O ambiente permanece privado em `0600`; a apresentação é pública e legível pelo UID 1001 do container:

```sh
cd /opt/openmembers
if sudo test -e /etc/openmembers || sudo test -L /etc/openmembers; then echo 'Recuse: /etc/openmembers já existe; inspecione-o sem sobrescrever.' >&2; exit 1; fi
sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" /etc/openmembers
install -m 0600 deploy/application.env.example /etc/openmembers/application.env
install -m 0644 openmembers.config.example.json /etc/openmembers/installation.json
```

Edite as cópias em `/etc/openmembers`; não altere os exemplos do checkout. Complete os valores da organização no arquivo de ambiente. A `.env.example` da raiz documenta integrações adicionais. Não imprima o arquivo em logs ou tickets.

Confira estas opções de implantação no arquivo:

```dotenv
OPENMEMBERS_ENV_FILE=/etc/openmembers/application.env
OPENMEMBERS_CONFIG_PATH=/etc/openmembers/installation.json
OPENMEMBERS_IMAGE=openmembers:COMMIT_CANDIDATO
OPENMEMBERS_PORT=3000
```

Substitua `COMMIT_CANDIDATO` pelo identificador registrado. Ele é uma etiqueta local para a imagem, não uma imagem publicada pelo projeto. A porta será exposta apenas em `127.0.0.1` no host. `OPENMEMBERS_CONFIG_PATH` é o caminho **no host**; o Compose monta esse arquivo em `/app/config/installation.json` e configura `OPENMEMBERS_CONFIG_FILE` dentro do container.

| Configuração | Quando e como é utilizada |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Origem HTTPS real, sem caminho; fornecida ao build e mantida coerente no runtime |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública HTTPS do projeto desta organização; fornecida ao build |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Chave pública `anon` deste projeto, usada pelo navegador; fornecida ao build |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave administrativa `service_role` correspondente, somente runtime no servidor |
| `SUPABASE_INTERNAL_URL` | Origem opcional somente do servidor para alcançar o mesmo Supabase a partir do container; a URL pública continua em `NEXT_PUBLIC_SUPABASE_URL` |
| `OPENMEMBERS_INTERNAL_URL` | Origem opcional somente do servidor para a aplicação ler seus próprios assets dentro do container; a origem pública continua em `NEXT_PUBLIC_SITE_URL` |
| `AUTH_ALLOWED_ORIGINS` | Origens HTTPS adicionais realmente adotadas, separadas por vírgula; pode ficar vazio |
| `CERTIFICATE_IMAGE_ALLOWED_ORIGINS` | Origens HTTPS adicionais, sem caminho e separadas por vírgula, autorizadas para logos/assinaturas de certificados; pode ficar vazio quando os assets estão na aplicação ou no Supabase configurado |
| `CRON_SECRET` | Segredo aleatório próprio, somente runtime; usado também pelo executor de jobs |
| `EMAIL_TRANSPORT`, `RESEND_API_KEY`, remetente | Configuração opcional da aplicação, independente do SMTP do Auth |
| `DATABASE_URL` / `DATABASE_POOL_URL` | Conexão direta opcional utilizada pela IA; não é requisito do núcleo de membros |

As verificações locais usaram chaves Supabase `anon`/`service_role`. Não troque silenciosamente por outro tipo de chave no piloto: registre e teste a compatibilidade. Chaves administrativas contornam RLS e nunca devem ser colocadas em nomes `NEXT_PUBLIC_*`, JSON público ou argumentos públicos de build. [Referência Supabase: tipos de chave](https://supabase.com/docs/guides/getting-started/api-keys).

O Next inclui valores `NEXT_PUBLIC_*` no JavaScript durante o build. Alterar URL, chave pública, origem ou identificadores públicos de telemetria exige **reconstruir a imagem**. Reiniciar com novos valores de runtime não transforma uma imagem compilada para o Supabase local em imagem de outra organização. Segredos e provedores do servidor são fornecidos pelo `env_file`; não há razão para passá-los como build args.

A shell do operador tem precedência sobre o arquivo Compose: remova variáveis herdadas de outra instalação antes do build/up, para manter os valores públicos coerentes com o runtime. O arquivo de ambiente é interpretado pelo Compose; não o execute com `source`. Valores com caracteres especiais devem respeitar a sintaxe do Compose. `docker compose config` sem `--quiet` pode revelar a configuração resolvida e os segredos; use a validação silenciosa abaixo.

No `/etc/openmembers/installation.json` criado acima, ajuste identidade, textos, suporte e políticas conforme o [guia de personalização](../customization.md). O JSON contém apenas apresentação pública e deve ser legível pelo usuário UID 1001 da imagem. Um arquivo público `0644` em diretório atravessável permite essa leitura; o ambiente de segredos continua restrito. O Compose monta o JSON somente para leitura. Assets locais referenciados precisam existir em `public` no momento do build. Logos e assinaturas de certificados podem usar a origem HTTPS da aplicação, o Supabase configurado ou uma origem adicional declarada em `CERTIFICATE_IMAGE_ALLOWED_ORIGINS`; caminhos internos, redirecionamentos e origens não declaradas são recusados.

## 6. Construir e iniciar a aplicação

Os comandos a seguir são executados pelo operador no **novo host**, depois de preencher o arquivo de ambiente e conferir o projeto Supabase:

```sh
cd /opt/openmembers
unset DOCKER_CONTEXT DOCKER_HOST BUILDKIT_HOST BUILDX_BUILDER
unset COMPOSE_FILE COMPOSE_PROJECT_NAME
unset OPENMEMBERS_ENV_FILE OPENMEMBERS_CONFIG_PATH OPENMEMBERS_IMAGE OPENMEMBERS_PORT
unset NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
unset NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY NEXT_PUBLIC_SENTRY_DSN
unset NEXT_PUBLIC_GA4_MEASUREMENT_ID NEXT_PUBLIC_META_PIXEL_ID
openmembers_docker_endpoint="$(docker context inspect --format '{{.Endpoints.docker.Host}}')"
case "$openmembers_docker_endpoint" in unix://*) ;; *) echo 'Recuse: o contexto Docker não usa um socket Unix local.' >&2; exit 1;; esac
docker buildx inspect default
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml config --quiet
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml build --builder default app
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml up -d app
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml ps
curl --fail --silent --show-error http://127.0.0.1:3000/api/health
```

O percurso de referência exige que o contexto ativo resolva para um socket Unix local e usa o builder `default` com driver `docker`. O `case` interrompe antes do build se o endpoint não for local; confira também que `docker buildx inspect default` identifica o driver `docker`. Não prossiga se aparecer endpoint TCP/SSH, Docker Build Cloud, builder remoto ou destino que não pertença ao host novo. `BUILDKIT_HOST` e `BUILDX_BUILDER` conseguem selecionar outro builder mesmo quando o daemon esperado é local. Docker rootless requer adaptar e registrar explicitamente o socket, o contexto e as unidades systemd; não remova esta conferência para fazê-lo funcionar.

Os `unset` também impedem que a shell substitua os caminhos, a imagem ou os valores públicos do arquivo `--env-file`. Se alguma integração pública opcional for habilitada, declare-a em `/etc/openmembers/application.env`, não na shell herdada. Confirme antes que `docker compose build --help` oferece `--builder`; caso contrário, atualize o plugin Compose do host.

Se escolheu outra `OPENMEMBERS_PORT`, ajuste o último endereço. O retorno saudável é HTTP 200 com `status=ok` e `db=ok`. Essa rota confirma uma consulta REST à tabela `tenant_settings`; não certifica Auth, permissões completas, Storage, e-mail ou jobs. Sem as variáveis mínimas, o proxy retorna 503 de configuração antes de consultar o banco. HTTP 503 requer conferir build, runtime, migrations e conectividade antes de avançar.

O [Dockerfile](../../Dockerfile) produz `.next/standalone`, copia `public` e `.next/static` e inicia `node server.js` como usuário não privilegiado. Para usar o artefato fora de Docker, é igualmente necessário distribuir as três partes; apenas `.next/standalone` não inclui CSS, JavaScript estático e assets públicos. Não reutilize um build nativo de macOS como artefato Linux. `npm start` é o servidor Next convencional e não substitui a prova do empacotamento standalone.

O JSON de instalação não é incorporado ao build. A aplicação lê o arquivo fornecido ao processo; após alterar a configuração de implantação, reinicie/recrie o serviço e confira nome, manifesto e links. Alterações de variáveis do container exigem recriação via Compose, conforme [operação](operations.md).

## 7. Publicar a origem HTTPS no host

Configure o proxy para a origem escolhida, encaminhando para `127.0.0.1:3000` ou a porta configurada. DNS, certificado TLS e renovação pertencem ao host da organização. Esta entrega não instala ou configura automaticamente o proxy.

O proxy precisa:

- Preservar o host público e indicar corretamente `X-Forwarded-Host` e `X-Forwarded-Proto=https`.
- Sobrescrever `X-Forwarded-For`/`X-Real-IP` com a identidade de rede confiável. A aplicação usa o primeiro endereço de XFF no limitador de login; não aceite uma cadeia arbitrária enviada pelo cliente.
- Manter o processo Node inacessível diretamente pela rede externa. O binding em loopback do Compose pressupõe proxy no mesmo host.
- Permitir streaming e o corpo necessário aos uploads adotados; o limite de Server Actions e materiais é 25 MB. Teste o limite também no proxy.
- Respeitar os cabeçalhos de cache: não cachear sessão, respostas autenticadas, callbacks ou APIs como conteúdo público compartilhado.

Valide a URL HTTPS no navegador, seus assets estáticos e `/api/health` através do proxy. Não acrescente domínios ao `AUTH_ALLOWED_ORIGINS` para esconder um erro de encaminhamento. O limitador de Auth é em memória por processo; múltiplas réplicas e atualização gradual exigem planejamento e validação adicionais.

## 8. Criar o primeiro superadministrador hospedado

`npm run admin:create` permanece exclusivo do Supabase local. O percurso hospedado usa o cadastro normal da aplicação e uma promoção administrativa explícita, sem alterar metadata nem inserir diretamente em `auth.users`.

1. Depois das migrations e do HTTPS, o responsável cria sua própria conta em `/register`, com endereço que controla e senha exclusiva. Use destinatário autorizado para o teste.
2. Confirme o e-mail recebido e faça login. O trigger deve criar o perfil com papel `user` e status `active`.
3. No painel do **novo projeto**, confira o usuário Auth e copie seu UUID. Verifique endereço, confirmação e perfil correspondentes; nome de exibição não identifica com segurança o responsável.
4. No SQL Editor desse mesmo projeto, como operador administrativo, substitua o UUID e o e-mail do bloco abaixo. Ele exige perfil ativo confirmado e recusa a promoção se já existir um superadministrador. A transação não altera schema nem o histórico das migrations.

```sql
DO $bootstrap$
DECLARE
  target_user uuid := '00000000-0000-0000-0000-000000000000';
  expected_email text := 'responsavel@example.test';
  affected integer;
BEGIN
  LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE role = 'super_admin') THEN
    RAISE EXCEPTION 'Superadministrator already exists; use the authenticated administration workflow';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE p.id = target_user
      AND lower(u.email) = lower(expected_email)
      AND lower(p.email) = lower(expected_email)
      AND u.email_confirmed_at IS NOT NULL
      AND p.role = 'user'
      AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Confirmed active account and profile do not match the selected identity';
  END IF;

  UPDATE public.profiles SET role = 'super_admin' WHERE id = target_user;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'Administrator promotion did not affect exactly one profile';
  END IF;
END;
$bootstrap$;
```

5. Reabra a aplicação e confirme acesso a `/admin`, inclusive às opções de superadministrador. Verifique pelo painel do banco que somente o UUID selecionado mudou de papel. Crie os próximos administradores pelo fluxo autenticado.

Se a conta existir sem perfil ou a promoção falhar, não apague contas nem repita cadastro automaticamente. Confira aplicação das migrations, trigger e identidade; preserve a conta para recuperação explícita. O cadastro Auth e a promoção não são uma transação única. O bootstrap acima corresponde ao schema da aplicação; sua execução hospedada ainda precisa ser validada no piloto, separadamente do bootstrap local.

## 9. Aceitar a instalação e seguir para operação

Antes de receber alunos ou compras reais, execute um [piloto com dados fictícios](source-package.md) e registre os resultados, incluindo:

- Revisão e imagem utilizadas; dez migrations aplicadas; ausência de fixtures com senha pública.
- Login do administrador, cadastro/confirmação/recuperação na origem HTTPS e acesso negado sem autorização.
- Marca e manifesto, curso/aula próprios de teste, matrícula, progresso e upload/download privado.
- E-mail Auth e aplicação tratados separadamente; provedores opcionais habilitados ensaiados em contas próprias.
- Disparos reais dos cinco jobs pela agenda do host, status/contadores e comportamento após reinício.
- Backup e restauração em destino separado, monitoramento e procedimento de atualização.

O [guia operacional](operations.md) contém jobs, diagnóstico e recuperação. Instalar templates de agenda ou obter HTTP 200 manualmente não comprova os disparos no host. Peça a uma pessoa que siga somente o pacote e estes guias para registrar os resultados e as intervenções necessárias.

Para detalhes de standalone, variáveis públicas e proxy, consulte a documentação distribuída com a versão instalada do Next em `node_modules/next/dist/docs/`: `01-app/03-api-reference/05-config/01-next-config-js/output.md`, `01-app/02-guides/environment-variables.md` e `01-app/02-guides/self-hosting.md`. Confirme no piloto as opções e o comportamento dos serviços hospedados.
