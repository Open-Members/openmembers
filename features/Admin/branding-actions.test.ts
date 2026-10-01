// @vitest-environment node
import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  validate: vi.fn(),
  revalidate: vi.fn(),
  update: vi.fn(),
  read: vi.fn(),
  configuration: vi.fn(),
}));
vi.mock('@/core/access/admin', () => ({
  requireAdmin: mocks.requireAdmin,
  requireManageableUser: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('@/core/storage/backgrounds', () => ({ validateBackgroundAssets: mocks.validate }));
vi.mock('@/core/config/installation.server', () => ({
  getInstallationConfig: mocks.configuration,
}));
vi.mock('@/core/theme/settings-read', () => ({ readTenantSettings: mocks.read }));
import { saveAdminBranding } from './actions';
const input = {
  siteName: 'Open Members',
  primaryColor: '#0235a8',
  accentColor: '#f20505',
  loginBackground: { mode: 'color' as const, color: '#123456' },
};
beforeEach(() => {
  vi.resetAllMocks();
  const saved = { maybeSingle: vi.fn(async () => ({ data: { id: 'tenant' }, error: null })) };
  const table = { select: vi.fn(() => ({ limit: () => saved })), update: mocks.update };
  mocks.update.mockReturnValue({ eq: () => ({ select: () => saved }) });
  mocks.requireAdmin.mockResolvedValue({ supabase: { from: () => table } });
  mocks.validate.mockResolvedValue(undefined);
  mocks.configuration.mockResolvedValue({ branding: {} });
});
it('validates assets before updating, preserves omitted screens, and revalidates only after success', async () => {
  expect(await saveAdminBranding(input)).toEqual({ success: true });
  expect(mocks.validate).toHaveBeenCalled();
  expect(mocks.update.mock.calls[0][0]).toMatchObject({
    login_background: { mode: 'color', color: '#123456' },
  });
  expect(mocks.update.mock.calls[0][0]).not.toHaveProperty('register_background');
  expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout');
});
it('failed image validation leaves published settings untouched', async () => {
  mocks.validate.mockRejectedValue(new Error('Bad upload'));
  expect(await saveAdminBranding(input)).toEqual({ error: 'invalidInput' });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it('rejects unauthorized administrators before any validation or writes', async () => {
  mocks.requireAdmin.mockRejectedValue(new Error('Forbidden'));
  await expect(saveAdminBranding(input)).rejects.toThrow('Forbidden');
  expect(mocks.validate).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});

it('accepts a copied operator-configured image but rejects a new arbitrary URL', async () => {
  const policy = await vi.importActual<typeof import('@/core/storage/backgrounds')>(
    '@/core/storage/backgrounds',
  );
  mocks.validate.mockImplementation(policy.validateBackgroundAssets);
  const configured = {
    mode: 'image' as const,
    imageUrl: '/background.webp',
    position: 'center' as const,
    overlayOpacity: 70,
  };
  mocks.configuration.mockResolvedValue({ branding: { login_background: configured } });
  expect(
    await saveAdminBranding({
      ...input,
      registerBackground: { ...configured, position: 'bottom', overlayOpacity: 90 },
    }),
  ).toEqual({ success: true });
  expect(mocks.update.mock.calls[0][0]).toHaveProperty('register_background', {
    ...configured,
    position: 'bottom',
    overlayOpacity: 90,
  });
  mocks.update.mockClear();
  expect(
    await saveAdminBranding({
      ...input,
      registerBackground: { ...configured, imageUrl: 'https://unconfigured.example.test/new.webp' },
    }),
  ).toEqual({ error: 'invalidInput' });
  expect(mocks.update).not.toHaveBeenCalled();
});
