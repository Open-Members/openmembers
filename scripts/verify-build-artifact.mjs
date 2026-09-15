import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const build = path.join(root, '.next');
const findings = new Set();
let manifests = 0;

function isLocalMaterial(relative) {
  return /^(?:\.private|\.work|\.git|\.codex|\.agents|e2e)(?:\/|$)/.test(relative)
    || /^\.env(?:\.|$)/.test(relative)
    || relative === 'openmembers.config.json';
}

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', 'standalone', 'cache'].includes(entry.name)) inspect(file);
    } else if (entry.name.endsWith('.nft.json')) {
      manifests++;
      for (const item of JSON.parse(readFileSync(file, 'utf8')).files ?? []) {
        const relative = path.relative(root, path.resolve(directory, item)).split(path.sep).join('/');
        if (isLocalMaterial(relative)) findings.add(relative);
      }
    }
  }
}

try {
  inspect(build);
  if (!manifests) throw new Error('No completed build tracing manifests were found. Run npm run build.');
  if (findings.size) throw new Error(`Local material appeared in build tracing: ${[...findings].join(', ')}`);
  console.log(`Checked ${manifests} build tracing manifests: no private work, local environment, browser fixtures, or installation JSON included.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
