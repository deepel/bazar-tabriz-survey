const LEVELS = ['debug', 'info', 'warn', 'error'] as const;

function ts(): string {
  return new Date().toISOString();
}

function write(level: (typeof LEVELS)[number], event: string, details?: Record<string, unknown>): void {
  const line: Record<string, unknown> = {
    time: ts(),
    level,
    event
  };
  if (details) {
    for (const [k, v] of Object.entries(details)) {
      if (v !== undefined) line[k] = v;
    }
  }
  const out = JSON.stringify(line);
  if (level === 'error') {
    process.stderr.write(out + '\n');
  } else {
    process.stdout.write(out + '\n');
  }
}

export const logger = {
  debug: (event: string, details?: Record<string, unknown>) => write('debug', event, details),
  info: (event: string, details?: Record<string, unknown>) => write('info', event, details),
  warn: (event: string, details?: Record<string, unknown>) => write('warn', event, details),
  error: (event: string, details?: Record<string, unknown>) => write('error', event, details)
};