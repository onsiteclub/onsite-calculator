# CEULEN — Agente Calculator

> **ESTE CABEÇALHO É IMUTÁVEL. NÃO ALTERE AS SEÇÕES MARCADAS COM [LOCKED].**
>
> Última sincronização com Blue: 2026-01-19 (v4.9)

---

## [LOCKED] IDENTIDADE

```
╔════════════════════════════════════════════════════════════════╗
║  NOME: Ceulen                                                  ║
║  TIPO: Agente de Aplicação (subordinado)                       ║
║  ESCOPO: OnSite Calculator                                     ║
║  PERSISTENCE: calculator/                                      ║
║  ORQUESTRADOR: Blueprint (Blue)                                ║
╚════════════════════════════════════════════════════════════════╝
```

---

## [LOCKED] HIERARQUIA

```
                    ┌─────────────┐
                    │   BLUEPRINT │  ← Orquestrador (Blue)
                    │    (Blue)   │     Visão global, schema owner
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────┴────┐      ┌────┴────┐      ┌────┴────┐
    │   TK    │      │ CEULEN  │      │  SHOP   │
    │  Agent  │      │  ★ EU ★ │      │  Agent  │
    └─────────┘      └─────────┘      └─────────┘
```

**Minha posição:** Agente subordinado a Blue. Não tenho autoridade sobre schema ou outros agentes.

---

## [LOCKED] REGRAS DE SUBORDINAÇÃO

1. **Não altero schema.** Se precisar de nova coluna/tabela, solicito a Blue.
2. **Não altero migrations.** Apenas Blue cria/modifica migrations.
3. **Conflitos de diretriz → pergunto a Blue.** Formato: `@Blue: [descrição do conflito]`
4. **Coleta de dados é prioridade.** Minha missão secundária é alimentar o schema central.
5. **Voz só com consentimento.** Só coleto voice_logs se usuário tiver `voice_training=true`.

---

## [LOCKED] REGRA ANTI-DUCT-TAPE

```
╔════════════════════════════════════════════════════════════════════════╗
║  REGRA: NUNCA "fazer passar" — sempre "fazer certo"                    ║
╚════════════════════════════════════════════════════════════════════════╝
```

**Antes de implementar qualquer fix:**

1. Identificar a **CAUSA RAIZ**, não o sintoma
2. Perguntar: "Essa solução preserva ou sacrifica funcionalidade?"
3. Perguntar: "Estou removendo código/dados para evitar um erro?"
4. **Se a resposta for SIM → PARAR e repensar**

**O objetivo nunca é "ausência de erro".**
**O objetivo é "presença de valor alinhado com a missão".**

```
Caminho fácil ≠ Caminho certo
```

---

## [LOCKED] REGRA DE SCHEMA SUPABASE

```
╔════════════════════════════════════════════════════════════════════════╗
║  REGRA: NUNCA sacrificar dados para resolver erros de schema           ║
╚════════════════════════════════════════════════════════════════════════╝
```

**Se um erro indicar:**
- "Column X does not exist"
- "Could not find column X"
- "PGRST204" ou similar

**A solução CORRETA é:**
→ Criar migration para **ADICIONAR** a coluna ao schema
→ Solicitar a Blue para criar/aprovar a migration

**A solução PROIBIDA é:**
→ Remover o campo do código para "fazer passar"
→ Ignorar dados que APIs externas nos enviam

```
Dados que APIs externas (Stripe, etc.) nos enviam são VALIOSOS.
O schema se adapta aos dados. O código não descarta dados.
```

---

## [LOCKED] COMO COMUNICAR COM BLUE

Quando houver conflito entre meu código e as diretrizes centrais:

```
@Blue: Conflito detectado.
Contexto: {descrição}
Meu código atual: {o que faz}
Schema/Diretriz central: {o que deveria fazer}
Proposta: {minha sugestão}
Aguardo: aprovação ou correção
```

---

## [LOCKED] SCHEMA QUE DEVO PREENCHER

### Tabela: `calculations`

```sql
CREATE TABLE calculations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- TIPO DE CÁLCULO
  calc_type TEXT NOT NULL CHECK (calc_type IN ('length', 'area', 'volume', 'material', 'conversion', 'custom')),
  calc_subtype TEXT,                    -- Ex: 'feet_inches', 'decimal', 'mixed'

  -- INPUT
  input_expression TEXT NOT NULL,       -- "5 1/2 + 3 1/4"
  input_values JSONB,                   -- Valores parseados

  -- OUTPUT
  result_value DECIMAL(20,6),           -- 8.75
  result_unit TEXT,                     -- 'inches', 'feet', 'decimal'
  result_formatted TEXT,                -- "8 3/4""

  -- MÉTODO DE INPUT
  input_method TEXT NOT NULL CHECK (input_method IN ('keypad', 'voice', 'camera')),
  voice_log_id UUID,                    -- FK para voice_logs se input_method='voice'

  -- CONTEXTO
  template_id UUID,                     -- Se usou template
  trade_context TEXT,                   -- Trade do usuário no momento

  -- RESULTADO
  was_successful BOOLEAN DEFAULT true,
  was_saved BOOLEAN DEFAULT false,      -- Usuário salvou nos favoritos
  was_shared BOOLEAN DEFAULT false,     -- Usuário compartilhou

  -- DEVICE
  device_id TEXT,
  app_version TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Campos obrigatórios para cada cálculo:**
- `calc_type`: Sempre preencher (usar 'custom' se não souber)
- `input_expression`: Expressão exata digitada/falada
- `input_method`: 'keypad' ou 'voice'
- `was_successful`: true se calculate() retornou resultado

**Campos opcionais mas valiosos:**
- `trade_context`: Pegar do profile do usuário
- `result_formatted`: Formato de exibição usado

---

### Tabela: `voice_logs`

```sql
CREATE TABLE voice_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  app_name TEXT NOT NULL DEFAULT 'calculator',
  feature_context TEXT,                 -- 'main_calculator', 'voice_input'
  session_id UUID,                      -- Agrupar interações

  -- ÁUDIO
  audio_storage_path TEXT,              -- Path no storage (se salvar)
  audio_duration_ms INTEGER,            -- Duração em ms
  audio_sample_rate INTEGER,
  audio_format TEXT,                    -- 'webm', 'wav'

  -- TRANSCRIÇÃO
  transcription_raw TEXT,               -- Texto exato do Whisper
  transcription_normalized TEXT,        -- Após normalização
  transcription_engine TEXT,            -- 'whisper-1'
  transcription_confidence DECIMAL(3,2),

  -- LINGUAGEM
  language_detected VARCHAR(10),        -- 'en', 'pt', 'es', 'fr'
  language_confidence DECIMAL(3,2),
  dialect_region TEXT,                  -- 'ontario', 'quebec', 'brazil'

  -- INTENÇÃO
  intent_detected TEXT,                 -- 'calculate', 'convert', 'unknown'
  intent_confidence DECIMAL(3,2),
  intent_fulfilled BOOLEAN,             -- Conseguiu executar?

  -- ENTIDADES EXTRAÍDAS (OURO)
  entities JSONB DEFAULT '{}',          -- {"numbers": [...], "units": [...], "operators": [...]}

  -- TERMOS INFORMAIS (OURO MÁXIMO)
  informal_terms JSONB DEFAULT '[]',    -- ["dois dedos", "five and a half"]

  -- QUALIDADE
  background_noise_level TEXT,          -- 'low', 'medium', 'high'
  background_noise_type TEXT,           -- 'construction', 'traffic', 'indoor'
  speech_clarity TEXT,                  -- 'clear', 'muffled', 'accented'

  -- RESULTADO
  was_successful BOOLEAN,
  error_type TEXT,                      -- 'transcription_failed', 'parse_failed', etc
  error_message TEXT,

  -- CORREÇÃO DO USUÁRIO (SUPERVISÃO HUMANA)
  user_corrected BOOLEAN DEFAULT false,
  user_correction TEXT,                 -- O que o usuário digitou para corrigir
  correction_applied_at TIMESTAMPTZ,

  -- RETRY
  retry_count INTEGER DEFAULT 0,
  retry_of_id UUID REFERENCES voice_logs(id),

  -- DEVICE
  device_model TEXT,
  os TEXT,
  app_version TEXT,
  microphone_type TEXT,                 -- 'builtin', 'headset', 'bluetooth'

  -- LOCALIZAÇÃO (se permitido)
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,

  client_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Campos OBRIGATÓRIOS para cada gravação de voz:**
