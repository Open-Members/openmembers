# Recursos e chat de curso

Cada organização usa sua própria instalação e projeto Supabase. Os recursos opcionais dependem de configuração explícita; credenciais válidas, por si só, não comprovam funcionamento com um provedor externo.

## Chat de curso e corpus

O chat é opcional e fica desativado por padrão. Habilitação explícita exige todas estas condições:

| Requisito | Contrato atual |
|---|---|
| Adesão operacional | `COURSE_CHAT_ENABLED=true` (valor exato após remover espaços) |
| Auth e banco da instalação | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Consulta vetorial no servidor | `DATABASE_POOL_URL`, com preferência, ou `DATABASE_URL`; `pg` inicializado sob demanda, até 5 conexões, espera de conexão de 5 s e consulta de 15 s |
| Credencial de IA própria | `AI_GATEWAY_API_KEY`, usada somente pelo servidor |
| Material preparado | `lesson_chunks` ligado a aulas da instalação, texto não vazio e `embedding vector(1536)` não nulo |
| Permissão do aluno | Sessão válida, perfil ativo, acesso ao curso e aulas visíveis pela sessão; a lista de aulas restringe também o SQL privilegiado |

Sem opt-in ou com configuração parcial, o botão não é montado no player e os seis handlers respondem **503 `not_configured` antes de abrir clientes**: enviar, retomar, arquivar, listar, detalhar e excluir conversas. Remover a flag desliga essas operações da aplicação; não apaga conversas armazenadas. O administrador continua responsável pela retenção e remoção dos dados no banco. A flag não altera os privilégios SQL/RLS existentes e não representa uma revogação de acesso REST a registros já pertencentes ao usuário.

Com configuração completa, o POST verifica sessão, acesso ao curso, limite de uso e propriedade da conversa. A busca primeiro resolve as aulas permitidas pela sessão e consulta a existência de chunks utilizáveis nesse mesmo conjunto. **Sem corpus acessível, não chama embedding, resposta ou título externos.** A API retorna **409 `context_unavailable`**, exibido como aviso no drawer, sem criar conversa ou gravar a pergunta. Caso o corpus desapareça entre as duas consultas, a busca também pode retornar vazio e impedir a geração de resposta.

O pipeline de ingestão **não está distribuído**: não há comando de transcrição, fragmentação ou geração de embeddings. Antes de habilitar o chat, prepare uma ingestão revisada com material autorizado e verifique a qualidade das respostas. A existência das tabelas não preenche o corpus automaticamente.

Limites concretos do código:

- Até 30 solicitações de geração por usuário/hora UTC, contabilizadas no PostgreSQL. Solicitações autenticadas que chegam ao contador também podem consumir a cota se posteriormente não houver contexto ou ocorrer falha. Listagem de conversas: 60/min por usuário, em memória por processo.
- Pergunta de até 2.000 caracteres; histórico recebido de até 16 mensagens, cada uma com até 8.000 caracteres; até 8 encaminhadas ao modelo. Pergunta e histórico passam pelo detector de padrões de credenciais, que não substitui uma política completa de dados.
- Busca de até 5 chunks. Endpoint de transporte fixo `https://ai-gateway.vercel.sh/v1`; IDs configurados no código: `openai/text-embedding-3-small`, `anthropic/claude-sonnet-4-6` para resposta e `anthropic/claude-haiku-4-5` para título. Confirme a disponibilidade desses modelos na conta do provedor antes de habilitar o recurso. Vetores recebidos devem ter 1.536 valores numéricos finitos.
- Resposta limitada a 1.000 tokens e título a 30 tokens. Streaming NDJSON envia citações, deltas e conclusão. Resposta parcial pode ser persistida após falha de streaming; erro público não contém a resposta bruta do provedor.
- Chunks, perguntas e até oito mensagens de histórico são dados enviados ao provedor quando habilitado e com corpus disponível. Chaves não entram em props da UI. Há verificação de propriedade antes de persistir a mensagem de assistente com cliente administrativo.

Valide na instalação: corpus próprio no pgvector, matrícula válida/expirada/suspensa, drip, acesso cruzado, respostas/citações, orçamento concorrente, falha e retomada de streaming, retenção e limites do provedor. Testes com dependências controladas não comprovam qualidade ou operação do serviço externo.

## Recursos disponíveis

Os recursos abaixo dependem de conteúdo e configuração administrativa. A presença de uma tela ou tabela não certifica todos os fluxos da instalação. Confira as permissões e os casos relevantes ao seu conteúdo antes de disponibilizá-lo aos alunos.

| Recurso | Como funciona | Limites e verificações |
| --- | --- | --- |
| Ebooks e marca d'água | Biblioteca e leitor; PDFs usam a rota autorizada e recebem nome, e-mail e data da identidade autenticada. | Confira PDF inválido/criptografado, nomes fora do alfabeto latino e compatibilidade do leitor. Marca d'água não é DRM nem impede cópia. Veja [armazenamento](../integrations/storage.md). |
| Quizzes | Perguntas por aula, correção no servidor, limite de tentativas e conclusão de aula. O cliente não consulta as opções corretas. | Valide tentativas concorrentes, resultado e progresso com o banco e o formulário da instalação. |
| Certificados | Desativados até habilitar a instalação **e** o curso. A elegibilidade exige conclusão das aulas publicadas; emissão e PDF usam dados da instalação. | Confira emissão repetida/concorrente, fontes/imagens e acesso. Não há acreditação nem página pública de verificação. |
| Coleções e instrutores | Administração de coleções, ordenação, associação de cursos e instrutores; mutações exigem administrador. | Confira publicação, catálogo e permissões após configurar o conteúdo. |
| Busca | Cursos publicados são públicos; resultados de aulas exigem sessão e acesso à aula, publicação da hierarquia e liberação por drip. | Limites de 80 caracteres e oito resultados por grupo. Veja [visibilidade da busca](search.md). |
| Turmas e aulas ao vivo | Turmas ligam matrículas; agenda usa horários, fuso e links configurados. Calendário e banner consultam cursos acessíveis e sessão. | Confira horário de verão, expiração, múltiplos cursos e visibilidade do link. Nenhum serviço de videoconferência é provisionado. |
| Suporte, avisos e notificações internas | Tickets do usuário, notas internas separadas, públicos de avisos e notificações por usuário. Avisos externos usam o [transporte de e-mail](../integrations/email-jobs.md). | Confira público, perfis suspensos, acesso expirado e falhas de envio. Notificação interna não implica push. |
| Relatórios, atividade e pontuação | Progresso, streak, atividade, consultas administrativas e CSV. Exportação exige administrador ativo. | Confira intervalos, permissões e texto controlado pelo usuário no CSV. Métricas não são auditoria financeira. |
| Importação administrativa | Prévia de CSV, validação de pacote/turma/data e tratamento por linha; reutiliza o [convite manual](enrollment.md). | Confira duplicidade, reexecução, erros parciais e opção de e-mail com arquivos de teste. Não há migração automática de outra plataforma. |
| Chat de IA | Experimental, opcional e desativado por padrão; exige corpus e configuração descritos acima. | Valide banco, provedor, qualidade das respostas e política operacional antes de habilitar. |
| Pipeline de conhecimento | Schema/chunks e consumidor de recuperação disponíveis; ingestão não distribuída. | Preparar ingestão, atualização e remoção de material autorizado é responsabilidade da instalação. |

Consulte a [matriz de integrações](../integrations/README.md) para vídeo, OAuth, telemetria e outros provedores. Novas assinaturas push estão desativadas; o manifesto configurável não inclui uma experiência offline.
