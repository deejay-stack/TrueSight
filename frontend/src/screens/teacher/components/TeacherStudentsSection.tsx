import { WorkspaceEmptyState } from "../../../components/WorkspaceEmptyState";
import { WorkspaceHeading } from "../../../components/WorkspaceHeading";
import { UsersRound } from "lucide-react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "../../../components/ui/avatar";
import { Card, CardContent } from "../../../components/ui/Card";
import { useState } from "react";
import { Input } from "../../../components/ui/Input";
import { getDisplayInitials } from "../../../utils/profileImage";
import type { TeacherOverviewStudent } from "../services/teacherClassroomService";

type TeacherStudentsSectionProps = {
  students: TeacherOverviewStudent[];
  isLoading: boolean;
};

export function TeacherStudentsSection({
  students,
  isLoading,
}: TeacherStudentsSectionProps) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const visibleStudents = students.filter((student) =>
    `${student.name} ${student.email}`.toLocaleLowerCase().includes(query),
  ).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.email.localeCompare(b.email));
  return (
    <div className="space-y-5">
      <WorkspaceHeading eyebrow="CLASSROOM / PEOPLE" title="All Students" description="Find the people in your classes, with enrollment and submission details at a glance." icon={UsersRound} />

      <div className="workspace-search-panel space-y-2">
        <label htmlFor="all-student-search" className="block text-sm theme-muted">Search students by name or email</label>
        <Input id="all-student-search" type="search" placeholder="Search students..." value={search} onChange={(event) => setSearch(event.target.value)} />
        {!isLoading && <p className="text-xs theme-muted">{visibleStudents.length} of {students.length} students · Name A–Z</p>}
      </div>

      {isLoading ? (
        <Card className="theme-card">
          <CardContent className="p-6 text-sm theme-muted">Loading students...</CardContent>
        </Card>
      ) : students.length === 0 ? (
        <Card className="theme-card">
          <WorkspaceEmptyState icon={UsersRound} title="A learning community in the making" description="Enrolled students will appear here when they join your classes." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visibleStudents.length === 0 && <p className="text-sm theme-muted">No students match your search.</p>}
          {visibleStudents.map((student) => (
            <motion.div key={`${student.email}-${student.name}`} whileHover={{ y: -2 }}>
              <Card className="theme-card">
                <CardContent className="student-roster-row flex flex-wrap items-center justify-between gap-3 p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="h-10 w-10 border theme-border">
                      {student.profileImageUrl ? (
                        <AvatarImage src={student.profileImageUrl} alt={student.name} />
                      ) : null}
                      <AvatarFallback className="text-xs font-semibold text-[var(--app-text)]">
                        {getDisplayInitials(student.name)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 break-words">
                      <p className="font-semibold text-[var(--app-text)]">{student.name}</p>
                      <p className="text-xs theme-muted">{student.email}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold text-[var(--app-text)]">
                      {student.classCount} classes
                    </p>
                    <p className="text-xs theme-muted">
                      {student.submissionCount} submissions
                    </p>
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
