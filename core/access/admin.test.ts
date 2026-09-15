import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ session: vi.fn(), service: vi.fn(), getUser: vi.fn(), profile: vi.fn(), target: vi.fn() }));
vi.mock('@/core/supabase/server', () => ({ createClient: mock.session }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mock.service }));
import { requireAdmin, requireManageableUser } from './admin';

beforeEach(() => {
  vi.resetAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: 'actor' } }, error: null });
  mock.profile.mockResolvedValue({ data: { role: 'admin', status: 'active' }, error: null });
  mock.target.mockResolvedValue({ data: { role: 'user' }, error: null });
  mock.session.mockResolvedValue({
    auth: { getUser: mock.getUser },
    from: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: mock.profile }),
  });
  mock.service.mockReturnValue({
    from: () => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: mock.target }),
  });
});

describe('administrative client boundary', () => {
  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: 'actor' } }, error: { message: 'invalid session' } },
  ])('denies missing or invalid authentication without creating a service client', async (session) => {
    mock.getUser.mockResolvedValue(session);
    await expect(requireAdmin()).rejects.toThrow('Unauthenticated');
    expect(mock.service).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: null },
    { data: { role: 'user', status: 'active' }, error: null },
    { data: { role: 'admin', status: 'suspended' }, error: null },
    { data: { role: 'super_admin', status: 'suspended' }, error: null },
    { data: { role: 'admin', status: 'active' }, error: { message: 'unavailable' } },
  ])('denies absent, unprivileged, suspended and unreadable profiles', async (profile) => {
    mock.profile.mockResolvedValue(profile);
    await expect(requireAdmin()).rejects.toThrow('Forbidden');
    expect(mock.service).not.toHaveBeenCalled();
  });

  it('waits for the profile guard before creating the administrative client', async () => {
    let resolveProfile!: (profile: { data: { role: string; status: string }; error: null }) => void;
    mock.profile.mockReturnValue(new Promise((resolve) => { resolveProfile = resolve; }));
    const pending = requireAdmin();
    await vi.waitFor(() => expect(mock.profile).toHaveBeenCalledOnce());
    expect(mock.service).not.toHaveBeenCalled();
    resolveProfile({ data: { role: 'admin', status: 'active' }, error: null });
    const context = await pending;
    expect(mock.service).toHaveBeenCalledOnce();
    expect(context).toMatchObject({ callerId: 'actor', callerRole: 'admin' });
    expect(context.supabase).toBe(context.adminClient);
    expect(context.adminClient).toBe(mock.service.mock.results[0].value);
  });
});

describe('manageable-user hierarchy', () => {
  it.each(['admin', 'super_admin'])('permits an active %s to manage a student', async (role) => {
    mock.profile.mockResolvedValue({ data: { role, status: 'active' }, error: null });
    await expect(requireManageableUser('student')).resolves.toMatchObject({ callerRole: role });
  });

  it.each(['admin', 'super_admin'])('prevents an ordinary admin from managing a target with role %s', async (role) => {
    mock.target.mockResolvedValue({ data: { role }, error: null });
    await expect(requireManageableUser('elevated-target')).rejects.toThrow('Only super_admin');
  });

  it.each(['admin', 'super_admin'])('allows a super_admin to manage a target with role %s', async (role) => {
    mock.profile.mockResolvedValue({ data: { role: 'super_admin', status: 'active' }, error: null });
    mock.target.mockResolvedValue({ data: { role }, error: null });
    await expect(requireManageableUser('elevated-target')).resolves.toMatchObject({ callerRole: 'super_admin' });
  });

  it.each([
    { data: null, error: null },
    { data: { role: 'user' }, error: { message: 'unavailable' } },
  ])('denies an absent or unreadable target', async (target) => {
    mock.target.mockResolvedValue(target);
    await expect(requireManageableUser('missing-target')).rejects.toThrow('User not found');
  });

  it('does not read the target when the actor is unauthorized', async () => {
    mock.profile.mockResolvedValue({ data: { role: 'user', status: 'active' }, error: null });
    await expect(requireManageableUser('target')).rejects.toThrow('Forbidden');
    expect(mock.target).not.toHaveBeenCalled();
    expect(mock.service).not.toHaveBeenCalled();
  });
});
