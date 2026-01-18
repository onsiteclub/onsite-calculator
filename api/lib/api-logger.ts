// api/lib/api-logger.ts
// Logger server-side para API - envia para app_logs no Supabase

import { createClient } from '@supabase/supabase-js';

type LogLevel = 'info' | 'warn' | 'error';
type LogModule = 'Voice' | 'API';

interface LogEntry {
  level: LogLevel;
  module: LogModule;
  action: string;
  message?: string;
  context?: Record<string, unknown>;
  duration_ms?: number;
  success?: boolean;
  user_id?: string;
  ip?: string;
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Envia log para app_logs no Supabase
 */
export async function logToSupabase(entry: LogEntry): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  try {
    await supabase.from('app_logs').insert({
      user_id: entry.user_id || null,
      level: entry.level,
      module: entry.module,
      action: entry.action,
      message: entry.message || null,
      context: entry.context || {},
      app_name: 'calculator',
      duration_ms: entry.duration_ms || null,
      success: entry.success ?? null,
      ip: entry.ip || null,
      device_info: { platform: 'api', isNative: false },
    });
  } catch (err) {
    console.error('[APILogger] Failed to log:', err);
  }
}

/**
 * Logger helpers para Voice API
 */
export const apiLogger = {
  voice: {
    request: (userId?: string, ip?: string) =>
      logToSupabase({
        level: 'info',
        module: 'Voice',
        action: 'api_request',
        user_id: userId,
        ip,
      }),

    success: (durationMs: number, context: Record<string, unknown>, userId?: string, ip?: string) =>
      logToSupabase({
        level: 'info',
        module: 'Voice',
        action: 'api_interpret',
        duration_ms: durationMs,
        success: true,
        context,
        user_id: userId,
        ip,
      }),

    error: (message: string, durationMs?: number, context?: Record<string, unknown>, userId?: string, ip?: string) =>
      logToSupabase({
        level: 'error',
        module: 'Voice',
        action: 'api_interpret',
        message,
        duration_ms: durationMs,
        success: false,
        context,
        user_id: userId,
        ip,
      }),

    rateLimited: (ip: string) =>
      logToSupabase({
        level: 'warn',
        module: 'Voice',
        action: 'rate_limited',
        ip,
        success: false,
      }),
  },
};
