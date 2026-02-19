# 📚 Beta System Frontend Documentation

> Complete documentation for TáComQuem Beta Program - Ready for frontend development

## 🎯 Quick Start

**New to the beta system? Start here:**

1. **Read first:** [BETA_FLOW.md](./BETA_FLOW.md) (2 min) - Understand what happens from admin invite to dashboard
2. **Code examples:** [BETA_CHEATSHEET.md](./BETA_CHEATSHEET.md) (5 min) - Copy-paste ready code
3. **Architecture:** [BETA_ARCHITECTURE.md](./BETA_ARCHITECTURE.md) (10 min) - How to structure your code
4. **Testing:** [BETA_TESTING.md](./BETA_TESTING.md) (5 min) - Test scenarios and examples

**Total time: 20 minutes**

---

## 📖 Documentation Overview

### [BETA_FLOW.md](./BETA_FLOW.md) - System Overview (2,400 lines)

**What:** Complete system documentation explaining the entire beta program flow

**Contains:**
- 📊 Flow diagram (admin invite → registration → dashboard)
- 🔌 All API endpoints with curl examples
- 📋 Data structures and type definitions
- 📝 Behavior checklist (what backend does automatically)
- ❓ FAQ section with common questions
- ➡️ Practical example flow

**Best for:** Understanding how everything connects

**Key sections:**
- Fluxo Completo (complete flow with ASCII diagram)
- Endpoints da API (all 3 admin endpoints + 1 user endpoint)
- Estruturas de Dados (types for request/response)
- O Que VOCÊ NÃO Faz (important: backend automation)

---

### [BETA_CHEATSHEET.md](./BETA_CHEATSHEET.md) - Quick Reference (500 lines)

**What:** Fast reference with copy-paste ready code examples

**Contains:**
- ⚡ 30-second system summary
- 📝 TypeScript type definitions (ready to copy)
- 💻 React component examples (badges, forms, lists)
- 🔗 Fetch examples for all endpoints
- 📋 Common mistakes and how to avoid them
- ✅ Simplified flow diagram

**Best for:** When you need to code something specific

**Quick access:**
- Interfaces (User, BetaInvite, Response types)
- Components (BetaBadge, ExperimentalFeatures)
- API calls (fetch examples for each endpoint)
- Logic checks (isBetaUser, isAdmin, etc.)

---

### [BETA_ARCHITECTURE.md](./BETA_ARCHITECTURE.md) - Implementation Guide (1,500 lines)

**What:** Frontend architecture and component structure

**Contains:**
- 🏗️ Recommended folder structure
- 🧩 Component hierarchy and relationships
- 💾 State management options (Context API vs Zustand)
- 🎨 Complete component implementations
- 🛠️ Service layer with type definitions
- 🔄 Data flow diagrams
- ✅ Implementation checklist

**Best for:** Planning your frontend structure

**Key sections:**
- Architecture diagram (top-level)
- Component hierarchy (App → Router → Components)
- AuthContext implementation (full code)
- BetaBadge component (complete)
- BetaInvitesManager component (complete)
- betaService with all methods

---

### [BETA_TESTING.md](./BETA_TESTING.md) - Testing Guide (1,200 lines)

**What:** Test scenarios and implementation examples

**Contains:**
- ✅ 5 complete test scenarios (Gherkin format + code)
- 🎯 Component tests (BetaBadge, etc.)
- 📊 Integration test example (complete flow)
- 🔍 Manual testing checklist
- 🌱 Test data seeding script
- 🚀 Simplified testing patterns

**Best for:** Writing tests for your implementation

**Test scenarios:**
1. Normal user (no invite) → PUBLIC tier
2. Beta user (with invite) → BETA tier
3. Admin adds invite
4. Admin lists invites (pagination)
5. Admin removes invite

---

## 🎓 Learning Path

### For Frontend Developers

**Path 1: Just need to code**
1. [BETA_CHEATSHEET.md](./BETA_CHEATSHEET.md) - Copy the types and components
2. [BETA_ARCHITECTURE.md](./BETA_ARCHITECTURE.md) - Follow the component structure
3. [BETA_TESTING.md](./BETA_TESTING.md) - Write tests

**Path 2: Want to understand everything**
1. [BETA_FLOW.md](./BETA_FLOW.md) - Read the complete flow
2. [BETA_ARCHITECTURE.md](./BETA_ARCHITECTURE.md) - See how components connect
3. [BETA_CHEATSHEET.md](./BETA_CHEATSHEET.md) - Get code examples
4. [BETA_TESTING.md](./BETA_TESTING.md) - Test thoroughly

