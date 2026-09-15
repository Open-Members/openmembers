import { defaultLocale, isLocale, type Locale } from '@/core/i18n/config';
import { substituteVars } from './substitute';
import type { AdminInviteContent } from './admin-invite';
import type { EmailChangeContent } from './email-change';
import type { EmailConfirmationContent } from './email-confirmation';
import type { ExpirationWarningContent } from './expiration-warning';
import type { MagicLinkLoginContent } from './magic-link-login';
import type { MembershipWelcomeContent } from './membership-welcome';
import type { PasswordRecoveryContent } from './password-recovery';
import type { PurchaseConfirmedContent } from './purchase-confirmed';
import type { WelcomeMigrationContent } from './welcome-migration';
import type { WelcomeWithPasswordContent } from './welcome-with-password';

type Localized<T> = Record<Locale, T>;

export interface EmailRenderContext {
  locale?: Locale;
  now?: Date;
}

export interface ReauthenticationContent {
  subject: string;
  heading: string;
  intro: string;
  ignoreNote: string;
}

export interface SupportNewTicketContent {
  subjectPrefix: string;
  heading: string;
  fromLabel: string;
  subjectLabel: string;
  ticketIdLabel: string;
  openedText: string;
  unknownUser: string;
}

export interface EmailFrameContent {
  rightsReserved: string;
  unsubscribe: string;
  unsubscribeSuffix: string;
  emailLabel: string;
  temporaryPasswordLabel: string;
  accessLabel: string;
  firstNameFallback: string;
  courseFallback: string;
  newCourseFallback: string;
  testSubjectPrefix: string;
  sampleStudentName: string;
  sampleCourseTitle: string;
  previews: {
    welcomeWithPassword: string;
    purchaseConfirmed: string;
    membershipWelcome: string;
    expirationWarning: string;
    welcomeMigration: string;
    passwordRecovery: string;
    magicLinkLogin: string;
    emailConfirmation: string;
    adminInvite: string;
    emailChange: string;
  };
}

