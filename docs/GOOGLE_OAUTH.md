# Google OAuth - Documentação Completa para Frontend

**Versão:** 1.0
**Última atualização:** 2025-02-18
**Status:** Implementado

---

## Índice

1. [Visão Geral](#visão-geral)
2. [Fluxo de Autenticação](#fluxo-de-autenticação)
3. [Endpoints](#endpoints)
4. [Implementação Passo a Passo](#implementação-passo-a-passo)
5. [Gerenciamento de Tokens](#gerenciamento-de-tokens)
6. [Tratamento de Erros](#tratamento-de-erros)
7. [Exemplos de Código](#exemplos-de-código)
8. [Testes](#testes)

---

## Visão Geral

### O que é implementado

O backend utiliza **OAuth 2.0 Authorization Code Flow** com Google para autenticação de usuários. O fluxo é implementado **server-side** (PKCE não é necessário neste caso, pois o backend segura as credenciais).

### Características do fluxo

- **Tipo:** Authorization Code Flow com redirecionamento
- **Escopos solicitados:** `openid email profile`
- **Access Type:** `offline` (permite obter refresh token)
- **Prompt:** `consent` (garante que o Google sempre retorne um refresh token)
- **Token Expiração:**
  - Access Token: 7 dias
  - Refresh Token: 30 dias

### URLs do Google OAuth

| Ambiente | Auth URL | Token URL | User Info URL |
|----------|----------|-----------|---------------|
| Todos | `https://accounts.google.com/o/oauth2/v2/auth` | `https://oauth2.googleapis.com/token` | `https://www.googleapis.com/oauth2/v2/userinfo` |

---

## Fluxo de Autenticação

### Diagrama de Sequência

```
┌─────────────┐                    ┌─────────────┐                    ┌──────────────┐
│   Frontend  │                    │   Backend   │                    │    Google    │
└──────┬──────┘                    └──────┬──────┘                    └──────┬───────┘
       │                                  │                                   │
       │  1. GET /api/auth/google         │                                   │
       │─────────────────────────────────>│                                   │
       │                                  │                                   │
       │                                  │  2. Redirect to Google OAuth     │
       │                                  │──────────────────────────────────>│
       │  3. User authorizes              │                                   │
       │<─────────────────────────────────┼───────────────────────────────────│
       │                                  │                                   │
       │  4. Callback with code           │                                   │
       │     /api/auth/google/callback    │                                   │
       │─────────────────────────────────>│                                   │
       │                                  │                                   │
       │                                  │  5. Exchange code for tokens     │
       │                                  │──────────────────────────────────>│
       │                                  │                                   │
       │                                  │  6. Get user info                │
       │                                  │──────────────────────────────────>│
       │                                  │                                   │
       │  7. Redirect with tokens        │                                   │
       │     /auth/callback?              │                                   │
       │     accessToken=xxx&             │                                   │
       │     refreshToken=xxx             │                                   │
       │<─────────────────────────────────┼───────────────────────────────────│
       │                                  │                                   │
       │  8. Save tokens & navigate      │                                   │
       │                                  │                                   │
```

### Passos detalhados

1. **Frontend inicia o fluxo:** Faz uma requisição (ou redireciona) para `GET /api/auth/google`
2. **Backend redireciona para Google:** Responde com HTTP 302 para a página de consentimento do Google
3. **Usuário autoriza:** O usuário faz login na Google e autoriza a aplicação
4. **Google redireciona de volta:** Google redireciona para o callback URL com um `code` temporário
5. **Backend troca o código:** O backend troca o `code` por um `access_token` do Google
6. **Backend busca dados do usuário:** Usa o token do Google para obter email, nome e avatar
7. **Backend cria/atualiza usuário:** Busca ou cria o usuário no banco de dados
8. **Backend gera tokens JWT:** Cria access token e refresh token da aplicação
9. **Backend redireciona para frontend:** Redireciona para a página de callback com os tokens na URL
10. **Frontend salva tokens:** Armazena os tokens e redireciona para o dashboard

---

## Endpoints

### 1. Iniciar Google OAuth

**Endpoint:** `GET /api/auth/google`

**Descrição:** Inicia o fluxo de autenticação com Google.

**Request:**
```http
GET /api/auth/google HTTP/1.1
Host: api.tacomquem.app
```

**Response:**
```http
HTTP/1.1 302 Found
Location: https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&response_type=code&scope=openid+email+profile&access_type=offline&prompt=consent
```

**Notas para o Frontend:**
- Esta endpoint responde com um **redirect** (HTTP 302)
- O navegador segue automaticamente para o Google
- Você pode fazer um `window.location.href = '/api/auth/google'` ou usar um link `<a>`

---

### 2. Callback do Google OAuth

**Endpoint:** `GET /api/auth/google/callback`

**Descrição:** Endpoint que recebe o callback do Google OAuth após a autorização.

**Query Parameters (do Google):**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `code` | string | Código de autorização temporário |
| `error` | string | Erro retornado pelo Google (se houver) |

**Response (Sucesso):**
```http
HTTP/1.1 302 Found
Location: https://app.tacomquem.com/auth/callback?accessToken=eyJhbGc...&refreshToken=eyJhbGc...
```

**Response (Erro):**
```http
HTTP/1.1 302 Found
Location: https://app.tacomquem.com/login?error=oauth_denied
```

**Possíveis valores de `error`:**
| Valor | Descrição |
|-------|-----------|
| `oauth_denied` | Usuário negou a autorização |
| `no_code` | Código não retornado pelo Google |
| `oauth_failed` | Erro genérico no processo de OAuth |
| `beta_not_available` | Modo beta ativado e usuário sem acesso |

---

### 3. Página de Callback (Frontend)

**Endpoint:** `GET /auth/callback` (rota do frontend)

**Query Parameters:**
| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `accessToken` | string | JWT access token da aplicação |
| `refreshToken` | string | JWT refresh token da aplicação |

**Ação do Frontend:**
1. Extrair `accessToken` e `refreshToken` da URL
2. Salvar os tokens no armazenamento seguro
3. Limpar os tokens da URL (opcional)
4. Redirecionar para o dashboard

---

## Implementação Passo a Passo

### Passo 1: Configurar o botão de login

```typescript
// React - components/LoginButton.tsx
import { useNavigate } from 'react-router-dom';

export function GoogleLoginButton() {
  const navigate = useNavigate();

  const handleGoogleLogin = () => {
    // Redireciona para o endpoint do backend que inicia o OAuth
    window.location.href = `${import.meta.env.VITE_API_URL}/api/auth/google`;
  };

  return (
    <button onClick={handleGoogleLogin} className="google-login-btn">
      <img src="/google-icon.svg" alt="Google" />
      Continuar com Google
    </button>
  );
}
```

### Passo 2: Criar a página de callback

Esta página deve ser a rota configurada em `FRONTEND_URL` no backend.

```typescript
// React - pages/AuthCallback.tsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function AuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setTokens } = useAuth();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (accessToken && refreshToken) {
      // Salvar os tokens
      setTokens(accessToken, refreshToken);

      // Limpar os tokens da URL
      window.history.replaceState({}, '', '/auth/callback');

      // Redirecionar para o dashboard
      navigate('/dashboard', { replace: true });
    } else {
      // Se não tiver tokens, redirecionar para login com erro
      navigate('/login?error=missing_tokens', { replace: true });
    }
  }, [searchParams, navigate, setTokens]);

  return (
    <div className="loading-screen">
      <p>Autenticando...</p>
    </div>
  );
}
```

### Passo 3: Criar hook de autenticação

```typescript
// React - hooks/useAuth.ts
import { useState, useCallback, useEffect } from 'react';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  role: string;
}

export function useAuth() {
  const [tokens, setTokensState] = useState<AuthTokens | null>(() => {
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');
    return accessToken && refreshToken ? { accessToken, refreshToken } : null;
  });

  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setTokens = useCallback((accessToken: string, refreshToken: string) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setTokensState({ accessToken, refreshToken });
  }, []);

  const clearTokens = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setTokensState(null);
    setUser(null);
  }, []);

  const fetchUser = useCallback(async () => {
    if (!tokens) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${tokens.accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expirado, tentar renovar
          await refreshAccessToken();
          return;
        }
        throw new Error('Failed to fetch user');
      }

      const userData: User = await response.json();
      setUser(userData);
      localStorage.setItem('user', JSON.stringify(userData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      clearTokens();
    } finally {
      setIsLoading(false);
    }
  }, [tokens, clearTokens]);

  const refreshAccessToken = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      clearTokens();
      return;
    }

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }

      const data = await response.json();
      setTokens(data.accessToken, refreshToken);

      // Buscar usuário novamente com o novo token
      await fetchUser();
    } catch (err) {
      clearTokens();
      // Redirecionar para login
      window.location.href = '/login?error=session_expired';
    }
  }, [setTokens, clearTokens, fetchUser]);

  const logout = useCallback(() => {
    clearTokens();
    window.location.href = '/login';
  }, [clearTokens]);

  // Buscar usuário ao montar o componente ou quando os tokens mudarem
  useEffect(() => {
    if (tokens && !user) {
      fetchUser();
    }
  }, [tokens, user, fetchUser]);

  return {
    user,
    tokens,
    isLoading,
    error,
    isAuthenticated: !!tokens,
    setTokens,
    clearTokens,
    logout,
    refreshAccessToken,
  };
}
```

### Passo 4: Configurar rotas

```typescript
// React - App.tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { GoogleLoginButton } from './components/LoginButton';
import { AuthCallback } from './pages/AuthCallback';
import { Dashboard } from './pages/Dashboard';
import { LoginPage } from './pages/LoginPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

### Passo 5: Página de login com tratamento de erros

```typescript
// React - pages/LoginPage.tsx
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { GoogleLoginButton } from '../components/LoginButton';

export function LoginPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get('error');

    const errorMessages: Record<string, string> = {
      oauth_denied: 'Você cancelou a autorização com Google.',
      no_code: 'Erro na comunicação com Google. Tente novamente.',
      oauth_failed: 'Erro ao fazer login com Google. Tente novamente.',
      beta_not_available: 'Desculpe, o acesso à plataforma é exclusivo para beta testers.',
      missing_tokens: 'Erro na autenticação. Tente novamente.',
      session_expired: 'Sua sessão expirou. Faça login novamente.',
    };

    if (errorParam && errorMessages[errorParam]) {
      setError(errorMessages[errorParam]);
    }
  }, [searchParams]);

  const handleRetry = () => {
    navigate('/login'); // Limpar os parâmetros de erro
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>Bem-vindo ao TáComQuem</h1>
        <p>Faça login para continuar</p>

        {error && (
          <div className="error-message">
            <p>{error}</p>
            <button onClick={handleRetry}>Tentar novamente</button>
          </div>
        )}

        <div className="login-buttons">
          <GoogleLoginButton />
        </div>

        <p className="terms">
          Ao fazer login, você concorda com nossos
          <a href="/terms">Termos de Uso</a> e
          <a href="/privacy">Política de Privacidade</a>.
        </p>
      </div>
    </div>
  );
}
```

---

## Gerenciamento de Tokens

### Estrutura dos Tokens JWT

#### Access Token Payload
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "role": "USER",
  "iat": 1708502400,
  "exp": 1709107200
}
```

#### Refresh Token Payload
```json
{
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "type": "refresh",
  "iat": 1708502400,
  "exp": 1711084800
}
```

### Armazenamento Seguro

**Recomendação:** Use `httpOnly` cookies se possível (requer configuração adicional no backend).

**Alternativa (implementada):** `localStorage` com as seguintes considerações:

```typescript
// utils/tokenStorage.ts
const TOKEN_KEYS = {
  ACCESS: 'accessToken',
  REFRESH: 'refreshToken',
  USER: 'user',
};

export const tokenStorage = {
  getAccessToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEYS.ACCESS);
  },

  getRefreshToken: (): string | null => {
    return localStorage.getItem(TOKEN_KEYS.REFRESH);
  },

  setTokens: (accessToken: string, refreshToken: string): void => {
    localStorage.setItem(TOKEN_KEYS.ACCESS, accessToken);
    localStorage.setItem(TOKEN_KEYS.REFRESH, refreshToken);
  },

  clearTokens: (): void => {
    localStorage.removeItem(TOKEN_KEYS.ACCESS);
    localStorage.removeItem(TOKEN_KEYS.REFRESH);
    localStorage.removeItem(TOKEN_KEYS.USER);
  },

  // Verificar se o token está próximo de expirar
  isTokenExpiringSoon: (token: string, thresholdMinutes = 5): boolean => {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expirationTime = payload.exp * 1000;
      const threshold = thresholdMinutes * 60 * 1000;
      return Date.now() > (expirationTime - threshold);
    } catch {
      return true;
    }
  },
};
```

### Renovação Automática de Token

```typescript
// hooks/useAutoRefresh.ts
import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { tokenStorage } from '../utils/tokenStorage';

export function useAutoRefresh() {
  const { refreshAccessToken, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    const checkAndRefresh = async () => {
      const accessToken = tokenStorage.getAccessToken();
      if (accessToken && tokenStorage.isTokenExpiringSoon(accessToken, 5)) {
        await refreshAccessToken();
      }
    };

    // Verificar a cada minuto
    const interval = setInterval(checkAndRefresh, 60 * 1000);

    // Verificar imediatamente ao montar
    checkAndRefresh();

    return () => clearInterval(interval);
  }, [isAuthenticated, refreshAccessToken]);
}
```

### API Interceptor para Axios

```typescript
// lib/api.ts
import axios from 'axios';
import { tokenStorage } from '../utils/tokenStorage';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10000,
});

// Request interceptor - adiciona o token
api.interceptors.request.use(
  (config) => {
    const accessToken = tokenStorage.getAccessToken();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - trata erros de autenticação
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Se o erro for 401 e ainda não tentamos renovar
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      originalRequest.url !== '/api/auth/refresh'
    ) {
      originalRequest._retry = true;

      try {
        const refreshToken = tokenStorage.getRefreshToken();
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        // Tentar renovar o token
        const response = await axios.post(
          `${import.meta.env.VITE_API_URL}/api/auth/refresh`,
          { refreshToken }
        );

        const { accessToken } = response.data;
        tokenStorage.setTokens(accessToken, refreshToken);

        // Repetir a requisição original com o novo token
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Falha ao renovar, limpar tokens e redirecionar para login
        tokenStorage.clearTokens();
        window.location.href = '/login?error=session_expired';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

---

## Tratamento de Erros

### Tipos de Erro

| Código | Descrição | Causa Possível | Solução |
|--------|-----------|----------------|---------|
| `oauth_denied` | Usuário negou a autorização | Usuário cancelou no Google | Mostrar mensagem e oferecer botão para tentar novamente |
| `no_code` | Código não retornado | Problema na comunicação com Google | Pedir para tentar novamente |
| `oauth_failed` | Erro genérico do OAuth | Várias causas (rede, servidor, etc) | Pedir para tentar novamente |
| `beta_not_available` | Acesso beta negado | `BETA_MODE_ENABLED=true` e usuário sem acesso | Informar sobre o programa beta |
| `session_expired` | Sessão expirada | Token expirado e não foi possível renovar | Redirecionar para login |

### Componente de Tratamento de Erros

```typescript
// components/AuthErrorHandler.tsx
import { useSearchParams } from 'react-router-dom';

interface AuthErrorHandlerProps {
  onRetry?: () => void;
}

export function AuthErrorHandler({ onRetry }: AuthErrorHandlerProps) {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  if (!error) return null;

  const errorConfig: Record<string, { title: string; message: string; action?: string }> = {
    oauth_denied: {
      title: 'Autorização cancelada',
      message: 'Você cancelou a autorização com o Google. Para usar o TáComQuem, você precisa fazer login.',
      action: 'Tentar novamente',
    },
    no_code: {
      title: 'Erro de comunicação',
      message: 'Houve um problema na comunicação com o Google. Por favor, tente novamente.',
      action: 'Tentar novamente',
    },
    oauth_failed: {
      title: 'Erro no login',
      message: 'Não foi possível fazer login com o Google. Tente novamente em alguns instantes.',
      action: 'Tentar novamente',
    },
    beta_not_available: {
      title: 'Acesso limitado',
      message: 'O TáComQuem está em fase beta e o acesso é limitado. Entre na lista de espera em tacomquem.app/waitlist',
    },
    session_expired: {
      title: 'Sessão expirada',
      message: 'Sua sessão expirou por segurança. Faça login novamente para continuar.',
      action: 'Fazer login',
    },
    missing_tokens: {
      title: 'Erro na autenticação',
      message: 'Ocorreu um erro durante o processo de autenticação. Por favor, tente fazer login novamente.',
      action: 'Ir para login',
    },
  };

  const config = errorConfig[error];

  if (!config) return null;

  return (
    <div className="auth-error-banner">
      <div className="error-icon">⚠️</div>
      <div className="error-content">
        <h3>{config.title}</h3>
        <p>{config.message}</p>
        {config.action && onRetry && (
          <button onClick={onRetry} className="retry-button">
            {config.action}
          </button>
        )}
      </div>
      <button
        className="close-button"
        onClick={() => window.history.replaceState({}, '', '/login')}
      >
        ✕
      </button>
    </div>
  );
}
```

---

## Exemplos de Código

### Exemplo Completo em React

```typescript
// pages/GoogleLogin.tsx
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function GoogleLogin() {
  const navigate = useNavigate();
  const { setTokens, fetchUser } = useAuth();

  const initiateGoogleLogin = useCallback(() => {
    // Armazenar a URL de retorno antes de iniciar o login
    const returnUrl = new URLSearchParams(window.location.search).get('return') || '/dashboard';
    sessionStorage.setItem('authReturnUrl', returnUrl);

    // Redirecionar para o endpoint do backend
    window.location.href = `${import.meta.env.VITE_API_URL}/api/auth/google`;
  }, []);

  return (
    <button
      onClick={initiateGoogleLogin}
      className="google-login-button"
      aria-label="Fazer login com Google"
    >
      <svg width="18" height="18" viewBox="0 0 18 18">
        {/* Google G icon SVG */}
      </svg>
      Continuar com Google
    </button>
  );
}

// pages/Callback.tsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setTokens, fetchUser } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const accessToken = searchParams.get('accessToken');
      const refreshToken = searchParams.get('refreshToken');

      if (!accessToken || !refreshToken) {
        // Verificar se há um erro na URL
        const error = searchParams.get('error');
        if (error) {
          navigate(`/login?error=${error}`, { replace: true });
        } else {
          navigate('/login?error=missing_tokens', { replace: true });
        }
        return;
      }

      try {
        // Salvar os tokens
        setTokens(accessToken, refreshToken);

        // Buscar dados do usuário
        await fetchUser();

        // Redirecionar para a URL de retorno ou dashboard
        const returnUrl = sessionStorage.getItem('authReturnUrl') || '/dashboard';
        sessionStorage.removeItem('authReturnUrl');
        navigate(returnUrl, { replace: true });
      } catch (err) {
        console.error('Error handling callback:', err);
        navigate('/login?error=oauth_failed', { replace: true });
      }
    };

    handleCallback();
  }, [searchParams, navigate, setTokens, fetchUser]);

  return (
    <div className="callback-container">
      <div className="loading-spinner" />
      <p>Autenticando...</p>
    </div>
  );
}
```

### Exemplo com Next.js

```typescript
// app/login/page.tsx
'use client';

import { useCallback } from 'react';

export default function LoginPage() {
  const initiateGoogleLogin = useCallback(() => {
    // Redirecionar para o endpoint do backend
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/google`;
  }, []);

  return (
    <div className="login-page">
      <button onClick={initiateGoogleLogin}>
        Continuar com Google
      </button>
    </div>
  );
}

// app/auth/callback/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (accessToken && refreshToken) {
      // Salvar no localStorage
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // Redirecionar para o dashboard
      router.push('/dashboard');
    } else {
      const error = searchParams.get('error');
      router.push(error ? `/login?error=${error}` : '/login?error=missing_tokens');
    }
  }, [searchParams, router]);

  return (
    <div className="callback-container">
      <p>Autenticando...</p>
    </div>
  );
}
```

### Exemplo com Vue 3

```vue
<!-- components/GoogleLoginButton.vue -->
<script setup lang="ts">
import { useRouter } from 'vue-router';

const router = useRouter();

const initiateGoogleLogin = () => {
  window.location.href = `${import.meta.env.VITE_API_URL}/api/auth/google`;
};
</script>

<template>
  <button @click="initiateGoogleLogin" class="google-login-button">
    Continuar com Google
  </button>
</template>

<!-- pages/AuthCallbackPage.vue -->
<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();

onMounted(() => {
  const accessToken = route.query.accessToken as string;
  const refreshToken = route.query.refreshToken as string;

  if (accessToken && refreshToken) {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    router.push('/dashboard');
  } else {
    const error = route.query.error as string;
    router.push(error ? `/login?error=${error}` : '/login?error=missing_tokens');
  }
});
</script>

<template>
  <div class="callback-container">
    <p>Autenticando...</p>
  </div>
</template>
```

---

## Testes

### Testes Manuais

1. **Teste de fluxo feliz:**
   - Acessar `/login`
   - Clicar em "Continuar com Google"
   - Fazer login na Google
   - Autorizar a aplicação
   - Verificar redirecionamento para `/auth/callback`
   - Verificar tokens salvos no localStorage
   - Verificar redirecionamento para `/dashboard`

2. **Teste de cancelamento:**
   - Iniciar o fluxo
   - Cancelar na tela do Google
   - Verificar redirecionamento para `/login?error=oauth_denied`

3. **Teste de token expirado:**
   - Fazer login
   - Esperar 7 dias (ou modificar o token manualmente)
   - Tentar acessar uma rota protegida
   - Verificar se o token é renovado automaticamente

### Testes Automatizados (Cypress)

```typescript
// cypress/e2e/auth.spec.ts
describe('Google OAuth Flow', () => {
  beforeEach(() => {
    cy.visit('/login');
  });

  it('should redirect to Google OAuth when clicking login button', () => {
    cy.get('[data-testid="google-login-button"]').click();

    // Verificar se redirecionou para o Google
    cy.url().should('include', 'accounts.google.com');
  });

  it('should handle successful authentication', () => {
    // Mock da resposta do callback
    cy.intercept('GET', '/api/auth/google/callback', (req) => {
      req.redirect(
        302,
        '/auth/callback?accessToken=mock_access_token&refreshToken=mock_refresh_token'
      );
    });

    // Mock do endpoint /me
    cy.intercept('GET', '/api/auth/me', {
      statusCode: 200,
      body: {
        id: '123',
        name: 'Test User',
        email: 'test@example.com',
        avatarUrl: null,
        emailVerified: true,
        role: 'USER',
      },
    }).as('getUser');

    cy.get('[data-testid="google-login-button"]').click();

    // Simular redirecionamento do callback
    cy.visit('/auth/callback?accessToken=mock_access_token&refreshToken=mock_refresh_token');

    // Verificar se os tokens foram salvos
    cy.getAllFromLocalStorage().should((ls) => {
      expect(ls).to.have.property('accessToken');
      expect(ls).to.have.property('refreshToken');
    });

    // Verificar redirecionamento para dashboard
    cy.url().should('include', '/dashboard');
  });

  it('should handle oauth denied error', () => {
    cy.visit('/login?error=oauth_denied');

    cy.get('[data-testid="error-message"]')
      .should('be.visible')
      .and('contain', 'cancelou a autorização');
  });
});
```

---

## Variáveis de Ambiente

### Frontend (.env)

```bash
# URL da API backend
VITE_API_URL=http://localhost:3333

# URL do frontend (para redirecionamentos)
VITE_FRONTEND_URL=http://localhost:5173
```

### Backend (deve estar configurado)

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://your-backend.com/api/auth/google/callback

# Frontend URL (para redirecionamento após sucesso)
FRONTEND_URL=https://your-frontend.com
```

---

## Referências

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [OpenID Connect](https://openid.net/connect/)
- [JWT.io](https://jwt.io/)
