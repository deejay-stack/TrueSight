import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppLogo } from "../components/AppLogo";
import { useAuth } from "../context/useAuth";
import { getRoleThemeStyle } from "../theme/roleThemes";

export default function LoginScreen() {
  const navigate = useNavigate();
  const { darkMode } = useAuth();

  const goToAuth = () => {
    navigate("/auth/student/login");
  };

  return (
    <main
      className="role-theme-page relative min-h-screen overflow-hidden text-[var(--app-text)]"
      style={getRoleThemeStyle("student", darkMode)}
    >
      <div className="auth-grid-effect pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--app-accent)_14%,transparent),transparent)]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-72 w-[min(720px,90vw)] -translate-x-1/2 rounded-full bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] blur-3xl" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-5 sm:px-6">
        <nav className="flex items-center justify-between">
          <AppLogo />
        </nav>

        <section className="grid flex-1 place-items-center py-14 sm:py-18">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
            className="mx-auto max-w-4xl text-center"
          >
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border theme-border bg-[color-mix(in_srgb,var(--app-surface)_88%,transparent)] px-4 py-2 text-sm font-semibold text-[var(--app-accent)] shadow-[var(--app-shadow)]">
              <ShieldCheck className="h-4 w-4" />
              Buenavista Community College
            </div>

            <h1 className="mt-7 text-4xl font-extrabold leading-tight text-[var(--app-text)] sm:text-5xl lg:text-6xl">
              TrueSight: AI-Assisted Learning Management System for Buenavista Community
              College
            </h1>

            <p className="mx-auto mt-6 max-w-3xl text-base leading-7 theme-muted sm:text-lg">
              An LMS designed to support teachers and
              students in managing academic submissions
              and promoting academic integrity through AI-assisted text and
              image analysis.
            </p>

            <div className="mt-9 flex justify-center">
              <button
                type="button"
                onClick={goToAuth}
                className="theme-ring inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--app-accent),var(--app-accent-2))] px-7 text-sm font-bold text-white shadow-[var(--app-shadow)] transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                Get Started
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <p className="mx-auto mt-6 max-w-xl text-sm leading-6 theme-muted">
              Built for classroom submissions, teacher review, and responsible
              AI-assisted academic integrity support.
            </p>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