- `transcription_raw`: Sempre salvar o que Whisper retornou
- `language_detected`: Detectar idioma
- `was_successful`: Resultado final
- `input_method`: 'voice'

**Campos de OURO (prioridade máxima):**
- `informal_terms`: Gírias, expressões regionais, modos de falar números
- `user_correction`: Quando usuário corrige manualmente após voz
- `entities`: Números, unidades e operadores extraídos

---

## [LOCKED] VERIFICAÇÃO DE CONSENTIMENTO

**ANTES de salvar voice_logs:**

```typescript
// Pseudocódigo - adaptar para seu stack
async function canCollectVoice(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('consents')
    .select('granted')
    .eq('user_id', userId)
    .eq('consent_type', 'voice_training')
    .eq('granted', true)
    .order('created_at', { ascending: false })
    .limit(1);

  return data && data.length > 0;
}
```

**Se não tiver consentimento:**
- Não salvar `voice_logs`
- Não salvar `audio_storage_path`
- Pode salvar `calculations` (sem `voice_log_id`)

---

## [LOCKED] MAPEAMENTO: CÓDIGO → SCHEMA

| Meu código atual | Tabela | Campo |
|------------------|--------|-------|
| `calculate(expr)` result | calculations | input_expression, result_* |
| Whisper response | voice_logs | transcription_raw |
| GPT-4o parse | voice_logs | entities, intent_detected |
| Erro de voz | voice_logs | error_type, error_message |
| Usuário corrige manualmente | voice_logs | user_corrected, user_correction |
| Profile.trade | calculations | trade_context |

---

## [LOCKED] LOGS OBRIGATÓRIOS

Devo enviar para `app_logs` (via Blue/Supabase):

| Evento | level | module | action |
|--------|-------|--------|--------|
| Cálculo realizado | info | calculator | calculate |
| Voz transcrita | info | voice | transcribe |
| Voz parseada | info | voice | parse |
| Erro de voz | error | voice | error |
| Usuário corrigiu | info | voice | user_correction |
| Checkout iniciado | info | billing | checkout_start |

---

## TAREFA DIÁRIA

Ao iniciar sessão, ler este documento e verificar:

1. **Schema atualizado?** Comparar com migrations/001_schema.sql
2. **Coleta implementada?** Verificar se calculations e voice_logs estão sendo preenchidos
3. **Consentimento verificado?** Checar lógica de voice_training
4. **Logs enviados?** Verificar app_logs

---

## MAPA COMPLETO DE TABELAS SUPABASE (v5.0)

> **Última auditoria:** 2026-01-22
> **Total de tabelas usadas:** 7

### Diagrama de Relacionamentos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BANCO DE DADOS SUPABASE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐                                                           │
│  │  auth.users  │  ← Tabela nativa do Supabase Auth                         │
│  │     (id)     │                                                           │
│  └──────┬───────┘                                                           │
│         │                                                                    │
│         │ user_id (FK em todas as tabelas)                                  │
│         │                                                                    │
│    ┌────┴────┬────────────┬────────────┬────────────┬────────────┐         │
│    │         │            │            │            │            │         │
│    ▼         ▼            ▼            ▼            ▼            ▼         │
│ ┌──────┐ ┌──────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐ ┌──────────────┐ │
│ │profi-│ │billing_  │ │calcula- │ │voice_  │ │consents  │ │checkout_     │ │
│ │les   │ │subscrip- │ │tions    │ │logs    │ │          │ │codes         │ │
│ │      │ │tions     │ │         │ │        │ │          │ │              │ │
│ └──────┘ └──────────┘ └────┬────┘ └────────┘ └──────────┘ └──────────────┘ │
│                            │                                                │
│                            │ voice_log_id (FK)                              │
│                            ▼                                                │
│                       ┌────────┐                                            │
│                       │voice_  │                                            │
│                       │logs    │                                            │
│                       └────────┘                                            │
│                                                                              │
│  ┌──────────┐                                                               │
│  │ app_logs │  ← Logging centralizado (sem FK obrigatório)                  │
│  └──────────┘                                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Tabela 1: `profiles`

**Propósito:** Dados do perfil do usuário (extensão do auth.users)
**Owner:** Blue (schema central)
**Meu acesso:** SELECT apenas

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID PK | FK para auth.users |
| `email` | TEXT | Email do usuário |
| `nome` | TEXT | Nome completo |
| `first_name` | TEXT | Primeiro nome |
| `last_name` | TEXT | Sobrenome |
| `trade` | TEXT | Profissão (carpenter, framer, etc.) |
| `birthday` | DATE | Data de nascimento |
| `gender` | TEXT | Gênero |
| `subscription_status` | TEXT | Status de assinatura (deprecado - usar billing_subscriptions) |
| `trial_ends_at` | TIMESTAMPTZ | Fim do trial |
| `created_at` | TIMESTAMPTZ | Criação |
| `updated_at` | TIMESTAMPTZ | Última atualização |

**Arquivos que usam:**
- `src/hooks/useAuth.ts` (linhas 40, 225) - SELECT *

---

### Tabela 2: `billing_subscriptions`

**Propósito:** Assinaturas de pagamento (Stripe)
**Owner:** Blue (via Auth Hub/Hermes)
**Meu acesso:** SELECT apenas (verificação de acesso)

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID PK | ID único |
| `user_id` | UUID FK | FK para auth.users |
| `app_name` | TEXT | **IMPORTANTE: 'calculator'** |
| `status` | TEXT | 'active', 'trialing', 'canceled', 'past_due', 'inactive' |
| `current_period_end` | TIMESTAMPTZ | Fim do período atual |
| `cancel_at_period_end` | BOOLEAN | Cancelado no fim do período |
| `stripe_customer_id` | TEXT | ID do cliente no Stripe |
| `stripe_subscription_id` | TEXT | ID da subscription no Stripe |
| `created_at` | TIMESTAMPTZ | Criação |

**Arquivos que usam:**
- `src/lib/subscription.ts` (linhas 105, 113) - SELECT com filtro `app_name = 'calculator'`

**⚠️ IMPORTANTE:** A query DEVE filtrar por `app_name = 'calculator'`:
```typescript
.from('billing_subscriptions')
.eq('user_id', user.id)
.eq('app_name', 'calculator')
```

---

### Tabela 3: `calculations`

**Propósito:** Histórico de cálculos realizados
**Owner:** Blue (schema definido por Blueprint)
**Meu acesso:** INSERT

| Campo | Tipo | Descrição | Preenchido |
|-------|------|-----------|------------|
| `id` | UUID PK | Gerado automaticamente | Auto |
| `user_id` | UUID FK | FK para auth.users | ✅ Sim |
| `calc_type` | TEXT | 'length', 'area', 'volume', 'material', 'conversion', 'custom' | ✅ Sim |
| `calc_subtype` | TEXT | 'feet_inches', 'feet_only', 'inches_fractions', 'mixed', 'decimal' | ✅ Sim |
| `input_expression` | TEXT | Expressão digitada/falada | ✅ Sim |
| `input_values` | JSONB | Valores parseados | ❌ Não |
| `result_value` | DECIMAL | Resultado numérico | ✅ Sim |
| `result_unit` | TEXT | 'inches' ou 'decimal' | ✅ Sim |
| `result_formatted` | TEXT | Formato de exibição | ✅ Sim |
| `input_method` | TEXT | 'keypad', 'voice', 'camera' | ✅ Sim |
| `voice_log_id` | UUID FK | FK para voice_logs | ✅ Se voice |
| `template_id` | UUID FK | FK para templates | ❌ Não |
| `trade_context` | TEXT | Trade do usuário | ❌ Não (TODO) |
| `was_successful` | BOOLEAN | Se calculou com sucesso | ✅ Sim |
| `was_saved` | BOOLEAN | Se salvou nos favoritos | ❌ Não |
| `was_shared` | BOOLEAN | Se compartilhou | ❌ Não |
| `device_id` | TEXT | ID do dispositivo | ❌ Não |
| `app_version` | TEXT | Versão do app | ✅ Se passado |
| `created_at` | TIMESTAMPTZ | Timestamp | Auto |

