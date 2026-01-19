// api/checkout-code.ts
// Gera código curto para checkout (evita query params truncados no APK)
// Vercel Serverless Function

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// CORS - Domínios permitidos
const ALLOWED_ORIGINS = [
  'https://calculator.onsiteclub.ca',
  'https://app.onsiteclub.ca',
  'https://onsiteclub-calculator.vercel.app',
  'capacitor://localhost',
  'https://localhost',
  'http://localhost:5173',
  'http://localhost:3000',
];

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.startsWith('capacitor://') || origin.startsWith('ionic://')) return true;
  return false;
}

// Gera código curto sem caracteres ambíguos (0/O, 1/l/I)
function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  const origin = req.headers.origin || '';
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verifica configuração
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[CheckoutCode] Missing Supabase config');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Extrai o token de auth do header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[CheckoutCode] Missing authorization header');
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const accessToken = authHeader.substring(7);

    // Cria cliente Supabase com service role para validar o token
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Valida o token do usuário
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      console.error('[CheckoutCode] Auth error:', authError?.message);
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Extrai dados do body
    const { app = 'calculator' } = req.body || {};

    // Gera código curto
    const code = generateCode(8);
    const expiresAt = new Date(Date.now() + 60 * 1000).toISOString(); // 60 segundos TTL

    // Salva código no banco
    const { error: insertError } = await supabase
      .from('checkout_codes')
      .insert({
        code,
        user_id: user.id,
        email: user.email,
        app,
        redirect_url: 'onsitecalculator://auth-callback',  // Deep link para retorno ao app
        expires_at: expiresAt,
        used: false,
      });

    if (insertError) {
      console.error('[CheckoutCode] Insert error:', insertError.message);
      return res.status(500).json({ error: 'Failed to generate code' });
    }

    console.log('[CheckoutCode] Generated:', { code, user_id: user.id.substring(0, 8), app });

    return res.status(200).json({ code });

  } catch (err) {
    console.error('[CheckoutCode] Exception:', String(err));
    return res.status(500).json({ error: 'Internal error' });
  }
}
