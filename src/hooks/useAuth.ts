// src/hooks/useAuth.ts
// Hook de autenticação para OnSite Calculator

import { useState, useEffect, useCallback } from 'react';
import { supabase, type UserProfile } from '../lib/supabase';
import { checkPremiumAccess, refreshSubscriptionStatus } from '../lib/subscription';
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
  signUp: (email: string, password: string, metadata: SignUpMetadata) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

interface SignUpMetadata {
  firstName: string;
  lastName: string;
  trade?: string;
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
        console.error('[Auth] Error fetching profile:', error);
        return null;
      }

      return data as UserProfile;
    } catch (err) {
      console.error('[Auth] Exception fetching profile:', err);
      return null;
    }
  }, []);

  // Verifica se o usuário tem acesso à funcionalidade de voz
  // Agora faz verificação assíncrona via Auth Hub API + Supabase
  const checkVoiceAccessAsync = useCallback(async (): Promise<boolean> => {
    try {
      const hasAccess = await checkPremiumAccess();
      console.log('[Auth] Voice access check result:', hasAccess);
      return hasAccess;
    } catch (err) {
      console.error('[Auth] Error checking voice access:', err);
      return false;
    }
  }, []);

  // Carrega a sessão atual ao montar o componente
  useEffect(() => {
    console.log('[Auth] useEffect triggered, supabase:', !!supabase);

    if (!supabase) {
      console.log('[Auth] Supabase not available - offline mode');
      setAuthState(prev => ({ ...prev, loading: false }));
      return;
    }

    let mounted = true;

    // Busca sessão inicial
    const loadSession = async () => {
      try {
        console.log('[Auth] Loading session...');
        const { data: { session } } = await supabase!.auth.getSession();
        console.log('[Auth] Session loaded:', !!session);

        if (!mounted) return;

        if (session?.user) {
          console.log('[Auth] User found:', session.user.email);
          const profile = await fetchProfile(session.user.id);

          if (!mounted) return;

          const hasVoiceAccess = await checkVoiceAccessAsync();

          setAuthState({
            user: session.user,
            profile,
            session,
            loading: false,
            hasVoiceAccess,
          });
        } else {
          console.log('[Auth] No session found - showing login');
          setAuthState({
            user: null,
            profile: null,
            session: null,
            loading: false,
            hasVoiceAccess: false,
          });
        }
      } catch (error) {
        console.error('[Auth] Error loading session:', error);
        if (mounted) {
          setAuthState(prev => ({ ...prev, loading: false }));
        }
      }
    };

    loadSession();

    // Listener para mudanças na autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] Auth state changed:', event, 'hasUser:', !!session?.user);

        // Ignora todos os eventos iniciais - vamos carregar a sessão manualmente
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          console.log('[Auth] Ignoring automatic event:', event);
          return;
        }

        if (!mounted) {
          console.log('[Auth] Component unmounted, ignoring event');
          return;
        }

        console.log('[Auth] Processing auth event:', event);

        if (session?.user) {
          const profile = await fetchProfile(session.user.id);

          if (!mounted) return;

          const hasVoiceAccess = await checkVoiceAccessAsync();

          setAuthState({
            user: session.user,
            profile,
            session,
            loading: false,
            hasVoiceAccess,
          });
        } else {
          setAuthState({
            user: null,
            profile: null,
            session: null,
            loading: false,
            hasVoiceAccess: false,
          });
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
      return { error: 'Autenticação não disponível' };
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: formatAuthError(error.message) };
      }

      return { error: null };
    } catch (err) {
      console.error('[Auth] Sign in error:', err);
      return { error: 'Erro ao fazer login. Tente novamente.' };
    }
  }, []);

  // Cadastro
  const signUp = useCallback(async (
    email: string,
    password: string,
    metadata: SignUpMetadata
  ) => {
    if (!supabase) {
      return { error: 'Autenticação não disponível' };
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: metadata.firstName,
            last_name: metadata.lastName,
            trade: metadata.trade || '',
          },
        },
      });

      if (error) {
        return { error: formatAuthError(error.message) };
      }

      return { error: null };
    } catch (err) {
      console.error('[Auth] Sign up error:', err);
      return { error: 'Erro ao criar conta. Tente novamente.' };
    }
  }, []);

  // Logout
  const signOut = useCallback(async () => {
    if (!supabase) return;

    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('[Auth] Sign out error:', err);
    }
  }, []);

  // Atualiza o perfil (útil após retornar do checkout)
  const refreshProfile = useCallback(async () => {
    if (!supabase) return;

    try {
      // Pega o usuário atual da sessão
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      // Busca perfil diretamente sem usar fetchProfile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      const profile = profileData as UserProfile | null;

      // Força refresh do status de assinatura (limpa cache e verifica novamente)
      console.log('[Auth] Refreshing subscription status');
      const hasVoiceAccess = await refreshSubscriptionStatus();

      setAuthState(prev => ({
        ...prev,
        profile,
        hasVoiceAccess,
      }));
    } catch (error) {
      console.error('[Auth] Error refreshing profile:', error);
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
    'Invalid login credentials': 'Email ou senha incorretos',
    'Email not confirmed': 'Email não confirmado. Verifique sua caixa de entrada.',
    'User already registered': 'Este email já está cadastrado',
    'Password should be at least 6 characters': 'A senha deve ter pelo menos 6 caracteres',
  };

  return errorMap[message] || message;
}
