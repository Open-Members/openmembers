# Personalizar uma instalação

O Open Members usa uma instalação independente por organização. Sua apresentação pode ser configurada sem editar componentes da aplicação. Esta configuração não cria organizações num banco compartilhado nem provisiona serviços externos.

## Configuração pública

Copie o exemplo na raiz do projeto:

```sh
cp openmembers.config.example.json openmembers.config.json
```

O arquivo local é ignorado pelo Git. Ele contém somente informações públicas. Para usar outro caminho, configure `OPENMEMBERS_CONFIG_FILE` com um caminho absoluto ou relativo ao diretório de execução do servidor. Um caminho explícito ausente, JSON inválido, campo desconhecido ou valor inválido produz um erro de configuração; os valores do arquivo não são copiados para a mensagem de erro.

Sem arquivo e sem caminho explícito, a aplicação usa defaults neutros. O loader não consulta URLs remotas e o arquivo não aceita credenciais. Não use esse arquivo para configurar Auth, banco, pagamentos, e-mail ou deploy: essas configurações continuam nas variáveis próprias.

Exemplo de identidade fictícia:

```json
{
  "branding": {
    "site_name": "Jardim Academy",
    "logo_light_url": "/branding-example.svg",
    "logo_dark_url": "/branding-example.svg",
    "favicon_url": "/branding-example.svg",
    "primary_color": "#0f766e",
    "accent_color": "#b45309",
    "font_family": "serif"
  },
  "public": {
    "title": "Conhecimento que floresce",
    "description": "Cursos para aprender no seu ritmo."
  },
  "metadata": {
    "description": "Aprenda com a Jardim Academy.",
    "shortName": "Jardim"
  },
  "links": {
    "support": "mailto:support@jardim.example.test",
    "terms": "https://policies.example.test/terms",
    "privacy": "https://policies.example.test/privacy",
    "community": "https://community.example.test/"
  }
}
```

Os domínios `.example.test` são demonstrativos. Substitua-os pelos destinos da organização antes de usar a instalação. O desenho de exemplo fica em `public/branding-example.svg`; ele é um asset genérico do projeto. Consulte o [guia da marca](brand/README.md) para os assets e sua procedência.

## Campos e precedência

| Grupo | O que configura |
| --- | --- |
| `branding` | Nome, logos, favicon, imagem social, cores, fonte, hero do dashboard e indicador de carregamento |
| `public` | Título e descrição da entrada pública; `null` usa as traduções neutras existentes |
| `metadata` | Descrição para navegador/compartilhamento e nome curto do manifesto. `description: null` usa o texto padrão no idioma da conta/visitante; uma string personalizada é preservada em todos os idiomas |
| `links` | Suporte, ajuda, comunidade, termos e privacidade; `null` mantém o fallback declarado ou omite o link |

A ordem para os campos de marca é **defaults → arquivo → campos válidos salvos em `tenant_settings`**. A configuração administrativa existente tem prioridade, inclusive `null` em campos anuláveis; isso permite limpar um logo salvo. Valores malformados no banco não são usados e colunas desconhecidas não são propagadas pelo loader.

Para uma instalação com banco, o painel **Admin → Branding** continua sendo o editor de nome, logos, cores, fonte, hero e indicador de carregamento. Textos de entrada, descrição/nome curto e destinos públicos são definidos no arquivo. O arquivo não sobrescreve automaticamente uma marca já salva no painel.

As fontes disponíveis são `system`, `serif` e `mono`, compostas por fontes do sistema. Nenhuma fonte externa é baixada. O seletor afeta o texto-base; estilos de títulos podem manter sua composição própria quando indicada pelo componente. Cores aceitam seis dígitos hexadecimais; variantes de hover e escalas são derivadas, e a cor de texto dos principais controles é escolhida pelo contraste.

