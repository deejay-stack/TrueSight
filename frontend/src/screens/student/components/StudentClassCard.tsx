import { BookOpen } from "lucide-react";
import { semesterLabel } from '../../../utils/curriculum';
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar";
import { getDisplayInitials } from "../../../utils/profileImage";
import type { EnrolledClass } from "../services/studentClassroomService";

type StudentClassCardProps = {
  classroom: EnrolledClass;
  selected: boolean;
  onSelect: (classId: string) => void;
};

export function StudentClassCard({
  classroom,
  selected,
  onSelect,
}: StudentClassCardProps) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      onClick={() => onSelect(classroom.id)}
      className={[
        "student-course-card theme-ring w-full rounded-2xl border p-4 text-left transition-all",
        selected
          ? "border-[var(--app-accent)] bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)]"
          : "theme-border bg-[color-mix(in_srgb,var(--app-surface-strong)_95%,transparent)]",
      ].join(" ")}
    >
      <div className="student-course-mark" aria-hidden="true"><BookOpen /></div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-[var(--app-text)]">{classroom.name}</p>
          <p className="mt-1 text-xs theme-muted">Code: {classroom.code}</p>
          <p className="mt-1 text-xs theme-muted">{classroom.departmentCode || "Department unassigned"} / {classroom.yearLevel ? `Year ${classroom.yearLevel}` : "Year level unassigned"}</p>
          <p className="mt-1 text-xs theme-muted">{semesterLabel(classroom.semester ?? 1)}</p>
          <p className="mt-2 text-xs font-semibold text-[var(--app-accent)]">Officially enrolled</p>
        </div>
        <span className="inline-flex min-w-fit shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-[color-mix(in_srgb,var(--app-accent)_18%,transparent)] px-2.5 py-1 text-xs font-medium leading-none text-[var(--app-accent)]">
          {classroom.assignments} activities
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Avatar className="h-8 w-8 border theme-border">
          {classroom.teacherProfileImageUrl ? (
            <AvatarImage src={classroom.teacherProfileImageUrl} alt={classroom.teacherName} />
          ) : null}
          <AvatarFallback className="text-[10px] font-semibold text-[var(--app-text)]">
            {getDisplayInitials(classroom.teacherName)}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="text-xs font-medium text-[var(--app-text)]">{classroom.teacherName}</p>
          <p className="text-[11px] theme-muted">Instructor</p>
        </div>
      </div>
    </motion.button>
  );
}
