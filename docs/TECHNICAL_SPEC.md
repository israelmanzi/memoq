# MemoQ Clone - Technical Specification

## Overview

A translation management system (TMS) and computer-assisted translation (CAT) tool that enables translators to work efficiently with translation memories, terminology databases, and various document formats.

---

## Reference Product Analysis

### What is memoQ?

memoQ is a commercial translation management platform that provides:

- Translation Memory (TM) - Database storing source/target segment pairs
- Term Base (TB) - Terminology management database
- CAT Editor - Translation interface with TM/TB integration
- Project Management - Workflow orchestration for translation projects
- File Format Support - Import/export of 70+ document formats
- Machine Translation Integration - Connection to MT engines
- Quality Assurance - Automated translation quality checks
- Collaboration - Multi-user project workflows

### Core Value Proposition

1. **Reuse** - Never translate the same sentence twice
2. **Consistency** - Enforce terminology across translations
3. **Speed** - Auto-suggest from TM reduces manual work
4. **Quality** - QA checks catch errors before delivery

---

## System Architecture (Full Product)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Desktop App   │    Web App      │      API Clients            │
│   (Windows)     │   (Browser)     │   (Integrations)            │
└────────┬────────┴────────┬────────┴──────────────┬──────────────┘
         │                 │                       │
         └─────────────────┼───────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                        API Gateway                               │
│              (REST API / WebSocket / SOAP)                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                     Application Layer                            │
├─────────────┬─────────────┬─────────────┬───────────────────────┤
│   Project   │ Translation │  Resource   │      File             │
│   Service   │   Service   │   Service   │    Processing         │
└─────────────┴─────────────┴─────────────┴───────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                      Data Layer                                  │
├─────────────┬─────────────┬─────────────┬───────────────────────┤
│  Projects   │ Translation │   Term      │      Files            │
│     DB      │  Memory DB  │   Base DB   │     Storage           │
└─────────────┴─────────────┴─────────────┴───────────────────────┘
```

---

## Core Domain Concepts

### Translation Memory (TM)

A database of translation units (TUs) consisting of:

- **Source segment**: Original text in source language
- **Target segment**: Translated text in target language
- **Context**: Surrounding segments for disambiguation
- **Metadata**: Creation date, author, document origin, etc.

**Match Types**:

| Match % | Type | Description |
|---------|------|-------------|
| 100% | Exact | Identical source segment |
| 101% | Context | Exact + same surrounding context |
| 75-99% | Fuzzy | Similar but not identical |
| <75% | No match | Too different to be useful |

### Term Base (TB)

A terminology database containing:

- **Term**: The word or phrase
- **Language**: Which language the term belongs to
- **Definition**: Meaning/usage notes
- **Domain**: Subject area (legal, medical, etc.)
- **Status**: Approved, pending, deprecated

### Segments

Text is split into **segments** (typically sentences) for:

- Granular TM matching
- Parallel alignment display
- Progress tracking

### Projects

Container for translation work:

- Source/target language pair
- Documents to translate
- Assigned TMs and TBs
- Workflow status
- User assignments

---

## Data Models

### Translation Unit

```typescript
interface TranslationUnit {
  id: string;
  sourceSegment: string;
  targetSegment: string;
  sourceLanguage: string;
  targetLanguage: string;
  context?: {
    previous?: string;
    next?: string;
  };
  metadata: {
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
    documentOrigin?: string;
    confirmedBy?: string;
    confirmedAt?: Date;
  };
  status: 'draft' | 'confirmed' | 'reviewed';
}
```

### Term Entry

```typescript
interface TermEntry {
  id: string;
  terms: TermVariant[];
  domain?: string;
  definition?: string;
  notes?: string;
  status: 'approved' | 'pending' | 'deprecated';
  createdAt: Date;
  updatedAt: Date;
}

interface TermVariant {
  language: string;
  term: string;
  partOfSpeech?: string;
  gender?: string;
  usage?: string;
}
```

### Project

```typescript
interface Project {
  id: string;
  name: string;
  sourceLanguage: string;
  targetLanguage: string;
  documents: Document[];
  translationMemories: string[]; // TM IDs
  termBases: string[]; // TB IDs
  status: 'created' | 'in_progress' | 'review' | 'completed';
  createdAt: Date;
  deadline?: Date;
  assignees: string[];
}
```

### Document

```typescript
interface Document {
  id: string;
  projectId: string;
  name: string;
  originalFile: string; // Storage path
  segments: Segment[];
  status: 'imported' | 'translating' | 'translated' | 'exported';
  statistics: {
    totalSegments: number;
    translatedSegments: number;
    confirmedSegments: number;
    wordCount: number;
  };
}

