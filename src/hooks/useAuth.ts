// src/hooks/useAuth.ts
// Hook de autenticação para OnSite Calculator

import { useState, useEffect, useCallback } from 'react';
import { supabase, type UserProfile } from '../lib/supabase';
import { checkPremiumAccess, refreshSubscriptionStatus, clearSubscriptionCache } from '../lib/subscription';
import { logger } from '../lib/logger';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  hasVoiceAccess: boolean;
}

interface UseAuthReturn extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<boolean>;  // Retorna true se tem acesso voice
}

export function useAuth(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    profile: null,
    session: null,
    loading: true,
    hasVoiceAccess: false,
  });

  // Busca o perfil do usuário no Supabase
  const fetchProfile = useCallback(async (userId: string): Promise<UserProfile | null> => {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        logger.auth.error('Error fetching profile', { error: error.message, userId });
        return null;
      }

      return data as UserProfile;
    } catch (err) {
      logger.auth.error('Exception fetching profile', { error: String(err), userId });
      return null;
    }
  }, []);

  // Verifica se o usuário tem acesso à funcionalidade de voz
  // Agora faz verificação assíncrona via Auth Hub API + Supabase
  const checkVoiceAccessAsync = useCallback(async (): Promise<boolean> => {
    try {
      const hasAccess = await checkPremiumAccess();
      return hasAccess;
    } catch (err) {
      logger.auth.error('Error checking voice access', { error: String(err) });
      return false;
    }
  }, []);

  // Carrega a sessão atual ao montar o componente
  useEffect(() => {
    if (!supabase) {
      setAuthState(prev => ({ ...prev, loading: false }));
      return;
    }

    let mounted = true;

    // Busca sessão inicial
    const loadSession = async () => {
      try {
        const { data: { session } } = await supabase!.auth.getSession();

        if (!mounted) return;

        if (session?.user) {
          const profile = await fetchProfile(session.user.id);

          if (!mounted) return;

          const hasVoiceAccess = await checkVoiceAccessAsync();

          logger.auth.sessionLoad(true);

          setAuthState({
            user: session.user,
            profile,
            session,
            loading: false,
            hasVoiceAccess,
          });
        } else {
          logger.auth.sessionLoad(false);
          setAuthState({
            user: null,
            profile: null,
            session: null,
            loading: false,
            hasVoiceAccess: false,
          });
        }
      } catch (error) {
        logger.auth.error('Error loading session', { error: String(error) });
        if (mounted) {
          setAuthState(prev => ({ ...prev, loading: false }));
        }
      }
    };

    loadSession();

    // Listener para mudanças na autenticação - apenas SIGNED_OUT e SIGNED_IN
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        // Só processa SIGNED_OUT para limpar estado
        if (event === 'SIGNED_OUT') {
          // Limpa cache de subscription para evitar vazamento entre usuários
          clearSubscriptionCache();
          setAuthState({
            user: null,
            profile: null,
            session: null,
            loading: false,
            hasVoiceAccess: false,
          });
        }

        // Para SIGNED_IN, recarrega a sessão
        if (event === 'SIGNED_IN' && mounted) {
          loadSession();
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Execute apenas uma vez na montagem

  // Login
  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return { error: 'Authentication not available' };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.auth.signIn(false, { errorCode: error.message });
        return { error: formatAuthError(error.message) };
      }

      logger.auth.signIn(true);
      return { error: null };
    } catch (err) {
      logger.auth.error('Sign in exception', { error: String(err) });
      return { error: 'Error signing in. Please try again.' };
    }
  }, []);

  // Cadastro (apenas email e senha - mínima fricção)
  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return { error: 'Authentication not available' };
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        logger.auth.signUp(false, { errorCode: error.message });
        return { error: formatAuthError(error.message) };
      }

      logger.auth.signUp(true);
      return { error: null };
    } catch (err) {
      logger.auth.error('Sign up exception', { error: String(err) });
      return { error: 'Error creating account. Please try again.' };
    }
  }, []);

  // Logout
  const signOut = useCallback(async () => {
    if (!supabase) return;

    try {
      await supabase.auth.signOut();
      logger.auth.signOut();
    } catch (err) {
      logger.auth.error('Sign out error', { error: String(err) });
    }
  }, []);

  // Atualiza o perfil (útil após retornar do checkout)
  // RETORNA: true se tem acesso voice, false se não
  const refreshProfile = useCallback(async (): Promise<boolean> => {
    if (!supabase) return false;

    try {
      // Pega o usuário atual da sessão
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return false;

      // Busca perfil diretamente sem usar fetchProfile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      const profile = profileData as UserProfile | null;

      // Força refresh do status de assinatura (limpa cache e verifica novamente)
      const hasVoiceAccess = await refreshSubscriptionStatus();

      setAuthState(prev => ({
        ...prev,
        profile,
        hasVoiceAccess,
      }));

      return hasVoiceAccess;
    } catch (error) {
      logger.auth.error('Error refreshing profile', { error: String(error) });
      return false;
    }
  }, []); // Sem dependências para evitar loop

  return {
    ...authState,
    signIn,
    signUp,
    signOut,
    refreshProfile,
  };
}

// Formata mensagens de erro do Supabase
function formatAuthError(message: string): string {
  const errorMap: Record<string, string> = {
    'Invalid login credentials': 'Invalid email or password',
    'Email not confirmed': 'Email not confirmed. Check your inbox.',
    'User already registered': 'This email is already registered',
    'Password should be at least 6 characters': 'Password must be at least 6 characters',
  };

  return errorMap[message] || message;
}
