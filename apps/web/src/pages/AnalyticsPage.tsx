import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api';
import type { OrgLeverageAnalysis, ProjectTimelineEntry } from '../api';
import { useOrgStore } from '../stores/org';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const CHART_COLORS = {
  grid: '#D8DCE2',
  axisTick: '#8A939F',
  tooltipBg: '#FAFAFA',
  tooltipBorder: '#C5CBD3',
  legendText: '#5F6B7A',
  accentBlue: '#2F6FED',
  successGreen: '#2E7D32',
};

const LEVERAGE_COLORS: Record<string, string> = {
  exact: '#2E7D32',
  fuzzyHigh: '#2F6FED',
  fuzzyMid: '#4C6FA9',
  fuzzyLow: '#C88719',
  aiTranslation: '#7C3AED',
  noMatch: '#B23B3B',
  repetitions: '#8A939F',
};

const LEVERAGE_LABELS: Record<string, string> = {
  exact: 'Exact (100%)',
  fuzzyHigh: 'Fuzzy High (95-99%)',
  fuzzyMid: 'Fuzzy Mid (85-94%)',
  fuzzyLow: 'Fuzzy Low (75-84%)',
  aiTranslation: 'AI Translation',
  noMatch: 'No Match (<75%)',
  repetitions: 'Repetitions',
};

