# Visibilidade da busca

A busca global apresenta cursos publicados e aulas permitidas à sessão atual. A consulta aceita até 80 caracteres e retorna até oito resultados por grupo.

## Cursos e aulas

O catálogo de cursos publicados é público. O estado de acesso vem de `getUserCourseAccess`; um curso sem acesso continua apontando para sua apresentação.

A busca de aulas usa o cliente Supabase da sessão, sujeito à RLS `can_access_lesson`. Exige publicação da aula, módulo e curso e exclui cursos “em breve”, inclusive quando um administrador usa a superfície de busca do aluno. O banco aplica a política antes do limite de oito resultados.

Antes de devolver título, slug ou descrição de aula, `isUserLessonAccessible(userId, lessonId)` valida a identidade da sessão e o perfil ativo e chama a RPC canônica. Uma identidade fornecida pelo chamador não é aceita como autoridade. Acesso ao curso ou `is_free_preview` isoladamente não autorizam divulgar a aula.

- Visitante anônimo recebe somente cursos publicados; nenhuma consulta de aulas é feita.
- Perfil ativo sem matrícula válida recebe somente aulas permitidas pela política, como prévias publicadas. Um curso pode continuar bloqueado enquanto sua prévia abre.
- Aula, módulo ou curso não publicados, curso em breve e aula com drip pendente ficam ausentes dos resultados do aluno.
- Sessão ausente/divergente, perfil suspenso ou decisão de acesso ausente/inválida/indisponível não liberam aulas.
- Consulta com erro tem seu resultado descartado, inclusive dados parciais.

A busca preserva a sanitização do filtro e não usa cliente privilegiado. A página do player mantém sua própria autorização, independentemente de um resultado de busca anterior.

## Verificação e limites

[queries.server.test.ts](../../features/Search/queries.server.test.ts) e [server.test.ts](../../core/access/server.test.ts) verificam identidade, perfil, filtros de publicação e retenção de metadados quando o acesso é negado. Usam clientes/RPCs controlados; uma resposta negativa simulada de matrícula, expiração ou drip não executa a regra SQL.

[search.test.mjs](../../tests/database/search.test.mjs) verifica o join PostgREST `lessons → modules!inner → courses!inner` com sessões reais no ambiente local: prévias, suspensão, publicação da hierarquia, cursos em breve e RLS/drip antes do limite. Prepare esse ambiente conforme [desenvolvimento local](../development/local-database.md) e use somente dados fictícios.

Alterações em políticas, publicação ou liberação devem ser verificadas com o banco da versão correspondente. Testes da busca não substituem a autorização do player ou de downloads.
