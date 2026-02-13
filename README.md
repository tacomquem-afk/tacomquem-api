# TáComQuem

API for managing personal item loans between friends. Eliminates the social discomfort of asking for borrowed items back through automation.

## Tech Stack

- **Runtime:** Bun 1.3+
- **Framework:** Fastify
- **ORM:** Drizzle ORM (native Bun SQL driver)
- **Database:** PostgreSQL
- **Validation:** Zod
- **Authentication:** JWT + Google OAuth
- **Language:** TypeScript

## Features

- **Authentication:** Email/password + Google OAuth with JWT tokens
- **Items Management:** Create, read, update, and soft delete items with multiple images
- **Loan Management:** Create loans with public confirmation links, track loan status
- **Dashboard:** Overview of items, loans, and recent activity
- **Persistent Friendships:** Created on loan confirmation and stored in `friendships`
- **LGPD Compliance:** All PII encrypted at rest using AES-256
- **Email Notifications:** Loan confirmations and reminders via Resend

## Setup

### Prerequisites

- [Bun](https://bun.com) 1.3+
- PostgreSQL 12+
- Node.js 18+ (for compatibility with some tools, but Bun is the runtime)

### Installation

```bash
# Clone repository
git clone <repo>
cd ta_com_quem

# Install dependencies
bun install

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration

# Generate database migrations
bun run db:generate

# Run migrations
bun run db:migrate

# Start development server
bun run dev
```

The API will be available at `http://localhost:3000`

## Available Scripts

```bash
# Development
bun run dev                 # Start server with hot reload
bun run start              # Start production server

# Database
bun run db:generate        # Generate migrations from schema changes
bun run db:migrate         # Apply pending migrations
bun run db:studio          # Open Drizzle Studio GUI

# Quality & Testing
bun run qa                 # TypeScript check + Biome linting
bun run qa:fix             # Auto-fix linting issues
bun test                   # Run all tests
bun test [path]            # Run specific test file
bun test:coverage          # Run tests with coverage report

# Code formatting
bun run format             # Format code with Prettier
```

## Project Structure

```
src/
├── config/                 # Environment and configuration
├── db/
│   ├── index.ts           # Database connection
│   ├── schema.ts          # Drizzle schema definitions
│   └── migrate.ts         # Migration runner
├── plugins/               # Fastify plugins
│   └── jwt.ts             # JWT authentication plugin
├── routes/                # API route handlers
│   ├── auth/              # Authentication endpoints
│   ├── items/             # Items CRUD endpoints
│   ├── loans/             # Loans management endpoints
│   ├── links/             # Public loan confirmation links
│   ├── dashboard/         # Dashboard endpoints
│   └── upload/            # Image upload endpoints
├── services/              # Business logic
│   ├── auth/              # Authentication logic
│   ├── crypto/            # Encryption/decryption
│   ├── email/             # Email service
│   ├── items/             # Items operations
│   ├── loans/             # Loans operations
│   ├── friendships/       # Friendship operations
│   ├── password/          # Password hashing
│   └── dashboard/         # Dashboard data
├── schemas/               # Zod validation schemas
└── index.ts              # Application entry point
```

## API Endpoints

### Health Check
- `GET /api/health` - API health status
- `GET /api/health/db` - Database connection status

### Authentication
- `POST /api/auth/register` - Register with email/password
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/verify-email` - Verify email address
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user info
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback

### Items
- `POST /api/items` - Create item
- `GET /api/items` - List my items
- `GET /api/items/:id` - Get item details
- `PATCH /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item (soft delete)

### Loans
- `POST /api/loans` - Create loan (generates confirmation link)
- `GET /api/loans` - List loans (filters: lent/borrowed/pending/confirmed/returned)
- `GET /api/loans/:id` - Get loan details
- `PATCH /api/loans/:id/return` - Mark loan as returned
- `PATCH /api/loans/:id/cancel` - Cancel pending loan
- `POST /api/loans/:id/remind` - Send manual reminder email

### Public Links
- `GET /api/links/:token` - View loan details (no auth required)
- `POST /api/links/:token/confirm` - Confirm loan (requires auth)

### Dashboard
- `GET /api/dashboard` - Get dashboard data (only active loans, status `confirmed`)
- `GET /api/dashboard/friends` - Get friends list from persisted friendships

### Upload
- `POST /api/upload` - Upload image

## Environment Variables

See `.env.example` for all required variables. Key ones:

```env
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Database
DATABASE_URL=postgres://user:password@localhost:5432/tacomquem

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d

# Encryption (LGPD)
ENCRYPTION_KEY=32-byte-hex-key-for-aes-256-gcm

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Email
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=noreply@tacomquem.app

# Frontend
FRONTEND_URL=http://localhost:5173
```

## Testing

The project uses Bun's native test runner. Tests are colocated with services in `__tests__` directories.

```bash
# Run all tests
bun test

# Run specific test file
bun test src/services/auth/__tests__/auth.test.ts

# Run tests with coverage
bun test:coverage
```

## Code Quality

This project enforces code quality standards:

```bash
# Check TypeScript types and linting
bun run qa

# Auto-fix linting and formatting issues
bun run qa:fix
```

## Deployment

### Oracle Cloud ARM64

```bash
# Install Bun on ARM64 server
curl -fsSL https://bun.sh/install | bash

# Clone and setup
git clone <repo>
cd ta_com_quem
bun install --production

# Setup environment
cp .env.example .env
# Edit .env with production values

# Run migrations
bun run db:migrate

# Start with PM2 or systemd
bun run start
```

## Security Features

- **Password Hashing:** bcrypt with cost factor 12 (using Bun.password)
- **Token Security:** JWT with 7-day expiration for access, 30-day for refresh
- **Email Verification:** 24-hour expiration tokens for email verification
- **Password Reset:** 24-hour expiration tokens for password reset
- **LGPD Compliance:** All PII encrypted with AES-256-GCM
- **Rate Limiting:** 100 req/s globally, stricter on sensitive endpoints
- **CORS:** Configured to frontend origin only
- **SQL Injection Protection:** Parameterized queries via Drizzle ORM

## Database Migrations

Schema changes are managed with Drizzle Kit:

```bash
# After modifying src/db/schema.ts
bun run db:generate

# Review generated migration in drizzle/ directory
bun run db:migrate
```

## Development Workflow

1. Create feature branch: `git checkout -b feat/your-feature`
2. Make changes and test: `bun test`
3. Check code quality: `bun run qa`
4. Fix issues: `bun run qa:fix`
5. Commit and push
6. Create pull request

## Performance Optimizations

- **Bun Runtime:** Native TypeScript support, faster startup, lower memory usage
- **Fastify:** High-throughput HTTP server with excellent plugin system
- **Drizzle ORM:** Type-safe queries with zero runtime overhead
- **Connection Pooling:** PostgreSQL connections via Drizzle
- **Rate Limiting:** Protect from abuse

## Troubleshooting

### Database connection fails
- Check `DATABASE_URL` is correct
- Verify PostgreSQL is running
- Run `bun run db:migrate` to ensure schema is created

### JWT token errors
- Verify `JWT_SECRET` is 32+ characters
- Check token hasn't expired
- Ensure Authorization header format: `Bearer <token>`

### Google OAuth fails
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- Check `GOOGLE_REDIRECT_URI` matches Google Cloud Console settings
- Ensure `FRONTEND_URL` is accessible

## Support

For issues, please create a GitHub issue with:
- Error message and stack trace
- Steps to reproduce
- Environment details (OS, Bun version, Node version)

## License

MIT
