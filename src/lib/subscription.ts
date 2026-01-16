// src/lib/subscription.ts
// Gerenciamento de assinaturas e verificação de acesso premium

import { supabase } from './supabase';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const SUBSCRIPTION_CACHE_KEY = 'calculator_subscription_status';
const CACHE_DURATION = 1000 * 60 * 5; // 5 minutos
const AUTH_HUB_API = 'https://auth.onsiteclub.ca/api/subscription/status?app=calculator';

// Cache em memória como fallback
let memoryCache: CachedSubscription | null = null;

// Flag para evitar múltiplas chamadas simultâneas
let isChecking = false;

interface CachedSubscription {
  hasAccess: boolean;
  checkedAt: number;
}

interface SubscriptionData {
  id: string;
  user_id: string;
  app: string;
  status: 'active' | 'canceled' | 'past_due' | 'inactive' | 'trialing';
  current_period_end?: string;
  cancel_at_period_end?: boolean;
}

/**
 * Lê cache (tenta Preferences, fallback para memória)
 */
async function getCache(): Promise<CachedSubscription | null> {
  try {
    // Tentar memória primeiro (mais rápido)
    if (memoryCache) {
      const isExpired = Date.now() - memoryCache.checkedAt > CACHE_DURATION;
      if (!isExpired) {
        return memoryCache;
      }
    }

    // Se estiver na web ou memória expirou, tentar Preferences
    if (Capacitor.isNativePlatform()) {
      const { value } = await Preferences.get({ key: SUBSCRIPTION_CACHE_KEY });
      if (value) {
        const cached: CachedSubscription = JSON.parse(value);
        memoryCache = cached; // Atualiza memória
        return cached;
      }
    }
  } catch (err) {
    console.warn('[Subscription] Error reading cache:', err);
  }
  return null;
}

/**
 * Salva cache (tenta Preferences e memória)
 */
async function setCache(data: CachedSubscription): Promise<void> {
  try {
    // Sempre salva em memória
    memoryCache = data;

    // Salva em Preferences se estiver em plataforma nativa
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({
        key: SUBSCRIPTION_CACHE_KEY,
        value: JSON.stringify(data),
      });
    }
  } catch (err) {
    console.warn('[Subscription] Error saving cache:', err);
  }
}

/**
 * Verifica status via API do Auth Hub
 * Usa credentials: 'include' para enviar cookies de autenticação
 */
async function checkViaAuthHub(): Promise<boolean> {
  try {
    console.log('[Subscription] Checking via Auth Hub API...');

    const response = await fetch(AUTH_HUB_API, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn('[Subscription] Auth Hub API returned:', response.status);
      return false;
    }

    const data = await response.json();
    console.log('[Subscription] Auth Hub response:', data);

    return data.hasAccess === true;
  } catch (err) {
    console.warn('[Subscription] Auth Hub API error:', err);
    return false;
  }
}

/**
 * Verifica se o usuário tem assinatura ativa no Supabase
 * Consulta diretamente a tabela 'subscriptions'
 */
export async function hasActiveSubscription(): Promise<boolean> {
  if (!supabase) {
    console.warn('[Subscription] Supabase not available');
    return false;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.log('[Subscription] No user logged in');
      return false;
    }

    // Usa .maybeSingle() ao invés de .single() para não dar erro quando não encontra
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('app', 'calculator')
      .maybeSingle();

    // PGRST116 = "No rows found" - isso é esperado para usuários sem assinatura
    if (error && error.code !== 'PGRST116') {
      console.error('[Subscription] Error fetching subscription:', error);
      return false;
    }

    if (!data) {
      console.log('[Subscription] No subscription found for user');
      return false;
    }

    const subscription = data as SubscriptionData;

    // Verifica se está ativo ou em trial
    const isActive = subscription.status === 'active' || subscription.status === 'trialing';

    // Verifica se não expirou
    const notExpired = !subscription.current_period_end ||
                       new Date(subscription.current_period_end) > new Date();

    const hasAccess = isActive && notExpired;

    console.log('[Subscription] Status:', subscription.status, 'Has access:', hasAccess);

    return hasAccess;
  } catch (err) {
    console.error('[Subscription] Exception checking subscription:', err);
    return false;
  }
}

/**
 * Verifica acesso premium com cache local
 * Tenta Auth Hub API primeiro, depois Supabase como fallback
 */
export async function checkPremiumAccess(): Promise<boolean> {
  // Evita chamadas simultâneas
  if (isChecking) {
    console.log('[Subscription] Already checking, returning cached or false');
    return memoryCache?.hasAccess ?? false;
  }

  try {
    isChecking = true;

    // Tentar cache primeiro
    const cached = await getCache();

    if (cached) {
      const isExpired = Date.now() - cached.checkedAt > CACHE_DURATION;

      if (!isExpired) {
        console.log('[Subscription] Using cached status:', cached.hasAccess);
        return cached.hasAccess;
      } else {
        console.log('[Subscription] Cache expired, checking server');
      }
    }

    // Tentar Auth Hub API primeiro
    let hasAccess = await checkViaAuthHub();

    // Se Auth Hub falhar, tentar Supabase como fallback
    if (!hasAccess) {
      console.log('[Subscription] Auth Hub returned false, trying Supabase fallback');
      hasAccess = await hasActiveSubscription();
    }

    // Salvar no cache
    await setCache({
      hasAccess,
      checkedAt: Date.now(),
    });

    return hasAccess;
  } catch (err) {
    console.error('[Subscription] Error checking premium access:', err);
    return false;
  } finally {
    isChecking = false;
  }
}

/**
 * Limpa o cache de assinatura
 * Deve ser chamado quando voltar do checkout ou quando fazer refresh manual
 */
export async function clearSubscriptionCache(): Promise<void> {
  try {
    // Limpa memória
    memoryCache = null;

    // Limpa Preferences se estiver em plataforma nativa
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key: SUBSCRIPTION_CACHE_KEY });
    }

    console.log('[Subscription] Cache cleared');
  } catch (err) {
    console.error('[Subscription] Error clearing cache:', err);
  }
}

/**
 * Verifica o status da assinatura e atualiza o cache
 * Útil para forçar uma verificação após retornar do checkout
 */
export async function refreshSubscriptionStatus(): Promise<boolean> {
  console.log('[Subscription] Forcing subscription refresh');
  await clearSubscriptionCache();
  return checkPremiumAccess();
}
