import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseInstallationConfig } from '@/core/config/installation';

const mocks = vi.hoisted(() => ({ config: vi.fn(), available: vi.fn(), admin: vi.fn(), result: vi.fn(), select: vi.fn() }));
vi.mock('@/core/config/installation.server', () => ({ getInstallationConfig: mocks.config }));
vi.mock('@/core/config/env', () => ({ hasSupabaseAdminConfiguration: mocks.available }));
vi.mock('@/core/supabase/admin', () => ({ createAdminClient: mocks.admin }));
import { getTenantSettings } from './settings';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.config.mockResolvedValue(parseInstallationConfig({ branding: { site_name: 'File school', primary_color: '#047857' } }));
  mocks.available.mockReturnValue(true);
  mocks.select.mockReturnValue({ limit: () => ({ maybeSingle: mocks.result }) });
  mocks.admin.mockReturnValue({ from: () => ({ select: mocks.select }) });
  mocks.result.mockResolvedValue({ data: { site_name: 'Database school' }, error: null });
});

describe('server settings loader', () => {
  it('uses the installation file without attempting an unconfigured database', async () => {
    mocks.available.mockReturnValue(false);
    expect((await getTenantSettings()).site_name).toBe('File school');
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it('uses database preferences while explicitly selecting only known columns', async () => {
    const result = await getTenantSettings();
    expect(result.site_name).toBe('Database school');
    expect(result.primary_color).toBe('#047857');
    expect(mocks.select.mock.calls[0][0]).not.toContain('*');
  });

  it('falls back to file configuration on a database failure', async () => {
    mocks.result.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect((await getTenantSettings()).site_name).toBe('File school');
  });

  it('retains the saved identity when the appearance migration is not installed', async () => {
    mocks.result.mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column tenant_settings.login_background does not exist' } });
    mocks.result.mockResolvedValueOnce({ data: { site_name: 'Saved Open Members', primary_color: '#112233', font_family: 'serif' }, error: null });
    const settings = await getTenantSettings();
    expect(settings).toMatchObject({ site_name: 'Saved Open Members', primary_color: '#112233', font_family: 'serif', login_background: null });
    expect(mocks.select.mock.calls[1][0]).not.toContain('login_background');
  });

  it('does not retry unrelated database failures as an old schema', async () => {
    mocks.result.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } });
    expect((await getTenantSettings()).site_name).toBe('File school');
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });

  it('does not hide a broken explicit installation file behind database defaults', async () => {
    mocks.config.mockRejectedValue(new Error('Invalid installation configuration'));
    await expect(getTenantSettings()).rejects.toThrow('Invalid installation configuration');
    expect(mocks.admin).not.toHaveBeenCalled();
  });
});
