import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { projectsApi, tmApi, tbApi } from '../api';
import { useOrgStore } from '../stores/org';

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

  const projects = projectsData?.items ?? [];
  const tms = tmsData?.items ?? [];
  const tbs = tbsData?.items ?? [];
  const activeProjects = projects.filter((p) => p.status === 'active');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome to {currentOrg?.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="text-sm font-medium text-gray-500">Active Projects</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{activeProjects.length}</div>
          <Link to="/projects" className="mt-4 text-sm text-blue-600 hover:text-blue-700 inline-block">
            View all projects →
          </Link>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="text-sm font-medium text-gray-500">Translation Memories</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{tms.length}</div>
          <Link to="/tm" className="mt-4 text-sm text-blue-600 hover:text-blue-700 inline-block">
            Manage TMs →
          </Link>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="text-sm font-medium text-gray-500">Term Bases</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{tbs.length}</div>
          <Link to="/tb" className="mt-4 text-sm text-blue-600 hover:text-blue-700 inline-block">
            Manage TBs →
          </Link>
        </div>
      </div>

      {/* Recent Projects */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Projects</h2>
          <Link
            to="/projects"
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            View all
          </Link>
        </div>
        <div className="divide-y divide-gray-200">
          {activeProjects.slice(0, 5).map((project) => (
            <Link
              key={project.id}
              to="/projects/$projectId"
              params={{ projectId: project.id }}
              className="block px-6 py-4 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{project.name}</div>
                  <div className="text-sm text-gray-500">
                    {project.sourceLanguage} → {project.targetLanguage}
                  </div>
                </div>
                <div className="text-sm text-gray-500">{project.workflowType}</div>
              </div>
            </Link>
          ))}
          {activeProjects.length === 0 && (
            <div className="px-6 py-8 text-center text-gray-500">
              No active projects. Create your first project to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
