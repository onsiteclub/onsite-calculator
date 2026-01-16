// api/interpret.ts
// Voice-to-Expression API - Whisper + GPT-4o-mini
// Vercel Serverless Function

import type { VercelRequest, VercelResponse } from '@vercel/node';

// CORS - Domínios permitidos
const ALLOWED_ORIGINS = [
  'https://calculator.onsiteclub.ca',
  'https://app.onsiteclub.ca',
  'capacitor://localhost',
  'https://localhost',  // Capacitor with androidScheme: 'https'
  'http://localhost:5173',
  'http://localhost:3000',
];

// Check if origin should be allowed (includes Capacitor native apps)
function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow Capacitor apps (they may send no origin or file://)
  if (origin.startsWith('capacitor://') || origin.startsWith('ionic://')) return true;
  return false;
}

// Rate limiting simples (em produção usar Redis/Upstash)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minuto
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
  
  // Limpa entries antigas periodicamente
  if (rateLimitMap.size > 10000) {
    for (const [key, times] of rateLimitMap.entries()) {
      if (times.every(t => now - t > RATE_LIMIT_WINDOW_MS)) {
        rateLimitMap.delete(key);
      }
    }
  }
  
  return true;
}

// System prompt para GPT
const SYSTEM_PROMPT = `You are a parser for a construction calculator that handles MULTIPLE operations.

Your job: Convert the spoken phrase into a mathematical expression string.
Return ONLY valid JSON.

OUTPUT FORMAT:
{"mode":"inches","expression":"5 1/2 + 3 1/4 - 2"}

RULES FOR EXPRESSION:
- Use standard operators: + - * /
- Fractions: write as "1/2", "3/8", "1/16" etc
- Mixed numbers: whole + space + fraction: "5 1/2", "3 3/4"
- Feet: use apostrophe: "2'" or "2' 6"
- Multiple operations are allowed: "5 1/2 + 3 - 1/4 * 2"
- All numbers are assumed to be inches unless marked with '

LANGUAGE HANDLING (English, Portuguese, Spanish, French):
- "five and a half plus three and a quarter minus two" → "5 1/2 + 3 1/4 - 2"
- "cinco e meio mais três e um quarto menos dois" → "5 1/2 + 3 1/4 - 2"
- "três pés e duas polegadas" → "3' 2"
- "half of" or "metade de" = "* 1/2" or "/ 2"
- "double" or "dobro" = "* 2"

COMMON CONSTRUCTION TERMS:
- "e meio" / "and a half" = 1/2
- "e um quarto" / "and a quarter" = 1/4
- "e três quartos" / "and three quarters" = 3/4
- "e três oitavos" / "and three eighths" = 3/8
- "fit" (spoken) = feet (')

FIX SPEECH ERRORS:
- "103/8" → "10 3/8"
- "51/2" → "5 1/2"
- Double digits followed by fraction usually means mixed number

Return mode:"inches" for any expression with fractions or construction measurements.
Return mode:"normal" ONLY for pure arithmetic without fractions.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  const origin = req.headers.origin || '';
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (!origin) {
    // Native apps may not send origin header - allow all for now
    // In production, you might want to use authentication instead
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
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || 
             req.socket?.remoteAddress || 
             'unknown';
  
  if (!checkRateLimit(ip)) {
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
    // Vercel Edge functions handle this differently, for Node runtime:
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
    
    for (const part of parts) {
      if (part.includes('filename=')) {
        const filenameMatch = part.match(/filename="([^"]+)"/);
        if (filenameMatch) filename = filenameMatch[1];
        
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const content = part.slice(headerEnd + 4);
          // Remove trailing boundary markers
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
    const audioBlob = new Blob([audioData], { type: 'audio/webm' });
    formData.append('file', audioBlob, filename);
    formData.append('model', 'whisper-1');
    formData.append('prompt', 'Construction measurements: inches, feet, fractions like 1/2, 3/8, 1/4. Portuguese: polegada, pé, meio.');

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!whisperResponse.ok) {
      const error = await whisperResponse.text();
      console.error('[API] Whisper error:', error);
      return res.status(500).json({ error: 'Transcription failed' });
    }

    const whisperResult = await whisperResponse.json();
    const transcribedText = whisperResult.text;
    
    console.log('[API] Transcription:', transcribedText);

    // 2. GPT interpretation
    const gptResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 150,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Parse this transcription: "${transcribedText}"` }
        ]
      }),
    });

    if (!gptResponse.ok) {
      const error = await gptResponse.text();
      console.error('[API] GPT error:', error);
      return res.status(500).json({ error: 'Interpretation failed' });
    }

    const gptResult = await gptResponse.json();
    const content = gptResult.choices[0]?.message?.content || '{}';
    
    console.log('[API] GPT result:', content);

    const parsed = JSON.parse(content);

    // Log for analytics (structured)
    console.log(JSON.stringify({
      event: 'voice_calculation',
      transcription: transcribedText,
      expression: parsed.expression,
      mode: parsed.mode,
      ip: ip.substring(0, 10) + '...',
      timestamp: new Date().toISOString(),
    }));

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('[API] Error:', error);
    return res.status(500).json({ error: 'Server processing error' });
  }
}
