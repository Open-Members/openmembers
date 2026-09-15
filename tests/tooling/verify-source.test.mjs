import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  SOURCE_LIMITS, SourceVerificationError, inspectSourceCredentials, parseSourceTree,
  runSourceVerification, sourceGitEnvironment, sourcePathRule, validateSourceSizes, verifySource,
} from '../../scripts/verify-source.mjs';

const sourceScript = fileURLToPath(new URL('../../scripts/verify-source.mjs', import.meta.url));
const oid = 'a'.repeat(40);
const token = () => ['ghp', '_', 'x'.repeat(36)].join('');
const privateKey = () => ['-----BEGIN ', 'RSA PRIVATE KEY', '-----'].join('');
const jwt = role => [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ role, iss: 'fictitious-only' })).toString('base64url'),
  Buffer.alloc(32, 1).toString('base64url'),
].join('.');

function fixture(t, files = { 'README.md': 'Fictitious source\n' }) {
  const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'openmembers-source-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function git(...args) {
    return execFileSync('git', args, { cwd: root, env: sourceGitEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] });
  }
  function write(file, content) {
    const destination = path.join(root, file);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
  function commit(message = 'Fictitious fixture') {
    git('add', '--all');
    git('-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD').toString().trim();
  }
  git('init', '--quiet');
  git('config', 'user.name', 'Source Verification Fixture');
  git('config', 'user.email', 'fixture@example.test');
  for (const [file, content] of Object.entries(files)) write(file, content);
  commit();
  return { root, git, write, commit };
}

function code(expected) {
  return error => error instanceof SourceVerificationError && error.code === expected;
}

function output(options) {
  const lines = [];
  const status = runSourceVerification({ args: [], log: line => lines.push(line), error: line => lines.push(line), ...options });
  return { status, text: lines.join('\n'), lines };
}

test('clean committed snapshot returns its exact revision and includes only tracked blobs', t => {
  const f = fixture(t, {
    '.gitignore': '.private/\n', 'README.md': 'Fictitious source\n',
    '.env.example': 'SECRET=replace-me\n', 'deploy/application.env.example': 'SECRET=\n',
  });
  f.write('.private/ignored.txt', token());
  f.write('untracked.txt', privateKey());
  const result = verifySource({ root: f.root });
  assert.equal(result.revision, f.git('rev-parse', 'HEAD').toString().trim());
  assert.equal(result.files, 4);
  assert.equal(result.totalBytes, 54);
  assert.match(result.scope, /untracked and ignored files excluded/u);
  const cli = execFileSync(process.execPath, [sourceScript], { cwd: f.root, encoding: 'utf8' });
  assert.match(cli, new RegExp(result.revision));
  assert.equal(cli.includes(token()), false);
});

test('both exact environment templates are allowed without permitting other environment files', () => {
  for (const file of ['.env.example', 'deploy/application.env.example']) assert.equal(sourcePathRule(file), null);
  for (const file of ['.env', '.env.local', '.env.production', 'nested/.env.example', 'foo.env', 'config/foo.env.example', '.ENV.EXAMPLE', 'DEPLOY/application.env.example']) {
    assert.equal(sourcePathRule(file), 'path.environment', file);
  }
});

test('nested local files, key containers and generated material are forbidden', () => {
  for (const file of ['.private/receipt.json', 'docs/.work/snapshot', 'sub/.codex/config', 'nested/openmembers.config.json', '.PRIVATE/receipt.json', 'sub/.CODEX/config', 'sub/.CuRsOr/rules.mdc', 'sub/.GEMINI/settings.json', 'sub/.windsurf/rules/local.md']) {
    assert.equal(sourcePathRule(file), 'path.local-material', file);
  }
  for (const file of ['client.pem', 'nested/key.KEY', 'backup.p12', 'backup.pfx']) {
    assert.equal(sourcePathRule(file), 'path.key-container', file);
  }
  for (const file of ['coverage/data.json', 'nested/.next/file', 'nested/test-results/trace.zip', 'output.log', '.DS_Store', 'nested/.ds_STORE']) {
    assert.equal(sourcePathRule(file), 'path.generated-material', file);
  }
  for (const file of ['.github/workflows/ci.yml', '.gitignore', 'tests/tooling/source.test.mjs', 'e2e/fixtures/example.json']) {
    assert.equal(sourcePathRule(file), null, file);
  }
});

