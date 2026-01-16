// src/lib/subscription.ts
// Gerenciamento de assinaturas e verificação de acesso premium

import { supabase } from './supabase';
import { Preferences } from '@capacitor/preferences';

const SUBSCRIPTION_CACHE_KEY = 'calculator_subscription_status';
const CACHE_DURATION = 1000 * 60 * 5; // 5 minutos

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

    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('app', 'calculator')
      .single();

    if (error) {
      console.error('[Subscription] Error fetching subscription:', error);
      return false;
    }

    if (!data) {
      console.log('[Subscription] No subscription found');
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
 * Evita verificações repetidas no Supabase
 */
export async function checkPremiumAccess(): Promise<boolean> {
  try {
    // Tentar cache primeiro
    const { value: cached } = await Preferences.get({ key: SUBSCRIPTION_CACHE_KEY });

    if (cached) {
      const data: CachedSubscription = JSON.parse(cached);
      const isExpired = Date.now() - data.checkedAt > CACHE_DURATION;

      if (!isExpired) {
        console.log('[Subscription] Using cached status:', data.hasAccess);
        return data.hasAccess;
      } else {
        console.log('[Subscription] Cache expired, checking server');
      }
    }

    // Cache expirado ou não existe, verificar no servidor
    const hasAccess = await hasActiveSubscription();

    // Salvar no cache
    await Preferences.set({
      key: SUBSCRIPTION_CACHE_KEY,
      value: JSON.stringify({
        hasAccess,
        checkedAt: Date.now(),
      } as CachedSubscription),
    });

    return hasAccess;
  } catch (err) {
    console.error('[Subscription] Error checking premium access:', err);
    // Em caso de erro, verificar diretamente sem cache
    return hasActiveSubscription();
  }
}

/**
 * Limpa o cache de assinatura
 * Deve ser chamado quando voltar do checkout ou quando fazer refresh manual
 */
export async function clearSubscriptionCache(): Promise<void> {
  try {
    await Preferences.remove({ key: SUBSCRIPTION_CACHE_KEY });
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