interface Segment {
  id: string;
  index: number;
  source: string;
  target?: string;
  status: 'untranslated' | 'draft' | 'confirmed' | 'locked';
  tmMatch?: {
    matchPercentage: number;
    sourceUnit: string; // TU ID
  };
  comments?: Comment[];
}
```

---

## Key Algorithms

### Fuzzy Matching

Calculate similarity between source segment and TM entries:

```
1. Normalize both strings (lowercase, remove punctuation)
2. Tokenize into words
3. Calculate Levenshtein distance or use n-gram similarity
4. Return percentage: (1 - distance/maxLength) * 100
```

**Considerations**:

- Ignore formatting tags
- Handle number/date placeholders
- Weight word order importance

### Segmentation

Split document text into translatable segments:

```
1. Apply sentence boundary detection (SBD)
2. Handle abbreviations (Dr., etc.)
3. Respect inline formatting
4. Preserve segment-internal tags
5. Handle lists and titles differently
```

### TM Lookup

```
1. Receive source segment
2. Normalize and hash for exact match check
3. If no exact match, perform fuzzy search
4. Rank results by match percentage
5. Apply context bonus for 101% matches
6. Return top N matches
```

---

## File Format Processing

### Import Pipeline

```
Raw File → Format Detection → Parser → Segments → TM Pre-translation
```

### Export Pipeline

```
Translated Segments → Merger → Format Writer → Output File
```

### Priority Formats

| Format | Complexity | MVP Priority |
|--------|------------|--------------|
| Plain text (.txt) | Low | P0 |
| XLIFF (.xlf) | Medium | P0 |
| HTML (.html) | Medium | P1 |
| JSON (.json) | Low | P1 |
| DOCX (.docx) | High | P2 |
| PDF (.pdf) | Very High | P3 |

---

## API Design

### REST Endpoints

```
# Projects
POST   /api/projects
GET    /api/projects
GET    /api/projects/:id
PUT    /api/projects/:id
DELETE /api/projects/:id

# Documents
POST   /api/projects/:id/documents      (file upload)
GET    /api/projects/:id/documents
GET    /api/documents/:id
GET    /api/documents/:id/segments
PUT    /api/documents/:id/export

# Segments
GET    /api/segments/:id
PUT    /api/segments/:id                (update translation)
POST   /api/segments/:id/confirm

# Translation Memory
POST   /api/translation-memories
GET    /api/translation-memories
GET    /api/translation-memories/:id
POST   /api/translation-memories/:id/lookup
POST   /api/translation-memories/:id/import   (TMX import)
GET    /api/translation-memories/:id/export   (TMX export)

# Term Base
POST   /api/term-bases
GET    /api/term-bases
GET    /api/term-bases/:id
POST   /api/term-bases/:id/terms
GET    /api/term-bases/:id/lookup
```

---

## Quality Assurance Checks

| Check | Description |
|-------|-------------|
| Missing translation | Segment has no target |
| Inconsistent translation | Same source, different targets |
| Terminology violation | Term not used correctly |
| Number mismatch | Numbers differ between source/target |
| Punctuation mismatch | Ending punctuation differs |
| Tag mismatch | Formatting tags missing/extra |
| Double spaces | Multiple consecutive spaces |
| Empty target | Target is empty or whitespace |

---

## Technology Considerations

### Database Options

| Option | Pros | Cons |
|--------|------|------|
| PostgreSQL | Full-text search, JSON support, reliable | Heavier setup |
| SQLite | Simple, file-based, portable | Limited concurrency |
| MongoDB | Flexible schema, good for documents | Less ACID |

### Search/Matching

| Option | Use Case |
|--------|----------|
| PostgreSQL FTS | Basic fuzzy matching |
| Elasticsearch | Advanced search, scaling |
| In-memory | MVP, small datasets |

### File Storage

| Option | Use Case |
|--------|----------|
| Local filesystem | MVP, single server |
| S3/MinIO | Production, scaling |

---

## Non-Functional Requirements (Full Product)

- **Performance**: TM lookup < 200ms for 1M entries
- **Scalability**: Support 100+ concurrent users
- **Availability**: 99.9% uptime
- **Security**: SOC 2 compliance, encryption at rest
- **Backup**: Point-in-time recovery

---

## References

- [TMX 1.4 Specification](https://www.gala-global.org/tmx-14b)
- [XLIFF 2.1 Specification](http://docs.oasis-open.org/xliff/xliff-core/v2.1/xliff-core-v2.1.html)
- [TBX Specification](https://www.tbxinfo.net/)
- [Unicode CLDR](https://cldr.unicode.org/)