test('local instructions and internal Markdown are excluded at every depth without matching public guides', () => {
  for (const file of ['AGENTS.md', 'app/agents.MD', 'docs/CLAUDE.md', 'GEMINI.md', '.github/Copilot-Instructions.Md', 'nested/.cursorrules', 'wrangler.local.jsonc', 'website/WRANGLER.LOCAL.JSONC']) {
    assert.equal(sourcePathRule(file), 'path.local-material', file);
  }
  for (const file of [
    'HANDOFF.md', 'docs/HANDOFF-LANDING-PAGE.md', 'docs/Release-Handoff.MD',
    'PLAN.md', 'docs/security-plan.md', 'docs/release-plano.md', 'docs/PLANNING.md',
    'docs/roadmap.md', 'docs/cronograma-execucao.md', 'docs/backlog-execucao.md',
    'docs/continuacao.md', 'docs/public-source-preparation.md', 'docs/relaunch-preparation.md',
    'planning/README.md', 'nested/PLANS/validation.MD', 'docs/internal/README.md',
  ]) assert.equal(sourcePathRule(file), 'path.internal-document', file);
  for (const file of [
    'README.md', 'CONTRIBUTING.md', 'SECURITY.md', 'THIRD_PARTY_NOTICES.md',
    'docs/installation.md', 'docs/operations.md', 'docs/features.md', 'docs/limitations.md',
    'docs/source-verification.md', 'docs/brand/README.md', 'docs/platform.md',
    'scripts/test-reporter.mjs', 'core/i18n/audit/catalog-utils.ts',
    'tests/fixtures/plan.json', 'features/planning.ts', 'planning/schema.json',
    'third-party/licenses/next-license.md', 'website/wrangler.example.jsonc',
  ]) assert.equal(sourcePathRule(file), null, file);
});

test('repository ignores exclude local instructions and work notes while retaining public documentation', t => {
  const ignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');
  const f = fixture(t, { '.gitignore': ignore, 'docs/installation.md': 'Public installation guide\n' });
  const local = [
    'AGENTS.md', 'features/AGENTS.md', 'docs/CLAUDE.md', 'nested/GEMINI.md',
    '.github/copilot-instructions.md', 'nested/.codex/config.toml', 'nested/.agents/local.txt',
    '.cursor/rules/local.mdc', 'nested/.windsurf/rules/local.md',
    'HANDOFF.md', 'docs/HANDOFF-LANDING-PAGE.md', 'docs/release-plan.md',
    'docs/release-plano.md', 'docs/roadmap.md', 'docs/cronograma-execucao.md',
    'docs/backlog-execucao.md', 'planning/notes.md', 'nested/plans/tasks.md',
  ];
  for (const file of local) f.write(file, 'Local instructions\n');
  assert.deepEqual(f.git('check-ignore', '--no-index', '--', ...local).toString().trim().split('\n'), local);
  f.git('add', '--all');
  assert.equal(f.git('diff', '--cached', '--name-only').toString(), '');
  assert.equal(verifySource({ root: f.root }).files, 2);
});

test('adding a website with a temporary dependency symlink leaves that link untracked', t => {
  const ignore = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');
  const f = fixture(t, { '.gitignore': ignore, 'README.md': 'Fictitious source\n' });
  mkdirSync(path.join(f.root, 'website'));
  symlinkSync(f.root, path.join(f.root, 'website/node_modules'), 'dir');
  assert.equal(f.git('check-ignore', '--', 'website/node_modules').toString().trim(), 'website/node_modules');
  f.git('add', '--all');
  assert.equal(f.git('diff', '--cached', '--name-only').toString(), '');
  assert.equal(verifySource({ root: f.root }).files, 2);
});

