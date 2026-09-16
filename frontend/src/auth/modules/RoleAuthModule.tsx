import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { GoogleLogin } from "@react-oauth/google";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Presentation,
  User,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { useGoogleAuthConfig } from "../../context/GoogleAuthProvider";
import { useNetworkStatus } from "../../context/NetworkStatusContext";
import type { UserRole } from "../../context/auth-types";
import { AppLogo } from "../../components/AppLogo";
import { getRoleThemeStyle, roleThemes } from "../../theme/roleThemes";

type AuthMode = "login" | "signup";

type FormErrors = {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
};

type RoleAuthModuleProps = {
  mode: AuthMode;
  role: UserRole;
};

type RoleConfig = {
  actionIcon: LucideIcon;
  headline: Record<AuthMode, string>;
  subcopy: Record<AuthMode, string>;
};

const roleConfig: Record<UserRole, RoleConfig> = {
  student: {
    actionIcon: KeyRound,
    headline: {
      login: "Student Login",
      signup: "Student Signup",
    },
    subcopy: {
      login: "Enter your student workspace for classes and submissions.",
      signup: "Create your student workspace and join your classes.",
    },
  },
  teacher: {
    actionIcon: KeyRound,
    headline: {
      login: "Teacher Login",
      signup: "Teacher Signup",
    },
    subcopy: {
      login: "Enter your teacher workspace for classes and AI analysis.",
      signup: "Create your teacher workspace and manage your classroom.",
    },
  },
};

const isValidEmail = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
};

const getLoginPath = (role: UserRole) => `/auth/${role}/login`;
const getSignupPath = (role: UserRole) => `/auth/${role}/signup`;

