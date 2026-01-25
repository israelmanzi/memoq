import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Organization, OrgRole } from '@oxy/shared';

interface OrgState {
  currentOrg: (Organization & { role: OrgRole }) | null;
  setCurrentOrg: (org: (Organization & { role: OrgRole }) | null) => void;
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set) => ({
      currentOrg: null,
      setCurrentOrg: (org) => set({ currentOrg: org }),
    }),
    {
      name: 'org-storage',
    }
  )
);
