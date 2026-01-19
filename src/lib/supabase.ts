// src/lib/supabase.ts
// Cliente Supabase para autenticação OnSite

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Credentials not found. Auth features disabled.');
}

let supabaseInstance: SupabaseClient | null = null;

try {
  if (supabaseUrl && supabaseAnonKey) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
} catch (error) {
  console.error('[Supabase] Error creating client:', error);
}

export const supabase = supabaseInstance;

/** Verifica se Supabase está disponível */
export const isSupabaseEnabled = (): boolean => !!supabase;

/** Tipos do profile */
export interface UserProfile {
  id: string;
  email: string;
  nome: string;
  first_name: string;
  last_name: string;
  trade: string;
  birthday: string | null;
  gender: string | null;
  subscription_status: 'trialing' | 'active' | 'canceled' | 'past_due';
  trial_ends_at: string;
}
