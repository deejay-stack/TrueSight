import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  GraduationCap,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "../../../components/ui/Card";
import type { TeacherAnalytics } from "../services/teacherClassroomService";

type TeacherIntegrityAnalyticsDashboardProps = {
  analytics: TeacherAnalytics | null;
  isLoading: boolean;
};

const formatScore = (score: number | null): string =>
  score === null ? "N/A" : `${score.toFixed(2)}%`;

const getIntegrityTone = (score: number | null): string => {
  if (score === null) {
    return "text-[var(--app-text)]";
  }

  if (score >= 75) {
    return "text-[var(--status-success)]";
  }

  if (score >= 55) {
    return "text-[var(--status-warning)]";
  }

  return "text-[var(--status-danger)]";
};

export function TeacherIntegrityAnalyticsDashboard({
  analytics,
  isLoading,
}: TeacherIntegrityAnalyticsDashboardProps) {
  if (isLoading) {
    return (
      <Card className="theme-card">
        <CardContent className="p-5 text-sm theme-muted">
          Loading teacher analytics dashboard...
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card className="theme-card">
        <CardContent className="p-5 text-sm theme-muted">
          Analytics are currently unavailable.
        </CardContent>
      </Card>
    );
  }

  const totals = analytics.totals;
  const monthlyTrends = analytics.monthlyTrends ?? [];
  const topSuspiciousClasses = analytics.topSuspiciousClasses ?? [];

  const maxMonthlySubmissions = Math.max(
    1,
    ...monthlyTrends.map((item) => item.submissions),
  );
  const maxMonthlyFlagged = Math.max(
    1,
    ...monthlyTrends.map((item) => item.flaggedOutputs),
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-[var(--app-text)]">
          Teacher Integrity Analytics
        </h2>
        <p className="text-sm theme-muted">
          Live classroom integrity trends and high-risk submission patterns.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="theme-card">
          <CardContent className="space-y-1 p-4">
            <div className="flex items-center gap-2 text-xs theme-muted">
              <BarChart3 className="h-4 w-4 text-[var(--app-accent)]" />
              <span>Total submissions</span>
            </div>
            <p className="text-2xl font-bold text-[var(--app-text)]">
              {totals.totalSubmissions}
            </p>
          </CardContent>
        </Card>

        <Card className="theme-card">
          <CardContent className="space-y-1 p-4">
            <div className="flex items-center gap-2 text-xs theme-muted">
              <AlertTriangle className="h-4 w-4 text-[var(--status-warning)]" />
              <span>Flagged outputs</span>
            </div>
            <p className="text-2xl font-bold text-[var(--app-text)]">
              {totals.flaggedOutputs}
            </p>
          </CardContent>
        </Card>

        <Card className="theme-card">
          <CardContent className="space-y-1 p-4">
            <div className="flex items-center gap-2 text-xs theme-muted">
              <ShieldCheck className="h-4 w-4 text-[var(--status-success)]" />
              <span>Average integrity score</span>
            </div>
            <p
              className={`text-2xl font-bold ${getIntegrityTone(
                totals.averageIntegrityScore,
              )}`}
            >
              {formatScore(totals.averageIntegrityScore)}
            </p>
          </CardContent>
        </Card>

        <Card className="theme-card">
          <CardContent className="space-y-1 p-4">
            <div className="flex items-center gap-2 text-xs theme-muted">
              <GraduationCap className="h-4 w-4 text-[var(--app-accent)]" />
              <span>Top suspicious classes</span>
            </div>
            <p className="text-2xl font-bold text-[var(--app-text)]">
              {topSuspiciousClasses.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card className="theme-card">
          <CardContent className="space-y-3 p-5">
            <h3 className="text-lg font-semibold text-[var(--app-text)]">
              Top suspicious classes
            </h3>
            {topSuspiciousClasses.length === 0 ? (
              <p className="text-sm theme-muted">
                No class-level risk signals available yet.
              </p>
            ) : (
              <div className="space-y-2">
                {topSuspiciousClasses.map((item) => (
                  <div
                    key={item.classId}
                    className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[var(--app-text)]">
                          {item.className}
                        </p>
                        <p className="text-xs theme-muted">
                          {item.flaggedOutputs} flagged out of {item.submissions} submissions
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs theme-muted">Average integrity</p>
                        <p
                          className={`text-sm font-semibold ${getIntegrityTone(
                            item.averageIntegrityScore,
                          )}`}
                        >
                          {formatScore(item.averageIntegrityScore)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--app-muted)_18%,transparent)]">
                      <div
                        className="h-full bg-rose-500"
                        style={{
                          width: `${Math.min(
                            Math.max(item.averageAiProbability ?? 0, 0),
                            100,
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="theme-card">
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-[var(--app-accent)]" />
              <h3 className="text-lg font-semibold text-[var(--app-text)]">Monthly trends</h3>
            </div>
            {monthlyTrends.length === 0 ? (
              <p className="text-sm theme-muted">No monthly trend data available.</p>
            ) : (
              <div className="space-y-3">
                {monthlyTrends.map((item) => (
                  <div
                    key={item.monthKey}
                    className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--app-text)]">{item.month}</span>
                      <span className="theme-muted">
                        Integrity {formatScore(item.averageIntegrityScore)}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      <div>
                        <div className="mb-1 flex items-center justify-between text-[11px] theme-muted">
                          <span>Submissions</span>
                          <span>{item.submissions}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--app-muted)_18%,transparent)]">
                          <div
                            className="h-full bg-[var(--app-accent)]"
                            style={{
                              width: `${(item.submissions / maxMonthlySubmissions) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-[11px] theme-muted">
                          <span>Flagged outputs</span>
                          <span>{item.flaggedOutputs}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--app-muted)_18%,transparent)]">
                          <div
                            className="h-full bg-rose-500"
                            style={{
                              width: `${(item.flaggedOutputs / maxMonthlyFlagged) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