export const EMAIL_FRAME_CONTENT: Localized<EmailFrameContent> = {
  en: {
    rightsReserved: 'All rights reserved.',
    unsubscribe: 'Unsubscribe',
    unsubscribeSuffix: 'from these emails.',
    emailLabel: 'Email',
    temporaryPasswordLabel: 'Temporary password',
    accessLabel: 'Your access',
    firstNameFallback: 'there',
    courseFallback: 'your course',
    newCourseFallback: 'your new course',
    testSubjectPrefix: '[TEST]',
    sampleStudentName: 'Test Student',
    sampleCourseTitle: 'Sample Course',
    previews: {
      welcomeWithPassword: 'Your {{siteName}} account is ready',
      purchaseConfirmed: 'You now have access to {{courseTitle}}',
      membershipWelcome: 'Your {{siteName}} access details',
      expirationWarning: 'Your access to {{courseTitle}} is about to expire',
      welcomeMigration: 'Your {{siteName}} area moved — log in here',
      passwordRecovery: 'Reset your {{siteName}} password',
      magicLinkLogin: 'Sign in to {{siteName}}',
      emailConfirmation: 'Confirm your email for {{siteName}}',
      adminInvite: "You've been invited to {{siteName}}",
      emailChange: 'Confirm your new email for {{siteName}}',
    },
  },
  pt: {
    rightsReserved: 'Todos os direitos reservados.',
    unsubscribe: 'Cancelar inscrição',
    unsubscribeSuffix: 'destes e-mails.',
    emailLabel: 'E-mail',
    temporaryPasswordLabel: 'Senha temporária',
    accessLabel: 'Seus acessos',
    firstNameFallback: 'você',
    courseFallback: 'seu curso',
    newCourseFallback: 'seu novo curso',
    testSubjectPrefix: '[TESTE]',
    sampleStudentName: 'Pessoa de Teste',
    sampleCourseTitle: 'Curso de Exemplo',
    previews: {
      welcomeWithPassword: 'Sua conta na {{siteName}} está pronta',
      purchaseConfirmed: 'Você agora tem acesso a {{courseTitle}}',
      membershipWelcome: 'Seus dados de acesso à {{siteName}}',
      expirationWarning: 'Seu acesso a {{courseTitle}} está perto de expirar',
      welcomeMigration: 'Sua área na {{siteName}} mudou — acesse por aqui',
      passwordRecovery: 'Redefina sua senha da {{siteName}}',
      magicLinkLogin: 'Entre na {{siteName}}',
      emailConfirmation: 'Confirme seu e-mail na {{siteName}}',
      adminInvite: 'Você recebeu um convite para a {{siteName}}',
      emailChange: 'Confirme seu novo e-mail na {{siteName}}',
    },
  },
  es: {
    rightsReserved: 'Todos los derechos reservados.',
    unsubscribe: 'Cancelar suscripción',
    unsubscribeSuffix: 'a estos correos.',
    emailLabel: 'Correo electrónico',
    temporaryPasswordLabel: 'Contraseña temporal',
    accessLabel: 'Tus accesos',
    firstNameFallback: 'tú',
    courseFallback: 'tu curso',
    newCourseFallback: 'tu nuevo curso',
    testSubjectPrefix: '[PRUEBA]',
    sampleStudentName: 'Persona de Prueba',
    sampleCourseTitle: 'Curso de Ejemplo',
    previews: {
      welcomeWithPassword: 'Tu cuenta en {{siteName}} está lista',
      purchaseConfirmed: 'Ahora tienes acceso a {{courseTitle}}',
      membershipWelcome: 'Tus datos de acceso a {{siteName}}',
      expirationWarning: 'Tu acceso a {{courseTitle}} está por vencer',
      welcomeMigration: 'Tu área en {{siteName}} cambió — entra aquí',
      passwordRecovery: 'Restablece tu contraseña de {{siteName}}',
      magicLinkLogin: 'Entra en {{siteName}}',
      emailConfirmation: 'Confirma tu correo en {{siteName}}',
      adminInvite: 'Recibiste una invitación para {{siteName}}',
      emailChange: 'Confirma tu nuevo correo en {{siteName}}',
    },
  },
};

