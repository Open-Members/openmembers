import { execFileSync } from 'node:child_process';
import { devNull } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const SOURCE_LIMITS = Object.freeze({
  files: 20_000,
  blobBytes: 5 * 1024 * 1024,
  totalBytes: 50 * 1024 * 1024,
});
const metadataBytes = 8 * 1024 * 1024;
const maxFindings = 100;
const objectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const environmentTemplates = new Set(['.env.example', 'deploy/application.env.example']);
const localSegments = new Set([
  '.private', '.work', '.git', '.codex', '.agents', '.claude', '.wrangler',
  '.cursor', '.gemini', '.windsurf', '.vercel', '.open-next', '.temp', '.branches',
]);
const localFiles = new Set([
  '.mcp.json', '.cursorrules', '.windsurfrules', 'openmembers.config.json', 'wrangler.local.jsonc',
  'agents.md', 'claude.md', 'gemini.md', 'copilot-instructions.md',
]);
const internalDocumentSegments = new Set([
  'planning', 'plans', 'planos', 'planejamento', 'handoffs', 'internal',
]);
const internalDocumentNames = new Set([
  'backlog-execucao.md', 'continuacao.md', 'public-source-preparation.md', 'relaunch-preparation.md',
]);
// Bound the editorial exclusions to Markdown names and complete name segments.
// Runtime helpers, fixtures and public operating guides remain distributable.
const internalDocumentMarker = /(?:^|[-_. ])(?:handoff|handoffs|plan|plans|plano|planos|planning|planejamento|roadmap|cronograma)(?:[-_. ]|$)/u;
const generatedSegments = new Set([
  'node_modules', '.next', '.openmembers-notices', 'coverage', 'playwright-report',
  'test-results', 'dist', 'out', 'tmp',
]);

const messages = Object.freeze({
  git: 'Git inspection failed; command output was withheld.',
  dirty: 'Tracked staged or unstaged changes exist. Commit them before verifying source.',
  changed: 'HEAD changed during inspection. Verify the final clean commit again.',
  filters: 'Git clean or process filters are configured; source verification refuses to execute them.',
  partial: 'Partial or promisor clone configuration is unsupported; use a complete local clone for offline verification.',
  tree: 'Git tree metadata is invalid or exceeds the metadata limit.',
  objects: 'Git object metadata or blob output is invalid.',
  files: 'Source exceeds the limit of 20,000 files.',
  blob: 'Source exceeds the limit of 5 MiB per blob.',
  total: 'Source exceeds the limit of 50 MiB of file content.',
  findings: 'Source policy findings were detected; fix and commit before verifying again.',
  arguments: 'Use verify:source without arguments; only committed HEAD is supported.',
});

export class SourceVerificationError extends Error {
  constructor(code, findings = []) {
    super(messages[code] ?? messages.git);
    this.name = 'SourceVerificationError';
    this.code = code;
    this.findings = findings;
  }
}

// This is a deliberately finite signature check, not a universal secret detector.
// Token boundaries prevent matching a shorter valid-looking prefix of a longer value.
const credentialRules = [
  ['credential.private-key', /-----BEGIN (?:(?:RSA|EC|DSA|OPENSSH|ENCRYPTED) )?PRIVATE KEY-----/gu],
  ['credential.github-token', /(?<![A-Za-z0-9_])(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})(?![A-Za-z0-9_])/gu],
  ['credential.stripe-secret', /(?<![A-Za-z0-9_])(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,200}(?![A-Za-z0-9_])/gu],
  ['credential.supabase-secret', /(?<![A-Za-z0-9_-])sb_secret_[A-Za-z0-9_-]{20,200}(?![A-Za-z0-9_-])/gu],
];
const jwtPattern = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{8,2048}\.[A-Za-z0-9_-]{8,16384}\.[A-Za-z0-9_-]{8,2048}(?![A-Za-z0-9_.-])/gu;

function administrativeJwt(token) {
  try {
    const [header, payload] = token.split('.').slice(0, 2).map(segment => {
      const bytes = Buffer.from(segment, 'base64url');
      if (bytes.toString('base64url') !== segment) throw new Error();
      return JSON.parse(bytes.toString('utf8'));
    });
    return header && typeof header.alg === 'string' && payload
      && ['service_role', 'supabase_admin'].includes(payload.role);
  } catch { return false; }
}

