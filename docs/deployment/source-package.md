# Obter e verificar um pacote de fonte

Este guia descreve os recursos e a extração de um pacote para **uma instalação e um projeto Supabase próprios por organização**. O percurso de referência usa Docker em Linux com systemd. A instalação hospedada em Linux/VPS ainda não foi validada de ponta a ponta; preparar um pacote não comprova instalação, entrega de e-mail, agenda ou recuperação. Consulte também as [limitações conhecidas](../known-limitations.md).

## Recursos necessários

| Item | Conferir antes de iniciar |
| --- | --- |
| Host/VM Linux exclusivo com systemd | Acesso administrativo configurado, disco e portas disponíveis; ambiente separado de dados e serviços reais |
| Supabase novo e próprio | Projeto vazio identificado, operador e acesso privado; conferir destino antes das migrations |
| Origem HTTPS/proxy | Domínio do piloto e caminho de configuração no host |
| E-mail Auth e aplicação | Configurações separadas, modo de teste e destinatários controlados |
| Operador/revisor | Pessoa que seguirá os guias e registrará as intervenções necessárias |
| Backup e destino de restauração | Destino privado fora do host e ambiente descartável separado |
| Código e documentação | Revisão identificada, com os guias e as migrations correspondentes |
| Pacote de fonte, quando usado | SHA Git completo fornecido, SHA-256 do arquivo e conteúdo conferido antes da extração |

Mantenha código, dados, conteúdo e credenciais do piloto separados de instalações existentes. Um segundo checkout no mesmo daemon Docker usa a mesma pilha de desenvolvimento fixa e não demonstra isolamento de uma instalação. Os comandos de [desenvolvimento local](../development.md) não substituem o provisionamento hospedado descrito no [guia de instalação](installation.md).

## Preparar ou conferir um pacote

Use um checkout limpo da revisão escolhida. Revise os arquivos rastreados, as licenças e o conteúdo que será distribuído. Para produzir um pacote local fora da árvore de código:

```sh
git status --short
git rev-parse HEAD
git ls-tree -r --name-only HEAD
OPENMEMBERS_PACKAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/openmembers-package.XXXXXX")"
git archive --format=tar --prefix=openmembers/ --output="$OPENMEMBERS_PACKAGE_DIR/openmembers-pilot.tar" HEAD
shasum -a 256 "$OPENMEMBERS_PACKAGE_DIR/openmembers-pilot.tar"
tar -tvf "$OPENMEMBERS_PACKAGE_DIR/openmembers-pilot.tar"
```

No Linux, `sha256sum` pode substituir `shasum -a 256`. Arquivos não commitados não entram no `git archive`; confira que `git status --short` está vazio antes de produzir o pacote. A lista do Git e o conteúdo efetivo precisam ser revisados: `.gitignore` não exclui um arquivo privado já rastreado. O pacote de fonte não é uma imagem Docker pronta.

Guarde o SHA Git completo, nome do arquivo, SHA-256, tamanho e número de arquivos junto ao registro da instalação. Compare o conjunto e o conteúdo dos arquivos do pacote com a revisão selecionada. O pacote deve conter a documentação e as migrations da mesma revisão; confira a lista atual no [guia de instalação](installation.md#3-preparar-o-supabase-e-aplicar-migrations).

Extrair somente depois de conferir hash, prefixo relativo, ausência de `..`, links e materiais privados. Use `tar -tvf` para ver o tipo de cada entrada e eventuais destinos de links. O pacote de referência não precisa de links: recuse links simbólicos ou físicos inesperados. Não inclua `.git`, dependências instaladas, builds, arquivos pessoais, credenciais ou dados reais.

Um pacote recebido de outra pessoa exige a mesma conferência antes da extração. Compare seu SHA-256 com o valor obtido de uma fonte confiável e registre a revisão completa fornecida. Preserve essa identificação fora do pacote. Em um checkout Git, use `git rev-parse HEAD` e confirme a árvore limpa; em um pacote sem `.git`, use os dados fornecidos e não execute comandos Git nessa cópia.

## Extrair um pacote conferido no Linux

Depois de comparar SHA-256, lista de arquivos e identificação da revisão, prepare um diretório **novo e vazio**. O archive produzido acima contém o prefixo único `openmembers/`; `--strip-components=1` só deve ser usado depois de essa estrutura ter sido confirmada em `tar -tvf`:

```sh
if sudo test -e /opt/openmembers || sudo test -L /opt/openmembers; then echo 'Recuse: /opt/openmembers já existe; use um destino novo.' >&2; exit 1; fi
sudo install -d -m 0755 -o "$(id -un)" -g "$(id -gn)" /opt/openmembers
tar --extract --file=/caminho/do/openmembers-pilot.tar --directory=/opt/openmembers --strip-components=1 --no-same-owner --no-same-permissions
cd /opt/openmembers
test ! -e .git
test -f package.json
test -f package-lock.json
```

Substitua somente o caminho do tar. Não execute a extração como root e não reaproveite um diretório com checkout, dependências, build ou configuração anterior. O pacote não contém `.git`: use no registro o SHA completo recebido e não execute `git status`/`git rev-parse` nessa cópia. Confira os arquivos extraídos contra a lista e os hashes do pacote antes de instalar dependências.

## Instalar e validar

1. Confira identidade e isolamento do host e do Supabase, arquivos de configuração e destinos. Mantenha credenciais e logs com dados pessoais fora dos registros compartilhados.
2. Siga a [instalação](installation.md) na revisão identificada: migrations, ambiente/build, HTTPS e só então cadastro e promoção do administrador. Use dados fictícios e destinatários controlados.
3. Execute as verificações da [aceitação da instalação](installation.md#9-aceitar-a-instalação-e-seguir-para-operação), incluindo disparos reais da agenda e falha/recuperação conforme o [guia operacional](operations.md). Chamadas manuais não comprovam disparos do systemd.
4. Faça backup e restaure em outro ambiente descartável, conferindo banco, arquivos, Auth e comportamento funcional. Registre o tempo medido, as lacunas e a revisão de cada imagem.
5. Registre resultados, intervenções e limitações. Corrija passos implícitos nos guias e repita as verificações afetadas antes de considerar a instalação pronta para receber dados reais.

Preparação de ambiente, testes locais e validação hospedada são resultados distintos. Registre somente os testes efetivamente executados, com a revisão e o destino correspondentes. Os guias de [operação](operations.md), [integrações](../integrations/README.md) e a [política de segurança](../../SECURITY.md) complementam esse percurso.
