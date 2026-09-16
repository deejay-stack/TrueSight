import { createContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AuthContextType, AuthUser, UserRole } from "./auth-types";
import { API_BASE_URL } from "../config/api";
import { RECONNECTED_EVENT } from "./NetworkStatusContext";
import {
  createOfflineActionError,
  isConnectionAvailable,
  isLikelyConnectivityError,
  markBackendReachable,
  markBackendUnreachable,
} from "../services/connectivity";

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_URL = `${API_BASE_URL}/auth`;
const DARK_MODE_KEY = "darkMode";
const LEGACY_THEME_KEY = "truesight-theme";

const normalizeUser = (input: Record<string, unknown> | null): AuthUser | null => {
  if (!input) return null;

  return {
    id: Number(input.id),
    name: String(input.name ?? ""),
    email: String(input.email ?? ""),
    role: (input.role === "teacher" ? "teacher" : "student") as UserRole,
    created_at: String(input.created_at ?? ""),
    profileImageUrl:
      typeof input.profile_image_url === "string"
        ? input.profile_image_url
        : typeof input.profileImageUrl === "string"
          ? input.profileImageUrl
          : null,
    notifications:
      typeof input.notifications === "boolean"
        ? input.notifications
        : typeof input.notifications_enabled === "boolean"
          ? input.notifications_enabled
          : true,
  };
};

const getInitialDarkMode = () => {
  const saved = localStorage.getItem(DARK_MODE_KEY);
  if (saved === "true") return true;
  if (saved === "false") return false;

  const legacy = localStorage.getItem(LEGACY_THEME_KEY);
  if (legacy === "dark") return true;
  if (legacy === "light") return false;

  // Dark is the default when no preference has been saved yet.
  return true;
};

type AuthProviderProps = {
  children: React.ReactNode;
};

