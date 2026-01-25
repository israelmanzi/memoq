# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OXY - A translation management system (TMS) and computer-assisted translation (CAT) tool with multi-user support, translation memory, terminology management, and role-based workflows.

## Architecture

Monorepo structure using pnpm workspaces:

- `apps/api` - Fastify backend with TypeScript, PostgreSQL
- `apps/web` - React frontend with TanStack Query, Tailwind, CodeMirror 6
- `packages/shared` - Shared types and constants

## Development Commands

```bash
# Setup
cp .env.example .env          # Configure environment
pnpm install                  # Install dependencies
pnpm db:up                    # Start PostgreSQL and Redis containers
pnpm db:migrate               # Run database migrations

# Development
pnpm dev                      # Run api and web concurrently
pnpm dev:api                  # Run API only (port 3000)
pnpm dev:web                  # Run frontend only (port 5173)

# Database
pnpm db:up                    # docker compose up -d
pnpm db:down                  # docker compose down
pnpm db:logs                  # docker compose logs -f

# Quality
pnpm lint                     # Lint all packages
pnpm typecheck                # Type check all packages
pnpm test                     # Run tests
pnpm build                    # Build all packages
```

## Key Domain Concepts

- **Translation Memory (TM)**: Database of source/target segment pairs with fuzzy matching
- **Term Base (TB)**: Terminology dictionary for consistency
- **Segments**: Text split into sentences for translation
- **Workflow**: Translation → Review 1 → Review 2 → Complete (configurable per project)

## User Roles

Org Admin > Project Manager > Reviewer 2 > Reviewer 1 > Translator

Documents are assigned per-role; only the user assigned to the current workflow stage can edit.

## Core Libraries

| Purpose | Library |
|---------|---------|
| Fuzzy matching | `fastest-levenshtein` |
| Sentence segmentation | `cldr-segmentation` |
| XLIFF parsing | `xliff` |
| TMX/XML parsing | `fast-xml-parser` |
| Translation editor | CodeMirror 6 |
| Email service | `resend` |
| TOTP/MFA | `otpauth` |
| QR codes | `qrcode` |
| Password hashing | `argon2` |

## Authentication

- **Email verification required** - Users must verify email before logging in
- **MFA mandatory** - All users must set up TOTP-based 2FA on first login
- **Backup codes** - 8 one-time recovery codes generated on MFA setup
- **Password reset** - Email-based token flow (1 hour expiry)

Auth flow:
1. Register → verification email sent
2. Click verification link → email verified
3. Login with email/password → MFA setup required (first time) or MFA code required
4. Complete MFA → receive JWT token

## API

Base URL: `/api/v1`

Key routes: `/auth`, `/organizations`, `/projects`, `/documents`, `/segments`, `/translation-memories`, `/term-bases`, `/mfa`

## Database

PostgreSQL with schema in `apps/api/src/db/schema.sql`. Docker container managed via docker-compose.

## Environment Variables

Key variables in `.env`:

```
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/oxy

# JWT
JWT_SECRET=your-secret-key

# Email (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=OXY <noreply@yourdomain.com>

# App
APP_URL=http://localhost:5173
```

When `RESEND_API_KEY` is not set, email is disabled and users are auto-verified (dev mode).
