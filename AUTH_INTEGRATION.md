# Sistema de Autenticação - OnSite Calculator

> **Versão**: 4.9 | **Última atualização**: 2026-01-19

## Visão Geral

Sistema de autenticação completo integrado ao OnSite Calculator com:
- Login/Signup local dentro do app (email + senha)
- Verificação de assinatura para Voice Feature via `billing_subscriptions`
- Deep linking para retorno do checkout Stripe
- Sistema de código curto para evitar truncamento de URLs no APK
- Retry com backoff para verificação de assinatura após checkout
- Integração com Supabase + Auth Hub (Hermes)

---

## Fluxo de Autenticação (v4.9)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUXO DE AUTENTICAÇÃO                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Usuário abre o app                                                      │
│     ↓                                                                       │
│  2. Verifica sessão Supabase (useAuth)                                      │
│     ├─ NÃO AUTENTICADO → AuthScreen (Login/Signup)                         │
│     └─ AUTENTICADO → Carrega perfil + verifica assinatura                  │
│                       ↓                                                     │
│  3. checkPremiumAccess() verifica billing_subscriptions                     │
│     └─ Busca: user_id + app_name='calculator' + status='active'            │
│                                                                             │
│  4. Renderiza Calculator com hasVoiceAccess                                 │
│     ├─ TEM ACESSO → Botão mic funciona normalmente                         │
│     └─ SEM ACESSO → Botão mic abre checkout direto                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Fluxo de Checkout (v4.9 - Código Curto + Redundância)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FLUXO DE CHECKOUT                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. CLIQUE NO UPGRADE (botão mic sem assinatura)                            │
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
│     └── Usuário completa pagamento                                          │
│     └── Webhook grava em billing_subscriptions                              │
│                                                                             │
│  6. PÁGINA DE SUCESSO                                                       │
│     └── Auth Hub redireciona para: onsitecalculator://auth-callback         │
│                                                                             │
│  7. APP RECEBE DEEP LINK                                                    │
│     └── useDeepLink detecta 'auth-callback'                                 │
│     └── Chama onCheckoutReturn()                                            │
│                                                                             │
│  8. RETRY LOOP COM BACKOFF                                                  │
│     └── Espera 1s → refreshProfile() → hasAccess?                           │
│     └── Espera 2s → refreshProfile() → hasAccess?                           │
│     └── Espera 4s → refreshProfile() → hasAccess?                           │
│     └── Se ainda false: alert("feche e abra o app")                         │
│                                                                             │
│  9. VOICE DESBLOQUEADO                                                      │
│     └── hasVoiceAccess=true → botão mic funciona                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Arquivos Principais

### Hooks de Autenticação

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/hooks/useAuth.ts` | Estado de auth, signIn, signUp, signOut, refreshProfile |
| `src/hooks/useDeepLink.ts` | Escuta deep links, callbacks de auth e checkout |
| `src/lib/subscription.ts` | Verifica `billing_subscriptions`, cache de assinatura |

### API Serverless

| Arquivo | Responsabilidade |
|---------|------------------|
| `api/checkout-code.ts` | Gera código curto para checkout (8 chars, 60s TTL) |
| `api/interpret.ts` | Processa comandos de voz (requer assinatura) |

### Componentes

| Arquivo | Responsabilidade |
|---------|------------------|
| `src/App.tsx` | Orquestra auth + checkout + deep links |
| `src/components/AuthScreen.tsx` | Tela de login/signup |
| `src/components/Calculator.tsx` | Calculadora com botão de voz |

---

## Código Curto (checkout_codes)

**Problema resolvido**: Capacitor Browser plugin trunca query params longos no APK (bug #7319).

### Estrutura da Tabela

```sql
CREATE TABLE checkout_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,           -- 8 chars sem ambíguos
  user_id UUID REFERENCES auth.users(id),
  email TEXT NOT NULL,
  app TEXT NOT NULL DEFAULT 'calculator',
  redirect_url TEXT,                    -- Deep link de retorno (v4.9)
  expires_at TIMESTAMP NOT NULL,        -- NOW + 60 segundos
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Geração do Código

```typescript
// api/checkout-code.ts
function generateCode(length = 8): string {
  // Sem caracteres ambíguos: 0/O, 1/l/I
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    code += chars[array[i] % chars.length];
  }
  return code;
}
```

### Insert com redirect_url (v4.9)

```typescript
await supabase.from('checkout_codes').insert({
  code,
  user_id: user.id,
  email: user.email,
  app,
  redirect_url: 'onsitecalculator://auth-callback',  // NOVO v4.9
  expires_at: expiresAt,
  used: false,
});
```

---

## Verificação de Assinatura

### Tabela: billing_subscriptions

```sql
CREATE TABLE billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  app_name TEXT NOT NULL,              -- 'calculator'
  status TEXT NOT NULL,                -- 'active', 'canceled', 'past_due', etc.
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Query de Verificação

```typescript
// src/lib/subscription.ts
const { data } = await supabase
  .from('billing_subscriptions')
  .select('*')
  .eq('user_id', user.id)
  .eq('app_name', 'calculator')
  .eq('status', 'active')
  .maybeSingle();

