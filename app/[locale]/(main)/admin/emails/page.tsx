import { AdminEmailConfig } from '@/features/Admin/components/AdminEmailConfig';
import { AdminEmailTemplates } from '@/features/Admin/components/AdminEmailTemplates';
import { AdminPageHeader } from '@/features/Admin/components/AdminPageHeader';
import {
  getEmailSenderConfig,
  getEmailTemplates,
} from '@/features/Admin/actions';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function AdminEmailsPage() {
  const [emailConfig, emailTemplates, t] = await Promise.all([
    getEmailSenderConfig(),
    getEmailTemplates(),
    getTranslations('adminOperations.email.page'),
  ]);

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6 pb-16">
      <AdminPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('description')}
      />
      <AdminEmailConfig initialConfig={emailConfig} />
      <AdminEmailTemplates templates={emailTemplates} />
    </div>
  );
}
