# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MemoQ Clone - A translation management system (TMS) and computer-assisted translation (CAT) tool with multi-user support, translation memory, terminology management, and role-based workflows.

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

## API

Base URL: `/api/v1`

Key routes: `/auth`, `/organizations`, `/projects`, `/documents`, `/segments`, `/translation-memories`, `/term-bases`

## Database

PostgreSQL with schema in `apps/api/src/db/schema.sql`. Docker container managed via docker-compose.
