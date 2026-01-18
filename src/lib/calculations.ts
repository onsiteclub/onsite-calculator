// src/lib/calculations.ts
// Persistência de cálculos no Supabase
// Schema definido por Blueprint (Blue)

import { supabase, isSupabaseEnabled } from './supabase';
import type { CalculationResult } from '../types/calculator';

// Tipos do schema calculations
export type CalcType = 'length' | 'area' | 'volume' | 'material' | 'conversion' | 'custom';
export type InputMethod = 'keypad' | 'voice' | 'camera';

export interface CalculationRecord {
  id?: string;
  user_id?: string;
  calc_type: CalcType;
  calc_subtype?: string;
  input_expression: string;
  input_values?: Record<string, unknown>;
  result_value?: number;
  result_unit?: string;
  result_formatted?: string;
  input_method: InputMethod;
  voice_log_id?: string;
  template_id?: string;
  trade_context?: string;
  was_successful: boolean;
  was_saved?: boolean;
  was_shared?: boolean;
  device_id?: string;
  app_version?: string;
  created_at?: string;
}

/**
 * Detecta o tipo de cálculo baseado na expressão
 */
function detectCalcType(expression: string, isInchMode: boolean): CalcType {
  // Se tem medidas de construção
  if (isInchMode) {
    return 'length';
  }

  // Detectar conversões (futuro)
  // if (expression.includes('to') || expression.includes('→')) {
  //   return 'conversion';
  // }

  // Por enquanto, decimal puro é 'custom'
  return 'custom';
}

/**
 * Detecta o subtipo do cálculo
 */
function detectCalcSubtype(expression: string, isInchMode: boolean): string {
  if (isInchMode) {
    if (expression.includes("'") && expression.includes('"')) {
      return 'feet_inches';
    }
    if (expression.includes("'")) {
      return 'feet_only';
    }
    if (expression.includes('"') || expression.includes('/')) {
      return 'inches_fractions';
    }
    return 'mixed';
  }
  return 'decimal';
}

/**
 * Salva um cálculo no banco de dados
 * Chamado após cada compute() bem-sucedido
 */
export async function saveCalculation(
  result: CalculationResult,
  options: {
    userId?: string;
    inputMethod?: InputMethod;
    voiceLogId?: string;
    tradeContext?: string;
    appVersion?: string;
  } = {}
): Promise<string | null> {
  // Não salvar se Supabase não está disponível
  if (!isSupabaseEnabled() || !supabase) {
    return null;
  }

  // Não salvar se não tiver usuário (modo anônimo)
  if (!options.userId) {
    return null;
  }

  try {
    const record: CalculationRecord = {
      user_id: options.userId,
      calc_type: detectCalcType(result.expression, result.isInchMode),
      calc_subtype: detectCalcSubtype(result.expression, result.isInchMode),
      input_expression: result.expression,
      result_value: result.resultDecimal,
      result_unit: result.isInchMode ? 'inches' : 'decimal',
      result_formatted: result.isInchMode ? result.resultFeetInches : String(result.resultDecimal),
      input_method: options.inputMethod || 'keypad',
      voice_log_id: options.voiceLogId,
      trade_context: options.tradeContext,
      was_successful: true,
      app_version: options.appVersion,
    };

    const { data, error } = await supabase
      .from('calculations')
      .insert(record)
      .select('id')
      .single();

    if (error) {
      console.warn('[Calculations] Error saving:', error.message);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('[Calculations] Exception saving:', err);
    return null;
  }
}

/**
 * Salva um cálculo que falhou (para analytics de erros)
 */
export async function saveFailedCalculation(
  expression: string,
  options: {
    userId?: string;
    inputMethod?: InputMethod;
    errorMessage?: string;
    appVersion?: string;
  } = {}
): Promise<string | null> {
  if (!isSupabaseEnabled() || !supabase) {
    return null;
  }

  if (!options.userId) {
    return null;
  }

  try {
    const record: CalculationRecord = {
      user_id: options.userId,
      calc_type: 'custom',
      input_expression: expression,
      input_method: options.inputMethod || 'keypad',
      was_successful: false,
      app_version: options.appVersion,
    };

    const { data, error } = await supabase
      .from('calculations')
      .insert(record)
      .select('id')
      .single();

    if (error) {
      console.warn('[Calculations] Error saving failed calc:', error.message);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error('[Calculations] Exception saving failed calc:', err);
    return null;
  }
}

/**
 * Marca um cálculo como salvo nos favoritos
 */
export async function markCalculationSaved(calculationId: string): Promise<boolean> {
  if (!isSupabaseEnabled() || !supabase) {
    return false;
  }

  try {
    const { error } = await supabase
      .from('calculations')
      .update({ was_saved: true })
      .eq('id', calculationId);

    return !error;
  } catch {
    return false;
  }
}

/**
 * Marca um cálculo como compartilhado
 */
export async function markCalculationShared(calculationId: string): Promise<boolean> {
  if (!isSupabaseEnabled() || !supabase) {
    return false;
  }

  try {
    const { error } = await supabase
      .from('calculations')
      .update({ was_shared: true })
      .eq('id', calculationId);

    return !error;
  } catch {
    return false;
  }
}
