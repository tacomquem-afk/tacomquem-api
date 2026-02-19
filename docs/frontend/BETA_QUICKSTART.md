# 🚀 Beta System - Quick Start Implementation

> Step-by-step guide to implement the beta system in 2-3 hours

---

## ⏱️ Timeline

| Phase | Time | What |
|-------|------|------|
| **Setup** | 15 min | Types, context, update auth |
| **Components** | 60 min | BetaBadge, ExperimentalFeatures |
| **Admin** | 60 min | Service, admin component, page |
| **Testing** | 30 min | Basic tests and manual testing |
| **Polish** | 30 min | Error handling, loading states |
| **Total** | **3.5h** | Complete implementation |

---

## ⚙️ Phase 1: Setup (15 minutes)

### Step 1.1: Update User Type

**File:** `src/types/user.ts` (or wherever User is defined)

```typescript
export interface User {
  id: string
  name: string
  email: string
  role: 'USER' | 'SUPER_ADMIN'

  // ← ADD THESE TWO FIELDS
  accessTier: 'PUBLIC' | 'BETA'
  betaAddedAt: string | null

  // ... existing fields
}
```

### Step 1.2: Update AuthContext

**File:** `src/contexts/AuthContext.tsx`

```typescript
// In register function, ensure you capture the response
const register = async (name: string, email: string, password: string) => {
  const res = await api.post('/api/auth/register', {
    name,
    email,
    password,
    acceptTerms: true
  })

  // Backend now returns user with accessTier and betaAddedAt
  localStorage.setItem('accessToken', res.data.accessToken)
  setUser(res.data.user)  // ← This now has accessTier!
}

// In login function, fetch full user data
const login = async (email: string, password: string) => {
  const res = await api.post('/api/auth/login', { email, password })
  localStorage.setItem('accessToken', res.data.accessToken)

  // Fetch full user to get accessTier and betaAddedAt
  await refreshUser()
}

// In refreshUser, it should already be working
const refreshUser = async () => {
  const res = await api.get('/api/auth/me')
  setUser(res.data.user)  // ← Gets accessTier here
}

// On mount, check if user is logged in
useEffect(() => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    refreshUser()
  }
}, [])
```

### Step 1.3: Verify Setup

```bash
# Start dev server and login
# Open console and check:
const { user } = useAuth()
console.log(user.accessTier)    // Should be 'BETA' or 'PUBLIC'
console.log(user.betaAddedAt)   // Should be ISO date or null
```

✅ **Phase 1 Complete!**

---

## 🎨 Phase 2: Components (60 minutes)

### Step 2.1: Create BetaBadge Component

**File:** `src/components/BetaBadge.tsx`

Copy from [BETA_CHEATSHEET.md](./BETA_CHEATSHEET.md#betabadge-component)

```typescript
import { User } from '@/types'

interface BetaBadgeProps {
  user: User | null
  size?: 'small' | 'medium' | 'large'
  showTooltip?: boolean
}

export function BetaBadge({ user, size = 'small', showTooltip = true }: BetaBadgeProps) {
  if (!user || user.accessTier !== 'BETA') {
    return null
  }

  const addedDate = user.betaAddedAt
    ? new Date(user.betaAddedAt).toLocaleDateString('pt-BR')
    : null

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

### Step 2.2: Use BetaBadge in Navbar

**File:** `src/components/Navbar.tsx` (or wherever your header is)

```typescript
import { BetaBadge } from '@/components/BetaBadge'
import { useAuth } from '@/contexts/AuthContext'

export function Navbar() {
  const { user } = useAuth()

  return (
    <nav className="flex justify-between items-center">
      <h1>TáComQuem</h1>

      {/* Add beta badge next to user menu */}
      <div className="flex items-center gap-4">
        <BetaBadge user={user} size="medium" />
        <UserMenu user={user} />
      </div>
    </nav>
  )
}
```

### Step 2.3: Create ExperimentalFeatures Wrapper

**File:** `src/components/ExperimentalFeatures.tsx`

```typescript
import { useAuth } from '@/contexts/AuthContext'

interface ExperimentalFeaturesProps {
  children: React.ReactNode
}

export function ExperimentalFeatures({ children }: ExperimentalFeaturesProps) {
  const { user } = useAuth()

  // Only show if user is BETA
  if (!user || user.accessTier !== 'BETA') {
    return null
  }

  return (
    <section className="border-l-4 border-purple-300 bg-purple-50 p-4 rounded mt-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">⚡</span>
        <h2 className="font-bold text-purple-900">Funcionalidades Experimentais</h2>
      </div>
      {children}
    </section>
  )
}
```

### Step 2.4: Use ExperimentalFeatures in Dashboard

**File:** `src/pages/DashboardPage.tsx` (or similar)

```typescript
import { ExperimentalFeatures } from '@/components/ExperimentalFeatures'

export function DashboardPage() {
  const { user } = useAuth()

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>

      {/* Regular features (always visible) */}
      <DashboardStats />

      {/* Beta features (only visible to beta users) */}
      <ExperimentalFeatures>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3>Nova Interface Rápida</h3>
            <p>Empreste itens em 2 cliques</p>
            {/* <QuickLoanButton /> */}
          </div>
          <div>
            <h3>Filtros Avançados</h3>
            <p>Encontre empréstimos com facilidade</p>
            {/* <AdvancedFilters /> */}
          </div>
        </div>
      </ExperimentalFeatures>
    </div>
  )
}
```

### Step 2.5: Test Components

```bash
# Start dev server
npm run dev

