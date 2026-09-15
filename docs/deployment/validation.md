# Validação de uma instalação Linux

Este roteiro verifica uma instalação independente, com Docker em Linux e um projeto Supabase exclusivo por organização. A validação completa desse percurso em um host independente permanece pendente. O roteiro serve para registrar resultados reais; sua existência não comprova uma instalação aprovada.

O revisor deve conseguir seguir o [guia de instalação](installation.md) e o [guia de operação](operations.md) sem depender de instruções adicionais. Use um host de teste dedicado e dados fictícios.

## Preparar o percurso

| Responsável | Preparação | Evidência de entrada |
| --- | --- | --- |
| Mantenedor | Identificar a revisão completa do Open Members e entregar somente o conjunto revisado dessa revisão | SHA completo, forma de obtenção e hash do pacote, se utilizado |
| Revisor | Dispor de host ou VM Linux novo, com daemon Docker próprio, sem serviços ou volumes de outras instalações | Sistema/arquitetura, versões e descrição do isolamento, sem credenciais |
| Operador do piloto | Criar um Supabase exclusivo, vazio, e reservar origem da aplicação, armazenamento, segredos e captura/contas de teste próprias | Identificação privada dos recursos e registro público sanitizado de que são exclusivos |
| Mantenedor e revisor | Escolher somente as integrações que serão exercitadas e definir onde guardar evidências privadas | Lista de integrações habilitadas; somente contas de teste sob controle do operador |

O host deve ser suficientemente novo para que dependências ausentes e instruções implícitas apareçam. Registre qualquer preparação anterior, inclusive Docker, Compose, proxy e ferramentas já instaladas. Não é necessário apagar ou reinstalar um host existente: use uma máquina ou VM dedicada ao ensaio.

Um segundo checkout no mesmo daemon **não** cria uma segunda pilha Supabase local: os scripts usam `project_id = "openmembers"`, portas fixas e os recursos associados a esse projeto. Não os execute no daemon atual para simular independência. Não alterar os guards, apontar `DOCKER_HOST` para um servidor alheio, reiniciar Docker ou remover volumes para contornar conflito.

### Identificar a revisão

Uma distribuição por `git archive` deve identificar a revisão completa do Open Members e o hash do arquivo. O pacote não inclui arquivos privados, variáveis de ambiente, configuração pessoal, dependências instaladas, builds anteriores ou histórico de outras instalações. Verifique a lista de arquivos do pacote antes de extraí-lo em uma pasta nova. Preserve as licenças e avisos aplicáveis ao pacote fornecido.

Em um checkout Git, registre:

```sh
git rev-parse HEAD
git status --short
```

O SHA deve ser exatamente o fornecido para o ensaio e a árvore deve estar limpa. Se for um pacote, registre no host Linux:

```sh
sha256sum /caminho/do/openmembers-pilot.tar
tar -tvf /caminho/do/openmembers-pilot.tar
```

