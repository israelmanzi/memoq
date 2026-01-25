import { api } from './client';
import type { ActivityLogEntry } from '@memoq/shared';

export interface ActivityListResponse {
  items: ActivityLogEntry[];
  total: number;
}

export const activityApi = {
  listForProject: (projectId: string, options?: { limit?: number; offset?: number }) =>
    api.get<ActivityListResponse>(
      `/activity/project/${projectId}?limit=${options?.limit ?? 50}&offset=${options?.offset ?? 0}`
    ),

  listForDocument: (documentId: string, options?: { limit?: number; offset?: number }) =>
    api.get<ActivityListResponse>(
      `/activity/document/${documentId}?limit=${options?.limit ?? 50}&offset=${options?.offset ?? 0}`
    ),

  listForOrg: (orgId: string, options?: { limit?: number; offset?: number }) =>
    api.get<ActivityListResponse>(
      `/activity/org/${orgId}?limit=${options?.limit ?? 50}&offset=${options?.offset ?? 0}`
    ),
};
