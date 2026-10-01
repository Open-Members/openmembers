# Personalização de aparência

Administradores ativos podem personalizar a instalação em **Admin → Branding**. O modelo continua sendo uma instalação e um projeto Supabase dedicado por organização.

## Fontes e botões

O texto-base e os títulos têm seletores independentes. O catálogo oferece `system`, `serif`, `mono`, `inter`, `montserrat` e `lora`. Os três primeiros usam fontes do dispositivo; os demais são fontes variáveis servidas pela própria aplicação, com fallbacks locais e SIL Open Font License 1.1. Os arquivos não fazem pedidos a Google Fonts no navegador. Origem, revisão e hashes estão em [fontes](../../public/fonts/sources.json) e [avisos de terceiros](../../THIRD_PARTY_NOTICES.md).

Em títulos, **Aparência atual** conserva a composição existente; **Herdar fonte do texto-base** acompanha o outro seletor. As fontes locais usam `font-display: swap`: o fallback mantém o texto visível enquanto o arquivo carrega, e a troca pode mudar suas métricas.

Botões de ação marcados com `data-brand-button` aceitam **Quadrado**, **Arredondado** (12 px) e **Pílula**. A opção **Aparência atual** preserva cada componente. A forma não muda cores, ações, foco ou estados. Controles de mídia, seletores de modo e abas mantêm sua geometria funcional; inputs e cartões não recebem esse raio.

## Fundos independentes

Cada superfície tem seu próprio fundo:

| Superfície | Campo | Comportamento sem configuração |
| --- | --- | --- |
| Home pública | `public_home_background` | Fundo do tema |
| Login | `login_background` | Gradiente existente |
| Cadastro | `register_background` | Gradiente existente |

Escolha **Aparência atual**, **Cor sólida** ou **Imagem**. Imagens oferecem alinhamento no centro/topo/base e sobreposição de 0 a 100%. Confira a legibilidade nos temas claro e escuro; uma imagem e uma sobreposição escolhidas pelo administrador não garantem contraste em todas as regiões. Em cor sólida, o texto e os tokens de superfície usam contraste derivado da cor, e a variante do logo acompanha esse fundo, independentemente do tema global.

**Copiar configuração** copia os valores atuais para outra tela. Alterar ou limpar uma delas depois não altera as demais. O hero do dashboard e as páginas de recuperação/troca de senha conservam seus controles próprios.

Título e descrição da home pública podem ser editados no painel. Em branco, usam `public.title`/`public.description` do arquivo de instalação ou as traduções neutras. Textos escritos pelo administrador são exibidos como texto, sem HTML, e não são traduzidos automaticamente.

## Rascunho, upload e publicação

As prévias simulam desktop/mobile e tema claro/escuro usando o rascunho. São ilustrações de aparência, não formulários ativos nem reproduções exatas de cada breakpoint. **Descartar** restaura os valores salvos. Só **Salvar alterações** publica a configuração. Falhas conservam o rascunho para correção e nova tentativa.

Fundos enviados pelo painel aceitam PNG, JPEG e WebP até 5 MiB. O servidor exige um objeto do bucket `platform-assets`, na pasta `branding/backgrounds`, e verifica tamanho, MIME e assinatura antes de persistir a referência. SVG e GIF não são aceitos para fundos. Durante um upload, a troca de fundo, cópia, descarte e salvamento ficam bloqueados. Substituir/remover uma imagem no rascunho não apaga o arquivo publicado; arquivos sem referência exigem limpeza administrativa posterior.

## Banco e atualização

A migration [20261001161405_independent_entry_appearance.sql](../../supabase/migrations/20261001161405_independent_entry_appearance.sql) adiciona sete colunas anuláveis com checks de fonte, forma, texto e JSON. Nenhum valor existente é reescrito. As políticas RLS continuam exigindo administração ativa para ler/escrever diretamente a marca.

Aplique as migrations versionadas pelo fluxo de atualização da instalação antes de disponibilizar os novos controles. Na pilha de desenvolvimento já iniciada, `npm run db:migrate` aplica migrations pendentes sem reset. Consulte [instalação](../deployment/installation.md) para atualização de uma instalação hospedada. Este guia não autoriza nem comprova deploy.

Se o banco ainda não possui as colunas novas, o loader tenta os campos anteriores para conservar a identidade salva. O painel informa a atualização necessária e bloqueia os novos controles; os controles anteriores continuam disponíveis.

## Arquivo e verificação

Os campos de aparência também pertencem a `branding` no arquivo público. Exemplo: `"font_family": "inter"`, `"heading_font_family": "lora"`, `"button_shape": "rounded"` e `"login_background": {"mode":"color","color":"#123456"}`. URLs de imagens do arquivo seguem a política de URLs públicas seguras. O servidor aceita copiar ou ajustar uma imagem cujo URL corresponda exatamente a uma imagem já definida nesse arquivo validado; não faz download externo. Fundos inalterados não são reenviados ao salvar outros campos. Novas imagens escolhidas no painel exigem o upload no Storage da instalação. A precedência é **defaults → arquivo → campos válidos salvos**; `null` salvo restaura o comportamento original do campo.

Os contratos estão nas suites de tema, Storage e Admin Branding; a persistência/RLS em [appearance.test.mjs](../../tests/database/appearance.test.mjs); o fluxo completo em [appearance-database.spec.ts](../../e2e/appearance-database.spec.ts). Use serviços locais isolados e dados fictícios. Resultados locais e CI não comprovam operação em produção.

## Vídeo decorativo dos banners

O vídeo do YouTube configurado no banner do dashboard ou de um curso cobre a área atual do banner com proporção 16:9 e recorte centralizado. O recorte pode retirar conteúdo nas bordas. Altura, textos, sobreposição, ações, imagens e banners sem vídeo conservam a apresentação existente.

A reprodução permanece automática, inline, em loop e sem som. A camada decorativa reforça mute e volume zero e solicita a remoção das legendas nativas quando o player fica pronto ou muda de API/estado. A preferência de legendas do visitante pode prevalecer sobre o parâmetro de URL; `cc_load_policy=0` sozinho não garante a desativação. Legendas gravadas na imagem do vídeo não podem ser removidas. Áudio, legendas, controles e progresso dos players de aulas são independentes.

O controle valida a origem do YouTube e a janela do iframe atual, e remove seus listeners ao desmontar. Autoplay e disponibilidade continuam sujeitos ao navegador e ao provedor. A remoção do módulo `captions` depende do comportamento do player e exige nova verificação quando ele mudar; esse comando não integra a lista pública de funções documentadas do YouTube.

Validação do componente e CSS reais, com conteúdo fictício e sem banco: `npx playwright test --config playwright.banner.config.ts`. Os testes determinísticos também integram `npm run test:e2e` e substituem a mídia remota por uma fixture local 16:9.

Verificação opcional do player real: `OPENMEMBERS_YOUTUBE_INTEGRATION=1 npx playwright test --config playwright.banner.config.ts --grep 'real YouTube'`. O vídeo padrão é a [demonstração pública do Google](https://developers.google.com/youtube/iframe_api_reference), `M7lc1UVf-VE`. Para conferir outra mídia pública, acrescente `OPENMEMBERS_BANNER_VIDEO_ID=ID_DO_VIDEO`. O teste primeiro comprova legendas visíveis em um controle, depois verifica reprodução avançando, silêncio, ausência de faixa/texto de legenda e loop. Guarda observações e traces de falha; resultados locais não comprovam uma instalação em produção.