export function AnalyticsPage() {
  const { currentOrg } = useOrgStore();

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['org-statistics', currentOrg?.id],
    queryFn: () => analyticsApi.getOrgStatistics(currentOrg!.id),
    enabled: !!currentOrg,
    refetchInterval: 30000,
  });

  const { data: timeline } = useQuery({
    queryKey: ['org-timeline', currentOrg?.id],
    queryFn: () => analyticsApi.getOrgTimeline(currentOrg!.id),
    enabled: !!currentOrg,
  });

  const { data: leverage } = useQuery({
    queryKey: ['org-leverage', currentOrg?.id],
    queryFn: () => analyticsApi.getOrgLeverage(currentOrg!.id),
    enabled: !!currentOrg,
  });

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-text">Analytics</h1>
          <p className="text-sm text-text-secondary">{currentOrg?.name}</p>
        </div>
        <div className="animate-pulse space-y-4">
          <div className="grid grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-surface-alt border border-border"></div>
            ))}
          </div>
          <div className="h-[300px] bg-surface-alt border border-border"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-[250px] bg-surface-alt border border-border"></div>
            <div className="h-[250px] bg-surface-alt border border-border"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-4">
        <div className="mb-4">
          <h1 className="text-lg font-semibold text-text">Analytics</h1>
        </div>
        <div className="p-3 bg-danger-bg border border-danger/20 text-xs text-danger">
          Failed to load organization analytics
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-surface min-h-full">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-text">Analytics</h1>
        <p className="text-sm text-text-secondary">{currentOrg?.name} — Organization Overview</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Total Projects" value={stats.totalProjects} sub={`${stats.activeProjects} active`} />
        <MetricCard label="Documents" value={stats.totalDocuments} />
        <MetricCard label="Segments" value={stats.totalSegments} />
        <MetricCard label="Source Words" value={stats.totalSourceWords} />
      </div>

      {/* Translation Velocity Line Chart — full width */}
      <div className="bg-surface-alt border border-border mb-4">
        <div className="px-3 py-2 border-b border-border bg-surface-panel">
          <h2 className="text-sm font-medium text-text">Translation Velocity</h2>
          <p className="text-2xs text-text-muted">Last 30 days</p>
        </div>
        <div className="p-3">
          <VelocityChart data={timeline ?? []} />
        </div>
      </div>

      {/* Project Progress + TM Leverage side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-alt border border-border">
          <div className="px-3 py-2 border-b border-border bg-surface-panel">
            <h2 className="text-sm font-medium text-text">Project Progress</h2>
          </div>
          <div className="p-3">
            <ProjectProgressChart projects={stats.projectBreakdown} />
          </div>
        </div>

        <div className="bg-surface-alt border border-border">
          <div className="px-3 py-2 border-b border-border bg-surface-panel">
            <h2 className="text-sm font-medium text-text">Translation Leverage</h2>
          </div>
          <div className="p-3">
            <LeverageDonutChart data={leverage ?? null} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ Chart Components ============

function VelocityChart({ data }: { data: ProjectTimelineEntry[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-xs text-text-muted">
        No activity data for the last 30 days
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    dateLabel: formatDateShort(d.date),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis
          dataKey="dateLabel"
          tick={{ fontSize: 11, fill: CHART_COLORS.axisTick }}
          tickLine={false}
          axisLine={{ stroke: CHART_COLORS.grid }}
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: CHART_COLORS.axisTick }}
          tickLine={false}
          axisLine={false}
          label={{ value: 'Words', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: CHART_COLORS.axisTick } }}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: CHART_COLORS.axisTick }}
          tickLine={false}
          axisLine={false}
          label={{ value: 'Segments', angle: 90, position: 'insideRight', style: { fontSize: 11, fill: CHART_COLORS.axisTick } }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_COLORS.tooltipBg,
            border: `1px solid ${CHART_COLORS.tooltipBorder}`,
            borderRadius: 0,
            fontSize: 12,
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: CHART_COLORS.legendText }}
        />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="wordsTranslated"
          name="Words Translated"
          stroke={CHART_COLORS.accentBlue}
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="segmentsCompleted"
          name="Segments Completed"
          stroke={CHART_COLORS.successGreen}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function ProjectProgressChart({ projects }: { projects: Array<{ projectId: string; projectName: string; progressPercentage: number }> }) {
  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-xs text-text-muted">
        No projects yet
      </div>
    );
  }

  const chartHeight = Math.max(200, projects.length * 40);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={projects} layout="vertical" margin={{ left: 10, right: 30 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: CHART_COLORS.axisTick }}
          tickLine={false}
          axisLine={{ stroke: CHART_COLORS.grid }}
          tickFormatter={(v: number) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="projectName"
          tick={{ fontSize: 11, fill: CHART_COLORS.axisTick }}
          tickLine={false}
          axisLine={false}
          width={120}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_COLORS.tooltipBg,
            border: `1px solid ${CHART_COLORS.tooltipBorder}`,
            borderRadius: 0,
            fontSize: 12,
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={((value: any) => [`${value ?? 0}%`, 'Progress']) as any}
        />
        <Bar
          dataKey="progressPercentage"
          fill={CHART_COLORS.accentBlue}
          radius={[0, 2, 2, 0]}
          barSize={20}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LeverageDonutChart({ data }: { data: OrgLeverageAnalysis | null }) {
  if (!data || data.totalSegments === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] text-xs text-text-muted">
        No leverage data available
      </div>
    );
  }

  const dist = data.matchDistribution;
  const pieData = (Object.keys(dist) as Array<keyof typeof dist>)
    .filter((key) => dist[key].count > 0)
    .map((key) => ({
      name: LEVERAGE_LABELS[key],
      value: dist[key].count,
      words: dist[key].words,
      percentage: dist[key].percentage,
      color: LEVERAGE_COLORS[key],
    }));

  if (pieData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[250px] text-xs text-text-muted">
        No leverage data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie
          data={pieData}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label={((props: any) => `${Math.round((props.percent ?? 0) * 100)}%`) as any}
          labelLine={{ stroke: CHART_COLORS.axisTick }}
        >
          {pieData.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_COLORS.tooltipBg,
            border: `1px solid ${CHART_COLORS.tooltipBorder}`,
            borderRadius: 0,
            fontSize: 12,
          }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={((_value: any, _name: any, props: any) => {
            const p = props?.payload;
            if (!p) return [];
            return [`${p.value.toLocaleString()} segments, ${p.words.toLocaleString()} words`];
          }) as any}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: CHART_COLORS.legendText }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ============ Shared Components ============

function MetricCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-surface-alt p-3 border border-border">
      <div className="text-2xs font-medium text-text-muted uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-xl font-bold text-text">{value.toLocaleString()}</div>
      {sub && <div className="text-2xs text-text-muted">{sub}</div>}
    </div>
  );
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
