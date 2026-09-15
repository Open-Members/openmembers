import { pick, route } from "./locale.mjs";
export function content(locale) {
  const p = (pt, en) => pick(locale, pt, en);
  const link = (path, text) => `<a href="${route(locale, path)}">${text}</a>`;
  return {
    services: [
      {
        name: p("Hospedagem gerenciada", "Managed hosting"),
        model: p("Mensalidade", "Monthly fee"),
        headline: p(
          "Você cuida do conteúdo.<br>A gente hospeda.",
          "You focus on content.<br>We handle hosting.",
        ),
        description: p(
          "Para quem prefere contar com o Open Members para hospedar a área de membros e quer concentrar seu tempo nos cursos e nos alunos.",
          "For people who want Open Members to host their members area so they can focus their time on courses and learners.",
        ),
        items: p(
          [
            "Sua área de membros com sua marca",
            "Infraestrutura hospedada pelo Open Members",
            "Mensalidade pelo serviço de hospedagem",
          ],
          [
            "Your members area, under your brand",
            "Infrastructure hosted by Open Members",
            "Monthly payment for the hosting service",
          ],
        ),
        note: p(
          "Entrega de vídeos, armazenamento, suporte e condições do serviço serão detalhados antes da abertura.",
          "Video delivery, storage, support, and service terms will be detailed before the offer opens.",
        ),
      },
      {
        name: p("Serviço de implementação", "Implementation service"),
        model: p("Pagamento único", "One-time payment"),
        headline: p(
          "Sua infraestrutura.<br>Sua própria instalação.",
          "Your infrastructure.<br>Your own installation.",
        ),
        description: p(
          "Para quem quer escolher a infraestrutura e contar com nossa ajuda para instalar e configurar uma área de membros própria.",
          "For people who want to choose their infrastructure and have our help installing and configuring their own members area.",
        ),
        items: p(
          [
            "Implementação e configuração inicial",
            "Uma instalação independente por organização",
            "Infraestrutura contratada por você",
          ],
          [
            "Implementation and initial configuration",
            "One independent installation per organization",
            "Infrastructure contracted by you",
          ],
        ),
        note: p(
          "O pagamento único cobre a implantação inicial. Infraestrutura e serviços de terceiros têm custos separados; manutenção e suporte serão definidos no escopo.",
          "The one-time payment covers initial setup. Infrastructure and third-party services have separate costs; maintenance and support will be defined in the scope.",
        ),
      },
    ],
    comparison: [
      [
        p("Onde roda", "Runs on"),
        p(
          "Na infraestrutura gerenciada pelo Open Members.",
          "On infrastructure managed by Open Members.",
        ),
        p(
          "Na infraestrutura que você contrata e fornece.",
          "On infrastructure you contract and provide.",
        ),
      ],
      [
        p("Cobrança", "Billing"),
        p(
          "Mensalidade pelo serviço de hospedagem.",
          "A monthly fee for the hosting service.",
        ),
        p(
          "Pagamento único pela implementação inicial.",
          "A one-time fee for the initial implementation.",
        ),
      ],
      [
        p("Após a entrega", "After setup"),
        p(
          "Operação pela nossa equipe, com escopo e limites a anunciar.",
          "Operation by our team, with scope and limits to be announced.",
        ),
        p(
          "Responsável e rotina de manutenção definidos no escopo. Não há acompanhamento contínuo incluído por padrão.",
          "The operator and maintenance routine are defined in the scope. Ongoing service is not included by default.",
        ),
      ],
      [
        p("Custos extras", "Extra costs"),
        p(
          "Armazenamento, vídeos, suporte e condições serão detalhados antes da contratação.",
          "Storage, video delivery, support, and terms will be detailed before purchase.",
        ),
        p(
          "Infraestrutura e serviços de terceiros são pagos separadamente.",
          "Infrastructure and third-party services are paid separately.",
        ),
      ],
    ],
    faqs: [
      [
        p("O que é o Open Members?", "What is Open Members?"),
        p(
          "Uma área de membros de código aberto para organizar cursos, materiais e acesso ao aprendizado com a sua identidade. Alunos exploram conteúdos, acompanham aulas e consultam seu progresso; administradores gerenciam conteúdo e acesso.",
          "An open-source members area for organizing courses, materials, and learning access under your own identity. Members explore content, follow lessons, and track progress; administrators manage content and access.",
        ),
      ],
      [
        p("Para quem ele foi pensado?", "Who is it for?"),
        p(
          "Criadores, educadores, academias e negócios de conteúdo que querem um espaço próprio para ensinar. O modelo atual usa uma aplicação e um projeto Supabase independentes por organização.",
          "Creators, educators, academies, and content businesses that want a dedicated place to teach. The current model uses one independent application and Supabase project per organization.",
        ),
      ],
      [
        p(
          "Qual a diferença entre as duas ofertas?",
          "How do the two offers differ?",
        ),
        p(
          "Na hospedagem gerenciada, o Open Members hospeda sua área de membros mediante mensalidade. Na implementação, instalamos e configuramos o sistema na infraestrutura fornecida por você, com pagamento único pelo serviço. O escopo e as responsabilidades serão definidos antes da abertura.",
          "With managed hosting, Open Members hosts your members area for a monthly fee. With implementation, we install and configure the system on infrastructure you provide, with a one-time service payment. Scope and responsibilities will be defined before launch.",
        ),
      ],
      [
        p("Já posso contratar?", "Can I purchase a service today?"),
        p(
          "Ainda não. As duas ofertas estão em breve e os preços serão anunciados depois. Não há contratação, assinatura ou teste comercial ativo.",
          "Not yet. Both offers are coming soon, and pricing will be announced later. There is no active purchase, subscription, or commercial trial.",
        ),
      ],
      [
        p("Como serão os preços?", "How will pricing work?"),
        p(
          "Haverá dois modelos distintos: mensalidade para hospedagem e pagamento único para implementação. Os valores ainda não foram definidos. Na instalação independente, infraestrutura e serviços de terceiros têm custos separados.",
          "There will be two distinct models: a monthly hosting fee and a one-time implementation fee. Prices have not been defined yet. For an independent installation, infrastructure and third-party services have separate costs.",
        ),
      ],
      [
        p(
          "Posso usar a identidade da minha marca?",
          "Can I use my own brand identity?",
        ),
        p(
          "Sim. Nome, logos, cores, imagens e apresentação são configuráveis por instalação. Veja as opções e a precedência das configurações no ",
          "Yes. Names, logos, colors, images, and presentation are configurable per installation. See the options and configuration precedence in the ",
        ) +
          link(
            "/help/customization/",
            p("guia de personalização", "customization guide"),
          ) +
          ".",
      ],
      [
        p(
          "O site e a área de membros têm quais idiomas?",
          "Which languages do the site and members area support?",
        ),
        p(
          "Este site e seus dez guias têm versões em português e inglês. No site publicado, a entrada automática usa o país informado pela hospedagem: português no Brasil e inglês nos demais países. Se o país não estiver disponível, usa o idioma do navegador; o seletor PT/EN guarda sua preferência. Na aplicação, a interface oferece inglês, português brasileiro e espanhol pelo perfil. Conteúdos dos cursos e textos personalizados mantêm o idioma do autor; a verificação completa dos fluxos da aplicação nos três idiomas permanece pendente.",
          "This site and its ten guides have Portuguese and English versions. On the published site, automatic entry uses the country provided by the host: Portuguese in Brazil and English elsewhere. When the country is unavailable, it uses the browser language; the PT/EN selector remembers your preference. The application interface offers English, Brazilian Portuguese, and Spanish through the profile. Course content and custom text keep the author’s language; complete verification of application flows across all three languages remains pending.",
        ),
      ],
      [
        p(
          "O Open Members hospeda os vídeos?",
          "Does Open Members host videos?",
        ),
        p(
          "A aplicação atual permite incorporar vídeos do YouTube e Vimeo, conforme as políticas de acesso e incorporação de cada vídeo. Isso não inclui hospedagem ou transcodificação própria. A entrega de vídeos no futuro serviço gerenciado ainda será definida.",
          "The current application supports YouTube and Vimeo embeds, subject to each video’s access and embed policies. This does not include native video hosting or transcoding. Video delivery for the future managed service is still to be defined.",
        ),
      ],
      [
        p(
          "O que significa código aberto aqui?",
          "What does open source mean here?",
        ),
        p(
          "O código está sob a licença MIT: você pode usar, modificar e comercializar cópias, mantendo os avisos de copyright e licença exigidos. Não há obrigação de publicar suas modificações. Dependências mantêm suas próprias licenças. O projeto é experimental, com verificações integradas e operacionais pendentes. Consulte o ",
          "The source is under the MIT license: you can use, modify, and sell copies while retaining the required copyright and license notices. You are not required to publish your changes. Dependencies retain their own licenses. The project is experimental, with integrated and operational checks pending. Read the ",
        ) +
          link("/help/overview/", p("guia do produto", "product guide")) +
          ".",
      ],
      [
        p(
          "Se o código é gratuito, por que contratar?",
          "If the code is free, why pay for a service?",
        ),
        p(
          "Você paga pelo trabalho de hospedar ou implementar o produto. Instalar por conta própria exige conhecimento técnico, infraestrutura e uma rotina de operação. As duas ofertas são opções de serviço; a licença MIT não exige a contratação. Os dois serviços estão em breve.",
          "You pay for the work of hosting or implementing the product. Installing it yourself requires technical knowledge, infrastructure, and ongoing operation. Both offers are optional services; the MIT license does not require a purchase. Both services are coming soon.",
        ),
      ],
      [
        p(
          "Posso instalar e operar por conta própria?",
          "Can I install and operate it myself?",
        ),
        p(
          "Esse é o caminho independente previsto pelo projeto. Você ou uma equipe escolhida por você assume instalação, infraestrutura, atualizações, backups e operação. A licença do código não tem custo; os provedores que você usar podem cobrar. Veja o ",
          "That is the independent path planned for the project. You or a team you choose takes responsibility for installation, infrastructure, updates, backups, and operation. The source license has no fee; providers you use may charge. Read the ",
        ) +
          link(
            "/help/installation/",
            p("guia de instalação", "installation guide"),
          ) +
          ".",
      ],
      [
        p(
          "O pagamento único inclui manutenção contínua?",
          "Does the one-time payment include ongoing maintenance?",
        ),
        p(
          "O pagamento único é pelo serviço de implementação inicial. Manutenção, atualizações, suporte e quem cuida da instalação após a entrega precisam ser definidos no escopo antes da contratação. Infraestrutura e outros serviços recorrentes são custos separados.",
          "The one-time payment is for the initial implementation service. Maintenance, updates, support, and responsibility after handover must be defined in the scope before purchase. Infrastructure and other recurring services are separate costs.",
        ),
      ],
      [
        p("Onde encontro documentação?", "Where can I find documentation?"),
        p("Na ", "The ") +
          link("/help/", p("Central de ajuda", "Help Center")) +
          p(
            ", com dez guias traduzidos sobre desenvolvimento, personalização, instalação, operação, integrações, contribuição e segurança. As traduções são vinculadas à revisão das fontes. A central oferece documentação; não representa suporte humano ao vivo.",
            " contains ten translated guides covering development, customization, installation, operations, integrations, contribution, and security. Translations are tied to their source revision. The center provides documentation; it does not offer live human support.",
          ),
      ],
    ],
  };
}
