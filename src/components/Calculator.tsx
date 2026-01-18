// src/components/Calculator.tsx
// Componente principal da calculadora

import { useCallback, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useCalculator, useOnlineStatus, useVoiceRecorder, useCalculatorHistory } from '../hooks';
import { logger } from '../lib/logger';
import { hasConsent } from '../lib/consent';
import { HistoryModal } from './HistoryModal';
import VoiceConsentModal from './VoiceConsentModal';
import type { VoiceState, VoiceResponse } from '../types/calculator';

// Teclado de frações
const FRACTION_PAD = [
  ['1/8"', '1/4"', '3/8"', '1/2"'],
  ['5/8"', '3/4"', '7/8"', "'ft"],
];

// Teclado numérico
const KEYPAD = [
  ['C', '⌫', '%', '÷'],
  ['7', '8', '9', '×'],
  ['4', '5', '6', '-'],
  ['1', '2', '3', '+'],
  ['0', '.', '='],
];

// API endpoint - use production URL for native apps, relative path for web
const getApiEndpoint = () => {
  // If explicitly set in env, use that
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // For native apps (Capacitor), use full production URL
  if (Capacitor.isNativePlatform()) {
    return 'https://calculator.onsiteclub.ca/api/interpret';
  }

  return '/api/interpret';
};

const API_ENDPOINT = getApiEndpoint();

interface CalculatorProps {
  voiceState: VoiceState;
  setVoiceState: (state: VoiceState) => void;
  hasVoiceAccess: boolean;
  onVoiceUpgradeClick: () => void;
  onSignOut: () => void;
  userName?: string;
  userId?: string;
}