Use URLs HTTPS ou caminhos locais iniciados por uma única `/`. HTTP é permitido somente em loopback para o desenvolvimento local. Links `support`/`help` também aceitam `mailto:` simples ou telefone `tel:`; não inclua parâmetros de envio. Links protocol-relative, esquemas executáveis, barras invertidas, credenciais na URL e caminhos ambíguos são recusados. O mesmo tratamento protege links personalizados no menu. URLs inválidas já armazenadas no menu são omitidas ao apresentar a navegação.

Logos/favicons/imagem social podem usar caminhos de assets próprios ou URLs públicas seguras. Prefira assets hospedados pela instalação. Substituir ou remover uma imagem no formulário não apaga o asset ativo antes de salvar; arquivos substituídos podem exigir limpeza administrativa posterior.

## Superfícies e estados

- Nome, logos e cores resolvidos aparecem na entrada, navegação, autenticação, footer e estado de setup. O manifesto usa nome, ícone e cor da mesma configuração.
- Termos e privacidade apontam para as políticas configuradas. Sem política configurada, a página interna declara essa ausência; não inventa termos da organização.
- O suporte usa o destino público configurado quando disponível. Sem destino, o footer oferece o suporte interno. A página de suspensão não exibe um endereço fictício nem encaminha para uma área que exige conta ativa.
- A página de confirmação não considera uma compra aprovada apenas por ter sido aberta, nem promete entrega de e-mail sem evidência.
- Um curso sem checkout válido encaminha para o suporte interno. A ausência de oferta não implica venda disponível. A biblioteca informa que materiais seguem as regras de acesso/liberação.
- O chat de curso exige opt-in `COURSE_CHAT_ENABLED=true` e suas configurações obrigatórias; sem isso não é montado. A presença de chaves não comprova que IA ou outros provedores estejam operacionais. Consulte [requisitos e limites do chat](features/overview.md).

O arquivo aplica os mesmos textos personalizados aos idiomas disponíveis. Quando esses campos são `null`, usam-se os defaults traduzidos existentes. Textos personalizados não são traduzidos automaticamente.

## E-mails

Os dez templates transacionais usam o nome, logo e cor resolvidos, com contraste dos botões e validação de links. No onboarding, `links.community` e `links.help`/`links.support` têm prioridade sobre os fallbacks legados `MEMBERSHIP_COMMUNITY_URL` e `MEMBERSHIP_HELP_URL`, também validados.

Remetente e provedor permanecem independentes da marca. A renderização de templates e a captura local no Mailpit não comprovam entrega externa. O template padrão do Supabase local/Mailpit continua pertencendo ao serviço Auth: personalizar esses e-mails exige configurar e validar o hook/template do provedor, conforme a [matriz de integrações](integrations/README.md).

## Executar e verificar

```sh
npm run dev
```

Sem Supabase, isso permite verificar entrada, políticas, identidade e setup. Com a pilha local disponível, use `npm run dev:local` e valide também o painel e a navegação autenticada. Verifique upload, salvamento, substituição/descarte de imagens e leitura pelo aluno nos temas claro/escuro, em desktop e mobile.

Para testar o mesmo build com a identidade padrão e a fictícia:

```sh
npm run build
npm run verify:artifact
npm run test:e2e
npm run test:e2e:branding
```

As suites usam `localhost:3100` e `localhost:3102`, respectivamente, e apontam para fixtures próprias. Nenhum arquivo de configuração pessoal é alterado pelos testes. As capturas geradas ficam em `test-results`, ignorado pelo Git.

Em deploys com `output: standalone`, disponibilize o arquivo no diretório de execução ou monte-o e indique o caminho absoluto. O arquivo local ignorado não é automaticamente incluído no container. O [guia de instalação](deployment/installation.md) usa `/etc/openmembers/installation.json` no host, montado somente leitura em `/app/config/installation.json`, com `OPENMEMBERS_CONFIG_FILE` configurado pelo Compose. Reinicie o processo após mudar sua configuração de implantação e valide metadata, manifesto e páginas. O empacotamento local não substitui a validação da instalação hospedada.
