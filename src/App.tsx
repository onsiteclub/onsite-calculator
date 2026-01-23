// src/App.tsx
// App principal com sistema de autenticação e trial de 20 usos gratuitos

import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import Calculator from './components/Calculator';
import SignupModal from './components/SignupModal';
import { useAuth, useDeepLink, useVoiceUsage } from './hooks';
import { supabase } from './lib/supabase';
import { logger } from './lib/logger';
import type { VoiceState } from './types/calculator';
import './styles/App.css';

// URL do checkout
const CHECKOUT_URL = 'https://onsite-auth.vercel.app/checkout/calculator';
const API_BASE_URL = Capacitor.isNativePlatform()
  ? 'https://onsite-calculator.vercel.app'
  : '';

export default function App() {
  const {
    user,
    profile,
    loading: authLoading,
    hasVoiceAccess,
    signOut,
    refreshProfile,
  } = useAuth();

  const {
    remainingUses,
    hasReachedLimit,
    incrementUsage,
    resetUsage,
  } = useVoiceUsage();

  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [showSignupModal, setShowSignupModal] = useState(false);

  // Função para abrir URL (browser externo no mobile)
  const openUrl = useCallback((url: string) => {
    window.open(url, Capacitor.isNativePlatform() ? '_system' : '_blank');
  }, []);

  // Redireciona para checkout via código curto (evita truncamento de URL no APK)
  const redirectToCheckout = useCallback(async (userId: string, email: string) => {
    if (!supabase) {
      // Fallback direto
      const fallbackUrl = `${CHECKOUT_URL}?user_id=${encodeURIComponent(userId)}&prefilled_email=${encodeURIComponent(email)}`;
      openUrl(fallbackUrl);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        logger.checkout.error('No session token');
        const fallbackUrl = `${CHECKOUT_URL}?user_id=${encodeURIComponent(userId)}&prefilled_email=${encodeURIComponent(email)}`;
        openUrl(fallbackUrl);
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
        const fallbackUrl = `${CHECKOUT_URL}?user_id=${encodeURIComponent(userId)}&prefilled_email=${encodeURIComponent(email)}`;
        openUrl(fallbackUrl);
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
      const fallbackUrl = `${CHECKOUT_URL}?user_id=${encodeURIComponent(userId)}&prefilled_email=${encodeURIComponent(email)}`;
      openUrl(fallbackUrl);
    }
  }, [openUrl]);

  // Handler quando usuário clica no botão de upgrade (já logado)
  const handleUpgradeClick = useCallback(async () => {
    // Se não está logado, mostra modal de signup
    if (!user) {
      setShowSignupModal(true);
      return;
    }

    if (!supabase) return;

    // Verifica se já tem acesso (pode ter pago mas estado não atualizou)
    const hasAccess = await refreshProfile();
    if (hasAccess) {
      logger.checkout.alreadySubscribed();
      return;
    }

    // Redireciona para checkout
    await redirectToCheckout(user.id, user.email || '');
  }, [user, refreshProfile, redirectToCheckout]);

  // Handler quando signup/login é bem-sucedido no modal
  const handleSignupSuccess = useCallback(async (userId: string, email: string) => {
    setShowSignupModal(false);

    // Aguarda um momento para a sessão ser estabelecida
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verifica se já tem acesso
    const hasAccess = await refreshProfile();
    if (hasAccess) {
      logger.checkout.alreadySubscribed();
      // Reseta o contador se já tem acesso
      await resetUsage();
      return;
    }

    // Redireciona para checkout
    await redirectToCheckout(userId, email);
  }, [refreshProfile, redirectToCheckout, resetUsage]);

  // Handler quando uso de voz é feito (para incrementar contador)
  const handleVoiceUsed = useCallback(async () => {
    // Só incrementa se não está logado ou não tem acesso
    if (!user || !hasVoiceAccess) {
      await incrementUsage();
    }
  }, [user, hasVoiceAccess, incrementUsage]);

  // Verifica se deve bloquear voz (limite atingido e não logado)
  const shouldBlockVoice = useCallback(() => {
    // Se está logado e tem acesso, não bloqueia
    if (user && hasVoiceAccess) return false;

    // Se atingiu o limite, bloqueia
    return hasReachedLimit;
  }, [user, hasVoiceAccess, hasReachedLimit]);

  // Handler para quando tenta usar voz mas está bloqueado
  const handleVoiceBlocked = useCallback(() => {
    setShowSignupModal(true);
  }, []);

  // Configura Deep Linking para receber callback do checkout
  useDeepLink({
    onAuthCallback: async () => {
      // Callback de OAuth login
      await refreshProfile();
    },
    onCheckoutReturn: async () => {
      // Callback de retorno do checkout (pagamento concluído)
      console.log('[App] onCheckoutReturn CALLED! Starting subscription check...');
      logger.checkout.complete(true, { action: 'refreshing_subscription' });

      // Retry com backoff: 1s, 2s, 4s (total ~7s de espera máxima)
      const delays = [1000, 2000, 4000];

      for (let i = 0; i < delays.length; i++) {
        console.log(`[App] Checkout verify attempt ${i + 1}, waiting ${delays[i]}ms...`);
        await new Promise(resolve => setTimeout(resolve, delays[i]));

        const hasAccess = await refreshProfile();
        console.log(`[App] Checkout verify attempt ${i + 1} result: hasAccess=${hasAccess}`);
        logger.checkout.verifyAttempt(i + 1, hasAccess);

        if (hasAccess) {
          console.log('[App] Subscription verified! Voice unlocked.');
          logger.checkout.verified(true, { attempt: i + 1 });
          // Reseta contador após confirmar subscription
          await resetUsage();
          return;
        }
      }

      // Ainda sem acesso após todas tentativas
      console.log('[App] Failed to verify subscription after all attempts');
      logger.checkout.verified(false, { attempts: delays.length });
      alert('Payment processed! If Voice is not unlocked, close and reopen the app.');
    },
  });

  // Renderiza loading enquanto verifica autenticação
  if (authLoading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  // Determina se tem acesso à voz
  // - Se tem subscription ativa: acesso ilimitado
  // - Se não tem subscription: trial mode (20 usos gratuitos)
  const effectiveVoiceAccess = hasVoiceAccess || !hasReachedLimit;

  return (
    <div className="app">
      <Calculator
        voiceState={voiceState}
        setVoiceState={setVoiceState}
        hasVoiceAccess={effectiveVoiceAccess}
        onVoiceUpgradeClick={shouldBlockVoice() ? handleVoiceBlocked : handleUpgradeClick}
        onVoiceUsed={handleVoiceUsed}
        onSignOut={user ? signOut : () => {}}
        onSignIn={() => setShowSignupModal(true)}
        userName={profile?.nome || profile?.email || user?.email}
        userId={user?.id}
        remainingUses={hasVoiceAccess ? undefined : remainingUses}
        isTrialMode={!hasVoiceAccess}
      />

      {/* Modal de Signup/Login */}
      {showSignupModal && (
        <SignupModal
          onSuccess={handleSignupSuccess}
          onClose={() => setShowSignupModal(false)}
        />
      )}
    </div>
  );
}