export default function Calculator({
  voiceState,
  setVoiceState,
  hasVoiceAccess,
  onVoiceUpgradeClick,
  onSignOut,
  userName,
  userId,
}: CalculatorProps) {
  const isOnline = useOnlineStatus();
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [voiceConsentChecked, setVoiceConsentChecked] = useState(false);
  const [hasVoiceConsent, setHasVoiceConsent] = useState<boolean | null>(null);
  const { history, addToHistory } = useCalculatorHistory();

  // Verifica consentimento de voz quando o componente monta (ou userId muda)
  useEffect(() => {
    if (!userId || voiceConsentChecked) return;

    const checkVoiceConsent = async () => {
      try {
        const granted = await hasConsent(userId, 'voice_training');
        setHasVoiceConsent(granted);
        setVoiceConsentChecked(true);
        console.log('[Calculator] Voice consent checked:', granted);
      } catch (err) {
        console.warn('[Calculator] Error checking voice consent:', err);
        // Em caso de erro, marca como verificado mas sem consentimento
        setHasVoiceConsent(false);
        setVoiceConsentChecked(true);
      }
    };

    checkVoiceConsent();
  }, [userId, voiceConsentChecked]);
  const {
    expression,
    setExpression,
    setExpressionAndCompute,
    displayValue,
    lastResult,
    compute,
    clear,
    backspace,
    appendKey,
    appendFraction,
    appendOperator,
  } = useCalculator();

  // Handler para quando gravação terminar
  const handleAudioUpload = useCallback(async (audioBlob: Blob) => {
    const startTime = Date.now();

    if (audioBlob.size === 0) {
      logger.voice.error('Empty audio blob - recording may have failed', { blobSize: 0 });
      setVoiceState('idle');
      return;
    }

    setVoiceState('processing');

    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');

    try {
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        body: formData,
      });

      const duration = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        logger.voice.apiCall(duration, false, {
          status: response.status,
          error: errorText,
        });
        throw new Error(`API Error: ${response.status}`);
      }

      const data: VoiceResponse = await response.json();

      if (data.expression) {
        // Usa setExpressionAndCompute para atualizar expressão E calcular o resultado
        const result = setExpressionAndCompute(data.expression, {
          userId,
          inputMethod: 'voice',
          voiceLogId: data.voice_log_id,
        });
        logger.voice.apiCall(duration, true, {
          status: response.status,
          expression: data.expression,
          result: result?.resultDecimal,
        });
        // Salva no histórico se houver resultado
        if (result) {
          addToHistory(result);
        }
      } else if (data.error) {
        logger.voice.apiCall(duration, false, {
          status: response.status,
          apiError: data.error,
        });
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.voice.error('API request failed', { error: String(error), duration_ms: duration });
    } finally {
      setVoiceState('idle');
    }
  }, [setExpressionAndCompute, setVoiceState, addToHistory, userId]);

  const { startRecording, stopRecording } = useVoiceRecorder({
    onRecordingComplete: handleAudioUpload,
    onError: (error) => {
      logger.voice.error('Recording error - microphone access denied', { error: String(error) });
      alert('Microphone access denied or not available.');
    },
  });

  // Handler para resposta do modal de consentimento
  const handleConsentResponse = (granted: boolean) => {
    setHasVoiceConsent(granted);
    setShowConsentModal(false);

    // Se concedeu consentimento, inicia gravação automaticamente
    if (granted && voiceState === 'idle') {
      logger.voice.start();
      setVoiceState('recording');
      startRecording();
    }
  };

  // Voice button handlers - simplificado para máxima confiabilidade
  // Aperta = começa a gravar, Solta = para e processa
  const handleVoiceStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Bloqueia se offline ou processando
    if (!isOnline || voiceState === 'processing') return;

    // Se não tem acesso, mostra popup de upgrade
    if (!hasVoiceAccess) {
      onVoiceUpgradeClick();
      return;
    }

    // Se ainda não verificou consentimento ou não tem consentimento, mostra modal
    // hasVoiceConsent === null significa que ainda não foi verificado/perguntado
    if (hasVoiceConsent === null && userId) {
      logger.consent.prompted('voice_training');
      setShowConsentModal(true);
      return;
    }

    // Só inicia se estiver idle
    if (voiceState === 'idle') {
      logger.voice.start();
      setVoiceState('recording');
      startRecording();
    }
  };

  const handleVoiceEnd = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Só para se estiver gravando
    if (voiceState === 'recording') {
      logger.voice.stop();
      stopRecording();
      // O estado muda para 'processing' no handleAudioUpload quando receber o blob
    }
  };

  // Keypad handler
  const handleKeyClick = (key: string) => {
    switch (key) {
      case '=': {
        const result = compute({ userId, inputMethod: 'keypad' });
        if (result) {
          addToHistory(result);
        }
        break;
      }
      case 'C':
        clear();
        break;
      case '⌫':
        backspace();
        break;
      case '÷':
        appendOperator('/');
        break;
      case '×':
        appendOperator('*');
        break;
      case '+':
      case '-':
        appendOperator(key);
        break;
      case '%':
        appendOperator('%');
        break;
      default:
        appendKey(key);
    }
  };

  // Fraction handler
  const handleFractionClick = (frac: string) => {
    if (frac === "'ft") {
      appendKey("' ");
    } else {
      appendFraction(frac);
    }
  };

  // Texto do botão de voz baseado no estado
  const getVoiceButtonText = () => {
    if (!isOnline) return 'Offline';
    if (!hasVoiceAccess) return '🔒 Upgrade to Voice';
    if (voiceState === 'recording') return 'Listening...';
    if (voiceState === 'processing') return 'Processing...';
    return 'Hold to Speak';
  };

  // Classes CSS do botão
  const getVoiceButtonClass = () => {
    const classes = ['voice-btn'];
    if (voiceState === 'recording') classes.push('listening');
    if (voiceState === 'processing') classes.push('processing');
    if (!hasVoiceAccess) classes.push('locked');
    return classes.join(' ');
  };

  // Handler para abrir site OnSite Club
  const handleLogoClick = () => {
    if (window.confirm('Você tem certeza que quer abrir o site OnSite Club?')) {
      window.open('https://onsiteclub.ca', '_blank');
    }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="brand">
          <img
            src="/images/onsite-club-logo.png"
            alt="OnSite Club"
            className="logo-img"
            onClick={handleLogoClick}
            style={{ cursor: 'pointer' }}
          />
        </div>
        <div className="header-actions">
          {userName && <div className="user-name">{userName}</div>}
          {!isOnline && <div className="offline-badge">Offline</div>}
          <button className="sign-out-btn" onClick={onSignOut} title="Sair">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      <main className="main">
        {/* Left Card: Display & Voice */}
        <div className="card left-card">
          <div className="display-section">
            <div className="display-row">
              {/* Total inches display - agora primeiro (invertido) */}
              {lastResult?.isInchMode && (
                <div className="display-box equal">
                  <span className={`display-value ${voiceState}`}>{lastResult.resultTotalInches}</span>
                </div>
              )}
              {/* Feet/inches display - agora segundo (invertido) */}
              <div className="display-box equal">
                <span className={`display-value ${voiceState}`}>
                  {lastResult?.isInchMode ? lastResult.resultFeetInches : displayValue}
                </span>
              </div>
            </div>
          </div>
          
          <div className="divider" />

          {/* Expression input com botão M */}
          <div className="expression-wrapper">
            <input
              type="text"
              className="expression-input"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const result = compute({ userId, inputMethod: 'keypad' });
                  if (result) {
                    addToHistory(result);
                  }
                }
              }}
              placeholder="Type or speak: 5 1/2 + 3 1/4 - 2"
            />
            <button
              className="history-btn"
              onClick={() => setShowHistoryModal(true)}
              title="Histórico"
            >
              M
            </button>
          </div>

          <button
            className={getVoiceButtonClass()}
            disabled={!isOnline || voiceState === 'processing'}
            onTouchStart={handleVoiceStart}
            onTouchEnd={handleVoiceEnd}
            onTouchCancel={handleVoiceEnd}
            onMouseDown={handleVoiceStart}
            onMouseUp={handleVoiceEnd}
            onMouseLeave={handleVoiceEnd}
            style={{ touchAction: 'none' }}
          >
            <span className="voice-icon">
              {voiceState === 'recording' ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="10" />
                </svg>
              ) : voiceState === 'processing' ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="0">
                    <animate attributeName="stroke-dashoffset" values="0;60" dur="1s" repeatCount="indefinite" />
                  </circle>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2C10.34 2 9 3.34 9 5V12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12V5C15 3.34 13.66 2 12 2Z" />
                  <path d="M6 11V12C6 15.31 8.69 18 12 18C15.31 18 18 15.31 18 12V11" strokeLinecap="round" />
                  <path d="M12 18V22" strokeLinecap="round" />
                  <path d="M8 22H16" strokeLinecap="round" />
                </svg>
              )}
            </span>
            <span className="voice-text">{getVoiceButtonText()}</span>
          </button>
        </div>

        {/* Right Card: Keypad & Fractions */}
        <div className="card right-card">
          <div className="fraction-container">
            <div className="fraction-pad">
              {FRACTION_PAD.flat().map((frac, i) => (
                <button
                  key={i}
                  className={`frac-btn ${frac === "'ft" ? 'feet' : ''}`}
                  onClick={() => handleFractionClick(frac)}
                >
                  {frac}
                </button>
              ))}
            </div>
          </div>

          <div className="keypad">
            {KEYPAD.map((row, rowIndex) => (
              <div key={rowIndex} className={`keypad-row ${rowIndex === KEYPAD.length - 1 ? 'last-row' : ''}`}>
                {row.map((key, keyIndex) => (
                  <button
                    key={keyIndex}
                    className={`key ${key === '=' ? 'equals' : ''} ${key === 'C' || key === '⌫' ? 'danger' : ''} ${'÷×-+%'.includes(key) ? 'operator' : ''}`}
                    onClick={() => handleKeyClick(key)}
                  >
                    {key}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Modal de Histórico */}
      <HistoryModal
        history={history}
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
      />

      {/* Modal de Consentimento de Voz */}
      {showConsentModal && userId && (
        <VoiceConsentModal
          userId={userId}
          onConsent={handleConsentResponse}
          onClose={() => setShowConsentModal(false)}
        />
      )}
    </div>
  );
}
