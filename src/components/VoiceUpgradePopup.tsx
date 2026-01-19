// src/components/VoiceUpgradePopup.tsx
// Modal para upgrade de Voice feature

import { useState } from 'react';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';

interface VoiceUpgradePopupProps {
  onClose: () => void;
  userEmail?: string;
  userId?: string;
}

// URL da API - varia entre web e nativo
const API_BASE_URL = Capacitor.isNativePlatform()
  ? 'https://calculator.onsiteclub.ca'
  : '';

export default function VoiceUpgradePopup({ onClose, userEmail }: VoiceUpgradePopupProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkoutUrl = 'https://auth.onsiteclub.ca/checkout/calculator';

  // Helper para abrir URL no browser
  const openCheckoutUrl = async (url: string) => {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url, presentationStyle: 'popover' });
    } else {
      window.open(url, '_blank');
    }
    onClose();
  };

  const handleStartTrial = async () => {
    setIsLoading(true);
    setError(null);

    const redirectUri = 'onsitecalculator://auth-callback';

    try {
      // Tenta usar API para gerar token seguro (melhor experiência)
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          try {
            const tokenResponse = await fetch(`${API_BASE_URL}/api/checkout-token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ app: 'calculator' }),
            });

            if (tokenResponse.ok) {
              const { token } = await tokenResponse.json();
              const url = new URL(checkoutUrl);
              url.searchParams.set('token', token);
              if (userEmail) {
                url.searchParams.set('prefilled_email', userEmail);
              }
              url.searchParams.set('redirect', redirectUri);
              await openCheckoutUrl(url.toString());
              return;
            }
          } catch (apiErr) {
            console.warn('[VoiceUpgrade] API failed, using fallback:', apiErr);
          }
        }
      }

      // Fallback: abre checkout diretamente com email (sem token)
      // O checkout vai pedir login novamente, mas funciona
      const fallbackUrl = new URL(checkoutUrl);
      if (userEmail) {
        fallbackUrl.searchParams.set('prefilled_email', userEmail);
      }
      fallbackUrl.searchParams.set('redirect', redirectUri);
      await openCheckoutUrl(fallbackUrl.toString());

    } catch (err) {
      console.error('[VoiceUpgrade] Error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao iniciar checkout');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content" onClick={e => e.stopPropagation()}>
        <button className="popup-close" onClick={onClose}>×</button>

        <div className="popup-icon">🎙️</div>

        <h2 className="popup-title">Voice Calculator</h2>

        <p className="popup-description">
          Speak your measurements and let AI do the math!
        </p>

        <div className="popup-features">
          <div className="popup-feature">✓ Voice recognition in English & Portuguese</div>
          <div className="popup-feature">✓ Understands fractions and feet/inches</div>
          <div className="popup-feature">✓ Hands-free on the job site</div>
        </div>

        <div className="popup-pricing">
          <div className="popup-trial">
            <span className="popup-trial-badge">6 MONTHS FREE</span>
            <p className="popup-trial-text">Try it free, cancel anytime</p>
          </div>
          <p className="popup-price">Then $11.99 CAD/year</p>
        </div>

        {error && (
          <div className="popup-error">
            {error}
          </div>
        )}

        <button
          className="popup-btn popup-btn-primary"
          onClick={handleStartTrial}
          disabled={isLoading}
        >
          {isLoading ? 'Preparing...' : 'Start Free Trial'}
        </button>

        <button className="popup-btn popup-btn-secondary" onClick={onClose}>
          Maybe Later
        </button>

        <p className="popup-note">
          Credit card required. You won't be charged during trial.
        </p>
      </div>
    </div>
  );
}