### For LLM / AI Assistants

**Recommended order:**
1. Start with [BETA_FLOW.md](./BETA_FLOW.md) - Get complete context
2. Then [BETA_ARCHITECTURE.md](./BETA_ARCHITECTURE.md) - Understand structure
3. Then [BETA_CHEATSHEET.md](./BETA_CHEATSHEET.md) - Learn patterns
4. Finally [BETA_TESTING.md](./BETA_TESTING.md) - Validate implementation

All files are written for AI comprehension with:
- Clear structure and headings
- Code examples in context
- Type definitions explicit
- Edge cases documented
- Validation rules listed

---

## 🔑 Key Concepts (tl;dr)

### What is Beta?

Beta is a **whitelist-based early access program**:

1. **Admin** adds email to whitelist
2. **User** registers with that email
3. **Backend** automatically sets `accessTier = 'BETA'` and `betaAddedAt = now()`
4. **Frontend** shows beta badge and experimental features
5. **Everyone else** gets `accessTier = 'PUBLIC'` (normal experience)

### Backend Does (Not Your Problem)

```
✅ Checks email against whitelist
✅ Sets accessTier automatically
✅ Sets betaAddedAt timestamp
✅ Marks invite as used
✅ Validates SUPER_ADMIN role for admin endpoints
```

### Frontend Does (Your Responsibility)

```
✅ Show/hide badge: if user.accessTier === 'BETA'
✅ Show/hide features: if user.accessTier === 'BETA'
✅ Call admin endpoints: POST/GET/DELETE /api/admin/beta-invites
✅ Handle errors from API
✅ Show loading states
✅ Validate form inputs
```

---

## 📦 What You're Building

### Components

```
BetaBadge
  └─ Shows "🎯 BETA" for beta users
  └─ Disappears for PUBLIC users

ExperimentalFeatures
  └─ Wrapper component
  └─ Shows children only if user.accessTier === 'BETA'

BetaInvitesManager (Admin Only)
  └─ Add email form
  └─ List with pagination
  └─ Remove button
```

### Routes

```
/auth/register         (existing - now supports beta)
/api/auth/me           (existing - now returns accessTier)
/auth/login            (existing - now refreshes user to get accessTier)
/api/admin/beta-invites (new - admin endpoints)
```

### Types

```typescript
User {
  id: string
  name: string
  email: string
  accessTier: 'PUBLIC' | 'BETA'        // NEW
  betaAddedAt: string | null            // NEW
  role: 'USER' | 'SUPER_ADMIN'
  ...other fields
}

BetaInvite {
  email: string
  reason: string | null
  addedAt: string
  usedAt: string | null
  addedBy: { id: string; name: string }
}
```

---

## 🚀 Implementation Checklist

**Phase 1: Types & Context (1-2 hours)**
- [ ] Update `User` type with `accessTier` and `betaAddedAt`
- [ ] Update `AuthContext` to fetch full user on login/register
- [ ] Test: Login should show `accessTier` in console

**Phase 2: Components (2-3 hours)**
- [ ] Create `BetaBadge` component (copy from BETA_CHEATSHEET.md)
- [ ] Add to navbar/header
- [ ] Create `ExperimentalFeatures` wrapper
- [ ] Add experimental features section to dashboard
- [ ] Test: Badge shows for beta users, hides for public

**Phase 3: Admin Features (2-3 hours)**
- [ ] Create `betaService` with API calls
- [ ] Create `BetaInvitesManager` component
- [ ] Create admin page for beta management
- [ ] Test: Can add/list/remove invites

**Phase 4: Testing & Polish (2-3 hours)**
- [ ] Write unit tests (see BETA_TESTING.md)
- [ ] Write integration tests
- [ ] Add error handling
- [ ] Add loading states

**Total: ~8-10 hours for complete implementation**

---

## 💬 API Reference (Summary)

### User Gets Own Info

```bash
GET /api/auth/me
Authorization: Bearer {token}

# Response
{
  "success": true,
  "user": {
    "id": "uuid",
    "name": "Name",
    "email": "user@example.com",
    "accessTier": "BETA" | "PUBLIC",     # ← NEW
    "betaAddedAt": "2026-02-19T14:35Z"   # ← NEW (null if PUBLIC)
  }
}
```

### Admin Lists Invites

