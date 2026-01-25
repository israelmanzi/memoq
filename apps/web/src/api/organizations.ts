import { api } from './client';
import type { Organization, OrgRole } from '@memoq/shared';

export interface CreateOrgInput {
  name: string;
  slug: string;
}

export interface AddMemberInput {
  email: string;
  role: OrgRole;
}

export interface OrgMember {
  id: string;
  role: OrgRole;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export const orgsApi = {
  list: () => api.get<{ items: (Organization & { role: OrgRole })[] }>('/organizations'),

  get: (orgId: string) => api.get<Organization & { role: OrgRole }>(`/organizations/${orgId}`),

  create: (data: CreateOrgInput) => api.post<Organization>('/organizations', data),

  listMembers: (orgId: string) => api.get<{ items: OrgMember[] }>(`/organizations/${orgId}/members`),

  addMember: (orgId: string, data: AddMemberInput) =>
    api.post<OrgMember>(`/organizations/${orgId}/members`, data),

  updateMemberRole: (orgId: string, memberId: string, role: OrgRole) =>
    api.patch(`/organizations/${orgId}/members/${memberId}`, { role }),

  removeMember: (orgId: string, memberId: string) =>
    api.delete(`/organizations/${orgId}/members/${memberId}`),
};
