# 🧪 Beta System - Testing Guide

> Exemplos de testes para validar o comportamento do sistema de beta no frontend.

---

## Cenários de Teste

### ✅ Scenario 1: User Normal (PUBLIC) - Sem Convite

**Setup:**
- Email `normaluser@example.com` NÃO está na whitelist
- User se registra normalmente

**Teste:**
```gherkin
Dado que "normaluser@example.com" não está na whitelist
Quando o usuário se registra com esse email
E faz login com sucesso
E chama GET /api/auth/me

Então:
  ✓ response.accessTier === 'PUBLIC'
  ✓ response.betaAddedAt === null
  ✓ Badge BETA não aparece no perfil
  ✓ Features experimentais não são renderizadas
```

**Código de Teste (Jest/Vitest):**
```typescript
describe('Beta System - Normal User', () => {
  it('should have PUBLIC tier for non-invited email', async () => {
    // Register
    const registerRes = await api.post('/auth/register', {
      name: 'Normal User',
      email: 'normaluser@example.com',
      password: 'Pass123',
      acceptTerms: true
    })

    expect(registerRes.status).toBe(201)
    expect(registerRes.body.user.id).toBeDefined()

    const { accessToken } = registerRes.body

    // Get user profile
    const profileRes = await api.get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(profileRes.status).toBe(200)
    expect(profileRes.body.accessTier).toBe('PUBLIC')
    expect(profileRes.body.betaAddedAt).toBeNull()
  })

  it('should not show BETA badge for PUBLIC tier user', () => {
    const { user } = useAuth()

    const result = render(<BetaBadge user={user} />)

    expect(result.queryByText('BETA')).not.toBeInTheDocument()
  })

  it('should not show experimental features for PUBLIC user', () => {
    const { user } = useAuth()

    const result = render(<ExperimentalFeatures />)

    expect(result.queryByText(/Funcionalidades Experimentais/)).not.toBeInTheDocument()
  })
})
```

---

### ✅ Scenario 2: Beta User - Com Convite

**Setup:**
- Admin adiciona `betauser@example.com` à whitelist
- User se registra com esse email

**Teste:**
```gherkin
Dado que o admin adicionou "betauser@example.com" à whitelist
Quando o usuário se registra com esse email
E faz login com sucesso
E chama GET /api/auth/me

Então:
  ✓ response.accessTier === 'BETA'
  ✓ response.betaAddedAt está preenchido (timestamp válido)
  ✓ Badge BETA aparece no perfil
  ✓ Features experimentais SÃO renderizadas
  ✓ betaInvites.usedAt foi atualizado
```

**Código de Teste:**
```typescript
describe('Beta System - Invited User', () => {
  it('should have BETA tier for invited email', async () => {
    // Admin adds email to whitelist
    const adminRes = await api.post('/admin/beta-invites', {
      email: 'betauser@example.com',
      reason: 'QA Tester'
    }).set('Authorization', `Bearer ${adminToken}`)

    expect(adminRes.status).toBe(201)
    expect(adminRes.body.invite.usedAt).toBeNull() // Not used yet

    // User registers
    const registerRes = await api.post('/auth/register', {
      name: 'Beta User',
      email: 'betauser@example.com',
      password: 'Pass123',
      acceptTerms: true
    })

    expect(registerRes.status).toBe(201)
    const { accessToken } = registerRes.body

    // Get user profile
    const profileRes = await api.get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(profileRes.status).toBe(200)
    expect(profileRes.body.accessTier).toBe('BETA')
    expect(profileRes.body.betaAddedAt).toBeDefined()
    expect(new Date(profileRes.body.betaAddedAt)).toBeInstanceOf(Date)

    // Check that invite is now marked as used
    const invitesRes = await api.get('/admin/beta-invites')
      .set('Authorization', `Bearer ${adminToken}`)

    const invite = invitesRes.body.invites.find(
      i => i.email === 'betauser@example.com'
    )
    expect(invite.usedAt).toBeDefined()
  })

  it('should show BETA badge for BETA tier user', () => {
    const betaUser = {
      ...defaultUser,
      accessTier: 'BETA',
      betaAddedAt: '2026-02-19T14:35:00Z'
    }

    const result = render(<BetaBadge user={betaUser} />)

    expect(result.getByText('BETA')).toBeInTheDocument()
    expect(result.getByText('🎯')).toBeInTheDocument()
  })

  it('should show experimental features for BETA user', () => {
    const betaUser = {
      ...defaultUser,
      accessTier: 'BETA'
    }

    const result = render(<ExperimentalFeatures />)

    expect(result.getByText(/Funcionalidades Experimentais/)).toBeInTheDocument()
    expect(result.getByText('Nova Interface de Empréstimos')).toBeInTheDocument()
  })
})
```

