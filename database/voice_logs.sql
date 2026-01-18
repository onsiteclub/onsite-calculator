-- database/voice_logs.sql
-- Schema para tabela de logs de voz do OnSite Calculator
-- Definido por Blueprint (Blue) - NAO ALTERAR ESTRUTURA SEM AUTORIZACAO
-- IMPORTANTE: Somente coletar dados se usuario tiver consentimento voice_training=true
-- Execute este script no SQL Editor do Supabase

-- Tabela de logs de voz
CREATE TABLE voice_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  app_name TEXT NOT NULL DEFAULT 'calculator',
  feature_context TEXT,                 -- 'main_calculator', 'voice_input'
  session_id UUID,                      -- Agrupar interacoes

  -- AUDIO
  audio_storage_path TEXT,              -- Path no storage (se salvar)
  audio_duration_ms INTEGER,            -- Duracao em ms
  audio_sample_rate INTEGER,
  audio_format TEXT,                    -- 'webm', 'wav'

  -- TRANSCRICAO
  transcription_raw TEXT,               -- Texto exato do Whisper
  transcription_normalized TEXT,        -- Apos normalizacao
  transcription_engine TEXT,            -- 'whisper-1'
  transcription_confidence DECIMAL(3,2),

  -- LINGUAGEM
  language_detected VARCHAR(10),        -- 'en', 'pt', 'es', 'fr'
  language_confidence DECIMAL(3,2),
  dialect_region TEXT,                  -- 'ontario', 'quebec', 'brazil'

  -- INTENCAO
  intent_detected TEXT,                 -- 'calculate', 'convert', 'unknown'
  intent_confidence DECIMAL(3,2),
  intent_fulfilled BOOLEAN,             -- Conseguiu executar?

  -- ENTIDADES EXTRAIDAS (OURO)
  entities JSONB DEFAULT '{}',          -- {"numbers": [...], "units": [...], "operators": [...]}

  -- TERMOS INFORMAIS (OURO MAXIMO)
  informal_terms JSONB DEFAULT '[]',    -- ["dois dedos", "five and a half"]

  -- QUALIDADE
  background_noise_level TEXT,          -- 'low', 'medium', 'high'
  background_noise_type TEXT,           -- 'construction', 'traffic', 'indoor'
  speech_clarity TEXT,                  -- 'clear', 'muffled', 'accented'

  -- RESULTADO
  was_successful BOOLEAN,
  error_type TEXT,                      -- 'transcription_failed', 'parse_failed', etc
  error_message TEXT,

  -- CORRECAO DO USUARIO (SUPERVISAO HUMANA)
  user_corrected BOOLEAN DEFAULT false,
  user_correction TEXT,                 -- O que o usuario digitou para corrigir
  correction_applied_at TIMESTAMPTZ,

  -- RETRY
  retry_count INTEGER DEFAULT 0,
  retry_of_id UUID REFERENCES voice_logs(id),

  -- DEVICE
  device_model TEXT,
  os TEXT,
  app_version TEXT,
  microphone_type TEXT,                 -- 'builtin', 'headset', 'bluetooth'

  -- LOCALIZACAO (se permitido)
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  client_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices para consultas eficientes
CREATE INDEX idx_voice_logs_user_id ON voice_logs(user_id);
CREATE INDEX idx_voice_logs_created_at ON voice_logs(created_at DESC);
CREATE INDEX idx_voice_logs_language ON voice_logs(language_detected);
CREATE INDEX idx_voice_logs_was_successful ON voice_logs(was_successful);
CREATE INDEX idx_voice_logs_session_id ON voice_logs(session_id);
CREATE INDEX idx_voice_logs_user_corrected ON voice_logs(user_corrected) WHERE user_corrected = true;

-- Indice GIN para busca em JSONB (entities e informal_terms)
CREATE INDEX idx_voice_logs_entities ON voice_logs USING GIN (entities);
CREATE INDEX idx_voice_logs_informal_terms ON voice_logs USING GIN (informal_terms);

-- RLS: Row Level Security
ALTER TABLE voice_logs ENABLE ROW LEVEL SECURITY;

-- Politica: Usuarios podem ver seus proprios logs de voz
CREATE POLICY "Users can view own voice_logs" ON voice_logs
  FOR SELECT USING (auth.uid() = user_id);

-- Politica: Usuarios podem inserir seus proprios logs (com consentimento verificado no app)
CREATE POLICY "Users can insert own voice_logs" ON voice_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Politica: Service role pode gerenciar todos os logs (para ML/analytics)
CREATE POLICY "Service role can manage voice_logs" ON voice_logs
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================
-- QUERIES UTEIS PARA ML E ANALYTICS
-- ============================================

-- Taxa de sucesso por idioma (ultimos 30 dias)
-- SELECT language_detected,
--   COUNT(*) as total,
--   COUNT(*) FILTER (WHERE was_successful = true) as success,
--   ROUND(100.0 * COUNT(*) FILTER (WHERE was_successful = true) / COUNT(*), 2) as success_rate
-- FROM voice_logs
-- WHERE created_at > NOW() - INTERVAL '30 days'
-- GROUP BY language_detected
-- ORDER BY total DESC;

-- Termos informais mais comuns (OURO para ML)
-- SELECT term, COUNT(*) as count
-- FROM voice_logs, jsonb_array_elements_text(informal_terms) as term
-- WHERE informal_terms != '[]'
-- GROUP BY term
-- ORDER BY count DESC
-- LIMIT 50;

-- Correcoes do usuario (supervisao humana)
-- SELECT transcription_raw, user_correction, COUNT(*) as occurrences
-- FROM voice_logs
-- WHERE user_corrected = true
-- GROUP BY transcription_raw, user_correction
-- ORDER BY occurrences DESC
-- LIMIT 100;

-- Entidades extraidas por tipo
-- SELECT
--   entities->>'numbers' as numbers,
--   entities->>'units' as units,
--   entities->>'operators' as operators
-- FROM voice_logs
-- WHERE entities != '{}'
-- LIMIT 100;

-- Erros mais comuns
-- SELECT error_type, error_message, COUNT(*) as count
-- FROM voice_logs
-- WHERE was_successful = false AND error_type IS NOT NULL
-- GROUP BY error_type, error_message
-- ORDER BY count DESC
-- LIMIT 20;

-- Qualidade de audio vs taxa de sucesso
-- SELECT background_noise_level,
--   COUNT(*) as total,
--   ROUND(100.0 * COUNT(*) FILTER (WHERE was_successful = true) / COUNT(*), 2) as success_rate
-- FROM voice_logs
-- WHERE background_noise_level IS NOT NULL
-- GROUP BY background_noise_level;

