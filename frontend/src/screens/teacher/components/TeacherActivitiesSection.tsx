import { ClipboardList, ArrowRight } from "lucide-react";
import { WorkspaceEmptyState } from "../../../components/WorkspaceEmptyState";
import { WorkspaceHeading } from "../../../components/WorkspaceHeading";
import { motion } from "framer-motion";
import { Card, CardContent } from "../../../components/ui/Card";
import type { TeacherOverviewActivity } from "../services/teacherClassroomService";

type TeacherActivitiesSectionProps = {
  activities: TeacherOverviewActivity[];
  isLoading: boolean;
  onOpenActivity: (activity: TeacherOverviewActivity) => void;
};

const getSubmissionTypeLabel = (type: string) => {
  if (type === "code") return "Code";
  if (type === "image") return "Image";
  if (type === "file") return "File";
  return "Essay";
};

export function TeacherActivitiesSection({
  activities,
  isLoading,
  onOpenActivity,
}: TeacherActivitiesSectionProps) {
  return (
    <div className="space-y-5">
      <WorkspaceHeading eyebrow="CLASSROOM / ACTIVITIES" title="All Activities" description="Explore assignments, submission types, and deadlines across your classes." icon={ClipboardList} />

      {isLoading ? (
        <Card className="theme-card">
          <CardContent className="p-6 text-sm theme-muted">Loading activities...</CardContent>
        </Card>
      ) : activities.length === 0 ? (
        <Card className="theme-card">
          <WorkspaceEmptyState icon={ClipboardList} title="Room for your next idea" description="Open a class to create an activity for your students." />
        </Card>
      ) : (
        <div className="space-y-3">
          {activities.map((activity) => (
            <motion.div key={activity.id} whileHover={{ y: -2 }}>
              <Card className="activity-list-card theme-card transition hover:border-[color-mix(in_srgb,var(--app-accent)_55%,var(--app-border))] hover:shadow-[var(--app-shadow)]">
                <CardContent className="space-y-2 p-5">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenActivity(activity)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onOpenActivity(activity);
                      }
                    }}
                    className="theme-ring block w-full cursor-pointer rounded-xl text-left"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--app-text)]">{activity.title}</p>
                        <p className="text-xs theme-muted">{activity.className}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs font-medium theme-title">
                        <span>Due {new Date(activity.dueDate).toLocaleString()}</span>
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>

                    <p className="text-sm theme-muted">{activity.description}</p>

                    <div className="flex flex-wrap items-center gap-3 text-xs theme-muted">
                      <span className="rounded-full bg-[color-mix(in_srgb,var(--app-accent)_16%,transparent)] px-2 py-1 text-[var(--app-accent)]">
                        {getSubmissionTypeLabel(activity.submissionType)}
                      </span>
                      <span>{activity.maxScore} pts</span>
                      {activity.submissionType === "code" &&
                        activity.programmingLanguage && (
                          <span>{activity.programmingLanguage}</span>
                        )}
                      <span>{activity.submissionCount} submissions</span>
                      <span>Instructor: {activity.instructor}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
