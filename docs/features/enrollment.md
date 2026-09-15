# Matrícula manual e convite administrativo

Administradores ativos podem conceder acesso e convidar alunos. A instalação precisa de todas as migrations versionadas; consulte o [guia de instalação](../deployment/installation.md).

## Matrícula e turmas

As ações administrativas usam `apply_manual_enrollment`: matrícula e atribuições de turmas pertencem à mesma transação PostgreSQL. A função distingue matrícula nova/existente, serializa concessões pelo par aluno/pacote e preserva a data original de uma matrícula existente. Pagamentos usam os mesmos mecanismos de bloqueio para coordenar alterações concorrentes; não há fallback para escritas separadas se a função falhar.

Atribuições omitidas preservam turmas. O editor substitui explicitamente sua lista — uma lista vazia remove todas — e o convite mescla a turma escolhida. Relação turma/curso/pacote inválida ou curso repetido rejeita a operação inteira. A exclusão concorrente de uma turma não pode descartar silenciosamente uma atribuição validada: a integridade do banco impede a gravação parcial.

A função é `SECURITY DEFINER`, com `search_path=''` e `EXECUTE` somente para `service_role`. As ações verificam administrador ativo antes de usar o cliente privilegiado. Não exponha a service role no navegador.

Uma concessão manual explícita reativa a matrícula, limpa motivo/data de revogação e produto externo anterior, e preserva `enrolled_at`, progresso e datas de atividade/conclusão. Reexecutar um evento de pagamento concluído não deve sobrescrever uma edição manual posterior; veja [pagamentos](../integrations/payments.md).

## Convites e primeiro acesso

Convites para novas contas com senha temporária exigem a gravação de `must_change_password=true` antes da concessão ou do envio de credenciais. Falha ao buscar a conta, perfil ausente ou erro de gravação interrompem o fluxo. Contas existentes preservam credenciais e a flag de troca de senha.

No login, o perfil da identidade autenticada determina o destino: suspensão, troca obrigatória de senha ou dashboard. `invited` só é verdadeiro quando o transporte retorna sucesso; a falha de e-mail não repete a concessão nem reabre recibos de pagamento. Aceitação pelo transporte não comprova entrega à caixa de entrada.

Auth, atualização de perfil e e-mail ficam fora da transação de matrícula. Se a conta for criada e uma etapa posterior falhar, ela pode permanecer sem matrícula ou e-mail. Corrija a configuração e conceda acesso novamente; recuperação de senha ou reenvio administrativo pode ser necessário. Não apague a conta automaticamente. Não há garantia de convite exatamente uma vez: `invited=false` significa envio não confirmado, mesmo quando a matrícula foi concedida.

## Verificação

Os contratos em [manual-enrollment.test.mjs](../../tests/database/manual-enrollment.test.mjs) cobrem modos de turma, concorrência, rejeição integral, rollback e permissões. [enrollment-concurrency.test.mjs](../../tests/database/enrollment-concurrency.test.mjs) verifica interações entre matrícula manual e pagamentos no PostgreSQL local. O fluxo de convite no navegador está em [enrollment-database.spec.ts](../../e2e/enrollment-database.spec.ts).

Use dados fictícios no [ambiente local](../development/local-database.md). Esses testes não certificam entrega externa nem recuperação automática entre Auth, matrícula e envio. Alterações concorrentes no catálogo também exigem cuidado: não há snapshot imutável da configuração desde a recepção de um webhook.