export const EMAIL_TEMPLATE_DEFAULTS = {
  welcome_with_password: {
    en: {
      subject: 'Welcome to {{siteName}} — your account is ready',
      heading: 'Welcome, {{firstName}}!',
      intro: 'Your purchase is confirmed and your account is ready. You now have access to {{courseTitle}}.',
      credentialsIntro: "Click the button below to log in. You'll be asked to set your own password right after.",
      ctaLabel: 'Log in and start learning',
      fallbackLinkNote: "If the button doesn't work, copy this link into your browser:",
    },
    pt: {
      subject: 'Boas-vindas à {{siteName}} — sua conta está pronta',
      heading: 'Boas-vindas, {{firstName}}!',
      intro: 'Sua compra foi confirmada e sua conta está pronta. Você já tem acesso a {{courseTitle}}.',
      credentialsIntro: 'Clique no botão abaixo para entrar. Em seguida, você poderá definir sua própria senha.',
      ctaLabel: 'Entrar e começar a aprender',
      fallbackLinkNote: 'Se o botão não funcionar, copie este link no navegador:',
    },
    es: {
      subject: 'Te damos la bienvenida a {{siteName}} — tu cuenta está lista',
      heading: '¡Te damos la bienvenida, {{firstName}}!',
      intro: 'Tu compra está confirmada y tu cuenta está lista. Ya tienes acceso a {{courseTitle}}.',
      credentialsIntro: 'Haz clic en el botón para entrar. A continuación podrás definir tu propia contraseña.',
      ctaLabel: 'Entrar y comenzar a aprender',
      fallbackLinkNote: 'Si el botón no funciona, copia este enlace en tu navegador:',
    },
  } satisfies Localized<WelcomeWithPasswordContent>,
  welcome_migration: {
    en: {
      subject: 'Your {{siteName}} area has moved — here is your new login',
      heading: 'Hi {{firstName}} — your area has a new home',
      intro: "We've moved your {{siteName}} learning area to a brand-new platform. Everything you bought has been transferred — nothing was lost.",
      credentialsIntro: "Click the button to log in. You'll be able to change this password from your profile once you're inside.",
      ctaLabel: 'Log in to your new area',
      fallbackLinkNote: "If the button doesn't work, copy this link into your browser:",
    },
    pt: {
      subject: 'Sua área na {{siteName}} mudou — aqui está seu novo acesso',
      heading: 'Olá, {{firstName}} — sua área está de casa nova',
      intro: 'Transferimos sua área de aprendizagem da {{siteName}} para uma nova plataforma. Todas as suas compras foram transferidas.',
      credentialsIntro: 'Clique no botão para entrar. Depois, você poderá alterar esta senha no seu perfil.',
      ctaLabel: 'Entrar na nova área',
      fallbackLinkNote: 'Se o botão não funcionar, copie este link no navegador:',
    },
    es: {
      subject: 'Tu área en {{siteName}} cambió — aquí tienes tu nuevo acceso',
      heading: 'Hola, {{firstName}} — tu área tiene un nuevo hogar',
      intro: 'Trasladamos tu área de aprendizaje de {{siteName}} a una nueva plataforma. Todas tus compras fueron transferidas.',
      credentialsIntro: 'Haz clic en el botón para entrar. Después podrás cambiar esta contraseña en tu perfil.',
      ctaLabel: 'Entrar en la nueva área',
      fallbackLinkNote: 'Si el botón no funciona, copia este enlace en tu navegador:',
    },
  } satisfies Localized<WelcomeMigrationContent>,
  purchase_confirmed: {
    en: {
      subject: '{{courseTitle}} is unlocked on your account',
      heading: "You're in, {{firstName}}.",
      body: 'Your purchase is confirmed and {{courseTitle}} is now unlocked on your account.',
      ctaLabel: 'Start watching',
      fallbackLinkNote: 'Having trouble? Open this link in your browser:',
    },
    pt: {
      subject: '{{courseTitle}} está liberado na sua conta',
      heading: 'Seu acesso está pronto, {{firstName}}.',
      body: 'Sua compra foi confirmada e {{courseTitle}} já está liberado na sua conta.',
      ctaLabel: 'Começar a assistir',
      fallbackLinkNote: 'Está com dificuldade? Abra este link no navegador:',
    },
    es: {
      subject: '{{courseTitle}} está disponible en tu cuenta',
      heading: 'Tu acceso está listo, {{firstName}}.',
      body: 'Tu compra está confirmada y {{courseTitle}} ya está disponible en tu cuenta.',
      ctaLabel: 'Comenzar a ver',
      fallbackLinkNote: '¿Tienes problemas? Abre este enlace en tu navegador:',
    },
  } satisfies Localized<PurchaseConfirmedContent>,
  membership_welcome: {
    en: {
      subject: 'Welcome to {{siteName}} – Your Access Details',
      greeting: 'Hello {{firstName}},',
      heading: 'Welcome to {{siteName}}!',
      intro: 'Your membership is ready. Sign in to explore the courses and materials available in your account.',
      credentialsIntro: 'Use the details below to sign in and set your own password.',
      step1Title: 'Access your member area',
      step1Body: 'Open your dashboard to find your courses, continue a lesson, and track your progress.',
      step1Cta: 'Open the member area',
      step2Title: 'Join the community',
      step2Body: 'Connect with other members and follow updates in the community.',
      step2Cta: 'Open the community',
      liveSessionsTitle: '', liveSessionsBody: '', conversationClubTitle: '', conversationClubBody: '',
      feedbackClubTitle: '', feedbackClubBody: '', zoomNote: '',
      personalHelpTitle: 'Need help?',
      personalHelpBody: 'Use the support link below to contact your organization.',
      personalHelpCta: 'Get help',
      tipsTitle: 'Get started',
      tipsBody: 'Choose a course, set aside time to study, and return to your dashboard to continue where you left off.',
      closing: 'We look forward to seeing your progress.',
      signoff: '{{siteName}}',
    },
    pt: {
      subject: 'Boas-vindas à {{siteName}} – Seus dados de acesso',
      greeting: 'Olá, {{firstName}},',
      heading: 'Boas-vindas à {{siteName}}!',
      intro: 'Sua assinatura está pronta. Entre para conhecer os cursos e materiais disponíveis na sua conta.',
      credentialsIntro: 'Use os dados abaixo para entrar e definir sua própria senha.',
      step1Title: 'Acesse sua área de membros',
      step1Body: 'Abra o painel para encontrar seus cursos, continuar uma aula e acompanhar seu progresso.',
      step1Cta: 'Abrir a área de membros',
      step2Title: 'Participe da comunidade',
      step2Body: 'Converse com outros membros e acompanhe as novidades da comunidade.',
      step2Cta: 'Abrir a comunidade',
      liveSessionsTitle: '', liveSessionsBody: '', conversationClubTitle: '', conversationClubBody: '',
      feedbackClubTitle: '', feedbackClubBody: '', zoomNote: '',
      personalHelpTitle: 'Precisa de ajuda?',
      personalHelpBody: 'Use o link de suporte abaixo para falar com a sua organização.',
      personalHelpCta: 'Pedir ajuda',
      tipsTitle: 'Primeiros passos',
      tipsBody: 'Escolha um curso, reserve um tempo para estudar e volte ao painel para continuar de onde parou.',
      closing: 'Esperamos acompanhar o seu progresso.',
      signoff: '{{siteName}}',
    },
    es: {
      subject: 'Te damos la bienvenida a {{siteName}} – Tus datos de acceso',
      greeting: 'Hola, {{firstName}},',
      heading: '¡Te damos la bienvenida a {{siteName}}!',
      intro: 'Tu membresía está lista. Entra para conocer los cursos y materiales disponibles en tu cuenta.',
      credentialsIntro: 'Usa los datos siguientes para entrar y definir tu propia contraseña.',
      step1Title: 'Accede a tu área de miembros',
      step1Body: 'Abre el panel para encontrar tus cursos, continuar una lección y seguir tu progreso.',
      step1Cta: 'Abrir el área de miembros',
      step2Title: 'Únete a la comunidad',
      step2Body: 'Conversa con otros miembros y sigue las novedades de la comunidad.',
      step2Cta: 'Abrir la comunidad',
      liveSessionsTitle: '', liveSessionsBody: '', conversationClubTitle: '', conversationClubBody: '',
      feedbackClubTitle: '', feedbackClubBody: '', zoomNote: '',
      personalHelpTitle: '¿Necesitas ayuda?',
      personalHelpBody: 'Usa el enlace de soporte para contactar con tu organización.',
      personalHelpCta: 'Pedir ayuda',
      tipsTitle: 'Primeros pasos',
      tipsBody: 'Elige un curso, reserva tiempo para estudiar y vuelve al panel para continuar donde lo dejaste.',
      closing: 'Esperamos acompañar tu progreso.',
      signoff: '{{siteName}}',
    },
  } satisfies Localized<MembershipWelcomeContent>,
  expiration_warning_7d: {
    en: {
      subject: 'Your access to {{courseTitle}} expires in {{daysUntilExpiration}} days',
      heading: 'Heads up, {{firstName}} —',
      body: 'Your access to {{courseTitle}} expires on {{expiresDate}} ({{daysUntilExpiration}} days from now). Renew to keep watching without interruption.',
      ctaLabel: 'Renew my access',
      fallbackLinkNote: "If the button doesn't work, open this link in your browser:",
    },
    pt: {
      subject: 'Seu acesso a {{courseTitle}} expira em {{daysUntilExpiration}} dias',
      heading: 'Atenção, {{firstName}} —',
      body: 'Seu acesso a {{courseTitle}} expira em {{expiresDate}} (daqui a {{daysUntilExpiration}} dias). Renove para continuar assistindo sem interrupções.',
      ctaLabel: 'Renovar meu acesso',
      fallbackLinkNote: 'Se o botão não funcionar, abra este link no navegador:',
    },
    es: {
      subject: 'Tu acceso a {{courseTitle}} vence en {{daysUntilExpiration}} días',
      heading: 'Atención, {{firstName}} —',
      body: 'Tu acceso a {{courseTitle}} vence el {{expiresDate}} (dentro de {{daysUntilExpiration}} días). Renueva para seguir viendo sin interrupciones.',
      ctaLabel: 'Renovar mi acceso',
      fallbackLinkNote: 'Si el botón no funciona, abre este enlace en tu navegador:',
    },
  } satisfies Localized<ExpirationWarningContent>,
  password_recovery: {
    en: {
      subject: 'Reset your {{siteName}} password', heading: 'Reset your password',
      intro: 'Hi {{firstName}}, we received a request to reset the password on your {{siteName}} account. Click the button below to choose a new one. The link is valid for one hour.',
      ctaLabel: 'Set a new password', fallbackLinkNote: "If the button doesn't work, copy this link into your browser:",
      ignoreNote: "If you didn't ask for this, you can safely ignore this email — your current password will stay the same.",
    },
    pt: {
      subject: 'Redefina sua senha da {{siteName}}', heading: 'Redefina sua senha',
      intro: 'Olá, {{firstName}}. Recebemos um pedido para redefinir a senha da sua conta na {{siteName}}. Clique no botão abaixo para escolher uma nova senha. O link é válido por uma hora.',
      ctaLabel: 'Definir uma nova senha', fallbackLinkNote: 'Se o botão não funcionar, copie este link no navegador:',
      ignoreNote: 'Se você não fez esse pedido, ignore este e-mail. Sua senha atual continuará a mesma.',
    },
    es: {
      subject: 'Restablece tu contraseña de {{siteName}}', heading: 'Restablece tu contraseña',
      intro: 'Hola, {{firstName}}. Recibimos una solicitud para restablecer la contraseña de tu cuenta en {{siteName}}. Haz clic en el botón para elegir una nueva. El enlace es válido durante una hora.',
      ctaLabel: 'Definir una nueva contraseña', fallbackLinkNote: 'Si el botón no funciona, copia este enlace en tu navegador:',
      ignoreNote: 'Si no hiciste esta solicitud, ignora este correo. Tu contraseña actual seguirá siendo la misma.',
    },
  } satisfies Localized<PasswordRecoveryContent>,
  magic_link_login: {
    en: {
      subject: 'Your {{siteName}} sign-in link', heading: 'Sign in to {{siteName}}',
      intro: 'Hi {{firstName}}, click the button to sign in. No password needed. The link is valid for one hour.',
      ctaLabel: 'Sign in', fallbackLinkNote: "If the button doesn't work, copy this link into your browser:",
      ignoreNote: "If you didn't try to sign in, you can safely ignore this email.",
    },
    pt: {
      subject: 'Seu link para entrar na {{siteName}}', heading: 'Entre na {{siteName}}',
      intro: 'Olá, {{firstName}}. Clique no botão para entrar sem senha. O link é válido por uma hora.',
      ctaLabel: 'Entrar', fallbackLinkNote: 'Se o botão não funcionar, copie este link no navegador:',
      ignoreNote: 'Se você não tentou entrar, ignore este e-mail.',
    },
    es: {
      subject: 'Tu enlace para entrar en {{siteName}}', heading: 'Entra en {{siteName}}',
      intro: 'Hola, {{firstName}}. Haz clic en el botón para entrar sin contraseña. El enlace es válido durante una hora.',
      ctaLabel: 'Entrar', fallbackLinkNote: 'Si el botón no funciona, copia este enlace en tu navegador:',
      ignoreNote: 'Si no intentaste entrar, ignora este correo.',
    },
  } satisfies Localized<MagicLinkLoginContent>,
  email_confirmation: {
    en: {
      subject: 'Confirm your email — {{siteName}}', heading: 'Confirm your email',
      intro: 'Hi {{firstName}}, welcome to {{siteName}}! Click the button below to confirm your email address and finish setting up your account.',
      ctaLabel: 'Confirm email', fallbackLinkNote: "If the button doesn't work, copy this link into your browser:",
      ignoreNote: "If you didn't create an account on {{siteName}}, you can safely ignore this email.",
    },
    pt: {
      subject: 'Confirme seu e-mail — {{siteName}}', heading: 'Confirme seu e-mail',
      intro: 'Olá, {{firstName}}. Boas-vindas à {{siteName}}! Clique no botão abaixo para confirmar seu e-mail e concluir a criação da conta.',
      ctaLabel: 'Confirmar e-mail', fallbackLinkNote: 'Se o botão não funcionar, copie este link no navegador:',
      ignoreNote: 'Se você não criou uma conta na {{siteName}}, ignore este e-mail.',
    },
    es: {
      subject: 'Confirma tu correo — {{siteName}}', heading: 'Confirma tu correo',
      intro: 'Hola, {{firstName}}. ¡Te damos la bienvenida a {{siteName}}! Haz clic en el botón para confirmar tu correo y terminar de crear tu cuenta.',
      ctaLabel: 'Confirmar correo', fallbackLinkNote: 'Si el botón no funciona, copia este enlace en tu navegador:',
      ignoreNote: 'Si no creaste una cuenta en {{siteName}}, ignora este correo.',
    },
  } satisfies Localized<EmailConfirmationContent>,
  admin_invite: {
    en: {
      subject: "You've been invited to {{siteName}}", heading: "You're invited to {{siteName}}",
      intro: "Hi {{firstName}}, you've been invited to join {{siteName}}. Click the button below to accept the invite and set up your account.",
      ctaLabel: 'Accept invite', fallbackLinkNote: "If the button doesn't work, copy this link into your browser:",
    },
    pt: {
      subject: 'Você recebeu um convite para a {{siteName}}', heading: 'Você recebeu um convite para a {{siteName}}',
      intro: 'Olá, {{firstName}}. Você recebeu um convite para participar da {{siteName}}. Clique no botão abaixo para aceitar e configurar sua conta.',
      ctaLabel: 'Aceitar convite', fallbackLinkNote: 'Se o botão não funcionar, copie este link no navegador:',
    },
    es: {
      subject: 'Recibiste una invitación para {{siteName}}', heading: 'Recibiste una invitación para {{siteName}}',
      intro: 'Hola, {{firstName}}. Recibiste una invitación para unirte a {{siteName}}. Haz clic en el botón para aceptar y configurar tu cuenta.',
      ctaLabel: 'Aceptar invitación', fallbackLinkNote: 'Si el botón no funciona, copia este enlace en tu navegador:',
    },
  } satisfies Localized<AdminInviteContent>,
  email_change: {
    en: {
      subject: 'Confirm your new email — {{siteName}}', heading: 'Confirm your new email',
      intro: 'Hi {{firstName}}, we received a request to change the email on your {{siteName}} account to {{newEmail}}. Click the button to confirm. The link is valid for one hour.',
      ctaLabel: 'Confirm new email', fallbackLinkNote: "If the button doesn't work, copy this link into your browser:",
      ignoreNote: "If you didn't request this change, you can ignore this email — your current email will stay the same.",
    },
    pt: {
      subject: 'Confirme seu novo e-mail — {{siteName}}', heading: 'Confirme seu novo e-mail',
      intro: 'Olá, {{firstName}}. Recebemos um pedido para alterar o e-mail da sua conta na {{siteName}} para {{newEmail}}. Clique no botão para confirmar. O link é válido por uma hora.',
      ctaLabel: 'Confirmar novo e-mail', fallbackLinkNote: 'Se o botão não funcionar, copie este link no navegador:',
      ignoreNote: 'Se você não pediu essa alteração, ignore este e-mail. Seu endereço atual continuará o mesmo.',
    },
    es: {
      subject: 'Confirma tu nuevo correo — {{siteName}}', heading: 'Confirma tu nuevo correo',
      intro: 'Hola, {{firstName}}. Recibimos una solicitud para cambiar el correo de tu cuenta en {{siteName}} a {{newEmail}}. Haz clic en el botón para confirmar. El enlace es válido durante una hora.',
      ctaLabel: 'Confirmar nuevo correo', fallbackLinkNote: 'Si el botón no funciona, copia este enlace en tu navegador:',
      ignoreNote: 'Si no solicitaste este cambio, ignora este correo. Tu dirección actual seguirá siendo la misma.',
    },
  } satisfies Localized<EmailChangeContent>,
  reauthentication: {
    en: {
      subject: 'Confirm your identity — {{siteName}}', heading: 'Confirm your identity',
      intro: 'Enter this verification code in {{siteName}} to continue:',
      ignoreNote: 'If you did not request this code, ignore this email. Do not share it.',
    },
    pt: {
      subject: 'Confirme sua identidade — {{siteName}}', heading: 'Confirme sua identidade',
      intro: 'Digite este código de verificação na {{siteName}} para continuar:',
      ignoreNote: 'Se você não pediu este código, ignore este e-mail e não o compartilhe.',
    },
    es: {
      subject: 'Confirma tu identidad — {{siteName}}', heading: 'Confirma tu identidad',
      intro: 'Introduce este código de verificación en {{siteName}} para continuar:',
      ignoreNote: 'Si no solicitaste este código, ignora este correo y no lo compartas.',
    },
  } satisfies Localized<ReauthenticationContent>,
  support_new_ticket: {
    en: {
      subjectPrefix: '[Support]', heading: 'New support ticket', fromLabel: 'From', subjectLabel: 'Subject',
      ticketIdLabel: 'Ticket ID', openedText: '{{userName}} opened a ticket.', unknownUser: 'A user',
    },
    pt: {
      subjectPrefix: '[Suporte]', heading: 'Novo chamado de suporte', fromLabel: 'De', subjectLabel: 'Assunto',
      ticketIdLabel: 'ID do chamado', openedText: '{{userName}} abriu um chamado.', unknownUser: 'Uma pessoa usuária',
    },
    es: {
      subjectPrefix: '[Soporte]', heading: 'Nuevo ticket de soporte', fromLabel: 'De', subjectLabel: 'Asunto',
      ticketIdLabel: 'ID del ticket', openedText: '{{userName}} abrió un ticket.', unknownUser: 'Una persona usuaria',
    },
  } satisfies Localized<SupportNewTicketContent>,
} as const;

export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATE_DEFAULTS;
export type EmailTemplateContent<K extends EmailTemplateKey> =
  (typeof EMAIL_TEMPLATE_DEFAULTS)[K][Locale];

export function getEmailTemplateDefaults<K extends EmailTemplateKey>(
  templateKey: K,
  locale: Locale,
): EmailTemplateContent<K> {
  return EMAIL_TEMPLATE_DEFAULTS[templateKey][locale];
}

export function getEmailFrameContent(locale: Locale): EmailFrameContent {
  return EMAIL_FRAME_CONTENT[locale];
}

export function resolveEmailLocale(locale: unknown): Locale {
  return isLocale(locale) ? locale : defaultLocale;
}

export function renderEmailFrameText(
  locale: Locale,
  value: string,
  vars: Record<string, string>,
): string {
  return substituteVars(value, vars);
}