test('force-added instructions and internal documents fail before body reads without leaking their contents', t => {
  const f = fixture(t, {
    '.gitignore': 'AGENTS.md\nCLAUDE.md\nWRANGLER.LOCAL.JSONC\n/docs/HANDOFF.md\n/docs/release-plan.md\n/docs/internal/\n',
    'docs/installation.md': 'Public installation guide\n',
  });
  const rejected = ['nested/AGENTS.md', 'nested/CLAUDE.md', 'docs/HANDOFF.md', 'docs/release-plan.md', 'docs/internal/notes.md', 'website/WRANGLER.LOCAL.JSONC'];
  for (const file of rejected) f.write(file, token());
  f.git('add', '-f', '--', ...rejected);
  f.commit();
  let bodyReads = 0;
  const result = output({ root: f.root, exec(command, args, options) {
    if (args.includes('--batch')) bodyReads++;
    return execFileSync(command, args, options);
  } });
  assert.equal(result.status, 1);
  assert.match(result.text, /path.local-material/u);
  assert.match(result.text, /path.internal-document/u);
  for (const file of rejected) assert.ok(result.text.includes(file), file);
  assert.equal(bodyReads, 0);
  assert.equal(result.text.includes(token()), false);
});

test('a committed public documentation snapshot passes with documentation, examples and license texts', t => {
  const files = {
    'README.md': 'Product and setup\n', 'CONTRIBUTING.md': 'Contributor guide\n',
    'SECURITY.md': 'Reporting policy\n', 'THIRD_PARTY_NOTICES.md': 'Dependency attribution\n',
    'docs/installation.md': 'Deployment guide\n', 'docs/limitations.md': 'Known limitations\n',
    'docs/source-verification.md': 'Committed source verification\n',
    'docs/brand/README.md': 'Brand usage\n', 'third-party/licenses/next-license.md': 'License text\n',
    'tests/fixtures/plan.json': '{}\n', 'features/planning.ts': 'export const value = 1;\n',
    'website/wrangler.example.jsonc': '{ "name": "example" }\n',
  };
  const f = fixture(t, files);
  assert.equal(verifySource({ root: f.root }).files, Object.keys(files).length);
});

test('force-added private material fails on its path before any blob body is read', t => {
  const f = fixture(t, { '.gitignore': '.private/\n' });
  f.write('.private/secret.txt', token());
  f.git('add', '-f', '.private/secret.txt');
  f.commit();
  let bodyReads = 0;
  const result = output({ root: f.root, exec(command, args, options) {
    if (args.includes('--batch')) bodyReads++;
    return execFileSync(command, args, options);
  } });
  assert.equal(result.status, 1);
  assert.match(result.text, /path.local-material/u);
  assert.equal(bodyReads, 0);
  assert.equal(result.text.includes(token()), false);
});

test('finite credential signatures detect generated examples, including administrative JWTs', () => {
  const examples = [
    [privateKey(), 'credential.private-key'],
    [token(), 'credential.github-token'],
    [['github', '_pat_', 'a'.repeat(82)].join(''), 'credential.github-token'],
    [['sk', '_live_', 'A'.repeat(32)].join(''), 'credential.stripe-secret'],
    [['rk', '_test_', 'A'.repeat(32)].join(''), 'credential.stripe-secret'],
    [['sb', '_secret_', 'A'.repeat(32)].join(''), 'credential.supabase-secret'],
    [jwt('service_role'), 'credential.administrative-jwt'],
    [jwt('supabase_admin'), 'credential.administrative-jwt'],
  ];
  for (const [value, rule] of examples) {
    assert.deepEqual(inspectSourceCredentials(Buffer.from(`first\n${value}\n`)), [{ rule, line: 2 }]);
  }
});

