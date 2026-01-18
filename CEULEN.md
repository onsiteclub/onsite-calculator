# CEULEN — Agente Calculator

> **ESTE CABEÇALHO É IMUTÁVEL. NÃO ALTERE AS SEÇÕES MARCADAS COM [LOCKED].**
>
> Última sincronização com Blue: 2025-01-17

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

## MINHA ARQUITETURA (ÍNTEGRA)

> A arquitetura abaixo é minha referência técnica.
> Posso atualizá-la conforme evoluo o código.
> Mas NÃO posso alterar as seções [LOCKED] acima.

---

# OnSite Calculator — Arquitetura v4.3 (Full System Map)

**STATUS:** ✅ Mapeamento completo (Core + Hooks + UI + Auth/Paywall + Voz + Logging + Data Collection + Android Native)
**ÚLTIMA ATUALIZAÇÃO:** 2026-01-17
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

> **Nota v4.2**: `VoiceUpgradePopup.tsx` ainda existe no código mas não é usado. O upgrade redireciona direto para checkout.

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
  - `refreshProfile()`: Atualizar perfil após checkout
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
  trade: string; // profissão
  subscription_status: 'trialing' | 'active' | 'canceled';
  trial_ends_at: string;
}
```

### 8.3 Tabela `subscriptions` (Verificação de Acesso)

**Estrutura**:
```ts
interface SubscriptionData {
  id: string;
  user_id: string;           // UUID do Supabase Auth
  app: string;               // 'calculator'
  status: 'active' | 'trialing' | 'canceled' | 'past_due' | 'inactive';
  current_period_end?: string;
  cancel_at_period_end?: boolean;
}
```

**Verificação de acesso** (`src/lib/subscription.ts`):
- Fonte única: tabela `subscriptions` no Supabase
- Cache local: 5 minutos (memória + Capacitor Preferences)
- Status válidos: `active` ou `trialing`
- Também verifica `current_period_end` não expirado

### 8.4 Gate do Voice (pago)

**Onde aplicar**:
- `Calculator.tsx` recebe `hasVoiceAccess` e `voiceState`
- Se não tiver acesso → botão de mic redireciona DIRETO para checkout (sem popup)

### 8.5 Checkout Externo (v4.1 - Simplificado)

**Fluxo direto** (sem popup intermediário):
1. Usuário clica no botão de voz (sem acesso)
2. `App.tsx` chama `handleUpgradeClick()`
3. Gera JWT token via `/api/checkout-token`
4. Redireciona direto para `https://auth.onsiteclub.ca/checkout/calculator`
5. Usuário completa pagamento
6. Checkout grava na tabela `subscriptions`
7. Redirect via deep link → App verifica e libera Voice

**Parâmetros enviados**:
- `token`: JWT assinado com `user_id` (gerado por `/api/checkout-token`)
- `prefilled_email`: Email do usuário
- `redirect`: `onsitecalculator://auth-callback`

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
- `consent.ts` - Verificação de consentimento (voice_training)
- `logger.ts` - Logging estruturado (módulos: Voice, Auth, Subscription, Calculator, Sync, DeepLink, Checkout, History)
- `server-logger.ts` - Logger para API endpoints
- `supabase.ts` - Cliente Supabase
- `subscription.ts` - Verificação de assinatura

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
- `VoiceUpgradePopup.tsx` - (não usado, pode ser deletado)

### Arquivos em `api/`
- `interpret.ts` - API de voz (Whisper + GPT-4o + saveVoiceLog)
- `checkout-token.ts` - Geração de JWT para checkout
- `lib/voice-logs.ts` - Persistência de voice_logs (server-side, Blueprint)

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
- [ ] Implementar UI de consentimento `voice_training`
- [ ] Padronizar parsing de voz em modulo unico (evitar regex solta na UI)

### Changelog

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
*Última sync: 2026-01-17*
