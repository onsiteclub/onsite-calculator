// src/lib/logger.ts
// Sistema de logging estruturado para OnSite Calculator
// Logs locais (console) + persistentes (Supabase)

import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { supabase } from './supabase';

// Tipos
type LogLevel = 'info' | 'warn' | 'error';
type LogModule = 'Voice' | 'Auth' | 'Subscription' | 'Calculator' | 'API' | 'Sync' | 'DeepLink' | 'Checkout' | 'History';

interface LogEntry {
  level: LogLevel;
  module: LogModule;
  action: string;
  message?: string;
  context?: Record<string, unknown>;
  duration_ms?: number;
  success?: boolean;
}

interface DeviceInfo {
  platform: string;
  model?: string;
  osVersion?: string;
  appVersion?: string;
  isNative: boolean;
}

// Versão do app (atualizar a cada release)
const APP_VERSION = '4.1.0';

// Cache de device info
let deviceInfoCache: DeviceInfo | null = null;

async function getDeviceInfo(): Promise<DeviceInfo> {
  if (deviceInfoCache) return deviceInfoCache;

  try {
    if (Capacitor.isNativePlatform()) {
      const info = await Device.getInfo();
      deviceInfoCache = {
        platform: info.platform,
        model: info.model,
        osVersion: info.osVersion,
        appVersion: APP_VERSION,
        isNative: true,
      };
    } else {
      deviceInfoCache = {
        platform: 'web',
        appVersion: APP_VERSION,
        isNative: false,
      };
    }
  } catch {
    deviceInfoCache = { platform: 'unknown', isNative: false };
  }

  return deviceInfoCache;
}

// Fila de logs para envio em batch
let logQueue: LogEntry[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;
let isFlushing = false;

// Flush logs para Supabase
async function flushLogs(): Promise<void> {
  if (logQueue.length === 0 || !supabase || isFlushing) return;

  isFlushing = true;
  const logsToSend = [...logQueue];
  logQueue = [];

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const deviceInfo = await getDeviceInfo();

    const entries = logsToSend.map(log => ({
      user_id: user?.id || null,
      level: log.level,
      module: log.module,
      action: log.action,
      message: log.message || null,
      context: log.context || {},
      device_info: deviceInfo,
      duration_ms: log.duration_ms || null,
      success: log.success ?? null,
      app_name: 'calculator',
    }));

    const { error } = await supabase.from('app_logs').insert(entries);

    if (error) {
      console.error('[Logger] Failed to flush logs:', error.message);
      // Re-adiciona logs que falharam (limite de 100)
      logQueue = [...logsToSend.slice(-50), ...logQueue].slice(-100);
    }
  } catch (err) {
    console.error('[Logger] Flush exception:', err);
    // Re-adiciona logs que falharam
    logQueue = [...logsToSend.slice(-50), ...logQueue].slice(-100);
  } finally {
    isFlushing = false;
  }
}

// Agenda flush com debounce
function scheduleFlush(): void {
  if (flushTimeout) clearTimeout(flushTimeout);
  flushTimeout = setTimeout(flushLogs, 5000); // 5 segundos
}

// Função principal de logging
export function log(entry: LogEntry): void {
  const prefix = `[${entry.module}]`;
  const msg = entry.message || entry.action;
  // Serializa contexto para string legível no console
  const ctx = entry.context ? JSON.stringify(entry.context) : '';

  // Console log (sempre - para debug local)
  switch (entry.level) {
    case 'error':
      console.error(prefix, msg, ctx);
      break;
    case 'warn':
      console.warn(prefix, msg, ctx);
      break;
    default:
      console.log(prefix, msg, ctx);
  }

  // Adiciona à fila para Supabase (apenas erros e eventos com success definido)
  if (entry.level === 'error' || entry.success !== undefined) {
    logQueue.push(entry);
    scheduleFlush();
  }
}

