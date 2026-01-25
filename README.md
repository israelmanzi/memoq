# OXY

A translation management system (TMS) and computer-assisted translation (CAT) tool.

## Features

- Translation Memory with fuzzy matching
- Terminology management (Term Base)
- Multi-user with organization support
- Role-based workflows (Translator → Reviewer → Complete)
- File format support: Plain text, XLIFF, JSON, HTML, TMX

## Tech Stack

- **Backend**: Node.js, Fastify, TypeScript, PostgreSQL
- **Frontend**: React, TanStack Query, Tailwind CSS, CodeMirror 6
- **Infrastructure**: Docker, pnpm workspaces

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker and Docker Compose

### Setup

```bash
# Clone and install
git clone <repo-url>
cd oxy
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start database
pnpm db:up

# Run migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

The API runs on http://localhost:3000 and the frontend on http://localhost:5173.

## Project Structure

```
oxy/
├── apps/
│   ├── api/          # Fastify backend
│   └── web/          # React frontend
├── packages/
│   └── shared/       # Shared types and constants
├── docs/             # Documentation
└── docker-compose.yml
```

## Documentation

- [Technical Specification](docs/TECHNICAL_SPEC.md)
- [MVP Specification](docs/MVP_SPEC.md)