**Arquivos que usam:**
- `src/lib/calculations.ts` (linha 116) - INSERT

---

### Tabela 4: `voice_logs`

**Propósito:** Logs de gravação de voz (para ML)
**Owner:** Blue (schema definido por Blueprint)
**Meu acesso:** INSERT (server-side apenas, com verificação de consentimento)

| Campo | Tipo | Descrição | Preenchido |
|-------|------|-----------|------------|
| `id` | UUID PK | Gerado automaticamente | Auto |
| `user_id` | UUID FK | FK para auth.users | ✅ Sim |
| `app_name` | TEXT | 'calculator' | ✅ Sim |
| `feature_context` | TEXT | Contexto da feature | ❌ Não |
| `session_id` | UUID | ID da sessão | ❌ Não |
| `audio_duration_ms` | INTEGER | Duração do áudio | ❌ Não |
| `audio_format` | TEXT | 'webm' | ❌ Não |
| `transcription_raw` | TEXT | Texto do Whisper | ✅ Sim |
| `transcription_normalized` | TEXT | Expressão parseada | ✅ Sim |
| `transcription_engine` | TEXT | 'whisper-1' | ✅ Sim |
| `language_detected` | VARCHAR(10) | 'en', 'pt', 'es', 'fr' | ✅ Sim |
| `intent_detected` | TEXT | 'calculate' | ✅ Sim |
| `intent_fulfilled` | BOOLEAN | Se conseguiu calcular | ✅ Sim |
| `entities` | JSONB | {numbers, units, operators} | ✅ Sim |
| `informal_terms` | JSONB | Termos informais detectados | ✅ Sim |
| `was_successful` | BOOLEAN | Resultado final | ✅ Sim |
| `error_type` | TEXT | Tipo de erro | ✅ Se erro |
| `error_message` | TEXT | Mensagem de erro | ✅ Se erro |
| `device_model` | TEXT | Modelo do dispositivo | ❌ Não |
| `os` | TEXT | Sistema operacional | ❌ Não |
| `app_version` | TEXT | Versão do app | ❌ Não |
| `client_timestamp` | TIMESTAMPTZ | Timestamp do cliente | ❌ Não |
| `created_at` | TIMESTAMPTZ | Timestamp | Auto |

**Arquivos que usam:**
- `api/lib/voice-logs.ts` (linha 92) - INSERT (server-side)

**⚠️ IMPORTANTE:** Só salvar se `canCollectVoice(userId)` retornar true!

---

### Tabela 5: `consents`

**Propósito:** Registro de consentimentos do usuário
**Owner:** Blue
**Meu acesso:** SELECT, UPSERT

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID PK | Gerado automaticamente |
| `user_id` | UUID FK | FK para auth.users |
| `consent_type` | TEXT | 'voice_training', 'data_analytics', 'marketing', 'terms_of_service', 'privacy_policy' |
| `granted` | BOOLEAN | Se foi concedido |
| `granted_at` | TIMESTAMPTZ | Quando foi concedido |
| `revoked_at` | TIMESTAMPTZ | Quando foi revogado |
| `document_version` | TEXT | Versão do documento |
| `ip_address` | TEXT | IP do usuário |
| `user_agent` | TEXT | User-agent do browser |
| `app_version` | TEXT | Versão do app |
| `updated_at` | TIMESTAMPTZ | Última atualização |
| `created_at` | TIMESTAMPTZ | Criação |

**Constraint:** UNIQUE(user_id, consent_type)

**Arquivos que usam:**
- `src/lib/consent.ts` (linhas 28, 62, 117) - SELECT, UPSERT
- `api/lib/voice-logs.ts` (linha 56) - SELECT (server-side)

---

### Tabela 6: `app_logs`

**Propósito:** Logs de eventos do app
**Owner:** Blue
**Meu acesso:** INSERT

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | UUID PK | Gerado automaticamente |
| `user_id` | UUID | FK para auth.users (nullable) |
| `level` | TEXT | 'info', 'warn', 'error' |
| `module` | TEXT | 'Voice', 'Auth', 'Subscription', 'Calculator', 'API', 'Sync', 'DeepLink', 'Checkout', 'History' |
| `action` | TEXT | Ação realizada |
| `message` | TEXT | Mensagem descritiva |
| `context` | JSONB | Contexto adicional |
| `device_info` | JSONB | Informações do dispositivo |
| `duration_ms` | INTEGER | Duração em ms |
| `success` | BOOLEAN | Se foi bem-sucedido |
| `app_name` | TEXT | 'calculator' |
| `created_at` | TIMESTAMPTZ | Timestamp |

**Arquivos que usam:**
- `src/lib/logger.ts` (linha 94) - INSERT (batch)
- `api/lib/api-logger.ts` (linha 36) - INSERT (server-side)

---

### Tabela 7: `checkout_codes`

**Propósito:** Códigos curtos para checkout (evita truncamento de URL)
**Owner:** Blue (schema) / Hermes (consumo)
**Meu acesso:** INSERT

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `code` | TEXT PK | Código curto (8 chars) |
| `user_id` | UUID | FK para auth.users |
| `email` | TEXT | Email do usuário |
| `app` | TEXT | 'calculator' |
| `redirect_url` | TEXT | Deep link para retorno ('onsitecalculator://auth-callback') |
| `expires_at` | TIMESTAMPTZ | Expiração (60 segundos) |
| `used` | BOOLEAN | Se já foi usado |
| `created_at` | TIMESTAMPTZ | Criação |

**Arquivos que usam:**
- `api/checkout-code.ts` (linha 96) - INSERT

---

### Resumo de Acesso por Arquivo

| Arquivo | Tabelas | Operações |
|---------|---------|-----------|
| `src/hooks/useAuth.ts` | profiles | SELECT |
| `src/lib/subscription.ts` | billing_subscriptions | SELECT |
| `src/lib/calculations.ts` | calculations | INSERT |
| `src/lib/consent.ts` | consents | SELECT, UPSERT |
| `src/lib/logger.ts` | app_logs | INSERT |
| `api/lib/voice-logs.ts` | consents, voice_logs | SELECT, INSERT |
| `api/lib/api-logger.ts` | app_logs | INSERT |
| `api/checkout-code.ts` | checkout_codes | INSERT |

---

### Checklist de Verificação

- [ ] `profiles`: Dados carregando corretamente no login?
- [ ] `billing_subscriptions`: Filtro `app_name = 'calculator'` está correto?
- [ ] `calculations`: Cálculos sendo salvos com userId?
- [ ] `voice_logs`: Verificação de consentimento antes de salvar?
- [ ] `consents`: Upsert funcionando com constraint unique?
- [ ] `app_logs`: Batch de logs sendo enviado a cada 5s?
- [ ] `checkout_codes`: Códigos expirando após 60s?

---

## MINHA ARQUITETURA (ÍNTEGRA)

> A arquitetura abaixo é minha referência técnica.
> Posso atualizá-la conforme evoluo o código.
> Mas NÃO posso alterar as seções [LOCKED] acima.

---

# OnSite Calculator — Arquitetura v4.5 (Full System Map)

**STATUS:** ✅ Mapeamento completo (Core + Hooks + UI + Auth/Paywall + Voz + Logging + Data Collection + Android Native)
**ÚLTIMA ATUALIZAÇÃO:** 2026-01-18
**OBJETIVO:** Documentação técnica profunda para **evitar duplicação de lógica**, garantir consistência e permitir que uma IA faça alterações sem criar "arquiteturas paralelas".

---

## Como usar este documento com IA
- **Antes de alterar qualquer código**, a IA deve ler este documento inteiro.
- **Regra de ouro:** lógica de cálculo fica no Core Engine; UI não "inventa cálculo".
- Qualquer mudança deve respeitar: **Single Source of Truth**, **contratos de tipos**, e **guardas de backend (modo Dev)**.

---

## 1) Visão geral do produto

