import {
  AdminReports,
  AdminReportsLoadError,
  REPORTS_TABS,
  type ReportsTab,
} from '@/features/Admin/components/AdminReports';
import {
  getReportsData,
  ReportReadError,
  type ReportsPeriodKey,
} from '@/features/Admin/reports-queries';

export const dynamic = 'force-dynamic';

function parsePeriod(raw: string | string[] | undefined): ReportsPeriodKey {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (
    v === '30d' ||
    v === '90d' ||
    v === 'month' ||
    v === 'last_month' ||
    v === 'custom'
  ) {
    return v;
  }
  return '30d';
}

function parseTab(raw: string | string[] | undefined): ReportsTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return REPORTS_TABS.includes(v as ReportsTab) ? (v as ReportsTab) : 'overview';
}

function param(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string | string[];
    from?: string | string[];
    to?: string | string[];
    compare?: string | string[];
    tab?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const period = parsePeriod(params.period);
  const customRange =
    period === 'custom'
      ? { from: param(params.from), to: param(params.to) }
      : undefined;
  const compare = param(params.compare) === '1';
  const tab = parseTab(params.tab);

  let data: Awaited<ReturnType<typeof getReportsData>> | null;
  try {
    data = await getReportsData(period, customRange);
  } catch (error) {
    if (!(error instanceof ReportReadError)) throw error;
    data = null;
  }
  if (!data) return <AdminReportsLoadError />;
  return <AdminReports data={data} compare={compare} activeTab={tab} />;
}
