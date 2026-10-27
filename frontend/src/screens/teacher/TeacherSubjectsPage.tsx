import { Library } from 'lucide-react';
import { WorkspaceHeading } from '../../components/WorkspaceHeading';
import { CurriculumManager } from './components/CurriculumManager';

export function TeacherSubjectsPage() {
  return <div className="space-y-5">
    <WorkspaceHeading
      eyebrow="ACADEMICS / OFFICIAL CURRICULUM"
      title="Official Subjects"
      description="Subjects assigned to each department and year level are the reference for student enrollment eligibility."
      icon={Library}
    />
    <section className="theme-card space-y-3 rounded-xl border theme-border p-4 text-sm" aria-label="How to configure official subjects">
      <h2 className="font-semibold">Enter subjects by department and year level</h2>
      <ol className="list-decimal space-y-2 pl-5 theme-muted">
        <li>Select the department, year level, and First Semester or Second Semester.</li>
        <li>Designated curriculum staff choose <strong>Add subject</strong>, then enter the official subject code and name. Leave its assignment Active.</li>
        <li>Choose <strong>Save changes</strong>, then repeat for other years and semesters. Previously saved subjects are under First Semester. Use <strong>Assign existing subject</strong> when a subject is officially shared, including across semesters.</li>
        <li>The class teacher selects that subject in <strong>Classes → Manage class → Subject enrollment</strong> before opening enrollment.</li>
      </ol>
      <p className="theme-muted">Enrollment checks use the student's verified department and year level and the class's official subject assignment. Teachers review registered subjects on the COR during approval.</p>
    </section>
    <CurriculumManager />
  </div>;
}
