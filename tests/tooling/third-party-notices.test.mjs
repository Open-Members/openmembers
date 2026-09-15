import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { collectThirdPartyNotices } from '../../scripts/collect-third-party-notices.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'openmembers-notices-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lock = { lockfileVersion: 3, packages: { '': { name: 'fixture', version: '1.0.0' } } };
  function write(file, bytes) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), bytes);
  }
  function saveLock() { write('package-lock.json', JSON.stringify(lock)); }
  function pkg(name, version, files = {}, options = {}) {
    const lockPath = options.lockPath ?? `node_modules/${name}`;
    lock.packages[lockPath] = { version, license: 'MIT', ...options.lock };
    if (options.installed !== false) {
      write(`${lockPath}/package.json`, JSON.stringify({ name, version }));
      for (const [file, bytes] of Object.entries(files)) write(`${lockPath}/${file}`, bytes);
    }
    saveLock();
    return lockPath;
  }
  function supplements(entries) {
    write('third-party/supplements.json', JSON.stringify({ schemaVersion: 1, entries }));
  }
  function supplement(name, version, bytes = 'MIT license\r\n', file = 'licenses/example/LICENSE') {
    write(`third-party/${file}`, bytes);
    return { package: name, version, sourceUrl: 'https://example.test/project/commit/license', file, sha256: hash(bytes) };
  }
  saveLock();
  return { root, lock, write, saveLock, pkg, supplements, supplement };
}

function contents(directory) {
  const result = {};
  function walk(current, prefix = '') {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(current, entry.name), relative);
      else result[relative] = readFileSync(path.join(current, entry.name)).toString('hex');
    }
  }
  walk(directory);
  return result;
}

test('collection preserves notice bytes, source paths and hashes, with deterministic private output', t => {
  const f = fixture(t);
  const original = Buffer.from([0x4d, 0x49, 0x54, 0x0d, 0x0a, 0xff]);
  f.pkg('z-package', '2.0.0', { LICENSE: original, 'docs/NOTICE.txt': 'Attribution\n', 'src/index.js': 'not a notice' });
  f.pkg('@scope/a-package', '1.0.0', { 'COPYING.LESSER': 'LGPL terms\n', AUTHORS: 'Authors\n' });
  const first = collectThirdPartyNotices({ root: f.root, output: '.private/first' });
  const second = collectThirdPartyNotices({ root: f.root, output: '.private/second' });
  assert.deepEqual(contents(first.outputPath), contents(second.outputPath));
  assert.deepEqual(collectThirdPartyNotices({ root: f.root, output: '.private/first' }).manifest, first.manifest);
  const license = first.manifest.files.find(file => file.package === 'z-package' && file.sourcePath === 'LICENSE');
  assert.equal(license.version, '2.0.0');
  assert.equal(license.sha256, hash(original));
  assert.equal(license.bytes, original.length);
  assert.deepEqual(readFileSync(path.join(first.outputPath, license.outputPath)), original);
  assert.equal(first.manifest.summary.noticeFiles, 4);
  assert.equal(first.manifest.files.some(file => file.sourcePath === 'src/index.js'), false);
  assert.equal(first.manifest.lockfileSha256, hash(readFileSync(path.join(f.root, 'package-lock.json'))));
});

test('recursive notices retain containing identity, including compiled, font, wasm and license-directory evidence', t => {
  const f = fixture(t);
  f.pkg('next', '16.2.4', {
    license: 'Next license',
    'dist/compiled/webpack/LICENSE': 'Webpack attribution',
    'dist/compiled/@scope/vendor/NOTICE': 'Vendor notice',
    'licenses/components/bsd.txt': 'BSD text',
  });
  f.pkg('pdfjs-dist', '5.6.205', {
    LICENSE: 'PDF.js license', 'standard_fonts/LICENSE_FOXIT': 'Font terms',
    'wasm/LICENSE_QCMS': 'qcms terms', 'iccs/LICENSE': 'ICC terms',
  });
  f.pkg('nested', '3.0.0', { COPYRIGHT: 'Nested terms' }, { lockPath: 'node_modules/next/node_modules/nested' });
  const { manifest } = collectThirdPartyNotices({ root: f.root });
  assert.equal(manifest.summary.noticeFiles, 9);
  assert.equal(manifest.files.find(file => file.sourcePath === 'dist/compiled/webpack/LICENSE').package, 'next');
  assert.equal(manifest.files.find(file => file.sourcePath === 'COPYRIGHT').package, 'nested');
  assert.equal(manifest.files.some(file => file.package === 'next' && file.sourcePath.startsWith('node_modules/')), false);
  assert.equal(manifest.files.find(file => file.sourcePath === 'licenses/components/bsd.txt').kind, 'notice');
});

