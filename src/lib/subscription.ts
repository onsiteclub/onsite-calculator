// src/lib/subscription.ts
// Gerenciamento de assinaturas e verificação de acesso premium

import { supabase } from './supabase';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { logger } from './logger';

const SUBSCRIPTION_CACHE_KEY = 'calculator_subscription_status';
const CACHE_DURATION = 1000 * 60 * 5; // 5 minutos

// Cache em memória como fallback
let memoryCache: CachedSubscription | null = null;

// Flag para evitar múltiplas chamadas simultâneas
let isChecking = false;

interface CachedSubscription {
  userId: string;
  hasAccess: boolean;
  checkedAt: number;
}

interface SubscriptionData {
  id: string;
  user_id: string;
  app_name: string;  // Nome da coluna no banco é app_name
  status: 'active' | 'canceled' | 'past_due' | 'inactive' | 'trialing';
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
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
 * Verifica se o usuário tem assinatura ativa no Supabase
 * Consulta diretamente a tabela 'billing_subscriptions'
 */
export async function hasActiveSubscription(): Promise<boolean> {
  if (!supabase) {
    console.log('[Subscription] No supabase client');
    return false;
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      console.log('[Subscription] No user logged in');
      return false;
    }

    console.log('[Subscription] Checking subscription for user:', user.id);

    // Busca subscription específica do calculator
    const { data, error } = await supabase
      .from('billing_subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('app_name', 'calculator')
      .maybeSingle();

    console.log('[Subscription] Query result:', { data, error: error?.message });

    // PGRST116 = "No rows found" - isso é esperado para usuários sem assinatura
    if (error && error.code !== 'PGRST116') {
      logger.subscription.error('Error fetching subscription', { error: error.message });
      return false;
    }

    if (!data) {
      return false;
    }

    const subscription = data as SubscriptionData;

    // Verifica se está ativo ou em trial
    const isActive = subscription.status === 'active' || subscription.status === 'trialing';

    // Verifica se não expirou
    const notExpired = !subscription.current_period_end ||
                       new Date(subscription.current_period_end) > new Date();

    const hasAccess = isActive && notExpired;

    return hasAccess;
  } catch (err) {
    logger.subscription.error('Exception checking subscription', { error: String(err) });
    return false;
  }
}

/**
 * Verifica acesso premium com cache local
 * Usa apenas Supabase como fonte de verdade (tabela billing_subscriptions)
 */
export async function checkPremiumAccess(): Promise<boolean> {
  if (!supabase) {
    return false;
  }

  // Pega usuário atual PRIMEIRO - necessário para validar cache
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return false;
  }

  // Evita chamadas simultâneas para o MESMO usuário
  if (isChecking) {
    // Só retorna cache se for do mesmo usuário
    if (memoryCache?.userId === user.id) {
      return memoryCache.hasAccess;
    }
    return false;
  }

  try {
    isChecking = true;

    // Tentar cache primeiro - MAS só se for do mesmo usuário
    const cached = await getCache();

    if (cached && cached.userId === user.id) {
      const isExpired = Date.now() - cached.checkedAt > CACHE_DURATION;

      if (!isExpired) {
        logger.subscription.check(cached.hasAccess, true);
        return cached.hasAccess;
      }
    }

    // Cache inválido ou expirado - verifica no Supabase
    const hasAccess = await hasActiveSubscription();

    // Salvar no cache COM userId
    await setCache({
      userId: user.id,
      hasAccess,
      checkedAt: Date.now(),
    });

    logger.subscription.check(hasAccess, false);
    return hasAccess;
  } catch (err) {
    logger.subscription.error('Error checking premium access', { error: String(err) });
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
  } catch (err) {
    logger.subscription.error('Error clearing cache', { error: String(err) });
  }
}

/**
 * Verifica o status da assinatura e atualiza o cache
 * Útil para forçar uma verificação após retornar do checkout
 */
export async function refreshSubscriptionStatus(): Promise<boolean> {
  await clearSubscriptionCache();
  return checkPremiumAccess();
}
