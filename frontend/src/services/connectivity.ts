import { API_BASE_URL } from "../config/api";

export type ConnectivityState = {
  browserOnline: boolean;
  backendReachable: boolean | null;
  checking: boolean;
  lastCheckedAt: string | null;
};

type ConnectivityListener = (state: ConnectivityState) => void;

const listeners = new Set<ConnectivityListener>();
const CONNECTION_ERROR_MESSAGE =
  "Internet access is required for this action. Previously loaded content may still be available.";

let state: ConnectivityState = {
  browserOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  backendReachable: null,
  checking: false,
  lastCheckedAt: null,
};

const emit = () => {
  const snapshot = getConnectivityState();
  listeners.forEach((listener) => listener(snapshot));
};

const updateState = (patch: Partial<ConnectivityState>) => {
  state = { ...state, ...patch };
  emit();
};

export const getConnectivityState = (): ConnectivityState => ({ ...state });

export const subscribeConnectivity = (listener: ConnectivityListener) => {
  listeners.add(listener);
  listener(getConnectivityState());

  return () => {
    listeners.delete(listener);
  };
};

export const isConnectionAvailable = () =>
  state.browserOnline && state.backendReachable !== false;

export const createOfflineActionError = () => new Error(CONNECTION_ERROR_MESSAGE);

export const markBackendReachable = () => {
  if (state.backendReachable !== true) {
    updateState({
      backendReachable: true,
      checking: false,
      lastCheckedAt: new Date().toISOString(),
    });
    return;
  }

  updateState({
    checking: false,
    lastCheckedAt: new Date().toISOString(),
  });
};

export const markBackendUnreachable = () => {
  updateState({
    backendReachable: false,
    checking: false,
    lastCheckedAt: new Date().toISOString(),
  });
};

export const setBrowserOnline = (browserOnline: boolean) => {
  updateState({
    browserOnline,
    backendReachable: browserOnline ? state.backendReachable : false,
    checking: browserOnline ? state.checking : false,
  });
};

export const probeBackend = async () => {
  if (!state.browserOnline) {
    markBackendUnreachable();
    return false;
  }

  updateState({ checking: true });

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("Backend health check failed.");
    }

    markBackendReachable();
    return true;
  } catch {
    markBackendUnreachable();
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
};

export const isLikelyConnectivityError = (error: unknown) => {
  if (error instanceof TypeError) return true;
  if (error instanceof DOMException && error.name === "AbortError") return true;

  return false;
};
