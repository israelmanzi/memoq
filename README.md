# OXY

A translation management system (TMS) and computer-assisted translation (CAT) tool designed for professional translation workflows with multi-user collaboration, translation memory, and terminology management.

## Overview

OXY enables translation teams to manage localization projects efficiently. It combines document management, translation memory for reusing previous translations, terminology databases for consistency, and role-based workflows to coordinate translators and reviewers.

## Core Capabilities

### Translation Memory (TM)
Database of source/target segment pairs accumulated from completed translations. When translating new content, the system performs fuzzy matching against stored segments and suggests matches with similarity percentages. Exact matches (100%) and context matches (same surrounding segments) are prioritized. Confirmed translations are automatically saved back to TM.

### Term Base (TB)
Terminology dictionary that enforces consistency across translations. Terms are highlighted in source text during translation, and translators can insert approved translations with a click. Supports definitions, notes, and automatic versioning for duplicate source terms.

### Document Processing
- **Import**: Plain text, XLIFF 1.2/2.0
- **Export**: Original format with translations, plain text
- **Segmentation**: Automatic sentence splitting using CLDR rules
- **Pre-translation**: Auto-fills segments from TM matches on upload

### Workflow Management
Configurable review stages: Translation → Review 1 → Review 2 → Complete. Documents are assigned per-role, and only the user assigned to the current workflow stage can edit. Status propagates automatically when segments are confirmed.

### Propagation
When confirming a translation, identical untranslated segments in the same document are automatically filled with the same translation, reducing repetitive work.

## Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   React     │      │  Fastify    │      │ PostgreSQL  │      │    MinIO    │
│   Web App   │─────►│  REST API   │─────►│  Database   │      │   Storage   │
│  (nginx)    │ HTTP │             │ SQL  │             │      │   (S3)      │
└─────────────┘      └──────┬──────┘      └─────────────┘      └──────▲──────┘
                            │                                         │
                            │ Jobs                                    │
                            ▼                                         │
                     ┌─────────────┐      ┌─────────────┐            │
                     │    Redis    │◄────►│   Worker    │────────────┘
                     │   (Queue)   │      │  (BullMQ)   │
                     └─────────────┘      └─────────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │   Resend    │
                     │   (Email)   │
                     └─────────────┘
```

### Services

| Service | Technology | Purpose |
|---------|------------|---------|
| **Web** | React + Vite + nginx | Single-page application for translation UI |
| **API** | Fastify + Node.js | REST API, authentication, business logic |
| **Worker** | BullMQ + Node.js | Background jobs (document parsing, PDF export, pre-translation) |
| **PostgreSQL** | PostgreSQL 16 | Primary database for all structured data |
| **Redis** | Redis 7 | Job queue, session cache, rate limiting |
| **MinIO** | MinIO (S3-compatible) | Object storage for uploaded document files |
| **Email** | Resend | Transactional emails (verification, password reset) |

### Monorepo Structure

```
oxy/
├── apps/
│   ├── api/          # Fastify backend
│   └── web/          # React frontend
├── packages/
│   └── shared/       # Shared types and constants
├── docker-compose.yml
└── pnpm-workspace.yaml
```

### Data Storage

**PostgreSQL** stores:
- Users, organizations, projects
- Documents and segments (translation content)
- Translation memories (TM entries)
- Term bases (terminology)
- Activity logs, invitations

**MinIO** stores:
- Original uploaded document files (PDF, DOCX, TXT, XLIFF)
- Path format: `documents/{documentId}/original.{ext}`

**Redis** stores:
- BullMQ job queue (document parsing, exports)
- Session data
- Rate limiting counters
- TM/TB match cache

### Background Jobs

The worker process handles CPU-intensive tasks asynchronously:

| Job | Description |
|-----|-------------|
| `parse-document` | Extract text and segment uploaded documents |
| `pre-translate` | Auto-fill segments from TM matches |
| `export-pdf` | Generate PDF exports of translated documents |

### Security

- Email verification required for account activation
- Mandatory TOTP-based two-factor authentication
- Backup codes for account recovery
- JWT tokens with configurable expiration
- Argon2 password hashing
- Rate limiting on authentication endpoints

### Data Model

```
Organizations
    └── Projects
    │       └── Documents
    │               └── Segments
    │
    ├── Translation Memories (TM)
    │       └── TM Entries (source/target pairs)
    │
    ├── Term Bases (TB)
    │       └── Terms (source/target/definition)
    │
    └── Members (user-role assignments)
```

Projects can have multiple TMs and TBs attached, with one of each marked as "writable" for storing new translations.

## User Roles

| Role | Permissions |
|------|-------------|
| Org Admin | Full organization access, user management |
| Project Manager | Create/configure projects, assign users |
| Reviewer 2 | Final review stage |
| Reviewer 1 | First review stage |
| Translator | Translation only |

## API

REST API at `/api/v1` with endpoints:

- `/auth` - Authentication, email verification, MFA
- `/organizations` - Organization CRUD
- `/projects` - Project management, document upload
- `/documents` - Document operations, segment editing
- `/translation-memories` - TM CRUD, entry management, TMX import
- `/term-bases` - TB CRUD, term management, TBX import
- `/search` - Global search across segments, TM, and terms
- `/mfa` - MFA setup and management

## Key Features

- **Fuzzy matching**: Levenshtein-based similarity scoring with configurable thresholds
- **Context matching**: Higher priority for segments with matching neighbors
- **Match percentage display**: Color-coded badges showing TM match quality
- **Term highlighting**: Underlined terms in source text with click-to-insert
- **Auto-save to TM**: Confirmed translations automatically stored
- **Segment filtering**: Filter by status (new, translated, reviewed, fuzzy matches)
- **Segment navigation**: Jump to next untranslated, previous/next controls
- **Activity logging**: Track changes per document and project
- **TMX/TBX import**: Standard interchange formats for TM and TB data
- **Document export**: Download translated documents in original or text format

## Deployment

### Requirements

- Docker and Docker Compose
- 2GB+ RAM recommended
- Ports: 5063 (web), 5064 (api), 5065 (redis), 5066 (postgres), 9000-9001 (minio)

### Quick Start

```bash
# Clone and configure
git clone <repo>
cd oxy
cp .env.example .env
# Edit .env with your settings (passwords, JWT secret, etc.)

# Start all services
docker compose up -d

# Run database migrations
docker compose exec api node dist/db/migrate.js

# View logs
docker compose logs -f
```

### Environment Variables

Key variables in `.env`:

| Variable | Description |
|----------|-------------|
| `POSTGRES_PASSWORD` | Database password |
| `REDIS_PASSWORD` | Redis password |
| `JWT_SECRET` | Secret for JWT signing (min 32 chars) |
| `RESEND_API_KEY` | Resend API key for emails (optional) |
| `APP_URL` | Public URL of the web app |
| `VITE_API_URL` | Public URL of the API |

See `.env.example` for full configuration options.

## Development

```bash
# Install dependencies
pnpm install

# Start database containers
pnpm db:up

# Run migrations
pnpm db:migrate

# Start dev servers (api + web)
pnpm dev

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## License

MIT
