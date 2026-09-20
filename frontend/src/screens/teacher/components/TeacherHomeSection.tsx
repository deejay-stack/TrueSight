import { motion } from "framer-motion";
import { BarChart3, BookOpen, CalendarClock, ClipboardList, Plus, Users } from "lucide-react";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent } from "../../../components/ui/Card";
import type { TeacherAnalytics } from "../services/teacherClassroomService";
import type { TeacherSection } from "./TeacherSidebar";
import { TeacherIntegrityAnalyticsDashboard } from "./TeacherIntegrityAnalyticsDashboard";

type TeacherHomeSectionProps = {
  isLoading: boolean;
  isLoadingAnalytics: boolean;
  classCount: number;
  studentCount: number;
  activityCount: number;
  upcomingCount: number;
  analytics: TeacherAnalytics | null;
  onCreateClass: () => void;
  onOpenSection: (section: TeacherSection) => void;
  onOpenIntegrityAnalytics: () => void;
};

export function TeacherHomeSection({
  isLoading,
  isLoadingAnalytics,
  classCount,
  studentCount,
  activityCount,
  upcomingCount,
  analytics,
  onCreateClass,
  onOpenSection,
  onOpenIntegrityAnalytics,
}: TeacherHomeSectionProps) {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        className="workspace-hero"
      >
        <p className="design-eyebrow">YOUR TEACHING WORKSPACE</p>
        <h1>A clear view of your classroom.</h1>
        <p className="mt-4 max-w-3xl text-base theme-muted sm:text-lg">
          Manage your classes, students, activities, and upcoming deadlines from one
          dashboard.
        </p>

        <div className="mt-6 space-y-3">
          <Button onClick={onCreateClass} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            Create Class
          </Button>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => onOpenSection("classes")}
            >
              <BookOpen className="mr-2 h-4 w-4" />
              View Classes
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => onOpenSection("students")}
            >
              <Users className="mr-2 h-4 w-4" />
              View Students
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => onOpenSection("activities")}
            >
              <ClipboardList className="mr-2 h-4 w-4" />
              View Activities
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => onOpenSection("upcoming")}
            >
              <CalendarClock className="mr-2 h-4 w-4" />
              View Upcoming
            </Button>
          </div>
          <Button
            variant="outline"
            className="w-full justify-start sm:w-auto"
            onClick={onOpenIntegrityAnalytics}
          >
            <BarChart3 className="mr-2 h-4 w-4" />
            Open Integrity Analytics Page
          </Button>
        </div>
      </motion.div>

      <div className="workspace-stats grid gap-4 md:grid-cols-4">
        <motion.div whileHover={{ y: -4 }}>
          <Card className="theme-card">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide theme-muted">Classes</p>
              <p className="mt-2 text-3xl font-bold text-[var(--app-text)]">
                {isLoading ? "--" : classCount}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ y: -4 }}>
          <Card className="theme-card">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide theme-muted">Students</p>
              <p className="mt-2 text-3xl font-bold text-[var(--app-text)]">
                {isLoading ? "--" : studentCount}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ y: -4 }}>
          <Card className="theme-card">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide theme-muted">Activities</p>
              <p className="mt-2 text-3xl font-bold text-[var(--app-text)]">
                {isLoading ? "--" : activityCount}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div whileHover={{ y: -4 }}>
          <Card className="theme-card">
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide theme-muted">Upcoming</p>
              <p className="mt-2 text-3xl font-bold text-[var(--app-text)]">
                {isLoading ? "--" : upcomingCount}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <TeacherIntegrityAnalyticsDashboard
        analytics={analytics}
        isLoading={isLoading || isLoadingAnalytics}
      />
    </div>
  );
}
