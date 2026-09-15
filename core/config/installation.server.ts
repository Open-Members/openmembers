import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { cache } from 'react';
import { parseInstallationConfig, type InstallationConfig } from './installation';

/** Read only on the server. This file is public presentation, never credentials. */
export async function loadInstallationConfig(options: { root?: string; configFile?: string } = {}): Promise<InstallationConfig> {
  const root = options.root ?? process.cwd();
  const explicitFile = options.configFile ?? process.env.OPENMEMBERS_CONFIG_FILE;
  // Deployment supplies this public file at runtime. Do not let NFT infer the
  // entire repository (including private local evidence) from a dynamic path.
  const filePath = path.resolve(/* turbopackIgnore: true */ root, explicitFile || 'openmembers.config.json');
  let source: string;
  try {
    source = await readFile(/* turbopackIgnore: true */ filePath, 'utf8');
  } catch (error) {
    if (!explicitFile && (error as NodeJS.ErrnoException).code === 'ENOENT') return parseInstallationConfig({});
    throw new Error('Could not read the Open Members installation configuration. Check OPENMEMBERS_CONFIG_FILE and file permissions.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(source); } catch {
    throw new Error('Invalid JSON in the Open Members installation configuration. Check openmembers.config.example.json.');
  }
  return parseInstallationConfig(parsed);
}

export const getInstallationConfig = cache(async (): Promise<InstallationConfig> => loadInstallationConfig());