---

### ✅ Scenario 3: Admin Adiciona Email à Whitelist

**Setup:**
- Admin tem token válido com SUPER_ADMIN role

**Teste:**
```gherkin
Dado que admin é SUPER_ADMIN
Quando admin chama POST /api/admin/beta-invites
  com email "novo@example.com" e motivo "UX Designer"

Então:
  ✓ Response status é 201 Created
  ✓ Email foi adicionado à whitelist
  ✓ inviteResponse.usedAt === null (não foi usado ainda)
  ✓ inviteResponse.addedAt está preenchido
  ✓ inviteResponse.addedBy.id === admin ID
```

**Código de Teste:**
```typescript
describe('Admin Beta Management', () => {
  it('should add email to whitelist', async () => {
    const response = await api.post('/admin/beta-invites', {
      email: 'novo@example.com',
      reason: 'UX Designer'
    }).set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(201)
    expect(response.body.success).toBe(true)
    expect(response.body.invite.email).toBe('novo@example.com')
    expect(response.body.invite.reason).toBe('UX Designer')
    expect(response.body.invite.usedAt).toBeNull()
    expect(response.body.invite.addedBy.id).toBeDefined()
  })

  it('should reject invalid email', async () => {
    const response = await api.post('/admin/beta-invites', {
      email: 'not-an-email'
    }).set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('VALIDATION_INVALID_REQUEST')
  })

  it('should reject duplicate email', async () => {
    const email = 'duplicate@example.com'

    // First add
    await api.post('/admin/beta-invites', {
      email
    }).set('Authorization', `Bearer ${adminToken}`)

    // Try to add again
    const response = await api.post('/admin/beta-invites', {
      email
    }).set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(409)
    expect(response.body.errorCode).toBe('AUTH_EMAIL_TAKEN')
  })

  it('should require SUPER_ADMIN role', async () => {
    const userToken = 'regular-user-token'

    const response = await api.post('/admin/beta-invites', {
      email: 'test@example.com'
    }).set('Authorization', `Bearer ${userToken}`)

    expect(response.status).toBe(403)
    expect(response.body.errorCode).toBe('AUTH_FORBIDDEN')
  })
})
```

---

### ✅ Scenario 4: Admin Lista Beta Invites

**Setup:**
- Whitelist com múltiplos emails

**Teste:**
```gherkin
Dado que a whitelist contém:
  - alice@test.com (adicionado há 5 dias, usado há 3 dias)
  - bob@test.com (adicionado há 2 dias, não usado)
  - carol@test.com (adicionado ontem, não usado)

Quando admin chama GET /api/admin/beta-invites?limit=2&offset=0

Então:
  ✓ Response total === 3
  ✓ Response invites.length === 2 (paginação)
  ✓ Cada invite tem: email, addedAt, usedAt, reason, addedBy
  ✓ Paginação funciona (offset)
```