# Login with:
# - A public user (no invite): See only normal features
# - A beta user (with invite): See badge + experimental section

# Check console:
const { user } = useAuth()
console.log(user.accessTier)  // Should change between PUBLIC and BETA
```

✅ **Phase 2 Complete!**

---

## 👨‍💼 Phase 3: Admin Features (60 minutes)

### Step 3.1: Create Beta Service

**File:** `src/services/betaService.ts`

Copy from [BETA_CHEATSHEET.md](./BETA_CHEATSHEET.md#api-calls)

```typescript
import { api } from '@/lib/api'

export interface BetaInvite {
  email: string
  reason: string | null
  addedAt: string
  usedAt: string | null
  addedBy: { id: string; name: string }
}

export const betaService = {
  async listInvites({ limit = 20, offset = 0 } = {}) {
    const res = await api.get('/api/admin/beta-invites', {
      params: { limit, offset }
    })
    return res.data
  },

  async addInvite(email: string, reason?: string) {
    const res = await api.post('/api/admin/beta-invites', {
      email,
      reason
    })
    return res.data.invite
  },

  async removeInvite(email: string) {
    await api.delete(`/api/admin/beta-invites/${email}`)
  }
}
```

### Step 3.2: Create BetaInvitesManager Component

**File:** `src/components/BetaInvitesManager.tsx`

```typescript
import { useState, useEffect } from 'react'
import { betaService, BetaInvite } from '@/services/betaService'
import { useAuth } from '@/contexts/AuthContext'

