export const categories = [
  ["Getting started", "Understand the project and find your first steps."],
  ["Branding & customization", "Make the experience feel like your own."],
  [
    "Installation & operations",
    "Prepare and maintain an independent installation.",
  ],
  [
    "Features & integrations",
    "Understand what is included and what needs setup.",
  ],
  ["Contributing", "Build thoughtfully, with a clear way to verify changes."],
  ["Security", "Read the current reporting policy and its limitations."],
];
export const catalog = [
  {
    slug: "overview",
    title: "Meet Open Members",
    category: categories[0][0],
    lang: "en",
    source: "README.md",
    description:
      "The product, installation model, capabilities, and experimental status.",
    sections: [
      "What is included",
      "Make it yours",
      "Architecture",
      "Optional integrations",
      "Project status and limitations",
      "Security and license",
    ],
    intro:
      "Open Members brings course delivery, member access, progress, and administration into one application. The current model is one application installation and one Supabase project per organization. This guide presents selected sections of the project README.",
  },
  {
    slug: "development",
    title: "Local development",
    category: categories[0][0],
    lang: "en",
    source: "docs/development.md",
    description:
      "Requirements, fictitious demo data, local commands, and verification.",
  },
  {
    slug: "customization",
    title: "Personalizar uma instalação",
    category: categories[1][0],
    lang: "pt-BR",
    source: "docs/customization.md",
    description:
      "Nome, logos, cores, apresentação e precedência das configurações.",
  },
  {
    slug: "installation",
    title: "Instalação independente",
    category: categories[2][0],
    lang: "pt-BR",
    source: "docs/deployment/installation.md",
    description:
      "Percurso de referência em Docker/Linux com Supabase próprio; validação hospedada pendente.",
  },
  {
    slug: "operations",
    title: "Operação e manutenção",
    category: categories[2][0],
    lang: "pt-BR",
    source: "docs/deployment/operations.md",
    description:
      "Saúde, agenda, backups, recuperação e atualização, com limites operacionais.",
  },
  {
    slug: "features",
    title: "Recursos e configuração",
    category: categories[3][0],
    lang: "pt-BR",
    source: "docs/features/overview.md",
    description:
      "Inventário selecionado de recursos, requisitos e verificações ainda necessárias.",
    sections: ["Chat de curso e corpus", "Recursos disponíveis"],
    intro:
      "Recursos, pré-requisitos e limites de configuração. O chat de curso permanece desativado por padrão. Configuração e testes locais não comprovam operação em produção; valide cada recurso no ambiente em que será usado.",
  },
  {
    slug: "integrations",
    title: "Matriz de integrações",
    category: categories[3][0],
    lang: "pt-BR",
    source: "docs/integrations/README.md",
    description:
      "Núcleo obrigatório, provedores opcionais e comportamento sem configuração.",
    sections: ["@intro", "Configuração e isolamento"],
    tableColumns: 3,
    intro:
      "Configurado não significa validado. Este guia apresenta requisitos e comportamento das integrações. Cada provedor exige verificação própria; configuração e testes locais não comprovam operação externa.",
    stripPreamble: true,
  },
  {
    slug: "contributing",
    title: "Contributing to Open Members",
    category: categories[4][0],
    lang: "en",
    source: "CONTRIBUTING.md",
    description:
      "Development setup, contribution guidelines, and verification.",
  },
  {
    slug: "source-verification",
    title: "Verify a source snapshot",
    category: categories[4][0],
    lang: "en",
    source: "docs/source-verification.md",
    description:
      "What the offline source check covers, what it rejects, and its limits.",
  },
  {
    slug: "security",
    title: "Security policy",
    category: categories[5][0],
    lang: "en",
    source: "SECURITY.md",
    description:
      "GitHub Private Vulnerability Reporting: procedure and verification status.",
    sections: ["Supported versions", "Report a suspected vulnerability", "Credential exposure"],
  },
];