test('placeholders, public credentials, non-administrative JWTs and hashes are not secret findings', () => {
  const content = [
    'SUPABASE_SERVICE_ROLE_KEY=replace-me', 'STRIPE_SECRET_KEY=', 'ghp_placeholder',
    ['pk', '_live_', 'A'.repeat(32)].join(''), jwt('anon'), jwt('authenticated'),
    'a'.repeat(64), `${token()}x`, `prefix_${token()}`, ['sk', '_live_', 'a'.repeat(201)].join(''),
  ].join('\n');
  assert.deepEqual(inspectSourceCredentials(Buffer.from(content)), []);
});

test('known signatures are detected in binary data and UTF-16 of either byte order and alignment', () => {
  const value = `first\n${token()}\n`;
  const le = Buffer.from(value, 'utf16le');
  const be = Buffer.from(le).swap16();
  const versions = [
    Buffer.concat([Buffer.from([255, 0]), Buffer.from(value), Buffer.from([0, 254])]),
    le, be, Buffer.concat([Buffer.from([255, 254]), le]), Buffer.concat([Buffer.from([254, 255]), be]),
    Buffer.concat([Buffer.from([7]), le]), Buffer.concat([Buffer.from([7]), be]),
  ];
  for (const bytes of versions) {
    assert.ok(inspectSourceCredentials(bytes).some(item => item.rule === 'credential.github-token' && item.line === 2));
  }
});

test('many matches on a single line remain bounded even though findings deduplicate by line', { timeout: 1000 }, () => {
  const bytes = Buffer.from(`${privateKey()} `.repeat(100_000));
  assert.deepEqual(inspectSourceCredentials(bytes), [{ rule: 'credential.private-key', line: 1 }]);
});

test('committed credential in code, docs or environment template fails without disclosing bytes', t => {
  for (const file of ['app.ts', 'docs/guide.md', '.env.example']) {
    const f = fixture(t, { [file]: `first\n${token()}\n` });
    const result = output({ root: f.root });
    assert.equal(result.status, 1);
    assert.match(result.text, /credential.github-token/u);
    assert.match(result.text, /:2$/u);
    assert.equal(result.text.includes(token()), false);
  }
});

test('credential in a file name is detected and path is redacted by ordinal', t => {
  const file = `docs/${token()}.txt`;
  const f = fixture(t, { [file]: 'No credential in the body\n' });
  const result = output({ root: f.root });
  assert.equal(result.status, 1);
  assert.match(result.text, /path.credential.github-token \[file 1: path redacted\]:0/u);
  assert.equal(result.text.includes(token()), false);
  assert.equal(result.text.includes(file), false);
});

test('Unicode, whitespace and control characters in paths are never interpreted as output lines', t => {
  const f = fixture(t, { 'docs/ação com espaço.md': 'Safe\n', 'docs/line\n\t\u001b\u202e.txt': token() });
  const result = output({ root: f.root });
  assert.equal(result.status, 1);
  assert.equal(result.lines.length, 2);
  assert.match(result.text, /line\\n\\t\\u001b\\u202e/u);
  assert.equal(result.text.includes('\u001b'), false);
  assert.equal(result.text.includes('\u202e'), false);
  const clean = fixture(t, { 'docs/ação com espaço.md': 'Safe\n' });
  assert.equal(verifySource({ root: clean.root }).files, 1);
});

test('invalid UTF-8 tree names and malformed metadata are refused without replacement normalization', () => {
  const prefix = Buffer.from(`100644 blob ${oid}\t`);
  const invalid = Buffer.concat([prefix, Buffer.from([255, 0])]);
  assert.throws(() => parseSourceTree(invalid), code('tree'));
  assert.throws(() => parseSourceTree(Buffer.from(`100644 blob ${oid}\t../escape\0`)), code('tree'));
  assert.throws(() => parseSourceTree(Buffer.from(`100644 blob ${oid}\tfile`)), code('tree'));
  assert.throws(() => parseSourceTree(Buffer.from(`100644 blob ${oid}\tx\0`.repeat(2))), code('tree'));
});

