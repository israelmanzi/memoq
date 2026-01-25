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
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   React     │ ───► │  Fastify    │ ───► │ PostgreSQL  │
│   SPA       │ HTTP │  REST API   │ SQL  │  Database   │
└─────────────┘      └─────────────┘      └─────────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │   Resend    │
                     │   (Email)   │
                     └─────────────┘
```

**Frontend**: Single-page React application handling routing, state management, and UI rendering. Communicates with the API via REST calls.

**Backend**: Stateless Node.js API server handling authentication, business logic, file processing, and database operations. Issues JWT tokens for session management.

**Database**: PostgreSQL storing all persistent data - users, organizations, projects, documents, segments, TM entries, and terms.

**Email**: Transactional emails via Resend for verification, password reset, and security notifications.

### Data Model

**Organizations** → **Projects** → **Documents** → **Segments**

**Translation Memories** and **Term Bases** are organization-level resources attached to projects. Each project can have multiple TMs/TBs, with one marked as writable for storing new translations.

### Security

- Email verification required for account activation
- Mandatory TOTP-based two-factor authentication
- Backup codes for account recovery
- JWT tokens for API authentication

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
