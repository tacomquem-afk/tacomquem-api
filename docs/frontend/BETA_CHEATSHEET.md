# 🚀 Beta Invites - Cheat Sheet Frontend

**Referência rápida para implementar o sistema de beta no frontend.**

---

## 📌 O Essencial em 30 Segundos

1. **Usuario se registra com email na whitelist** → Backend automaticamente seta `accessTier = "BETA"`
2. **Frontend chama GET /api/auth/me** → Recebe `accessTier` e `betaAddedAt`
3. **Mostra badge se `accessTier === "BETA"`** → User sabe que é beta tester
4. **Condiciona features se BETA** → Funcionalidades experimentais ativadas

**Pronto! ✅**

---

## 🔗 Endpoints Essenciais

### Registro (Sem mudanças)
```bash
POST /api/auth/register
{
  "name": "João",
  "email": "joao@example.com",
  "password": "Pass123",
  "acceptTerms": true
}
```

### Verificar Tier do User
```bash
GET /api/auth/me
# Response inclui:
# "accessTier": "BETA" | "PUBLIC"
# "betaAddedAt": "2026-02-19T14:35:00Z" | null
```

### Admin: Adicionar Email à Whitelist
```bash
POST /api/admin/beta-invites
{
  "email": "nova@example.com",
  "reason": "QA Engineer (opcional)"
}
```

### Admin: Listar Whitelisted Emails
```bash
GET /api/admin/beta-invites?limit=20&offset=0
```

### Admin: Remover Email
```bash
DELETE /api/admin/beta-invites/email@example.com
```

---

## 💻 Código TypeScript

### 1. Armazenar User State

```typescript
interface User {
  id: string
  name: string
  email: string
  emailVerified: boolean
  role: 'USER' | 'ANALYST' | 'SUPPORT' | 'MODERATOR' | 'SUPER_ADMIN'
  accessTier: 'PUBLIC' | 'BETA' | 'ARCHIVED'
  betaAddedAt: string | null  // ISO timestamp ou null
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
  isActive: boolean
  blockedAt: string | null
}

// No seu state management (React Context / Zustand / Redux)
const [user, setUser] = useState<User | null>(null)
```

---

### 2. Fetch User Data Após Login

```typescript
async function fetchUserProfile(accessToken: string) {
  const response = await fetch('/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    throw new Error('Failed to fetch user profile')
  }

  const userData: User = await response.json()

  // Armazena no context/state global
  setUser(userData)

  return userData
}

// Chamar após login bem-sucedido
useEffect(() => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    fetchUserProfile(token).catch(err => {
      console.error('Error fetching user:', err)
      // Redireciona para login se falhar
    })
  }
}, [])
```

---

### 3. Badge/Indicator de BETA

```typescript
function UserProfile() {
  const { user } = useAuth()

  return (
    <div className="profile">
      <h2>{user.name}</h2>

      {user.accessTier === 'BETA' && (
        <span className="badge badge-beta">🎯 BETA</span>
      )}

      {user.betaAddedAt && (
        <span title={`Beta desde ${new Date(user.betaAddedAt).toLocaleDateString()}`}>
          Testador do Programa Beta
        </span>
      )}
    </div>
  )
}
```

---

### 4. Feature Flag para Funcionalidades Beta

```typescript
function ExperimentalFeatures() {
  const { user } = useAuth()

  // Só renderiza se for BETA
  if (user?.accessTier !== 'BETA') {
    return null
  }

  return (
    <section className="experimental">
      <h3>🧪 Funcionalidades Experimentais</h3>
      <button>Nova Interface de Empréstimos</button>
      <button>Dashboard Avançado</button>
      <button>Alertas em Tempo Real</button>
    </section>
  )
}
```

---

### 5. Admin: Adicionar Beta User

```typescript
async function addBetaInvite(email: string, reason?: string) {
  const response = await fetch('/api/admin/beta-invites', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      email,
      reason
    })
  })

  if (response.status === 201) {
    const data = await response.json()
    console.log('Email adicionado:', data.invite.email)
    return data
  } else if (response.status === 409) {
    throw new Error('Email já está na whitelist')
  } else if (response.status === 400) {
    throw new Error('Email inválido')
  } else {
    throw new Error('Erro ao adicionar email')
  }
}
```

---

### 6. Admin: Listar Beta Invites

```typescript
async function listBetaInvites(limit = 20, offset = 0) {
  const response = await fetch(
    `/api/admin/beta-invites?limit=${limit}&offset=${offset}`,
    {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    }
  )

  const data = await response.json()

  return {
    total: data.total,
    emails: data.invites.map(invite => ({
      email: invite.email,
      addedAt: new Date(invite.addedAt),
      usedAt: invite.usedAt ? new Date(invite.usedAt) : null,
      reason: invite.reason,
      addedBy: invite.addedBy.name
    }))
  }
}
```

---

### 7. Admin: Remover Beta Invite

```typescript
async function removeBetaInvite(email: string) {
  const response = await fetch(
    `/api/admin/beta-invites/${encodeURIComponent(email)}`,
    {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    }
  )

  if (response.ok) {
    console.log('Email removido da whitelist')
  } else if (response.status === 404) {
    throw new Error('Email não encontrado')
  } else {
    throw new Error('Erro ao remover email')
  }
}
```

