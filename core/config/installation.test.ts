// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseInstallationConfig } from './installation';
import { loadInstallationConfig } from './installation.server';

const directories: string[] = [];
async function root() {
  const directory = await mkdtemp(path.join(tmpdir(), 'openmembers-config-test-'));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('installation configuration', () => {
  it('provides complete neutral defaults without a local file', async () => {
    vi.stubEnv('OPENMEMBERS_CONFIG_FILE', '');
    const configuration = await loadInstallationConfig({ root: await root() });
    expect(configuration).toEqual({
      branding: {},
      public: { title: null, description: null },
      metadata: { description: null, shortName: null },
      links: { support: null, help: null, community: null, terms: null, privacy: null },
    });
  });

  it('reads a second identity from an explicitly selected file', async () => {
    const directory = await root();
    await writeFile(path.join(directory, 'garden.json'), JSON.stringify({
      branding: { site_name: 'Jardim Escola', primary_color: '#047857', font_family: 'serif' },
      public: { title: 'Aprenda com seu jardim' },
      metadata: { description: 'Cursos fictícios de jardinagem.', shortName: 'Jardim' },
      links: { community: 'https://community.example.test/jardim', support: 'mailto:help@example.test' },
    }));
    const config = await loadInstallationConfig({ root: directory, configFile: 'garden.json' });
    expect(config.branding.site_name).toBe('Jardim Escola');
    expect(config.public.description).toBeNull();
    expect(config.links.support).toBe('mailto:help@example.test');
  });

  it('reports a missing explicit file instead of silently using defaults', async () => {
    await expect(loadInstallationConfig({ root: await root(), configFile: 'missing.json' })).rejects.toThrow('Could not read');
  });

  it('uses the environment-selected file', async () => {
    const directory = await root();
    await writeFile(path.join(directory, 'selected.json'), '{"branding":{"site_name":"Selected"}}');
    vi.stubEnv('OPENMEMBERS_CONFIG_FILE', 'selected.json');
    expect((await loadInstallationConfig({ root: directory })).branding.site_name).toBe('Selected');
  });

  it('does not echo malformed file contents', async () => {
    const directory = await root();
    await writeFile(path.join(directory, 'invalid.json'), '{"accidental-secret":"private-value"');
    try {
      await loadInstallationConfig({ root: directory, configFile: 'invalid.json' });
      throw new Error('Expected validation error');
    } catch (error) {
      expect(String(error)).toContain('Invalid JSON');
      expect(String(error)).not.toContain('private-value');
    }
  });

  it.each([
    { supabase: { serviceRole: 'private-value' } },
    { branding: { email_from_address: 'person@example.test' } },
    { branding: { primary_color: '</style><script>private-value</script>' } },
    { metadata: { description: '' } },
    { links: { community: 'javascript:private-value' } },
    { links: { community: 'mailto:help@example.test' } },
  ])('rejects unknown fields or invalid public values without disclosing input %#', (input) => {
    expect(() => parseInstallationConfig(input)).toThrow('Invalid Open Members installation configuration');
    try { parseInstallationConfig(input); } catch (error) { expect(String(error)).not.toContain('private-value'); }
  });
});
