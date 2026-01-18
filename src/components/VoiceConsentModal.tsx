// src/components/VoiceConsentModal.tsx
// Modal de consentimento para voice_training
// Mostra no primeiro uso do microfone

import { useState } from 'react';
import { setConsent } from '../lib/consent';
import { logger } from '../lib/logger';

interface VoiceConsentModalProps {
  userId: string;
  onConsent: (granted: boolean) => void;
  onClose: () => void;
}

export default function VoiceConsentModal({ userId, onConsent, onClose }: VoiceConsentModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConsent = async (granted: boolean) => {
    setIsLoading(true);

    try {
      const success = await setConsent(userId, 'voice_training', granted, {
        documentVersion: '1.0',
        appVersion: '4.0.0',
      });

      if (success) {
        logger.consent.granted('voice_training', granted);
        console.log('[VoiceConsent] Consent saved:', granted);
      } else {
        console.warn('[VoiceConsent] Failed to save consent to database');
      }

      // Notifica o parent mesmo se falhou o save (para não bloquear o usuário)
      onConsent(granted);
    } catch (err) {
      console.error('[VoiceConsent] Error saving consent:', err);
      // Em caso de erro, ainda permite continuar
      onConsent(granted);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content consent-modal" onClick={e => e.stopPropagation()}>
        <button className="popup-close" onClick={onClose}>×</button>

        <div className="popup-icon">🎙️</div>

        <h2 className="popup-title">Improve Voice Recognition</h2>

        <p className="popup-description">
          Allow your voice recordings to be used to improve recognition of construction terms?
        </p>

        <div className="consent-details">
          <p className="consent-text">
            This helps us better understand trade-specific terminology like "three-eighths",
            "two feet six", and other measurements commonly used in construction.
          </p>
          <p className="consent-text consent-privacy">
            🔒 Recordings are anonymized and used only for improving the voice calculator.
          </p>
        </div>

        <button
          className="popup-btn popup-btn-primary"
          onClick={() => handleConsent(true)}
          disabled={isLoading}
        >
          {isLoading ? 'Saving...' : 'Yes, Help Improve'}
        </button>

        <button
          className="popup-btn popup-btn-secondary"
          onClick={() => handleConsent(false)}
          disabled={isLoading}
        >
          No Thanks
        </button>

        <p className="popup-note">
          You can change this anytime in Settings.
        </p>
      </div>
    </div>
  );
}
