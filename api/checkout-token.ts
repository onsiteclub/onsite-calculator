// api/checkout-token.ts
// Gera JWT token seguro para checkout
// Vercel Serverless Function

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// CORS - Domínios permitidos
const ALLOWED_ORIGINS = [
  'https://calculator.onsiteclub.ca',
  'https://app.onsiteclub.ca',
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

// Helper para extrair IP do request
function getClientIP(headers: Record<string, string | string[] | undefined>): string {
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0].trim();
  }
  return 'unknown';
}

// Base64url encoding (JWT-safe)
function base64urlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// HMAC-SHA256 signature
async function createSignature(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const dataToSign = encoder.encode(data);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataToSign);

  return Buffer.from(signature)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Cria JWT manualmente (sem dependência externa)
async function createJWT(payload: object, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };

  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));

  const dataToSign = `${encodedHeader}.${encodedPayload}`;
  const signature = await createSignature(dataToSign, secret);

  return `${dataToSign}.${signature}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startTime = Date.now();
  const ip = getClientIP(req.headers as Record<string, string | string[] | undefined>);

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
  const jwtSecret = process.env.CHECKOUT_JWT_SECRET;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[Checkout] Missing Supabase config');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!jwtSecret) {
    console.error('[Checkout] Missing CHECKOUT_JWT_SECRET');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Extrai o token de auth do header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      console.error('[Checkout] Missing authorization header');
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const accessToken = authHeader.substring(7);

    // Cria cliente Supabase com service role para validar o token
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Valida o token do usuário
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      console.error('[Checkout] Auth error:', authError?.message);
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Extrai dados do body
    const { app = 'calculator' } = req.body || {};

    // Cria payload do JWT
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      sub: user.id,                    // user_id do Supabase
      email: user.email,               // email do usuário
      app: app,                        // app de origem ('calculator')
      iat: now,                        // issued at
      exp: now + (5 * 60),             // expira em 5 minutos
      jti: crypto.randomUUID(),        // unique token id (previne replay)
    };

    // Gera o JWT
    const token = await createJWT(payload, jwtSecret);

    console.log('[Checkout] Token generated:', { user_id: user.id.substring(0, 8), app, duration_ms: Date.now() - startTime });

    return res.status(200).json({
      token,
      expiresIn: 300, // 5 minutos em segundos
    });

  } catch (error) {
    console.error('[Checkout] Exception:', String(error));
    return res.status(500).json({ error: 'Failed to generate token' });
  }
}
