import { AdminUsers } from '@/features/Admin/components/AdminUsers';
import {
  getAdminStudents,
  getAdminAccessLevels,
  type StudentInactivityFilter,
  type StudentRoleFilter,
  type StudentStatusFilter,
  type StudentJoinedFilter,
  type StudentSourceFilter,
} from '@/features/Admin/actions';

export const dynamic = 'force-dynamic';

function param(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

function parseInactivity(raw: string | undefined): StudentInactivityFilter {
  if (raw === 'never' || raw === 'inactive_7' || raw === 'inactive_30') return raw;
  return null;
}

function parseRole(raw: string | undefined): StudentRoleFilter {
  if (raw === 'user' || raw === 'admin' || raw === 'super_admin') return raw;
  return 'all';
}

function parseStatus(raw: string | undefined): StudentStatusFilter {
  if (raw === 'active' || raw === 'suspended') return raw;
  return 'all';
}

function parseJoined(raw: string | undefined): StudentJoinedFilter {
  if (raw === '7d' || raw === '30d' || raw === '90d') return raw;
  return 'all';
}

function parseSource(raw: string | undefined): StudentSourceFilter {
  if (raw === 'youtube') return raw;
  return 'all';
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const rawPage = Number(param(params.page));
  const filters = {
    search: param(params.q) ?? '',
    inactive: parseInactivity(param(params.inactive)),
    role: parseRole(param(params.role)),
    status: parseStatus(param(params.status)),
    accessLevelId: param(params.access_level) ?? null,
    joinedSince: parseJoined(param(params.joined)),
    source: parseSource(param(params.source)),
    page: Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1,
  };

  const [studentsPage, accessLevels] = await Promise.all([
    getAdminStudents(filters),
    getAdminAccessLevels(),
  ]);

  return (
    <AdminUsers
      initialData={studentsPage}
      initialFilters={filters}
      accessLevels={accessLevels}
    />
  );
}
