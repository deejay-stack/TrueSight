import {
  Bell,
  BookOpenCheck,
  BrainCircuit,
  ClipboardCheck,
  FileSearch,
  Image,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Card, CardContent } from "../../components/ui/Card";

const systemFeatures = [
  "Role-based access for Teachers and Students",
  "Class and activity management",
  "Student submission management",
  "AI-generated text detection",
  "AI-generated image detection",
  "Analysis result viewing for teachers",
  "Student-friendly submission status",
  "Notification system",
  "System sidebar indicator for system-related pages",
  "Secure login and password protection",
];

const workflowSteps = [
  {
    title: "Create",
    description: "Teachers create classes and activities for student work.",
  },
  {
    title: "Submit",
    description: "Students join classes and upload text, files, or images.",
  },
  {
    title: "Analyze",
    description: "TrueSight processes the content using AI detection support.",
  },
  {
    title: "Review",
    description: "Teachers review results while students see submission status.",
  },
];

const developers = [
  { name: "Developer 1", role: "Project Developer" },
  { name: "Developer 2", role: "Frontend Developer" },
  { name: "Developer 3", role: "Backend Developer" },
  { name: "Developer 4", role: "Documentation / Research Support" },
];

const featureIcons = [
  Users,
  ClipboardCheck,
  FileSearch,
  BrainCircuit,
  Image,
  BookOpenCheck,
  ShieldCheck,
  Bell,
  ClipboardCheck,
  LockKeyhole,
];

export default function AboutTrueSightPage() {
  return (
    <div className="space-y-6">
      <section className="theme-surface overflow-hidden rounded-3xl px-6 py-7 sm:px-8">
        <p className="text-sm font-semibold uppercase tracking-wide theme-title">
          TrueSight Capstone System
        </p>
        <h1 className="mt-2 text-3xl font-extrabold text-[var(--app-text)] sm:text-4xl">
          About TrueSight
        </h1>
        <p className="mt-2 text-base font-semibold text-[var(--app-text)]">
          Academic integrity support for responsible AI use
        </p>
        <p className="mt-4 max-w-4xl text-base leading-7 theme-muted">
          TrueSight is an AI-powered academic integrity detection system
          developed to support teachers in identifying possible AI-generated
          student work. The system analyzes text, files, and images submitted by
          students and provides detection results that help teachers review
          submissions more efficiently. TrueSight is designed not to replace
          teacher judgment, but to serve as a supporting tool for maintaining
          academic honesty and responsible AI use.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="theme-card">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--app-accent)_14%,transparent)] text-[var(--app-accent)]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-bold text-[var(--app-text)]">
                What TrueSight Is All About
              </h2>
            </div>
            <p className="text-sm leading-7 theme-muted">
              TrueSight helps teachers check text-based submissions, uploaded
              files, and images for indicators that may need closer review. It
              promotes fairness, originality, and responsible AI use in academic
              activities while keeping teachers in control of final decisions.
            </p>
          </CardContent>
        </Card>

        <Card className="theme-card">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--app-accent-2)_16%,transparent)] text-[var(--app-accent)]">
                <BrainCircuit className="h-5 w-5" />
              </div>
              <h2 className="text-xl font-bold text-[var(--app-text)]">
                Purpose of the System
              </h2>
            </div>
            <p className="text-sm leading-7 theme-muted">
              The main purpose of TrueSight is to provide a reliable support
              system for teachers when reviewing student submissions. By
              combining text detection and image classification, the system
              helps identify submissions that may require further checking. This
              allows teachers to make more informed decisions while still
              keeping the final evaluation under human judgment.
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--app-text)]">
            System Features
          </h2>
          <p className="mt-1 text-sm theme-muted">
            Core capabilities included in the TrueSight academic workflow.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {systemFeatures.map((feature, index) => {
            const Icon = featureIcons[index] ?? ShieldCheck;

            return (
              <Card key={feature} className="theme-card">
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--app-accent)_13%,transparent)] text-[var(--app-accent)]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium leading-6 text-[var(--app-text)]">
                    {feature}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Card className="theme-card">
        <CardContent className="space-y-5 p-6">
          <div>
            <h2 className="text-2xl font-bold text-[var(--app-text)]">
              How the System Works
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-7 theme-muted">
              TrueSight works by allowing teachers to create classes and
              activities where students can submit their academic work. Once a
              submission is uploaded, the system processes the content using AI
              detection tools and image classification support. Teachers can
              then review the results, while students are only shown the status
              of their submission to maintain fairness and confidentiality.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {workflowSteps.map((step, index) => (
              <div
                key={step.title}
                className="rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_88%,transparent)] p-4"
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--app-accent)] text-sm font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-3 font-semibold text-[var(--app-text)]">
                  {step.title}
                </h3>
                <p className="mt-1 text-sm leading-6 theme-muted">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <section className="rounded-3xl border border-[color-mix(in_srgb,var(--app-accent)_28%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-accent)_10%,var(--app-surface))] p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--app-accent)_18%,transparent)] text-[var(--app-accent)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[var(--app-text)]">
              Important Note / Disclaimer
            </h2>
            <p className="mt-2 text-sm leading-7 theme-muted">
              TrueSight provides AI-based detection support, but the results
              should not be treated as final proof of academic misconduct.
              Teachers are encouraged to use the results as a guide together
              with their own academic judgment, review process, and
              institutional policies.
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--app-text)]">
            Developers
          </h2>
          <p className="mt-1 text-sm theme-muted">
            Placeholder project roles that can be updated with your real group
            members later.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {developers.map((developer) => (
            <Card key={developer.name} className="theme-card">
              <CardContent className="p-5 text-center">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--app-accent)_16%,transparent)] text-lg font-bold text-[var(--app-accent)]">
                  {developer.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <h3 className="mt-4 font-bold text-[var(--app-text)]">
                  {developer.name}
                </h3>
                <p className="mt-1 text-sm theme-muted">{developer.role}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