---

## 🎨 React Components Examples

### Badge Component

```tsx
interface BetaBadgeProps {
  user: User
}

export function BetaBadge({ user }: BetaBadgeProps) {
  if (user.accessTier !== 'BETA') return null

  const betaDate = user.betaAddedAt
    ? new Date(user.betaAddedAt).toLocaleDateString('pt-BR')
    : null

  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-100 text-purple-700"
      title={betaDate ? `Beta desde ${betaDate}` : undefined}
    >
      <span>🎯</span>
      <span className="text-sm font-medium">BETA</span>
    </div>
  )
}
```

---

### Admin: Beta Whitelist Manager

```tsx
export function BetaWhitelistManager() {
  const [emails, setEmails] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [list, setList] = useState([])

  async function handleAddEmail() {
    setLoading(true)
    try {
      await addBetaInvite(emails, reason)
      setEmails('')
      setReason('')

      // Recarrega lista
      const updated = await listBetaInvites()
      setList(updated.emails)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  async function handleRemoveEmail(email: string) {
    if (confirm(`Remove ${email} da whitelist?`)) {
      try {
        await removeBetaInvite(email)
        const updated = await listBetaInvites()
        setList(updated.emails)
      } catch (error) {
        console.error(error)
      }
    }
  }

  useEffect(() => {
    listBetaInvites().then(data => setList(data.emails))
  }, [])

  return (
    <div className="admin-panel">
      <h2>Gerenciar Beta Whitelist</h2>

      <form onSubmit={(e) => { e.preventDefault(); handleAddEmail() }}>
        <input
          type="email"
          placeholder="novo@example.com"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          required
        />

        <textarea
          placeholder="Motivo (opcional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <button disabled={loading}>
          {loading ? 'Adicionando...' : 'Adicionar à Whitelist'}
        </button>
      </form>

      <h3>Emails Convidados ({list.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Adicionado em</th>
            <th>Usado em</th>
            <th>Motivo</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          {list.map(item => (
            <tr key={item.email}>
              <td>{item.email}</td>
              <td>{item.addedAt.toLocaleDateString('pt-BR')}</td>
              <td>{item.usedAt?.toLocaleDateString('pt-BR') || '—'}</td>
              <td>{item.reason || '—'}</td>
              <td>
                <button
                  onClick={() => handleRemoveEmail(item.email)}
                  className="btn-danger"
                >
                  Remover
                </button>
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

## 📊 Fluxo Simplificado

```
User Preenche Formulário
        ↓
POST /api/auth/register
        ↓
Backend Verifica: Email na whitelist?
     ✅ SIM → accessTier = "BETA"
     ❌ NÃO → accessTier = "PUBLIC"
        ↓
User Verifica Email
        ↓
GET /api/auth/me
        ↓
Frontend Lê user.accessTier
        ↓
Mostra Badge/Features se BETA
        ↓
Done! ✅
```

---

## ⚠️ Gotchas Comuns

### ❌ Erro: Calcular tier no Frontend
```typescript
// ERRADO ❌
if (email === 'whitelist@example.com') {
  setAccessTier('BETA')
}

// CERTO ✅
// Deixa o backend fazer
// Após GET /api/auth/me, use user.accessTier
```

### ❌ Erro: Guardar Whitelist Localmente
```typescript
// ERRADO ❌
const betaEmails = ['alice@test.com', 'bob@test.com']
if (betaEmails.includes(email)) { ... }

// CERTO ✅
// Backend tem a fonte da verdade
// Frontend só consome o resultado
```

### ✅ Certo: Usar Como Feature Flag
```typescript
// CORRETO ✅
if (user.accessTier === 'BETA') {
  showExperimentalUI()
}
```

---

## 📝 Tipos TypeScript Úteis

```typescript
// Response após registrar
interface RegisterResponse {
  status: 'success' | 'pending_parental_consent'
  user: User
  accessToken: string
  refreshToken: string
  canUseApp: boolean
  message: string
}

// Beta Invite (da API)
interface BetaInvite {
  email: string
  addedAt: string  // ISO date
  usedAt: string | null
  reason: string | null
  addedBy: {
    id: string
    name: string
  }
}

// Beta Invites List Response
interface BetaInvitesListResponse {
  total: number
  limit: number
  offset: number
  invites: BetaInvite[]
}
```

---

## 🎯 Simples Assim!

| O que fazer | Como chamar |
|-------------|-------------|
| Saber se user é BETA | `user.accessTier === 'BETA'` |
| Mostrar badge | `if (user.accessTier === 'BETA') <Badge />` |
| Funcionalidade experimental | `if (user.accessTier === 'BETA') showFeature()` |
| Admin adicionar email | `POST /api/admin/beta-invites` |
| Admin ver lista | `GET /api/admin/beta-invites` |
| Admin remover email | `DELETE /api/admin/beta-invites/:email` |

**Nenhuma lógica complicada no frontend!** Frontend é só consumidor de dados. 🎉