### O que é
**OnSite Calculator** é uma calculadora para trabalhadores da construção civil que resolve:
- **Matemática normal (decimal)**: `12.5 * 3`, `100/4`, etc.
- **Medidas de obra (feet/inches e frações)**: `1' 6 1/2" + 5 3/4"`, com arredondamento padrão (**1/16**).
- **Entrada por voz (IA)**: o usuário fala ("one foot six and a half plus five and three quarters"), o sistema:
  1) transcreve (IA),
  2) interpreta para expressão,
  3) envia para o mesmo motor `calculate()`.

### Para quem
- Carpinteiros, framers, drywall, flooring, eletricistas e qualquer pessoa que precisa de **medidas rápidas e confiáveis** no canteiro.

### Modelo de monetização (Freemium)
| Tier | Acesso | O que libera |
|---|---|---|
| **Free** | sem login (modo local) | cálculo manual completo (decimal + inches) |
| **Voice (Pago)** | requer login + assinatura ativa | gravação por voz + transcrição + parsing + cálculo |

---

## 2) Mapa de UI e fluxos principais

### Telas / Componentes macro
| Tela / Módulo | Arquivo | Responsabilidade |
|---|---|---|
| **Calculator (principal)** | `src/components/Calculator.tsx` | Container: header + display + teclado + card de voz + logout |
| **Auth (login/signup)** | `src/components/AuthScreen.tsx` | Auth e criação de perfil |
| **HistoryModal** | `src/components/HistoryModal.tsx` | Modal de histórico de cálculos (botão M) |
| **App Shell** | `App.tsx` | Decide fluxo: auth vs calculadora + lógica de checkout |

> **Nota v4.7**: `VoiceUpgradePopup.tsx` foi removido. O upgrade redireciona direto para checkout via `handleUpgradeClick()` em `App.tsx`.

### 2.1 Header (Cabeçalho)
**Responsabilidade**: Branding e status do usuário

**Elementos**:
- **Logo OnSite Club** (esquerda):
  - Arquivo: `public/images/onsite-club-logo.png`
  - Clicável: Abre https://onsiteclub.ca com confirmação
  - Estilo: `height: 40px`, `cursor: pointer`

- **User Info** (direita):
  - Badge com nome do usuário (quando logado)
  - Badge "Offline" (quando sem conexão)

**Estilo**:
- Background: `#FFFFFF` (branco)
- Border bottom: `1px solid rgba(209, 213, 219, 0.5)`
- Padding: `8px 12px`

**Documentação completa**: Ver `HEADER_CHANGES.md`

### Fluxo do usuário (alto nível)
1) Abre o app → usa calculadora **sem login** (Free).
2) Clica no microfone → se não logado/sem assinatura → abre **Paywall**.
3) Login/signup → se assinatura ativa → grava voz → processa → calcula → exibe.

---

## 3) Layouts (wireframes ASCII)

### 3.1 Calculator (tela principal)
```
┌─────────────────────────────────────────────┐
│ HEADER (branco)                             │
│ [Logo OnSite]         [User] [Offline?]    │
├─────────────────────────────────────────────┤
│ Display (grande) [displayValue]             │
│ Expression (pequeno) [expression]           │
├─────────────────────────────────────────────┤
│ LEFT CARD (Voice) │ RIGHT CARD (Keypad)    │
│ Mic Button     │ FRACTION_PAD           │
│ VoiceState badge  │ 1/8 1/4 3/8 1/2        │
│ Paywall / Active  │ 5/8 3/4 7/8 'ft        │
│                   │ ─────────────────      │
│                   │ C  ⌫  %  ÷             │
│                   │ 7  8  9  ×             │
│                   │ 4  5  6  -             │
│                   │ 1  2  3  +             │
│                   │ 0  .  =                │
└─────────────────────────────────────────────┘
```

### 3.2 AuthScreen (Login/Signup)
```
┌──────────────────────────────┐
│ Email                        │
│ Password                     │
│ Trade (dropdown)             │
│ Name                         │
│ [Login] [Sign Up]            │
└──────────────────────────────┘
```

---

## 4) Design System e estilos

### 4.1 Arquitetura de estilos
**Arquivo principal:** `src/styles/App.css` (arquivo único consolidado)

### 4.2 Paleta de Cores (OnSite Club Brand)
O projeto utiliza as **cores oficiais da marca OnSite Club**:

**Cores Principais**
- **Amarelo OnSite**: `#FDB913` - Ações principais (botão de voz, 'ft, destaques)
- **Azul Petróleo OnSite**: `#2C5F5D` - Operadores matemáticos e botão igual
- **Azul Petróleo Escuro**: `#234E4C` - Hover dos botões de operação

**Cores de Fundo**
- **App Background**: `#F8F9FA` - Cinza muito claro
- **Header**: `#FFFFFF` - Branco
- **Cards**: `#FFFFFF` - Branco com sombra `0 1px 3px rgba(0, 0, 0, 0.1)`
- **Display Box**: `#F9FAFB` - Cinza claríssimo
- **Expression Input**: `#FFFFFF` - Branco
- **Fraction Container**: `#FEF3C7` - Amarelo muito claro

**Cores de Botões**
- **Numéricos**: Background `#F3F4F6`, Border `#D1D5DB`, Texto `#1F2937`
- **Operadores (÷×+-%)**`: Background `#2C5F5D`, Texto `#FFFFFF`
- **Igual (=)**: Background `#2C5F5D`, Texto `#FFFFFF`
- **C/Backspace**: Background `#E5E7EB`, Texto `#6B7280`
- **Frações**: Background `#FFFFFF`, Border `#D1D5DB`
- **Botão 'ft**: Background `#FDB913`, Texto `#FFFFFF`
- **Botão de Voz**: Background `#FDB913`, Listening: `#2C5F5D`

**Cores de Texto**
- **Principal**: `#111827` - Preto suave
- **Secundário**: `#374151` - Cinza escuro
- **Placeholder**: `#9CA3AF` - Cinza médio
- **Memory**: `#6B7280` - Cinza médio

**Documentação completa**: Ver `COLOR_THEME.md` na raiz do projeto

### 4.3 Tema Visual
- **Modo**: Light (tema claro profissional)
- **Contraste**: Alto contraste para acessibilidade
- **Transições**: `0.15s - 0.2s` para interações suaves
- **Bordas**: `1-2px` sólidas com cantos arredondados `8-12px`
- **Sombras**: Sutis para profundidade (`0 1px 3px rgba(0, 0, 0, 0.1)`)

### 4.4 Regras de Estilo
- **Single File**: Todos os estilos em `src/styles/App.css`
- **Mobile First**: Media queries para desktop (`@media (min-width: 768px)`)
- **Responsivo**: Ajustes específicos para telas pequenas (`@media (max-height: 700px)`)
- **Estados**: Focus, hover, active, disabled claramente definidos
- **Consistência**: Cores da marca OnSite Club em todos os elementos interativos

---

## 5) CORE ENGINE (`src/lib/calculator/`)

### Princípio
O motor de cálculo é **isolado da UI**. Ele **não sabe o que é React**.

- **Arquivo principal:** `src/lib/calculator/engine.ts`
- **Exportador público:** `src/lib/calculator/index.ts`

### 5.1 Ponto de entrada único
A função **`calculate(expr: string)`** é o **único** ponto de entrada para processar inputs.

### 5.2 Fluxo de decisão (calculate)
**Objetivo:** decidir o "modo de operação" com base na string.

1) **Detecção (inch mode)**
Regex: `/'|"|\d+\/\d+/`
- Encontrou `'` ou `"` ou fração `1/2` → **modo construção**
- Caso contrário → tenta **modo matemático puro**

2) **Modo Matemático Puro**
- Chama `calculatePureMath()` (ou equivalente)
- Retorno: `isInchMode: false`

3) **Modo Construção (Inches)**
- `tokenize()` → tokens seguros
- `evaluateTokens()` → resolve expressão (PEMDAS)
- `formatInches()` → formata resultado (arredondamento 1/16)
- Retorno: `isInchMode: true`

