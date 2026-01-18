// api/interpret.ts
// Voice-to-Expression API - Whisper + GPT-4o
// Vercel Serverless Function

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  canCollectVoice,
  saveVoiceLog,
  extractEntities,
  detectInformalTerms,
  detectLanguage,
  type VoiceLogRecord,
} from './lib/voice-logs';

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

// Rate limiting simples
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60000;
const RATE_LIMIT_MAX_REQUESTS = 30;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const requests = rateLimitMap.get(ip) || [];
  const recent = requests.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  recent.push(now);
  rateLimitMap.set(ip, recent);

  if (rateLimitMap.size > 10000) {
    for (const [key, times] of rateLimitMap.entries()) {
      if (times.every(t => now - t > RATE_LIMIT_WINDOW_MS)) {
        rateLimitMap.delete(key);
      }
    }
  }

  return true;
}

// System prompt para GPT - SPEC V7
const SYSTEM_PROMPT = `You are a parser for a construction calculator.
Convert spoken phrases into mathematical expressions.
Return ONLY valid JSON: {"expression":"..."}

FORMAT RULES:
- Operators: + - * /
- Fractions: 1/2, 3/8, 1/16 (NO spaces around /)
- Mixed numbers: whole SPACE fraction → "5 1/2", "3 3/4"
- Feet: apostrophe → "2'" or "2' 6"
- Inches: can be implicit or with quote → 5 or 5"

LANGUAGE (PT/EN/ES/FR):
- "cinco e meio" / "five and a half" → "5 1/2"
- "três pés e duas" / "three feet two" → "3' 2"
- "metade de" / "half of" → "/ 2"
- "dobro" / "double" → "* 2"

FRACTION WORDS:
- meio/half = 1/2
- um quarto/quarter = 1/4
- três quartos/three quarters = 3/4
- um oitavo/eighth = 1/8
- três oitavos/three eighths = 3/8
- um dezesseis avos/sixteenth = 1/16

FIX COMMON SPEECH ERRORS:
- "103/8" → "10 3/8" (missing space)
- "51/2" → "5 1/2"
- "fit"/"feet" spoken unclearly → use '
- Numbers run together → separate intelligently

EXAMPLES:
"cinco e meio mais três e um quarto" → {"expression":"5 1/2 + 3 1/4"}
"ten and three eighths minus two" → {"expression":"10 3/8 - 2"}
"três pés e seis" → {"expression":"3' 6"}
"dobro de cinco" → {"expression":"5 * 2"}
"metade de dez e meio" → {"expression":"10 1/2 / 2"}`;

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

  // Rate limiting
  if (!checkRateLimit(ip)) {
    console.error('[API] Rate limited:', ip);
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  // Check API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[API] Missing OPENAI_API_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Parse multipart form data
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve());
      req.on('error', reject);
    });

    const body = Buffer.concat(chunks);

    // Extract audio file from multipart
    const boundary = req.headers['content-type']?.split('boundary=')[1];
    if (!boundary) {
      return res.status(400).json({ error: 'Invalid content type' });
    }

    // Simple multipart parser
    const parts = body.toString('binary').split(`--${boundary}`);
    let audioData: Buffer | null = null;
    let filename = 'audio.webm';
    let userId: string | undefined;

    for (const part of parts) {
      // Extract user_id field if present
      if (part.includes('name="user_id"')) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const content = part.slice(headerEnd + 4).trim();
          userId = content.replace(/\r\n--$/, '').replace(/--\r\n$/, '').trim();
        }
      }

      if (part.includes('filename=')) {
        const filenameMatch = part.match(/filename="([^"]+)"/);
        if (filenameMatch) filename = filenameMatch[1];

        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const content = part.slice(headerEnd + 4);
          const cleanContent = content.replace(/\r\n--$/, '').replace(/--\r\n$/, '');
          audioData = Buffer.from(cleanContent, 'binary');
        }
      }
    }

    if (!audioData || audioData.length === 0) {
      return res.status(400).json({ error: 'No audio file uploaded' });
    }

    // 1. Whisper transcription
    const formData = new FormData();
    const audioBlob = new Blob([new Uint8Array(audioData)], { type: 'audio/webm' });
    formData.append('file', audioBlob, filename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');
    formData.append('prompt', 'Medidas de construção: polegadas, pés, frações como 1/2, 3/8, 1/4, 5/8, 7/8. Palavras: meio, quarto, oitavo, pé, polegada, mais, menos, vezes, dividido. Construction measurements: inches, feet, fractions.');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const errText = await whisperResponse.text();
      console.error('[Voice] Whisper error:', errText);
      return res.status(500).json({ error: 'Transcription failed' });
    }

    const whisperResult = await whisperResponse.json();
    const transcribedText = whisperResult.text;

    // 2. GPT interpretation
    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 150,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: transcribedText }
        ]
      }),
    });

    if (!gptResponse.ok) {
      const errText = await gptResponse.text();
      console.error('[Voice] GPT error:', errText, 'transcription:', transcribedText);
      return res.status(500).json({ error: 'Interpretation failed' });
    }

    const gptResult = await gptResponse.json();
    const content = gptResult.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);

    const durationMs = Date.now() - startTime;
    console.log('[Voice] Success:', { transcription: transcribedText, expression: parsed.expression, duration_ms: durationMs });

    // 3. Salvar voice_log se usuário tiver consentimento
    let voiceLogId: string | null = null;
    if (userId) {
      const hasConsent = await canCollectVoice(userId);
      if (hasConsent) {
        const voiceLog: VoiceLogRecord = {
          user_id: userId,
          feature_context: 'main_calculator',
          audio_format: 'webm',
          transcription_raw: transcribedText,
          transcription_normalized: parsed.expression,
          transcription_engine: 'whisper-1',
          language_detected: detectLanguage(transcribedText),
          intent_detected: 'calculate',
          intent_fulfilled: !!parsed.expression,
          entities: extractEntities(parsed.expression || ''),
          informal_terms: detectInformalTerms(transcribedText),
          was_successful: !!parsed.expression,
        };

        voiceLogId = await saveVoiceLog(voiceLog);
        if (voiceLogId) {
          console.log('[Voice] Saved voice_log:', voiceLogId);
        }
      }
    }

    return res.status(200).json({
      ...parsed,
      voice_log_id: voiceLogId, // Retornar ID para vincular ao calculation
    });

  } catch (err) {
    console.error('[API] Exception:', String(err));
    return res.status(500).json({ error: 'Server processing error' });
  }
}
