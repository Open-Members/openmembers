## Versões com suporte

O Open Members é um software experimental. Não há lançamento estável nem linha de versões com suporte de segurança estabelecida. O valor `0.1.0` em `package.json` é um metadado de desenvolvimento. Leia as [limitações conhecidas](docs/known-limitations.md) para conhecer os limites de validação e operação. Esta política não estabelece compromisso de prazo de resposta, prazo de divulgação nem acordo de suporte.

## Relatar uma possível vulnerabilidade

Não publique detalhes de vulnerabilidades, instruções de exploração, credenciais, dados pessoais ou registros de autenticação em uma issue, pull request ou discussão pública.

**O GitHub Private Vulnerability Reporting não está disponível atualmente como um canal de relato verificado.** Para conferir sua disponibilidade, abra **Security → Advisories** no [repositório do Open Members](https://github.com/Open-Members/openmembers/security/advisories) e procure **Report a vulnerability**. Use esse formulário privado somente quando o GitHub o oferecer para este repositório. A ausência do botão ou uma página indisponível significa que o formulário não pode ser usado; uma issue pública não é alternativa para detalhes sensíveis.

Se o formulário privado estiver indisponível, use um contato privado estabelecido com o mantenedor para solicitar uma alternativa segura. Confirme o destinatário e o canal antes de compartilhar material sensível. Se não houver esse contato, solicite um canal privado sem incluir detalhes da vulnerabilidade. Nenhum endereço de e-mail de segurança foi designado para o projeto.

Um relato privado útil inclui:

- O commit ou versão afetada, o componente e a configuração relevante, com os segredos removidos.
- Etapas de reprodução com contas fictícias e uma instalação sob seu controle.
- Comportamento esperado e observado, impacto e um exemplo mínimo sem dados sensíveis.
- Medidas de mitigação já testadas e se a investigação continua.

Teste somente instalações e serviços que você está autorizado a avaliar. Não inclua registros de usuários reais nem segredos ativos para demonstrar o impacto. Relatos sobre a implantação privada de um operador também exigem coordenação com ele; este projeto não fornece acesso a essas instalações nem as gerencia.

## Exposição de credenciais

Se uma credencial foi exposta, revogue-a ou troque-a no provedor e examine seu uso. Remover um valor em um commit posterior não o invalida nem remove cópias do histórico Git. Mantenha valores afetados, registros de autenticação e evidências privadas fora de relatos públicos.