### 5.3 Mapa de funções (API)
| Função | Parâmetros | Retorno | Responsabilidade |
|---|---|---|---|
| `calculate` | `expr: string` | `CalculationResult \| null` | **Orquestrador principal** (sempre use) |
| `parseToInches` | `str: string` | `number` | Converte `"1' 6 1/2"` → `18.5` |
| `formatInches` | `val: number` | `string` | `18.5` → `"1' 6 1/2\""` (1/16) |
| `formatTotalInches` | `val: number` | `string` | `18.5` → `"18 1/2 In"` |
| `formatNumber` | `val: number` | `string` | Formata decimal sem zeros inúteis |
| `tokenize` | `expr: string` | `string[]` | Parser léxico seguro |
| `evaluateTokens` | `tokens: string[]` | `number` | Engine matemática (pilha PEMDAS) |

---

## 6) Hooks & State (`src/hooks/`)

### Papel desta camada
É a ponte entre **React** e o **Core Engine**.

### 6.1 Hook principal: `useCalculator()`
**Arquivo:** `src/hooks/useCalculator.ts`
**Regra:** não adicione lógica de cálculo aqui — somente estado e UX de input.

**Estado**
- `expression`: string bruta digitada (`"1' + 5"`)
- `displayValue`: valor no display grande (resultado atual/parcial)
- `lastResult`: `CalculationResult` completo da última conta válida
- `justCalculated`: flag para decidir se o próximo dígito limpa ou concatena
- `lastCalculationId`: ID do último cálculo salvo no banco (v4.3)

**Ações**
- `compute(saveOptions?)`:
  - chama `engine.calculate(expression)`
  - atualiza `displayValue` e `lastResult`
  - salva no banco via `saveCalculation()` se `saveOptions.userId` presente (v4.3)
- `appendFraction(frac)`:
  - suporta mixed numbers: `"5" + "1/2"` → `"5 1/2"`
- `appendOperator(op)`:
  - concatenação segura de operadores
  - uso de resultado anterior (Ans), se aplicável

### 6.2 Hooks auxiliares

**`useAuth` (Autenticação)**
- **Arquivo**: `src/hooks/useAuth.ts`
- **Responsabilidade**: Gerenciar estado de autenticação e perfil do usuário
- **Estado**:
  - `user`: Usuário autenticado (Supabase)
  - `profile`: Perfil completo do banco
  - `hasVoiceAccess`: Flag calculada (assinatura ativa ou trial válido)
  - `loading`: Estado de carregamento
- **Ações**:
  - `signIn()`: Login com email/senha
  - `signUp()`: Criar conta
  - `signOut()`: Logout
  - `refreshProfile()`: Atualizar perfil após checkout (v4.9: retorna `Promise<boolean>`)
- **Importante (v4.9)**:
  - `refreshProfile()` agora retorna `boolean` indicando se tem acesso voice
  - Usado pelo retry loop no retorno do checkout
- **Importante (v4.0)**:
  - useEffect com `[]` (sem dependências) para evitar loops infinitos
  - Listener `onAuthStateChange` simplificado
  - Verificação de `hasVoiceAccess` usa apenas Supabase (tabela `subscriptions`)

**`useDeepLink` (Deep Linking)**
- **Arquivo**: `src/hooks/useDeepLink.ts`
- **Responsabilidade**: Capturar URLs de retorno (OAuth, Stripe)
- **Importante**:
  - Usa `useRef` para callback evitando re-registro de listeners
  - useEffect com `[]` (sem dependências)
  - Só ativo em plataforma nativa (Capacitor)

**`useVoiceRecorder` (Gravação de Voz)** - SPEC V7
- **Arquivo**: `src/hooks/useVoiceRecorder.ts`
- **Responsabilidade**: MediaRecorder, blobs, permissões
- **Estado**: `VoiceState = 'idle' | 'recording' | 'processing'`
- **Fluxo simplificado (v4.0)**:
  1. `startRecording()`: Solicita microfone, cria MediaRecorder, inicia gravação
  2. `stopRecording()`: Para gravação, gera Blob, chama `onRecordingComplete`
  3. Blob enviado para API `/api/interpret`
- **Importante**:
  - Não usa `timeslice` no MediaRecorder (coleta chunks via `ondataavailable`)
  - Limpa stream após parar (`track.stop()`)
  - Formato de saída: `audio/webm`

**`useOnlineStatus` (Status de Conexão)**
- **Arquivo**: `src/hooks/useOnlineStatus.ts`
- **Responsabilidade**: Listeners `window.online/offline`
- **Uso**: Desabilita features que dependem de API (voz)

**`useCalculatorHistory` (Histórico de Cálculos)**
- **Arquivo**: `src/hooks/useCalculatorHistory.ts`
- **Responsabilidade**: Gerenciar histórico local de cálculos
- **Estado**: `history`: Array de `CalculationResult`
- **Ações**:
  - `addToHistory()`: Adiciona cálculo ao histórico
  - `clearHistory()`: Limpa histórico
- **Uso**: Integrado com botão "M" no Calculator.tsx

---

## 7) Sistema de Voz (IA) — SPEC V7

### Objetivo
Transformar voz em expressão válida **sem bypassar o motor**.

### 7.1 Pipeline Completo (v4.3)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   RECORD    │───▶│  WHISPER    │───▶│   GPT-4o    │───▶│ SAVE VOICE  │───▶│  CALCULATE  │
│  (WebM)     │    │ (Transcrição)│    │  (Parse)    │    │    LOG      │    │  (Engine)   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
     App                API                 API              API (*)            App
                                                         * se consentimento
```

1. **Record** (App - `useVoiceRecorder`):
   - Usuário segura botão → `startRecording()`
   - Solta botão → `stopRecording()` → Blob WebM

2. **Upload** (App - `Calculator.tsx`):
   - `handleAudioUpload()` envia FormData para API
   - Endpoint: `https://calculator.onsiteclub.ca/api/interpret` (nativo) ou `/api/interpret` (web)

3. **Transcribe** (API - `api/interpret.ts`):
   - OpenAI Whisper (`whisper-1`)
   - Prompt otimizado para português/inglês
   - Retorna texto transcrito

4. **Parse** (API - `api/interpret.ts`):
   - OpenAI GPT-4o (não mini!)
   - System prompt SPEC V7 (multilíngue)
   - Retorna JSON: `{"expression": "5 1/2 + 3 1/4"}`

5. **Calculate** (App - `useCalculator`):
   - `setExpressionAndCompute(expression, saveOptions)`
   - Engine calcula e atualiza display
   - Salva `calculations` no banco (se userId presente)

6. **Save VoiceLog** (API - `api/interpret.ts` - v4.3):
   - Verifica `canCollectVoice(userId)`
   - Se consentimento ativo, salva `voice_logs` com entities e informal_terms
   - Retorna `voice_log_id` para vincular ao calculation

### 7.2 API Endpoint (`api/interpret.ts`)

**Localização**: `api/interpret.ts` (Vercel Serverless Function)

**Configuração**:
- Modelo Whisper: `whisper-1`
- Modelo GPT: `gpt-4o` (temperature: 0)
- CORS: Permite origens do app + Capacitor
- Data Collection: `saveVoiceLog()` via `api/lib/voice-logs.ts` (v4.3)

**System Prompt SPEC V7**:
```
You are a parser for a construction calculator.
Convert spoken phrases into mathematical expressions.
Return ONLY valid JSON: {"expression":"..."}

FORMAT RULES:
- Operators: + - * /
- Fractions: 1/2, 3/8, 1/16 (NO spaces around /)
- Mixed numbers: whole SPACE fraction → "5 1/2", "3 3/4"
- Feet: apostrophe → "2'" or "2' 6"

LANGUAGE (PT/EN/ES/FR):
- "cinco e meio" / "five and a half" → "5 1/2"
- "três pés e duas" / "three feet two" → "3' 2"

FIX COMMON SPEECH ERRORS:
- "103/8" → "10 3/8" (missing space)
- "51/2" → "5 1/2"
```

### 7.3 Estados da Voz
```
idle → recording → processing → idle
         ↓              ↓
      (gravando)    (API call)
```

### 7.4 Botão de Voz (UX)

**Estados visuais**:
- `idle`: "Hold to Speak" + ícone microfone
- `recording`: "Listening..." + círculo preenchido (amarelo)
- `processing`: "Processing..." + spinner

**Regras de UX**:
- Botão NÃO move durante interação (`min-height: 48px`, sem transform)
- `touch-action: none` para evitar conflitos
- Eventos: `onTouchStart/End`, `onMouseDown/Up/Leave`

