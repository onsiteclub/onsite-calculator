// api/_lib/logger.ts
// Logger para serverless functions - self-contained dentro de /api

type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  module: string;
  action: string;
  message?: string;
  context?: Record<string, unknown>;
  duration_ms?: number;
  success?: boolean;
  user_id?: string;
  ip?: string;
}

function formatLog(level: LogLevel, entry: LogEntry): string {
  const data = {
    timestamp: new Date().toISOString(),
    level,
    ...entry,
    // Truncate sensitive data
    user_id: entry.user_id ? `${entry.user_id.substring(0, 8)}...` : undefined,
    ip: entry.ip ? `${entry.ip.substring(0, 10)}...` : undefined,
  };
  return JSON.stringify(data);
}

export function log(entry: LogEntry): void {
  const level = entry.success === false ? 'error' : 'info';
  const prefix = `[${entry.module}]`;
  const msg = entry.message || entry.action;

  if (level === 'error') {
    console.error(prefix, msg, formatLog(level, entry));
  } else {
    console.log(prefix, msg, formatLog(level, entry));
  }
}

export function error(module: string, action: string, message: string, context?: Record<string, unknown>): void {
  log({
    module,
    action,
    message,
    context,
    success: false,
  });
}

export function info(module: string, action: string, message?: string, context?: Record<string, unknown>): void {
  log({
    module,
    action,
    message,
    context,
    success: true,
  });
}

// Helper para extrair IP do request
export function getClientIP(headers: Record<string, string | string[] | undefined>): string {
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0].trim();
  }
  return 'unknown';
}
