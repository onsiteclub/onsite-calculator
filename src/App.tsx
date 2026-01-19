// src/App.tsx
// App principal com sistema de autenticação completo

import { useState, useCallback } from 'react';
import Calculator from './components/Calculator';
import AuthScreen from './components/AuthScreen';
import VoiceUpgradePopup from './components/VoiceUpgradePopup';
import { useAuth, useDeepLink } from './hooks';
import { logger } from './lib/logger';
import type { VoiceState } from './types/calculator';
import './styles/App.css';

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
  const [showUpgradePopup, setShowUpgradePopup] = useState(false);

  // Mostra popup de upgrade quando usuário sem assinatura clica no botão de voz
  const handleUpgradeClick = useCallback(() => {
    setShowUpgradePopup(true);
  }, []);

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
    <>
      <Calculator
        voiceState={voiceState}
        setVoiceState={setVoiceState}
        hasVoiceAccess={hasVoiceAccess}
        onVoiceUpgradeClick={handleUpgradeClick}
        onSignOut={signOut}
        userName={profile?.nome || profile?.email || user?.email}
        userId={user?.id}
      />
      {showUpgradePopup && (
        <VoiceUpgradePopup
          onClose={() => setShowUpgradePopup(false)}
          userEmail={user?.email}
          userId={user?.id}
        />
      )}
    </>
  );
}