test('installed identity must match the exact lock version and package name', t => {
  const f = fixture(t);
  f.pkg('example', '1.0.0', { LICENSE: 'MIT' });
  for (const manifest of [{ name: 'example', version: '1.0.1' }, { name: 'other', version: '1.0.0' }]) {
    f.write('node_modules/example/package.json', JSON.stringify(manifest));
    assert.throws(() => collectThirdPartyNotices({ root: f.root }), /Installed package differs from lock/);
    assert.equal(existsSync(path.join(f.root, '.openmembers-notices')), false);
  }
});

test('libvips README and versions are composition evidence and do not close the package notice gap', t => {
  const f = fixture(t);
  f.pkg('@img/sharp-libvips-linuxmusl-x64', '1.2.0', {
    'README.md': 'Includes native components', 'versions.json': '{"vips":"8.17.0"}',
  });
  const { manifest } = collectThirdPartyNotices({ root: f.root });
  assert.equal(manifest.summary.compositionFiles, 2);
  assert.equal(manifest.summary.noticeFiles, 0);
  assert.equal(manifest.coverageGaps[0].code, 'package_root_notice_not_found');
  assert.ok(manifest.unassessedScopes.some(scope => scope.includes('not a complete collection')));
});

test('supplements require a locked and installed exact identity, and preserve their bytes and source', t => {
  const f = fixture(t);
  f.pkg('@scope/example', '1.0.0');
  const entry = f.supplement('@scope/example', '1.0.0');
  f.supplements([entry]);
  const { outputPath, manifest } = collectThirdPartyNotices({ root: f.root });
  assert.equal(manifest.summary.supplementFiles, 1);
  assert.deepEqual(manifest.coverageGaps, []);
  assert.equal(manifest.supplements[0].status, 'collected');
  assert.equal(manifest.files[0].sourceUrl, entry.sourceUrl);
  assert.equal(hash(readFileSync(path.join(outputPath, manifest.files[0].outputPath))), entry.sha256);
});

test('supplement version drift, checksum drift and duplicate records fail before producing output', t => {
  const f = fixture(t);
  f.pkg('example', '1.0.0');
  const entry = f.supplement('example', '1.0.0');
  for (const [entries, expected] of [
    [[{ ...entry, version: '1.0.1' }], /Supplement version is absent from lock/],
    [[{ ...entry, sha256: '0'.repeat(64) }], /SHA-256 mismatch/],
    [[entry, entry], /Duplicate supplement/],
  ]) {
    f.supplements(entries);
    assert.throws(() => collectThirdPartyNotices({ root: f.root }), expected);
    assert.equal(existsSync(path.join(f.root, '.openmembers-notices')), false);
  }
});

test('absent platform packages are recorded and their supplements do not imply collected coverage', t => {
  const f = fixture(t);
  f.pkg('optional-native', '1.0.0', {}, { installed: false, lock: { optional: true } });
  f.supplements([f.supplement('optional-native', '1.0.0')]);
  const { manifest } = collectThirdPartyNotices({ root: f.root });
  assert.equal(manifest.summary.notInstalledPackages, 1);
  assert.equal(manifest.packages[0].status, 'not_installed');
  assert.equal(manifest.packages[0].optional, true);
  assert.equal(manifest.supplements[0].status, 'skipped_not_installed');
  assert.deepEqual(manifest.files, []);
  assert.equal(manifest.summary.supplementFiles, 0);
});

test('symlink files and directories are skipped even if their target is inside the project', t => {
  const f = fixture(t);
  f.pkg('example', '1.0.0', { LICENSE: 'Allowed bytes' });
  f.write('private-material/NOTICE', 'Never collect');
  symlinkSync(path.join(f.root, 'private-material/NOTICE'), path.join(f.root, 'node_modules/example/COPYING'));
  symlinkSync(path.join(f.root, 'private-material'), path.join(f.root, 'node_modules/example/other'));
  const { manifest } = collectThirdPartyNotices({ root: f.root });
  assert.equal(manifest.summary.noticeFiles, 1);
  assert.equal(manifest.coverageGaps.filter(gap => gap.code === 'symlink_not_collected').length, 2);
  assert.equal(JSON.stringify(manifest).includes('Never collect'), false);
});

