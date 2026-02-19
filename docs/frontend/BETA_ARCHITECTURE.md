# 🏗️ Beta System - Frontend Architecture

> Estrutura, componentes e padrões recomendados para implementação do sistema de beta no frontend.

---

## 📐 Arquitetura Geral

```
Frontend React Application
│
├── 🔐 Auth Context (useAuth)
│   ├── user.accessTier ('PUBLIC' | 'BETA')
│   ├── user.betaAddedAt (iso timestamp | null)
│   └── Triggers refresh em: login, register, refresh
│
├── 🎨 Layout Principal
│   ├── Dashboard
│   │   ├── BetaBadge (condicional: BETA)
│   │   ├── ExperimentalFeatures (condicional: BETA)
│   │   └── Stats (sempre visível)
│   │
│   ├── Navbar
│   │   ├── BetaBadge (canto superior)
│   │   └── Menu Admin (SUPER_ADMIN)
│   │
│   └── Sidebar
│       └── Admin Panel (SUPER_ADMIN)
│
├── 📦 Services
│   ├── authService.ts
│   │   ├── register()
│   │   ├── login()
│   │   └── getCurrentUser() → { accessTier, betaAddedAt }
│   │
│   ├── betaService.ts
│   │   ├── listInvites(limit, offset)
│   │   ├── addInvite(email, reason)
│   │   └── removeInvite(email)
│   │
│   └── apiClient.ts (HTTP wrapper)
│
└── 🎯 Utils
    ├── isBetaUser(user) → boolean
    ├── formatBetaDate(iso) → string
    └── hasAdminAccess(user) → boolean
```

---

## 🧩 Component Hierarchy

```
App
├── Router
│   ├── /auth
│   │   ├── RegisterPage
│   │   │   └── RegisterForm
│   │   │       ├── Form input: name, email, password
│   │   │       ├── Calls: authService.register()
│   │   │       └── On success: redirect to /dashboard
│   │   │
│   │   └── LoginPage
│   │       └── LoginForm
│   │           ├── Form input: email, password
│   │           ├── Calls: authService.login()
│   │           └── On success: sets accessToken, redirects to /dashboard
│   │
│   ├── /dashboard (protected)
│   │   └── DashboardPage
│   │       ├── Header
│   │       │   └── BetaBadge <- NEW (shows if BETA)
│   │       ├── MainContent
│   │       │   ├── LoansCard
│   │       │   ├── ItemsCard
│   │       │   └── ExperimentalFeatures <- NEW (shows if BETA)
│   │       │       ├── NewLoanInterface
│   │       │       └── AdvancedFilters
│   │       └── Sidebar
│   │           └── AdminPanel <- NEW (shows if SUPER_ADMIN)
│   │               ├── BetaInvitesManager
│   │               │   ├── InvitesList
│   │               │   └── AddInviteForm
│   │               └── UsersManager (existing)
│   │
│   ├── /admin/beta (SUPER_ADMIN only)
│   │   └── BetaManagementPage
│   │       ├── InvitesList (table)
│   │       │   ├── Column: email
│   │       │   ├── Column: status (used / unused)
│   │       │   ├── Column: addedAt
│   │       │   ├── Column: usedAt (if available)
│   │       │   ├── Column: addedBy
│   │       │   └── Column: actions (remove button)
│   │       │
│   │       └── AddInviteForm
│   │           ├── Input: email
│   │           ├── Input: reason (optional)
│   │           └── Button: Add
│   │
│   └── 404
│
└── AuthProvider <- Wraps entire app
    └── useAuth() hook
```

---

## 💾 State Management

### Option 1: React Context (Recommended for MVP)

