// src/App.tsx
// App principal com sistema de autenticação completo

import { useState } from 'react';
import Calculator from './components/Calculator';
import AuthScreen from './components/AuthScreen';
import VoiceUpgradePopup from './components/VoiceUpgradePopup';
import { useAuth, useDeepLink } from './hooks';
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
  const [showVoicePopup, setShowVoicePopup] = useState(false);

  // Configura Deep Linking para receber callback do checkout
  useDeepLink({
    onAuthCallback: async () => {
      // Callback de OAuth login
      await refreshProfile();
    },
    onCheckoutReturn: async () => {
      // Callback de retorno do checkout (pagamento concluído)
      console.log('[App] Checkout return - refreshing subscription');
      // Aguarda um pouco para o banco processar
      setTimeout(async () => {
        await refreshProfile();
        setShowVoicePopup(false);
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
      {showVoicePopup && (
        <VoiceUpgradePopup
          onClose={() => setShowVoicePopup(false)}
          userEmail={profile?.email || user?.email}
          userId={user?.id}
        />
      )}

      <Calculator
        voiceState={voiceState}
        setVoiceState={setVoiceState}
        hasVoiceAccess={hasVoiceAccess}
        onVoiceUpgradeClick={() => setShowVoicePopup(true)}
        onSignOut={signOut}
        userName={profile?.nome || profile?.email || user?.email}
      />
    </>
  );
}