import { semesterLabel } from '../../../utils/curriculum';
import { BookOpen, Copy, Plus } from "lucide-react";
import { WorkspaceEmptyState } from "../../../components/WorkspaceEmptyState";
import { WorkspaceHeading } from "../../../components/WorkspaceHeading";
import { motion } from "framer-motion";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import type { TeacherClass } from "../services/teacherClassroomService";

type TeacherClassesSectionProps = {
  classes: TeacherClass[];
  isLoading: boolean;
  latestCreatedCode: string;
  copiedCode: string | null;
  onCreateClass: () => void;
  onCopyCode: (code: string) => void;
  onManageClass: (classroom: TeacherClass) => void;
};

export function TeacherClassesSection({
  classes,
  isLoading,
  latestCreatedCode,
  copiedCode,
  onCreateClass,
  onCopyCode,
  onManageClass,
}: TeacherClassesSectionProps) {
  return (
    <div className="space-y-5">
      <WorkspaceHeading
        eyebrow="CLASSROOM / ORGANIZE"
        title="Your Classes"
        description="Manage your classrooms, invite students, and keep every activity in view."
        icon={BookOpen}
        actions={
          <Button onClick={onCreateClass}>
            <Plus className="mr-2 h-4 w-4" />
            New Class
          </Button>
        }
      />

      {latestCreatedCode && (
        <Card className="theme-card border-dashed theme-border">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium theme-title">Latest generated join code</p>
              <p className="font-mono text-2xl font-bold tracking-widest text-[var(--app-text)]">
                {latestCreatedCode}
              </p>
            </div>
            <Button variant="outline" onClick={() => onCopyCode(latestCreatedCode)}>
              <Copy className="mr-2 h-4 w-4" />
              {copiedCode === latestCreatedCode ? "Copied" : "Copy Code"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <Card className="theme-card">
          <CardContent className="p-6 text-sm theme-muted">Loading classes...</CardContent>
        </Card>
      ) : classes.length === 0 ? (
        <Card className="theme-card">
          <WorkspaceEmptyState icon={BookOpen} title="Your classroom starts here" description="Create your first class, then invite students with its join code." />
        </Card>
      ) : (
        <div className="workspace-card-grid grid grid-cols-1 gap-5 lg:grid-cols-2">
          {classes.map((classroom) => (
            <motion.div key={classroom.id} whileHover={{ scale: 1.01 }}>
              <Card className="course-card theme-card overflow-hidden">
                <div className="course-card-cover">
                  <span className="design-eyebrow">CLASSROOM</span>
                  <BookOpen className="course-cover-icon" aria-hidden="true" />
                  <span className="course-cover-geometry" aria-hidden="true" />
                </div>
                <CardContent className="space-y-4 p-5">
                  <div>
                    <p className="text-lg font-bold text-[var(--app-text)]">{classroom.name}</p>
                    <p className="mt-1 text-sm theme-muted line-clamp-2">{classroom.description}</p>
                    <p className="mt-1 text-sm theme-muted">{classroom.departmentCode || "Department unassigned"} / {classroom.yearLevel ? `Year ${classroom.yearLevel}` : "Year level unassigned"}</p>
                    <p className="mt-1 text-sm theme-muted">{semesterLabel(classroom.semester ?? 1)}</p>
                  </div>

                  <div className="course-card-metrics grid grid-cols-2 gap-3">
                    <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] p-3">
                      <p className="text-xs theme-muted">Students</p>
                      <p className="text-lg font-bold text-[var(--app-text)]">{classroom.students}</p>
                    </div>
                    <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)] p-3">
                      <p className="text-xs theme-muted">Activities</p>
                      <p className="text-lg font-bold text-[var(--app-text)]">
                        {classroom.assignments}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_90%,transparent)] px-4 py-3">
                    <div>
                      <p className="text-xs font-medium theme-title">Join code</p>
                      <p className="font-mono font-bold tracking-widest text-[var(--app-text)]">
                        {classroom.code}
                      </p>
                    </div>
                    <Button variant="ghost" onClick={() => onCopyCode(classroom.code)}>
                      <Copy className="mr-1 h-4 w-4" />
                      {copiedCode === classroom.code ? "Copied" : "Copy"}
                    </Button>
                  </div>

                  <Button className="w-full" onClick={() => onManageClass(classroom)}>Manage Class</Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
