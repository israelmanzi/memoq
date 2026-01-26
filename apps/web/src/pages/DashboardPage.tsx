import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { projectsApi, tmApi, tbApi, activityApi } from '../api';
import { useOrgStore } from '../stores/org';
import { formatWorkflowType } from '../utils/formatters';
import { ActivityFeed } from '../components/ActivityFeed';

export function DashboardPage() {
  const { currentOrg } = useOrgStore();

  const { data: projectsData } = useQuery({
    queryKey: ['projects', currentOrg?.id],
    queryFn: () => projectsApi.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const { data: tmsData } = useQuery({
    queryKey: ['tms', currentOrg?.id],
    queryFn: () => tmApi.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const { data: tbsData } = useQuery({
    queryKey: ['tbs', currentOrg?.id],
    queryFn: () => tbApi.list(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['org-activity', currentOrg?.id],
    queryFn: () => activityApi.listForOrg(currentOrg!.id, { limit: 10 }),
    enabled: !!currentOrg,
  });

  const projects = projectsData?.items ?? [];
  const tms = tmsData?.items ?? [];
  const tbs = tbsData?.items ?? [];
  const activities = activityData?.items ?? [];
  const activeProjects = projects.filter((p) => p.status === 'active');

  return (
    <div className="p-4 bg-surface min-h-full">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-text">Dashboard</h1>
        <p className="text-sm text-text-secondary">{currentOrg?.name}</p>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column: Stats + Recent Projects */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3">
            <Link
              to="/projects"
              className="bg-surface-alt p-3 border border-border hover:border-accent transition-colors"
              title="Number of projects currently in progress"
            >
              <div className="text-2xs font-medium text-text-muted uppercase tracking-wide">Active Projects</div>
              <div className="mt-1 text-xl font-bold text-text">{activeProjects.length}</div>
            </Link>

            <Link
              to="/tm"
              className="bg-surface-alt p-3 border border-border hover:border-accent transition-colors"
              title="Translation Memories store previously translated content for reuse"
            >
              <div className="text-2xs font-medium text-text-muted uppercase tracking-wide">Translation Memories</div>
              <div className="mt-1 text-xl font-bold text-text">{tms.length}</div>
            </Link>

            <Link
              to="/tb"
              className="bg-surface-alt p-3 border border-border hover:border-accent transition-colors"
              title="Term Bases contain approved terminology for consistent translations"
            >
              <div className="text-2xs font-medium text-text-muted uppercase tracking-wide">Term Bases</div>
              <div className="mt-1 text-xl font-bold text-text">{tbs.length}</div>
            </Link>
          </div>

          {/* Recent Projects */}
          <div className="bg-surface-alt border border-border">
            <div className="px-3 py-2 border-b border-border flex items-center justify-between bg-surface-panel">
              <h2 className="text-sm font-medium text-text">Recent Projects</h2>
              <Link
                to="/projects"
                className="text-xs text-accent hover:text-accent-hover"
              >
                View all
              </Link>
            </div>
            <div className="divide-y divide-border-light">
              {activeProjects.slice(0, 5).map((project) => (
                <Link
                  key={project.id}
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  className="block px-3 py-2.5 hover:bg-surface-hover"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-text truncate">{project.name}</span>
                        <span className="flex-shrink-0 px-1.5 py-0.5 text-2xs font-medium bg-surface-panel text-text-secondary">
                          {project.sourceLanguage} → {project.targetLanguage}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
                        <span>{formatWorkflowType(project.workflowType)}</span>
                        {project.createdByName && (
                          <>
                            <span className="text-border">•</span>
                            <span>{project.createdByName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
              {activeProjects.length === 0 && (
                <div className="px-3 py-6 text-center">
                  <p className="text-sm text-text-muted">No active projects</p>
                  <Link
                    to="/projects"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:text-accent-hover"
                  >
                    Create your first project
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column: Activity Feed */}
        <div className="bg-surface-alt border border-border">
          <div className="px-3 py-2 border-b border-border bg-surface-panel">
            <h2
              className="text-sm font-medium text-text cursor-help"
              title="Recent actions across the organization"
            >
              Recent Activity
            </h2>
          </div>
          <div className="p-3 max-h-96 overflow-y-auto">
            <ActivityFeed
              activities={activities}
              isLoading={activityLoading}
              showEntityName={true}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