export default function RoleAuthModule({ mode, role }: RoleAuthModuleProps) {
  const navigate = useNavigate();
  const {
    signIn,
    signInWithGoogle,
    signUp,
    user,
    loading,
    sessionReady,
    darkMode,
  } = useAuth();
  const { online } = useNetworkStatus();
  const googleAuth = useGoogleAuthConfig();
  const config = roleConfig[role];
  const theme = roleThemes[role];
  const ActionIcon = config.actionIcon;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [touched, setTouched] = useState({
    fullName: false,
    email: false,
    password: false,
    confirmPassword: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  const googleClientConfigured = googleAuth.configured;
  const isBusy = isSubmitting || isGoogleSubmitting || loading || !sessionReady;
  const actionDisabled = isBusy || !online;
  const isSignup = mode === "signup";

  const moduleStyle = getRoleThemeStyle(role, darkMode);

  const validationErrors = useMemo<FormErrors>(() => {
    const next: FormErrors = {};

    if (isSignup) {
      if (!fullName.trim()) {
        next.fullName = "Full name is required.";
      } else if (fullName.trim().length < 2) {
        next.fullName = "Full name must be at least 2 characters.";
      }
    }

    if (!email.trim()) {
      next.email = "Email is required.";
    } else if (!isValidEmail(email.trim())) {
      next.email = "Please enter a valid email address.";
    }

    const missingPassword = isSignup ? !password : !password.trim();

    if (missingPassword) {
      next.password = "Password is required.";
    } else if (password.length < 8) {
      next.password = "Password must be at least 8 characters.";
    }

    if (isSignup) {
      if (!confirmPassword) {
        next.confirmPassword = "Please confirm your password.";
      } else if (password !== confirmPassword) {
        next.confirmPassword = "Passwords do not match.";
      }
    }

    return next;
  }, [confirmPassword, email, fullName, isSignup, password]);

  useEffect(() => {
    if (!user) return;

    if (user.role === "teacher") {
      navigate("/teacher/teacher_screen/home", { replace: true });
      return;
    }

    navigate("/student/student_screen", { replace: true });
  }, [user, navigate]);

  const clearGeneralError = () => {
    setErrors((current) => ({ ...current, general: undefined }));
  };

  const handleLogin = async () => {
    const nextErrors: FormErrors = {
      email: validationErrors.email,
      password: validationErrors.password,
    };
    Object.keys(nextErrors).forEach((key) => {
      if (!nextErrors[key as keyof FormErrors]) {
        delete nextErrors[key as keyof FormErrors];
      }
    });

    setTouched((current) => ({ ...current, email: true, password: true }));
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsSubmitting(true);
      await signIn(email.trim(), password, role);
      toast.success("Welcome back.");
    } catch (error) {
      setErrors({ general: getErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async () => {
    const nextErrors: FormErrors = { ...validationErrors };
    setTouched({
      fullName: true,
      email: true,
      password: true,
      confirmPassword: true,
    });
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsSubmitting(true);
      await signUp(fullName.trim(), email.trim(), password, role);
      navigate(getLoginPath(role), { replace: true });
      toast.success("Account created successfully. Please log in.", {
        duration: 3000,
      });
    } catch (error) {
      setErrors({ general: getErrorMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleCredential = async (credential?: string) => {
    if (!credential) {
      setErrors({ general: "Google did not return a credential. Please try again." });
      return;
    }

    try {
      setIsGoogleSubmitting(true);
      setErrors({});
      await signInWithGoogle(credential, role);
      toast.success("Signed in with Google.");
    } catch (error) {
      setErrors({ general: getErrorMessage(error) });
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const submitLabel = isSignup
    ? `Create ${theme.label} Account`
    : `${theme.label} Login`;
  const alternateModePath = isSignup ? getLoginPath(role) : getSignupPath(role);

  return (
    <div
      className="auth-module role-theme-page relative min-h-screen overflow-hidden text-[var(--app-text)]"
      style={moduleStyle}
    >
      <div className="auth-grid-effect pointer-events-none absolute inset-0" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl place-items-center px-5 py-8 sm:px-6">
        <motion.div
          className="theme-surface mx-auto w-full max-w-md rounded-3xl p-6 sm:p-7"
          initial={{ opacity: 0, y: 26, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.48, ease: "easeOut" }}
        >
          <div className="mb-6 text-center">
            <AppLogo className="mb-4 justify-center" iconClassName="h-14 w-14 rounded-2xl" />
            <h2 className="text-3xl font-extrabold text-[var(--auth-accent)]">
              {config.headline[mode]}
            </h2>
            <p className="mt-2 text-sm theme-muted">{config.subcopy[mode]}</p>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_82%,transparent)] p-1.5">
            <button
              type="button"
              onClick={() => navigate(isSignup ? getSignupPath("student") : getLoginPath("student"))}
              className={[
                "theme-ring flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold",
                role === "student"
                  ? "bg-[linear-gradient(135deg,var(--auth-accent),var(--auth-accent-2))] text-white shadow-[var(--app-shadow)]"
                  : "text-[var(--app-muted)] hover:text-[var(--app-text)]",
              ].join(" ")}
            >
              <GraduationCap className="h-4 w-4" />
              Student
            </button>
            <button
              type="button"
              onClick={() => navigate(isSignup ? getSignupPath("teacher") : getLoginPath("teacher"))}
              className={[
                "theme-ring flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold",
                role === "teacher"
                  ? "bg-[linear-gradient(135deg,var(--auth-accent),var(--auth-accent-2))] text-white shadow-[var(--app-shadow)]"
                  : "text-[var(--app-muted)] hover:text-[var(--app-text)]",
              ].join(" ")}
            >
              <Presentation className="h-4 w-4" />
              Teacher
            </button>
          </div>

          <div className="space-y-4">
            {isSignup && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
              >
                <label className="mb-1.5 block text-sm font-medium text-[var(--app-text)]">
                  Full Name
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(event) => {
                      setFullName(event.target.value);
                      clearGeneralError();
                    }}
                    onBlur={() => setTouched((current) => ({ ...current, fullName: true }))}
                    placeholder="Enter your full name"
                    className="theme-ring w-full rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_92%,transparent)] py-2.5 pl-10 pr-3 text-sm text-[var(--app-text)] placeholder:text-[var(--app-muted)]/80"
                  />
                </div>
                {touched.fullName && validationErrors.fullName && (
                  <p className="mt-1.5 text-xs text-rose-400">{validationErrors.fullName}</p>
                )}
              </motion.div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--app-text)]">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clearGeneralError();
                  }}
                  onBlur={() => setTouched((current) => ({ ...current, email: true }))}
                  placeholder="name@email.com"
                  className="theme-ring w-full rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_92%,transparent)] py-2.5 pl-10 pr-3 text-sm text-[var(--app-text)] placeholder:text-[var(--app-muted)]/80"
                />
              </div>
              {touched.email && validationErrors.email && (
                <p className="mt-1.5 text-xs text-rose-400">{validationErrors.email}</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--app-text)]">
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearGeneralError();
                  }}
                  onBlur={() => setTouched((current) => ({ ...current, password: true }))}
                  placeholder={isSignup ? "Create a password" : "Enter your password"}
                  className="theme-ring w-full rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_92%,transparent)] py-2.5 pl-10 pr-10 text-sm text-[var(--app-text)] placeholder:text-[var(--app-muted)]/80"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="theme-ring absolute right-3 top-1/2 rounded-md p-1 -translate-y-1/2 text-[var(--app-muted)] transition hover:text-[var(--auth-accent)]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {touched.password && validationErrors.password && (
                <p className="mt-1.5 text-xs text-rose-400">{validationErrors.password}</p>
              )}
            </div>

            {isSignup && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.05 }}
              >
                <label className="mb-1.5 block text-sm font-medium text-[var(--app-text)]">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]" />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(event) => {
                      setConfirmPassword(event.target.value);
                      clearGeneralError();
                    }}
                    onBlur={() =>
                      setTouched((current) => ({ ...current, confirmPassword: true }))
                    }
                    placeholder="Confirm your password"
                    className="theme-ring w-full rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_92%,transparent)] py-2.5 pl-10 pr-10 text-sm text-[var(--app-text)] placeholder:text-[var(--app-muted)]/80"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((current) => !current)}
                    className="theme-ring absolute right-3 top-1/2 rounded-md p-1 -translate-y-1/2 text-[var(--app-muted)] transition hover:text-[var(--auth-accent)]"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {touched.confirmPassword && validationErrors.confirmPassword && (
                  <p className="mt-1.5 text-xs text-rose-400">
                    {validationErrors.confirmPassword}
                  </p>
                )}
              </motion.div>
            )}

            {errors.general && (
              <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {errors.general}
              </div>
            )}

            {!online && (
              <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                Login and signup require an internet connection.
              </div>
            )}

            <button
              type="button"
              onClick={isSignup ? handleSignup : handleLogin}
              disabled={actionDisabled}
              className="theme-ring flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--auth-accent),var(--auth-accent-2))] px-4 py-2.5 text-sm font-semibold text-white transition-transform duration-200 hover:translate-y-[-1px] hover:shadow-[var(--app-shadow)] disabled:cursor-not-allowed disabled:opacity-65"
            >
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Please wait...
                </>
              ) : (
                <>
                  {isSignup ? <UserPlus className="h-4 w-4" /> : <ActionIcon className="h-4 w-4" />}
                  {submitLabel}
                </>
              )}
            </button>

            {!isSignup && (
              <>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-[color-mix(in_srgb,var(--app-border)_72%,transparent)]" />
                  <span className="text-xs font-medium uppercase tracking-wide theme-muted">
                    or
                  </span>
                  <div className="h-px flex-1 bg-[color-mix(in_srgb,var(--app-border)_72%,transparent)]" />
                </div>

                <div className="rounded-xl border theme-border bg-[color-mix(in_srgb,var(--app-surface)_88%,transparent)] p-3">
                  <p className="mb-3 text-xs theme-muted">
                    Google sign-in will use the {theme.label.toLowerCase()} module for new accounts.
                  </p>
                  {googleAuth.loading ? (
                    <div className="flex items-center gap-2 rounded-lg border theme-border px-3 py-2 text-xs theme-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--auth-accent)]" />
                      Checking Google sign-in...
                    </div>
                  ) : googleClientConfigured ? (
                    <div className={actionDisabled ? "pointer-events-none opacity-65 grayscale" : ""}>
                      <GoogleLogin
                        width="100%"
                        text="signin_with"
                        onSuccess={(response) => void handleGoogleCredential(response.credential)}
                        onError={() => {
                          setErrors({ general: "Google login failed. Please try again." });
                        }}
                      />
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      {googleAuth.message}
                    </div>
                  )}
                  {isGoogleSubmitting && (
                    <div className="mt-3 flex items-center gap-2 text-xs theme-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--auth-accent)]" />
                      Verifying Google account...
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="mt-5 text-center text-sm">
            <span className="theme-muted">
              {isSignup ? "Already have an account? " : "Don't have an account? "}
            </span>
            <button
              type="button"
              onClick={() => navigate(alternateModePath)}
              className="theme-ring inline-flex items-center gap-1 rounded-lg px-1 py-1 font-semibold text-[var(--auth-accent)] hover:bg-[color-mix(in_srgb,var(--auth-accent)_10%,transparent)]"
            >
              {isSignup ? "Login" : "Signup"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
