-- database/consents.sql
-- Schema para tabela de consentimentos do OnSite Calculator
-- Necessario para verificar se usuario autorizou coleta de voz (voice_training)
-- Definido por Blueprint (Blue) - NAO ALTERAR ESTRUTURA SEM AUTORIZACAO
-- Execute este script no SQL Editor do Supabase

-- Tabela de consentimentos
CREATE TABLE consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- TIPO DE CONSENTIMENTO
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'voice_training',      -- Permissao para coletar dados de voz para ML
    'data_analytics',      -- Permissao para analytics gerais
    'marketing',           -- Permissao para marketing
    'terms_of_service',    -- Aceitou termos de uso
    'privacy_policy'       -- Aceitou politica de privacidade
  )),

  -- STATUS
  granted BOOLEAN NOT NULL DEFAULT false,

  -- AUDITORIA
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  -- VERSAO DO DOCUMENTO (para compliance)
  document_version TEXT,              -- Ex: 'tos_v1.2', 'privacy_v2.0'

  -- METADADOS
  ip_address TEXT,
  user_agent TEXT,
  app_version TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraint: um usuario so pode ter um consentimento por tipo
  UNIQUE(user_id, consent_type)
);

-- Indices
CREATE INDEX idx_consents_user_id ON consents(user_id);
CREATE INDEX idx_consents_type ON consents(consent_type);
CREATE INDEX idx_consents_granted ON consents(granted) WHERE granted = true;

-- RLS: Row Level Security
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

-- Politica: Usuarios podem ver seus proprios consentimentos
CREATE POLICY "Users can view own consents" ON consents
  FOR SELECT USING (auth.uid() = user_id);

-- Politica: Usuarios podem inserir/atualizar seus proprios consentimentos
CREATE POLICY "Users can manage own consents" ON consents
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own consents" ON consents
  FOR UPDATE USING (auth.uid() = user_id);

-- Politica: Service role pode gerenciar todos (para compliance/auditoria)
CREATE POLICY "Service role can manage consents" ON consents
  FOR ALL USING (auth.role() = 'service_role');

-- Trigger para atualizar updated_at
CREATE TRIGGER consents_updated_at
  BEFORE UPDATE ON consents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCAO PARA VERIFICAR CONSENTIMENTO
-- ============================================

-- Funcao para verificar se usuario tem consentimento ativo
CREATE OR REPLACE FUNCTION has_consent(
  p_user_id UUID,
  p_consent_type TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM consents
    WHERE user_id = p_user_id
    AND consent_type = p_consent_type
    AND granted = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- QUERIES UTEIS
-- ============================================

-- Ver todos os consentimentos de um usuario
-- SELECT * FROM consents WHERE user_id = 'UUID_DO_USUARIO';

-- Verificar se usuario tem voice_training ativo
-- SELECT has_consent('UUID_DO_USUARIO', 'voice_training');

-- Estatisticas de consentimento por tipo
-- SELECT consent_type,
--   COUNT(*) as total,
--   COUNT(*) FILTER (WHERE granted = true) as granted,
--   ROUND(100.0 * COUNT(*) FILTER (WHERE granted = true) / COUNT(*), 2) as grant_rate
-- FROM consents
-- GROUP BY consent_type;

-- Usuarios com voice_training ativo
-- SELECT user_id, granted_at
-- FROM consents
-- WHERE consent_type = 'voice_training' AND granted = true
-- ORDER BY granted_at DESC;

