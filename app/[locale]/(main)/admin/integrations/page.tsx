import { AdminIntegrations } from '@/features/Admin/components/AdminIntegrations';
import {
  getAdminWebhookConfigs,
  getAdminWebhookLogs,
  getAdminAccessLevels,
  getAdminCoursesLite,
  getAdminDeadLetters,
  getWebhookAnomalies,
} from '@/features/Admin/actions';

export const dynamic = 'force-dynamic';

export default async function AdminIntegrationsPage() {
  const [configs, logs, accessLevels, courses, deadLetters, anomalies] =
    await Promise.all([
      getAdminWebhookConfigs(),
      getAdminWebhookLogs(),
      getAdminAccessLevels(),
      getAdminCoursesLite(),
      getAdminDeadLetters('all', 50),
      getWebhookAnomalies(),
    ]);
  return (
    <AdminIntegrations
      initialConfigs={configs}
      initialLogs={logs}
      initialDeadLetters={deadLetters}
      initialAnomalies={anomalies}
      accessLevels={accessLevels}
      courses={courses}
      // Wall-clock capture is intentional — the client uses this as the
      // "now" reference for the 24h health window. React's purity rule
      // flags Date.now(), but this is an admin dashboard and the
      // render-per-request is expected. Dynamic mode is already on.
      // eslint-disable-next-line react-hooks/purity
      initialNow={Date.now()}
    />
  );
}