```typescript
// contexts/AuthContext.tsx
interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login(email: string, password: string): Promise<void>
  register(name: string, email: string, password: string): Promise<void>
  logout(): void
  refreshUser(): Promise<void>
}

interface User {
  id: string
  name: string
  email: string
  accessTier: 'PUBLIC' | 'BETA' // <- NEW - determines UI
  betaAddedAt: string | null    // <- NEW - when added to beta
  createdAt: string
  // ... other fields
}

export const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // On mount, fetch /api/auth/me if token exists
    const token = localStorage.getItem('accessToken')
    if (token) {
      refreshUser()
    } else {
      setIsLoading(false)
    }
  }, [])

  const refreshUser = async () => {
    try {
      const res = await apiClient.get('/api/auth/me')
      setUser(res.data.user)
    } catch (err) {
      localStorage.removeItem('accessToken')
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (name: string, email: string, password: string) => {
    const res = await apiClient.post('/api/auth/register', {
      name,
      email,
      password,
      acceptTerms: true
    })

    localStorage.setItem('accessToken', res.data.accessToken)
    setUser(res.data.user)  // user here has accessTier: 'BETA' or 'PUBLIC'
  }

  const login = async (email: string, password: string) => {
    const res = await apiClient.post('/api/auth/login', { email, password })
    localStorage.setItem('accessToken', res.data.accessToken)
    await refreshUser()  // Fetch full user data with accessTier
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
```

### Option 2: Zustand (Alternative)

```typescript
// store/authStore.ts
import { create } from 'zustand'

interface AuthStore {
  user: User | null
  isLoading: boolean
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  refreshUser: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: true,

  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),

  refreshUser: async () => {
    // Fetch /api/auth/me
    // Update store
  },

  login: async (email, password) => {
    // Call API
    // Update store with user that includes accessTier
  }
}))
```

---

## 🎨 New Components

### 1. BetaBadge Component

**Location:** `src/components/BetaBadge.tsx`

**Purpose:** Show "BETA" badge for beta users

```typescript
import { User } from '@/types'
import { formatBetaDate } from '@/utils/beta'

interface BetaBadgeProps {
  user: User | null
  size?: 'small' | 'medium' | 'large'
  showTooltip?: boolean
}

export function BetaBadge({ user, size = 'small', showTooltip = true }: BetaBadgeProps) {
  if (!user || user.accessTier !== 'BETA') {
    return null
  }

  const addedDate = user.betaAddedAt ? formatBetaDate(user.betaAddedAt) : null

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gradient-to-r from-purple-100 to-pink-100 border border-purple-300 ${
        size === 'small' ? 'text-xs' : size === 'medium' ? 'text-sm' : 'text-base'
      }`}
      title={showTooltip && addedDate ? `Beta desde ${addedDate}` : undefined}
    >
      <span className="text-lg">🎯</span>
      <span className="font-bold text-purple-700">BETA</span>
    </div>
  )
}
```

**Usage:**

```typescript
// In DashboardPage
const { user } = useAuth()

return (
  <div className="flex items-center justify-between">
    <h1>Dashboard</h1>
    <BetaBadge user={user} size="medium" showTooltip={true} />
  </div>
)
```

---

### 2. ExperimentalFeatures Component

**Location:** `src/components/ExperimentalFeatures.tsx`

**Purpose:** Show experimental/beta-only features

```typescript
import { useAuth } from '@/contexts/AuthContext'
import { isBetaUser } from '@/utils/beta'

interface ExperimentalFeaturesProps {
  children: React.ReactNode
}

export function ExperimentalFeatures({ children }: ExperimentalFeaturesProps) {
  const { user } = useAuth()

  if (!isBetaUser(user)) {
    return null
  }

  return (
    <section className="border-l-4 border-purple-300 bg-purple-50 p-4 rounded">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">⚡</span>
        <h2 className="font-bold text-purple-900">Funcionalidades Experimentais</h2>
      </div>
      {children}
    </section>
  )
}
```

**Usage:**

```typescript
// In DashboardPage
return (
  <div>
    <ExperimentalFeatures>
      <div>
        <h3>Nova Interface de Empréstimos</h3>
        <p>Gerencie empréstimos de forma mais rápida e intuitiva.</p>
        <NewLoanBuilder />
      </div>
    </ExperimentalFeatures>
  </div>
)
```

---

### 3. BetaInvitesManager Component (Admin Only)

**Location:** `src/components/BetaInvitesManager.tsx`

**Purpose:** Admin UI to manage beta whitelist

```typescript
import { useState } from 'react'
import { betaService } from '@/services/betaService'
import { useAuth } from '@/contexts/AuthContext'
import { hasAdminAccess } from '@/utils/auth'

interface BetaInvite {
  email: string
  reason: string | null
  addedAt: string
  usedAt: string | null
  addedBy: {
    id: string
    name: string
  }
}

