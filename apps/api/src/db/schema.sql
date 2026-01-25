-- MemoQ Database Schema
-- Run with: psql -d memoq -f schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organization Memberships
CREATE TABLE IF NOT EXISTS org_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'project_manager', 'translator', 'reviewer')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON org_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON org_memberships(org_id);

-- Translation Memories
CREATE TABLE IF NOT EXISTS translation_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_org ON translation_memories(org_id);

-- Translation Units
CREATE TABLE IF NOT EXISTS translation_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tm_id UUID NOT NULL REFERENCES translation_memories(id) ON DELETE CASCADE,
    source_text TEXT NOT NULL,
    target_text TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    context_prev TEXT,
    context_next TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_tu_tm ON translation_units(tm_id);
CREATE INDEX IF NOT EXISTS idx_tu_hash ON translation_units(source_hash);

-- Term Bases
CREATE TABLE IF NOT EXISTS term_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tb_org ON term_bases(org_id);

-- Terms
CREATE TABLE IF NOT EXISTS terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tb_id UUID NOT NULL REFERENCES term_bases(id) ON DELETE CASCADE,
    source_term TEXT NOT NULL,
    target_term TEXT NOT NULL,
    definition TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terms_tb ON terms(tb_id);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    workflow_type TEXT DEFAULT 'single_review' CHECK (workflow_type IN ('simple', 'single_review', 'full_review')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);

-- Project Resources
CREATE TABLE IF NOT EXISTS project_resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    resource_type TEXT NOT NULL CHECK (resource_type IN ('tm', 'tb')),
    resource_id UUID NOT NULL,
    is_writable BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_resources ON project_resources(project_id);

-- Project Members
CREATE TABLE IF NOT EXISTS project_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('project_manager', 'translator', 'reviewer_1', 'reviewer_2')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);

-- Documents
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    original_content TEXT,
    workflow_status TEXT DEFAULT 'translation' CHECK (workflow_status IN ('translation', 'review_1', 'review_2', 'complete')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id);

-- Document Assignments
CREATE TABLE IF NOT EXISTS document_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('translator', 'reviewer_1', 'reviewer_2')),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(document_id, role)
);

CREATE INDEX IF NOT EXISTS idx_doc_assignments_doc ON document_assignments(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_assignments_user ON document_assignments(user_id);

-- Segments
CREATE TABLE IF NOT EXISTS segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    segment_index INTEGER NOT NULL,
    source_text TEXT NOT NULL,
    target_text TEXT,
    status TEXT DEFAULT 'untranslated' CHECK (status IN ('untranslated', 'draft', 'translated', 'reviewed_1', 'reviewed_2', 'locked')),
    locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    last_modified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segments_document ON segments(document_id);
CREATE INDEX IF NOT EXISTS idx_segments_order ON segments(document_id, segment_index);

-- Segment History
CREATE TABLE IF NOT EXISTS segment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    segment_id UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
    target_text TEXT,
    status TEXT,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segment_history ON segment_history(segment_id);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['organizations', 'users', 'translation_memories', 'translation_units', 'projects', 'documents', 'segments'])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %s', t, t);
        EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %s FOR EACH ROW EXECUTE FUNCTION update_updated_at()', t, t);
    END LOOP;
END;
$$;
