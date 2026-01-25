# MemoQ Clone - MVP Specification

## Objective

Build a minimal translation management tool that demonstrates core CAT functionality with organizational multi-user support:

- Translation Memory with fuzzy matching
- Basic terminology management
- Project workflow with role-based access (Translator, Reviewer, Project Manager)
- Web-based translation editor
- Organization-based resource grouping

**Scope**: Multi-user with organization support, role separation, no scaling concerns.

---

## MVP Feature Set

### In Scope (P0)

| Feature | Description |
|---------|-------------|
| **Translation Memory** | Store, lookup, and reuse translations |
| **Fuzzy Matching** | Find similar (not just exact) matches |
| **Term Base** | Basic terminology lookup |
| **Translation Editor** | Side-by-side source/target editing |
| **Segment Management** | Navigate, translate, confirm segments |
| **File Import** | Plain text, XLIFF, JSON, HTML support |
| **File Export** | Export translated documents |
| **TMX Import/Export** | Standard TM interchange format |
| **Organizations** | Group users and resources by organization |
| **User Roles** | Project Manager, Translator, Reviewer roles |
| **Project Workflow** | Translation → Review 1 → Review 2 → Complete |
| **Document Assignment** | Assign documents to users by role |
| **Authentication** | Email/password login, JWT sessions |

### Out of Scope (MVP)

- Machine translation integration
- Advanced QA checks (beyond basic)
- Complex file formats (DOCX, PDF) - defer to Phase 2
- Real-time collaboration (live cursors, etc.)
- Detailed statistics / reporting dashboards
- SSO / OAuth providers
- Billing / subscriptions

---

## Open Source Tools & Libraries

### Core Libraries to Leverage