export function BetaInvitesManager() {
  const { user } = useAuth()
  const [invites, setInvites] = useState<BetaInvite[]>([])
  const [loading, setLoading] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newReason, setNewReason] = useState('')

  if (!hasAdminAccess(user)) {
    return null
  }

  const loadInvites = async () => {
    setLoading(true)
    try {
      const response = await betaService.listInvites({ limit: 20, offset: 0 })
      setInvites(response.invites)
    } finally {
      setLoading(false)
    }
  }

  const handleAddInvite = async () => {
    if (!newEmail) return

    try {
      await betaService.addInvite(newEmail, newReason || undefined)
      setNewEmail('')
      setNewReason('')
      await loadInvites()
    } catch (err) {
      // Handle error
    }
  }

  const handleRemoveInvite = async (email: string) => {
    try {
      await betaService.removeInvite(email)
      await loadInvites()
    } catch (err) {
      // Handle error
    }
  }

  return (
    <div className="admin-panel">
      <h2>Gerenciar Beta Invites</h2>

      {/* Add new invite form */}
      <div className="form-group">
        <input
          type="email"
          placeholder="Email to invite"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
        <input
          type="text"
          placeholder="Reason (optional)"
          value={newReason}
          onChange={(e) => setNewReason(e.target.value)}
        />
        <button onClick={handleAddInvite}>Add Invite</button>
      </div>

      {/* List of invites */}
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Status</th>
            <th>Added At</th>
            <th>Used At</th>
            <th>Reason</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invites.map((invite) => (
            <tr key={invite.email}>
              <td>{invite.email}</td>
              <td>{invite.usedAt ? '✅ Used' : '⏳ Pending'}</td>
              <td>{new Date(invite.addedAt).toLocaleDateString()}</td>
              <td>{invite.usedAt ? new Date(invite.usedAt).toLocaleDateString() : '-'}</td>
              <td>{invite.reason || '-'}</td>
              <td>
                <button onClick={() => handleRemoveInvite(invite.email)}>Reset</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## 🛠️ Utility Functions

**Location:** `src/utils/beta.ts`

```typescript
import { User } from '@/types'

/**
 * Check if user is in beta program
 */
export function isBetaUser(user: User | null): boolean {
  return user?.accessTier === 'BETA'
}

/**
 * Check if user is admin
 */
export function isAdmin(user: User | null): boolean {
  return user?.role === 'SUPER_ADMIN'
}

/**
 * Format beta join date (pt-BR)
 */
export function formatBetaDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Get beta badge color based on join date
 */
export function getBetaBadgeColor(betaAddedAt: string | null): string {
  if (!betaAddedAt) return 'gray'

  const daysInBeta = Math.floor(
    (Date.now() - new Date(betaAddedAt).getTime()) / (1000 * 60 * 60 * 24)
  )

  if (daysInBeta < 7) return 'gold'      // New beta tester
  if (daysInBeta < 30) return 'purple'   // Active beta tester
  return 'blue'                          // Veteran beta tester
}
```

---

## 📦 Services

**Location:** `src/services/betaService.ts`

```typescript
import { apiClient } from '@/lib/apiClient'

export interface BetaInviteResponse {
  email: string
  reason: string | null
  addedAt: string
  usedAt: string | null
  addedBy: {
    id: string
    name: string
  }
}

export interface ListInvitesResponse {
  invites: BetaInviteResponse[]
  total: number
  limit: number
  offset: number
}

export const betaService = {
  /**
   * List all beta invites (admin only)
   */
  async listInvites(options: { limit?: number; offset?: number } = {}) {
    const params = new URLSearchParams()
    if (options.limit) params.append('limit', String(options.limit))
    if (options.offset) params.append('offset', String(options.offset))

    const res = await apiClient.get<ListInvitesResponse>(
      `/api/admin/beta-invites?${params}`
    )
    return res.data
  },

  /**
   * Add email to beta whitelist (admin only)
   */
  async addInvite(email: string, reason?: string) {
    const res = await apiClient.post<{ invite: BetaInviteResponse }>(
      '/api/admin/beta-invites',
      { email, reason }
    )
    return res.data.invite
  },

  /**
   * Remove email from beta whitelist (admin only)
   */
  async removeInvite(email: string) {
    await apiClient.delete(`/api/admin/beta-invites/${email}`)
  }
}
```

---

## 🔄 Data Flow

```
1. User Registration
   User fills form → POST /api/auth/register
   Backend checks if email in whitelist
   Response includes: user { accessTier: BETA | PUBLIC, betaAddedAt }
   Frontend stores accessToken in localStorage
   Frontend dispatches AuthContext.setUser(user)

2. User Login
   User fills form → POST /api/auth/login
   Backend sends accessToken
   Frontend stores token
   Frontend calls GET /api/auth/me
   Backend returns full user { accessTier, betaAddedAt }
   Frontend updates AuthContext

3. Page Load
   useEffect checks for accessToken in localStorage
   If exists: call GET /api/auth/me
   Backend returns user with accessTier
   Frontend components read user.accessTier:
     - BetaBadge: show if BETA
     - ExperimentalFeatures: show if BETA
     - BetaInvitesManager: show if SUPER_ADMIN

4. Admin Adds Invite
   Admin fills form with email
   POST /api/admin/beta-invites
   Backend validates (SUPER_ADMIN role required)
   Backend adds to whitelist
   Frontend refreshes list

5. New User Registers (invited)
   User registers with whitelisted email
   Backend finds email in whitelist
   Backend sets accessTier = 'BETA'
   Backend marks invite as usedAt = now()
   Response includes betaAddedAt
   Frontend shows BETA badge
```

---

## 🎯 Implementation Checklist

**Phase 1: Auth Context Setup**
- [ ] Update `AuthContext` to include `user.accessTier` and `user.betaAddedAt`
- [ ] Update `User` type to have `accessTier: 'PUBLIC' | 'BETA'`
- [ ] Update register function to handle response with `accessTier`
- [ ] Update login function to fetch full user from GET /api/auth/me
- [ ] Update page load logic to refresh user on mount

**Phase 2: Components**
- [ ] Create BetaBadge component
- [ ] Create ExperimentalFeatures component wrapper
- [ ] Add BetaBadge to navbar/header
- [ ] Add ExperimentalFeatures section to dashboard
- [ ] Create BetaInvitesManager admin component

**Phase 3: Admin Features**
- [ ] Create admin page for beta management
- [ ] Implement betaService with API calls
- [ ] Add role checks (hasAdminAccess)
- [ ] Test complete admin flow

**Phase 4: Polish**
- [ ] Add error handling for all API calls
- [ ] Add loading states
- [ ] Add toast notifications
- [ ] Add unit tests for components
- [ ] Add integration tests

---

## 🧪 Component Examples

### Dashboard with Beta Features

```typescript
// pages/DashboardPage.tsx
import { useAuth } from '@/contexts/AuthContext'
import { BetaBadge } from '@/components/BetaBadge'
import { ExperimentalFeatures } from '@/components/ExperimentalFeatures'
import { DashboardStats } from '@/components/DashboardStats'

export function DashboardPage() {
  const { user, isLoading } = useAuth()

  if (isLoading) return <div>Loading...</div>
  if (!user) return <Redirect to="/auth/login" />

  return (
    <div className="dashboard-container">
      {/* Header with beta badge */}
      <header className="dashboard-header">
        <h1>Dashboard</h1>
        <BetaBadge user={user} size="medium" />
      </header>

      {/* Main content */}
      <main>
        {/* Regular features (visible to all) */}
        <DashboardStats />

        {/* Beta features (visible only to BETA users) */}
        <ExperimentalFeatures>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3>Nova Interface Rápida</h3>
              <p>Empreste itens em 2 cliques</p>
              <QuickLoanButton />
            </div>
            <div>
              <h3>Filtros Avançados</h3>
              <p>Encontre empréstimos com facilidade</p>
              <AdvancedFilters />
            </div>
          </div>
        </ExperimentalFeatures>

        {/* Admin panel (visible only to SUPER_ADMIN) */}
        {user?.role === 'SUPER_ADMIN' && (
          <BetaInvitesManager />
        )}
      </main>
    </div>
  )
}
```

---

## 📋 Summary

| Aspect | Details |
|--------|---------|
| **New Type Fields** | `user.accessTier`, `user.betaAddedAt` |
| **New Components** | BetaBadge, ExperimentalFeatures, BetaInvitesManager |
| **New Service** | betaService (3 methods) |
| **New Routes** | Admin endpoints at `/api/admin/beta-invites` |
| **Protected Features** | Features gated by `accessTier === 'BETA'` |
| **Admin Only** | Whitelist management requires `SUPER_ADMIN` role |
| **User Perception** | BETA badge + experimental UI section |
