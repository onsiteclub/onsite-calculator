// src/hooks/useCalculator.ts
// Hook principal para lógica da calculadora

import { useState, useCallback } from 'react';
import { calculate, type CalculationResult } from '../lib/calculator';
import { saveCalculation, type InputMethod } from '../lib/calculations';

interface SaveOptions {
  userId?: string;
  inputMethod?: InputMethod;
  voiceLogId?: string;
  tradeContext?: string;
  appVersion?: string;
}

interface UseCalculatorReturn {
  expression: string;
  setExpression: (value: string) => void;
  setExpressionAndCompute: (value: string, saveOptions?: SaveOptions) => CalculationResult | null;
  displayValue: string;
  lastResult: CalculationResult | null;
  justCalculated: boolean;
  lastCalculationId: string | null;

  // Ações
  compute: (saveOptions?: SaveOptions) => CalculationResult | null;
  clear: () => void;
  backspace: () => void;
  appendKey: (key: string) => void;
  appendFraction: (fraction: string) => void;
  appendOperator: (operator: string) => void;
}

/**
 * Hook que encapsula toda a lógica da calculadora
 * Gerencia expressão, resultado, e memória
 */
export function useCalculator(): UseCalculatorReturn {
  const [expression, setExpression] = useState('');
  const [displayValue, setDisplayValue] = useState('0');
  const [lastResult, setLastResult] = useState<CalculationResult | null>(null);
  const [justCalculated, setJustCalculated] = useState(false);
  const [lastCalculationId, setLastCalculationId] = useState<string | null>(null);

  // Calcular resultado
  const compute = useCallback((saveOptions?: SaveOptions) => {
    const result = calculate(expression);
    if (result) {
      setDisplayValue(result.resultFeetInches);
      setLastResult(result);
      setJustCalculated(true);

      // Salvar cálculo no banco (async, não bloqueia)
      if (saveOptions?.userId) {
        saveCalculation(result, saveOptions).then(id => {
          if (id) setLastCalculationId(id);
        });
      }
    }
    return result;
  }, [expression]);

  // Limpar tudo
  const clear = useCallback(() => {
    setExpression('');
    setDisplayValue('0');
    setLastResult(null);
    setJustCalculated(false);
  }, []);

  // Apagar último caractere
  const backspace = useCallback(() => {
    setExpression(prev => prev.slice(0, -1));
    setJustCalculated(false);
  }, []);

  // Adicionar tecla (número ou ponto)
  const appendKey = useCallback((key: string) => {
    if (justCalculated) {
      // Começar nova expressão após resultado
      setExpression(key);
      setJustCalculated(false);
    } else {
      setExpression(prev => prev + key);
    }
  }, [justCalculated]);

  // Adicionar fração
  const appendFraction = useCallback((fraction: string) => {
    const value = fraction.replace('"', '');
    
    if (justCalculated && lastResult) {
      // Após resultado, começar nova expressão
      setExpression(value);
      setJustCalculated(false);
    } else if (expression && /\d$/.test(expression)) {
      // Adiciona com espaço se já houver número (mixed number: "5 1/2")
      setExpression(prev => prev + ' ' + value);
    } else {
      setExpression(prev => prev + value);
    }
  }, [justCalculated, lastResult, expression]);

  // Adicionar operador (com memória automática)
  const appendOperator = useCallback((operator: string) => {
    const op = ` ${operator} `;
    
    if (justCalculated && lastResult) {
      // MEMÓRIA: Usa resultado anterior como primeiro elemento
      const previousResult = lastResult.isInchMode 
        ? lastResult.resultFeetInches.replace('"', '')
        : lastResult.resultFeetInches;
      
      setExpression(previousResult + op);
      setJustCalculated(false);
    } else {
      setExpression(prev => prev + op);
    }
  }, [justCalculated, lastResult]);

  // Atualizar expressão diretamente (para voice input)
  const handleSetExpression = useCallback((value: string) => {
    setExpression(value);
    setJustCalculated(false);
  }, []);

  // Seta expressão e calcula imediatamente (para voice input)
  const setExpressionAndCompute = useCallback((value: string, saveOptions?: SaveOptions) => {
    setExpression(value);
    const result = calculate(value);
    if (result) {
      setDisplayValue(result.resultFeetInches);
      setLastResult(result);
      setJustCalculated(true);

      // Salvar cálculo no banco (async, não bloqueia)
      if (saveOptions?.userId) {
        saveCalculation(result, saveOptions).then(id => {
          if (id) setLastCalculationId(id);
        });
      }
    }
    return result;
  }, []);

  return {
    expression,
    setExpression: handleSetExpression,
    setExpressionAndCompute,
    displayValue,
    lastResult,
    justCalculated,
    lastCalculationId,
    compute,
    clear,
    backspace,
    appendKey,
    appendFraction,
    appendOperator,
  };
}
