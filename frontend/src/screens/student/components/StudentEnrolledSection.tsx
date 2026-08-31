import { motion } from "framer-motion";
import { ArrowRight, FileText } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import type {
  ClassActivity,
  EnrolledClass,
} from "../services/studentClassroomService";
import { StudentClassCard } from "./StudentClassCard";

type StudentEnrolledSectionProps = {
  enrolledClasses: EnrolledClass[];
  selectedClassId: string | null;
  selectedClass: EnrolledClass | null;
  activities: ClassActivity[];
  isLoadingClasses: boolean;
  isLoadingActivities: boolean;
  onSelectClass: (classId: string) => void;
  onOpenActivityDetails: (activity: ClassActivity) => void;
};

const getSubmissionTypeLabel = (type: string) => {
  if (type === "code") return "Code";
  if (type === "image") return "Image";
  if (type === "file") return "File";
  return "Essay";
};

export function StudentEnrolledSection({
  enrolledClasses,
  selectedClassId,
  selectedClass,
  activities,
  isLoadingClasses,
  isLoadingActivities,
  onSelectClass,
  onOpenActivityDetails,
}: StudentEnrolledSectionProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-[var(--app-text)]">Enrolled Classes</h2>
        <p className="text-sm theme-muted">
          Browse all your classes and submit activities per class.
        </p>
      </div>

      {isLoadingClasses ? (
        <Card className="theme-card">
          <CardContent className="p-5 text-sm theme-muted">Loading classes...</CardContent>
        </Card>
      ) : enrolledClasses.length === 0 ? (
        <Card className="theme-card">
          <CardContent className="p-6 text-sm theme-muted">
            You are not enrolled in any classes yet. Use a class code to join.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <Card className="theme-card">
            <CardContent className="space-y-3 p-4">
              {enrolledClasses.map((classroom) => (
                <StudentClassCard
                  key={classroom.id}
                  classroom={classroom}
                  selected={selectedClassId === classroom.id}
                  onSelect={onSelectClass}
                />
              ))}
            </CardContent>
          </Card>

          <Card className="theme-card">
            <CardContent className="space-y-4 p-5">
              {selectedClass ? (
                <div>
                  <h3 className="text-xl font-bold text-[var(--app-text)]">{selectedClass.name}</h3>
                  <p className="text-sm theme-muted">
                    Instructor: {selectedClass.teacherName} - Code: {selectedClass.code}
                  </p>
                </div>
              ) : (
                <p className="text-sm theme-muted">Select a class to view activities.</p>
              )}

              {isLoadingActivities ? (
                <p className="text-sm theme-muted">Loading activities...</p>
              ) : activities.length === 0 ? (
                <p className="text-sm theme-muted">No activities available yet.</p>
              ) : (
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <motion.div
                      key={activity.id}
                      whileHover={{ scale: 1.01 }}
                      onClick={() => onOpenActivityDetails(activity)}
                      className="cursor-pointer rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] p-4 transition-all hover:border-[var(--app-accent)] hover:shadow-[var(--app-glow)]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold text-[var(--app-text)]">{activity.title}</p>
                          <p className="mt-1 text-sm theme-muted">{activity.description}</p>
                          <p className="mt-2 text-xs theme-muted">
                            Instructor: {activity.instructor} - Due{" "}
                            {new Date(activity.dueDate).toLocaleString()}
                          </p>
                        </div>
                        <span className="rounded-full bg-[color-mix(in_srgb,var(--app-accent)_18%,transparent)] px-2 py-1 text-xs text-[var(--app-accent)]">
                          {getSubmissionTypeLabel(activity.submissionType)}
                        </span>
                      </div>

                      {activity.mySubmission && (
                        <div className="mt-3 rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] px-3 py-2 text-xs theme-muted">
                          <p>Status: {activity.mySubmission.status}</p>
                          {activity.mySubmission.teacherScore !== null && (
                            <p>
                              Score: {activity.mySubmission.teacherScore}/{activity.maxScore}
                            </p>
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <Button
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenActivityDetails(activity);
                          }}
                        >
                          <ArrowRight className="mr-2 h-4 w-4" />
                          View Activity
                        </Button>
                        {activity.attachment && (
                          <span className="inline-flex items-center rounded-lg border theme-border px-3 py-1.5 text-xs theme-muted">
                            <FileText className="mr-2 h-3.5 w-3.5 text-[var(--app-accent)]" />
                            Attachment
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
