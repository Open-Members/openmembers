# Arquivos e vídeo

Cada instalação usa seus próprios buckets e conteúdo. O núcleo de anexos usa Supabase Storage; R2 é uma opção para vídeo e trailer.

## Supabase Storage

As migrations versionadas criam `lesson-materials` privado (25 MiB), `platform-assets` público e `avatars` público. Os materiais devem ser vinculados a uma aula e acessados pelo handler `/api/attachments/{id}`, que usa a sessão e o mesmo controle de publicação, matrícula, expiração e drip da aula. Arquivos públicos de marca não são local para conteúdo restrito.

Anexos PDF são baixados no servidor e recebem marca d'água com a identidade autenticada; outros formatos recebem redirecionamento para URL assinada por cinco minutos. Respostas usam `private, no-store`. A marca d'água não impede redistribuição. Revogar acesso impede novas URLs; uma URL já emitida continua válida até expirar.

O upload exige administrador ativo, UUID da aula/rascunho, nome sem separadores de caminho, MIME permitido e tamanho inteiro positivo de até 25 MiB. O bucket também define limite de arquivo. Paths usam identificador aleatório. A finalização exige path da própria aula e conserva os bytes em falha de gravação para permitir retry; a remoção de bytes exige confirmação da remoção do registro. Uploads abandonados podem deixar órfãos. A limpeza requer levantamento de referências e revisão explícita; nenhum job desta versão remove esses objetos automaticamente.

## R2 opcional

Preencher `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_BUCKET_NAME` com uma conta e bucket de teste próprios. O bucket deve permanecer privado. Valores vazios ou só com espaços não habilitam upload; a UI informa indisponibilidade, e as APIs retornam 503 sem iniciar o cliente. Nunca expor chaves por variável `NEXT_PUBLIC_*`.

Para upload direto, configurar CORS com a origem exata da aplicação. Exemplo fictício:

```json
[
  {
    "AllowedOrigins": ["https://members.example.test"],
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["Content-Type", "Range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range"],
    "MaxAgeSeconds": 3600
  }
]
```

O endpoint S3 da conta recebe a requisição assinada; o navegador deve enviar `Content-Type` igual ao assinado. CORS precisa permitir os cabeçalhos usados pelo cliente. Consultar [URLs assinadas](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) e [CORS do R2](https://developers.cloudflare.com/r2/buckets/cors/) para aplicar a política no bucket da instalação.

| Operação | Autorização e contrato | Validade |
| --- | --- | --- |
| `POST /api/r2/upload-url` | Admin ativo; scope `lesson` ou `course-trailer`, UUID, filename, MIME de vídeo e tamanho declarado inteiro positivo até 2 GiB. O alias `lessonId` ainda funciona para aula. | PUT: 1 hora |
| `GET /api/r2/playback-url?lessonId=UUID` | Sessão com acesso à aula antes da consulta privilegiada e assinatura; preserva chaves antigas | GET: 6 horas |
| Trailer de catálogo | Conteúdo promocional; a consulta de catálogo pode assinar o trailer sem exigir matrícula no curso | GET: 6 horas |

Chaves novas usam `lessons/{uuid}/{random-uuid}.ext` ou `courses/{uuid}/trailer/{random-uuid}.ext`. Drafts podem fazer upload antes de existir registro. O tamanho de 2 GiB é limite de UI/payload declarado, **não quota comprovada sobre os bytes recebidos pelo R2**: o PUT atual não assina `Content-Length` nem faz conferência posterior por HEAD. O teste real deve incluir tamanho e tipo divergentes; impor quota de bytes exige extensão desse contrato antes de anunciá-la.

A configuração permite emitir URLs, mas não prova existência, CORS, permissões ou conectividade do bucket. Um link assinado funciona como credencial temporária; revogação de matrícula não cancela os links de seis horas já emitidos. O player não renova automaticamente uma URL vencida; reabrir a aula pede uma nova. Conteúdo removido/substituído é limpo após confirmação da alteração no banco; falha da limpeza fica para revisão operacional.

## Verificação da instalação

O teste [storage-database.spec.ts](../../e2e/storage-database.spec.ts) cobre upload, finalização, download, negação de acesso e remoção de PDF/TXT no Supabase local. Testes de contratos controlados e formatos específicos não certificam todos os arquivos ou serviços externos.

Para usar R2:

1. Configure um bucket privado de teste e a origem da aplicação no CORS. Envie um vídeo fictício e confira reprodução, range e seek em desktop e mobile.
2. Confira upload negado a aluno/administrador suspenso e nova URL de aula privada negada a usuário sem acesso, expirado ou com drip fechado. Confira publicação de aula, módulo e curso.
3. Teste troca/descarte, falha de gravação e limpeza posterior. O vídeo ativo deve permanecer disponível até salvar a alteração.
4. Teste MIME/tamanho divergentes e URL vencida. Considere a janela de acesso dos links emitidos antes de revogar uma matrícula.

Validar a assinatura gerada pelo SDK não comprova existência, acesso ou reprodução do objeto no bucket. Confira também os limites do proxy e da hospedagem; eles são independentes dos limites declarados pela aplicação.
