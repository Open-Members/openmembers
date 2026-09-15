# Operação em Docker/Linux

Referência para uma aplicação e um Supabase próprios por organização. Começar pela [instalação](installation.md). O percurso hospedado em Linux/VPS, incluindo agenda e recuperação, ainda não concluiu a [validação de instalação](validation.md). Os templates não instalam nem habilitam serviços automaticamente; testes locais dos handlers não comprovam o scheduler Linux.

## Saúde e configuração

Os exemplos assumem checkout identificado em `/opt/openmembers`, Docker em `/usr/bin/docker`, Compose v2 ou posterior, env privado em `/etc/openmembers/application.env` e apresentação em `/etc/openmembers/installation.json`. Executar como operador autorizado a administrar **este host**. O template systemd de sistema usa root para falar com o Docker; acesso ao daemon equivale a poder administrativo no host. O processo da aplicação permanece UID 1001 e não recebe o socket Docker.

```sh
cd /opt/openmembers
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml config --quiet
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml ps
curl --fail --max-time 10 http://127.0.0.1:3000/api/health
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml logs --tail 100 app
```

Não publicar `docker inspect`, `compose config` sem `--quiet`, envs, dumps ou logs brutos. O helper de jobs limita seu próprio log; logs da aplicação ainda podem incluir identificadores/erros do banco. Dar acesso somente à operação e redigir evidências antes de compartilhar.

Sem a configuração mínima, o proxy retorna 503 antes da rota. Quando configurado, `/api/health` verifica processo e leitura REST de `tenant_settings`; 200 não valida todas as migrations, Auth, Storage, e-mail ou agenda. O healthcheck de Compose marca falha, mas **não reinicia automaticamente** um container apenas por estar unhealthy. `restart: unless-stopped` trata saída do processo. O responsável deve ligar alertas externos de disponibilidade e falha de jobs no host escolhido; nenhum canal está configurado pelo repositório.

Os argumentos públicos do build e o env runtime devem apontar para a mesma instalação. Alterou `NEXT_PUBLIC_*`: construir outra imagem. Alterou segredo/transportes: recriar o container com `up -d --no-build --force-recreate app`; `restart` não recarrega o env. Alterou a apresentação: validar o JSON e recriar o container para reler também arquivos substituídos atomicamente no host. O arquivo é público e montado somente leitura, mas precisa ser legível por UID 1001.

## Executor e agenda

[`scripts/run-job.mjs`](../../scripts/run-job.mjs) aceita exatamente um destes nomes. Usa GET/Bearer do env `CRON_SECRET`, timeout de 120 s, limite de resposta de 16 KiB, nenhum redirect/retry automático e saída 0 somente com HTTP 2xx e resumo JSON reconhecido. Saída 1 contém um código de erro fixo, sem corpo de resposta, origem ou segredo. O envio abortado **não cancela necessariamente o trabalho já iniciado no servidor**; conferir banco/fila antes de intervenção manual.

| Job | Timer UTC | Contadores de sucesso |
| --- | --- | --- |
| `expire-enrollments` | Toda hora, minuto 00 | `expired` |
| `expiration-warning-7d` | Toda hora, minuto 05 | `sent`, quando presentes `skipped/failed/total` |
| `drip-check` | Toda hora, minuto 10 | `processed/notified` |
| `webhook-retry` | Todo minuto | `processed/abandoned/rescheduled/batchSize` |
| `webhook-cleanup` | A cada cinco minutos | `rateLimitHitsPurged/graceWindowsCleared` |

`abandoned`/`rescheduled` maiores que zero exigem acompanhamento da fila mesmo com HTTP 200: o job rodou, mas nem todo pagamento terminou. A semântica e as janelas de cada handler estão no [guia de e-mail e jobs](../integrations/email-jobs.md). O aviso de expiração exige transporte de e-mail funcionando; deixá-lo sem configuração resulta em 503, não em sucesso silencioso.

Compose fixa a origem do executor em `http://127.0.0.1:3000` **dentro do container**. Uso manual fora dele pode definir `OPENMEMBERS_JOB_ORIGIN` para HTTPS próprio ou HTTP loopback; a origem não aceita caminho, usuário/senha, query ou fragmento. Não passar segredo na linha de comando.

Antes de habilitar timers, testar manualmente cada job no piloto com dados e destinatários controlados. O exemplo abaixo faz uma mutação limitada à limpeza descrita no guia de e-mail e jobs:

```sh
docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml exec -T app node scripts/run-job.mjs webhook-cleanup
```

### Instalar no host escolhido

Somente no host dedicado do piloto, após validar aplicação, relógio e transporte. Conferir `command -v docker`; se divergir de `/usr/bin/docker`, ajustar `ExecStart` na cópia das unidades e registrar a adaptação. Em Docker rootless, adaptar usuário/contexto explicitamente; o template é para o daemon de sistema local.

