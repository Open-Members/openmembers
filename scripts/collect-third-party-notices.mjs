import { createHash } from 'node:crypto';
import {
  lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  realpathSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const noticeName = /^(?:licen[sc]es?|notices?|copying|copyright|authors)(?:[._-].*)?$/i;
const licenseDirectory = /^(?:licen[sc]es?|notices?)$/i;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function relativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\')
    || /[\x00-\x1f\x7f]/.test(value) || path.posix.isAbsolute(value)
    || value.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Unsafe relative path in notice inputs');
  }
  return value;
}

function inspectPath(root, relative, allowMissing = false) {
  let current = root;
  const parts = relativePath(relative).split('/');
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    let stat;
    try { stat = lstatSync(current); } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return null;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Symlink is not allowed: ${relative}`);
    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error(`Expected a directory: ${relative}`);
    }
    if (index === parts.length - 1) return stat;
  }
}

function readRegular(root, relative) {
  if (!inspectPath(root, relative)?.isFile()) {
    throw new Error(`Expected a regular file: ${relative}`);
  }
  return readFileSync(path.join(root, relative));
}

function packageIdentity(lockPath, record) {
  relativePath(lockPath);
  const parts = lockPath.split('/node_modules/');
  if (!parts[0].startsWith('node_modules/')) throw new Error('Invalid lock package path');
  parts[0] = parts[0].slice('node_modules/'.length);
  for (const part of parts) {
    if (!/^(?:@[^/]+\/)?[^/@]+$/.test(part)) throw new Error('Invalid lock package path');
  }
  if (!record || typeof record.version !== 'string' || !record.version || record.link) {
    throw new Error(`Unsupported lock package identity: ${lockPath}`);
  }
  return { package: parts.at(-1), version: record.version, lockPath };
}

function scanPackage(root, identity, addFile, gaps) {
  const files = [];
  function walk(relative, inLicenseDirectory = false) {
    const directory = path.join(root, identity.lockPath, relative);
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => compare(a.name, b.name))) {
      const sourcePath = relative ? `${relative}/${entry.name}` : entry.name;
      // A dependency's own lock entry is responsible for its notices.
      if (entry.isDirectory() && entry.name === 'node_modules') continue;
      if (entry.isSymbolicLink()) {
        gaps.push({ code: 'symlink_not_collected', ...identity, sourcePath });
      } else if (entry.isDirectory()) {
        walk(sourcePath, inLicenseDirectory || licenseDirectory.test(entry.name));
      } else if (entry.isFile()) {
        let kind;
        if (noticeName.test(entry.name) || inLicenseDirectory) kind = 'notice';
        else if (identity.package.startsWith('@img/sharp-libvips-')
          && !relative && /^(?:readme(?:\.[^/]+)?|versions\.json)$/i.test(entry.name)) {
          kind = 'composition';
        }
        if (!kind) continue;
        const bytes = readRegular(root, `${identity.lockPath}/${sourcePath}`);
        const outputPath = `packages/${identity.lockPath}/${sourcePath}`;
        addFile(outputPath, bytes);
        files.push({ ...identity, sourcePath, outputPath, kind, bytes: bytes.length, sha256: digest(bytes) });
      } else {
        gaps.push({ code: 'special_file_not_collected', ...identity, sourcePath });
      }
    }
  }
  walk('');
  return files;
}

function collectSupplements(root, identities, installed, addFile) {
  const manifestPath = 'third-party/supplements.json';
  if (!inspectPath(root, manifestPath, true)) return { files: [], entries: [], manifestSha256: null };
  const bytes = readRegular(root, manifestPath);
  const manifest = JSON.parse(bytes);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.entries)) {
    throw new Error('Unsupported third-party supplements schema');
  }
  const seen = new Set();
  const files = [];
  const entries = [];
  const sorted = [...manifest.entries].sort((a, b) => compare(
    `${a.package}\0${a.version}\0${a.file}`, `${b.package}\0${b.version}\0${b.file}`,
  ));
  for (const entry of sorted) {
    if (!entry || typeof entry.package !== 'string' || typeof entry.version !== 'string'
      || typeof entry.sourceUrl !== 'string' || typeof entry.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid supplement entry');
    relativePath(entry.file);
    const url = new URL(entry.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      throw new Error('Supplement source must be an HTTPS URL without credentials or fragment');
    }
    const key = `${entry.package}\0${entry.version}\0${entry.file}`;
    if (seen.has(key)) throw new Error('Duplicate supplement entry');
    seen.add(key);
    const matches = identities.filter(item => item.package === entry.package && item.version === entry.version);
    if (!matches.length) throw new Error(`Supplement version is absent from lock: ${entry.package}@${entry.version}`);
    const content = readRegular(root, `third-party/${entry.file}`);
    if (digest(content) !== entry.sha256) throw new Error(`Supplement SHA-256 mismatch: ${entry.file}`);
    const targets = matches.filter(item => installed.has(item.lockPath));
    entries.push({
      package: entry.package, version: entry.version, sourceUrl: entry.sourceUrl,
      file: entry.file, sha256: entry.sha256,
      status: targets.length ? 'collected' : 'skipped_not_installed',
      installedLockPaths: targets.map(item => item.lockPath),
    });
    if (!targets.length) continue;
    const outputPath = `supplements/${entry.file}`;
    addFile(outputPath, content);
    for (const identity of targets) {
      files.push({
        ...identity, sourcePath: `third-party/${entry.file}`, sourceUrl: entry.sourceUrl,
        outputPath, kind: 'supplement', bytes: content.length, sha256: entry.sha256,
      });
    }
  }
  return { files, entries, manifestSha256: digest(bytes) };
}

function writeOutput(root, output, files) {
  const absolute = path.resolve(root, output);
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  relativePath(relative);
  if (/^(?:node_modules|third-party|\.git)(?:\/|$)/.test(relative)) {
    throw new Error('Notice output must be separate from dependency, supplement and Git inputs');
  }
  const existing = inspectPath(root, relative, true);
  if (existing) {
    if (!existing.isDirectory()) throw new Error('Notice output already exists and is not a directory');
    const found = new Set();
    function verify(directory, prefix = '') {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        const destination = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (![...files.keys()].some(file => file.startsWith(`${name}/`))) {
            throw new Error('Existing notice output differs; use a new output directory');
          }
          verify(destination, name);
        } else if (entry.isFile() && files.has(name) && readFileSync(destination).equals(files.get(name))) {
          found.add(name);
        } else throw new Error('Existing notice output differs; use a new output directory');
      }
    }
    verify(absolute);
    if (found.size !== files.size) throw new Error('Existing notice output differs; use a new output directory');
    return absolute;
  }

  // New output only. Never remove or overwrite an existing collection or user file.
  mkdirSync(path.dirname(absolute), { recursive: true });
  inspectPath(root, path.relative(root, path.dirname(absolute)).split(path.sep).join('/') || relative, true);
  const staging = mkdtempSync(path.join(path.dirname(absolute), '.openmembers-notices-'));
  try {
    for (const [name, bytes] of files) {
      const destination = path.join(staging, name);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, bytes, { flag: 'wx' });
    }
    if (inspectPath(root, relative, true)) throw new Error('Notice output appeared during collection; refusing overwrite');
    renameSync(staging, absolute);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  return absolute;
}

export function collectThirdPartyNotices({ root = process.cwd(), output = '.openmembers-notices' } = {}) {
  root = realpathSync(root);
  const lockBytes = readRegular(root, 'package-lock.json');
  const lock = JSON.parse(lockBytes);
  if (![2, 3].includes(lock.lockfileVersion) || !lock.packages) throw new Error('Expected npm lockfile v2 or v3');
  const identities = Object.keys(lock.packages).filter(Boolean).sort(compare)
    .map(lockPath => packageIdentity(lockPath, lock.packages[lockPath]));
  const outputFiles = new Map();
  function addFile(name, bytes) {
    relativePath(name);
    if (outputFiles.has(name) && !outputFiles.get(name).equals(bytes)) throw new Error('Notice output path collision');
    outputFiles.set(name, bytes);
  }
  const packages = [];
  const files = [];
  const coverageGaps = [];
  const installed = new Set();
  for (const identity of identities) {
    let stat;
    try { stat = inspectPath(root, identity.lockPath, true); } catch (error) {
      if (!error.message.startsWith('Symlink is not allowed:')) throw error;
      coverageGaps.push({ code: 'symlink_package_not_collected', ...identity });
      packages.push({ ...identity, status: 'skipped_symlink' });
      continue;
    }
    if (!stat) {
      packages.push({ ...identity, status: 'not_installed', optional: lock.packages[identity.lockPath].optional === true });
      continue;
    }
    if (!stat.isDirectory()) throw new Error(`Expected installed package directory: ${identity.lockPath}`);
    const manifest = JSON.parse(readRegular(root, `${identity.lockPath}/package.json`));
    if (manifest.name !== identity.package || manifest.version !== identity.version) {
      throw new Error(`Installed package differs from lock: ${identity.lockPath}`);
    }
    installed.add(identity.lockPath);
    packages.push({ ...identity, status: 'installed', declaredLicense: lock.packages[identity.lockPath].license ?? null });
    files.push(...scanPackage(root, identity, addFile, coverageGaps));
  }
  const supplements = collectSupplements(root, identities, installed, addFile);
  files.push(...supplements.files);
  files.sort((a, b) => compare(`${a.lockPath}\0${a.outputPath}`, `${b.lockPath}\0${b.outputPath}`));
  for (const identity of identities.filter(item => installed.has(item.lockPath))) {
    if (!files.some(file => file.lockPath === identity.lockPath
      && (file.kind === 'supplement' || (file.kind === 'notice' && !file.sourcePath.includes('/'))))) {
      coverageGaps.push({ code: 'package_root_notice_not_found', ...identity });
    }
  }
  coverageGaps.sort((a, b) => compare(`${a.lockPath}\0${a.code}\0${a.sourcePath ?? ''}`, `${b.lockPath}\0${b.code}\0${b.sourcePath ?? ''}`));
  const manifest = {
    schemaVersion: 1,
    generator: 'openmembers-third-party-notices-v1',
    scope: 'Installed npm lock packages (including build/dev dependencies) and their recursively discovered notice files. Nested node_modules are attributed to their own lock entry. Vendored files retain the containing package identity; bundled component versions are not inferred.',
    lockfileSha256: digest(lockBytes),
    supplementsManifestSha256: supplements.manifestSha256,
    summary: {
      lockPackages: identities.length, installedPackages: installed.size,
      notInstalledPackages: packages.filter(item => item.status === 'not_installed').length,
      noticeFiles: files.filter(item => item.kind === 'notice').length,
      supplementFiles: new Set(supplements.files.map(item => item.outputPath)).size,
      compositionFiles: files.filter(item => item.kind === 'composition').length,
      coverageGaps: coverageGaps.length,
    },
    unassessedScopes: [
      'Node.js, Alpine and operating system components of the final image require separate distribution review.',
      'libvips README and versions.json describe native composition; they are not a complete collection of native dependency licenses.',
      'Presence of notice files does not prove license compatibility, complete bundled-component coverage or rights to the application source.',
      'Packages absent on this platform are recorded but their files and supplements are not collected.',
    ],
    packages, files, supplements: supplements.entries, coverageGaps,
  };
  addFile('manifest.json', json(manifest));
  addFile('README.txt', Buffer.from(
    'Open Members third-party notice evidence\n\n'
    + 'Original file bytes and relative paths are preserved under packages/ and supplements/.\n'
    + 'manifest.json records npm package identities, SHA-256 digests, absent packages and coverage gaps.\n'
    + 'This collection covers installed build dependencies as a conservative superset; it is not a final-image SBOM.\n'
    + 'Composition evidence is not a license grant or a claim of complete notice coverage.\n'
    + 'Review the manifest unassessedScopes before distribution.\n',
  ));
  const outputPath = writeOutput(root, output, outputFiles);
  return { outputPath, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {};
    for (let index = 2; index < process.argv.length; index += 2) {
      const name = process.argv[index];
      if (!['--root', '--output'].includes(name) || !process.argv[index + 1]) {
        throw new Error('Usage: node scripts/collect-third-party-notices.mjs [--root directory] [--output relative-directory]');
      }
      options[name.slice(2)] = process.argv[index + 1];
    }
    const { manifest } = collectThirdPartyNotices(options);
    console.log(JSON.stringify({ status: 'evidence_collected_review_required', ...manifest.summary }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
