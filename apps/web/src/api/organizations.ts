import { api } from './client';
import type { Organization, OrgRole } from '@oxy/shared';

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

export interface OrgInvitation {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
  createdAt: string;
  isExpired: boolean;
  invitedByUser?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface InvitationDetails {
  id: string;
  email: string;
  role: string;
  status: string;
  isValid: boolean;
  expiresAt: string;
  organization: {
    id: string;
    name: string;
  } | null;
  invitedBy: {
    name: string;
  } | null;
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

  // Invitations
  listInvitations: (orgId: string) =>
    api.get<{ items: OrgInvitation[] }>(`/organizations/${orgId}/invitations`),

  sendInvitation: (orgId: string, data: AddMemberInput) =>
    api.post<{ id: string; email: string; role: OrgRole; expiresAt: string; emailSent: boolean }>(
      `/organizations/${orgId}/invitations`,
      data
    ),

  cancelInvitation: (orgId: string, invitationId: string) =>
    api.delete(`/organizations/${orgId}/invitations/${invitationId}`),

  resendInvitation: (orgId: string, invitationId: string) =>
    api.post<{ id: string; email: string; role: OrgRole; expiresAt: string; emailSent: boolean }>(
      `/organizations/${orgId}/invitations/${invitationId}/resend`
    ),

  // Public invitation endpoints
  getInvitation: (token: string) =>
    api.get<InvitationDetails>(`/invitations/${token}`),

  acceptInvitation: (token: string) =>
    api.post<{ success: boolean; orgId: string; message: string }>(`/invitations/${token}/accept`),
};
