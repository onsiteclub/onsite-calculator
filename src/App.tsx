// src/App.tsx
// App principal com sistema de autenticação completo

import { useState, useCallback } from 'react';
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

  // Redireciona para checkout via código curto (evita truncamento de URL no APK)
  const handleUpgradeClick = useCallback(async () => {
    if (!supabase || !user) return;

    const openUrl = (url: string) => {
      // _system abre no browser padrão do sistema (Chrome/Samsung)
      window.open(url, Capacitor.isNativePlatform() ? '_system' : '_blank');
    };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        logger.checkout.error('No session token');
        openUrl(`${CHECKOUT_URL}?prefilled_email=${encodeURIComponent(user.email || '')}`);
        return;
      }

      // Gera código curto via API
      const response = await fetch(`${API_BASE_URL}/api/checkout-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ app: 'calculator' }),
      });

      if (!response.ok) {
        logger.checkout.error('Failed to generate code', { status: response.status });
        openUrl(`${CHECKOUT_URL}?prefilled_email=${encodeURIComponent(user.email || '')}`);
        return;
      }

      const { code } = await response.json();

      // Abre URL limpa (sem query params) - o servidor faz 302 redirect
      const checkoutUrl = `https://onsite-auth.vercel.app/r/${code}`;
      console.log('[Checkout] Opening:', checkoutUrl);
      logger.checkout.tokenRequest(true, { code });
      openUrl(checkoutUrl);

    } catch (err) {
      logger.checkout.error('Checkout redirect failed', { error: String(err) });
      openUrl(`${CHECKOUT_URL}?prefilled_email=${encodeURIComponent(user.email || '')}`);
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
