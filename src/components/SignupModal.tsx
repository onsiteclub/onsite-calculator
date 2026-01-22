// src/components/SignupModal.tsx
// Modal de cadastro/login que aparece após 20 usos gratuitos
// Auto-cria conta se email não existe, faz login se já existe

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { logger } from '../lib/logger';

interface SignupModalProps {
  onSuccess: (userId: string, email: string) => void;
  onClose: () => void;
}

export default function SignupModal({ onSuccess, onClose }: SignupModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!supabase) {
      setError('Service unavailable. Please try again later.');
      return;
    }

    if (!email || !password) {
      setError('Please enter email and password');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Primeiro tenta fazer login
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInData?.user) {
        // Login bem-sucedido
        logger.auth.signIn(true);
        console.log('[SignupModal] Login successful:', signInData.user.id);
        onSuccess(signInData.user.id, email);
        return;
      }

      // Se o erro for "Invalid login credentials", tenta criar conta
      if (signInError?.message === 'Invalid login credentials') {
        console.log('[SignupModal] Login failed, trying to create account...');

        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) {
          logger.auth.signUp(false, { errorCode: signUpError.message });
          setError(formatError(signUpError.message));
          return;
        }

        if (signUpData?.user) {
          // Cadastro bem-sucedido
          logger.auth.signUp(true);
          console.log('[SignupModal] Signup successful:', signUpData.user.id);
          onSuccess(signUpData.user.id, email);
          return;
        }
      } else if (signInError) {
        // Outro erro de login
        logger.auth.signIn(false, { errorCode: signInError.message });
        setError(formatError(signInError.message));
      }
    } catch (err) {
      console.error('[SignupModal] Error:', err);
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content signup-modal" onClick={e => e.stopPropagation()}>
        <button className="popup-close" onClick={onClose}>×</button>

        <div className="popup-icon">🎤</div>

        <h2 className="popup-title">Free Trial Ended</h2>

        <p className="popup-description">
          You've used all 20 free voice commands. Create an account to continue!
        </p>

        {/* Pricing info */}
        <div className="signup-pricing">
          <div className="signup-trial-badge">6 MONTHS FREE</div>
          <p className="signup-trial-text">Then only $11.99/year</p>
        </div>

        {/* Form */}
        <form className="signup-form" onSubmit={handleSubmit}>
          {error && (
            <div className="auth-error">{error}</div>
          )}

          <input
            type="email"
            className="auth-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            autoComplete="email"
            autoFocus
          />

          <div className="auth-password-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              className="auth-input"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="auth-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>

          <button
            type="submit"
            className="popup-btn popup-btn-primary"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="auth-spinner"></span>
                Processing...
              </>
            ) : (
              'Continue'
            )}
          </button>
        </form>

        <p className="signup-note">
          Already have an account? Just enter your credentials above.
        </p>

        <p className="popup-note">
          By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

// Formata mensagens de erro
function formatError(message: string): string {
  const errorMap: Record<string, string> = {
    'Invalid login credentials': 'Invalid email or password. If you\'re new, check your password.',
    'Email not confirmed': 'Please check your email to confirm your account.',
    'User already registered': 'This email is already registered. Try logging in.',
    'Password should be at least 6 characters': 'Password must be at least 6 characters.',
    'Invalid email': 'Please enter a valid email address.',
  };

  return errorMap[message] || message;
}