export function BetaInvitesManager() {
  const { user } = useAuth()
  const [invites, setInvites] = useState<BetaInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [newEmail, setNewEmail] = useState('')
  const [newReason, setNewReason] = useState('')
  const [error, setError] = useState('')

  // Only show for admins
  if (!user || user.role !== 'SUPER_ADMIN') {
    return null
  }

  useEffect(() => {
    loadInvites()
  }, [])

  const loadInvites = async () => {
    try {
      setLoading(true)
      const res = await betaService.listInvites({ limit: 50, offset: 0 })
      setInvites(res.invites)
      setError('')
    } catch (e) {
      setError('Failed to load invites')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async () => {
    if (!newEmail) {
      setError('Email is required')
      return
    }

    try {
      await betaService.addInvite(newEmail, newReason || undefined)
      setNewEmail('')
      setNewReason('')
      await loadInvites()
      setError('')
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to add invite')
    }
  }

  const handleRemove = async (email: string) => {
    try {
      await betaService.removeInvite(email)
      await loadInvites()
      setError('')
    } catch (e) {
      setError('Failed to remove invite')
    }
  }

  return (
    <div className="admin-panel">
      <h2>Gerenciar Beta Invites</h2>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Add invite form */}
      <div className="form-group mb-6">
        <div className="flex gap-2">
          <input
            type="email"
            placeholder="Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="flex-1 px-3 py-2 border rounded"
          />
          <input
            type="text"
            placeholder="Reason (optional)"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            className="flex-1 px-3 py-2 border rounded"
          />
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Add
          </button>
        </div>
      </div>

      {/* Invites table */}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table className="w-full border-collapse border">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">Email</th>
              <th className="border p-2">Status</th>
              <th className="border p-2">Added</th>
              <th className="border p-2">Used</th>
              <th className="border p-2">Reason</th>
              <th className="border p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => (
              <tr key={invite.email}>
                <td className="border p-2">{invite.email}</td>
                <td className="border p-2">
                  {invite.usedAt ? '✅ Used' : '⏳ Pending'}
                </td>
                <td className="border p-2">
                  {new Date(invite.addedAt).toLocaleDateString('pt-BR')}
                </td>
                <td className="border p-2">
                  {invite.usedAt
                    ? new Date(invite.usedAt).toLocaleDateString('pt-BR')
                    : '-'}
                </td>
                <td className="border p-2">{invite.reason || '-'}</td>
                <td className="border p-2">
                  <button
                    onClick={() => handleRemove(invite.email)}
                    className="px-2 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

### Step 3.3: Add to Dashboard

**File:** `src/pages/DashboardPage.tsx`

```typescript
import { BetaInvitesManager } from '@/components/BetaInvitesManager'
import { useAuth } from '@/contexts/AuthContext'

export function DashboardPage() {
  const { user } = useAuth()

  return (
    <div>
      {/* Regular content */}
      <h1>Dashboard</h1>

      {/* Admin panel (automatically hidden if not SUPER_ADMIN) */}
      <BetaInvitesManager />
    </div>
  )
}
```

### Step 3.4: Test Admin Features

```bash
# Login with SUPER_ADMIN account
# You should see the "Gerenciar Beta Invites" form

# Try:
# 1. Add new email
# 2. List should show it with ⏳ Pending status
# 3. Register with that email
# 4. List should show ✅ Used status
# 5. Click Remove to delete
```

✅ **Phase 3 Complete!**

---

## 🧪 Phase 4: Testing (30 minutes)

### Step 4.1: Basic Unit Test

**File:** `src/components/__tests__/BetaBadge.test.tsx`

```typescript
import { render } from '@testing-library/react'
import { BetaBadge } from '../BetaBadge'

describe('BetaBadge', () => {
  const mockUser = {
    id: '1',
    name: 'Test User',
    email: 'test@example.com',
    role: 'USER',
    accessTier: 'BETA',
    betaAddedAt: '2026-02-19T14:35:00Z'
  }

  it('should show badge for BETA user', () => {
    const { getByText } = render(<BetaBadge user={mockUser} />)
    expect(getByText('BETA')).toBeInTheDocument()
  })

  it('should not show badge for PUBLIC user', () => {
    const publicUser = { ...mockUser, accessTier: 'PUBLIC', betaAddedAt: null }
    const { container } = render(<BetaBadge user={publicUser} />)
    expect(container.firstChild).toBeNull()
  })

  it('should not show badge if no user', () => {
    const { container } = render(<BetaBadge user={null} />)
    expect(container.firstChild).toBeNull()
  })
})
```

### Step 4.2: Manual Test Checklist

```bash
# Test 1: Public User
[ ] Register with email NOT in whitelist
[ ] Login successful
[ ] Check profile: accessTier === 'PUBLIC'
[ ] Badge NOT showing
[ ] Experimental features NOT showing

# Test 2: Beta User
[ ] Admin adds email to whitelist
[ ] Register with that email
[ ] Login successful
[ ] Check profile: accessTier === 'BETA'
[ ] Badge IS showing with date
[ ] Experimental features IS showing

# Test 3: Admin Panel
[ ] Login as SUPER_ADMIN
[ ] See "Gerenciar Beta Invites" section
[ ] Add new email
[ ] See in list with ⏳ Pending
[ ] Register with that email
[ ] See changed to ✅ Used
[ ] Remove email
[ ] See disappear from list

# Test 4: Error Cases
[ ] Add duplicate email → Error shown
[ ] Add invalid email → Error shown
[ ] Remove non-existent email → Error shown
```

✅ **Phase 4 Complete!**

---

## 🎨 Phase 5: Polish (30 minutes)

### Step 5.1: Add Error Boundary

```typescript
import { ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return <div className="alert alert-error">{this.state.error?.message}</div>
    }
    return this.props.children
  }
}

// Use in App
<ErrorBoundary>
  <BetaInvitesManager />
</ErrorBoundary>
```

### Step 5.2: Add Loading Skeletons

```typescript
export function BetaInvitesManagerSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
    </div>
  )
}

// Use
{loading ? <BetaInvitesManagerSkeleton /> : <table>...</table>}
```

### Step 5.3: Add Success Toast

```typescript
// In handleAdd
try {
  await betaService.addInvite(newEmail)
  showToast('✅ Invite added successfully', 'success')
  setNewEmail('')
  await loadInvites()
} catch (e) {
  showToast('❌ Failed to add invite', 'error')
}
```

✅ **Phase 5 Complete!**

---

## 🎯 Final Validation

```bash
# Run tests
npm test

# Check types
npm run type-check

# Manual checklist
[ ] Normal users see PUBLIC tier
[ ] Beta users see BETA tier with badge
[ ] Experimental features show only for BETA
[ ] Admin can add/list/remove invites
[ ] All API errors handled gracefully
[ ] Loading states show correctly
[ ] No TypeScript errors
[ ] No console warnings
```

---

## 🚀 You're Done!

**Summary:**
- ✅ Added `accessTier` and `betaAddedAt` to User type
- ✅ Created BetaBadge component
- ✅ Created ExperimentalFeatures wrapper
- ✅ Created admin invites manager
- ✅ Integrated with auth context
- ✅ Added tests
- ✅ Polished UX with error handling and loading states

**Next:**
1. Deploy to staging
2. Test with real users
3. Gather feedback
4. Iterate on experimental features
5. Move to production

Need help? Check the other docs:
- [BETA_FLOW.md](./BETA_FLOW.md) - System architecture
- [BETA_ARCHITECTURE.md](./BETA_ARCHITECTURE.md) - Component design
- [BETA_TESTING.md](./BETA_TESTING.md) - Advanced testing

Happy coding! 🎉
