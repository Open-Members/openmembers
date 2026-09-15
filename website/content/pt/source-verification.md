`npm run verify:source` é uma verificação sem acesso à rede do commit Git exato em `HEAD`. Ela detecta caminhos de materiais locais proibidos e um conjunto limitado de padrões de credenciais nesse commit. Exige o Node de `.nvmrc` e Git com a opção `--no-lazy-fetch`; versões de Git incompatíveis falham, sem enfraquecer a verificação. Não instala dependências, contata provedores, inicia Docker nem opera um banco.

Execute depois de criar o commit:

```sh
npm run verify:source
```

O índice rastreado e a árvore de trabalho devem estar limpos segundo o Git. O comando verifica separadamente alterações preparadas e não preparadas e recusa ambos os estados, inclusive um índice diferente tanto de `HEAD` quanto do arquivo de trabalho. Opções do índice como `assume-unchanged` podem ocultar alterações de arquivos nessa checagem; o conteúdo inspecionado continua sendo o dos objetos Git do commit, nunca os bytes desses arquivos de trabalho. Uma mudança em `HEAD` ou no estado rastreado informado pelo Git durante a execução invalida o resultado. Arquivos não rastreados e ignorados ficam fora da verificação e não são lidos.

Esta é uma verificação posterior ao commit, e não um gancho de pré-commit. Um commit local não é publicação. Após corrigir um achado, crie outro commit local e verifique essa revisão. A aprovação de um commit posterior não libera os anteriores.

## O que é verificado

- Caminhos de trabalho privado, estado de ferramentas locais, arquivos reais de ambiente, configuração de instalação, chaves e saídas geradas, inclusive materiais adicionados à força apesar de `.gitignore`. Nomes reconhecidos de arquivos internos de planejamento, handoff e instruções de agentes são recusados na raiz e em subdiretórios, sem diferenciar maiúsculas de minúsculas. A configuração local de implantação Cloudflare também é excluída.
- Somente arquivos Git regulares. Links simbólicos e submódulos são recusados, sem seguir seus destinos.
- Os dois modelos de ambiente distribuídos, `.env.example` e `deploy/application.env.example`, são permitidos pelo caminho exato. Seu conteúdo continua sendo verificado como o dos demais arquivos.
- Padrões conhecidos de credenciais, incluindo cabeçalhos de chaves privadas e formatos selecionados de tokens/JWTs. São verificações explícitas de padrões, não um detector geral de entropia. As regras abrangem código, documentação e testes; nenhum diretório inteiro é dispensado da inspeção de conteúdo.

As regras atuais cobrem cabeçalhos de chaves privadas PEM, formatos de tokens clássicos e de acesso refinado do GitHub, chaves secretas/restritas da Stripe, chaves secretas do Supabase e JWTs que declarem `service_role` ou `supabase_admin`. A inspeção do JWT lê cabeçalho e conteúdo; não autentica a assinatura nem determina se a credencial está ativa. São verificados padrões ASCII em objetos binários e UTF-16 nas duas ordens de bytes. Outros formatos e conteúdo codificado/comprimido podem não ser detectados.

A implementação e os identificadores exatos das regras estão em [verify-source.mjs](../scripts/verify-source.mjs), com exemplos fictícios gerados por [seus testes](../tests/tooling/verify-source.test.mjs). As regras são genéricas; nomes específicos do projeto, elementos visuais e direitos sobre assets exigem revisão separada.

O verificador limita seu trabalho e recusa instantâneos que excedam um limite:

| Limite | Valor |
| --- | --- |
| Arquivos regulares | 20.000 |
| Tamanho de um objeto | 5 MiB |
| Conteúdo total dos arquivos | 50 MiB |

Os metadados da árvore Git também são limitados a 8 MiB. No máximo 100 achados são apresentados; atingir esse limite ainda resulta em falha. A busca por credenciais é limitada por objeto, inclusive para ocorrências repetidas na mesma linha. Um resultado Git ilegível ou malformado também falha. Arquivos não são ignorados silenciosamente para produzir sucesso. Um projeto legitimamente maior exige uma mudança revisada dos limites e os testes correspondentes.

Sobrescritas de Git herdadas do ambiente são removidas, e filtros externos de limpeza/processamento são recusados antes de inspecionar alterações rastreadas. O verificador não modifica sua configuração Git. Configurações de clone parcial/promissor são recusadas antes de resolver objetos, e a busca automática sob demanda também é desativada por opção e ambiente. Use um clone local regular com os objetos do instantâneo disponíveis; a verificação não busca objetos ausentes. Ganchos, conversões externas de diferenças/texto e monitores do sistema de arquivos não são usados.

## Resultados e alcance

O sucesso identifica a revisão inspecionada. Os achados identificam a regra e a localização do arquivo sem reproduzir a credencial ou linha correspondente. Falhas do Git usam diagnósticos sem dados sensíveis, em vez de despejar a saída bruta. Nomes de arquivos semelhantes a credenciais exigem o mesmo cuidado de ocultação que o conteúdo.

O trabalho de qualidade da integração contínua executa esse comando depois da configuração do Node e antes de instalar dependências. Seus testes fazem parte de `npm run test:tooling`. A configuração do fluxo e testes locais bem-sucedidos não comprovam a aprovação de uma execução hospedada no GitHub.

`verify:artifact` continua sendo uma verificação separada dos manifestos de rastreamento de um build Next.js concluído. Pode rodar dentro de um build Docker sem Git e não substitui a verificação de fonte. Nenhuma das duas inspeciona o conteúdo completo de uma imagem final de contêiner.

Passar nesta etapa **não** comprova ausência de todos os segredos, dados pessoais, visuais privados, conteúdo codificado/comprimido ou restrições de licença. Ela não inspeciona outras referências, commits históricos, reflogs, arquivos não rastreados nem configurações do repositório remoto. Credenciais públicas de demonstração continuam intencionalmente fictícias. O pacote final de fonte e qualquer imagem exigem revisão própria vinculada a uma revisão e artefato exatos.

Se o verificador encontrar uma credencial real, siga [SECURITY.md](../SECURITY.md). Apagar a sequência em um commit posterior não invalida a credencial no provedor nem a remove do histórico. Mantenha valores e evidências privadas fora de issues e registros públicos. Um falso positivo exige uma correção restrita e revisada da regra ou um dado de teste claramente fictício; não desative as verificações de conteúdo para uma pasta inteira.

Consulte o [guia de contribuição](../CONTRIBUTING.md) para as verificações necessárias e as [limitações conhecidas](known-limitations.md) para os limites atuais de validação.
