# Desenvolvimento local com banco

Este guia detalhado em português prepara a pilha local do Open Members com dados fictícios. O [guia inicial em inglês](../development.md) oferece o percurso curto para contribuidores. Cada organização usa uma instalação e um projeto Supabase próprios. Este fluxo não migra o banco de uma organização existente nem configura produção.

Os requisitos e comandos abaixo correspondem à fonte atual. A instalação hospedada segue o [guia de instalação](../deployment/installation.md) e exige seu próprio piloto. A instalação por uma pessoa nova ainda não foi demonstrada; consulte as [limitações conhecidas](../known-limitations.md).

## Requisitos

- Node.js **22.23.2**, conforme [`.nvmrc`](../../.nvmrc), e npm **10.9.2**, conforme [`package.json`](../../package.json).
- Docker instalado e iniciado. No macOS, use Docker Desktop; no Linux, um Docker Engine local acessível pelo usuário. Os scripts exigem um socket Unix local e recusam um daemon indicado por endereço TCP ou SSH. Windows nativo ainda não tem um procedimento verificado neste guia.
- Git e espaço disponível para as dependências e imagens Docker. A primeira inicialização baixa as imagens do ambiente local.
- As portas abaixo livres. Não compartilhe esta pilha de desenvolvimento com dados de uso real.

O identificador `openmembers` e as portas são fixos. Uma segunda cópia do repositório no mesmo daemon Docker usa a mesma pilha, sem criar isolamento adicional. Confirme que os serviços e dados são dedicados ao seu teste antes de operá-los; reiniciar Docker ou alterar containers de outros projetos não faz parte da instalação rotineira.

| Serviço | Endereço ou porta |
| --- | --- |
| Aplicação em desenvolvimento | `http://localhost:3000` |
| Aplicação durante o teste de navegador com banco | `http://localhost:3101` |
| Teste de navegador sem configuração | `http://localhost:3100` |
| API Supabase, Auth e Storage | `http://127.0.0.1:55431` |
| PostgreSQL 17 | `127.0.0.1:55432` |
| Banco auxiliar de migrations | `55430` |
| Caixa de e-mail local | `http://127.0.0.1:55434` |

Supabase CLI **2.117.0** é uma dependência do repositório. Não é necessário instalar uma CLI global, autenticar uma conta hospedada ou executar `supabase link`. Studio, Realtime, Edge Functions, analytics e o pooler não são iniciados nesta configuração.

## Instalar e abrir a demonstração

Na raiz do repositório, com `nvm` já disponível:

```sh
nvm install
nvm use
node --version
npm --version
npm ci --ignore-scripts --no-audit --no-fund
npm run db:start
npm run db:seed
npm run dev:local
```

Abra `http://localhost:3000`. `db:start` inicia o projeto local `openmembers` e aplica as migrations em uma instalação nova. Uma pilha existente recebe migrations incrementais pelo comando abaixo; o reset posterior é reservado à reprodução destrutiva explicitamente desejada. `db:seed` cria ou atualiza somente as entidades de demonstração conhecidas; ele pode ser repetido e recusa sobrescrever uma conta com o identificador reservado que não seja uma fixture reconhecida.

Para aplicar migrations novas preservando os dados de uma pilha local existente, use `npm run db:migrate` após revisar os arquivos pendentes. O comando executa `migration up --local` com os mesmos guards de projeto/socket usados pelos demais comandos locais. Não realiza reset nem executa seed. A migration incremental 008 acrescenta a preferência de idioma; registros antigos permanecem sem escolha explícita até o usuário salvar em configurações.

`dev:local` consulta as chaves da pilha local e as injeta no processo Next.js, juntamente com os endereços do banco. Não é necessário copiar chaves para `.env.local`. Use `localhost` para abrir a aplicação, pois essa é a origem configurada para os callbacks de Auth. As chaves exibidas pela CLI continuam sendo credenciais administrativas do ambiente local; não as adicione ao Git.

O cadastro exige confirmação de e-mail. Acesse a caixa local em `http://127.0.0.1:55434` para receber mensagens de confirmação e recuperação. Os usuários do seed já têm o e-mail confirmado. A captura local de mensagens não demonstra entrega por provedores externos.

Para encerrar, interrompa o servidor Next.js com `Ctrl+C` e execute:

```sh
npm run db:stop
```

Esse comando para os serviços do projeto. Para apagar e reconstruir os dados, use explicitamente `db:reset`.

## Contas e conteúdo fictícios

A senha pública de todas as contas abaixo é **`OpenMembers-local-2026!`**. Essas credenciais pertencem somente à demonstração local e não devem ser usadas em uma instalação acessível ao público.

| E-mail | Papel e cenário |
| --- | --- |
| `admin@example.test` | Superadministrador da demonstração |
| `staff@example.test` | Administrador, sem o papel de superadministrador |
| `student@example.test` | Aluno ativo com matrícula válida |
| `visitor@example.test` | Aluno ativo sem matrícula |
| `expired@example.test` | Aluno cuja matrícula expirou |
| `suspended@example.test` | Aluno suspenso, mesmo com matrícula cadastrada |

O seed inclui dois cursos, um deles não publicado; quatro aulas com conteúdo fictício; três matrículas; e dois materiais privados. As aulas representam conteúdo liberado, conteúdo retido por data, rascunho e prévia gratuita para usuários autenticados. O curso publicado pode ser encontrado pelo slug `open-members-demo`.

O seed restaura os atributos declarados dessas fixtures quando executado novamente. Não use seus identificadores reservados para construir dados próprios que precisem ser preservados.

## Criar o primeiro superadministrador separadamente

O cadastro normal sempre cria um perfil de aluno ativo. Pedir papel administrativo em metadata de Auth não concede privilégios. A promoção inicial usa um comando administrativo explícito, limitado ao Supabase local.

Para testar esse caminho, execute-o **antes de `db:seed`**, em um banco ainda sem superadministrador. O seed cria `admin@example.test`; depois disso, o bootstrap inicial recusará uma segunda execução e orientará usar o fluxo autenticado de administração.

O exemplo abaixo abre Bash para solicitar a senha sem mostrá-la nem colocá-la como argumento do comando. Use uma senha exclusiva com pelo menos 12 caracteres:

```sh
bash
read -r -s -p 'Senha do administrador local: ' OPENMEMBERS_ADMIN_PASSWORD
echo
export OPENMEMBERS_ADMIN_PASSWORD
npm run admin:create -- first-admin@example.test
unset OPENMEMBERS_ADMIN_PASSWORD
exit
```

O comando cria a conta com e-mail confirmado e promove seu perfil a `super_admin`. Ele não imprime a senha nem a grava em arquivo. Se a conta já existir, ou houver outro superadministrador, a execução falha sem reaproveitar ou promover automaticamente uma conta existente.

Esse procedimento verifica o bootstrap local. O [guia de instalação](../deployment/installation.md) descreve o bootstrap hospedado separado, a gestão de segredos e sua validação no piloto. Não remova o guard deste comando para acessar um projeto remoto.

## Reset e reprodução limpa

**`db:reset` apaga o banco local do projeto `openmembers` e reaplica as migrations.** Contas, matrículas, progresso e conteúdo cadastrado localmente precisam ser recriados. Não execute o reset se pretende preservar esse trabalho.

```sh
npm run db:reset
npm run db:seed
```

O guard verifica o identificador do projeto, as portas esperadas, a ausência de vínculo com um Supabase remoto e o acesso a Docker local. Os scripts de provisionamento e teste validam que API, banco e caixa de e-mail usam loopback e as portas deste guia. Mantenha essas verificações; o fluxo não aceita um endereço remoto como substituto.

**`db:verify` também apaga o banco local, duas vezes.** Esse comando executa duas inicializações limpas. Em cada uma, verifica o primeiro administrador, remove essa conta temporária, aplica o seed duas vezes e roda os testes de banco. Ao final, compara a estrutura capturada e as contagens das fixtures.

Esse comando aceita somente o alvo de desenvolvimento **`development`** (`5543x`). Se `OPENMEMBERS_DATABASE_TEST_TARGET` estiver exportada como `pilot`, `recovery` ou qualquer outro valor diferente de `development`, ele recusa a operação antes de consultar serviços ou reinicializar dados. Remova a variável com `unset OPENMEMBERS_DATABASE_TEST_TARGET` ou defina `development` somente quando a intenção for reconstruir a pilha de desenvolvimento. `db:test` continua permitindo a seleção explícita de piloto/recuperação para seus contratos; essa seleção não transforma `db:verify` em ferramenta de reset desses destinos.