export function inspectSourceCredentials(bytes) {
  const found = new Map();
  let matches = 0;
  function inspect(text) {
    function add(rule, index) {
      matches++;
      const line = text.slice(0, index).split('\n').length;
      found.set(`${rule}:${line}`, { rule, line });
    }
    for (const [rule, expression] of credentialRules) {
      expression.lastIndex = 0;
      for (const match of text.matchAll(expression)) {
        add(rule, match.index);
        if (matches >= maxFindings) return;
      }
    }
    jwtPattern.lastIndex = 0;
    for (const match of text.matchAll(jwtPattern)) {
      if (administrativeJwt(match[0])) add('credential.administrative-jwt', match.index);
      if (matches >= maxFindings) return;
    }
  }

  // Latin-1 retains ASCII signatures even in a non-text blob. UTF-16 is inspected
  // in both byte orders and alignments, with or without a BOM.
  inspect(bytes.toString('latin1'));
  if (bytes.includes(0) && matches < maxFindings) {
    for (const offset of [0, 1]) {
      const aligned = bytes.subarray(offset, offset + Math.floor((bytes.length - offset) / 2) * 2);
      inspect(aligned.toString('utf16le'));
      if (matches >= maxFindings) break;
      inspect(Buffer.from(aligned).swap16().toString('utf16le'));
      if (matches >= maxFindings) break;
    }
  }
  return [...found.values()];
}

export function sourcePathRule(file) {
  const segments = file.toLowerCase().split('/');
  const basename = segments.at(-1);
  if (segments.some(segment => localSegments.has(segment))
    || localFiles.has(basename)) return 'path.local-material';
  if (basename.endsWith('.md') && (internalDocumentNames.has(basename)
    || internalDocumentMarker.test(basename.slice(0, -3))
    || segments.slice(0, -1).some(segment => internalDocumentSegments.has(segment)))) return 'path.internal-document';
  if (!environmentTemplates.has(file)
    && (basename.startsWith('.env') || /\.env(?:\.|$)/u.test(basename))) return 'path.environment';
  if (/\.(?:pem|key|p12|pfx)$/iu.test(basename)) return 'path.key-container';
  if (segments.some(segment => generatedSegments.has(segment))
    || ['next-env.d.ts', '.ds_store'].includes(basename)
    || /\.(?:log|tsbuildinfo|swp|swo)$/u.test(basename)) return 'path.generated-material';
  return null;
}

function displayPath(file, ordinal) {
  if (inspectSourceCredentials(Buffer.from(file)).length) return `[file ${ordinal}: path redacted]`;
  return JSON.stringify(file).replace(/[\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/gu,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function parseSourceTree(output) {
  if (output.length > metadataBytes || (output.length && output.at(-1) !== 0)) {
    throw new SourceVerificationError('tree');
  }
  const entries = [];
  const paths = new Set();
  let decoded;
  try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(output); }
  catch { throw new SourceVerificationError('tree'); }
  for (const row of decoded.split('\0').slice(0, -1)) {
    const tab = row.indexOf('\t');
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]+)$/u.exec(row.slice(0, tab));
    const file = row.slice(tab + 1);
    if (tab < 0 || !match || !objectId.test(match[3]) || !file
      || file.startsWith('/') || file.split('/').some(part => !part || part === '.' || part === '..')
      || paths.has(file)) throw new SourceVerificationError('tree');
    paths.add(file);
    entries.push({ mode: match[1], type: match[2], oid: match[3], file, label: displayPath(file, entries.length + 1) });
    if (entries.length > SOURCE_LIMITS.files) throw new SourceVerificationError('files');
  }
  return entries;
}

export function validateSourceSizes(entries, sizes) {
  let totalBytes = 0;
  if (entries.length > SOURCE_LIMITS.files) throw new SourceVerificationError('files');
  for (const entry of entries) {
    const size = sizes.get(entry.oid);
    if (!Number.isSafeInteger(size) || size < 0) throw new SourceVerificationError('objects');
    if (size > SOURCE_LIMITS.blobBytes) throw new SourceVerificationError('blob');
    totalBytes += size; // Repeated blobs still occupy multiple paths in the source tree.
    if (totalBytes > SOURCE_LIMITS.totalBytes) throw new SourceVerificationError('total');
  }
  return totalBytes;
}

export function sourceGitEnvironment(inherited = process.env) {
  return {
    ...Object.fromEntries(Object.entries(inherited).filter(([key]) => !key.startsWith('GIT_'))),
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: devNull, GIT_NO_REPLACE_OBJECTS: '1', GIT_NO_LAZY_FETCH: '1',
    GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C',
  };
}

