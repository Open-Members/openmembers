Comece aqui para executar a demonstração fictícia e preparar uma contribuição. O primeiro lançamento usa uma instalação da aplicação e um projeto Supabase por organização. Este guia usa a pilha local protegida; o [guia de instalação Linux](deployment/installation.md) cobre uma instalação configurada separadamente.

O [guia detalhado em português](development/local-database.md) contém o provisionamento do primeiro administrador e regras de Storage. Uma instalação por um novo contribuidor ainda não foi demonstrada. Consulte as [limitações conhecidas](known-limitations.md) para os limites atuais de validação.

## Requisitos

- Uma cópia revisada do código ou um pacote de fonte extraído. Execute os comandos abaixo a partir da raiz.
- Node.js **22.23.2**, selecionado por [`.nvmrc`](../.nvmrc), e npm **10.9.2**, declarado em [`package.json`](../package.json). As faixas compatíveis também estão declaradas ali. Os exemplos pressupõem que `nvm` está instalado; outro gerenciador pode selecionar as mesmas versões.
- Docker Desktop no macOS ou Docker Engine local no Linux, em execução e acessível ao usuário. Os scripts locais exigem um socket Unix e recusam serviços TCP/SSH e projetos Supabase hospedados vinculados. A configuração nativa no Windows não foi verificada.
- Espaço em disco para dependências, imagens e banco local, e as portas abaixo livres. A primeira inicialização baixa as imagens do Supabase.

A CLI do Supabase está fixada nas dependências. Não são necessários CLI global, conta hospedada, token de acesso nem `supabase link` para esta demonstração.

Os scripts usam o nome fixo `openmembers` e portas fixas. **Uma segunda cópia no mesmo serviço Docker usa a mesma pilha de desenvolvimento.** Confirme que dados e serviços são dedicados ao teste antes de operá-los. Reiniciar Docker ou alterar contêineres de outro projeto está fora da configuração rotineira.