test('symlink is rejected without following a private external destination', t => {
  const f = fixture(t);
  const outside = mkdtempSync(path.join(realpathSync(tmpdir()), 'openmembers-source-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const target = path.join(outside, 'secret.txt');
  writeFileSync(target, token());
  symlinkSync(target, path.join(f.root, 'linked.txt'));
  f.commit();
  const result = output({ root: f.root });
  assert.equal(result.status, 1);
  assert.match(result.text, /path.non-regular/u);
  assert.equal(result.text.includes(token()), false);
  assert.equal(result.text.includes(outside), false);
  assert.equal(readFileSync(target, 'utf8'), token());
});

test('gitlink is refused rather than reading a nested repository', t => {
  const f = fixture(t);
  const child = fixture(t, { '.gitattributes': 'sample.txt filter=fixture\n', 'sample.txt': 'Original\n' });
  f.git('clone', '--no-hardlinks', child.root, 'nested-repository');
  f.git('add', 'nested-repository');
  f.git('commit', '--quiet', '-m', 'Fictitious gitlink');
  f.git('-C', 'nested-repository', 'config', 'filter.fixture.clean', 'touch filter-ran; cat');
  f.write('nested-repository/sample.txt', token());
  const result = output({ root: f.root, exec(command, args, options) {
    if (args.includes('diff')) {
      assert.ok(args.includes(args.includes('--cached') ? '--ignore-submodules=none' : '--ignore-submodules=all'));
    }
    return execFileSync(command, args, options);
  } });
  assert.equal(result.status, 1);
  assert.match(result.text, /path.non-regular/u);
  assert.equal(existsSync(path.join(f.root, 'nested-repository/filter-ran')), false);
  assert.equal(result.text.includes(token()), false);
});

test('a staged gitlink is still refused as a tracked index change before tree reads', t => {
  const f = fixture(t);
  const revision = f.git('rev-parse', 'HEAD').toString().trim();
  f.git('update-index', '--add', '--cacheinfo', `160000,${revision},nested-repository`);
  let reads = 0;
  const result = output({ root: f.root, exec(command, args, options) {
    if (args.includes('ls-tree')) reads++;
    return execFileSync(command, args, options);
  } });
  assert.equal(result.status, 1);
  assert.match(result.text, /Tracked staged or unstaged changes/u);
  assert.equal(reads, 0);
});

test('unstaged, staged and staged-secret with reverted working file all refuse before snapshot reads', t => {
  for (const state of ['unstaged', 'staged', 'reverted-worktree']) {
    const f = fixture(t, { 'file.txt': 'original\n' });
    f.write('file.txt', token());
    if (state !== 'unstaged') f.git('add', 'file.txt');
    if (state === 'reverted-worktree') f.write('file.txt', 'original\n');
    let reads = 0;
    const result = output({ root: f.root, exec(command, args, options) {
      if (args.includes('ls-tree') || args.includes('cat-file')) reads++;
      return execFileSync(command, args, options);
    } });
    assert.equal(result.status, 1);
    assert.match(result.text, /Tracked staged or unstaged changes/u);
    assert.equal(reads, 0);
    assert.equal(result.text.includes(token()), false);
  }
});

test('reading committed objects ignores a manipulated working file and refuses the final dirty state', t => {
  const f = fixture(t, { 'file.txt': 'original\n' });
  let modified = false;
  let readCommitted = false;
  const result = output({ root: f.root, exec(command, args, options) {
    if (args.includes('ls-tree') && !modified) {
      modified = true;
      f.write('file.txt', token());
    }
    const bytes = execFileSync(command, args, options);
    if (args.includes('--batch')) readCommitted = bytes.includes(Buffer.from('original\n')) && !bytes.includes(Buffer.from(token()));
    return bytes;
  } });
  assert.equal(readCommitted, true);
  assert.equal(result.status, 1);
  assert.match(result.text, /Tracked staged or unstaged changes/u);
  assert.equal(result.text.includes(token()), false);
});

test('HEAD change during object inspection refuses even when the new checkout is clean', t => {
  const f = fixture(t);
  const before = f.git('rev-parse', 'HEAD').toString().trim();
  let changed = false;
  let treeRevision;
  const result = output({ root: f.root, exec(command, args, options) {
    if (args.includes('ls-tree')) treeRevision = args.at(-1);
    const bytes = execFileSync(command, args, options);
    if (args.includes('--batch') && !changed) {
      changed = true;
      f.write('new.txt', 'new commit\n');
      f.commit('Fictitious concurrent commit');
    }
    return bytes;
  } });
  assert.equal(treeRevision, before);
  assert.equal(result.status, 1);
  assert.match(result.text, /HEAD changed during inspection/u);
});

test('per-blob and aggregate limits are inclusive and count repeated paths', () => {
  const sizes = new Map([[oid, SOURCE_LIMITS.blobBytes]]);
  const entry = { oid };
  assert.equal(validateSourceSizes(Array(10).fill(entry), sizes), SOURCE_LIMITS.totalBytes);
  assert.throws(() => validateSourceSizes(Array(11).fill(entry), sizes), code('total'));
  assert.throws(() => validateSourceSizes([entry], new Map([[oid, SOURCE_LIMITS.blobBytes + 1]])), code('blob'));
  assert.throws(() => validateSourceSizes([entry], new Map()), code('objects'));
  assert.throws(() => validateSourceSizes([entry], new Map([[oid, Number.NaN]])), code('objects'));
  assert.throws(() => validateSourceSizes(Array(SOURCE_LIMITS.files + 1).fill(entry), sizes), code('files'));
});

test('tree file count accepts the boundary and refuses one extra entry', () => {
  const tree = Array.from({ length: SOURCE_LIMITS.files }, (_, index) => `100644 blob ${oid}\tfile-${index}\0`).join('');
  assert.equal(parseSourceTree(Buffer.from(tree)).length, SOURCE_LIMITS.files);
  assert.throws(() => parseSourceTree(Buffer.from(`${tree}100644 blob ${oid}\toverflow\0`)), code('files'));
});

test('actual oversized committed blob fails before body reads', t => {
  const f = fixture(t, { 'large.txt': Buffer.alloc(SOURCE_LIMITS.blobBytes + 1, 65) });
  let bodies = 0;
  assert.throws(() => verifySource({ root: f.root, exec(command, args, options) {
    if (args.includes('--batch')) bodies++;
    return execFileSync(command, args, options);
  } }), code('blob'));
  assert.equal(bodies, 0);
});

test('Git errors, malformed objects and CLI argument errors never reveal captured output', t => {
  const f = fixture(t);
  for (const phase of ['rev-parse', 'cat-file']) {
    const result = output({ root: f.root, exec(command, args, options) {
      if (args.includes(phase)) throw Object.assign(new Error(token()), { status: 128, stdout: token(), stderr: token() });
      return execFileSync(command, args, options);
    } });
    assert.equal(result.status, 1);
    assert.match(result.text, /Git inspection failed/u);
    assert.equal(result.text.includes(token()), false);
  }
  const malformed = output({ root: f.root, exec(command, args, options) {
    if (args.includes('--batch')) return Buffer.from(token());
    return execFileSync(command, args, options);
  } });
  assert.equal(malformed.status, 1);
  assert.match(malformed.text, /object metadata or blob output is invalid/u);
  assert.equal(malformed.text.includes(token()), false);
  const argumentsResult = output({ root: f.root, args: [token()] });
  assert.equal(argumentsResult.status, 1);
  assert.equal(argumentsResult.text.includes(token()), false);
});

test('Git environment selection cannot inherit another repository, index or object store', () => {
  const env = sourceGitEnvironment({
    PATH: '/fixture/bin', GIT_DIR: '/other/.git', GIT_WORK_TREE: '/other',
    GIT_INDEX_FILE: '/other/index', GIT_OBJECT_DIRECTORY: '/other/objects',
    GIT_ALTERNATE_OBJECT_DIRECTORIES: '/other/alternate', GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'unwanted-command',
  });
  assert.equal(env.PATH, '/fixture/bin');
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0']) {
    assert.equal(env[key], undefined);
  }
  assert.equal(env.GIT_NO_REPLACE_OBJECTS, '1');
  assert.equal(env.GIT_NO_LAZY_FETCH, '1');
  assert.equal(env.GIT_OPTIONAL_LOCKS, '0');
});

test('configured clean and process filters are refused before they can execute', t => {
  for (const filter of ['clean', 'process']) {
    const f = fixture(t, { '.gitattributes': 'sample.txt filter=fixture\n', 'sample.txt': 'Original\n' });
    const marker = path.join(f.root, 'filter-ran');
    f.git('config', `filter.fixture.${filter}`, 'touch filter-ran; cat');
    f.write('sample.txt', 'Changed\n');
    let diffs = 0;
    const result = output({ root: f.root, exec(command, args, options) {
      if (args.includes('diff')) diffs++;
      return execFileSync(command, args, options);
    } });
    assert.equal(result.status, 1);
    assert.match(result.text, /clean or process filters/u);
    assert.equal(diffs, 0);
    assert.equal(existsSync(marker), false);
  }
});

test('partial or promisor repositories refuse before fetching missing objects from a local remote', t => {
  const f = fixture(t, { 'sample.txt': 'Neutral fixture\n' });
  const base = mkdtempSync(path.join(realpathSync(tmpdir()), 'openmembers-source-promisor-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const remote = path.join(base, 'remote.git');
  f.git('clone', '--bare', f.root, remote);
  const blob = f.git('rev-parse', 'HEAD:sample.txt').toString().trim();
  const marker = path.join(base, 'upload-pack-ran');
  const upload = path.join(base, 'upload-pack.sh');
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
  writeFileSync(upload, `#!/bin/sh\nprintf 'ran\\n' >> ${quote(marker)}\nexec git-upload-pack "$@"\n`, { mode: 0o700 });
  f.git('config', 'remote.origin.url', pathToFileURL(remote).href);
  f.git('config', 'remote.origin.promisor', 'true');
  f.git('config', 'remote.origin.partialclonefilter', 'blob:none');
  f.git('config', 'remote.origin.uploadpack', `/bin/sh ${quote(upload)}`);
  f.git('config', 'extensions.partialClone', 'origin');
  renameSync(path.join(f.root, '.git/objects', blob.slice(0, 2), blob.slice(2)), path.join(base, 'preserved-blob'));
  let objectReads = 0;
  const result = output({ root: f.root, exec(command, args, options) {
    if (args.includes('rev-parse') || args.includes('cat-file')) objectReads++;
    assert.ok(args.includes('--no-lazy-fetch'));
    assert.equal(options.env.GIT_NO_LAZY_FETCH, '1');
    return execFileSync(command, args, options);
  } });
  assert.equal(result.status, 1);
  assert.match(result.text, /Partial or promisor clone configuration is unsupported/u);
  assert.equal(objectReads, 0);
  assert.equal(existsSync(marker), false);
});

test('every Git call disables lazy fetching explicitly and unsupported Git fails closed', t => {
  const f = fixture(t);
  let commands = 0;
  assert.equal(verifySource({ root: f.root, exec(command, args, options) {
    commands++;
    assert.ok(args.includes('--no-lazy-fetch'));
    assert.equal(options.env.GIT_NO_LAZY_FETCH, '1');
    return execFileSync(command, args, options);
  } }).files, 1);
  assert.ok(commands > 5);
  const unsupported = output({ root: f.root, exec() {
    throw Object.assign(new Error('Unsupported option'), { status: 129 });
  } });
  assert.equal(unsupported.status, 1);
  assert.match(unsupported.text, /Git inspection failed/u);
});