**Código de Teste:**
```typescript
describe('Admin Beta List', () => {
  it('should list beta invites with pagination', async () => {
    // Add 3 invites
    await api.post('/admin/beta-invites', {
      email: 'alice@test.com'
    }).set('Authorization', `Bearer ${adminToken}`)

    await api.post('/admin/beta-invites', {
      email: 'bob@test.com'
    }).set('Authorization', `Bearer ${adminToken}`)

    await api.post('/admin/beta-invites', {
      email: 'carol@test.com'
    }).set('Authorization', `Bearer ${adminToken}`)

    // List with limit=2
    const response = await api.get('/admin/beta-invites?limit=2&offset=0')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(200)
    expect(response.body.total).toBe(3)
    expect(response.body.limit).toBe(2)
    expect(response.body.offset).toBe(0)
    expect(response.body.invites).toHaveLength(2)

    // Each invite has required fields
    response.body.invites.forEach(invite => {
      expect(invite.email).toBeDefined()
      expect(invite.addedAt).toBeDefined()
      expect(invite.usedAt).toBeDefined()  // Can be null
      expect(invite.reason).toBeDefined()  // Can be null
      expect(invite.addedBy).toBeDefined()
      expect(invite.addedBy.id).toBeDefined()
      expect(invite.addedBy.name).toBeDefined()
    })
  })

  it('should support pagination', async () => {
    // Get second page
    const response = await api.get('/admin/beta-invites?limit=2&offset=2')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(200)
    expect(response.body.offset).toBe(2)
    expect(response.body.invites).toHaveLength(1)
  })
})
```

---

### ✅ Scenario 5: Admin Remove Email da Whitelist

**Setup:**
- Email está na whitelist

**Teste:**
```gherkin
Dado que "remove@example.com" está na whitelist
Quando admin chama DELETE /api/admin/beta-invites/remove@example.com

Então:
  ✓ Response status é 200 OK
  ✓ Email foi removido da whitelist
  ✓ Usuário que já se registrou continua com tier BETA
```

