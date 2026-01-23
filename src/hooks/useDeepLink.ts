// src/hooks/useDeepLink.ts
// Hook para gerenciar Deep Links do Capacitor

import { useEffect, useRef } from 'react';
import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

interface UseDeepLinkProps {
  onAuthCallback?: (accessToken: string, refreshToken: string) => void;
  onCheckoutReturn?: () => void;
}

export function useDeepLink({ onAuthCallback, onCheckoutReturn }: UseDeepLinkProps = {}) {
  // Usa refs para evitar re-registrar o listener quando os callbacks mudam
  const authCallbackRef = useRef(onAuthCallback);
  const checkoutCallbackRef = useRef(onCheckoutReturn);

  // Atualiza as refs quando os callbacks mudam
  useEffect(() => {
    authCallbackRef.current = onAuthCallback;
    checkoutCallbackRef.current = onCheckoutReturn;
  }, [onAuthCallback, onCheckoutReturn]);

  useEffect(() => {
    // Só registra listeners em plataforma nativa
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const handleAppUrlOpen = async (event: URLOpenListenerEvent) => {
      const url = event.url;
      console.log('[DeepLink] URL received:', url);
      logger.deepLink.received(url);

      // Verifica se é um callback de autenticação ou checkout
      if (url.includes('auth-callback') || url.includes('onsitecalculator://')) {
        console.log('[DeepLink] Processing callback URL');
        try {
          const urlObj = new URL(url);
          const accessToken = urlObj.searchParams.get('access_token');
          const refreshToken = urlObj.searchParams.get('refresh_token');

          console.log('[DeepLink] Tokens found:', { hasAccessToken: !!accessToken, hasRefreshToken: !!refreshToken });

          // Se tem tokens, é login OAuth
          if (accessToken && refreshToken) {
            // Se o Supabase está disponível, seta a sessão
            if (supabase) {
              const { error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

              logger.deepLink.authCallback(!error, error ? { error: error.message } : undefined);
            }

            // Chama callback customizado se fornecido (via ref)
            if (authCallbackRef.current) {
              authCallbackRef.current(accessToken, refreshToken);
            }
          } else {
            // Sem tokens = retorno do checkout (pagamento concluído)
            console.log('[DeepLink] No tokens - treating as checkout return');
            console.log('[DeepLink] checkoutCallbackRef.current exists:', !!checkoutCallbackRef.current);
            logger.deepLink.checkoutCallback(true);
            if (checkoutCallbackRef.current) {
              console.log('[DeepLink] Calling onCheckoutReturn callback');
              checkoutCallbackRef.current();
            } else {
              console.log('[DeepLink] WARNING: No checkout callback registered!');
            }
          }
        } catch (error) {
          console.error('[DeepLink] Error processing URL:', error);
          logger.deepLink.error('Error parsing URL', { error: String(error), url });
        }
      } else {
        console.log('[DeepLink] URL does not match expected patterns, ignoring');
      }
    };

    // Registra o listener
    let cleanupPromise: Promise<void> | null = null;

    App.addListener('appUrlOpen', handleAppUrlOpen).then((listener) => {
      cleanupPromise = Promise.resolve(listener.remove());
    });

    // Cleanup
    return () => {
      if (cleanupPromise) {
        cleanupPromise.catch((err) => logger.deepLink.error('Cleanup error', { error: String(err) }));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Executa apenas uma vez
}
