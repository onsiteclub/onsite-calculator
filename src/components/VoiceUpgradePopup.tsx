// src/components/VoiceUpgradePopup.tsx
// Modal para upgrade de Voice feature

import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

interface VoiceUpgradePopupProps {
  onClose: () => void;
  userEmail?: string;
}

export default function VoiceUpgradePopup({ onClose, userEmail }: VoiceUpgradePopupProps) {
  const checkoutUrl = 'https://auth.onsiteclub.ca/checkout/calculator';

  const handleStartTrial = async () => {
    // Monta a URL com parâmetros
    const redirectUri = 'onsitecalculator://auth-callback';
    const url = new URL(checkoutUrl);

    if (userEmail) {
      url.searchParams.set('prefilled_email', userEmail);
    }
    url.searchParams.set('redirect', redirectUri);

    try {
      // Se está em um app nativo (Capacitor), abre no Browser do Capacitor
      if (Capacitor.isNativePlatform()) {
        await Browser.open({
          url: url.toString(),
          presentationStyle: 'popover',
        });
      } else {
        // Se está na web, abre em nova aba
        window.open(url.toString(), '_blank');
      }
    } catch (error) {
      console.error('[VoiceUpgrade] Error opening checkout:', error);
      // Fallback: tenta abrir com window.open
      window.open(url.toString(), '_blank');
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
        
        <button className="popup-btn popup-btn-primary" onClick={handleStartTrial}>
          Start Free Trial
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