**Código de Teste:**
```typescript
describe('Admin Remove Beta Invite', () => {
  it('should remove email from whitelist', async () => {
    const email = 'remove@example.com'

    // Add to whitelist
    await api.post('/admin/beta-invites', {
      email
    }).set('Authorization', `Bearer ${adminToken}`)

    // Remove from whitelist
    const response = await api.delete(`/admin/beta-invites/${email}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)

    // Verify it's removed from list
    const listRes = await api.get('/admin/beta-invites')
      .set('Authorization', `Bearer ${adminToken}`)

    const found = listRes.body.invites.find(i => i.email === email)
    expect(found).toBeUndefined()
  })

  it('should return 404 if email not in whitelist', async () => {
    const response = await api.delete('/admin/beta-invites/nonexistent@example.com')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(response.status).toBe(404)
    expect(response.body.errorCode).toBe('ADMIN_TARGET_NOT_FOUND')
  })

  it('should not affect registered user tier', async () => {
    const email = 'betauser@example.com'

    // Add to whitelist
    await api.post('/admin/beta-invites', {
      email
    }).set('Authorization', `Bearer ${adminToken}`)

    // User registers (gets BETA tier)
    const registerRes = await api.post('/auth/register', {
      name: 'Beta User',
      email,
      password: 'Pass123',
      acceptTerms: true
    })

    const { accessToken } = registerRes.body

    // Remove from whitelist
    await api.delete(`/admin/beta-invites/${email}`)
      .set('Authorization', `Bearer ${adminToken}`)

    // User still has BETA tier
    const profileRes = await api.get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(profileRes.body.accessTier).toBe('BETA')
    expect(profileRes.body.betaAddedAt).toBeDefined()
  })
})
```

---

## 🎯 Frontend Component Tests

### BetaBadge Component

```typescript
describe('BetaBadge Component', () => {
  it('should render badge for BETA user', () => {
    const user = {
      ...mockUser,
      accessTier: 'BETA',
      betaAddedAt: '2026-02-19T14:35:00Z'
    }

    const { getByText, getByTitle } = render(<BetaBadge user={user} />)

    expect(getByText('BETA')).toBeInTheDocument()
    expect(getByText('🎯')).toBeInTheDocument()
    expect(getByTitle(/Beta desde/)).toBeInTheDocument()
  })

  it('should not render for PUBLIC user', () => {
    const user = {
      ...mockUser,
      accessTier: 'PUBLIC',
      betaAddedAt: null
    }

    const { container } = render(<BetaBadge user={user} />)

    expect(container.firstChild).toBeEmptyDOMElement()
  })

  it('should format date correctly', () => {
    const user = {
      ...mockUser,
      accessTier: 'BETA',
      betaAddedAt: '2026-01-15T10:00:00Z'
    }

    const { getByTitle } = render(<BetaBadge user={user} />)

    // Check for localized date format (pt-BR)
    expect(getByTitle(/15\/01\/2026/)).toBeInTheDocument()
  })
})
```

---

## 📊 Integration Tests

```typescript
describe('Beta System - Integration', () => {
  it('complete flow: whitelist → register → verify → see badge', async () => {
    const email = 'integration@test.com'

    // 1. Admin adds to whitelist
    const addRes = await api.post('/admin/beta-invites', {
      email,
      reason: 'Integration test'
    }).set('Authorization', `Bearer ${adminToken}`)

    expect(addRes.status).toBe(201)

    // 2. User registers
    const regRes = await api.post('/auth/register', {
      name: 'Integration User',
      email,
      password: 'IntegPass123',
      acceptTerms: true
    })

    expect(regRes.status).toBe(201)
    const accessToken = regRes.body.accessToken

    // 3. Verify email
    const verifyToken = 'mock-verification-token'
    const verifyRes = await api.post('/auth/verify-email', {
      token: verifyToken
    })

    // 4. Get user profile
    const profileRes = await api.get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)

    expect(profileRes.body.accessTier).toBe('BETA')

    // 5. Component shows badge
    const { getByText } = render(
      <BetaBadge user={profileRes.body} />
    )

    expect(getByText('BETA')).toBeInTheDocument()
  })
})
```

---

## 🔍 Manual Testing Checklist

- [ ] Register com email normal → `accessTier: PUBLIC`
- [ ] Add email à whitelist → GET lista mostra email
- [ ] Register com email na whitelist → `accessTier: BETA`
- [ ] Badge BETA aparece no perfil do beta user
- [ ] Features experimentais visíveis para BETA user
- [ ] Features experimentais NÃO visíveis para PUBLIC user
- [ ] Remove email da whitelist → Usuário já registrado continua BETA
- [ ] Tenta adicionar email duplicado → Erro 409
- [ ] Sem token admin → Erro 403
- [ ] Paginação funciona corretamente

---

## 📝 Test Data Seed

```typescript
async function seedBetaTestData() {
  const adminToken = await getAdminToken()

  const testEmails = [
    { email: 'alice@test.com', reason: 'QA Engineer' },
    { email: 'bob@test.com', reason: 'UX Designer' },
    { email: 'carol@test.com', reason: 'Product Manager' },
    { email: 'dave@test.com', reason: null },
  ]

  for (const { email, reason } of testEmails) {
    await api.post('/admin/beta-invites', {
      email,
      reason
    }).set('Authorization', `Bearer ${adminToken}`)
  }

  // Now create test users with these emails
  const testUsers = [
    { email: 'alice@test.com', name: 'Alice Test' },
    { email: 'bob@test.com', name: 'Bob Test' },
  ]

  for (const { email, name } of testUsers) {
    await api.post('/auth/register', {
      name,
      email,
      password: 'TestPass123',
      acceptTerms: true
    })
  }

  console.log('✅ Beta test data seeded')
}
```

---

## 🚀 Simplify Testing

Use todos esses asserts para garantir o sistema todo funciona:

```typescript
// Mocks rápidos
const mockBetaUser = {
  accessTier: 'BETA',
  betaAddedAt: new Date().toISOString()
}

const mockPublicUser = {
  accessTier: 'PUBLIC',
  betaAddedAt: null
}

// Quick tests
expect(isBetaUser(mockBetaUser)).toBe(true)
expect(isBetaUser(mockPublicUser)).toBe(false)
```
