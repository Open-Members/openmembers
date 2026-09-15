Ajude a tornar um espaço independente para cursos e comunidades de aprendizado mais fácil de usar, personalizar e operar. O Open Members é um software experimental, com **uma instalação da aplicação e um projeto Supabase dedicado por organização**. Leia a [visão geral do projeto](README.md), o [índice da documentação](docs/README.md) e as [limitações conhecidas](docs/known-limitations.md) antes de escolher uma alteração.

## Escolha uma alteração

Contribuições úteis incluem relatos reproduzíveis de falhas, instruções de instalação mais claras, traduções, melhorias de acessibilidade e testes para itens de aceite pendentes. Mantenha uma primeira contribuição focada em um comportamento ou guia.

Descreva o problema e o comportamento proposto em uma issue ou pull request. Discuta mudanças no modelo de instalação, no acesso a dados ou nas integrações opcionais com o mantenedor antes de implementar uma alteração ampla. Atualize os guias relevantes ao mudar o comportamento público ou a arquitetura. Use documentação compatível com a versão instalada do Next.js.

Ao relatar uma falha, inclua a revisão do código, o ambiente, os passos com dados fictícios, o comportamento esperado, o comportamento observado e as saídas sem dados sensíveis. Relate suspeitas de vulnerabilidades pelo procedimento de [SECURITY.md](SECURITY.md).

## Prepare um ambiente de desenvolvimento

Use Node.js **22.23.2**, selecionado por [`.nvmrc`](.nvmrc), npm **10.9.2** e as dependências fixadas. Estes comandos pressupõem que o `nvm` já está instalado:

```sh
nvm install
nvm use
npm ci --ignore-scripts --no-audit --no-fund
```

Siga o [guia de desenvolvimento local](docs/development.md) para iniciar a pilha Supabase isolada, preparar contas fictícias e abrir a aplicação. O [guia detalhado em português](docs/development/local-database.md) também cobre o provisionamento do primeiro administrador e as regras de Storage. Use conteúdo fictício e Mailpit para os e-mails de teste.

Os scripts locais usam nomes de projeto e portas fixos. Uma segunda cópia no mesmo serviço Docker usa a mesma pilha de desenvolvimento. Confirme que seus serviços e dados são dedicados ao teste antes de iniciá-la ou reiniciá-la do zero. Uma instalação independente por um novo operador continua como item de validação pendente.

Para trabalho relacionado à implantação, use o [guia de instalação Linux](docs/deployment/installation.md), o [guia de operações](docs/deployment/operations.md) e o [guia do pacote de fonte](docs/deployment/source-package.md). Os scripts locais protegidos não inicializam um projeto Supabase hospedado.

## Proteja dados e procedência

- Contribua apenas com código, conteúdo e assets que você está autorizado a compartilhar. Registre a origem e a licença dos materiais reutilizados e preserve seus avisos.
- Mantenha credenciais de instalações, arquivos de ambiente, exportações de banco, configuração privada, registros de autenticação e dados pessoais reais fora das contribuições. Use exemplos sem dados sensíveis e capturas fictícias.
- Mantenha repositórios, implantações e dados operacionais privados separados deste projeto. Uma contribuição não deve importar o histórico Git de outra organização nem executar seus scripts operacionais.
- Mantenha credenciais de servidor fora de variáveis `NEXT_PUBLIC_*`, argumentos de build, exemplos e registros. Testes de provedores exigem adesão explícita e contas controladas; evite envio incidental a destinatários reais.
- Siga [SECURITY.md](SECURITY.md) para suspeitas de vulnerabilidade ou exposição de credenciais. Issues e pull requests públicos não são canais privados de relato.

O código do projeto usa a [licença MIT](LICENSE). Código, pacotes, fontes e assets de terceiros preservam seus próprios termos; consulte [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). A distribuição de artefatos compilados exige revisão dos materiais efetivamente incluídos.

## Verifique o comportamento afetado

Escolha verificações que exercitem a alteração e informe os comandos exatos, os resultados e o ambiente. Edições somente de documentação normalmente exigem revisão de conteúdo, links, comandos e renderização, em vez de testes da aplicação.

Para alterações da aplicação, comece com:

```sh
npm run check
npm run lint
npm test
npm run build
npm run verify:artifact
```

Execute `npm run test:tooling` ao alterar scripts ou suas proteções. Alterações de interface devem exercitar os estados afetados em computador/celular e temas; o [README](README.md#verification) descreve as suítes de navegador públicas, de marca e autenticadas. Mantenha os testes de provedores condicionados a adesão explícita e registre qual provedor foi exercitado. As [limitações conhecidas](docs/known-limitations.md) descrevem falhas intermitentes de marca; uma repetição isolada não demonstra a correção.

Mudanças no banco ou na autorização exigem os contratos relevantes e as verificações autenticadas na pilha isolada. **`npm run db:verify` apaga e recria o banco de desenvolvimento local duas vezes.** Execute somente quando os dados forem descartáveis e nenhum outro trabalho depender dessa pilha. Preserve as proteções dos testes e as evidências existentes antes de repetir comandos que as sobrescrevam.

Após criar o commit, execute `npm run verify:source` em uma cópia sem alterações rastreadas preparadas ou não preparadas. Essa verificação sem rede lê o instantâneo exato do commit em busca de caminhos documentados de materiais locais e padrões de credenciais. Ela não verifica arquivos não rastreados nem commits anteriores; veja o [guia de verificação da fonte](docs/source-verification.md). Se uma credencial real for exposta, removê-la em um commit posterior não a invalida nem a remove do histórico.

Diferencie revisão estática, preparação do ambiente, verificações bem-sucedidas em execução e verificação de produção. Relate falhas e limites pendentes junto das verificações bem-sucedidas. Um build local ou uma chamada manual de tarefa não demonstra instalação nem execução agendada em um host Linux.

## Prepare o pull request

Comece pelo problema concreto e pelo comportamento resultante. Inclua:

- A issue relacionada, o comportamento esperado e as decisões de projeto relevantes.
- Comandos de verificação, ambiente, resultados e verificações não executadas.
- Capturas relevantes da interface com dados fictícios.
- Alterações de instalação, configuração, migração ou operação que os revisores precisam avaliar.
- Atualizações de origem, licença e avisos dos materiais de terceiros recém-incluídos.

Atualize os guias afetados e o [registro de mudanças não lançadas](CHANGELOG.md) quando o comportamento ou a instalação mudar. Atualize as limitações conhecidas quando uma correção for verificada. Implantação e publicação são ações separadas do mantenedor.