```bash
GET /api/admin/beta-invites?limit=20&offset=0
Authorization: Bearer {admin-token}

# Response
{
  "success": true,
  "invites": [
    {
      "email": "test@example.com",
      "reason": "UX Designer",
      "addedAt": "2026-02-19T10:00Z",
      "usedAt": "2026-02-19T14:35Z" | null,
      "addedBy": { "id": "uuid", "name": "Admin Name" }
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

### Admin Adds Invite

```bash
POST /api/admin/beta-invites
Authorization: Bearer {admin-token}
Content-Type: application/json

{
  "email": "newuser@example.com",
  "reason": "QA Tester"  # optional
}

# Response
{
  "success": true,
  "invite": {
    "email": "newuser@example.com",
    "reason": "QA Tester",
    "addedAt": "2026-02-19T15:00Z",
    "usedAt": null,
    "addedBy": { "id": "uuid", "name": "Admin Name" }
  }
}
```

### Admin Removes Invite

```bash
DELETE /api/admin/beta-invites/olduser@example.com
Authorization: Bearer {admin-token}

# Response
{
  "success": true,
  "message": "Invite removed"
}
```

---

## 🎯 Success Criteria

Your implementation is complete when:

- ✅ Normal users see `accessTier: 'PUBLIC'` in profile
- ✅ Invited users see `accessTier: 'BETA'` in profile
- ✅ BETA badge appears only for beta users
- ✅ Experimental features appear only for beta users
- ✅ Admin can add/list/remove emails from whitelist
- ✅ All tests pass (unit + integration)
- ✅ No TypeScript errors
- ✅ Error handling in place for all API calls

---

## ❓ FAQ

**Q: Do I need to change registration form?**
A: No. The form stays the same. The backend automatically checks the email against the whitelist after registration.

**Q: Can a user be promoted to BETA after registration?**
A: Currently no. The tier is set at registration time. To promote, you'd need a manual admin action (future feature).

**Q: What happens when I remove an email from whitelist?**
A: Only prevents future registrations. Users already in BETA stay BETA.

**Q: Can I use Zustand instead of Context API?**
A: Yes. See BETA_ARCHITECTURE.md for Zustand example.

**Q: How do I test locally?**
A: See BETA_TESTING.md for complete test scenarios and seed data.

**Q: What's the difference between `addedAt` and `betaAddedAt`?**
A: `betaAddedAt` is when the USER was added to beta (their registration time). `addedAt` in the invite list is when the admin added the email to the whitelist (before the user registered).

---

## 📞 Support

**Need clarification?**

1. Check the specific document based on your question
2. Search for keywords in docs (Cmd+F)
3. Check FAQ section in each document
4. Review code examples in BETA_CHEATSHEET.md

**Issues?**

- **Type errors** → Check BETA_CHEATSHEET.md interfaces
- **Component not showing** → Check BETA_ARCHITECTURE.md for proper integration
- **API errors** → Check error codes in BETA_FLOW.md
- **Test failures** → Check test scenarios in BETA_TESTING.md

---

## 📊 Document Map

```
Frontend Docs/
├── README.md (you are here)
├── BETA_FLOW.md
│   └─ Complete system flow, API endpoints, examples
├── BETA_CHEATSHEET.md
│   └─ Types, components, API calls, quick reference
├── BETA_ARCHITECTURE.md
│   └─ Component structure, state management, data flow
└── BETA_TESTING.md
    └─ Test scenarios, integration tests, checklist
```

**Recommended reading order:**
1. This README (5 min)
2. BETA_FLOW.md (15 min)
3. BETA_CHEATSHEET.md (10 min)
4. BETA_ARCHITECTURE.md (20 min)
5. BETA_TESTING.md (10 min)

**Total: ~60 minutes to understand everything**

---

## ✅ Pre-Implementation Checklist

Before starting to code:

- [ ] Read [BETA_FLOW.md](./BETA_FLOW.md) - Understand the flow
- [ ] Read [BETA_ARCHITECTURE.md](./BETA_ARCHITECTURE.md) - Know the structure
- [ ] Check `src/types/` to see current User interface
- [ ] Set up TypeScript strict mode if not already on
- [ ] Decide: Context API or Zustand for state?
- [ ] Set up project folder structure

---

**Last Updated:** 2026-02-19
**For:** TáComQuem Beta Program Frontend Development
**Status:** Ready for Implementation ✅

---

## 🚀 Next Steps

1. **Start coding:** Use [BETA_CHEATSHEET.md](./BETA_CHEATSHEET.md) as your quick reference
2. **Follow structure:** Use [BETA_ARCHITECTURE.md](./BETA_ARCHITECTURE.md) as your guide
3. **Stay confident:** Everything is documented, tested, and ready
4. **Build it:** You have everything you need!

Happy coding! 🎉
