// src/App.tsx
// App principal com sistema de autenticação completo

import { useState, useCallback } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import Calculator from './components/Calculator';
import AuthScreen from './components/AuthScreen';
import { useAuth, useDeepLink } from './hooks';
import { supabase } from './lib/supabase';
import { logger } from './lib/logger';
import type { VoiceState } from './types/calculator';
import './styles/App.css';

// URL do checkout
const CHECKOUT_URL = 'https://onsite-auth.vercel.app/checkout/calculator';
const API_BASE_URL = Capacitor.isNativePlatform()
  ? 'https://calculator.onsiteclub.ca'
  : '';

export default function App() {
  const {
    user,
    profile,
    loading: authLoading,
    hasVoiceAccess,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  } = useAuth();

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');

  // Redireciona direto para o checkout (sem popup)
  const handleUpgradeClick = useCallback(async () => {
    if (!supabase || !user) return;

    try {
      // 1. Pega o access token da sessão atual
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        logger.checkout.error('No session token');
        return;
      }

      // 2. Gera JWT token seguro via API
      const tokenResponse = await fetch(`${API_BASE_URL}/api/checkout-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ app: 'calculator' }),
      });

      if (!tokenResponse.ok) {
        logger.checkout.tokenRequest(false, { status: tokenResponse.status });
        // Fallback: abre checkout sem token
        const fallbackUrl = `${CHECKOUT_URL}?prefilled_email=${encodeURIComponent(user.email || '')}`;
        if (Capacitor.isNativePlatform()) {
          await Browser.open({ url: fallbackUrl, presentationStyle: 'popover' });
        } else {
          window.open(fallbackUrl, '_blank');
        }
        return;
      }

      const { token } = await tokenResponse.json();

      // 3. Monta URL com token JWT
      const redirectUri = 'onsitecalculator://auth-callback';
      const url = new URL(CHECKOUT_URL);
      url.searchParams.set('token', token);
      if (user.email) {
        url.searchParams.set('prefilled_email', user.email);
      }
      url.searchParams.set('redirect', redirectUri);

      // 4. Abre o checkout
      if (Capacitor.isNativePlatform()) {
        await Browser.open({ url: url.toString(), presentationStyle: 'popover' });
      } else {
        window.open(url.toString(), '_blank');
      }
    } catch (err) {
      logger.checkout.error('Error opening checkout', { error: String(err) });
    }
  }, [user]);

  // Configura Deep Linking para receber callback do checkout
  useDeepLink({
    onAuthCallback: async () => {
      // Callback de OAuth login
      await refreshProfile();
    },
    onCheckoutReturn: async () => {
      // Callback de retorno do checkout (pagamento concluído)
      logger.checkout.complete(true, { action: 'refreshing_subscription' });
      // Aguarda um pouco para o banco processar
      setTimeout(async () => {
        await refreshProfile();
      }, 1500);
    },
  });

  // Renderiza loading enquanto verifica autenticação
  if (authLoading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>Carregando...</p>
      </div>
    );
  }

  // Se não está autenticado, mostra tela de login
  if (!user) {
    return (
      <AuthScreen
        onSignIn={signIn}
        onSignUp={signUp}
        loading={authLoading}
      />
    );
  }

  // Usuário autenticado: mostra calculadora
  return (
    <Calculator
      voiceState={voiceState}
      setVoiceState={setVoiceState}
      hasVoiceAccess={hasVoiceAccess}
      onVoiceUpgradeClick={handleUpgradeClick}
      onSignOut={signOut}
      userName={profile?.nome || profile?.email || user?.email}
      userId={user?.id}
    />
  );
}