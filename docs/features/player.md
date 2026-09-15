# Vídeo, progresso e retomada

O player incorpora referências YouTube e Vimeo configuradas pelo administrador; a reprodução depende das permissões e da política de embed do vídeo. Vídeos R2 usam o componente dedicado e a configuração descrita em [armazenamento](../integrations/storage.md).

## Eventos do player

Para YouTube/Vimeo, a origem de uma mensagem deve corresponder exatamente ao provedor do iframe ativo: `https://www.youtube.com` ou `https://player.vimeo.com`. `event.source` deve ser o `contentWindow` desse iframe. As inscrições por `postMessage` usam a origem específica, e a desmontagem remove o listener anterior.

O player repassa posições numéricas finitas e não negativas. Duração ausente ou inválida vira zero enquanto os metadados não estão disponíveis. Os eventos usam os callbacks atuais; o offset inicial de retomada permanece estável durante novas renderizações. URLs preservam o hash privado do Vimeo e autoplay mudo.

A aplicação usa os callbacks para salvar posição, concluir a aula e avançar para a próxima. Esses controles limitam os emissores aceitos, mas progresso enviado pelo navegador não é comprovação de presença nem mecanismo antifraude.

## Verificação e limites

[VideoPlayer.test.tsx](../../features/Courses/components/VideoPlayer.test.tsx) cobre eventos legítimos e forjados, origens/remetentes, payloads inválidos, callbacks, troca de provedor, limpeza, retomada e delegação ao R2 com dependências controladas.

[youtube.integration.spec.ts](../../e2e/youtube.integration.spec.ts) é um teste opt-in de reprodução, seek, retomada e conclusão persistida, separado da CI comum. Ele acessa o provedor externo; execute-o somente com vídeo autorizado e dados de teste. Consulte [desenvolvimento](../development.md) para preparar o ambiente e as verificações.

Uma validação YouTube não certifica Vimeo ou R2. Valide também o provedor e as restrições de domínio/conteúdo da instalação em desktop e mobile. Eventos simulados não comprovam reprodução externa, e a delegação testada ao componente R2 não comprova conectividade ou acesso ao bucket.