```sh
cd /opt/openmembers
timedatectl status
systemd-analyze calendar '*-*-* *:00:00 UTC' '*-*-* *:05:00 UTC' '*-*-* *:10:00 UTC' '*-*-* *:*:00 UTC' '*-*-* *:0/5:00 UTC'
sudo install -m 0644 deploy/systemd/openmembers-job@.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/openmembers-*.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/openmembers-job@.service /etc/systemd/system/openmembers-*.timer
sudo systemctl daemon-reload
sudo systemctl enable --now openmembers-expire-enrollments.timer openmembers-expiration-warning-7d.timer openmembers-drip-check.timer openmembers-webhook-retry.timer openmembers-webhook-cleanup.timer
systemctl list-timers --all 'openmembers-*.timer'
```

Cada timer ativa uma instância fixa de `openmembers-job@.service`; o systemd não inicia outra instância igual enquanto ela estiver ativa. `Persistent=true` dispara uma execução ao retornar de uma pausa em que havia vencimento. Não reproduz todos os horários perdidos nem amplia as janelas de drip/aviso. Isso segue o [manual oficial de timers](https://raw.githubusercontent.com/systemd/systemd/main/man/systemd.timer.xml) e a [sintaxe de calendário](https://raw.githubusercontent.com/systemd/systemd/main/man/systemd.time.xml).

`TimeoutStartSec=150` limita o cliente Compose, com margem sobre os 120 s do helper. Perda do cliente Docker pode deixar o processo remoto até seu próprio timeout. Não configurar um segundo scheduler para as mesmas rotas nem iniciar jobs manuais concorrentes durante a prova. A próxima ocorrência do timer pode tentar de novo; falhas não geram uma execução imediata escondida.

### Conferir disparos e recuperação

Esperar pelo menos uma hora completa com timers ativos para cobrir os cinco horários; registrar UTC de início/fim e **cada disparo pelo timer**, não somente `systemctl start`. Consultar, trocando o nome pelo job em análise:

```sh
systemctl show openmembers-job@webhook-retry.service -p Result -p ExecMainStatus -p ExecMainStartTimestamp -p ExecMainExitTimestamp
journalctl -u openmembers-job@webhook-retry.service --since '1 hour ago' --no-pager -o cat
systemctl list-timers --all 'openmembers-*.timer'
```

No piloto sem usuários reais, registrar estado dos cinco jobs, introduzir uma falha controlada no serviço **do piloto** (por exemplo, pará-lo antes de um disparo de retry), comprovar status não zero e restaurá-lo. A próxima ocorrência deve retornar ao sucesso sem intervenção na fila além da prevista. Parar o app não testa uma falha parcial do handler. Registre separadamente os testes de indisponibilidade, falha parcial e recuperação; chamadas manuais não substituem a comprovação dos disparos pela agenda.

Para pausa de manutenção, sem parar o daemon ou outros projetos:

```sh
sudo systemctl stop openmembers-expire-enrollments.timer openmembers-expiration-warning-7d.timer openmembers-drip-check.timer openmembers-webhook-retry.timer openmembers-webhook-cleanup.timer
systemctl list-units --all 'openmembers-job@*.service'
```

Esperar as unidades em execução terminarem antes de alterar schema ou parar a aplicação. Após manutenção, repetir o `enable --now` acima (timers já habilitados serão iniciados); pode ocorrer execução de compensação por `Persistent`. Para retirar a agenda permanentemente, usar `disable --now` com os mesmos cinco nomes. Não apagar volumes do Docker.

## Backup e restauração

Antes do piloto, definir responsável, destino privado externo ao host, retenção, perda de dados tolerada e prazo de recuperação. Registrar os valores e o tempo medido; o projeto não oferece garantia de RPO/RTO. O conjunto mínimo contém:

Os scripts `scripts/pilot-recovery.mjs` e `scripts/pilot-recovery-app.mjs` pertencem exclusivamente ao ensaio local com portas, projetos e dados fictícios fixos. Eles não são ferramentas de backup/restauração do Supabase hospedado e não devem ter seus guards alterados ou receber URLs/credenciais remotas. Para uma instalação deste guia, use o mecanismo contratado e ensaiado no destino separado descrito abaixo.

| Material | Preservar e conferir |
| --- | --- |
| Banco Supabase | Schema, dados, Auth, papéis/políticas/funções, recibos/fila e histórico de migrations; usar mecanismo compatível com o plano do projeto |
| Storage | Bytes dos três buckets e seus caminhos, além dos metadados/políticas do banco; R2 se ativado |
| Configuração | Env cifrado em cofre, apresentação, Auth/URLs/SMTP/hooks, proxy/TLS, timers e inventário de integrações |
| Artefato | SHA do código, imagem/ID/digest, valores públicos do build, versões e arquivos de migration aplicados |

O backup de banco do Supabase **não contém os bytes do Storage**. Verificar a disponibilidade real do recurso no plano contratado e manter cópia externa: [backups Supabase](https://supabase.com/docs/guides/platform/backups). Para exportação/restauração lógica, seguir o [procedimento oficial completo](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), incluindo papéis, schema, dados e tratamento de Auth/Storage; um `pg_dump` parcial não é o pacote de recuperação. Não incluir senha/URL de conexão em logs compartilhados.

Roteiro de ensaio, sempre com os dados fictícios do piloto:

1. Pausar escritas/entrada de webhooks e os cinco timers; esperar trabalhos em curso terminarem. Registrar instante e contagens funcionais de perfis, cursos, matrículas, progresso, recibos/fila e dois arquivos de tipos distintos com hashes.
2. Fazer backup do conjunto acima, registrar mecanismo/instante/identificador e checar legibilidade e hashes. Não rodar `db:reset`/`db:verify` neste projeto hospedado.
3. Restaurar para **outro projeto/ambiente descartável próprio**, isolado de destinatários e webhooks reais, conforme o método escolhido. Não aplicar todas as migrations sobre um backup que já contém o schema/histórico. Restaurar bytes de arquivos e reaplicar a configuração de serviço que não pertence ao backup do banco.
4. Construir imagem com as URLs/chaves públicas do destino de restauração; usar suas credenciais runtime. Verificar login, papel admin, aluno sem acesso indevido, matrícula/progresso, arquivo autorizado e recusa para usuário sem matrícula, saúde e execução controlada dos jobs. Comparar contagens/hashes e registrar diferenças justificadas.
5. Medir duração e lacunas. Se falhar, corrigir e repetir antes de declarar recuperação disponível. Desativar a cópia restaurada após guardar a evidência; não apontar DNS nem webhooks reais para ela.

Restauração de recibos/fila para um instante antigo pode causar reprocessamento de eventos ou repetir e-mails. Operação real exige reconciliação dos eventos com o provedor antes de reabrir webhooks/timers. Esse cenário externo ainda não foi homologado.

## Atualização e retorno à versão anterior

Preparar cada atualização em homologação com cópia autorizada e separada. Guardar a imagem anterior por ID/tag imutável, backup compatível e configuração pública original. Não usar `git pull`/tag mutável como plano de retorno.

1. Revisar diff/nota da versão e migrations novas; registrar SHA e imagem alvo. Identificar se o schema novo ainda suporta a aplicação anterior. Não pressupor migrations reversíveis.
2. Construir a imagem nova com os valores públicos da **mesma** instalação, usando tag nova em `OPENMEMBERS_IMAGE`; testar em homologação. `config --quiet` checa resolução, não identidade do projeto nem credenciais.
3. No host alvo, pausar timers e escritas conforme acima; fazer backup. Aplicar somente migrations pendentes pelo percurso hospedado revisado em [instalação](installation.md), conferindo destino e dry-run. Não executar scripts `db:*` locais como ferramenta de atualização remota.
4. Confirmar a tag nova no env privado e recriar somente `app`:

   ```sh
   docker compose --env-file /etc/openmembers/application.env -f deploy/compose.yaml up -d --no-build --force-recreate app
   curl --fail --max-time 10 http://127.0.0.1:3000/api/health
   ```

5. Validar pelo HTTPS login, curso/aluno, admin, arquivos e mudança esperada; retomar timers e observar disparos. Registrar a janela. Este Compose tem uma réplica e não promete atualização sem interrupção.

Se a nova imagem falhar e o schema continuar compatível, voltar `OPENMEMBERS_IMAGE` à imagem anterior preservada e repetir a recriação/verificação. Se incompatível, manter manutenção e executar o plano de recuperação ensaiado; apenas trocar a imagem não desfaz SQL nem efeitos de pagamentos/e-mails. Um ensaio de recriação/retorno entre tags comprova somente as revisões e a compatibilidade de schema efetivamente testadas.

## Diagnóstico inicial

| Sintoma | Conferência e ação |
| --- | --- |
| Compose rejeita variável ou montagem | Preencher o env absoluto, verificar JSON existente/legível e executar `config --quiet`; conferir que a shell não sobrescreve variáveis da instalação |
| `/setup` ou API 503 | Conferir URL/chave pública no build e service role no runtime; verificar migrations e projeto correto |
| Health 200, login/arquivo falha | Verificar Auth/URLs, confirmação de e-mail, matrícula/RLS e Storage; health não cobre esses fluxos |
| Job 401 | Conferir `CRON_SECRET` no processo da aplicação e executor; recriar após mudança de env |
| Aviso 503 | Conferir transporte, remetente e falhas parciais; não reenviar fora da janela sem avaliar a auditoria |
| Timer sem disparos | Conferir relógio, enabled/active, caminhos de ExecStart, Docker e journal; template copiado não é prova de ativação |
| Timeout/backlog | Inspecionar duração/volume e itens abandonados; não aumentar retries/concorrência cegamente |
| Disco cheio | Identificar arquivos/cache/logs desta instalação e retenção; não usar prune global nem reiniciar serviços alheios |

As configurações de imagem/Compose seguem [variáveis e precedência](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/) e [serviços Compose](https://docs.docker.com/reference/compose-file/services/). O projeto fixa Node 22.23.2 em `.nvmrc`, `package.json` e `Dockerfile`; fixação de versão não substitui revisão de atualizações e vulnerabilidades antes da distribuição.