const hasAccess = !!data;
```

### Cache de Assinatura

- Armazenado em `@capacitor/preferences` + memória
- TTL: 5 minutos
- Limpo em: logout, refreshSubscriptionStatus()

---

## refreshProfile() (v4.9)

Agora retorna `Promise<boolean>` indicando se tem acesso voice:

```typescript
// src/hooks/useAuth.ts
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

    // Força refresh do cache de assinatura
    const hasVoiceAccess = await refreshSubscriptionStatus();

    setAuthState(prev => ({
      ...prev,
      profile: profileData,
      hasVoiceAccess,
    }));

    return hasVoiceAccess;
  } catch (error) {
    logger.auth.error('Error refreshing profile', { error: String(error) });
    return false;
  }
}, []);
```

---

## Retry Loop (v4.9)

Após retornar do checkout, o app tenta verificar a assinatura múltiplas vezes:

```typescript
// src/App.tsx - onCheckoutReturn
const delays = [1000, 2000, 4000]; // 1s, 2s, 4s (total ~7s)

for (let i = 0; i < delays.length; i++) {
  await new Promise(resolve => setTimeout(resolve, delays[i]));

  const hasAccess = await refreshProfile();
  logger.checkout.verifyAttempt(i + 1, hasAccess);

  if (hasAccess) {
    logger.checkout.verified(true, { attempt: i + 1 });
    return; // Sucesso!
  }
}

// Fallback se webhook ainda não processou
logger.checkout.verified(false, { attempts: delays.length });
alert('Pagamento processado! Se o Voice não desbloqueou, feche e abra o app.');
```

---

## Verificação Antes do Checkout (v4.9)

Evita abrir checkout se usuário já pagou mas estado não atualizou:

```typescript
// src/App.tsx - handleUpgradeClick
const handleUpgradeClick = useCallback(async () => {
  if (!supabase || !user) return;

  // NOVO v4.9: Verifica antes de redirecionar
  const hasAccess = await refreshProfile();
  if (hasAccess) {
    logger.checkout.alreadySubscribed();
    return; // Não precisa ir pro checkout!
  }

  // ... continua para gerar código e abrir checkout
}, [user, refreshProfile]);
```

---

## Deep Link

### Scheme

```
onsitecalculator://auth-callback
```

### Configuração Android

```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="onsitecalculator" android:host="auth-callback" />
</intent-filter>
```

### Handler

```typescript
// src/hooks/useDeepLink.ts
App.addListener('appUrlOpen', async ({ url }) => {
  logger.deepLink.received(url);

  if (url.includes('auth-callback')) {
    // Checkout return ou OAuth callback
    if (onCheckoutReturn) {
      await onCheckoutReturn();
    }
  }
});
```

---

## Variáveis de Ambiente

```bash
# .env.local

# Supabase
VITE_SUPABASE_URL=https://xmpckuiluwhcdzyadggh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Vercel Serverless (api/)
SUPABASE_URL=https://xmpckuiluwhcdzyadggh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Logs de Checkout (v4.9)

```typescript
// src/lib/logger.ts
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

---

## Troubleshooting

### Voice não funciona após checkout

1. Verifique logs do Supabase: `billing_subscriptions` tem registro?
2. Verifique coluna: `app_name` deve ser `'calculator'` (não `'app'`)
3. Verifique status: deve ser `'active'`
4. Force refresh: fechar e abrir o app

### Deep link não chega ao app

1. Verificar se Auth Hub está redirecionando para `onsitecalculator://auth-callback`
2. Verificar `redirect_url` no código curto foi salvo
3. Teste manual: `adb shell am start -a android.intent.action.VIEW -d "onsitecalculator://auth-callback"`

### Código curto não funciona

1. Verificar se tabela `checkout_codes` tem coluna `redirect_url`
2. Verificar se código não expirou (TTL 60s)
3. Verificar se código não foi usado (`used=true`)

---

## Integração com Auth Hub (Hermes)

### Requisitos para Hermes

1. **Rota `/r/:code`**: Passar `returnRedirect` no redirect
   ```typescript
   const checkoutUrl = new URL('/checkout/calculator', baseUrl);
   checkoutUrl.searchParams.set('prefilled_email', data.email);
   checkoutUrl.searchParams.set('user_id', data.user_id);
   if (data.redirect_url) {
     checkoutUrl.searchParams.set('returnRedirect', data.redirect_url);
   }
   ```

2. **Página `/checkout/success`**: Redirecionar para deep link
   ```typescript
   const redirect = searchParams.get('redirect');
   if (redirect?.startsWith('onsitecalculator://')) {
     window.location.href = redirect;
   }
   ```

---

## Links Úteis

- **Auth Hub**: https://onsite-auth.vercel.app
- **Checkout**: https://onsite-auth.vercel.app/checkout/calculator
- **Supabase Dashboard**: https://app.supabase.com
- **Stripe Dashboard**: https://dashboard.stripe.com

---

## Changelog

### v4.9 (2026-01-19)
- Adicionado `redirect_url` no checkout_codes para retorno via deep link
- `refreshProfile()` agora retorna `Promise<boolean>`
- Verificação antes do checkout (evita redirect desnecessário)
- Retry loop com backoff (1s, 2s, 4s) no retorno do checkout
- Novos logs: `verifyAttempt`, `verified`, `alreadySubscribed`

### v4.8 (2026-01-18)
- Sistema de código curto para evitar truncamento de URL no APK
- Tabela `checkout_codes` com TTL de 60 segundos

### v4.0 (2026-01-15)
- Migração de `profiles.subscription_status` para `billing_subscriptions`
- Cache de assinatura com Capacitor Preferences

---

**OnSite Club © 2025-2026**