| Category | Library | Purpose | Why Use It |
|----------|---------|---------|------------|
| **Fuzzy Matching** | [fastest-levenshtein](https://www.npmjs.com/package/fastest-levenshtein) | Levenshtein distance calculation | Fastest JS implementation, MIT license |
| **Fuzzy Search** | [fast-fuzzy](https://www.npmjs.com/package/fast-fuzzy) | Fuzzy string matching with scoring | Uses Sellers algorithm, returns 0-1 scores |
| **Sentence Segmentation** | [cldr-segmentation](https://www.npmjs.com/package/cldr-segmentation) | Unicode CLDR-based text segmentation | Multilingual, handles abbreviations properly |
| **XLIFF Parsing** | [xliff](https://www.npmjs.com/package/xliff) | XLIFF ↔ JSON conversion | Well-maintained, supports XLIFF 1.2 & 2.0 |
| **DOCX Parsing** | [mammoth](https://www.npmjs.com/package/mammoth) | DOCX → HTML/text extraction | Clean output, preserves semantics |
| **HTML Parsing** | [cheerio](https://www.npmjs.com/package/cheerio) | HTML parsing and manipulation | Fast, jQuery-like API |
| **XML Parsing** | [fast-xml-parser](https://www.npmjs.com/package/fast-xml-parser) | XML ↔ JSON (for TMX, TBX) | Fast, configurable, TypeScript support |
| **Text Editor** | [CodeMirror 6](https://codemirror.net/6/) | Web-based text editor | Lightweight, extensible, mobile support |
| **RBAC** | [@rbac/rbac](https://www.npmjs.com/package/@rbac/rbac) | Role-based access control | TypeScript, multi-tenant support |
| **Auth** | [better-auth](https://www.better-auth.com/) or [lucia-auth](https://lucia-auth.com/) | Authentication library | Modern, TypeScript-first |

### Open Source CAT Tools for Reference

| Tool | License | What to Learn |
|------|---------|---------------|
| [OmegaT](https://omegat.org/) | GPL-2.0 | TM algorithms, file filters, segmentation rules |
| [MateCat](https://github.com/matecat/MateCat) | LGPL-3.0 | Web-based CAT architecture, editor UX |
| [Weblate](https://github.com/WeblateOrg/weblate) | GPL-3.0 | Collaborative translation workflows |
| [Okapi Framework](https://okapiframework.org/) | Apache-2.0 | File format filters (40+ formats), XLIFF processing |

### File Format Support Strategy

| Format | MVP | Library | Notes |
|--------|-----|---------|-------|
| Plain text (.txt) | P0 | Built-in | Simple segmentation |
| XLIFF (.xlf, .xliff) | P0 | `xliff` | Industry standard |
| JSON (.json) | P0 | Built-in | i18n files |
| HTML (.html) | P1 | `cheerio` | Extract text nodes |
| TMX (.tmx) | P0 | `fast-xml-parser` | TM import/export |
| DOCX (.docx) | P2 | `mammoth` | Phase 2 |
| PDF (.pdf) | P3 | `pdf-parse` | Phase 3, complex |

---

## User Roles & Permissions (memoQ-inspired)

### Role Hierarchy

```
Organization Admin
       │
       ▼
Project Manager (PM)
       │
       ├── Reviewer 2 (Final Review)
       │
       ├── Reviewer 1 (Peer Review)
       │
       └── Translator
```

### Role Definitions

| Role | Scope | Capabilities |
|------|-------|--------------|
| **Org Admin** | Organization | Manage users, create PMs, view all projects, manage org settings |
| **Project Manager** | Projects they manage | Create projects, assign users, manage resources (TM/TB), download any document, change assignments |
| **Reviewer 2** | Assigned documents | Review R1-approved translations, final approval, can edit translations |
| **Reviewer 1** | Assigned documents | Review translations, approve for R2, can edit translations |
| **Translator** | Assigned documents | Translate segments, confirm translations, cannot access unassigned docs |

### Permission Matrix

| Action | Org Admin | PM | Reviewer 2 | Reviewer 1 | Translator |
|--------|-----------|----|-----------:|------------|------------|
| Manage org users | ✓ | - | - | - | - |
| Create projects | ✓ | ✓ | - | - | - |
| Delete projects | ✓ | Own | - | - | - |
| Assign users to docs | ✓ | ✓ | - | - | - |
| Create/edit TM | ✓ | ✓ | - | - | - |
| Create/edit TB | ✓ | ✓ | - | - | - |
| View all project docs | ✓ | ✓ | - | - | - |
| Edit assigned docs | ✓ | ✓ | ✓ | ✓ | ✓ |
| Approve for next stage | ✓ | ✓ | ✓ | ✓ | ✓ |
| Add to TM on confirm | ✓ | ✓ | ✓ | ✓ | ✓ |
| Export documents | ✓ | ✓ | Assigned | Assigned | - |

---

## Document Workflow

### Workflow States

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Created    │────▶│  Translation │────▶│   Review 1   │────▶│   Review 2   │
│              │     │              │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                            │                    │                    │
                            ▼                    ▼                    ▼
                     [Translator]          [Reviewer 1]         [Reviewer 2]
                      confirms              approves              approves
                            │                    │                    │
                            └────────────────────┴────────────────────┘
                                                 │
                                                 ▼
                                        ┌──────────────┐
                                        │   Complete   │
                                        │              │
                                        └──────────────┘
```

### Workflow Rules

1. **Translation Phase**: Only assigned Translator can edit
2. **Review 1 Phase**: Only assigned Reviewer 1 can edit; Translator locked out
3. **Review 2 Phase**: Only assigned Reviewer 2 can edit; R1 locked out
4. **Complete**: Document is locked; PM can unlock if needed

### Simplified MVP Workflow

For MVP, we support a configurable workflow:

- **Simple**: Translation → Complete (no review)
- **Single Review**: Translation → Review 1 → Complete
- **Full Review**: Translation → Review 1 → Review 2 → Complete

---

## Architecture

### Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (SPA)                            │
│              React + TypeScript + TanStack Query             │
│                    + CodeMirror 6                            │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTP/REST + JWT
┌───────────────────────────▼─────────────────────────────────┐
│                      Backend API                             │
│               Node.js + Fastify + TypeScript                 │
│                    + @rbac/rbac                              │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                       Database                               │
│                   PostgreSQL / SQLite                        │
└─────────────────────────────────────────────────────────────┘
```

### Why This Stack?

| Choice | Rationale |
|--------|-----------|
| **React** | Component-based UI, ecosystem, good for complex editors |
| **TanStack Query** | Server state management, caching, optimistic updates |
| **CodeMirror 6** | Lightweight editor (vs Monaco 2.4MB), mobile support, extensible |
| **Fastify** | Faster than Express, built-in validation, TypeScript support |
| **PostgreSQL** | Multi-tenant ready, JSONB support, full-text search |
| **SQLite** | Alternative for simpler deployments |

---

## Database Schema

### PostgreSQL Tables

```sql
-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization Memberships (user belongs to org with role)
CREATE TABLE org_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'project_manager', 'translator', 'reviewer')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, org_id)
);

CREATE INDEX idx_org_memberships_user ON org_memberships(user_id);
CREATE INDEX idx_org_memberships_org ON org_memberships(org_id);

-- Translation Memories (owned by organization)
CREATE TABLE translation_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tm_org ON translation_memories(org_id);

-- Translation Units (TM entries)
CREATE TABLE translation_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tm_id UUID NOT NULL REFERENCES translation_memories(id) ON DELETE CASCADE,
    source_text TEXT NOT NULL,
    target_text TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    context_prev TEXT,
    context_next TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_tu_tm ON translation_units(tm_id);
CREATE INDEX idx_tu_hash ON translation_units(source_hash);

-- Term Bases (owned by organization)
CREATE TABLE term_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tb_org ON term_bases(org_id);

-- Terms
CREATE TABLE terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tb_id UUID NOT NULL REFERENCES term_bases(id) ON DELETE CASCADE,
    source_term TEXT NOT NULL,
    target_term TEXT NOT NULL,
    definition TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_terms_tb ON terms(tb_id);

-- Projects (owned by organization)
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    workflow_type TEXT DEFAULT 'single_review' CHECK (workflow_type IN ('simple', 'single_review', 'full_review')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_org ON projects(org_id);

-- Project Resources (link TM/TB to projects)
CREATE TABLE project_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    resource_type TEXT NOT NULL CHECK (resource_type IN ('tm', 'tb')),
    resource_id UUID NOT NULL,
    is_writable BOOLEAN DEFAULT true,  -- Can translations be added to this TM?
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_resources ON project_resources(project_id);

-- Project Members (users assigned to project)
CREATE TABLE project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('project_manager', 'translator', 'reviewer_1', 'reviewer_2')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id, role)
);

CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);

-- Documents
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    original_content TEXT,
    workflow_status TEXT DEFAULT 'translation' CHECK (workflow_status IN ('translation', 'review_1', 'review_2', 'complete')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_project ON documents(project_id);

-- Document Assignments (who is assigned to what role for a document)
CREATE TABLE document_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('translator', 'reviewer_1', 'reviewer_2')),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    UNIQUE(document_id, role)
);

CREATE INDEX idx_doc_assignments_doc ON document_assignments(document_id);
CREATE INDEX idx_doc_assignments_user ON document_assignments(user_id);

-- Segments
CREATE TABLE segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    segment_index INTEGER NOT NULL,
    source_text TEXT NOT NULL,
    target_text TEXT,
    status TEXT DEFAULT 'untranslated' CHECK (status IN ('untranslated', 'draft', 'translated', 'reviewed_1', 'reviewed_2', 'locked')),
    locked_by UUID REFERENCES users(id),
    last_modified_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_segments_document ON segments(document_id);
CREATE INDEX idx_segments_order ON segments(document_id, segment_index);

-- Segment History (audit trail)
CREATE TABLE segment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    target_text TEXT,
    status TEXT,
    changed_by UUID REFERENCES users(id),
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_segment_history ON segment_history(segment_id);

-- Sessions (for auth)
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token_hash);
```

---

## API Specification

### Base URL: `/api/v1`

### Authentication

#### Register

```
POST /auth/register
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe"
}

Response: 201
{
  "user": { "id": "...", "email": "...", "name": "..." },
  "token": "jwt_token_here"
}
```

#### Login

```
POST /auth/login
{
  "email": "user@example.com",
  "password": "securepassword"
}

Response: 200
{
  "user": { "id": "...", "email": "...", "name": "..." },
  "token": "jwt_token_here"
}
```

#### Get Current User

```
GET /auth/me
Authorization: Bearer <token>

Response: 200
{
  "id": "...",
  "email": "...",
  "name": "...",
  "organizations": [
    { "id": "...", "name": "Acme Corp", "role": "admin" }
  ]
}
```

---

### Organizations

#### Create Organization

```
POST /organizations
Authorization: Bearer <token>

{
  "name": "Acme Translations",
  "slug": "acme"
}

Response: 201
{
  "id": "org_123",
  "name": "Acme Translations",
  "slug": "acme",
  "createdAt": "..."
}
```

#### Invite User to Organization

```
POST /organizations/:orgId/members
Authorization: Bearer <token>

{
  "email": "translator@example.com",
  "role": "translator"
}

Response: 201
{
  "id": "membership_123",
  "userId": "...",
  "role": "translator"
}
```

#### List Organization Members

```
GET /organizations/:orgId/members
Authorization: Bearer <token>

Response: 200
{
  "members": [
    { "id": "...", "user": { "id": "...", "name": "...", "email": "..." }, "role": "admin" },
    { "id": "...", "user": { "id": "...", "name": "...", "email": "..." }, "role": "translator" }
  ]
}
```

---

### Projects

#### Create Project

```
POST /organizations/:orgId/projects
Authorization: Bearer <token>

{
  "name": "Website Localization",
  "sourceLanguage": "en",
  "targetLanguage": "de",
  "workflowType": "single_review",
  "tmIds": ["tm_123"],
  "tbIds": ["tb_456"]
}

Response: 201
{
  "id": "proj_123",
  "name": "Website Localization",
  "sourceLanguage": "en",
  "targetLanguage": "de",
  "workflowType": "single_review",
  "createdAt": "..."
}
```

#### Add Project Member

```
POST /projects/:projectId/members
Authorization: Bearer <token>

{
  "userId": "user_456",
  "role": "translator"
}

Response: 201
```

#### Assign User to Document

```
POST /documents/:documentId/assignments
Authorization: Bearer <token>

{
  "userId": "user_789",
  "role": "translator"
}

Response: 201
```

#### Advance Document Workflow

```
POST /documents/:documentId/advance
Authorization: Bearer <token>

Response: 200
{
  "id": "doc_123",
  "workflowStatus": "review_1",  // Advanced from 'translation'
  "updatedAt": "..."
}
```

---

### Documents & Segments

#### Get My Assigned Documents

```
GET /projects/:projectId/documents/mine
Authorization: Bearer <token>

Response: 200
{
  "documents": [
    {
      "id": "doc_123",
      "name": "homepage.txt",
      "workflowStatus": "translation",
      "myRole": "translator",
      "progress": { "total": 45, "completed": 20 }
    }
  ]
}
```

#### Update Segment (with role check)

```
PUT /segments/:segmentId
Authorization: Bearer <token>

{
  "targetText": "Translated text here",
  "status": "translated"
}

Response: 200 (if user has permission for current workflow stage)
Response: 403 (if document is in wrong stage for user's role)
```

---

### Translation Memories

#### TM Lookup

```
POST /translation-memories/:id/lookup
Authorization: Bearer <token>

{
  "sourceText": "Hello world",
  "minMatchPercent": 70,
  "maxResults": 5
}

Response: 200
{
  "matches": [
    { "id": "...", "sourceText": "Hello world", "targetText": "Hallo Welt", "matchPercent": 100 },
    { "id": "...", "sourceText": "Hello, world!", "targetText": "Hallo, Welt!", "matchPercent": 89 }
  ]
}
```

#### Import TMX

```
POST /translation-memories/:id/import
Authorization: Bearer <token>
Content-Type: multipart/form-data

Response: 200
{ "imported": 1523, "duplicatesSkipped": 45, "errors": 2 }
```

---

## Core Algorithms

### Fuzzy Matching with Libraries

```typescript
import { distance } from 'fastest-levenshtein';

function calculateSimilarity(source: string, candidate: string): number {
  const s1 = normalize(source);
  const s2 = normalize(candidate);

  if (s1 === s2) return 100;

  const dist = distance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);

  if (maxLength === 0) return 100;

  return Math.round(((maxLength - dist) / maxLength) * 100);
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}
```

### Text Segmentation with CLDR

```typescript
import { sentenceSplit } from 'cldr-segmentation';
import englishSuppressions from 'cldr-segmentation/suppressions/en';

function segmentText(text: string, locale = 'en'): string[] {
  const suppressions = locale === 'en' ? englishSuppressions : [];
  return sentenceSplit(text, suppressions);
}
```

### XLIFF Parsing

```typescript
import xliff from 'xliff';

async function parseXLIFF(content: string) {
  const result = await xliff.xliff2js(content);
  const segments: string[] = [];

  for (const [, file] of Object.entries(result.resources)) {
    for (const [, unit] of Object.entries(file)) {
      if (unit.source) segments.push(unit.source);
    }
  }

  return { segments, metadata: result };
}
```

---

## Frontend Components

### Component Hierarchy

```
App
├── AuthProvider
├── Layout
│   ├── Sidebar
│   │   ├── OrgSwitcher
│   │   ├── ProjectList
│   │   ├── ResourcesMenu (TM/TB)
│   │   └── UserMenu
│   └── MainContent
│       ├── Dashboard
│       │   ├── MyAssignments
│       │   └── ProjectOverview
│       ├── ProjectView
│       │   ├── DocumentList
│       │   ├── MemberList
│       │   └── ProjectSettings
│       ├── TranslationEditor
│       │   ├── DocumentHeader (status, progress)
│       │   ├── SegmentList
│       │   ├── SegmentEditor (CodeMirror)
│       │   ├── TMPanel
│       │   ├── TermPanel
│       │   └── WorkflowActions
│       ├── TMManager
│       ├── TBManager
│       └── OrgSettings
│           ├── MemberManagement
│           └── OrgProfile
└── Modals
    ├── CreateProjectModal
    ├── AssignUserModal
    ├── ImportFileModal
    └── InviteUserModal
```

### Editor with CodeMirror 6

```typescript
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

interface TranslationEditorProps {
  sourceText: string;
  targetText: string;
  onTargetChange: (text: string) => void;
  tmMatches: TMMatch[];
  readOnly?: boolean;  // Based on workflow stage
}

function TranslationEditor({ sourceText, targetText, onTargetChange, readOnly }: TranslationEditorProps) {
  return (
    <div className="editor-container">
      <div className="source-panel">
        <CodeMirrorEditor value={sourceText} readOnly />
      </div>
      <div className="target-panel">
        <CodeMirrorEditor
          value={targetText}
          onChange={onTargetChange}
          readOnly={readOnly}
        />
      </div>
    </div>
  );
}
```

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Confirm segment and move to next |
| `Ctrl+↓` | Move to next segment |
| `Ctrl+↑` | Move to previous segment |
| `Ctrl+1-9` | Insert TM match 1-9 |
| `Ctrl+S` | Save current segment |
| `F3` | Copy source to target |

---

## Project Structure

```
memoq-clone/
├── apps/
│   ├── api/                          # Backend
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── app.ts
│   │   │   ├── config/
│   │   │   ├── db/
│   │   │   │   ├── index.ts
│   │   │   │   ├── schema.sql
│   │   │   │   └── migrations/
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts
│   │   │   │   └── rbac.ts
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── organizations.ts
│   │   │   │   ├── projects.ts
│   │   │   │   ├── documents.ts
│   │   │   │   ├── segments.ts
│   │   │   │   ├── tm.ts
│   │   │   │   └── tb.ts
│   │   │   ├── services/
│   │   │   │   ├── auth-service.ts
│   │   │   │   ├── tm-service.ts
│   │   │   │   ├── tb-service.ts
│   │   │   │   ├── workflow-service.ts
│   │   │   │   └── fuzzy-match.ts
│   │   │   ├── parsers/
│   │   │   │   ├── index.ts
│   │   │   │   ├── text-parser.ts
│   │   │   │   ├── xliff-parser.ts
│   │   │   │   ├── json-parser.ts
│   │   │   │   └── tmx-parser.ts
│   │   │   └── types/
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── web/                          # Frontend
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── api/
│       │   │   └── client.ts
│       │   ├── components/
│       │   │   ├── layout/
│       │   │   ├── editor/
│       │   │   ├── projects/
│       │   │   ├── tm/
│       │   │   ├── tb/
│       │   │   └── shared/
│       │   ├── hooks/
│       │   ├── stores/
│       │   ├── utils/
│       │   └── types/
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   └── shared/                       # Shared types/utils
│       ├── src/
│       │   ├── types.ts
│       │   └── constants.ts
│       └── package.json
│
├── docs/
│   ├── TECHNICAL_SPEC.md
│   └── MVP_SPEC.md
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

## Development Phases

### Phase 1: Foundation + Auth

- [ ] Project setup (pnpm workspace, TypeScript, ESLint)
- [ ] Database schema and migrations (PostgreSQL)
- [ ] User authentication (register, login, JWT)
- [ ] Organization CRUD
- [ ] Organization membership management

### Phase 2: Core Resources

- [ ] Translation Memory CRUD
- [ ] Fuzzy matching with `fastest-levenshtein`
- [ ] TMX import/export
- [ ] Term Base CRUD
- [ ] Term lookup API

### Phase 3: Projects & Documents

- [ ] Project CRUD with workflow type
- [ ] Project member management
- [ ] Document upload with segmentation (`cldr-segmentation`)
- [ ] Document assignment by role
- [ ] XLIFF parser integration

### Phase 4: Translation Editor

- [ ] Segment list view
- [ ] CodeMirror 6 editor integration
- [ ] TM match panel
- [ ] Term highlighting
- [ ] Segment save/confirm
- [ ] Keyboard shortcuts

### Phase 5: Workflow

- [ ] Workflow state machine
- [ ] Role-based edit permissions
- [ ] Advance document to next stage
- [ ] Workflow status indicators
- [ ] Document export

### Phase 6: Polish

- [ ] Dashboard with assignments
- [ ] Basic statistics per document
- [ ] Error handling and validation
- [ ] Loading states and optimistic updates
- [ ] Mobile-responsive editor

---

## Success Criteria

The MVP is complete when:

### As an Organization Admin:

1. Create an organization
2. Invite users with roles (PM, Translator, Reviewer)
3. View all projects and resources

### As a Project Manager:

1. Create a Translation Memory and Term Base
2. Import existing translations via TMX
3. Create a project with workflow type
4. Upload documents to the project
5. Assign translators and reviewers to documents
6. Monitor project progress
7. Export completed documents

### As a Translator:

1. See my assigned documents
2. Open the translation editor
3. See TM suggestions while translating
4. See term highlights in source text
5. Confirm segments (adding to TM)
6. Submit document for review

### As a Reviewer:

1. See documents assigned for review
2. Edit translations if needed
3. Approve document to next stage

---

## References

### Standards

- [TMX 1.4 Specification](https://www.gala-global.org/tmx-14b)
- [XLIFF 1.2 Specification](http://docs.oasis-open.org/xliff/v1.2/os/xliff-core.html)
- [XLIFF 2.1 Specification](http://docs.oasis-open.org/xliff/xliff-core/v2.1/xliff-core-v2.1.html)
- [Unicode CLDR](https://cldr.unicode.org/)

### Libraries

- [fastest-levenshtein](https://www.npmjs.com/package/fastest-levenshtein)
- [fast-fuzzy](https://www.npmjs.com/package/fast-fuzzy)
- [cldr-segmentation](https://www.npmjs.com/package/cldr-segmentation)
- [xliff](https://www.npmjs.com/package/xliff)
- [CodeMirror 6](https://codemirror.net/6/)
- [@rbac/rbac](https://www.npmjs.com/package/@rbac/rbac)

### Open Source CAT Tools

- [OmegaT](https://omegat.org/)
- [MateCat](https://github.com/matecat/MateCat)
- [Okapi Framework](https://okapiframework.org/)