```sh
npm run db:verify
```

Se todas as verificações passarem, o comando grava um relatório local ignorado pelo Git. Confira o código de saída, a mensagem final e o relatório produzido para determinar o resultado. Em caso de falha, o banco pode permanecer parcialmente preparado; corrija a causa antes de reiniciar a verificação.

## Testes e build

Os comandos abaixo não iniciam pagamentos, envio de e-mail externo ou publicação. Mantenha as integrações opcionais sem configuração no ambiente de demonstração.

```sh
npm run check
npm run lint
npm test
OPENMEMBERS_DATABASE_TEST_TARGET=development npm run db:test
npm run build:local
npx playwright install chromium
npm run test:e2e:db
```

- `check`: gera os tipos de rotas Next.js e verifica TypeScript.
- `lint`: verifica o código com ESLint.
- `test`: roda os testes unitários com Vitest.
- `db:test`: requer Supabase iniciado e seed aplicado; testa Auth, RLS, RPCs, regras de liberação, integridade de relações e Storage. Alguns testes criam registros temporários e limpam as próprias fixtures.
- `build:local`: cria um build usando exclusivamente a configuração da pilha local; use esse build para a suíte autenticada.
- `test:e2e:db`: usa a configuração Playwright com banco e inicia um servidor próprio em `localhost:3101`. Requer o build local e as contas fictícias. Não deixe outro processo usando essa porta.

Em um host Debian/Ubuntu Linux compatível sem as bibliotecas de sistema do navegador, use `npx playwright install --with-deps chromium` no lugar da instalação simples. A opção também instala dependências do sistema e pode solicitar `sudo`. O exemplo fixa `db:test` em `development` para não herdar o alvo de um ensaio anterior de piloto/recuperação.

Para verificar o modo sem banco, use um build sem variáveis Supabase configuradas, seguido de `npm run test:e2e`. Essa suíte usa `localhost:3100`. Um build feito para a suíte autenticada não representa o estado sem configuração; reconstrua para o modo que pretende testar.

## Armazenamento e controle de acesso

| Bucket | Leitura | Escrita | Limite por arquivo |
| --- | --- | --- | --- |
| `avatars` | Pública | Usuário ativo no próprio caminho; administrador ativo | 10 MB |
| `platform-assets` | Pública | Administrador ativo | 50 MB |
| `lesson-materials` | Privada | Serviço administrativo após autorização | 25 MB |

Os tipos MIME aceitos estão na migration de Storage. Alunos não recebem permissão direta para listar, baixar ou assinar materiais privados pelo SDK de Storage. A aplicação verifica a sessão e a aula antes de fornecer o acesso ao arquivo. Uma matrícula expirada, suspensão, rascunho ou regra de liberação ainda pendente deve impedir esse acesso nos cenários correspondentes.

As regras de liberação usam a matrícula válida mais antiga do aluno no curso. A regra de aula tem precedência sobre a de módulo, que precede a de curso. Regras não podem misturar curso, módulo e aula de hierarquias diferentes. Uma movimentação administrativa de conteúdo que invalidaria uma regra existente exige remover e recriar a regra correspondente.

## Limites da configuração

Esta configuração verifica uma instalação local por organização. Não implementa organizações isoladas dentro de um banco compartilhado. Os dados e scripts operacionais de instalações existentes ficam fora do bootstrap.

Ter tabelas de pagamentos, webhooks, e-mail, chat, certificados ou aulas ao vivo não comprova que suas integrações funcionam. Consulte a [matriz de integrações](../integrations/README.md) para requisitos e limites de validação. Stripe/Guru, Resend/hooks, R2, Vimeo, IA, OAuth e telemetria dependem de contas/configuração e validação próprias; push não possui pipeline de entrega. O guia local não configura domínios, SMTP real, deploy, backups de produção ou migração de instalações existentes. Agenda e instalação independente seguem os guias de [instalação](../deployment/installation.md) e [operação](../deployment/operations.md).

Consulte o [índice da documentação](../README.md) para outros guias e as [limitações conhecidas](../known-limitations.md).
