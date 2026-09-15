import { catalog, categories } from "./catalog.mjs";
import { pick } from "./locale.mjs";
const ptCategories = [
  ["Primeiros passos", "Conheça o projeto e encontre por onde começar."],
  ["Marca e personalização", "Dê à experiência a identidade do seu negócio."],
  ["Instalação e operação", "Prepare e mantenha uma instalação independente."],
  [
    "Recursos e integrações",
    "Entenda o que está incluído e o que precisa de configuração.",
  ],
  [
    "Contribuição",
    "Desenvolva com critérios claros para verificar as alterações.",
  ],
  ["Segurança", "Conheça a política de relatos e seus limites atuais."],
];
const entries = {
  overview: [
    [
      "Conheça o Open Members",
      "O produto, o modelo de instalação, os recursos e seu estado experimental.",
    ],
    [
      "Meet Open Members",
      "The product, installation model, capabilities, and experimental status.",
    ],
  ],
  development: [
    [
      "Desenvolvimento local",
      "Requisitos, demonstração fictícia, comandos locais e verificações.",
    ],
    [
      "Local development",
      "Requirements, fictitious demo data, local commands, and verification.",
    ],
  ],
  customization: [
    [
      "Personalizar uma instalação",
      "Nome, logos, cores, apresentação e precedência das configurações.",
    ],
    [
      "Customize an installation",
      "Names, logos, colors, presentation, and configuration precedence.",
    ],
  ],
  installation: [
    [
      "Instalação independente",
      "Percurso de referência em Docker/Linux com Supabase próprio; validação hospedada pendente.",
    ],
    [
      "Independent installation",
      "Docker/Linux reference path with a dedicated Supabase project; hosted validation remains pending.",
    ],
  ],
  operations: [
    [
      "Operação e manutenção",
      "Saúde, agenda, backups, recuperação e atualização, com limites operacionais.",
    ],
    [
      "Operations and maintenance",
      "Health, scheduling, backups, recovery, and updates, with operational limits.",
    ],
  ],
  features: [
    [
      "Recursos e configuração",
      "Inventário selecionado de recursos, requisitos e verificações ainda necessárias.",
    ],
    [
      "Features and configuration",
      "Selected feature inventory, requirements, and remaining verification.",
    ],
  ],
  integrations: [
    [
      "Matriz de integrações",
      "Núcleo obrigatório, provedores opcionais e comportamento sem configuração.",
    ],
    [
      "Integration matrix",
      "Mandatory core, optional providers, and behavior without configuration.",
    ],
  ],
  contributing: [
    [
      "Contribuir com o Open Members",
      "Ambiente de desenvolvimento, orientações para contribuir e verificações.",
    ],
    [
      "Contributing to Open Members",
      "Development setup, contribution guidelines, and verification.",
    ],
  ],
  "source-verification": [
    [
      "Verificar uma revisão do código",
      "O alcance, as recusas e os limites da verificação de código sem acesso à rede.",
    ],
    [
      "Verify a source snapshot",
      "What the offline source check covers, what it rejects, and its limits.",
    ],
  ],
  security: [
    [
      "Política de segurança",
      "GitHub Private Vulnerability Reporting: procedimento de relato e estado da verificação.",
    ],
    [
      "Security policy",
      "GitHub Private Vulnerability Reporting: procedure and verification status.",
    ],
  ],
};
export const categoriesFor = (locale) => pick(locale, ptCategories, categories);
export function catalogFor(locale) {
  return catalog.map((a) => {
    const [title, description] = entries[a.slug][locale === "pt" ? 0 : 1];
    return {
      ...a,
      title,
      description,
      category:
        categoriesFor(locale)[
          categories.findIndex((c) => c[0] === a.category)
        ][0],
      sourceLang: a.lang,
      lang: locale === "pt" ? "pt-BR" : "en",
      locale,
    };
  });
}