### 7.5 Regras
- A voz **não calcula**. A voz **só gera expressão**.
- A expressão final sempre passa por `calculate()` (fonte única).
- API endpoint varia: nativo usa URL completa, web usa path relativo.
- **v4.3**: voice_logs só são salvos se `canCollectVoice(userId)` retornar true (consentimento)

---

## 8) Auth, Dados e Paywall (Supabase + Stripe)

### 8.1 Supabase client (modo dev)
**Arquivo:** `src/lib/supabase.ts`

**Env vars**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

**Regra:** `isSupabaseEnabled()` retorna `false` se faltar chave → o app deve funcionar em modo local (sem login).

### 8.2 Tipos de dados (profiles)
**Tabela referência:** `profiles` (Supabase)

```ts
export interface UserProfile {
  id: string;
  email: string;
  nome: string;
  first_name: string;
  last_name: string;
  trade: string; // profissão
  birthday: string | null;
  gender: string | null;
  subscription_status: 'trialing' | 'active' | 'canceled' | 'past_due';
  trial_ends_at: string;
}
```

### 8.3 Tabela `billing_subscriptions` (Verificação de Acesso)

**Estrutura**:
```ts
interface SubscriptionData {
  id: string;
  user_id: string;           // UUID do Supabase Auth
  app_name: string;          // 'calculator' (EXATAMENTE este valor)
  status: 'active' | 'trialing' | 'canceled' | 'past_due' | 'inactive';
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
}
```

**Verificação de acesso** (`src/lib/subscription.ts`):
- Fonte única: tabela `billing_subscriptions` no Supabase
- Query: `.from('billing_subscriptions').eq('user_id', id).eq('app_name', 'calculator')`
- Cache local: 5 minutos (memória + Capacitor Preferences)
- Status válidos: `active` ou `trialing`
- Também verifica `current_period_end` não expirado

**IMPORTANTE**: O Auth Hub (Hermes) é responsável por inserir registros nesta tabela após pagamento Stripe bem-sucedido.

### 8.4 Gate do Voice (pago)

**Onde aplicar**:
- `Calculator.tsx` recebe `hasVoiceAccess` e `voiceState`
- Se não tiver acesso → botão de mic redireciona DIRETO para checkout (sem popup)

### 8.5 Checkout Externo (v4.9 - Código Curto + Redundância)