| Serviço | Endereço ou porta local |
| --- | --- |
| Aplicação de desenvolvimento | [localhost:3000](http://localhost:3000) |
| API, Auth e Storage do Supabase | `127.0.0.1:55431` |
| PostgreSQL | `127.0.0.1:55432` |
| Banco auxiliar de migração | `55430` |
| Mailpit | [127.0.0.1:55434](http://127.0.0.1:55434) |
| Testes de navegador | Sem configuração `3100`, autenticados `3101`, marca `3102` |

## Instale e abra a demonstração

Selecione as ferramentas e confirme suas versões antes de instalar as dependências fixadas:

```sh
nvm install
nvm use
node --version
npm --version
npm ci --ignore-scripts --no-audit --no-fund
```

Com a pilha Docker dedicada disponível:

```sh
npm run db:start
npm run db:seed
npm run dev:local
```

Abra [localhost:3000](http://localhost:3000), usando `localhost` nos retornos de Auth. `db:start` aplica migrações ao criar uma pilha nova. `db:seed` provisiona os dados conhecidos da demonstração; repeti-lo restaura seus atributos declarados, portanto mantenha conteúdo próprio fora dos identificadores reservados.

`dev:local` obtém as credenciais da pilha protegida e as injeta no Next.js. Não precisa de `.env.local`, seleciona Mailpit e desativa credenciais de provedores opcionais. Mantenha credenciais administrativas locais e arquivos de ambiente fora do Git. Para alterações de apresentação, siga o [guia de personalização](customization.md).

Todas as contas demonstrativas usam a senha pública **`OpenMembers-local-2026!`**:

| Conta | Cenário |
| --- | --- |
| `admin@example.test` | Superadministrador |
| `staff@example.test` | Administrador |
| `student@example.test` | Aluno ativo com matrícula válida |
| `visitor@example.test` | Aluno sem matrícula |
| `expired@example.test` | Aluno com matrícula expirada |
| `suspended@example.test` | Aluno suspenso |

Essas credenciais e os cursos de exemplo são dados fictícios locais. O cadastro exige confirmação por e-mail; mensagens de confirmação e recuperação aparecem no [Mailpit](http://127.0.0.1:55434). As contas provisionadas já estão confirmadas. O [procedimento separado do primeiro administrador](development/local-database.md#criar-o-primeiro-superadministrador-separadamente) deve ser executado antes de carregar a demonstração caso você queira exercitar esse caminho de inicialização.

## Pare, atualize ou recrie

Pare o Next.js com `Ctrl+C` e depois os serviços de banco deste projeto, preservando os dados:

```sh
npm run db:stop
```

Em uma pilha existente, revise novas migrações antes de aplicá-las com `npm run db:migrate`. Esse comando aplica migrações locais pendentes sem recriar o banco nem carregar dados.

**`npm run db:reset` apaga o banco local deste projeto e reaplica migrações. `npm run db:verify` faz isso duas vezes.** Use-os apenas quando a pilha for descartável e nenhum outro trabalho depender dela. Leia o [procedimento de recriação e verificação](development/local-database.md#reset-e-reprodução-limpa) antes de executar. Recriar o banco não é uma recuperação para um serviço Docker indisponível.

`db:verify` aceita somente o alvo de desenvolvimento chamado `e5` em `5543x`. Um `OPENMEMBERS_DATABASE_TEST_TARGET` herdado diferente de `e5` é recusado antes de acessar serviços ou alterar dados. O seletor separado de alvo de `db:test` não muda o banco que `db:verify` recria.

## Verifique uma alteração

Planeje primeiro, seguindo [CONTRIBUTING](../CONTRIBUTING.md). As verificações abaixo exigem dependências instaladas, mas não um banco em execução nem um provedor externo:

```sh
npm run check
npm run lint
npm test
npm run test:tooling
```

`check` gera tipos de rotas Next.js e verifica TypeScript. Testes das ferramentas usam serviços fictícios, inclusive servidores locais em loopback. Alterações somente de documentação normalmente exigem revisão de links, comandos e versões, em vez de testes da aplicação.

Após criar o commit, com a árvore rastreada limpa, execute `npm run verify:source`. Ele verifica o instantâneo exato do Git para caminhos documentados de materiais locais e padrões de credenciais; recusa alterações rastreadas preparadas/não preparadas e não inspeciona arquivos não rastreados ou histórico. Veja [verificação de fonte](source-verification.md) para seus limites e a revisão separada do pacote final.

Os contratos de banco exigem a pilha dedicada e os dados de demonstração. Criam registros temporários e removem seus próprios dados; não são testes somente de leitura. Para a pilha de desenvolvimento, selecione o alvo de desenvolvimento `e5` antes de executá-los:

```sh
OPENMEMBERS_DATABASE_TEST_TARGET=e5 npm run db:test
```

Para testes autenticados de navegador, crie um build para a mesma pilha local e deixe a porta `3101` livre:

```sh
npm run build:local
npx playwright install chromium
npm run test:e2e:db
```

A instalação do Chromium pode baixar arquivos. Em um servidor Debian/Ubuntu Linux compatível sem as bibliotecas do navegador, use `npx playwright install --with-deps chromium`; isso também instala dependências do sistema e pode solicitar `sudo`. Um build preparado para essa suíte autenticada difere de um build sem configuração. Consulte a [seção de verificação do README](../README.md#verification) para as suítes sem configuração e de marca, verificações de artefatos e escopo da integração contínua. O teste de integração YouTube exige adesão explícita separada porque contata um provedor externo.

## Solução de problemas e leitura adicional

| Sintoma | Próxima verificação |
| --- | --- |
| Versão de Node/npm diferente | Selecione as versões declaradas antes de `npm ci`; preserve o arquivo de dependências fixadas. |
| Docker ou Supabase local indisponível | Verifique a disponibilidade do Docker e se a pilha documentada está em uso. Preserve os dados; não recrie o banco para reparar o serviço Docker. |
| Aplicação chega a `/setup` | Confirme a inicialização da pilha e use `dev:local` para injetar a configuração. `npm run dev` sem variáveis Supabase mostra a preparação intencionalmente. |
| Mensagem de confirmação ausente | Verifique a caixa Mailpit local e use a origem da aplicação em `localhost`. Contas provisionadas já têm e-mail confirmado. |
| Porta ocupada | Identifique o processo ou pilha existente antes de continuar; testes ou outra cópia podem estar usando a porta. |

Use a [matriz de integrações](integrations/README.md) para requisitos de provedores e limites de validação. Esses comandos de desenvolvimento operam somente a pilha local fixa. O [guia de instalação](deployment/installation.md) cobre um host Linux e projeto Supabase separados; o [guia de operações](deployment/operations.md) cobre tarefas de implantação, backups e recuperação. Encontre outros guias no [índice da documentação](README.md) e as validações pendentes nas [limitações conhecidas](known-limitations.md).