const readJson = async (response: Response) =>
  (await response.json().catch(() => ({}))) as Record<string, unknown>;

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(getInitialDarkMode);
  const authGenerationRef = useRef(0);
  const sessionHydrationRef = useRef<Promise<void> | null>(null);

  useLayoutEffect(() => {
    localStorage.setItem(DARK_MODE_KEY, String(darkMode));
    localStorage.setItem(LEGACY_THEME_KEY, darkMode ? "dark" : "light");

    const root = document.documentElement;
    root.classList.toggle("dark", darkMode);
    root.style.colorScheme = darkMode ? "dark" : "light";
  }, [darkMode]);

  useEffect(() => {
    let active = true;
    let hydrationController: AbortController | null = null;

    const hydrateSession = async () => {
      hydrationController?.abort();
      const controller = new AbortController();
      hydrationController = controller;
      const generation = authGenerationRef.current;

      if (!isConnectionAvailable()) {
        if (active) {
          setSessionReady(true);
        }
        return;
      }

      try {
        const response = await fetch(`${API_URL}/me`, {
          method: "GET",
          credentials: "include",
          signal: controller.signal,
        });

        markBackendReachable();

        if (!response.ok) {
          if (
            response.status === 401 &&
            active &&
            generation === authGenerationRef.current
          ) {
            setUser(null);
          }
          return;
        }

        const payload = await readJson(response);
        const profile = normalizeUser((payload.user as Record<string, unknown>) ?? null);

        if (active && profile && generation === authGenerationRef.current) {
          setUser(profile);
        }
      } catch (error) {
        if (controller.signal.aborted) return;

        if (isLikelyConnectivityError(error)) {
          markBackendUnreachable();
        }
      } finally {
        if (active && hydrationController === controller) {
          setSessionReady(true);
        }
      }
    };

    const startSessionHydration = () => {
      const hydration = hydrateSession();
      sessionHydrationRef.current = hydration;

      void hydration.finally(() => {
        if (sessionHydrationRef.current === hydration) {
          sessionHydrationRef.current = null;
        }
      });
    };

    startSessionHydration();

    const handleReconnect = () => {
      startSessionHydration();
    };

    window.addEventListener(RECONNECTED_EVENT, handleReconnect);

    return () => {
      active = false;
      hydrationController?.abort();
      window.removeEventListener(RECONNECTED_EVENT, handleReconnect);
    };
  }, []);

  const toggleTheme = () => {
    setDarkMode((previous) => !previous);
  };

  const clearAuthState = () => {
    authGenerationRef.current += 1;
    setUser(null);
  };

  const signIn = async (
    email: string,
    password: string,
    role: UserRole,
  ): Promise<void> => {
    if (!isConnectionAvailable()) {
      throw createOfflineActionError();
    }

    await sessionHydrationRef.current;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password, role }),
      });

      markBackendReachable();
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(
          typeof payload.message === "string" ? payload.message : "Login failed.",
        );
      }

      authGenerationRef.current += 1;
      setUser(normalizeUser((payload.user as Record<string, unknown>) ?? null));
      setSessionReady(true);
    } catch (error) {
      clearAuthState();
      if (isLikelyConnectivityError(error)) {
        markBackendUnreachable();
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signInWithGoogle = async (
    credential: string,
    role: UserRole,
  ): Promise<void> => {
    if (!isConnectionAvailable()) {
      throw createOfflineActionError();
    }

    await sessionHydrationRef.current;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/google`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ credential, role }),
      });

      markBackendReachable();
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(
          typeof payload.message === "string"
            ? payload.message
            : "Google login failed.",
        );
      }

      const profile = normalizeUser((payload.user as Record<string, unknown>) ?? null);

      if (!profile) {
        throw new Error("Failed to parse Google account profile.");
      }

      authGenerationRef.current += 1;
      setUser(profile);
      setSessionReady(true);
    } catch (error) {
      clearAuthState();
      if (isLikelyConnectivityError(error)) {
        markBackendUnreachable();
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (
    name: string,
    email: string,
    password: string,
    role: UserRole,
  ): Promise<void> => {
    if (!isConnectionAvailable()) {
      throw createOfflineActionError();
    }

    await sessionHydrationRef.current;
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ name, email, password, role }),
      });

      markBackendReachable();
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(
          typeof payload.message === "string" ? payload.message : "Signup failed.",
        );
      }

      const profile = normalizeUser((payload.user as Record<string, unknown>) ?? null);

      if (!profile) {
        throw new Error("Failed to parse created account profile.");
      }

      // Signup creates the account only; it must not establish an authenticated
      // client session before the user completes the login flow.
      authGenerationRef.current += 1;
      setUser(null);
      setSessionReady(true);
    } catch (error) {
      clearAuthState();
      if (isLikelyConnectivityError(error)) {
        markBackendUnreachable();
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const getMyProfile = async (): Promise<AuthUser | null> => {
    if (!isConnectionAvailable()) {
      throw createOfflineActionError();
    }

    const response = await fetch(`${API_URL}/me`, {
      method: "GET",
      credentials: "include",
    });

    markBackendReachable();
    const payload = await readJson(response);

    if (!response.ok) {
      throw new Error(
        typeof payload.message === "string"
          ? payload.message
          : "Failed to fetch profile.",
      );
    }

    const profile = normalizeUser((payload.user as Record<string, unknown>) ?? null);
    authGenerationRef.current += 1;
    setUser(profile);
    setSessionReady(true);
    return profile;
  };

  const updateAccount = async (input: {
    name: string;
    email: string;
    notifications: boolean;
    profileImageUrl: string | null;
  }): Promise<AuthUser> => {
    if (!isConnectionAvailable()) {
      throw createOfflineActionError();
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/me`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      markBackendReachable();
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(
          typeof payload.message === "string"
            ? payload.message
            : "Failed to update account.",
        );
      }

      const updated = normalizeUser((payload.user as Record<string, unknown>) ?? null);

      if (!updated) {
        throw new Error("Failed to parse updated account profile.");
      }

      setUser(updated);
      return updated;
    } catch (error) {
      if (isLikelyConnectivityError(error)) {
        markBackendUnreachable();
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const deleteAccount = async (): Promise<void> => {
    if (!isConnectionAvailable()) {
      throw createOfflineActionError();
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/me`, {
        method: "DELETE",
        credentials: "include",
      });

      markBackendReachable();
      const payload = await readJson(response);

      if (!response.ok) {
        throw new Error(
          typeof payload.message === "string"
            ? payload.message
            : "Failed to delete account.",
        );
      }

      authGenerationRef.current += 1;
      setUser(null);
    } catch (error) {
      if (isLikelyConnectivityError(error)) {
        markBackendUnreachable();
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    if (!isConnectionAvailable()) {
      throw createOfflineActionError();
    }

    try {
      const response = await fetch(`${API_URL}/logout`, {
        method: "POST",
        credentials: "include",
      });
      markBackendReachable();

      if (!response.ok) {
        const payload = await readJson(response);
        throw new Error(
          typeof payload.message === "string" ? payload.message : "Logout failed.",
        );
      }

      authGenerationRef.current += 1;
      setUser(null);
    } catch (error) {
      if (isLikelyConnectivityError(error)) {
        markBackendUnreachable();
      }
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        sessionReady,
        darkMode,
        toggleTheme,
        signIn,
        signInWithGoogle,
        signUp,
        getMyProfile,
        updateAccount,
        deleteAccount,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
