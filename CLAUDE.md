# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MemoQ Clone - A translation management system (TMS) and computer-assisted translation (CAT) tool with multi-user support, translation memory, terminology management, and role-based workflows.

## Planned Architecture

Monorepo structure using pnpm workspaces:
- `apps/api` - Fastify backend with TypeScript
- `apps/web` - React frontend with TanStack Query and CodeMirror 6
- `packages/shared` - Shared types and constants

**Database**: PostgreSQL (or SQLite for simple deployments)

## Key Domain Concepts

- **Translation Memory (TM)**: Database of source/target segment pairs with fuzzy matching
- **Term Base (TB)**: Terminology dictionary for consistency
- **Segments**: Text split into sentences for translation
- **Workflow**: Translation → Review 1 → Review 2 → Complete (configurable)

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
| RBAC | `@rbac/rbac` |

## File Formats

MVP priority: Plain text, XLIFF (.xlf), JSON (i18n), TMX (TM import/export)

## Development Commands

Once the project is set up:
```bash
pnpm install          # Install dependencies
pnpm dev              # Run both api and web in dev mode
pnpm dev:api          # Run API only
pnpm dev:web          # Run frontend only
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm db:migrate       # Run database migrations
```

## API Base URL

`/api/v1` - REST API with JWT authentication

Key routes: `/auth`, `/organizations`, `/projects`, `/documents`, `/segments`, `/translation-memories`, `/term-bases`
