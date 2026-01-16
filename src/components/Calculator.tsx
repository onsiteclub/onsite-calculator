// src/components/Calculator.tsx
// Componente principal da calculadora

import { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { useCalculator, useOnlineStatus, useVoiceRecorder } from '../hooks';
import { calculate } from '../lib/calculator';
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
  userName?: string;
}

export default function Calculator({
  voiceState,
  setVoiceState,
  hasVoiceAccess,
  onVoiceUpgradeClick,
  userName,
}: CalculatorProps) {
  const isOnline = useOnlineStatus();
  const {
    expression,
    setExpression,
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
    console.log('[Voice] Audio upload started, blob size:', audioBlob.size, 'bytes');
    console.log('[Voice] API endpoint:', API_ENDPOINT);

    if (audioBlob.size === 0) {
      console.error('[Voice] Empty audio blob - recording may have failed');
      setVoiceState('idle');
      return;
    }

    setVoiceState('processing');

    const formData = new FormData();
    formData.append('file', audioBlob, 'recording.webm');

    try {
      console.log('[Voice] Sending request to API...');
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        body: formData,
      });

      console.log('[Voice] Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Voice] API Error:', response.status, errorText);
        throw new Error(`API Error: ${response.status}`);
      }

      const data: VoiceResponse = await response.json();
      console.log('[Voice] API response:', data);

      if (data.expression) {
        setExpression(data.expression);
        const result = calculate(data.expression);
        console.log('[Voice] Calculation result:', result);
      } else if (data.error) {
        console.error('[Voice] API returned error:', data.raw);
      }
    } catch (error) {
      console.error('[Voice] Error:', error);
    } finally {
      setVoiceState('idle');
    }
  }, [setExpression, setVoiceState]);

  const { startRecording, stopRecording } = useVoiceRecorder({
    onRecordingComplete: handleAudioUpload,
    onError: (error) => {
      console.error('[Voice] Recording error:', error);
      alert('Microphone access denied or not available.');
    },
  });

  // Voice button handlers
  const handleVoiceStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isOnline) return;
    
    if (!hasVoiceAccess) {
      onVoiceUpgradeClick();
      return;
    }
    
    if (voiceState === 'idle') {
      setVoiceState('recording');
      startRecording();
    }
  };

  const handleVoiceEnd = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (voiceState === 'recording') {
      stopRecording();
    }
  };

  // Keypad handler
  const handleKeyClick = (key: string) => {
    switch (key) {
      case '=':
        compute();
        break;
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
    if (voiceState === 'recording') return '🎤 Listening...';
    if (voiceState === 'processing') return '🧠 Thinking...';
    return '🎙️ Hold to Speak';
  };

  // Feedback visual acima do botão
  const getVoiceFeedback = () => {
    if (voiceState === 'recording') return '🔴 Speak now...';
    if (voiceState === 'processing') return 'Processing your voice...';
    return '';
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
        </div>
      </header>

      <main className="main">
        {/* Left Card: Display & Voice */}
        <div className="card left-card">
          <div className="display-section">
            <div className="display-row">
              <div className="display-box primary">
                <span className={`display-value ${voiceState}`}>
                  {lastResult?.isInchMode ? lastResult.resultFeetInches : displayValue}
                </span>
              </div>
              {lastResult?.isInchMode && (
                <div className="display-box secondary">
                  <span className="display-value-secondary">{lastResult.resultTotalInches}</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="divider" />
          
          <input
            type="text"
            className="expression-input"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') compute();
            }}
            placeholder="Type or speak: 5 1/2 + 3 1/4 - 2"
          />
          
          {/* Feedback visual acima do botão */}
          {getVoiceFeedback() && (
            <div className={`voice-feedback ${voiceState}`}>
              {getVoiceFeedback()}
            </div>
          )}

          <button
            className={getVoiceButtonClass()}
            disabled={!isOnline || voiceState === 'processing'}
            onMouseDown={handleVoiceStart}
            onMouseUp={handleVoiceEnd}
            onMouseLeave={voiceState === 'recording' ? handleVoiceEnd : undefined}
            onTouchStart={handleVoiceStart}
            onTouchEnd={handleVoiceEnd}
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

          {/* Memory Display */}
          {lastResult && lastResult.expression && (
            <div className="memory">
              <div className="memory-expr">{lastResult.expression}</div>
              <div className="memory-line">────────</div>
            </div>
          )}
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
    </div>
  );
}
