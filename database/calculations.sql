-- database/calculations.sql
-- Schema para tabela de calculos do OnSite Calculator
-- Definido por Blueprint (Blue) - NAO ALTERAR ESTRUTURA SEM AUTORIZACAO
-- Execute este script no SQL Editor do Supabase

-- Tabela de calculos
CREATE TABLE calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- TIPO DE CALCULO
  calc_type TEXT NOT NULL CHECK (calc_type IN ('length', 'area', 'volume', 'material', 'conversion', 'custom')),
  calc_subtype TEXT,                    -- Ex: 'feet_inches', 'decimal', 'mixed'

  -- INPUT
  input_expression TEXT NOT NULL,       -- "5 1/2 + 3 1/4"
  input_values JSONB,                   -- Valores parseados

  -- OUTPUT
  result_value DECIMAL(20,6),           -- 8.75
  result_unit TEXT,                     -- 'inches', 'feet', 'decimal'
  result_formatted TEXT,                -- "8 3/4""

  -- METODO DE INPUT
  input_method TEXT NOT NULL CHECK (input_method IN ('keypad', 'voice', 'camera')),
  voice_log_id UUID,                    -- FK para voice_logs se input_method='voice'

  -- CONTEXTO
  template_id UUID,                     -- Se usou template
  trade_context TEXT,                   -- Trade do usuario no momento

  -- RESULTADO
  was_successful BOOLEAN DEFAULT true,
  was_saved BOOLEAN DEFAULT false,      -- Usuario salvou nos favoritos
  was_shared BOOLEAN DEFAULT false,     -- Usuario compartilhou

  -- DEVICE
  device_id TEXT,
  app_version TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indices para consultas eficientes
CREATE INDEX idx_calculations_user_id ON calculations(user_id);
CREATE INDEX idx_calculations_created_at ON calculations(created_at DESC);
CREATE INDEX idx_calculations_calc_type ON calculations(calc_type);
CREATE INDEX idx_calculations_input_method ON calculations(input_method);
CREATE INDEX idx_calculations_voice_log_id ON calculations(voice_log_id);

-- RLS: Row Level Security
ALTER TABLE calculations ENABLE ROW LEVEL SECURITY;

-- Politica: Usuarios podem ver seus proprios calculos
CREATE POLICY "Users can view own calculations" ON calculations
  FOR SELECT USING (auth.uid() = user_id);

-- Politica: Usuarios podem inserir seus proprios calculos
CREATE POLICY "Users can insert own calculations" ON calculations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Politica: Service role pode gerenciar todos os calculos (para analytics)
CREATE POLICY "Service role can manage calculations" ON calculations
  FOR ALL USING (auth.role() = 'service_role');

-- FK para voice_logs (adicionar apos criar tabela voice_logs)
-- ALTER TABLE calculations
--   ADD CONSTRAINT fk_calculations_voice_log
--   FOREIGN KEY (voice_log_id) REFERENCES voice_logs(id) ON DELETE SET NULL;

-- ============================================
-- QUERIES UTEIS PARA ANALYTICS
-- ============================================

-- Calculos por tipo (ultimos 7 dias)
-- SELECT calc_type, COUNT(*) as count
-- FROM calculations
-- WHERE created_at > NOW() - INTERVAL '7 days'
-- GROUP BY calc_type
-- ORDER BY count DESC;

-- Taxa de sucesso por metodo de input
-- SELECT input_method,
--   COUNT(*) as total,
--   COUNT(*) FILTER (WHERE was_successful = true) as success,
--   ROUND(100.0 * COUNT(*) FILTER (WHERE was_successful = true) / COUNT(*), 2) as success_rate
-- FROM calculations
-- WHERE created_at > NOW() - INTERVAL '7 days'
-- GROUP BY input_method;

-- Expressoes mais comuns
-- SELECT input_expression, COUNT(*) as count
-- FROM calculations
-- WHERE was_successful = true
-- GROUP BY input_expression
-- ORDER BY count DESC
-- LIMIT 20;

-- Calculos por trade
-- SELECT trade_context, COUNT(*) as count
-- FROM calculations
-- WHERE trade_context IS NOT NULL
-- GROUP BY trade_context
-- ORDER BY count DESC;