test('symlink package roots outside the project are skipped without reading or counting their supplements', t => {
  const f = fixture(t);
  const outside = fixture(t);
  outside.write('foreign/package.json', JSON.stringify({ name: 'example', version: '1.0.0' }));
  outside.write('foreign/LICENSE', 'Do not read');
  f.pkg('example', '1.0.0', {}, { installed: false });
  mkdirSync(path.join(f.root, 'node_modules'));
  symlinkSync(path.join(outside.root, 'foreign'), path.join(f.root, 'node_modules/example'));
  f.supplements([f.supplement('example', '1.0.0')]);
  const { manifest } = collectThirdPartyNotices({ root: f.root });
  assert.equal(manifest.summary.installedPackages, 0);
  assert.equal(manifest.packages[0].status, 'skipped_symlink');
  assert.equal(manifest.coverageGaps[0].code, 'symlink_package_not_collected');
  assert.equal(manifest.supplements[0].status, 'skipped_not_installed');
  assert.deepEqual(manifest.files, []);
});

test('supplement symlink and traversal inputs are rejected', t => {
  const f = fixture(t);
  f.pkg('example', '1.0.0');
  const entry = f.supplement('example', '1.0.0');
  for (const file of ['../package-lock.json', '/tmp/LICENSE', 'licenses/../../LICENSE', 'licenses\\LICENSE']) {
    f.supplements([{ ...entry, file }]);
    assert.throws(() => collectThirdPartyNotices({ root: f.root }), /Unsafe relative path/);
  }
  symlinkSync(path.join(f.root, 'third-party', entry.file), path.join(f.root, 'third-party/linked-LICENSE'));
  f.supplements([{ ...entry, file: 'linked-LICENSE' }]);
  assert.throws(() => collectThirdPartyNotices({ root: f.root }), /Symlink is not allowed/);
});

test('traversal in lock paths and symlink lock input are rejected', t => {
  const f = fixture(t);
  f.lock.packages['node_modules/../../outside'] = { version: '1.0.0' };
  f.saveLock();
  assert.throws(() => collectThirdPartyNotices({ root: f.root }), /Unsafe relative path/);
  const linked = fixture(t);
  rmSync(path.join(linked.root, 'package-lock.json'));
  symlinkSync(path.join(f.root, 'package-lock.json'), path.join(linked.root, 'package-lock.json'));
  assert.throws(() => collectThirdPartyNotices({ root: linked.root }), /Symlink is not allowed/);
});

test('existing unknown or changed output is refused without altering any bytes', t => {
  const f = fixture(t);
  f.pkg('example', '1.0.0', { LICENSE: 'Original' });
  f.write('.private/unknown/keep.txt', 'Keep this');
  assert.throws(() => collectThirdPartyNotices({ root: f.root, output: '.private/unknown' }), /Existing notice output differs/);
  assert.equal(readFileSync(path.join(f.root, '.private/unknown/keep.txt'), 'utf8'), 'Keep this');
  const { outputPath } = collectThirdPartyNotices({ root: f.root });
  const before = contents(outputPath);
  f.write('node_modules/example/LICENSE', 'Changed');
  assert.throws(() => collectThirdPartyNotices({ root: f.root }), /Existing notice output differs/);
  assert.deepEqual(contents(outputPath), before);
});

test('output cannot escape the project, overwrite source inputs, or traverse a symlink', t => {
  const f = fixture(t);
  const outside = fixture(t);
  f.pkg('example', '1.0.0', { LICENSE: 'MIT' });
  symlinkSync(outside.root, path.join(f.root, 'linked'));
  for (const output of ['../outside', 'node_modules/notices', 'third-party/generated', '.git/notices', 'linked/notices']) {
    assert.throws(() => collectThirdPartyNotices({ root: f.root, output }), /Unsafe relative path|separate from|Symlink is not allowed/);
  }
  assert.equal(existsSync(path.join(outside.root, 'notices')), false);
});

test('Docker creates its own notices and copies them into the final image; generated host output is excluded', () => {
  const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
  const dockerignore = readFileSync(new URL('../../.dockerignore', import.meta.url), 'utf8');
  const gitignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');
  assert.match(dockerfile, /RUN node scripts\/collect-third-party-notices\.mjs\s*\\\n\s*&& npm run build/);
  assert.match(dockerfile, /COPY --from=builder \/app\/\.openmembers-notices \.\/third-party/);
  assert.match(dockerignore, /^\.openmembers-notices$/m);
  assert.match(gitignore, /^\/\.openmembers-notices\/$/m);
});
