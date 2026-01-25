import { api } from './client';
import type { Project, Document, Segment, WorkflowType, ProjectStatus, WorkflowStatus, SegmentStatus, ProjectRole, TermMatch } from '@memoq/shared';

export interface CreateProjectInput {
  name: string;
  description?: string;
  sourceLanguage: string;
  targetLanguage: string;
  workflowType?: WorkflowType;
}

export interface ProjectWithStats extends Project {
  documentCount: number;
  totalSegments: number;
  translatedSegments: number;
  reviewedSegments: number;
  progress: number;
  userRole: ProjectRole | null;
}

export interface DocumentWithStats extends Document {
  totalSegments: number;
  byStatus: Record<string, number>;
  progress: number;
}

export interface CreateDocumentInput {
  name: string;
  fileType: string;
  segments: Array<{ sourceText: string; targetText?: string }>;
}

export interface UploadDocumentResult extends DocumentWithStats {
  detectedSourceLanguage?: string;
  detectedTargetLanguage?: string;
}

export interface SegmentWithMatches extends Segment {
  matches: Array<{
    id: string;
    sourceText: string;
    targetText: string;
    matchPercent: number;
    isContextMatch: boolean;
  }>;
  termMatches: TermMatch[];
}

export interface SegmentWithMatchInfo extends Segment {
  bestMatchPercent: number | null;
  hasContextMatch: boolean;
}

export const projectsApi = {
  // Projects
  list: (orgId: string, status?: ProjectStatus) => {
    const query = status ? `?status=${status}` : '';
    return api.get<{ items: Project[] }>(`/projects/org/${orgId}${query}`);
  },

  get: (projectId: string) => api.get<ProjectWithStats>(`/projects/${projectId}`),

  create: (orgId: string, data: CreateProjectInput) =>
    api.post<Project>(`/projects/org/${orgId}`, data),

  update: (projectId: string, data: Partial<CreateProjectInput & { status: ProjectStatus }>) =>
    api.patch<Project>(`/projects/${projectId}`, data),

  delete: (projectId: string) => api.delete(`/projects/${projectId}`),

  // Project members
  listMembers: (projectId: string) =>
    api.get<{ items: Array<{ id: string; role: string; user: { id: string; email: string; name: string } }> }>(
      `/projects/${projectId}/members`
    ),

  addMember: (projectId: string, userId: string, role: ProjectRole) =>
    api.post(`/projects/${projectId}/members`, { userId, role }),

  removeMember: (projectId: string, memberId: string) =>
    api.delete(`/projects/${projectId}/members/${memberId}`),

  // Project resources
  listResources: (projectId: string) =>
    api.get<{ items: Array<{ id: string; resourceType: string; resourceId: string; isWritable: boolean }> }>(
      `/projects/${projectId}/resources`
    ),

  addResource: (projectId: string, resourceType: 'tm' | 'tb', resourceId: string, isWritable = true) =>
    api.post(`/projects/${projectId}/resources`, { resourceType, resourceId, isWritable }),

  removeResource: (projectId: string, resourceId: string) =>
    api.delete(`/projects/${projectId}/resources/${resourceId}`),

  // Documents
  listDocuments: (projectId: string) =>
    api.get<{ items: DocumentWithStats[] }>(`/documents/project/${projectId}`),

  getDocument: (documentId: string) => api.get<DocumentWithStats>(`/documents/${documentId}`),

  createDocument: (projectId: string, data: CreateDocumentInput) =>
    api.post<DocumentWithStats>(`/documents/project/${projectId}`, data),

  uploadDocument: async (projectId: string, file: File): Promise<UploadDocumentResult> => {
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('token');
    const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/api/v1/documents/project/${projectId}/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = new Error(data.error || 'Upload failed') as any;
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return response.json();
  },

  getSupportedTypes: () =>
    api.get<{ extensions: string[]; mimeTypes: string[] }>('/documents/supported-types'),

  updateDocumentStatus: (documentId: string, status: WorkflowStatus) =>
    api.patch<Document>(`/documents/${documentId}/status`, { status }),

  deleteDocument: (documentId: string) => api.delete(`/documents/${documentId}`),

  // Segments
  listSegments: (documentId: string, includeMatches = false) =>
    api.get<{ items: SegmentWithMatchInfo[] }>(
      `/documents/${documentId}/segments${includeMatches ? '?includeMatches=true' : ''}`
    ),

  getSegment: (documentId: string, segmentId: string) =>
    api.get<SegmentWithMatches>(`/documents/${documentId}/segments/${segmentId}`),

  updateSegment: (
    documentId: string,
    segmentId: string,
    data: { targetText: string; status?: SegmentStatus; confirm?: boolean }
  ) => api.patch<Segment>(`/documents/${documentId}/segments/${segmentId}`, data),

  updateSegmentsBulk: (
    documentId: string,
    segments: Array<{ id: string; targetText: string; status?: SegmentStatus }>
  ) => api.patch<{ updated: number }>(`/documents/${documentId}/segments`, { segments }),
};
