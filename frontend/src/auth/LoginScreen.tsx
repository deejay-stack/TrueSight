import { motion } from "framer-motion";
import { ArrowRight, BookOpen, ScanLine, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { IntegrityIllustration } from "../components/IntegrityIllustration";
import { GlobalThemeToggle } from "../components/theme/GlobalThemeToggle";
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
    <main className="landing-page role-theme-page relative min-h-screen overflow-hidden text-[var(--app-text)]" style={getRoleThemeStyle("student", darkMode)}>
      <div className="landing-frame">
        <nav className="landing-nav" aria-label="Main navigation">
          <AppLogo />
          <span className="design-eyebrow hidden md:block">Built for learning. Designed for trust.</span>
          <div className="flex shrink-0 items-center gap-2"><GlobalThemeToggle className="h-10 w-10" /><button type="button" onClick={goToAuth} aria-label="Get started" className="design-nav-button theme-ring"><span className="hidden min-[360px]:inline">Get started</span><ArrowRight className="h-4 w-4" /></button></div>
        </nav>
        <section className="landing-hero">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: "easeOut" }} className="landing-copy">
            <div className="design-eyebrow flex items-center gap-2"><span className="integrity-dot" />BUENAVISTA COMMUNITY COLLEGE</div>
            <h1>A clearer view.<br /><span className="design-gradient-text">A stronger learning<br className="hidden sm:block" /> community.</span></h1>
            <p className="landing-description">Your classes, submissions, and academic integrity insights. Together in one thoughtful workspace.</p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <button type="button" onClick={goToAuth} className="design-primary theme-ring">Explore TrueSight <ArrowRight className="h-4 w-4" /></button>
              <span className="text-sm theme-muted">For teachers &amp; students</span>
            </div>
            <p className="mt-8 flex items-center gap-2 text-xs theme-muted"><ShieldCheck className="h-4 w-4 shrink-0" />AI-assisted insight. Teacher-led decisions.</p>
          </motion.div>
          <IntegrityIllustration />
        </section>
        <section className="landing-features" aria-label="The TrueSight workspace">
          <article><span className="design-eyebrow">01 / CONNECT</span><BookOpen className="design-feature-icon" /><h2>Your classroom, connected.</h2><p>Keep classes, activities, and deadlines in view, so you can focus on the work that matters.</p></article>
          <article><span className="design-eyebrow">02 / UNDERSTAND</span><ScanLine className="design-feature-icon" /><h2>Go beyond a percentage.</h2><p>Explore AI-assisted text, code, and image analysis with explanations that support thoughtful review.</p></article>
          <article><span className="design-eyebrow">03 / GUIDE</span><ShieldCheck className="design-feature-icon" /><h2>Make room for context.</h2><p>Review submissions, share feedback, and support academic integrity with human judgment at the center.</p></article>
        </section>
        <footer className="landing-footer"><span>TrueSight <span className="theme-muted">/ Classroom Integrity</span></span><span className="theme-muted">An AI-assisted learning management system</span></footer>
      </div>
    </main>
  );
}
