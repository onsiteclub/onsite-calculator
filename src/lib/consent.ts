// src/lib/consent.ts
// Verificação de consentimento do usuário
// Necessário para coleta de dados de voz (voice_training)

import { supabase, isSupabaseEnabled } from './supabase';

export type ConsentType =
  | 'voice_training'
  | 'data_analytics'
  | 'marketing'
  | 'terms_of_service'
  | 'privacy_policy';

interface ConsentRecord {
  id: string;
  user_id: string;
  consent_type: ConsentType;
  granted: boolean;
  granted_at: string | null;
  revoked_at: string | null;
  document_version: string | null;
}

/**
 * Verifica se o usuário tem consentimento ativo para um tipo específico
 * Usado principalmente para verificar voice_training antes de salvar voice_logs
 */
export async function hasConsent(
  userId: string,
  consentType: ConsentType
): Promise<boolean> {
  if (!isSupabaseEnabled() || !supabase) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('consents')
      .select('granted')
      .eq('user_id', userId)
      .eq('consent_type', consentType)
      .eq('granted', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.warn('[Consent] Error checking consent:', error.message);
      return false;
    }

    return data && data.length > 0;
  } catch (err) {
    console.error('[Consent] Exception checking consent:', err);
    return false;
  }
}

/**
 * Verifica se pode coletar dados de voz do usuário
 * Conforme definido no [LOCKED] VERIFICAÇÃO DE CONSENTIMENTO
 */
export async function canCollectVoice(userId: string): Promise<boolean> {
  return hasConsent(userId, 'voice_training');
}

/**
 * Registra ou atualiza consentimento do usuário
 */
export async function setConsent(
  userId: string,
  consentType: ConsentType,
  granted: boolean,
  options?: {
    documentVersion?: string;
    ipAddress?: string;
    userAgent?: string;
    appVersion?: string;
  }
): Promise<boolean> {
  if (!isSupabaseEnabled() || !supabase) {
    return false;
  }

  try {
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('consents')
      .upsert({
        user_id: userId,
        consent_type: consentType,
        granted,
        granted_at: granted ? now : null,
        revoked_at: granted ? null : now,
        document_version: options?.documentVersion,
        ip_address: options?.ipAddress,
        user_agent: options?.userAgent,
        app_version: options?.appVersion,
        updated_at: now,
      }, {
        onConflict: 'user_id,consent_type'
      });

    if (error) {
      console.error('[Consent] Error setting consent:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Consent] Exception setting consent:', err);
    return false;
  }
}

/**
 * Obtém todos os consentimentos de um usuário
 */
export async function getUserConsents(
  userId: string
): Promise<ConsentRecord[] | null> {
  if (!isSupabaseEnabled() || !supabase) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('consents')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error('[Consent] Error fetching consents:', error.message);
      return null;
    }

    return data as ConsentRecord[];
  } catch (err) {
    console.error('[Consent] Exception fetching consents:', err);
    return null;
  }
}