Substitua o caminho pelo arquivo recebido e compare o hash com o informado pelo mantenedor. A listagem detalhada precisa mostrar apenas o prefixo relativo e os tipos de entrada conferidos; recuse caminhos absolutos, `..` e links inesperados. Depois siga a [extração conferida no Linux](source-package.md#extrair-um-pacote-conferido-no-linux). Um pacote sem `.git` precisa conservar a referência da revisão no registro do piloto. Não tratar o `0.1.0` de `package.json` como prova de uma release publicada.

Mudanças no guia ou na aplicação durante o piloto geram uma nova revisão. Registre qual passo foi executado em cada SHA; quando houver correção, retome os passos afetados a partir de uma condição inicial conhecida. O relatório não deve juntar resultados de revisões diferentes sob um único SHA.

## Executar pelo guia

Cada linha abaixo deve receber resultado, data, evidência e qualquer intervenção necessária. Os comandos operacionais estão nos guias vinculados para evitar duas sequências divergentes. Se um comando essencial não estiver lá, registre a lacuna e corrija o guia antes de continuar; uma orientação informal pode ajudar a investigação, mas não conta como instalação autônoma aprovada.

| Ordem | Ação do revisor | Aceitação |
| --- | --- | --- |
| 1 | Conferir requisitos do guia de instalação no Linux escolhido: Docker/Compose, arquitetura, espaço, portas, domínio/proxy e ferramentas necessárias ao percurso | Versões registradas; nenhum conflito com outros projetos |
| 2 | Obter a revisão identificada em pasta nova e conferir os arquivos disponíveis | Nenhum arquivo privado, segredo, build anterior ou procedimento externo não documentado |
| 3 | Criar e configurar o Supabase vazio próprio conforme o guia; aplicar somente a sequência de migrations dessa revisão | Migrations aplicadas em ordem, Auth/perfis/RLS/buckets disponíveis e identificação do projeto conferida antes da escrita |
| 4 | Preencher a configuração da instalação e separar variáveis públicas de build dos segredos de runtime; configurar callbacks/origem e apresentação | Arquivos de configuração próprios, acesso restrito e nenhuma chave administrativa no cliente ou em build args públicos |
| 5 | Construir a imagem e iniciar a aplicação usando o Compose e o proxy do guia | Imagem identificada, processo saudável, assets e apresentação disponíveis pela origem prevista; porta interna sem exposição direta adicional |
| 6 | Seguir o procedimento documentado de primeiro administrador para o ambiente escolhido | Login administrativo funciona; senha exclusiva não aparece em terminal compartilhado, Git, screenshot nem relatório |
| 7 | Executar os percursos funcionais e as negativas descritos abaixo | Resultados observados nessa instalação, sem depender de dados ou arquivos da máquina de desenvolvimento |
| 8 | Configurar e observar a agenda real conforme o guia de operação | Cinco jobs têm disparos originados pelos timers, com status/duração e falha/recuperação observáveis |
| 9 | Ensaiar parada/retomada, backup/restauração e atualização conforme a seção operacional | Estado recuperado conferido, revisão da imagem identificada e limitações registradas |
| 10 | Revisar intervenções, corrigir o guia e repetir os passos afetados | Percurso final reproduzível pelos guias; limitações registradas |

Não conectar produção para completar uma etapa. Contas de teste e integração externa precisam pertencer ao piloto. Se um requisito do caminho escolhido ainda não tiver procedimento verificável, registre-o como pendente; não declare o caminho hospedado aprovado com base apenas no caminho local.

### Limites dos comandos locais

`db:start`, `db:reset`, `db:stop`, `db:seed`, `db:test`, `db:verify`, `admin:create`, `dev:local`, `build:local` e `test:e2e:db` atendem a pilha local documentada em [desenvolvimento local](../development/local-database.md). Eles não são ferramentas de bootstrap, migração ou verificação de um Supabase hospedado.

Os guards exigem nome/portas conhecidos, socket Unix local, serviços em loopback e ausência de vínculo com projeto remoto. `dev:local` e o runner relacionado removem credenciais opcionais herdadas, desabilitam IA/OAuth e forçam captura Mailpit. Eles também não habilitam a agenda de produção.

Os wrappers `pilot:*`, `scripts/local-pilot*.mjs` e `scripts/pilot-recovery*.mjs` atendem somente o ensaio Docker local, com projetos, portas e dados fictícios fixos. Eles não migram, verificam ou restauram o Supabase hospedado deste roteiro e não substituem os timers systemd do host Linux.

Se o revisor executar adicionalmente a demonstração local no daemon exclusivo do piloto, deve seguir o guia local sem modificar esses guards. `db:reset` apaga esse banco; `db:verify` o apaga **duas vezes**. Esses comandos devem ocorrer enquanto os dados ainda são descartáveis, antes de cadastrar conteúdo que se queira conservar.

`db:seed` cria o superadministrador conhecido da demonstração. O comando `admin:create` exige que ainda não exista um superadministrador; portanto, seu percurso separado acontece antes do seed, como documentado. A senha pública das fixtures nunca deve ser adotada na aplicação hospedada. Os testes automatizados locais não devem ser redirecionados para o Supabase hospedado.

## Percursos de aceitação

Use nomes, cursos, documentos e contas fictícios. Uma captura de e-mail é diferente de entrega externa; os endereços `@example.test` não demonstram entregabilidade de um provedor. Registre separadamente o transporte e o modo de Auth realmente usados. Não envie convites ou avisos a pessoas reais durante este piloto.

| Percurso | Resultado a observar |
| --- | --- |
| Administrador inicial | Entrar com a conta provisionada, abrir administração e conferir o perfil; aluno comum não consegue conceder a si papel administrativo |
| Cadastro e recuperação | Criar conta fictícia, confirmar e-mail e recuperar acesso pelo mecanismo configurado; origem dos links/callbacks corresponde à instalação |
| Administração e matrícula | Criar curso/módulo/aula, publicar, conceder e revogar matrícula; registrar sucesso real e não apenas a presença do formulário |
| Convite | Quando o transporte estiver habilitado no piloto, conferir captura da senha temporária, troca obrigatória e destino após o primeiro login; registrar falha de envio de forma explícita |
| Conteúdo e progresso | Aluno matriculado abre aula, registra conclusão e retoma seu progresso após nova sessão |
| Autorização | Visitante sem matrícula, conta suspensa e matrícula expirada não acessam a aula/material protegido; aluno não executa operação administrativa |
| Liberação gradual | Aula retida não aparece como acessível; regra liberada permite acesso; o job de notificação não substitui a decisão de autorização |
| Arquivos | Administrador envia PDF e TXT fictícios; aluno autorizado baixa; PDF recebe marca do usuário; aluno sem acesso é negado; remoção funciona |
| Personalização | Alterar nome/logo/cores, salvar, verificar como aluno e após reinício; conferir claro/escuro e um viewport móvel |
| Recursos opcionais | Ausência de configuração preserva o núcleo; registrar individualmente qualquer provedor habilitado e seu ensaio próprio |

Para testar YouTube, use o ensaio opt-in do [guia do player](../features/player.md), com referência pública autorizada e sem copiar mídia. Esse resultado não comprova Vimeo. Stripe/Guru, Resend/hooks, R2, IA, OAuth e telemetria conservam os limites da [matriz de integrações](../integrations/README.md); não são obrigatoriamente habilitados para completar a instalação do núcleo.

## Agenda, falha e recuperação

Aplicar os templates e comandos do [guia de operação](operations.md) somente ao serviço do piloto. A conta responsável pelo host precisa poder instalar as unidades e ler seus logs; este roteiro não executa essas ações nem presume um host já provisionado.

1. Conferir nomes de serviço/Compose, diretório de trabalho, segredo próprio, fuso UTC, calendário e próximos disparos. Nenhum segredo deve aparecer na unidade, nos argumentos visíveis do processo, em comandos colados no relatório ou nos logs.
2. Habilitar os cinco timers no host do piloto e observar disparos produzidos pelo agendador. Registrar cada job, horário previsto, início/fim real, status do serviço, resultado HTTP e contadores permitidos. Uma chamada manual ou apenas `enabled`/`active` não preenche essa evidência.
3. Observar a repetição normal, incluindo o job por minuto e o job a cada cinco minutos. Para os três jobs horários, aguardar um disparo real; um calendário temporariamente acelerado deve ser identificado como tal e não apresentado como prova da cadência normal. Registrar que o calendário de referência foi restaurado.
4. Confirmar que um disparo com zero itens elegíveis é distinguido de um efeito funcional. Um ensaio dos efeitos de expiração, drip, aviso, retry e cleanup neste host usa fixtures exclusivas e consulta antes/depois, sem registros reais.
5. Ensaiar uma falha recuperável limitada à aplicação do piloto, como indisponibilidade durante um disparo. Registrar serviço com erro, ausência de sucesso aparente e localização da falha. Restaurar a aplicação e observar um **novo disparo agendado** bem-sucedido; não ocultar a falha original nem contá-la como sucesso.
6. Conferir como execuções perdidas são tratadas e como o operador detecta falhas. Um timer persistente não repete necessariamente todas as ocorrências perdidas. A recuperação continua sujeita às janelas do handler: avisos de expiração fora da janela e drip anterior aos sete dias não têm backfill garantido.
7. Ao finalizar, decidir se a agenda permanece ativa no host dedicado ou se será desligada. Registrar essa decisão e o estado final. Não deixar jobs agendados sem responsável.

Se o job exige envio e o transporte necessário não estiver preparado, registre o limite ou a falha. Ausência de destinatários elegíveis não demonstra entrega de e-mail. Prova de agenda não é prova de escala, monitoramento com alerta externo nem garantia de processamento exatamente uma vez.

## Continuidade da instalação

Execute somente as operações descritas no guia e limitadas aos recursos do piloto. Não usar prune, remoção global de volumes ou scripts privados. A seguinte sequência exige dados fictícios que permitam comparar o estado antes/depois:

1. **Parada e retomada:** interromper e iniciar a aplicação pelo procedimento do guia, preservando o Supabase. Conferir imagem, login, curso, matrícula, progresso, arquivo e configuração da marca. Confirmar retomada dos timers e estado operacional final.
2. **Backup:** registrar instante e conjunto protegido: banco, objetos de Storage, configuração, segredos e referência da imagem/migrations. Um dump SQL isolado não comprova backup dos bytes dos objetos nem das configurações externas de Auth/provedores. Guardar tudo em local privado com acesso restrito.
3. **Restauração:** usar um segundo alvo descartável dedicado, seguindo o método suportado pelo ambiente escolhido. Não sobrescrever o Supabase do piloto ou de qualquer outra instalação para demonstrar restauração. Conferir contas/perfis, permissões, matrículas/progresso, URLs/callbacks, marca e download real dos arquivos. Registrar tempo, diferenças e itens que o método não restaurou.
4. **Atualização:** partir de revisão conhecida, preservar backup verificado e seguir o procedimento documentado para migrations e imagem. Registrar SHA anterior/novo, versões aplicadas, passos e smoke tests. Se não houver revisão nova ou migration apropriada para ensaio, marcar atualização como preparada e não executada; reiniciar a mesma imagem não comprova migração de versão.
5. **Recuperação de atualização:** definir e exercitar o caminho aplicável ao caso. Voltar à imagem anterior não reverte schema nem recupera dados; só é válido se a compatibilidade tiver sido verificada. Não inventar down migration nem apresentar restore não ensaiado como rollback comprovado. URL/anon key pública diferente exige novo build.

## Registrar os resultados

Mantenha um registro privado da revisão, ambiente, configuração relevante e resultados observados. Para cada verificação, diferencie sucesso, falha e teste não executado. Compartilhe somente exemplos sanitizados; exclua credenciais, dados reais, dumps e traces de autenticação.

Uma instalação está validada somente para os percursos efetivamente testados nesse ambiente. Use as falhas e intervenções necessárias para corrigir a configuração ou reportar problemas reproduzíveis seguindo [CONTRIBUTING.md](../../CONTRIBUTING.md).
