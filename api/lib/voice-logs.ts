// api/lib/voice-logs.ts
// Persistência de voice_logs no Supabase (server-side)
// Schema definido por Blueprint (Blue)
// IMPORTANTE: Só salvar se usuário tiver consentimento voice_training

import { createClient } from '@supabase/supabase-js';

// Supabase com service role (server-side)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabaseAdmin() {
  if (!supabaseUrl || !supabaseServiceKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

export interface VoiceLogRecord {
  id?: string;
  user_id?: string;
  app_name?: string;
  feature_context?: string;
  session_id?: string;
  audio_duration_ms?: number;
  audio_format?: string;
  transcription_raw?: string;
  transcription_normalized?: string;
  transcription_engine?: string;
  language_detected?: string;
  intent_detected?: string;
  intent_fulfilled?: boolean;
  entities?: Record<string, unknown>;
  informal_terms?: string[];
  was_successful: boolean;
  error_type?: string;
  error_message?: string;
  device_model?: string;
  os?: string;
  app_version?: string;
  client_timestamp?: string;
}

/**
 * Verifica se usuário tem consentimento para coleta de voz
 * Conforme definido no [LOCKED] VERIFICAÇÃO DE CONSENTIMENTO
 */
export async function canCollectVoice(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) {
    return false;
  }

  try {
    const { data, error } = await supabase
      .from('consents')
      .select('granted')
      .eq('user_id', userId)
      .eq('consent_type', 'voice_training')
      .eq('granted', true)
      .limit(1);

    if (error) {
      console.warn('[VoiceLogs] Error checking consent:', error.message);
      return false;
    }

    return data && data.length > 0;
  } catch (err) {
    console.error('[VoiceLogs] Exception checking consent:', err);
    return false;
  }
}

/**
 * Salva um voice_log no banco de dados
 * SOMENTE chama se canCollectVoice() retornar true
 */
export async function saveVoiceLog(record: VoiceLogRecord): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  // Não salvar sem user_id (modo anônimo)
  if (!record.user_id) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('voice_logs')
      .insert({
        ...record,
        app_name: record.app_name || 'calculator',
        transcription_engine: record.transcription_engine || 'whisper-1',
      })
      .select('id')
      .single();

    if (error) {
      console.warn('[VoiceLogs] Error saving:', error.message);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('[VoiceLogs] Exception saving:', err);
    return null;
  }
}

/**
 * Extrai entidades de uma expressão parseada
 * Campos de OURO para ML
 */
export function extractEntities(expression: string): Record<string, unknown> {
  const entities: Record<string, unknown> = {
    numbers: [] as string[],
    units: [] as string[],
    operators: [] as string[],
  };

  // Extrair números (inteiros, decimais, frações)
  const numberMatches = expression.match(/\d+(?:\s+\d+\/\d+|\.\d+|\/\d+)?/g);
  if (numberMatches) {
    (entities.numbers as string[]).push(...numberMatches);
  }

  // Extrair unidades
  if (expression.includes("'")) {
    (entities.units as string[]).push('feet');
  }
  if (expression.includes('"')) {
    (entities.units as string[]).push('inches');
  }

  // Extrair operadores
  const operatorMatches = expression.match(/[+\-*/]/g);
  if (operatorMatches) {
    (entities.operators as string[]).push(...operatorMatches);
  }

  return entities;
}

/**
 * Detecta termos informais na transcrição
 * OURO MÁXIMO para treinamento de modelo
 */
export function detectInformalTerms(transcription: string): string[] {
  const informal: string[] = [];
  const lowerText = transcription.toLowerCase();

  // Termos informais em português
  const ptTerms = [
    'e meio', 'e um quarto', 'e três quartos',
    'metade', 'dobro', 'triplo',
    'um pouquinho', 'mais ou menos',
    'dois dedos', 'um palmo',
  ];

  // Termos informais em inglês
  const enTerms = [
    'and a half', 'and a quarter', 'three quarters',
    'half of', 'double', 'triple',
    'a bit', 'about', 'roughly',
    'a couple inches', 'a hair',
  ];

  for (const term of [...ptTerms, ...enTerms]) {
    if (lowerText.includes(term)) {
      informal.push(term);
    }
  }

  return informal;
}

/**
 * Detecta idioma da transcrição (simplificado)
 */
export function detectLanguage(transcription: string): string {
  const lower = transcription.toLowerCase();

  // Palavras características de cada idioma
  const ptWords = ['mais', 'menos', 'vezes', 'pé', 'polegada', 'meio', 'quarto'];
  const esWords = ['más', 'menos', 'por', 'pie', 'pulgada', 'medio', 'cuarto'];
  const frWords = ['plus', 'moins', 'fois', 'pied', 'pouce', 'demi', 'quart'];

  let ptScore = 0, enScore = 0, esScore = 0, frScore = 0;

  for (const w of ptWords) if (lower.includes(w)) ptScore++;
  for (const w of esWords) if (lower.includes(w)) esScore++;
  for (const w of frWords) if (lower.includes(w)) frScore++;

  // Inglês é fallback (palavras como 'feet', 'inch', 'half' são comuns)
  if (lower.includes('feet') || lower.includes('inch') || lower.includes('half')) {
    enScore += 2;
  }

  const max = Math.max(ptScore, enScore, esScore, frScore);
  if (max === 0) return 'en'; // default
  if (ptScore === max) return 'pt';
  if (esScore === max) return 'es';
  if (frScore === max) return 'fr';
  return 'en';
}