export function verifySource({ root = process.cwd(), exec = execFileSync } = {}) {
  function git(args, { input, maxBuffer = metadataBytes, dirtyCheck = false, absentConfig = false } = {}) {
    try {
      return exec('git', [
        '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
        '-c', `core.hooksPath=${devNull}`, '--no-pager', '--no-lazy-fetch', ...args,
      ], {
        cwd: root, env: sourceGitEnvironment(), input, maxBuffer, timeout: 30_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      if (absentConfig && error.status === 1) return Buffer.alloc(0);
      if (dirtyCheck && error.status === 1) throw new SourceVerificationError('dirty');
      throw new SourceVerificationError('git');
    }
  }
  function head() {
    const value = git(['rev-parse', '--verify', 'HEAD^{commit}']).toString().trim();
    if (!objectId.test(value)) throw new SourceVerificationError('git');
    return value;
  }
  function clean() {
    // Unlike textconv/external diff, attribute-based clean/process filters are
    // also invoked by `git diff`. Refuse them before touching that boundary.
    if (git(['config', '--null', '--get-regexp', '^filter\\..*\\.(clean|process)$'], { absentConfig: true }).length) {
      throw new SourceVerificationError('filters');
    }
    // Keep these separate: a staged change can be hidden by reversing it only
    // in the working tree. A single `git diff HEAD` would miss that state.
    for (const staged of [[], ['--cached']]) {
      // Do not enter a submodule working tree. Staged gitlinks still make the
      // index dirty; committed gitlinks are rejected by the tree mode check.
      const submodules = staged.length ? 'none' : 'all';
      git(['diff', ...staged, '--quiet', '--no-ext-diff', '--no-textconv', `--ignore-submodules=${submodules}`, '--'], { dirtyCheck: true });
    }
  }
  // Missing objects in a promisor repository can trigger a network fetch even
  // through cat-file. Refuse that repository form before resolving HEAD, in
  // addition to disabling lazy fetch in the child environment.
  if (git(['config', '--null', '--get-regexp', '^(extensions\\.partialclone|remote\\..*\\.(promisor|partialclonefilter))$'], { absentConfig: true }).length) {
    throw new SourceVerificationError('partial');
  }
  const revision = head();
  clean();
  let result;
  let failure;
  try {
    const entries = parseSourceTree(git(['ls-tree', '-rz', '--full-tree', revision]));
    const findings = [];
    for (const entry of entries) {
      const rule = entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)
        ? 'path.non-regular' : sourcePathRule(entry.file);
      if (rule) findings.push({ rule, path: entry.label, line: 0 });
      for (const credential of inspectSourceCredentials(Buffer.from(entry.file))) {
        findings.push({ rule: `path.${credential.rule}`, path: entry.label, line: 0 });
      }
      if (findings.length >= maxFindings) break;
    }
    if (findings.length) throw new SourceVerificationError('findings', findings.slice(0, maxFindings));
    const oids = [...new Set(entries.map(entry => entry.oid))];
    const input = oids.length ? `${oids.join('\n')}\n` : '';
    const metadata = git(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], { input }).toString();
    const lines = metadata ? metadata.split('\n') : [];
    if (lines.length && lines.pop() !== '') throw new SourceVerificationError('objects');
    if (lines.length !== oids.length) throw new SourceVerificationError('objects');
    const sizes = new Map();
    for (const [index, line] of lines.entries()) {
      const match = /^([a-f0-9]+) blob (0|[1-9][0-9]*)$/u.exec(line);
      if (!match || match[1] !== oids[index]) throw new SourceVerificationError('objects');
      sizes.set(match[1], Number(match[2]));
    }
    const totalBytes = validateSourceSizes(entries, sizes);
    const blobs = git(['cat-file', '--batch'], {
      input, maxBuffer: SOURCE_LIMITS.totalBytes + metadataBytes,
    });
    const byOid = new Map();
    let offset = 0;
    for (const oid of oids) {
      const newline = blobs.indexOf(10, offset);
      if (newline < 0 || blobs.subarray(offset, newline).toString() !== `${oid} blob ${sizes.get(oid)}`) {
        throw new SourceVerificationError('objects');
      }
      const start = newline + 1;
      const end = start + sizes.get(oid);
      if (blobs[end] !== 10) throw new SourceVerificationError('objects');
      byOid.set(oid, blobs.subarray(start, end));
      offset = end + 1;
    }
    if (offset !== blobs.length) throw new SourceVerificationError('objects');
    for (const entry of entries) {
      for (const finding of inspectSourceCredentials(byOid.get(entry.oid))) {
        findings.push({ ...finding, path: entry.label });
      }
      if (findings.length >= maxFindings) break;
    }
    if (findings.length) throw new SourceVerificationError('findings', findings.slice(0, maxFindings));
    result = { revision, files: entries.length, totalBytes, scope: 'committed HEAD; untracked and ignored files excluded' };
  } catch (error) {
    failure = error instanceof SourceVerificationError ? error : new SourceVerificationError('git');
  }
  clean();
  if (head() !== revision) throw new SourceVerificationError('changed');
  if (failure) throw failure;
  return result;
}

export function runSourceVerification({ args = process.argv.slice(2), log = console.log, error = console.error, ...options } = {}) {
  try {
    if (args.length) throw new SourceVerificationError('arguments');
    const result = verifySource(options);
    log(`Verified source ${result.revision}: ${result.files} files, ${result.totalBytes} bytes. Scope: ${result.scope}. Known signatures and paths only; history and release artifacts require separate review.`);
    return 0;
  } catch (failure) {
    const safe = failure instanceof SourceVerificationError ? failure : new SourceVerificationError('git');
    error(safe.message);
    for (const finding of safe.findings) error(`${finding.rule} ${finding.path}:${finding.line}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = runSourceVerification();
}
