// src/hooks/useVoiceUsage.ts
// Hook para gerenciar contador de usos gratuitos de voz (20 usos antes de pedir login)

import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const STORAGE_KEY = 'voice_usage_count';
const MAX_FREE_USES = 20;

interface UseVoiceUsageReturn {
  usageCount: number;
  remainingUses: number;
  hasReachedLimit: boolean;
  incrementUsage: () => Promise<void>;
  resetUsage: () => Promise<void>;
}

export function useVoiceUsage(): UseVoiceUsageReturn {
  const [usageCount, setUsageCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Carrega o contador do storage
  useEffect(() => {
    const loadUsage = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const { value } = await Preferences.get({ key: STORAGE_KEY });
          if (value) {
            setUsageCount(parseInt(value, 10) || 0);
          }
        } else {
          const value = localStorage.getItem(STORAGE_KEY);
          if (value) {
            setUsageCount(parseInt(value, 10) || 0);
          }
        }
      } catch (err) {
        console.warn('[VoiceUsage] Error loading usage count:', err);
      } finally {
        setLoaded(true);
      }
    };

    loadUsage();
  }, []);

  // Salva o contador no storage
  const saveUsage = useCallback(async (count: number) => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Preferences.set({ key: STORAGE_KEY, value: count.toString() });
      } else {
        localStorage.setItem(STORAGE_KEY, count.toString());
      }
    } catch (err) {
      console.warn('[VoiceUsage] Error saving usage count:', err);
    }
  }, []);

  // Incrementa o contador de uso
  const incrementUsage = useCallback(async () => {
    setUsageCount(prev => {
      const newCount = prev + 1;
      // Salva assincronamente (fire and forget)
      saveUsage(newCount);
      console.log(`[VoiceUsage] Usage incremented: ${newCount}/${MAX_FREE_USES}`);
      return newCount;
    });
  }, [saveUsage]);

  // Reseta o contador (usado após login bem-sucedido com subscription)
  const resetUsage = useCallback(async () => {
    setUsageCount(0);
    await saveUsage(0);
    console.log('[VoiceUsage] Usage reset');
  }, [saveUsage]);

  return {
    usageCount,
    remainingUses: Math.max(0, MAX_FREE_USES - usageCount),
    hasReachedLimit: loaded && usageCount >= MAX_FREE_USES,
    incrementUsage,
    resetUsage,
  };
}
