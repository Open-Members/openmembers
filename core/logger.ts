// Minimal structured logger. Zero deps.
//
// JSON lines in production (parseable by Loki/Datadog/CloudWatch), pretty
// coloured output in development. One entry per call — never multi-line,
// never bare interpolation so logs stay searchable.
//
// Usage:
//   import { logger } from '@/core/logger';
//   logger.info('ticket.created', { ticketId, userId });
//   logger.error('brevo.failed', { err: err.message, status });
//
// This utility is opt-in for NEW code. Existing `console.log` calls stay
// put — a wholesale migration is a separate task. If you're writing a
// new feature, prefer logger over console.

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogFields = Record<string, unknown>;

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const minLevel: LogLevel = (() => {
  const raw = (process.env.LOG_LEVEL ?? '').toLowerCase() as LogLevel;
  return raw in LEVELS ? raw : process.env.NODE_ENV === 'production' ? 'info' : 'debug';
})();

const isProd = process.env.NODE_ENV === 'production';

// ANSI colours for dev only. Safe no-op when piped to a file.
const CLR = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
} as const;

function safeSerialise(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

function serialiseFields(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined;
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) out[k] = safeSerialise(v);
  return out;
}

function emit(level: LogLevel, event: string, fields?: LogFields): void {
  if (LEVELS[level] < LEVELS[minLevel]) return;

  const ts = new Date().toISOString();
  const extras = serialiseFields(fields);

  if (isProd) {
    const record = { ts, level, event, ...extras };
    // One line, stable ordering, no pretty-print — cheap to tail + parse.
    process.stdout.write(JSON.stringify(record) + '\n');
    return;
  }

  // Dev: coloured, human-friendly. Extras dumped only when present.
  const head = `${CLR.dim}${ts}${CLR.reset} ${CLR[level]}${level.toUpperCase().padEnd(5)}${CLR.reset} ${event}`;
  if (extras && Object.keys(extras).length > 0) {
    process.stdout.write(`${head} ${JSON.stringify(extras)}\n`);
  } else {
    process.stdout.write(head + '\n');
  }
}

export const logger = {
  debug: (event: string, fields?: LogFields) => emit('debug', event, fields),
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};

export type { LogLevel, LogFields };
