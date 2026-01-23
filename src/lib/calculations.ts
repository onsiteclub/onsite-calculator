// src/lib/calculations.ts
// Persistência de cálculos no Supabase
// Schema definido por Blueprint (Blue)

import { supabase, isSupabaseEnabled } from './supabase';
import type { CalculationResult } from '../types/calculator';

// Tipos do schema calculations
type CalcType = 'length' | 'area' | 'volume' | 'material' | 'conversion' | 'custom';
export type InputMethod = 'keypad' | 'voice' | 'camera';

interface CalculationRecord {
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
function detectCalcType(_expression: string, isInchMode: boolean): CalcType {
  // Se tem medidas de construção
  if (isInchMode) {
    return 'length';
  }

  // TODO: Detectar conversões quando implementado
  // if (_expression.includes('to') || _expression.includes('→')) {
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
    console.log('[Calculations] Supabase not enabled, skipping save');
    return null;
  }

  // Não salvar se não tiver usuário (modo anônimo)
  if (!options.userId) {
    console.log('[Calculations] No userId provided, skipping save');
    return null;
  }

  console.log('[Calculations] Saving calculation for user:', options.userId);

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
      .from('app_calculator_calculations')
      .insert(record)
      .select('id')
      .single();

    if (error) {
      console.error('[Calculations] Error saving:', error.message, error);
      return null;
    }

    console.log('[Calculations] Saved successfully:', data?.id);
    return data?.id || null;
  } catch (err) {
    console.error('[Calculations] Exception saving:', err);
    return null;
  }
}