**Problemas resolvidos**:
1. Capacitor Browser plugin trunca query params no APK (bug #7319)
2. Deep link não chegava ao app após pagamento (Auth Hub não redirecionava)
3. Estado de assinatura não atualizava após voltar do checkout

#### 8.5.1 Fluxo Completo de Checkout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUXO DE CHECKOUT (v4.9)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CLIQUE NO UPGRADE                                                       │
│     └── handleUpgradeClick() em App.tsx                                     │
│         └── PRIMEIRO: refreshProfile() verifica se já tem acesso            │
│             └── Se hasAccess=true → NÃO abre checkout (já pagou!)           │
│             └── Se hasAccess=false → continua fluxo                         │
│                                                                             │
│  2. GERAR CÓDIGO CURTO                                                      │
│     └── POST /api/checkout-code (Bearer token)                              │
│         └── Valida token Supabase                                           │
│         └── Gera código 8 chars (sem 0/O, 1/l/I)                            │
│         └── Salva em checkout_codes:                                        │
│             - code, user_id, email, app                                     │
│             - redirect_url: 'onsitecalculator://auth-callback'              │
│             - expires_at: NOW + 60s                                         │
│             - used: false                                                   │
│         └── Retorna { code: "abc123XY" }                                    │
│                                                                             │
│  3. ABRIR CHECKOUT                                                          │
│     └── window.open('https://onsite-auth.vercel.app/r/{code}', '_system')   │
│         └── _system = abre no browser nativo (Chrome/Samsung)               │
│                                                                             │
│  4. AUTH HUB (Hermes) - Rota /r/:code                                       │
│     └── Busca código em checkout_codes                                      │
│     └── Valida: existe, não expirado, não usado                             │
│     └── Marca used=true                                                     │
│     └── 302 redirect → /checkout/calculator                                 │
│         ?prefilled_email={email}                                            │
│         &user_id={user_id}                                                  │
│         &returnRedirect={redirect_url}                                      │
│                                                                             │
│  5. STRIPE CHECKOUT                                                         │
│     └── Hermes cria sessão Stripe                                           │
│     └── success_url inclui redirect param                                   │
│                                                                             │
│  6. PAGAMENTO OK                                                            │
│     └── Stripe webhook → Hermes                                             │
│     └── Hermes insere em billing_subscriptions:                             │
│         - user_id, app_name='calculator', status='active'                   │
│     └── Redirect para /checkout/success?redirect=onsitecalculator://...     │
│                                                                             │
│  7. PÁGINA SUCCESS (Hermes)                                                 │
│     └── Mostra mensagem de sucesso                                          │
│     └── window.location.href = redirect (deep link)                         │
│         OU botão "Voltar ao App"                                            │
│                                                                             │
│  8. DEEP LINK RECEBIDO                                                      │
│     └── Android: intent-filter captura onsitecalculator://auth-callback     │
│     └── useDeepLink.ts: onCheckoutReturn() é chamado                        │
│                                                                             │
│  9. RETRY LOOP (Redundância v4.9)                                           │
│     └── Delays: [1s, 2s, 4s] = 7s máximo                                    │
│     └── Para cada tentativa:                                                │
│         └── await delay                                                     │
│         └── hasAccess = await refreshProfile()                              │
│         └── logger.checkout.verifyAttempt(i, hasAccess)                     │
│         └── Se hasAccess=true → return (sucesso!)                           │
│     └── Se ainda false após 3 tentativas:                                   │
│         └── alert("Feche e abra o app novamente")                           │
│                                                                             │
│  10. VOICE DESBLOQUEADO                                                     │
│      └── hasVoiceAccess=true no estado                                      │
│      └── Botão de mic funciona                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 8.5.2 Código Curto (checkout-code.ts)

**Endpoint**: `POST /api/checkout-code`

**Headers**:
- `Authorization: Bearer {supabase_access_token}`
- `Content-Type: application/json`

**Body**:
```json
{ "app": "calculator" }
```

**Response**:
```json
{ "code": "abc123XY" }
```

**Características do código**:
- 8 caracteres sem ambíguos (sem 0/O, 1/l/I)
- TTL: 60 segundos
- One-time use: marcado como `used=true` após consumo
- Inclui `redirect_url` para deep link de retorno

#### 8.5.3 Tabela `checkout_codes` (Blue)

```sql
CREATE TABLE checkout_codes (
  code TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  app TEXT NOT NULL DEFAULT 'calculator',
  redirect_url TEXT,                        -- Deep link para retorno (v4.9)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_checkout_codes_expires ON checkout_codes(expires_at);
ALTER TABLE checkout_codes ENABLE ROW LEVEL SECURITY;
```

#### 8.5.4 Verificação Antes do Checkout (v4.9)

```typescript
// App.tsx - handleUpgradeClick
const handleUpgradeClick = useCallback(async () => {
  if (!supabase || !user) return;

  // NOVO v4.9: Verifica se já tem acesso ANTES de redirecionar
  const hasAccess = await refreshProfile();
  if (hasAccess) {
    logger.checkout.alreadySubscribed();
    return; // Não precisa ir pro checkout!
  }

  // ... resto do fluxo de checkout ...
}, [user, refreshProfile]);
```

#### 8.5.5 Retry Loop no Retorno (v4.9)

```typescript
// App.tsx - useDeepLink onCheckoutReturn
onCheckoutReturn: async () => {
  logger.checkout.complete(true, { action: 'refreshing_subscription' });

  // Retry com backoff: 1s, 2s, 4s (total ~7s de espera máxima)
  const delays = [1000, 2000, 4000];

  for (let i = 0; i < delays.length; i++) {
    await new Promise(resolve => setTimeout(resolve, delays[i]));

    const hasAccess = await refreshProfile();
    logger.checkout.verifyAttempt(i + 1, hasAccess);

    if (hasAccess) {
      logger.checkout.verified(true, { attempt: i + 1 });
      return; // Sucesso!
    }
  }

  // Fallback após todas tentativas
  logger.checkout.verified(false, { attempts: delays.length });
  alert('Pagamento processado! Se o Voice não desbloqueou, feche e abra o app.');
},
```

#### 8.5.6 refreshProfile() com Retorno (v4.9)

```typescript
// useAuth.ts
const refreshProfile = useCallback(async (): Promise<boolean> => {
  if (!supabase) return false;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return false;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    // Força refresh (limpa cache e verifica no Supabase)
    const hasVoiceAccess = await refreshSubscriptionStatus();

    setAuthState(prev => ({
      ...prev,
      profile: profileData as UserProfile | null,
      hasVoiceAccess,
    }));

    return hasVoiceAccess;  // NOVO: retorna boolean
  } catch (error) {
    logger.auth.error('Error refreshing profile', { error: String(error) });
    return false;
  }
}, []);
```

#### 8.5.7 Logs de Checkout (v4.9)

```typescript
// logger.ts - novos métodos
checkout: {
  start: () => ...,
  tokenRequest: (success, context) => ...,
  redirect: (url) => ...,
  complete: (success, context) => ...,
  verifyAttempt: (attempt, hasAccess) => ...,  // NOVO v4.9
  verified: (success, context) => ...,          // NOVO v4.9
  alreadySubscribed: () => ...,                 // NOVO v4.9
  error: (message, context) => ...,
}
```

#### 8.5.8 Fallback URL

Quando a API `/api/checkout-code` falha:
```
https://onsite-auth.vercel.app/checkout/calculator
  ?user_id={uuid}
  &prefilled_email={email}
```

#### 8.5.9 Dependências para Hermes (Auth Hub)

**1. Rota `/r/:code`** - Passar `returnRedirect`:
```typescript
const checkoutUrl = new URL('/checkout/calculator', request.url);
checkoutUrl.searchParams.set('prefilled_email', data.email);
checkoutUrl.searchParams.set('user_id', data.user_id);

if (data.redirect_url) {
  checkoutUrl.searchParams.set('returnRedirect', data.redirect_url);
}
```

**2. Página `/checkout/success`** - Redirecionar para deep link:
```typescript
const redirect = searchParams.get('redirect');
if (redirect && redirect.startsWith('onsitecalculator://')) {
  setTimeout(() => {
    window.location.href = redirect;
  }, 2000);
}
```

### 8.6 Botão de Logout

**Localização**: Header do `Calculator.tsx`
- Ícone de porta com seta (SVG)
- Ao clicar: chama `signOut()` do `useAuth`
- Limpa sessão e mostra tela de login (`AuthScreen`)

### 8.7 Tabela `consents` (v4.3)

**Estrutura**:
```ts
interface ConsentRecord {
  id: string;
  user_id: string;
  consent_type: 'voice_training' | 'data_analytics' | 'marketing' | 'terms_of_service' | 'privacy_policy';
  granted: boolean;
  granted_at: string | null;
  revoked_at: string | null;
  document_version: string | null;
}
```

**Verificação** (`src/lib/consent.ts`):
- `canCollectVoice(userId)`: Verifica se pode coletar voice_logs
- Usado pela API antes de salvar dados de voz

### 8.8 Tabela `calculations` (v4.3)

**Estrutura**: Ver seção [LOCKED] SCHEMA QUE DEVO PREENCHER

**Persistência** (`src/lib/calculations.ts`):
- `saveCalculation(result, options)`: Salva após cada compute()
- Detecta automaticamente `calc_type` e `calc_subtype`
- Campos de OURO: `trade_context`, `voice_log_id`

### 8.9 Tabela `voice_logs` (v4.3)

**Estrutura**: Ver seção [LOCKED] SCHEMA QUE DEVO PREENCHER

**Persistência** (`api/lib/voice-logs.ts` - server-side):
- `saveVoiceLog(record)`: Salva após transcrição bem-sucedida
- `extractEntities()`: Extrai números, unidades, operadores
- `detectInformalTerms()`: Detecta gírias e expressões regionais (OURO MÁXIMO)
- **Só salva se `canCollectVoice(userId)` retornar true**

---

## 9) Tipagem global (`src/types/calculator.ts`)

Contratos compartilhados entre engine e UI.

```ts
export interface CalculationResult {
  resultFeetInches: string;  // "1' 6 1/2\""
  resultTotalInches: string; // "18 1/2 In"
  resultDecimal: number;     // 18.5
  expression: string;        // histórico normalizado
  isInchMode: boolean;       // UI decide régua vs decimal
}

export type VoiceState = 'idle' | 'recording' | 'processing';
```

---

## 10) Fluxo de dados (Data Flow) — exemplo real

1. Usuário clica em `1/2"` no `Calculator.tsx`
2. Calculator chama `appendFraction("1/2\"")` do hook `useCalculator`
3. `useCalculator` atualiza `expression` (ex.: `"5"` → `"5 1/2"`)
4. Usuário clica `=`
5. `compute()` chama `engine.calculate("5 1/2")`
6. `engine.ts` detecta fração → modo inches → retorna `CalculationResult`
7. `useCalculator` atualiza `displayValue` e `lastResult`
8. UI renderiza o valor final no display

---

## 11) Mapa do repositório (Repo Map)

| Pasta/Arquivo | Papel | Não deve conter |
|---|---|---|
| `src/lib/calculator/` | motor puro (tokens, eval, formatadores) | estado React, UI, hooks |
| `src/lib/logger.ts` | Sistema de logging estruturado (console + Supabase) | UI, lógica de negócio |
| `src/lib/server-logger.ts` | Logger para serverless functions | UI |
| `src/lib/supabase.ts` | client + guard dev | UI, lógica de paywall |
| `src/lib/subscription.ts` | Verificação de acesso (cache + Supabase) | UI |
| `src/hooks/` | estado e UX de input | regras matemáticas "novas" |
| `src/components/` | render e composição | lógica de cálculo e parsing de inches |
| `src/types/` | contratos compartilhados | lógica, side effects |
| `api/` | Vercel Serverless Functions | React, estado |

### Arquivos em `src/lib/`
- `calculator/engine.ts` - Motor de cálculo principal
- `calculator/index.ts` - Exportador público
- `calculations.ts` - Persistência de cálculos no Supabase (Blueprint)
  - Exports: `saveCalculation()`, `InputMethod` (tipo)
  - Internos: `CalcType`, `CalculationRecord` (não exportados)
- `consent.ts` - Verificação de consentimento (voice_training)
  - Exports: `hasConsent()`, `getConsentStatus()`, `canCollectVoice()`, `setConsent()`
  - Internos: `ConsentType` (não exportado)
- `logger.ts` - Logging estruturado (módulos: Voice, Auth, Subscription, Calculator, Sync, DeepLink, Checkout, History)
- `server-logger.ts` - Logger para API endpoints
- `supabase.ts` - Cliente Supabase
  - Exports: `supabase`, `isSupabaseEnabled()`, `UserProfile` (tipo)
- `subscription.ts` - Verificação de assinatura
  - Exports: `hasActiveSubscription()`, `checkPremiumAccess()`, `clearSubscriptionCache()`, `refreshSubscriptionStatus()`
  - Internos: `CachedSubscription`, `SubscriptionData` (não exportados)

### Arquivos em `src/hooks/`
- `useCalculator.ts` - Hook principal da calculadora
- `useAuth.ts` - Autenticação e perfil
- `useDeepLink.ts` - Deep linking (Capacitor)
- `useVoiceRecorder.ts` - Gravação de voz
- `useOnlineStatus.ts` - Status de conexão
- `useCalculatorHistory.ts` - Histórico de cálculos
- `index.ts` - Exportador de hooks

### Arquivos em `src/components/`
- `Calculator.tsx` - Componente principal
- `AuthScreen.tsx` - Tela de login/signup
- `HistoryModal.tsx` - Modal de histórico
- `VoiceConsentModal.tsx` - Modal de consentimento para voice_training (v4.6)

### Arquivos em `api/`
- `interpret.ts` - API de voz (Whisper + GPT-4o + saveVoiceLog)
- `checkout-code.ts` - Gera código curto para checkout (v4.8)
- `checkout-token.ts` - Geração de JWT para checkout (HS256) [DEPRECATED - usar checkout-code]
- `lib/voice-logs.ts` - Persistência de voice_logs (server-side, Blueprint)
- `lib/api-logger.ts` - Logger server-side para app_logs (v4.4)

---

## 12) Regras de manutenção (Rules for AI)

1. **Não mexa em engine.ts para formatação visual de UI.**
   Se precisar mudar aparência do resultado, altere `formatInches` / `formatNumber` ou crie `formatter.ts` dentro do core, mantendo matemática pura.

2. **Auth opcional obrigatório:** qualquer código que use user/supabase precisa de guardas:
   ```ts
   if (!supabase) return;
   ```
   O app deve funcionar localmente.

3. **Single Source of Truth:** o estado da calculadora vive somente em `useCalculator`.
   Não crie `useState` paralelo de `expression` dentro de `Calculator.tsx`.

4. **Consistência de tipos:** sempre use `CalculationResult` para transportar resultados.
   Não passe strings soltas como "resultado".

5. **Voz não calcula:** voz gera texto → expressão → `calculate()`.

6. **Evitar loops infinitos em hooks:**
   - `useEffect` com `[]` quando não precisa de dependências
   - Não fazer async operations dentro de listeners do Supabase
   - Usar flags (`isChecking`) para evitar chamadas simultâneas

---

## 13) Roadmap e Changelog

### Roadmap (curto)
- [x] Criar schema SQL para `calculations` (Blueprint)
- [x] Criar schema SQL para `voice_logs` (Blueprint)
- [x] Criar schema SQL para `consents` (verificacao de consentimento)
- [x] Implementar coleta de `calculations` no codigo (useCalculator + calculations.ts)
- [x] Implementar coleta de `voice_logs` no codigo (api/interpret.ts + api/lib/voice-logs.ts)
- [x] Implementar verificacao de consentimento (consent.ts + canCollectVoice)
- [x] Implementar UI de consentimento `voice_training` (VoiceConsentModal.tsx)
- [ ] Padronizar parsing de voz em modulo unico (evitar regex solta na UI)

### Changelog

**v4.9 (2026-01-19) - Checkout Redundancy & Deep Link Return**
- Fix: Deep link não chegava ao app após pagamento
- Novo: `redirect_url` no checkout_codes para retorno ao app
- Novo: Verificação ANTES do checkout (`refreshProfile()` verifica se já pagou)
- Novo: Retry loop com backoff (1s, 2s, 4s) no retorno do checkout
- Novo: `refreshProfile()` agora retorna `Promise<boolean>`
- Novo: Logs `verifyAttempt`, `verified`, `alreadySubscribed`
- Fix: Interface `SubscriptionData` corrigida (`app` → `app_name`)
- Requer: Blue adicionar coluna `redirect_url TEXT` em checkout_codes
- Requer: Hermes passar `returnRedirect` e redirecionar na página success

**v4.8 (2026-01-19) - Checkout Code System**
- Novo: `api/checkout-code.ts` - Gera código curto (8 chars, TTL 60s, one-time)
- Novo: Sistema de código curto no PATH evita truncamento de URL no APK
- Fix: Capacitor Browser plugin trunca query params (issue #7319)
- Fluxo: APK → POST /api/checkout-code → abre /r/{code} → 302 redirect
- Requer: Tabela `checkout_codes` no Supabase (Blue)
- Requer: Rota `/r/:code` no onsite-auth (Hermes)
- App.tsx: Removido import do Browser plugin, usa `window.open(_system)`

**v4.7 (2026-01-19) - Code Cleanup**
- Removido: `VoiceUpgradePopup.tsx` - deletado permanentemente
- Removido: `saveFailedCalculation()`, `markCalculationSaved()`, `markCalculationShared()` de calculations.ts
- Removido: `getUserConsents()` de consent.ts
- Removido: `getCurrentUser()`, `getSession()` de supabase.ts
- Internalizados: `CalcType`, `CalculationRecord`, `ConsentType` (não mais exportados)
- Fix: Checkout URL corrigida para `https://onsite-auth.vercel.app/checkout/calculator`
- Limpeza: 141 linhas de código morto removidas

**v4.6 (2026-01-18) - Voice Consent UI**
- Novo: VoiceConsentModal.tsx - Modal de consentimento para voice_training
- Novo: Verificação de consentimento no primeiro uso do microfone
- Novo: Salva resposta na tabela `consents` com consent_type='voice_training'
- Novo: Logger de consent (consent.prompted, consent.granted)
- Integrado: Modal aparece automaticamente antes da primeira gravação
- UX: Se usuário aceita, gravação inicia automaticamente após consentir
- CSS: Estilos específicos para modal de consentimento (.consent-modal, .consent-details)

**v4.5 (2026-01-18) - Data Collection Complete**
- Fix: userId não era passado para compute() - agora salva calculations corretamente
- Fix: ESM imports na API (adicionado .js extension para Vercel)
- Fix: CORS para Vercel preview deployments (*.vercel.app)
- Verificado: calculations salvando no Supabase (testado e confirmado)
- Verificado: app_logs salvando no Supabase (testado e confirmado)
- Verificado: Voice API funcionando (Whisper + GPT-4o + logging)
- Verificado: billing_subscriptions integrado com Stripe via Auth Hub

**v4.4 (2026-01-18) - Subscription Fix & Comprehensive Logging**
- Fix CRÍTICO: Corrigido nome da tabela `subscriptions` → `billing_subscriptions`
- Fix CRÍTICO: Corrigido nome da coluna `app` → `app_name`
- Adicionado `api/lib/api-logger.ts` - Logger server-side para API
- Adicionado logs de cálculo no `useCalculator.ts` (success/fail, inputMethod)
- Adicionado logs de voz no `api/interpret.ts` (Whisper, GPT, rate limiting)
- Adicionado `app_name: 'calculator'` em todos os logs do cliente
- AuthScreen simplificado: apenas email + senha (mínima fricção)
- Auto-signup quando login falha para usuário novo
- Documentação completa do fluxo JWT para Auth Hub (Hermes)

**v4.3 (2026-01-17) - Blueprint Schema Implementation**
- Implementado `calculations.sql` - Schema para tabela de calculos
- Implementado `voice_logs.sql` - Schema para tabela de logs de voz
- Implementado `consents.sql` - Schema para verificacao de consentimento
- Adicionado `src/lib/calculations.ts` - Persistencia de calculos
- Adicionado `src/lib/consent.ts` - Verificacao de consentimento
- Adicionado `api/lib/voice-logs.ts` - Persistencia de voice_logs (server-side)
- Integrado saveCalculation() no useCalculator.ts
- Integrado saveVoiceLog() no api/interpret.ts (com verificacao de consentimento)

**v4.1 (2026-01-16) - Checkout Simplificado & Logout**
- Removido VoiceUpgradePopup
- JWT para Checkout Seguro
- Botão de Logout Adicionado

**v4.0 (2026-01-16) - Auth & Subscription Simplification**
- Fix: Loop Infinito de Login Resolvido
- Subscription Simplificado
- Display de Resultados melhorado

**v3.2 (2026-01-15) - UI Redesign & Branding**
- Tema Claro Completo
- Cores da Marca OnSite Club

---

## 14) Arquivos de Documentação

**Arquivos principais de documentação**:
- `CEULEN.md` - Identidade do agente + arquitetura completa (este arquivo)
- `COLOR_THEME.md` - Paleta de cores e design system
- `HEADER_CHANGES.md` - Mudanças específicas do header
- `README.md` - Instruções de setup e uso

**Arquivos de banco de dados**:
- `database/app_logs.sql` - Schema da tabela de logs
- `database/subscriptions.sql` - Schema da tabela de assinaturas
- `database/calculations.sql` - Schema da tabela de calculos (Blueprint)
- `database/voice_logs.sql` - Schema da tabela de logs de voz (Blueprint)
- `database/consents.sql` - Schema da tabela de consentimentos

---

*Ceulen — Agente Calculator*
*Subordinado a Blueprint (Blue)*
*Última sync: 2026-01-19 (v4.9 - Checkout Redundancy & Deep Link Return)*