// Helpers tipados por módulo
export const logger = {
  voice: {
    start: () => log({ level: 'info', module: 'Voice', action: 'recording_start' }),
    stop: () => log({ level: 'info', module: 'Voice', action: 'recording_stop' }),
    apiCall: (duration: number, success: boolean, context?: Record<string, unknown>) =>
      log({
        level: success ? 'info' : 'error',
        module: 'Voice',
        action: 'api_interpret',
        duration_ms: duration,
        success,
        context,
      }),
    error: (message: string, context?: Record<string, unknown>) =>
      log({ level: 'error', module: 'Voice', action: 'error', message, context }),
  },

  auth: {
    signIn: (success: boolean, context?: Record<string, unknown>) =>
      log({ level: success ? 'info' : 'warn', module: 'Auth', action: 'sign_in', success, context }),
    signUp: (success: boolean, context?: Record<string, unknown>) =>
      log({ level: success ? 'info' : 'warn', module: 'Auth', action: 'sign_up', success, context }),
    signOut: () => log({ level: 'info', module: 'Auth', action: 'sign_out', success: true }),
    sessionLoad: (success: boolean) =>
      log({ level: 'info', module: 'Auth', action: 'session_load', success }),
    error: (message: string, context?: Record<string, unknown>) =>
      log({ level: 'error', module: 'Auth', action: 'error', message, context }),
  },

  subscription: {
    check: (hasAccess: boolean, fromCache: boolean) =>
      log({
        level: 'info',
        module: 'Subscription',
        action: 'check_access',
        success: hasAccess,
        context: { fromCache },
      }),
    error: (message: string, context?: Record<string, unknown>) =>
      log({ level: 'error', module: 'Subscription', action: 'error', message, context }),
  },

  calculator: {
    compute: (success: boolean, context?: Record<string, unknown>) =>
      log({
        level: success ? 'info' : 'warn',
        module: 'Calculator',
        action: 'compute',
        success,
        context,
      }),
    error: (message: string, expression?: string) =>
      log({
        level: 'error',
        module: 'Calculator',
        action: 'parse_error',
        message,
        context: { expression },
      }),
  },

  sync: {
    offline: () => log({ level: 'warn', module: 'Sync', action: 'went_offline', success: false }),
    online: () => log({ level: 'info', module: 'Sync', action: 'went_online', success: true }),
    supabaseError: (operation: string, error: unknown) =>
      log({
        level: 'error',
        module: 'Sync',
        action: operation,
        message: String(error),
        context: { error },
      }),
  },

  deepLink: {
    received: (url: string) =>
      log({ level: 'info', module: 'DeepLink', action: 'url_received', context: { url } }),
    authCallback: (success: boolean, context?: Record<string, unknown>) =>
      log({ level: success ? 'info' : 'error', module: 'DeepLink', action: 'auth_callback', success, context }),
    checkoutCallback: (success: boolean, context?: Record<string, unknown>) =>
      log({ level: success ? 'info' : 'error', module: 'DeepLink', action: 'checkout_callback', success, context }),
    error: (message: string, context?: Record<string, unknown>) =>
      log({ level: 'error', module: 'DeepLink', action: 'error', message, context }),
  },

  checkout: {
    start: () => log({ level: 'info', module: 'Checkout', action: 'flow_start' }),
    tokenRequest: (success: boolean, context?: Record<string, unknown>) =>
      log({ level: success ? 'info' : 'error', module: 'Checkout', action: 'token_request', success, context }),
    redirect: (url: string) =>
      log({ level: 'info', module: 'Checkout', action: 'redirect', context: { url } }),
    complete: (success: boolean, context?: Record<string, unknown>) =>
      log({ level: success ? 'info' : 'error', module: 'Checkout', action: 'complete', success, context }),
    verifyAttempt: (attempt: number, hasAccess: boolean) =>
      log({ level: 'info', module: 'Checkout', action: 'verify_attempt', context: { attempt, hasAccess } }),
    verified: (success: boolean, context?: Record<string, unknown>) =>
      log({ level: success ? 'info' : 'warn', module: 'Checkout', action: 'verified', success, context }),
    alreadySubscribed: () =>
      log({ level: 'info', module: 'Checkout', action: 'already_subscribed', success: true }),
    error: (message: string, context?: Record<string, unknown>) =>
      log({ level: 'error', module: 'Checkout', action: 'error', message, context }),
  },

  history: {
    load: (success: boolean, count?: number) =>
      log({ level: success ? 'info' : 'warn', module: 'History', action: 'load', success, context: { count } }),
    save: (success: boolean, context?: Record<string, unknown>) =>
      log({ level: success ? 'info' : 'warn', module: 'History', action: 'save', success, context }),
    clear: (success: boolean) =>
      log({ level: success ? 'info' : 'warn', module: 'History', action: 'clear', success }),
    error: (message: string, context?: Record<string, unknown>) =>
      log({ level: 'error', module: 'History', action: 'error', message, context }),
  },

  consent: {
    prompted: (consentType: string) =>
      log({ level: 'info', module: 'Auth', action: 'consent_prompted', context: { consentType } }),
    granted: (consentType: string, granted: boolean) =>
      log({ level: 'info', module: 'Auth', action: 'consent_granted', success: granted, context: { consentType, granted } }),
    error: (message: string, context?: Record<string, unknown>) =>
      log({ level: 'error', module: 'Auth', action: 'consent_error', message, context }),
  },
};

// Força flush antes de fechar o app
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushLogs();
  });
  window.addEventListener('pagehide', () => {
    flushLogs();
  });
}

// Exporta função de flush manual (útil para testes)
export { flushLogs };
